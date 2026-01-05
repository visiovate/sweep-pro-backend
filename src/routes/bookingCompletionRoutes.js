const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const {
  getAssignedBookings,
  getCustomerBookings,
  completeBookingWithQR,
  startBookingService,
  generateMaidQRCode
} = require('../controllers/bookingCompletionController');

/**
 * Booking Completion Routes
 * 
 * Handles booking completion workflow with QR code verification
 */

// Get assigned bookings for maid
router.get('/maid/assigned', auth, checkRole(['MAID']), getAssignedBookings);

// Get customer bookings
router.get('/customer/bookings', auth, checkRole(['CUSTOMER']), getCustomerBookings);

// Start a booking service (optional - for tracking)
router.post('/:bookingId/start', auth, checkRole(['MAID']), startBookingService);

// Complete booking with QR code verification
router.post('/:bookingId/complete', auth, checkRole(['MAID']), completeBookingWithQR);

// Generate QR code for maid for a specific booking (requires service started)
router.get('/:bookingId/qr-code', auth, checkRole(['MAID']), generateMaidQRCode);

module.exports = router;