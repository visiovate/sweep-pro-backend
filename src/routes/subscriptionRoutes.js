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
  checkSubscriptionStatus
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

module.exports = router;
