const {
  getQueueStats,
  getAllJobs,
  cleanQueue,
  retryFailedJob,
  pauseQueue,
  resumeQueue,
  scheduleAllAssignments
} = require('../queues/assignmentQueue');
const JobScheduler = require('../services/jobScheduler');

/**
 * Queue Management Controller
 * Admin APIs for managing BullMQ assignment queue
 */

/**
 * Get queue statistics
 * GET /api/queue/stats
 */
const getStats = async (req, res) => {
  try {
    const stats = await getQueueStats();
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get queue statistics',
      error: error.message
    });
  }
};

/**
 * Get all jobs in the queue
 * GET /api/queue/jobs
 */
const getJobs = async (req, res) => {
  try {
    const jobs = await getAllJobs();
    
    res.json({
      success: true,
      data: jobs,
      counts: {
        waiting: jobs.waiting.length,
        active: jobs.active.length,
        completed: jobs.completed.length,
        failed: jobs.failed.length,
        delayed: jobs.delayed.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get jobs',
      error: error.message
    });
  }
};

/**
 * Clean old completed and failed jobs
 * POST /api/queue/clean
 */
const cleanOldJobs = async (req, res) => {
  try {
    const { graceMs } = req.body;
    await cleanQueue(graceMs);
    
    res.json({
      success: true,
      message: 'Queue cleaned successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error cleaning queue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clean queue',
      error: error.message
    });
  }
};

/**
 * Retry a failed job
 * POST /api/queue/retry/:jobId
 */
const retryJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    await retryFailedJob(jobId);
    
    res.json({
      success: true,
      message: `Job ${jobId} queued for retry`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error retrying job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry job',
      error: error.message
    });
  }
};

/**
 * Pause the queue
 * POST /api/queue/pause
 */
const pause = async (req, res) => {
  try {
    await pauseQueue();
    
    res.json({
      success: true,
      message: 'Queue paused successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error pausing queue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to pause queue',
      error: error.message
    });
  }
};

/**
 * Resume the queue
 * POST /api/queue/resume
 */
const resume = async (req, res) => {
  try {
    await resumeQueue();
    
    res.json({
      success: true,
      message: 'Queue resumed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error resuming queue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resume queue',
      error: error.message
    });
  }
};

/**
 * Schedule all active assignments (Manual Trigger)
 * POST /api/queue/schedule-all
 */
const scheduleAll = async (req, res) => {
  try {
    console.log('📋 Manual trigger: Scheduling all assignments');
    const result = await JobScheduler.scheduleAllActiveAssignments();
    
    res.json({
      success: true,
      message: 'All active assignments scheduled successfully',
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error scheduling all assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule assignments',
      error: error.message
    });
  }
};

/**
 * Trigger immediate processing of all assignments
 * POST /api/queue/process-now
 */
const processNow = async (req, res) => {
  try {
    console.log('⚡ Manual trigger: Immediate processing of assignments');
    const result = await JobScheduler.triggerManualProcessing();
    
    res.json({
      success: true,
      message: 'Processing job queued successfully',
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error triggering processing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger processing',
      error: error.message
    });
  }
};

/**
 * Schedule assignment for a specific customer
 * POST /api/queue/schedule-customer
 * Body: { customerId, maidId, timeSlot }
 */
const scheduleCustomer = async (req, res) => {
  try {
    const { customerId, maidId, timeSlot } = req.body;
    
    if (!customerId || !maidId || !timeSlot) {
      return res.status(400).json({
        success: false,
        message: 'customerId, maidId, and timeSlot are required'
      });
    }
    
    const result = await JobScheduler.onNewAssignment(customerId, maidId, timeSlot);
    
    res.json({
      success: true,
      message: 'Customer assignment scheduled successfully',
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error scheduling customer assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule customer assignment',
      error: error.message
    });
  }
};

/**
 * Get queue health check
 * GET /api/queue/health
 */
const healthCheck = async (req, res) => {
  try {
    const stats = await getQueueStats();
    const { testRedisConnection } = require('../config/redis');
    const redisHealthy = await testRedisConnection();
    
    const health = {
      redis: redisHealthy ? 'healthy' : 'unhealthy',
      queue: stats.active >= 0 ? 'healthy' : 'unhealthy',
      stats: stats,
      timestamp: new Date().toISOString()
    };
    
    const statusCode = redisHealthy ? 200 : 503;
    
    res.status(statusCode).json({
      success: redisHealthy,
      data: health
    });
  } catch (error) {
    console.error('Error checking queue health:', error);
    res.status(503).json({
      success: false,
      message: 'Queue health check failed',
      error: error.message
    });
  }
};

module.exports = {
  getStats,
  getJobs,
  cleanOldJobs,
  retryJob,
  pause,
  resume,
  scheduleAll,
  processNow,
  scheduleCustomer,
  healthCheck
};
