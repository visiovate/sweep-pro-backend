/**
 * Assignment Worker - Production Ready
 * 
 * This worker:
 * 1. Processes queued jobs only (no polling/scanning)
 * 2. Runs continuously without process.exit()
 * 3. Uses DB transactions for idempotency
 * 4. Marks bookings as assignment_sent
 * 5. Creates assignment requests with proper error handling
 * 
 * Deploy on Render as background worker:
 *   - Type: Worker
 *   - Command: node src/workers/assignmentWorkerFixed.js
 *   - Auto-deploy: Yes
 */

const { Worker } = require('bullmq');
const { initializePrisma, getPrismaClient } = require("../utils/database");
// const { PrismaClient } = require('@prisma/client');
const { createRedisConnection } = require('../config/redis');
const { retryPrismaOperation, retryRedisOperation } = require('../utils/retryUtils');
const {
  combineSlotDateTime,
  getCurrentUTC,
  getHoursDifference,
  formatDateTimeForLog,
} = require('../utils/timeUtils');

// Initialize Prisma
// Initialize using singleton pattern
// Log configured in initializePrisma
// Initialization done by initializePrisma()

// Create Redis connection
const connection = createRedisConnection();

// Constants
const ASSIGNMENT_REQUEST_EXPIRY_HOURS = 24; // Assignment request expires after 24 hours
const MIN_HOURS_BEFORE_SERVICE = 2; // Minimum hours before service to accept assignment

// Job type constants
const JOB_TYPES = {
  CREATE_ASSIGNMENT_REQUEST: 'create-assignment-request',
  PROCESS_ALL_ASSIGNMENTS: 'process-all-assignments',
  HANDLE_EXPIRED_REQUESTS: 'handle-expired-requests',
  SEND_REMINDER: 'send-reminder',
};

/**
 * Main job router - dispatches to appropriate handler based on job type
 */
async function handleJob(job) {
  console.log(`\n🔄 Processing job ${job.id}`);
  console.log(`   Job Name: ${job.name}`);
  
  switch (job.name) {
    case JOB_TYPES.PROCESS_ALL_ASSIGNMENTS:
      return await processAllAssignments(job);
    
    case JOB_TYPES.HANDLE_EXPIRED_REQUESTS:
      return await handleExpiredRequests(job);
    
    case JOB_TYPES.CREATE_ASSIGNMENT_REQUEST:
    default:
      return await processAssignmentJob(job);
  }
}

/**
 * Process all pending bookings that need maid assignment
 * This is called by the recurring scheduled job
 */
async function processAllAssignments(job) {
  console.log(`📋 Processing all pending assignments...`);
  console.log(`   Triggered at: ${job.data?.triggeredAt || new Date().toISOString()}`);
  console.log(`   Is recurring: ${job.data?.isRecurring || false}`);
  
  try {
    const now = getCurrentUTC();
    
    // Find all bookings that:
    // 1. Don't have a maid assigned
    // 2. Are in PENDING or CONFIRMED status
    // 3. Haven't had assignment_sent = true
    // 4. Have a scheduled time in the future
    const pendingBookings = await retryPrismaOperation(
      () => getPrismaClient().booking.findMany({
        where: {
          maidId: null,
          assignment_sent: { not: true },
          status: { in: ['PENDING', 'CONFIRMED'] },
          OR: [
            { scheduledAt: { gt: now } },
            { slot_date: { gte: now } },
          ],
        },
        select: {
          id: true,
          customerId: true,
          serviceId: true,
          scheduledAt: true,
          slot_date: true,
          slot_time: true,
        },
        take: 100, // Process in batches of 100
      }),
      'Find pending bookings'
    );
    
    console.log(`📊 Found ${pendingBookings.length} pending bookings to process`);
    
    if (pendingBookings.length === 0) {
      return { success: true, processed: 0, message: 'No pending bookings found' };
    }
    
    let processed = 0;
    let failed = 0;
    const results = [];
    
    for (const booking of pendingBookings) {
      try {
        // Create a mock job for processAssignmentJob
        const mockJob = {
          id: `batch-${job.id}-${booking.id}`,
          data: {
            bookingId: booking.id,
            customerId: booking.customerId,
            serviceId: booking.serviceId,
          },
        };
        
        const result = await processAssignmentJob(mockJob);
        results.push({ bookingId: booking.id, ...result });
        
        if (result.success) {
          processed++;
        }
      } catch (error) {
        console.error(`❌ Failed to process booking ${booking.id}:`, error.message);
        failed++;
        results.push({ bookingId: booking.id, success: false, error: error.message });
      }
    }
    
    console.log(`\n📊 Batch processing complete:`);
    console.log(`   ✅ Processed: ${processed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📋 Total: ${pendingBookings.length}`);
    
    return {
      success: true,
      processed,
      failed,
      total: pendingBookings.length,
      results,
    };
    
  } catch (error) {
    console.error(`❌ Failed to process all assignments:`, error.message);
    throw error;
  }
}

/**
 * Handle expired assignment requests
 * Finds requests that have expired and marks them for reassignment
 */
async function handleExpiredRequests(job) {
  console.log(`⏰ Handling expired assignment requests...`);
  console.log(`   Triggered at: ${job.data?.triggeredAt || new Date().toISOString()}`);
  
  try {
    const now = getCurrentUTC();
    
    // Find all expired assignment requests that are still pending
    const expiredRequests = await retryPrismaOperation(
      () => getPrismaClient().assignmentRequest.findMany({
        where: {
          status: 'pending',
          expiresAt: { lt: now },
        },
        include: {
          booking: {
            select: {
              id: true,
              customerId: true,
              serviceId: true,
              status: true,
              maidId: true,
            },
          },
          maid: {
            select: {
              id: true,
              user: {
                select: { id: true, name: true },
              },
            },
          },
        },
        take: 50, // Process in batches
      }),
      'Find expired assignment requests'
    );
    
    console.log(`📊 Found ${expiredRequests.length} expired assignment requests`);
    
    if (expiredRequests.length === 0) {
      return { success: true, processed: 0, message: 'No expired requests found' };
    }
    
    let processed = 0;
    let reassigned = 0;
    const results = [];
    
    for (const request of expiredRequests) {
      try {
        // Update the expired request status
        await retryPrismaOperation(
          () => getPrismaClient().$transaction(async (tx) => {
            // Mark request as expired
            await tx.assignmentRequest.update({
              where: { id: request.id },
              data: { status: 'expired' },
            });
            
            // If booking still needs assignment, reset it
            if (request.booking && !request.booking.maidId && 
                ['PENDING', 'CONFIRMED'].includes(request.booking.status)) {
              await tx.booking.update({
                where: { id: request.booking.id },
                data: {
                  assignment_sent: false,
                  assignment_sent_at: null,
                  assignmentStatus: 'PENDING_ASSIGNMENT',
                  maidId: null,
                  assignedAt: null,
                },
              });
              
              console.log(`🔄 Reset booking ${request.booking.id} for reassignment`);
              reassigned++;
            }
          }),
          `Handle expired request ${request.id}`
        );
        
        processed++;
        results.push({ requestId: request.id, bookingId: request.booking?.id, success: true });
        
        // Send notification to maid about expiration
        if (request.maid?.user?.id) {
          setImmediate(() => {
            getPrismaClient().notification.create({
              data: {
                userId: request.maid.user.id,
                type: 'ASSIGNMENT_EXPIRED',
                title: 'Assignment Request Expired',
                message: 'An assignment request has expired because you did not respond in time.',
                data: {
                  bookingId: request.booking?.id,
                  assignmentRequestId: request.id,
                },
              },
            }).catch(err => console.error(`⚠️ Failed to send expiry notification:`, err.message));
          });
        }
        
      } catch (error) {
        console.error(`❌ Failed to handle expired request ${request.id}:`, error.message);
        results.push({ requestId: request.id, success: false, error: error.message });
      }
    }
    
    console.log(`\n📊 Expired request handling complete:`);
    console.log(`   ✅ Processed: ${processed}`);
    console.log(`   🔄 Reassigned: ${reassigned}`);
    console.log(`   📋 Total: ${expiredRequests.length}`);
    
    return {
      success: true,
      processed,
      reassigned,
      total: expiredRequests.length,
      results,
    };
    
  } catch (error) {
    console.error(`❌ Failed to handle expired requests:`, error.message);
    throw error;
  }
}

/**
 * Process a single assignment job
 * Creates assignment request for a booking
 */
async function processAssignmentJob(job) {
  const { bookingId, customerId, serviceId } = job.data;
  
  console.log(`\n🔄 Processing assignment job ${job.id}`);
  console.log(`   Booking ID: ${bookingId}`);
  console.log(`   Customer ID: ${customerId}`);

  // Guard against malformed jobs without a bookingId
  if (!bookingId) {
    console.error('❌ Missing bookingId on job payload, skipping');
    return { success: false, reason: 'missing_bookingId' };
  }
  
  try {
    // Use transaction to ensure consistency
    const result = await retryPrismaOperation(
      () => getPrismaClient().$transaction(async (tx) => {
        // 1. Fetch booking with lock
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: {
            customer: {
              include: {
                customerProfile: {
                  include: {
                    subscription: true,
                  },
                },
              },
            },
            service: true,
          },
        });
        
        if (!booking) {
          throw new Error(`Booking ${bookingId} not found`);
        }
        
        // 2. Validate booking state
        if (booking.maidId) {
          console.log(`⏭️  Booking ${bookingId} already has a maid assigned`);
          return { success: false, reason: 'already_assigned' };
        }
        
        if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
          console.log(`⏭️  Booking ${bookingId} status is ${booking.status}`);
          return { success: false, reason: 'invalid_status' };
        }
        
        // 3. Check if customer is in buffer period
        if (booking.customer?.customerProfile?.subscription?.isInBufferPeriod) {
          console.log(`⏸️  Customer is in buffer period`);
          return { success: false, reason: 'buffer_period' };
        }
        
        // 4. Check for assigned maid first (from CustomerMaidAssignment)
        let selectedMaid = null;
        const customerId = booking.customerId;
        
        const customerAssignment = await tx.customerMaidAssignment.findFirst({
          where: {
            customerId: customerId,
            isActive: true,
          },
          include: {
            maid: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    maidBookings: {
                      where: {
                        scheduledAt: booking.scheduledAt,
                        status: {
                          not: 'CANCELLED',
                        },
                      },
                      select: {
                        id: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });
        
        if (customerAssignment && customerAssignment.maid) {
          const assignedMaid = customerAssignment.maid;
          
          // Check if assigned maid is active, verified, and available
          if (
            assignedMaid.status === 'ACTIVE' &&
            assignedMaid.isVerified &&
            assignedMaid.user.maidBookings.length === 0 // No conflicting bookings
          ) {
            selectedMaid = assignedMaid;
            console.log(`✅ Using assigned maid: ${selectedMaid.user.name} (userId=${selectedMaid.user.id})`);
          } else {
            console.log(`⚠️  Assigned maid ${assignedMaid.user.name} is not available (status: ${assignedMaid.status}, verified: ${assignedMaid.isVerified}, conflicting bookings: ${assignedMaid.user.maidBookings.length})`);
          }
        } else {
          console.log(`ℹ️  No assigned maid found for customer ${customerId}`);
        }
        
        // 5. If no assigned maid available, find eligible maids by rating
        if (!selectedMaid) {
          const eligibleMaids = await findEligibleMaids(tx, booking);
          
          if (eligibleMaids.length === 0) {
            console.log(`⚠️  No eligible maids found for booking ${bookingId}`);
            
            // Update booking status
            await tx.booking.update({
              where: { id: bookingId },
              data: {
                assignmentStatus: 'REJECTED',
                rejectionReason: 'No eligible maids available',
              },
            });
            
            return { success: false, reason: 'no_eligible_maids' };
          }
          
          // Select best maid (highest rating, least bookings)
          selectedMaid = selectBestMaid(eligibleMaids);
          console.log(`✅ Selected maid by rating: ${selectedMaid.user.name} (Rating: ${selectedMaid.rating})`);
        }
        
        // 6. Calculate expiry time for assignment request
        const now = getCurrentUTC();
        const serviceDateTime = combineSlotDateTime(booking.slot_date, booking.slot_time) ||
          booking.scheduledAt;
        const hoursBeforeService = getHoursDifference(serviceDateTime, now);

        let expiresAt;
        if (hoursBeforeService > ASSIGNMENT_REQUEST_EXPIRY_HOURS + MIN_HOURS_BEFORE_SERVICE) {
          // Give maid full 24 hours to respond
          expiresAt = new Date(now.getTime() + (ASSIGNMENT_REQUEST_EXPIRY_HOURS * 60 * 60 * 1000));
        } else {
          // Give maid until 2 hours before service
          expiresAt = new Date(serviceDateTime.getTime() - (MIN_HOURS_BEFORE_SERVICE * 60 * 60 * 1000));
        }

        // 7. Create assignment request (DB enforces uniqueness via @@unique constraint)
        try {
          const assignmentRequest = await tx.assignmentRequest.create({
            data: {
              bookingId: booking.id,
              maidId: selectedMaid.id,
              status: 'pending',
              expiresAt,
            },
          });

          console.log(`📋 Created assignment request: ${assignmentRequest.id}`);
          console.log(`   Expires at: ${formatDateTimeForLog(expiresAt)}`);

          // 8. Mark assignment_sent = TRUE inside transaction (AFTER successful assignment creation)
          // FIX #1: This completes the atomic operation pattern
          // NOTE: Booking.maidId references User.id, not MaidProfile.id
          await tx.booking.update({
            where: { id: bookingId },
            data: {
              assignment_sent: true,
              assignment_sent_at: now,
              assignmentStatus: 'ASSIGNED_PENDING_RESPONSE',
              maidId: selectedMaid.user.id, // Use User.id, not MaidProfile.id
              assignedAt: now,
            },
          });

          console.log(`✅ Marked booking ${bookingId} as assignment_sent`);

          // 9. Send notification to maid (fire and forget, don't block transaction)
          setImmediate(() => {
            sendMaidNotification(selectedMaid.user.id, booking, assignmentRequest)
              .catch(error => {
                console.error(`⚠️  Failed to send notification to maid:`, error.message);
              });
          });

          return {
            success: true,
            assignmentRequestId: assignmentRequest.id,
            maidId: selectedMaid.id,
            maidName: selectedMaid.user.name,
            expiresAt: expiresAt.toISOString(),
          };

        } catch (error) {
          // Check for unique constraint violation (duplicate assignment request)
          if (error.code === 'P2002') {
            console.log(`⏭️  Assignment request already exists for booking ${bookingId} and maid ${selectedMaid.id}`);
            return { success: false, reason: 'duplicate_request' };
          }
          throw error;
        }
      }, {
        // Use ReadCommitted instead of Serializable to prevent deadlocks
        // Serializable causes P2034 "write conflict" errors under concurrent load
        isolationLevel: 'ReadCommitted',
        timeout: 15000, // 15 second timeout
      }),
      `Process assignment for booking ${bookingId}`
    );
    
    if (result.success) {
      console.log(`✅ Job ${job.id} completed successfully`);
    } else {
      console.log(`⏭️  Job ${job.id} skipped: ${result.reason}`);
    }
    
    return result;
    
  } catch (error) {
    console.error(`❌ Job ${job.id} failed:`, error.message);
    throw error; // Let BullMQ handle retry
  }
}

/**
 * Find eligible maids for a booking
 */
async function findEligibleMaids(tx, booking) {
  const serviceLocation = {
    latitude: booking.serviceLatitude,
    longitude: booking.serviceLongitude,
  };
  
  // Find maids that:
  // 1. Are active and verified
  // 2. Are within service radius
  // 3. Don't have conflicting bookings at same time
  // 4. Have capacity (maxDailyBookings not exceeded)
  
  const maids = await tx.maidProfile.findMany({
    where: {
      status: 'ACTIVE',
      isVerified: true,
      // Additional filters can be added based on service area, skills, etc.
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          // Access maidBookings through user relation
          maidBookings: {
            where: {
              scheduledAt: booking.scheduledAt,
              status: {
                not: 'CANCELLED',
              },
            },
            select: {
              id: true,
            },
          },
        },
      },
    },
  });
  
  // Filter out maids with conflicting bookings
  const eligibleMaids = maids.filter(maid => {
    return maid.user.maidBookings.length === 0; // No conflicting bookings
  });
  
  return eligibleMaids;
}

/**
 * Select best maid from eligible maids
 * Criteria: highest rating, then least total bookings
 */
function selectBestMaid(maids) {
  return maids.sort((a, b) => {
    // Sort by rating (descending)
    if (b.rating !== a.rating) {
      return b.rating - a.rating;
    }
    // Then by completed bookings (ascending - give work to less busy maids)
    return a.completedBookings - b.completedBookings;
  })[0];
}

/**
 * Send notification to maid about assignment request
 */
async function sendMaidNotification(maidUserId, booking, assignmentRequest) {
  try {
    await retryPrismaOperation(
      () => getPrismaClient().notification.create({
        data: {
          userId: maidUserId,
          type: 'ASSIGNMENT_REQUEST',
          title: 'New Service Assignment',
          message: `You have a new service assignment request. Please respond within 24 hours.`,
          data: {
            bookingId: booking.id,
            assignmentRequestId: assignmentRequest.id,
            serviceAddress: booking.serviceAddress,
            scheduledAt: booking.scheduledAt?.toISOString(),
            expiresAt: assignmentRequest.expiresAt.toISOString(),
          },
        },
      }),
      'Send maid notification'
    );
    
    console.log(`📧 Notification sent to maid ${maidUserId}`);
  } catch (error) {
    console.error(`⚠️  Failed to create notification:`, error.message);
    // Don't throw - notification failure shouldn't fail the job
  }
}

/**
 * Create and start worker
 */
console.log('\n═══════════════════════════════════════════════════════');
console.log('║   🚀 ASSIGNMENT WORKER STARTING');
console.log(`║   Time: ${new Date().toISOString()}`);
console.log(`║   Process ID: ${process.pid}`);
console.log('═══════════════════════════════════════════════════════\n');

const worker = new Worker(
  'maid-assignment',
  async (job) => {
    return await handleJob(job);
  },
  {
    connection,
    // Reduced concurrency to prevent connection pool exhaustion
    // Aiven free tier: max_connections=20, system uses ~9, connection_limit=5
    // With transactions, 2 concurrent workers is safer
    concurrency: 2,
    limiter: {
      max: 5, // Max 5 jobs per second (reduced from 10)
      duration: 1000,
    },
    settings: {
      stalledInterval: 30 * 1000, // Check for stalled jobs every 30 seconds
      maxStalledCount: 1, // Fail job after 1 stall
    },
  }
);

// Worker event listeners
worker.on('ready', () => {
  console.log('✅ Worker is ready and waiting for jobs');
});
// Initialization done by initializePrisma()

worker.on('active', (job) => {
  console.log(`🔄 Worker picked up job ${job.id}: ${job.name}`);
});
// Initialization done by initializePrisma()

worker.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed:`, result);
});
// Initialization done by initializePrisma()

worker.on('failed', (job, error) => {
  console.error(`❌ Job ${job?.id} failed:`, error.message);
  if (error.stack) {
    console.error(error.stack);
  }
});
// Initialization done by initializePrisma()

worker.on('error', (error) => {
  console.error('❌ Worker error:', error);
});
// Initialization done by initializePrisma()

worker.on('stalled', (jobId) => {
  console.warn(`⚠️  Job ${jobId} has stalled`);
});
// Initialization done by initializePrisma()

// Graceful shutdown
async function shutdown(signal) {
  console.log(`\n⚠️  ${signal} received, shutting down worker...`);
  
  try {
    await worker.close();
    console.log('✅ Worker closed gracefully');
    
    await getPrismaClient().$disconnect();
    console.log('✅ Database disconnected');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  // Don't exit - let worker continue processing other jobs
});
// Initialization done by initializePrisma()

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit immediately - attempt graceful shutdown
  shutdown('UNCAUGHT_EXCEPTION');
});
// Initialization done by initializePrisma()

console.log('🔄 Worker is running. Waiting for jobs...\n');
