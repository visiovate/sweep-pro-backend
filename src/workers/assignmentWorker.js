const { Worker } = require('bullmq');
const { PrismaClient } = require('@prisma/client');
const { createRedisConnection } = require('../config/redis');
const { JOB_TYPES } = require('../queues/assignmentQueue');
const { queueRejectedAssignment } = require('../queues/adminReassignQueue');
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

const formatJobMeta = (job, data = {}) => {
  return `job=${job?.id ?? 'n/a'} name=${job?.name ?? 'n/a'} customerId=${data.customerId ?? 'n/a'} maidId=${data.maidId ?? 'n/a'} maidUserId=${data.maidUserId ?? 'n/a'}`;
};

const buildSkipResult = (data, code, message) => ({
  success: false,
  customerId: data.customerId,
  customerName: data.customerName,
  maidId: data.maidId,
  maidUserId: data.maidUserId,
  reason: code,
  retryable: false,
  message: message || code
});

const computeAssignmentRequestExpiry = (serviceDateTime, now = new Date()) => {
  const latestUsefulExpiry = new Date(serviceDateTime.getTime() - (2 * 60 * 60 * 1000));
  const defaultExpiry = new Date(now.getTime() + (24 * 60 * 60 * 1000));

  // Prefer a bounded expiry window from "now", but don't exceed close-to-service cutoff.
  let expiresAt = defaultExpiry;
  if (expiresAt > latestUsefulExpiry) {
    expiresAt = latestUsefulExpiry;
  }

  // If the cutoff is already in the past (worker ran late), still give the maid a short window.
  if (expiresAt <= now) {
    expiresAt = new Date(now.getTime() + (30 * 60 * 1000));
  }

  return expiresAt;
};

const validationFailure = (job, data, code, message) => {
  console.warn(`[JOB SKIPPED] ${formatJobMeta(job, data)} | ${code} | non-retryable${message ? ` | ${message}` : ''}`);
  return { ok: false, result: buildSkipResult(data, code, message) };
};

const handleNonRetryablePrismaError = (error, job, data, stage) => {
  if (error?.code === 'P2003') {
    console.warn(`[JOB SKIPPED] ${formatJobMeta(job, data)} | FK_CONSTRAINT | non-retryable | stage=${stage} | ${error.message}`);
    return buildSkipResult(data, 'FOREIGN_KEY_CONSTRAINT', error.message);
  }
  return null;
};

const validateJobEntities = async (data, job) => {
  const { customerId, maidId, maidUserId } = data;

  if (!customerId) {
    return validationFailure(job, data, 'CUSTOMER_ID_MISSING', 'Job payload missing customerId');
  }

  const customer = await prisma.user.findUnique({
    where: { id: customerId },
    select: { id: true, address: true, name: true }
  });

  if (!customer) {
    return validationFailure(job, data, 'CUSTOMER_NOT_FOUND', 'Customer does not exist');
  }

  if (!maidId) {
    return validationFailure(job, data, 'MAID_ID_MISSING', 'Job payload missing maidId');
  }

  const maidProfile = await prisma.maidProfile.findUnique({
    where: { id: maidId },
    include: {
      user: true
    }
  });

  if (!maidProfile) {
    return validationFailure(job, data, 'MAID_PROFILE_NOT_FOUND', 'Maid profile does not exist');
  }

  if (!maidProfile.user) {
    return validationFailure(job, data, 'MAID_USER_NOT_FOUND', 'Maid profile missing linked user');
  }

  if (maidUserId) {
    const maidUser = await prisma.user.findUnique({
      where: { id: maidUserId },
      select: { id: true }
    });

    if (!maidUser) {
      return validationFailure(job, data, 'MAID_USER_NOT_FOUND', 'Maid user does not exist');
    }
  }

  return {
    ok: true,
    customer,
    maidProfile,
    maidUserId: maidUserId || maidProfile.user.id
  };
};

// Job processor function
const processJob = async (job) => {
  console.log(`\n🔄 Processing job: ${job.name} (ID: ${job.id})`);
  console.log(`📦 Job data:`, JSON.stringify(job.data, null, 2));

  try {
    switch (job.name) {
      case JOB_TYPES.CREATE_ASSIGNMENT_REQUEST:
        return await createAssignmentRequest(job.data, job);
      
      case JOB_TYPES.PROCESS_ALL_ASSIGNMENTS:
        return await processAllAssignments(job);
      
      case JOB_TYPES.HANDLE_EXPIRED_REQUESTS:
        return await handleExpiredRequests(job);
      
      case JOB_TYPES.SEND_REMINDER:
        return await sendReminder(job);
      
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  } catch (error) {
    const retryable = error?.retryable !== false && !error?.nonRetryable;
    console.error(`❌ ${formatJobMeta(job, job.data)} | ${retryable ? 'system failure (retryable)' : 'non-retryable failure'} | ${error.message}`);
    if (!retryable) {
      return buildSkipResult(job.data || {}, 'NON_RETRYABLE_ERROR', error.message);
    }
    throw error; // Re-throw to mark job as failed
  }
};

/**
 * Create assignment request for a single customer
 */
const createAssignmentRequest = async (data, jobContext = {}) => {
  const { customerId, maidId, timeSlot } = data;

  if (!timeSlot) {
    return validationFailure(jobContext, data, 'TIME_SLOT_MISSING', 'Job payload missing timeSlot');
  }

  const validation = await validateJobEntities(data, jobContext);
  if (!validation.ok) {
    return validation.result;
  }

  const { customer, maidProfile, maidUserId } = validation;
  const customerName = data.customerName || customer.name || 'Customer';
  const maidName = data.maidName || maidProfile.user?.name || 'Maid';
  data.maidUserId = maidUserId;

  console.log(`📝 Creating assignment request for customer: ${customerName}`);

  // Check if customer is in buffer period
  const isInBuffer = await checkCustomerBufferStatus(customerId);
  if (isInBuffer) {
    console.log(`⏸️ Skipping ${customerName} - in buffer period`);
    return {
      success: false,
      customerId,
      customerName,
      reason: 'Customer in buffer period',
      retryable: false
    };
  }

  // Calculate service date and time
  const serviceDateTime = getNextServiceDateTime(timeSlot);
  const expiresAt = computeAssignmentRequestExpiry(serviceDateTime);
  
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
      reason: 'Request already exists',
      retryable: false
    };
  }

  // Get default service (prefer subscription service, fallback to any active service)
  let defaultService = await prisma.service.findFirst({
    where: {
      isActive: true,
      isSubscriptionService: true
    }
  });

  if (!defaultService) {
    defaultService = await prisma.service.findFirst({
      where: { isActive: true }
    });
  }

  if (!defaultService) {
    throw new Error('No active service found');
  }

  const isMaidAvailable = !(
    maidProfile?.availability && maidProfile.availability.isAvailable === false
  );

  if (!isMaidAvailable) {
    let booking;
    try {
      booking = await prisma.booking.create({
        data: {
          customerId: customerId,
          maidId: null,
          serviceId: defaultService.id,
          scheduledAt: serviceDateTime,
          timeSlot: timeSlot,
          status: 'CANCELLED',
          assignmentStatus: 'REJECTED',
          rejectionReason: 'Maid unavailable',
          totalAmount: defaultService.basePrice,
          finalAmount: defaultService.basePrice,
          serviceAddress: customer?.address || 'Customer Address',
          estimatedDuration: defaultService.baseDuration,
          specialInstructions: `Automatic booking for ${timeSlot} time slot`
        }
      });
    } catch (error) {
      const handled = handleNonRetryablePrismaError(error, jobContext, data, 'booking.create.unavailable');
      if (handled) return handled;
      throw error;
    }

    try {
      await queueRejectedAssignment({
        bookingId: booking.id,
        maidId: maidId,
        rejectionReason: 'Maid unavailable',
        customerId
      });
    } catch (e) {}
    return {
      success: true,
      customerId,
      customerName,
      maidName,
      timeSlot,
      serviceDateTime: serviceDateTime.toISOString(),
      bookingId: booking.id,
      queuedForReassignment: true
    };
  }

  let booking;
  try {
    booking = await prisma.booking.create({
      data: {
        customerId: customerId,
        maidId: maidUserId,
        serviceId: defaultService.id,
        scheduledAt: serviceDateTime,
        timeSlot: timeSlot,
        status: 'PENDING',
        assignmentStatus: 'PENDING_ASSIGNMENT',
        totalAmount: defaultService.basePrice,
        finalAmount: defaultService.basePrice,
        serviceAddress: customer?.address || 'Customer Address',
        estimatedDuration: defaultService.baseDuration,
        specialInstructions: `Automatic booking for ${timeSlot} time slot`
      }
    });
  } catch (error) {
    const handled = handleNonRetryablePrismaError(error, jobContext, data, 'booking.create');
    if (handled) return handled;
    throw error;
  }

  let assignmentRequest;
  try {
    assignmentRequest = await prisma.assignmentRequest.create({
      data: {
        bookingId: booking.id,
        maidId: maidId,
        expiresAt,
        status: 'pending'
      }
    });
  } catch (error) {
    const handled = handleNonRetryablePrismaError(error, jobContext, data, 'assignmentRequest.create');
    if (handled) return handled;
    throw error;
  }

  console.log(`✅ Created assignment request for ${customerName} (${timeSlot})`);
  console.log(`   Booking ID: ${booking.id}`);
  console.log(`   Assignment Request ID: ${assignmentRequest.id}`);
  console.log(`   Service Time: ${serviceDateTime.toISOString()}`);

  // Send notification to maid
  try {
    await prisma.notification.create({
      data: {
        userId: maidUserId,
        type: 'SERVICE_ASSIGNED',
        title: 'New Booking Request',
        message: `You have a new booking request from ${customerName} for ${timeSlot} time slot.`,
        data: {
          bookingId: booking.id,
          assignmentRequestId: assignmentRequest.id,
          customerName: customerName,
          timeSlot: timeSlot,
          scheduledAt: serviceDateTime.toISOString(),
          expiresAt: assignmentRequest.expiresAt.toISOString()
        }
      }
    });
    console.log(`📧 Notification sent to maid: ${maidName}`);
  } catch (notifError) {
    console.error(`⚠️  Failed to send notification to maid:`, notifError.message);
  }

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
const processAllAssignments = async (job) => {
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
      }, {
        id: `${job?.id || 'process-all'}:${assignment.customerId}`,
        name: JOB_TYPES.CREATE_ASSIGNMENT_REQUEST
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
const handleExpiredRequests = async (job) => {
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
          status: 'CANCELLED',
          maidId: null,
          assignmentStatus: 'REJECTED',
          rejectionReason: 'Assignment request expired',
          maidResponseAt: now,
          reassignmentCount: {
            increment: 1
          }
        }
      });

      try {
        await queueRejectedAssignment({
          bookingId: request.bookingId,
          maidId: request.maidId,
          rejectionReason: 'Assignment request expired',
          customerId: request.booking.customerId
        });
      } catch (e) {}

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
const sendReminder = async (job) => {
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
    const subscription = await prisma.subscription.findFirst({
      where: {
        status: 'ACTIVE',
        customer: {
          userId: customerId
        }
      },
      include: {
        plan: {
          select: {
            hasBufferSystem: true
          }
        }
      }
    });

    if (!subscription || !subscription.plan?.hasBufferSystem) {
      return false;
    }

    if (subscription.isInBufferPeriod && subscription.bufferStartDate && subscription.bufferEndDate) {
      const now = new Date();
      if (now >= subscription.bufferStartDate && now <= subscription.bufferEndDate) {
        return true;
      }
    }

    const now = new Date();
    const activeBuffer = await prisma.bufferPeriod.findFirst({
      where: {
        subscription: {
          customer: {
            userId: customerId
          }
        },
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
        OR: [
          { isAutomatic: true },
          {
            notes: {
              contains: 'STATUS: APPROVED'
            }
          }
        ]
      }
    });

    return Boolean(activeBuffer);
  } catch (error) {
    console.error('Error checking buffer status:', error);
    return false;
  }
};

// Create the worker with enhanced reliability settings
const worker = new Worker('maid-assignment', processJob, {
  connection,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 5, // Process up to 5 jobs concurrently
  limiter: {
    max: parseInt(process.env.WORKER_RATE_LIMIT) || 10, // Max 10 jobs
    duration: 1000, // per 1 second
  },
  // Enhanced reliability settings
  settings: {
    stalledInterval: 30 * 1000, // Check for stalled jobs every 30 seconds
    maxStalledCount: 1, // Max times a job can be stalled before failing
  },
  // Job processing options
  skipLockRenewal: false, // Keep renewing locks for long-running jobs
  skipDelayedJobs: false, // Process delayed jobs
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
  const retryable = err?.retryable !== false && !err?.nonRetryable;
  console.error(`❌ ${formatJobMeta(job, job?.data)} | ${retryable ? 'retryable' : 'non-retryable'} failure | ${err.message}`);
  console.error(`   Attempts: ${job?.attemptsMade}/${job?.opts?.attempts}`);
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
