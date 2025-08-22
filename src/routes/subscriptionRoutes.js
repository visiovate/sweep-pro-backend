const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getSubscriptionPlans,
  subscribeToPlan,
  getUserSubscription,
  confirmNextDayService,
  completeSubscriptionPayment,
  cancelSubscription,
  checkSubscriptionStatus,
  updateSubscriptionPlan,
  createSubscriptionPlan,
  deleteSubscriptionPlan
} = require('../controllers/subscriptionController');

// Public routes
router.get('/plans', getSubscriptionPlans);


// Protected routes
router.post('/subscribe', authenticateToken, subscribeToPlan);
router.get('/my-subscription', authenticateToken, getUserSubscription);
router.get('/status', authenticateToken, checkSubscriptionStatus);
router.post('/confirm-service', authenticateToken, confirmNextDayService);
router.post('/complete-payment', authenticateToken, completeSubscriptionPayment);
router.post('/cancel', authenticateToken, cancelSubscription);

// Admin routes
router.put('/admin/plans/:id', authenticateToken, updateSubscriptionPlan);
router.post('/admin/plans', authenticateToken, createSubscriptionPlan);
router.delete('/admin/plans/:id', authenticateToken, deleteSubscriptionPlan);

module.exports = router;
