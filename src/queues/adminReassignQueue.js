const { Queue } = require('bullmq');
const { createRedisConnection } = require('../config/redis');

/**
 * Admin Reassignment Queue
 * 
 * This queue handles reassignment requests when maids reject assignments.
 * It ensures idempotent updates and proper error handling for reassignments.
 */

// Create Redis connection for queue
const connection = createRedisConnection();

// Admin Reassignment Queue with enhanced reliability
const adminReassignQueue = new Queue('admin-reassignment', {
  connection,
  defaultJobOptions: {
    attempts: 3, // Retry up to 3 times on failure
    backoff: {
      type: 'exponential',
      delay: 5000, // Start with 5 seconds, exponentially increase
    },
    removeOnComplete: {
      count: 50, // Keep last 50 completed jobs
      age: 24 * 3600, // Remove after 24 hours
    },
    removeOnFail: {
      count: 25, // Keep last 25 failed jobs
      age: 7 * 24 * 3600, // Remove after 7 days
    },
  },
  // Queue-level settings
  settings: {
    stalledInterval: 30 * 1000, // Check for stalled jobs every 30 seconds
    maxStalledCount: 1, // Max times a job can be stalled before failing
  },
});

// Event listeners for monitoring
adminReassignQueue.on('waiting', (job) => {
  console.log(`📋 Reassignment job ${job.id} is waiting in queue`);
});

adminReassignQueue.on('active', (job) => {
  console.log(`🔄 Reassignment job ${job.id} is now active`);
});

adminReassignQueue.on('completed', (job, result) => {
  console.log(`✅ Reassignment job ${job.id} completed successfully`);
  console.log(`   Result:`, JSON.stringify(result, null, 2));
});

adminReassignQueue.on('failed', (job, err) => {
  console.error(`❌ Reassignment job ${job.id} failed:`, err.message);
  console.error(`   Attempts: ${job.attemptsMade}/${job.opts.attempts}`);
});

adminReassignQueue.on('stalled', (job) => {
  console.warn(`⚠️ Reassignment job ${job} stalled and may need manual intervention`);
});

/**
 * Job Types for the Admin Reassignment Queue
 */
const REASSIGNMENT_JOB_TYPES = {
  PROCESS_REJECTED_ASSIGNMENT: 'process-rejected-assignment',
  FIND_ALTERNATIVE_MAID: 'find-alternative-maid',
  NOTIFY_ADMIN_REASSIGNMENT: 'notify-admin-reassignment',
  UPDATE_BOOKING_STATUS: 'update-booking-status',
};

/**
 * Queue a rejected assignment for admin reassignment
 * @param {Object} data - Reassignment data
 * @returns {Promise<Job>}
 */
const queueRejectedAssignment = async (data) => {
  const { bookingId, maidId, rejectionReason, customerId } = data;
  
  // Use bookingId for idempotency
  const jobId = `reassign-${bookingId}`;
  
  console.log(`📋 Queueing rejected assignment for reassignment`);
  console.log(`   Booking ID: ${bookingId}`);
  console.log(`   Rejected by Maid: ${maidId}`);
  console.log(`   Reason: ${rejectionReason}`);
  console.log(`   Job ID: ${jobId}`);
  
  return await adminReassignQueue.add(
    REASSIGNMENT_JOB_TYPES.PROCESS_REJECTED_ASSIGNMENT,
    {
      bookingId,
      maidId,
      rejectionReason,
      customerId,
      rejectedAt: new Date().toISOString(),
    },
    {
      priority: 1, // High priority for reassignments
      jobId: jobId,
    }
  );
};

/**
 * Queue finding alternative maid for a booking
 * @param {Object} data - Alternative maid search data
 * @returns {Promise<Job>}
 */
const queueAlternativeMaidSearch = async (data) => {
  const { bookingId, excludedMaidIds = [], customerId } = data;
  
  const jobId = `find-alternative-${bookingId}`;
  
  console.log(`🔍 Queueing alternative maid search`);
  console.log(`   Booking ID: ${bookingId}`);
  console.log(`   Excluded Maids: ${excludedMaidIds.length}`);
  console.log(`   Job ID: ${jobId}`);
  
  return await adminReassignQueue.add(
    REASSIGNMENT_JOB_TYPES.FIND_ALTERNATIVE_MAID,
    {
      bookingId,
      excludedMaidIds,
      customerId,
      searchStartedAt: new Date().toISOString(),
    },
    {
      priority: 2,
      jobId: jobId,
    }
  );
};

/**
 * Queue admin notification for reassignment
 * @param {Object} data - Notification data
 * @returns {Promise<Job>}
 */
const queueAdminNotification = async (data) => {
  const { bookingId, customerId, maidId, reason } = data;
  
  const jobId = `notify-admin-${bookingId}`;
  
  console.log(`📢 Queueing admin notification for reassignment`);
  console.log(`   Booking ID: ${bookingId}`);
  console.log(`   Job ID: ${jobId}`);
  
  return await adminReassignQueue.add(
    REASSIGNMENT_JOB_TYPES.NOTIFY_ADMIN_REASSIGNMENT,
    {
      bookingId,
      customerId,
      maidId,
      reason,
      notifiedAt: new Date().toISOString(),
    },
    {
      priority: 3,
      jobId: jobId,
    }
  );
};

/**
 * Queue booking status update
 * @param {Object} data - Status update data
 * @returns {Promise<Job>}
 */
const queueBookingStatusUpdate = async (data) => {
  const { bookingId, status, assignmentStatus, reason } = data;
  
  const jobId = `update-status-${bookingId}`;
  
  console.log(`📝 Queueing booking status update`);
  console.log(`   Booking ID: ${bookingId}`);
  console.log(`   New Status: ${status}`);
  console.log(`   Assignment Status: ${assignmentStatus}`);
  console.log(`   Job ID: ${jobId}`);
  
  return await adminReassignQueue.add(
    REASSIGNMENT_JOB_TYPES.UPDATE_BOOKING_STATUS,
    {
      bookingId,
      status,
      assignmentStatus,
      reason,
      updatedAt: new Date().toISOString(),
    },
    {
      priority: 1, // High priority for status updates
      jobId: jobId,
    }
  );
};

/**
 * Get queue statistics
 * @returns {Promise<Object>}
 */
const getQueueStats = async () => {
  try {
    const waiting = await adminReassignQueue.getWaiting();
    const active = await adminReassignQueue.getActive();
    const completed = await adminReassignQueue.getCompleted();
    const failed = await adminReassignQueue.getFailed();
    const delayed = await adminReassignQueue.getDelayed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      total: waiting.length + active.length + completed.length + failed.length + delayed.length,
    };
  } catch (error) {
    console.error('Failed to get queue stats:', error);
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      total: 0,
      error: error.message,
    };
  }
};

/**
 * Clean old jobs from the queue
 * @returns {Promise<Object>}
 */
const cleanOldJobs = async () => {
  try {
    const completedCleaned = await adminReassignQueue.clean(24 * 60 * 60 * 1000, 100, 'completed');
    const failedCleaned = await adminReassignQueue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed');
    
    console.log(`🧹 Cleaned ${completedCleaned.length} completed jobs and ${failedCleaned.length} failed jobs`);
    
    return {
      completedCleaned: completedCleaned.length,
      failedCleaned: failedCleaned.length,
    };
  } catch (error) {
    console.error('Failed to clean old jobs:', error);
    throw error;
  }
};

/**
 * Pause the queue
 */
const pauseQueue = async () => {
  await adminReassignQueue.pause();
  console.log('⏸️ Admin reassignment queue paused');
};

/**
 * Resume the queue
 */
const resumeQueue = async () => {
  await adminReassignQueue.resume();
  console.log('▶️ Admin reassignment queue resumed');
};

/**
 * Close the queue connection
 */
const closeQueue = async () => {
  await adminReassignQueue.close();
  console.log('🔌 Admin reassignment queue closed');
};

module.exports = {
  adminReassignQueue,
  REASSIGNMENT_JOB_TYPES,
  queueRejectedAssignment,
  queueAlternativeMaidSearch,
  queueAdminNotification,
  queueBookingStatusUpdate,
  getQueueStats,
  cleanOldJobs,
  pauseQueue,
  resumeQueue,
  closeQueue,
};
