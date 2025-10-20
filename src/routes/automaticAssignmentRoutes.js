const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  processAutomaticAssignments,
  getUpcomingRequests,
  getStatistics,
  testTimeSlotParsing,
  getCustomerTimeSlots
} = require('../controllers/automaticAssignmentController');

// Admin routes for automatic assignment management
router.post('/process', authenticateToken, authorizeAdmin, processAutomaticAssignments);
router.get('/upcoming', authenticateToken, authorizeAdmin, getUpcomingRequests);
router.get('/statistics', authenticateToken, authorizeAdmin, getStatistics);
router.get('/customer-timeslots', authenticateToken, authorizeAdmin, getCustomerTimeSlots);

// Testing and utility routes
router.post('/test-timeslot', authenticateToken, authorizeAdmin, testTimeSlotParsing);

module.exports = router;
