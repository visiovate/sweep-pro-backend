const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin, checkRole } = require('../middleware/auth');
const { validateActiveSubscription } = require('../middleware/subscriptionValidation');
const {
  createBooking,
  getAllBookings,
  getBookingById,
  getUserBookings,
  getMaidBookings,
  assignMaid,
  updateBookingStatus,
  cancelBooking,
  completeBookingPayment,
  getAvailableSlots,
  getBookingStats
} = require('../controllers/bookingController');
const { customerCompleteBookingWithQR } = require('../controllers/customerBookingCompletionController');

// C9 FIX: Previously ALL booking routes only required authenticateToken,
// meaning a MAID could create bookings, and a CUSTOMER could mark bookings
// as COMPLETED or access maid-only assignment endpoints. Role guards added.

// Customer-only routes
router.post('/', authenticateToken, checkRole(['CUSTOMER']), validateActiveSubscription, createBooking);
router.get('/my-bookings', authenticateToken, checkRole(['CUSTOMER']), getUserBookings);
router.get('/available-slots', authenticateToken, getAvailableSlots);
router.get('/stats', authenticateToken, getBookingStats);
// Customer cancel: requires ownership check inside controller
router.put('/:id/cancel', authenticateToken, checkRole(['CUSTOMER']), cancelBooking);
router.post('/complete-payment', authenticateToken, checkRole(['CUSTOMER']), completeBookingPayment);
router.post('/:bookingId/complete-with-qr', authenticateToken, checkRole(['CUSTOMER']), customerCompleteBookingWithQR);

// Maid-only routes
router.get('/my-assignments', authenticateToken, checkRole(['MAID', 'FLOATING_MAID']), getMaidBookings);
// updateBookingStatus: maids update status; also allows ADMIN override
router.put('/:id/status', authenticateToken, checkRole(['MAID', 'FLOATING_MAID', 'ADMIN']), updateBookingStatus);

// Admin routes
router.get('/', authenticateToken, authorizeAdmin, getAllBookings);
router.get('/:id', authenticateToken, authorizeAdmin, getBookingById);
router.put('/:id/assign', authenticateToken, authorizeAdmin, assignMaid);
// Admin cancel (no role restriction beyond admin, admin can cancel any booking)
router.put('/:id/admin-cancel', authenticateToken, authorizeAdmin, cancelBooking);

module.exports = router;
