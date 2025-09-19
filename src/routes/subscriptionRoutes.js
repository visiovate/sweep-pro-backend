const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
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
  getSubscriptionAnalytics
} = require('../controllers/subscriptionController');

// Public routes
router.get('/plans', getSubscriptionPlans);


// Protected routes
router.post('/subscribe', authenticateToken, subscribeToPlan);
router.get('/my-subscription', authenticateToken, getUserSubscription);
router.get('/status', authenticateToken, checkSubscriptionStatus);
router.get('/monthly-status', authenticateToken, getMonthlySubscriptionStatus);
router.post('/buffer/start', authenticateToken, startBufferPeriod);
router.post('/buffer/end', authenticateToken, endBufferPeriod);
router.post('/complete-payment', authenticateToken, completeSubscriptionPayment);
router.post('/cancel', authenticateToken, cancelSubscription);

// Admin routes
router.get('/admin/analytics', authenticateToken, getSubscriptionAnalytics);
router.get('/admin/cycles', authenticateToken, getSubscriptionCycles);
router.get('/admin/buffers', authenticateToken, getBufferPeriods);
router.post('/admin/:subscriptionId/buffer/start', authenticateToken, adminStartBufferPeriod);
router.post('/admin/:subscriptionId/buffer/end', authenticateToken, adminEndBufferPeriod);
router.put('/admin/plans/:id', authenticateToken, updateSubscriptionPlan);
router.post('/admin/plans', authenticateToken, createSubscriptionPlan);
router.delete('/admin/plans/:id', authenticateToken, deleteSubscriptionPlan);

module.exports = router;
