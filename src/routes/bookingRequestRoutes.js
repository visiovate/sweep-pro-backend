const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const {
  getPendingRequests,
  acceptRequest,
  rejectRequest,
  getRequestHistory
} = require('../controllers/bookingRequestController');

/**
 * Booking Request Routes
 * 
 * All routes require authentication
 * Only maids can access these endpoints
 */

// Get all pending booking requests for the logged-in maid
router.get('/pending', auth, checkRole(['MAID']), getPendingRequests);

// Get request history for the logged-in maid
router.get('/history', auth, checkRole(['MAID']), getRequestHistory);

// Accept a booking request
router.post('/:requestId/accept', auth, checkRole(['MAID']), acceptRequest);

// Reject a booking request (with reason)
router.post('/:requestId/reject', auth, checkRole(['MAID']), rejectRequest);

module.exports = router;
