const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
// SECURITY: Import webhook signature verifier
const { razorpayWebhookVerifier } = require('../middleware/webhookSignatureVerifier');
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
<<<<<<< HEAD
// SECURITY FIX: Use express.raw() to capture raw body for signature verification
// The raw body is stored in req.rawBody and used by handleRazorpayWebhook
// SECURITY: Set a small size limit for webhook (Razorpay webhooks are typically < 10KB)
router.post('/razorpay/webhook',
  express.raw({ type: 'application/json', limit: '256kb' }),
  (req, res, next) => {
    // Store raw body for signature verification
    if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body.toString('utf8');
      try {
        req.body = JSON.parse(req.rawBody);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON in webhook body' });
      }
    }
    next();
  },
  handleRazorpayWebhook
=======
// SECURITY: CRITICAL - Uses express.raw() to capture raw request body for signature verification
// The razorpayWebhookVerifier middleware MUST be applied BEFORE express.json()
// Order matters: raw() -> webhookVerifier -> handler
router.post(
  '/razorpay/webhook',
  express.raw({ type: 'application/json' }),  // Capture raw body for signature verification
  razorpayWebhookVerifier,                      // Verify HMAC-SHA256 signature using raw body
  handleRazorpayWebhook                         // Process webhook (signature already verified)
>>>>>>> development
);

// Admin routes
router.get('/', authenticateToken, authorizeAdmin, getAllPayments);
router.get('/:id', authenticateToken, authorizeAdmin, getPaymentById);
router.put('/:id/status', authenticateToken, authorizeAdmin, updatePaymentStatus);
router.post('/:paymentId/refund', authenticateToken, authorizeAdmin, processRefund);

module.exports = router;
