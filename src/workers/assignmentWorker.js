const { Worker } = require('bullmq');
const { PrismaClient } = require('@prisma/client');
const { createRedisConnection } = require('../config/redis');
const { JOB_TYPES } = require('../queues/assignmentQueue');
const { 
  getNextServiceDateTime, 
  calculateRequestTime,
  ASSIGNMENT_REQUEST_HOURS_BEFORE 
} = require('../utils/timeSlotUtils');

/**
 * BullMQ Worker for Processing Maid Assignment Jobs
 * 
 * This worker runs 24/7 and processes jobs from the assignment queue.
 * It can be deployed separately on Render as a background worker.
 * 
 * Job Types:
 * 1. CREATE_ASSIGNMENT_REQUEST - Create assignment request for a customer
 * 2. PROCESS_ALL_ASSIGNMENTS - Process all active customer assignments
 * 3. HANDLE_EXPIRED_REQUESTS - Handle expired assignment requests
 * 4. SEND_REMINDER - Send reminder notifications
 */

// Initialize Prisma
const prisma = new PrismaClient();

// Create Redis connection for worker
const connection = createRedisConnection();

// Job processor function
const processJob = async (job) => {
  console.log(`\n🔄 Processing job: ${job.name} (ID: ${job.id})`);
  console.log(`📦 Job data:`, JSON.stringify(job.data, null, 2));

  try {
    switch (job.name) {
      case JOB_TYPES.CREATE_ASSIGNMENT_REQUEST:
        return await createAssignmentRequest(job.data);
      
      case JOB_TYPES.PROCESS_ALL_ASSIGNMENTS:
        return await processAllAssignments(job.data);
      
      case JOB_TYPES.HANDLE_EXPIRED_REQUESTS:
        return await handleExpiredRequests(job.data);
      
      case JOB_TYPES.SEND_REMINDER:
        return await sendReminder(job.data);
      
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  } catch (error) {
    console.error(`❌ Job ${job.id} failed:`, error);
    throw error; // Re-throw to mark job as failed
  }
};

/**
 * Create assignment request for a single customer
 */
const createAssignmentRequest = async (data) => {
  const { customerId, maidId, timeSlot, customerName, maidName } = data;
  
  console.log(`📝 Creating assignment request for customer: ${customerName}`);

  // Check if customer is in buffer period
  const isInBuffer = await checkCustomerBufferStatus(customerId);
  if (isInBuffer) {
    console.log(`⏸️ Skipping ${customerName} - in buffer period`);
    return {
      success: false,
      customerId,
      customerName,
      reason: 'Customer in buffer period'
    };
  }

  // Calculate service date and time
  const serviceDateTime = getNextServiceDateTime(timeSlot);
  
  // Check if assignment request already exists for this service time
  const existingRequest = await prisma.assignmentRequest.findFirst({
    where: {
      maidId: maidId,
      status: 'pending',
      booking: {
        customerId: customerId,
        scheduledAt: {
          gte: new Date(serviceDateTime.getTime() - 3600000), // 1 hour before
          lte: new Date(serviceDateTime.getTime() + 3600000), // 1 hour after
        }
      }
    }
  });

  if (existingRequest) {
    console.log(`📋 Assignment request already exists for ${customerName}`);
    return {
      success: false,
      customerId,
      customerName,
      reason: 'Request already exists'
    };
  }

  // Get default service
  const defaultService = await prisma.service.findFirst({
    where: {
      isActive: true,
      isSubscriptionService: true
    }
  });

  if (!defaultService) {
    throw new Error('No default subscription service found');
  }

  // Get customer details
  const customer = await prisma.user.findUnique({
    where: { id: customerId },
    select: { address: true }
  });

  // Create the booking first
  const booking = await prisma.booking.create({
    data: {
      customerId: customerId,
      maidId: data.maidUserId, // Use the maid's user ID for the booking
      serviceId: defaultService.id,
      scheduledAt: serviceDateTime,
      timeSlot: timeSlot,
      status: 'PENDING',
      assignmentStatus: 'PENDING_ASSIGNMENT',
      totalAmount: defaultService.basePrice,
      finalAmount: defaultService.basePrice,
      serviceAddress: customer?.address || 'Customer Address',
      estimatedDuration: defaultService.baseDuration,
      notes: `Automatic booking for ${timeSlot} time slot`,
      isAutomatic: true
    }
  });

  // Create assignment request
  const assignmentRequest = await prisma.assignmentRequest.create({
    data: {
      bookingId: booking.id,
      maidId: maidId, // MaidProfile ID
      expiresAt: new Date(serviceDateTime.getTime() - (2 * 60 * 60 * 1000)), // Expires 2 hours before service
      status: 'pending'
    }
  });

  console.log(`✅ Created assignment request for ${customerName} (${timeSlot})`);
  console.log(`   Booking ID: ${booking.id}`);
  console.log(`   Assignment Request ID: ${assignmentRequest.id}`);
  console.log(`   Service Time: ${serviceDateTime.toISOString()}`);

  return {
    success: true,
    customerId,
    customerName,
    maidName,
    timeSlot,
    serviceDateTime: serviceDateTime.toISOString(),
    bookingId: booking.id,
    assignmentRequestId: assignmentRequest.id
  };
};

/**
 * Process all active customer assignments
 */
const processAllAssignments = async (data) => {
  console.log(`🔄 Processing all active customer assignments...`);
  
  // Get all active customer assignments
  const activeAssignments = await prisma.customerMaidAssignment.findMany({
    where: {
      isActive: true
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          timeSlot: true,
          address: true
        }
      },
      maid: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          }
        }
      }
    }
  });

  console.log(`👥 Found ${activeAssignments.length} active customer assignments`);

  const results = [];
  const errors = [];

  // Process each assignment
  for (const assignment of activeAssignments) {
    try {
      const timeSlot = assignment.customer.timeSlot || 'default';
      const serviceDateTime = getNextServiceDateTime(timeSlot);
      const requestTime = calculateRequestTime(serviceDateTime, timeSlot);
      const now = new Date();

      // Check if we should create request now (within the 20-hour window)
      const hoursUntilService = (serviceDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      const shouldCreateNow = hoursUntilService <= ASSIGNMENT_REQUEST_HOURS_BEFORE && hoursUntilService > 0;

      if (!shouldCreateNow) {
        console.log(`⏸️ Not time yet for ${assignment.customer.name} (${timeSlot})`);
        continue;
      }

      console.log(`✅ Creating request for ${assignment.customer.name} (${hoursUntilService.toFixed(2)}h until service)`);

      const result = await createAssignmentRequest({
        customerId: assignment.customerId,
        maidId: assignment.maidId,
        maidUserId: assignment.maid.user.id,
        timeSlot,
        customerName: assignment.customer.name,
        maidName: assignment.maid.user.name
      });

      if (result.success) {
        results.push(result);
      } else {
        errors.push(result);
      }
    } catch (error) {
      console.error(`❌ Error processing ${assignment.customer.name}:`, error);
      errors.push({
        customerId: assignment.customerId,
        customerName: assignment.customer.name,
        error: error.message
      });
    }
  }

  console.log(`✅ Completed processing all assignments`);
  console.log(`   Created: ${results.length}`);
  console.log(`   Errors: ${errors.length}`);

  return {
    success: true,
    created: results.length,
    errors: errors.length,
    results,
    errorDetails: errors
  };
};

/**
 * Handle expired assignment requests
 */
const handleExpiredRequests = async (data) => {
  console.log(`🔄 Checking for expired assignment requests...`);

  const now = new Date();

  // Find expired pending requests
  const expiredRequests = await prisma.assignmentRequest.findMany({
    where: {
      status: 'pending',
      expiresAt: {
        lt: now
      }
    },
    include: {
      booking: {
        include: {
          customer: true,
          service: true
        }
      },
      maid: {
        include: {
          user: true
        }
      }
    }
  });

  console.log(`⏰ Found ${expiredRequests.length} expired requests`);

  const results = [];

  for (const request of expiredRequests) {
    try {
      // Mark request as expired
      await prisma.assignmentRequest.update({
        where: { id: request.id },
        data: {
          status: 'expired',
          respondedAt: now
        }
      });

      // Update booking status to need reassignment
      await prisma.booking.update({
        where: { id: request.bookingId },
        data: {
          assignmentStatus: 'NEEDS_REASSIGNMENT',
          reassignmentCount: {
            increment: 1
          }
        }
      });

      console.log(`✅ Marked request ${request.id} as expired (Booking: ${request.bookingId})`);

      results.push({
        requestId: request.id,
        bookingId: request.bookingId,
        customerName: request.booking.customer.name,
        maidName: request.maid.user.name
      });
    } catch (error) {
      console.error(`❌ Error handling expired request ${request.id}:`, error);
    }
  }

  return {
    success: true,
    expired: results.length,
    results
  };
};

/**
 * Send reminder notifications
 */
const sendReminder = async (data) => {
  console.log(`🔔 Sending reminder notification...`);
  // Implementation for sending reminders (SMS, email, push notification)
  // This can be integrated with notification service
  return {
    success: true,
    message: 'Reminder sent'
  };
};

/**
 * Check if customer is in buffer period
 */
const checkCustomerBufferStatus = async (customerId) => {
  try {
    const activeBuffer = await prisma.bufferPeriod.findFirst({
      where: {
        subscription: {
          customer: {
            userId: customerId
          }
        },
        status: 'ACTIVE',
        endDate: {
          gte: new Date()
        }
      }
    });

    return !!activeBuffer;
  } catch (error) {
    console.error('Error checking buffer status:', error);
    return false;
  }
};

// Create the worker
const worker = new Worker('maid-assignment', processJob, {
  connection,
  concurrency: 5, // Process up to 5 jobs concurrently
  limiter: {
    max: 10, // Max 10 jobs
    duration: 1000, // per 1 second
  },
});

// Worker event listeners
worker.on('ready', () => {
  console.log('✅ Assignment Worker is ready and waiting for jobs');
});

worker.on('active', (job) => {
  console.log(`🔄 Worker processing job ${job.id}: ${job.name}`);
});

worker.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed successfully`);
  console.log(`   Result:`, JSON.stringify(result, null, 2));
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
  console.error(`   Attempts: ${job?.attemptsMade}/${job?.opts.attempts}`);
});

worker.on('error', (err) => {
  console.error('❌ Worker error:', err);
});

worker.on('stalled', (jobId) => {
  console.warn(`⚠️ Job ${jobId} stalled`);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down worker...');
  await worker.close();
  await prisma.$disconnect();
  console.log('✅ Worker shut down gracefully');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🚀 SWEEPRO ASSIGNMENT WORKER                                ║
║                                                                ║
║   Status: Running 24/7                                        ║
║   Queue: maid-assignment                                      ║
║   Concurrency: 5 jobs                                         ║
║   Rate Limit: 10 jobs/second                                  ║
║                                                                ║
║   This worker processes maid assignment scheduling jobs       ║
║   and runs continuously even when the main app is idle.      ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);

module.exports = worker;
