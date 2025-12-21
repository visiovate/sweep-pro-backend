const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const { customerCompleteBookingWithQR } = require('../controllers/customerBookingCompletionController');

// Customer completes booking by scanning maid's QR code
router.post('/:bookingId/complete', auth, checkRole(['CUSTOMER']), customerCompleteBookingWithQR);

module.exports = router;
