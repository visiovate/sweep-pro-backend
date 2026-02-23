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
  handleRazorpayWebhook,
  downloadInvoice,
  viewInvoice
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
// SECURITY: Use express.raw() to capture raw body for HMAC signature verification.
// The raw body is stored in req.rawBody before JSON parsing.
router.post('/razorpay/webhook',
  express.raw({ type: 'application/json', limit: '256kb' }),
  (req, res, next) => {
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
