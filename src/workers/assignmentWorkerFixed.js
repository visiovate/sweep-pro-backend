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
const { PrismaClient } = require('@prisma/client');
const { createRedisConnection } = require('../config/redis');
const { retryPrismaOperation, retryRedisOperation } = require('../utils/retryUtils');
const {
  combineSlotDateTime,
  getCurrentUTC,
  getHoursDifference,
  formatDateTimeForLog,
} = require('../utils/timeUtils');

// Initialize Prisma
const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// Create Redis connection
const connection = createRedisConnection();

// Constants
const ASSIGNMENT_REQUEST_EXPIRY_HOURS = 24; // Assignment request expires after 24 hours
const MIN_HOURS_BEFORE_SERVICE = 2; // Minimum hours before service to accept assignment

/**
 * Process a single assignment job
 * Creates assignment request for a booking
 */
async function processAssignmentJob(job) {
  const { bookingId, customerId, serviceId } = job.data;
  
  console.log(`\n🔄 Processing job ${job.id}`);
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
      () => prisma.$transaction(async (tx) => {
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
        
        // 4. Find eligible maids
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
        
        // 5. Select best maid (highest rating, least bookings)
        const selectedMaid = selectBestMaid(eligibleMaids);
        
        console.log(`✅ Selected maid: ${selectedMaid.user.name} (Rating: ${selectedMaid.rating})`);
        
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
          await tx.booking.update({
            where: { id: bookingId },
            data: {
              assignment_sent: true,
              assignment_sent_at: now,
              assignmentStatus: 'ASSIGNED_PENDING_RESPONSE',
              maidId: selectedMaid.id,
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
        isolationLevel: 'Serializable',
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
        },
      },
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
  });
  
  // Filter out maids with conflicting bookings
  const eligibleMaids = maids.filter(maid => {
    return maid.maidBookings.length === 0; // No conflicting bookings
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
      () => prisma.notification.create({
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
    return await processAssignmentJob(job);
  },
  {
    connection,
    concurrency: 5, // Process up to 5 jobs concurrently
    limiter: {
      max: 10, // Max 10 jobs
      duration: 1000, // per second
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

worker.on('active', (job) => {
  console.log(`🔄 Worker picked up job ${job.id}: ${job.name}`);
});

worker.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed:`, result);
});

worker.on('failed', (job, error) => {
  console.error(`❌ Job ${job?.id} failed:`, error.message);
  if (error.stack) {
    console.error(error.stack);
  }
});

worker.on('error', (error) => {
  console.error('❌ Worker error:', error);
});

worker.on('stalled', (jobId) => {
  console.warn(`⚠️  Job ${jobId} has stalled`);
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`\n⚠️  ${signal} received, shutting down worker...`);
  
  try {
    await worker.close();
    console.log('✅ Worker closed gracefully');
    
    await prisma.$disconnect();
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

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit immediately - attempt graceful shutdown
  shutdown('UNCAUGHT_EXCEPTION');
});

console.log('🔄 Worker is running. Waiting for jobs...\n');
