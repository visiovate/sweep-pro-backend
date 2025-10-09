const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin, authorizeMaid } = require('../middleware/auth');
const {
  // Maid assignment routes
  getPendingAssignments,
  getMyAssignments,
  acceptAssignment,
  rejectAssignment,
  
  // Admin assignment routes
  getAllAssignments,
  createAssignment,
  getAssignmentStats,
  getAssignmentById,
  cancelAssignment,
  
  // Admin booking management routes
  getPendingAssignmentBookings,
  getAssignedBookings,
  getReassignmentBookings,
  getAvailableMaids,
  sendAssignmentRequest
} = require('../controllers/assignmentController');

// Maid Assignment Routes
router.get('/pending', authenticateToken, authorizeMaid, getPendingAssignments);
router.get('/my-assignments', authenticateToken, authorizeMaid, getMyAssignments);
router.post('/:assignmentId/accept', authenticateToken, authorizeMaid, acceptAssignment);
router.post('/:assignmentId/reject', authenticateToken, authorizeMaid, rejectAssignment);

// Admin Assignment Routes
router.get('/admin/assignments', authenticateToken, authorizeAdmin, getAllAssignments);
router.post('/admin/assignments/create', authenticateToken, authorizeAdmin, createAssignment);
router.get('/admin/assignments/stats', authenticateToken, authorizeAdmin, getAssignmentStats);
router.get('/admin/assignments/:assignmentId', authenticateToken, authorizeAdmin, getAssignmentById);
router.delete('/admin/assignments/:assignmentId', authenticateToken, authorizeAdmin, cancelAssignment);

// Admin Booking Management Routes (for the new dashboard sections)
router.get('/admin/pending-assignments', authenticateToken, authorizeAdmin, getPendingAssignmentBookings);
router.get('/admin/assigned-bookings', authenticateToken, authorizeAdmin, getAssignedBookings);
router.get('/admin/reassignment-bookings', authenticateToken, authorizeAdmin, getReassignmentBookings);
router.get('/admin/available-maids/:bookingId', authenticateToken, authorizeAdmin, getAvailableMaids);
router.post('/admin/send-assignment-request', authenticateToken, authorizeAdmin, sendAssignmentRequest);

module.exports = router;
