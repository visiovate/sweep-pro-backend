const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  getActiveCustomers,
  getPendingBookings,
  getAvailableMaids,
  assignMaidToBooking,
  generateServiceOTP
} = require('../controllers/adminController');

// Protected Admin Routes
router.get('/active-customers', authenticateToken, authorizeAdmin, getActiveCustomers);
router.get('/pending-bookings', authenticateToken, authorizeAdmin, getPendingBookings);
router.get('/available-maids', authenticateToken, authorizeAdmin, getAvailableMaids);
router.post('/assign-maid', authenticateToken, authorizeAdmin, assignMaidToBooking);
router.post('/generate-otp', authenticateToken, authorizeAdmin, generateServiceOTP);

module.exports = router;
