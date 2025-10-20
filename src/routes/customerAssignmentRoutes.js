const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  assignMaidToCustomer,
  getCustomerAssignment,
  updateCustomerAssignment,
  getAllCustomerAssignments,
  getCustomerStatus,
  removeCustomerAssignment,
  checkMaidStatus,
  getMaidAssignmentRequests,
  acceptAssignmentRequest,
  rejectAssignmentRequest,
  getAllAssignmentRequests,
  testCreateAssignmentRequest
} = require('../controllers/customerAssignmentController');

// Admin routes for customer-maid assignments
router.post('/assign', authenticateToken, authorizeAdmin, assignMaidToCustomer);
router.get('/:customerId', authenticateToken, authorizeAdmin, getCustomerAssignment);
router.patch('/:customerId/update', authenticateToken, authorizeAdmin, updateCustomerAssignment);
router.get('/', authenticateToken, authorizeAdmin, getAllCustomerAssignments);
router.delete('/:customerId', authenticateToken, authorizeAdmin, removeCustomerAssignment);

// Customer routes
router.get('/status/:customerId', authenticateToken, authorizeAdmin, getCustomerStatus);

// Assignment request routes for maids
router.get('/requests/maid', authenticateToken, getMaidAssignmentRequests);
router.post('/requests/:requestId/accept', authenticateToken, acceptAssignmentRequest);
router.post('/requests/:requestId/reject', authenticateToken, rejectAssignmentRequest);

// Assignment request routes for admins
router.get('/requests/all', authenticateToken, authorizeAdmin, getAllAssignmentRequests);

// Debug routes
router.get('/debug/maid/:maidId', authenticateToken, authorizeAdmin, checkMaidStatus);
router.post('/test/create-request', authenticateToken, authorizeAdmin, testCreateAssignmentRequest);

module.exports = router;
