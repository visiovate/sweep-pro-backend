const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  createAutomaticBooking,
  createDailyAutomaticBookings,
  getAutomaticBookings,
  getEligibleCustomers
} = require('../controllers/automaticBookingController');

// Admin routes for automatic bookings
router.post('/create', authenticateToken, authorizeAdmin, createAutomaticBooking);
router.post('/create-daily', authenticateToken, authorizeAdmin, createDailyAutomaticBookings);
router.get('/', authenticateToken, authorizeAdmin, getAutomaticBookings);
router.get('/eligible-customers', authenticateToken, authorizeAdmin, getEligibleCustomers);

module.exports = router;
