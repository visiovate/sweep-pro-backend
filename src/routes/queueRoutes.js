const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
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
} = require('../controllers/queueController');

/**
 * Queue Management Routes
 * All routes require admin authentication
 */

// Health check (public)
router.get('/health', healthCheck);

// Get queue statistics
router.get('/stats', authenticateToken, authorizeAdmin, getStats);

// Get all jobs
router.get('/jobs', authenticateToken, authorizeAdmin, getJobs);

// Clean old jobs
router.post('/clean', authenticateToken, authorizeAdmin, cleanOldJobs);

// Retry a failed job
router.post('/retry/:jobId', authenticateToken, authorizeAdmin, retryJob);

// Pause queue
router.post('/pause', authenticateToken, authorizeAdmin, pause);

// Resume queue
router.post('/resume', authenticateToken, authorizeAdmin, resume);

// Schedule all active assignments
router.post('/schedule-all', authenticateToken, authorizeAdmin, scheduleAll);

// Process all assignments immediately
router.post('/process-now', authenticateToken, authorizeAdmin, processNow);

// Schedule specific customer assignment
router.post('/schedule-customer', authenticateToken, authorizeAdmin, scheduleCustomer);

module.exports = router;
