const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const checkBufferEligibility = require('../middleware/bufferEligibility');
const {
  getSubscriptionPlans,
  subscribeToPlan,
  getUserSubscription,
  getMonthlySubscriptionStatus,
  startBufferPeriod,
  endBufferPeriod,
  completeSubscriptionPayment,
  cancelSubscription,
  checkSubscriptionStatus,
  updateSubscriptionPlan,
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  getSubscriptionCycles,
  getBufferPeriods,
  adminStartBufferPeriod,
  adminEndBufferPeriod,
  getSubscriptionAnalytics,
  getUpcomingServices,
  getTimeSlotCounts,
  getSubscriptionById,
  adminCancelSubscription
} = require('../controllers/subscriptionController');

// Public routes
router.get('/plans', getSubscriptionPlans);
router.get('/time-slot-counts', getTimeSlotCounts); // Public: Get time slot booking counts for a date


// Protected routes
router.post('/subscribe', authenticateToken, subscribeToPlan);
router.get('/my-subscription', authenticateToken, getUserSubscription);
router.get('/status', authenticateToken, checkSubscriptionStatus);
router.get('/monthly-status', authenticateToken, getMonthlySubscriptionStatus);
// Buffer routes with eligibility check - only for Sweepro Lux users
router.post('/buffer/start', authenticateToken, checkBufferEligibility, startBufferPeriod);
router.post('/buffer/end', authenticateToken, checkBufferEligibility, endBufferPeriod);
router.post('/complete-payment', authenticateToken, completeSubscriptionPayment);
router.post('/cancel', authenticateToken, cancelSubscription);
router.get('/upcoming-services', authenticateToken, getUpcomingServices);

// Admin routes
router.get('/admin/analytics', authenticateToken, authorizeAdmin, getSubscriptionAnalytics);
router.get('/admin/cycles', authenticateToken, authorizeAdmin, getSubscriptionCycles);
router.get('/admin/buffers', authenticateToken, authorizeAdmin, getBufferPeriods);
router.post('/admin/:subscriptionId/buffer/start', authenticateToken, authorizeAdmin, adminStartBufferPeriod);
router.post('/admin/:subscriptionId/buffer/end', authenticateToken, authorizeAdmin, adminEndBufferPeriod);
router.put('/admin/plans/:id', authenticateToken, authorizeAdmin, updateSubscriptionPlan);
router.post('/admin/plans', authenticateToken, authorizeAdmin, createSubscriptionPlan);
router.delete('/admin/plans/:id', authenticateToken, authorizeAdmin, deleteSubscriptionPlan);
router.get('/admin/:id', authenticateToken, authorizeAdmin, getSubscriptionById);
router.post('/admin/:id/cancel', authenticateToken, authorizeAdmin, adminCancelSubscription);

module.exports = router;
