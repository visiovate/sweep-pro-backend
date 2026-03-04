const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const { razorpayWebhookVerifier } = require('../middleware/webhookSignatureVerifier');
const { paymentLimiter } = require('../middleware/rateLimiter');
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
  handleRazorpayWebhook,
  downloadInvoice,
  viewInvoice
} = require('../controllers/paymentController');

// Customer routes
router.post('/', authenticateToken, createPayment);
router.get('/my-payments', authenticateToken, getUserPayments);
router.post('/verify', authenticateToken, verifyPayment);

// Razorpay routes - all protected with rate limiting to prevent payment spam
router.post('/razorpay/booking/create-order', paymentLimiter, authenticateToken, createRazorpayBookingOrder);
router.post('/razorpay/subscription/create-order', paymentLimiter, authenticateToken, createRazorpaySubscriptionOrder);
router.post('/razorpay/verify', paymentLimiter, authenticateToken, verifyRazorpayPayment);
router.post('/razorpay/failure', authenticateToken, handleRazorpayPaymentFailure);
router.get('/razorpay/status/:razorpayPaymentId', authenticateToken, getPaymentStatus);

// Webhook route (no authentication — Razorpay signs with HMAC-SHA256)
// SECURITY: razorpayWebhookVerifier reads raw body, verifies signature with
// timing-safe comparison, then parses JSON.  Never re-verify inside the handler.
router.post('/razorpay/webhook',
  express.raw({ type: 'application/json', limit: '256kb' }),
  razorpayWebhookVerifier,
  handleRazorpayWebhook
);

// Invoice routes (customer: own payments; admin: any payment)
// NOTE: These must come BEFORE the /:id route to avoid conflict
router.get('/:id/invoice', authenticateToken, downloadInvoice);
router.get('/:id/invoice/view', authenticateToken, viewInvoice);

// Admin routes
// C8 / H2 FIX: authorizeAdmin added to getPaymentById and updatePaymentStatus.
// Previously any authenticated user could read any payment or mark any payment COMPLETED.
router.get('/', authenticateToken, authorizeAdmin, getAllPayments);
router.get('/:id', authenticateToken, authorizeAdmin, getPaymentById);
router.put('/:id/status', authenticateToken, authorizeAdmin, updatePaymentStatus);
router.post('/:paymentId/refund', authenticateToken, authorizeAdmin, processRefund);

module.exports = router;
