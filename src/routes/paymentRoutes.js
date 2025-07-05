const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  createPayment,
  getAllPayments,
  getPaymentById,
  updatePaymentStatus,
  getUserPayments
} = require('../controllers/paymentController');

// Customer routes
router.post('/', authenticateToken, createPayment);
router.get('/my-payments', authenticateToken, getUserPayments);

// Admin routes
router.get('/', authenticateToken, authorizeAdmin, getAllPayments);
router.get('/:id', authenticateToken, authorizeAdmin, getPaymentById);
router.put('/:id/status', authenticateToken, authorizeAdmin, updatePaymentStatus);

module.exports = router; 