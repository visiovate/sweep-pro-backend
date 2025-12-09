const express = require('express');
const {
  getActiveAssignments,
  triggerJobScheduling,
  getAssignmentStatus,
  createAssignment,
  deactivateAssignment,
  runDailyAutomation
} = require('../controllers/adminAssignmentController');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  getActiveCustomers,
  getPendingBookings,
  getAvailableMaids,
  assignMaidToBooking,
  generateServiceOTP,
  getAdminStats,
  getAllSubscriptions,
  getAllPayments,
  getAllMaidsWithDocuments
} = require('../controllers/adminController');

// Import assignment controller functions for admin dashboard
const {
  getPendingAssignmentBookings,
  getAssignedBookings,
  getReassignmentBookings,
  getAvailableMaids: getAvailableMaidsForAssignment,
  sendAssignmentRequest,
  getAllPendingAssignmentRequests
} = require('../controllers/assignmentController');

// Import customer assignment controller functions
const {
  getAllCustomerAssignments,
  getAllAssignmentRequests
} = require('../controllers/customerAssignmentController');

// Protected Admin Routes
router.get('/stats', authenticateToken, authorizeAdmin, getAdminStats);
router.get('/active-customers', authenticateToken, authorizeAdmin, getActiveCustomers);
router.get('/pending-bookings', authenticateToken, authorizeAdmin, getPendingBookings);
router.get('/available-maids', authenticateToken, authorizeAdmin, getAvailableMaids);
router.get('/subscriptions', authenticateToken, authorizeAdmin, getAllSubscriptions);
router.get('/payments', authenticateToken, authorizeAdmin, getAllPayments);
router.get('/maids-documents', authenticateToken, authorizeAdmin, getAllMaidsWithDocuments);
router.post('/assign-maid', authenticateToken, authorizeAdmin, assignMaidToBooking);
router.post('/generate-otp', authenticateToken, authorizeAdmin, generateServiceOTP);

// Admin Dashboard Routes for Assignment Management
router.get('/pending-assignments', authenticateToken, authorizeAdmin, getPendingAssignmentBookings);
router.get('/pending-assignment-requests', authenticateToken, authorizeAdmin, getAllPendingAssignmentRequests); // NEW: truly pending requests
router.get('/assigned-bookings', authenticateToken, authorizeAdmin, getAssignedBookings);
router.get('/reassignment-bookings', authenticateToken, authorizeAdmin, getReassignmentBookings);
router.get('/available-maids/:bookingId', authenticateToken, authorizeAdmin, getAvailableMaidsForAssignment);
router.post('/send-assignment-request', authenticateToken, authorizeAdmin, sendAssignmentRequest);

// Admin Customer Assignment Routes
router.get('/customer-assignments', authenticateToken, authorizeAdmin, getAllCustomerAssignments);
router.get('/assignment-requests', authenticateToken, authorizeAdmin, getAllAssignmentRequests);

// Admin Assignment Management Routes (new)
router.get('/active-assignments', authenticateToken, authorizeAdmin, getActiveAssignments);
router.post('/trigger-job-scheduling', authenticateToken, authorizeAdmin, triggerJobScheduling);
router.get('/assignment-status', authenticateToken, authorizeAdmin, getAssignmentStatus);
router.post('/create-assignment', authenticateToken, authorizeAdmin, createAssignment);
router.patch('/assignments/:assignmentId/deactivate', authenticateToken, authorizeAdmin, deactivateAssignment);
router.post('/run-daily-automation', authenticateToken, authorizeAdmin, runDailyAutomation);

module.exports = router;
