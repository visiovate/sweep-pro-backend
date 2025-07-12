const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  createBooking,
  getAllBookings,
  getBookingById,
  getUserBookings,
  getMaidBookings,
  assignMaid,
  updateBookingStatus,
  cancelBooking,
  completeBookingPayment
} = require('../controllers/bookingController');

// Customer routes
router.post('/', authenticateToken, createBooking);
router.get('/my-bookings', authenticateToken, getUserBookings);
router.post('/complete-payment', authenticateToken, completeBookingPayment);

// Maid routes
router.get('/my-assignments', authenticateToken, getMaidBookings);
router.put('/:id/status', authenticateToken, updateBookingStatus);

// Admin routes
router.get('/', authenticateToken, authorizeAdmin, getAllBookings);
router.get('/:id', authenticateToken, authorizeAdmin, getBookingById);
router.put('/:id/assign', authenticateToken, authorizeAdmin, assignMaid);
router.put('/:id/cancel', authenticateToken, authorizeAdmin, cancelBooking);

module.exports = router; 