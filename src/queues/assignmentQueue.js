const { getPrismaClient } = require('../utils/database');
const { Queue } = require('bullmq');
const { PrismaClient } = require('@prisma/client');
const { createRedisConnection } = require('../config/redis');

/**
 * BullMQ Queue for Maid Assignment Scheduling
 * 
 * This queue handles:
 * 1. Scheduling assignment requests 20 hours before service time
 * 2. Processing automatic maid assignments
 * 3. Handling reassignments when maids reject
 */

// Create Redis connection for queue
const connection = createRedisConnection();
const prisma = getPrismaClient();

const buildJobMeta = (jobId, data = {}) => {
  return `jobId=${jobId} customerId=${data.customerId ?? 'n/a'} maidId=${data.maidId ?? 'n/a'} maidUserId=${data.maidUserId ?? 'n/a'}`;
};

const validateEntitiesBeforeEnqueue = async (jobId, data = {}) => {
  const fail = (code, message) => {
    console.warn(`[JOB NOT ENQUEUED] ${jobId} | ${code} | non-retryable | customerId=${data.customerId} maidId=${data.maidId} maidUserId=${data.maidUserId || 'n/a'}${message ? ` | ${message}` : ''}`);
    return { ok: false, result: { skipped: true, reason: code, message, customerId: data.customerId, maidId: data.maidId, maidUserId: data.maidUserId } };
  };

  if (!data.customerId) {
    return fail('CUSTOMER_ID_MISSING', 'Job payload missing customerId');
  }

  const customer = await prisma.user.findUnique({ where: { id: data.customerId }, select: { id: true } });
  if (!customer) {
    return fail('CUSTOMER_NOT_FOUND', 'Customer does not exist');
  }

  if (!data.maidId) {
    return fail('MAID_ID_MISSING', 'Job payload missing maidId');
  }

  const maidProfile = await prisma.maidProfile.findUnique({
    where: { id: data.maidId },
    include: {
      user: { select: { id: true } }
    }
  });

  if (!maidProfile) {
    return fail('MAID_PROFILE_NOT_FOUND', 'Maid profile does not exist');
  }

  if (!maidProfile.user) {
    return fail('MAID_USER_NOT_FOUND', 'Maid profile missing linked user');
  }

  if (data.maidUserId) {
    const maidUser = await prisma.user.findUnique({ where: { id: data.maidUserId }, select: { id: true } });
    if (!maidUser) {
      return fail('MAID_USER_NOT_FOUND', 'Maid user does not exist');
    }
  }

  return {
    ok: true,
    normalizedData: { ...data, maidUserId: data.maidUserId || maidProfile.user.id }
  };
};

// Assignment Queue with enhanced reliability
const assignmentQueue = new Queue('maid-assignment', {
  connection,
  defaultJobOptions: {
    attempts: 3, // Retry up to 3 times on failure
    backoff: {
      type: 'exponential',
      delay: 5000, // Start with 5 seconds, exponentially increase
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 24 * 3600, // Remove after 24 hours
    },
    removeOnFail: {
      count: 50, // Keep last 50 failed jobs
      age: 7 * 24 * 3600, // Remove after 7 days
    },
    // Job deduplication
    jobId: undefined, // Will be set per job for idempotency
  },
  // Queue-level settings
  settings: {
    stalledInterval: 30 * 1000, // Check for stalled jobs every 30 seconds
    maxStalledCount: 1, // Max times a job can be stalled before failing
  },
});

let assignmentQueueScheduler = null;
try {
  const bullmq = require('bullmq');
  const CandidateScheduler = bullmq?.QueueScheduler;
  if (typeof CandidateScheduler === 'function') {
    assignmentQueueScheduler = new CandidateScheduler('maid-assignment', { connection });
  } else {
    console.warn('⚠️ QueueScheduler not available in this BullMQ build; delayed/repeatable job promotion may rely on Redis configuration.');
  }
} catch (e) {
  console.warn('⚠️ Failed to initialize QueueScheduler:', e?.message || e);
}

// Event listeners for monitoring
assignmentQueue.on('waiting', (job) => {
  console.log(`📋 Job ${job.id} is waiting in queue`);
});

assignmentQueue.on('active', (job) => {
  console.log(`🔄 Job ${job.id} is now active`);
});

assignmentQueue.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed successfully:`, result);
});

assignmentQueue.on('failed', (job, err) => {
  const retryable = err?.retryable !== false && !err?.nonRetryable;
  console.error(`❌ ${buildJobMeta(job?.id, job?.data)} | ${retryable ? 'retryable' : 'non-retryable'} failure | ${err.message}`);
});

assignmentQueue.on('stalled', (job) => {
  console.warn(`⚠️ Job ${job} stalled and may need manual intervention`);
});

/**
 * Job Types for the Assignment Queue
 */
const JOB_TYPES = {
  CREATE_ASSIGNMENT_REQUEST: 'create-assignment-request',
  PROCESS_ALL_ASSIGNMENTS: 'process-all-assignments',
  HANDLE_EXPIRED_REQUESTS: 'handle-expired-requests',
  SEND_REMINDER: 'send-reminder',
};

/**
 * Schedule a single assignment request job
 * @param {Object} data - Job data containing customer, maid, booking info
 * @param {Date} scheduledTime - When to execute the job
 * @returns {Promise<Job>} - Created job
 */
const scheduleAssignmentRequest = async (data, scheduledTime) => {
  const delay = scheduledTime.getTime() - Date.now();
  
  // Use bookingId for idempotency if available, otherwise use customerId + timestamp
  const jobId = data.bookingId 
    ? `assignment-${data.bookingId}` 
    : `assignment-${data.customerId}-${scheduledTime.getTime()}`;

  const validation = await validateEntitiesBeforeEnqueue(jobId, data);
  if (!validation.ok) {
    return validation.result;
  }
  const jobData = validation.normalizedData;
  
  if (delay < 0) {
    console.log(`⚠️ Scheduled time is in the past, executing immediately`);
    console.log(`🆔 Job ID: ${jobId}`);
    return await assignmentQueue.add(
      JOB_TYPES.CREATE_ASSIGNMENT_REQUEST,
      jobData,
      { 
        priority: 1, // High priority for immediate jobs
        jobId: jobId
      }
    );
  }

  console.log(`📅 Scheduling assignment request for ${scheduledTime.toISOString()}`);
  console.log(`⏳ Delay: ${(delay / 1000 / 60 / 60).toFixed(2)} hours`);
  console.log(`🆔 Job ID: ${jobId}`);
  
  return await assignmentQueue.add(
    JOB_TYPES.CREATE_ASSIGNMENT_REQUEST,
    jobData,
    {
      delay, // Delay in milliseconds
      jobId: jobId,
    }
  );
};

/**
 * Schedule jobs for all active customer assignments
 * @returns {Promise<Array>} - Array of created jobs
 */
const scheduleAllAssignments = async () => {
  console.log('📋 Scheduling jobs for all active assignments...');
  
  return await assignmentQueue.add(
    JOB_TYPES.PROCESS_ALL_ASSIGNMENTS,
    { triggeredAt: new Date().toISOString() },
    {
      priority: 2,
      jobId: `process-all-${Date.now()}`,
    }
  );
};

/**
 * Schedule a repeating job to process assignments daily
 * This runs at a specific time every day to check for upcoming assignments
 * @param {string} cronExpression - Cron expression (default: every hour)
 * @returns {Promise<void>}
 */
const scheduleRepeatingAssignmentCheck = async (cronExpression = '0 * * * *') => {
  // Remove any existing repeatable job with this pattern
  const repeatableJobs = await assignmentQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === JOB_TYPES.PROCESS_ALL_ASSIGNMENTS) {
      await assignmentQueue.removeRepeatableByKey(job.key);
      console.log(`🗑️ Removed existing repeatable job: ${job.key}`);
    }
  }

  // Add new repeatable job
  await assignmentQueue.add(
    JOB_TYPES.PROCESS_ALL_ASSIGNMENTS,
    { isRecurring: true },
    {
      repeat: {
        pattern: cronExpression, // Every hour by default
      },
      jobId: 'recurring-assignment-check',
    }
  );

  console.log(`⏰ Scheduled repeating assignment check with pattern: ${cronExpression}`);
};

/**
 * Handle expired assignment requests
 * Runs periodically to check and reassign expired requests
 */
const scheduleExpiredRequestHandler = async () => {
  await assignmentQueue.add(
    JOB_TYPES.HANDLE_EXPIRED_REQUESTS,
    { triggeredAt: new Date().toISOString() },
    {
      repeat: {
        pattern: '*/30 * * * *', // Every 30 minutes
      },
      jobId: 'handle-expired-requests',
    }
  );

  console.log('⏰ Scheduled expired request handler (every 30 minutes)');
};

/**
 * Get queue statistics
 * @returns {Promise<Object>} - Queue stats
 */
const getQueueStats = async () => {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    assignmentQueue.getWaitingCount(),
    assignmentQueue.getActiveCount(),
    assignmentQueue.getCompletedCount(),
    assignmentQueue.getFailedCount(),
    assignmentQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
};

/**
 * Get all jobs in various states
 * @returns {Promise<Object>} - Jobs by state
 */
const getAllJobs = async () => {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    assignmentQueue.getJobs(['waiting']),
    assignmentQueue.getJobs(['active']),
    assignmentQueue.getJobs(['completed'], 0, 10), // Last 10 completed
    assignmentQueue.getJobs(['failed'], 0, 10), // Last 10 failed
    assignmentQueue.getJobs(['delayed']),
  ]);

  return {
    waiting: waiting.map(j => ({ id: j.id, name: j.name, data: j.data, timestamp: j.timestamp })),
    active: active.map(j => ({ id: j.id, name: j.name, data: j.data, timestamp: j.timestamp })),
    completed: completed.map(j => ({ id: j.id, name: j.name, data: j.data, finishedOn: j.finishedOn })),
    failed: failed.map(j => ({ id: j.id, name: j.name, data: j.data, failedReason: j.failedReason })),
    delayed: delayed.map(j => ({ id: j.id, name: j.name, data: j.data, delay: j.opts.delay })),
  };
};

/**
 * Clean up old jobs
 * @param {number} graceMs - Grace period in milliseconds
 * @returns {Promise<void>}
 */
const cleanQueue = async (graceMs = 24 * 3600 * 1000) => {
  await assignmentQueue.clean(graceMs, 100, 'completed');
  await assignmentQueue.clean(graceMs * 7, 50, 'failed');
  console.log('🧹 Queue cleaned successfully');
};

/**
 * Retry a failed job
 * @param {string} jobId - Job ID to retry
 * @returns {Promise<void>}
 */
const retryFailedJob = async (jobId) => {
  const job = await assignmentQueue.getJob(jobId);
  if (job && await job.isFailed()) {
    await job.retry();
    console.log(`🔄 Retrying job ${jobId}`);
  } else {
    throw new Error(`Job ${jobId} not found or not in failed state`);
  }
};

/**
 * Pause the queue
 * @returns {Promise<void>}
 */
const pauseQueue = async () => {
  await assignmentQueue.pause();
  console.log('⏸️ Assignment queue paused');
};

/**
 * Resume the queue
 * @returns {Promise<void>}
 */
const resumeQueue = async () => {
  await assignmentQueue.resume();
  console.log('▶️ Assignment queue resumed');
};

/**
 * Close queue and cleanup
 * @returns {Promise<void>}
 */
const closeQueue = async () => {
  if (assignmentQueueScheduler?.close) {
    await assignmentQueueScheduler.close();
  }
  await assignmentQueue.close();
  console.log('🔌 Assignment queue closed');
};

module.exports = {
  assignmentQueue,
  assignmentQueueScheduler,
  JOB_TYPES,
  scheduleAssignmentRequest,
  scheduleAllAssignments,
  scheduleRepeatingAssignmentCheck,
  scheduleExpiredRequestHandler,
  getQueueStats,
  getAllJobs,
  cleanQueue,
  retryFailedJob,
  pauseQueue,
  resumeQueue,
  closeQueue,
};
