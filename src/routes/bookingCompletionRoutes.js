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
const { getMaidIdentityQR, generateCodesForAllMaids, setMaidCustomCode } = require('../controllers/customerBookingCompletionController');

/**
 * Booking Completion Routes
 *
 * Handles booking completion workflow with verification code
 */

// Get assigned bookings for maid
router.get('/maid/assigned', auth, checkRole(['MAID']), getAssignedBookings);

// Get maid's verification code (for customers to verify)
router.get('/maid/qr-code', auth, checkRole(['MAID', 'FLOATING_MAID']), getMaidIdentityQR);

// Maid sets/updates their custom verification code
router.put('/maid/custom-code', auth, checkRole(['MAID', 'FLOATING_MAID']), setMaidCustomCode);

// Admin: Generate verification codes for all maids without one
router.post('/admin/generate-maid-codes', auth, checkRole(['ADMIN']), generateCodesForAllMaids);

// Get customer bookings
router.get('/customer/bookings', auth, checkRole(['CUSTOMER']), getCustomerBookings);

// Start a booking service (optional - for internal tracking only)
router.post('/:bookingId/start', auth, checkRole(['MAID']), startBookingService);

// Complete booking with QR code verification (maid-initiated - deprecated)
router.post('/:bookingId/complete', auth, checkRole(['MAID']), completeBookingWithQR);

// Generate QR code for maid for a specific booking (deprecated - use /maid/qr-code instead)
router.get('/:bookingId/qr-code', auth, checkRole(['MAID']), generateMaidQRCode);

module.exports = router;