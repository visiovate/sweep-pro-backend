const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const checkBufferEligibility = require('../middleware/bufferEligibility');
const {
  getSubscriptionPlans,
  validatePricing,
  subscribeToPlan,
  activateSubscriptionAfterPayment,
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
  getUpcomingServices
} = require('../controllers/subscriptionController');

// Public routes
router.get('/plans', getSubscriptionPlans);
router.post('/validate-pricing', validatePricing);


// Protected routes
router.post('/subscribe', authenticateToken, subscribeToPlan);
router.post('/activate-after-payment', authenticateToken, activateSubscriptionAfterPayment);
router.get('/my-subscription', authenticateToken, getUserSubscription);
router.get('/status', authenticateToken, checkSubscriptionStatus);
router.get('/monthly-status', authenticateToken, getMonthlySubscriptionStatus);
// Buffer routes with eligibility check - only for SweePro Lux users
router.post('/buffer/start', authenticateToken, checkBufferEligibility, startBufferPeriod);
router.post('/buffer/end', authenticateToken, checkBufferEligibility, endBufferPeriod);
router.post('/complete-payment', authenticateToken, completeSubscriptionPayment);
router.post('/cancel', authenticateToken, cancelSubscription);
router.get('/upcoming-services', authenticateToken, getUpcomingServices);

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
