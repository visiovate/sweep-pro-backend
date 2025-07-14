const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  createPayment,
  getAllPayments,
  getPaymentById,
  updatePaymentStatus,
  getUserPayments,
  verifyPayment,
  createRazorpayBookingOrder,
  createRazorpaySubscriptionOrder,
  verifyRazorpayPayment,
  handleRazorpayPaymentFailure,
  processRefund,
  getPaymentStatus,
  handleRazorpayWebhook
} = require('../controllers/paymentController');

// Customer routes
router.post('/', authenticateToken, createPayment);
router.get('/my-payments', authenticateToken, getUserPayments);
router.post('/verify', authenticateToken, verifyPayment);

// Razorpay routes
router.post('/razorpay/booking/create-order', authenticateToken, createRazorpayBookingOrder);
router.post('/razorpay/subscription/create-order', authenticateToken, createRazorpaySubscriptionOrder);
router.post('/razorpay/verify', authenticateToken, verifyRazorpayPayment);
router.post('/razorpay/failure', authenticateToken, handleRazorpayPaymentFailure);
router.get('/razorpay/status/:razorpayPaymentId', authenticateToken, getPaymentStatus);

// Webhook route (no authentication required)
router.post('/razorpay/webhook', handleRazorpayWebhook);

// Admin routes
router.get('/', authenticateToken, authorizeAdmin, getAllPayments);
router.get('/:id', authenticateToken, authorizeAdmin, getPaymentById);
router.put('/:id/status', authenticateToken, authorizeAdmin, updatePaymentStatus);
router.post('/:paymentId/refund', authenticateToken, authorizeAdmin, processRefund);

module.exports = router;
