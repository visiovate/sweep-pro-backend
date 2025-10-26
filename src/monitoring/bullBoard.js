const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { assignmentQueue } = require('../queues/assignmentQueue');
const { adminReassignQueue } = require('../queues/adminReassignQueue');

/**
 * Bull Board Integration for Job Visualization
 * 
 * This provides a web-based dashboard to monitor and manage BullMQ queues.
 * Access it at: http://localhost:3000/admin/queues
 */

// Create Express adapter for Bull Board
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// Create Bull Board with all queues
const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [
    new BullAdapter(assignmentQueue),
    new BullAdapter(adminReassignQueue),
  ],
  serverAdapter: serverAdapter,
});

// Add queue monitoring endpoints
serverAdapter.get('/health', async (req, res) => {
  try {
    const assignmentStats = await assignmentQueue.getJobCounts();
    const reassignStats = await adminReassignQueue.getJobCounts();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      queues: {
        assignment: {
          name: 'maid-assignment',
          stats: assignmentStats,
          status: 'healthy'
        },
        reassignment: {
          name: 'admin-reassignment',
          stats: reassignStats,
          status: 'healthy'
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add queue management endpoints
serverAdapter.post('/queues/:queueName/pause', async (req, res) => {
  try {
    const { queueName } = req.params;
    
    if (queueName === 'maid-assignment') {
      await assignmentQueue.pause();
    } else if (queueName === 'admin-reassignment') {
      await adminReassignQueue.pause();
    } else {
      return res.status(404).json({ success: false, message: 'Queue not found' });
    }
    
    res.json({
      success: true,
      message: `Queue ${queueName} paused`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

serverAdapter.post('/queues/:queueName/resume', async (req, res) => {
  try {
    const { queueName } = req.params;
    
    if (queueName === 'maid-assignment') {
      await assignmentQueue.resume();
    } else if (queueName === 'admin-reassignment') {
      await adminReassignQueue.resume();
    } else {
      return res.status(404).json({ success: false, message: 'Queue not found' });
    }
    
    res.json({
      success: true,
      message: `Queue ${queueName} resumed`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

serverAdapter.post('/queues/:queueName/clean', async (req, res) => {
  try {
    const { queueName } = req.params;
    const { age = 24 * 60 * 60 * 1000, limit = 100 } = req.body; // Default: 24 hours, 100 jobs
    
    let cleanedJobs = [];
    
    if (queueName === 'maid-assignment') {
      const completedCleaned = await assignmentQueue.clean(age, limit, 'completed');
      const failedCleaned = await assignmentQueue.clean(age, limit, 'failed');
      cleanedJobs = [...completedCleaned, ...failedCleaned];
    } else if (queueName === 'admin-reassignment') {
      const completedCleaned = await adminReassignQueue.clean(age, limit, 'completed');
      const failedCleaned = await adminReassignQueue.clean(age, limit, 'failed');
      cleanedJobs = [...completedCleaned, ...failedCleaned];
    } else {
      return res.status(404).json({ success: false, message: 'Queue not found' });
    }
    
    res.json({
      success: true,
      message: `Cleaned ${cleanedJobs.length} jobs from ${queueName}`,
      cleanedCount: cleanedJobs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add job retry endpoint
serverAdapter.post('/queues/:queueName/jobs/:jobId/retry', async (req, res) => {
  try {
    const { queueName, jobId } = req.params;
    
    let job = null;
    if (queueName === 'maid-assignment') {
      job = await assignmentQueue.getJob(jobId);
    } else if (queueName === 'admin-reassignment') {
      job = await adminReassignQueue.getJob(jobId);
    } else {
      return res.status(404).json({ success: false, message: 'Queue not found' });
    }
    
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    
    await job.retry();
    
    res.json({
      success: true,
      message: `Job ${jobId} retried`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add job removal endpoint
serverAdapter.delete('/queues/:queueName/jobs/:jobId', async (req, res) => {
  try {
    const { queueName, jobId } = req.params;
    
    let job = null;
    if (queueName === 'maid-assignment') {
      job = await assignmentQueue.getJob(jobId);
    } else if (queueName === 'admin-reassignment') {
      job = await adminReassignQueue.getJob(jobId);
    } else {
      return res.status(404).json({ success: false, message: 'Queue not found' });
    }
    
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    
    await job.remove();
    
    res.json({
      success: true,
      message: `Job ${jobId} removed`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

console.log('📊 Bull Board initialized');
console.log('🔗 Queue Dashboard: http://localhost:3000/admin/queues');
console.log('🏥 Health Check: http://localhost:3000/admin/queues/health');

module.exports = {
  serverAdapter,
  addQueue,
  removeQueue,
  setQueues,
  replaceQueues,
};


