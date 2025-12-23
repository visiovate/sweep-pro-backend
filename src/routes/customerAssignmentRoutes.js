const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  assignMaidToCustomer,
  getCustomerAssignment,
  updateCustomerAssignment,
  getAllCustomerAssignments,
  getCustomerStatus,
  getMyCustomerStatus,
  removeCustomerAssignment,
  checkMaidStatus,
  getMaidAssignmentRequests,
  acceptAssignmentRequest,
  rejectAssignmentRequest,
  getAllAssignmentRequests,
  testCreateAssignmentRequest,
  getMyMaidAssignment
} = require('../controllers/customerAssignmentController');

// Admin routes for customer-maid assignments
router.post('/assign', authenticateToken, authorizeAdmin, assignMaidToCustomer);
router.get('/status/:customerId', authenticateToken, authorizeAdmin, getCustomerStatus);

// Customer routes (must come BEFORE '/:customerId' or they'll be shadowed)
router.get('/my-status', authenticateToken, getMyCustomerStatus);
router.get('/my-assignment', authenticateToken, getMyMaidAssignment);

// Assignment request routes for maids (must come BEFORE '/:customerId' or they'll be shadowed)
router.get('/requests/maid', authenticateToken, getMaidAssignmentRequests);
router.post('/requests/:requestId/accept', authenticateToken, acceptAssignmentRequest);
router.post('/requests/:requestId/reject', authenticateToken, rejectAssignmentRequest);

// Assignment request routes for admins (must come BEFORE '/:customerId' or they'll be shadowed)
router.get('/requests/all', authenticateToken, authorizeAdmin, getAllAssignmentRequests);

// Debug routes (must come BEFORE '/:customerId' or they'll be shadowed)
router.get('/debug/maid/:maidId', authenticateToken, authorizeAdmin, checkMaidStatus);
router.post('/test/create-request', authenticateToken, authorizeAdmin, testCreateAssignmentRequest);

// Admin CRUD routes with dynamic :customerId (must come after static routes)
router.get('/:customerId', authenticateToken, authorizeAdmin, getCustomerAssignment);
router.patch('/:customerId/update', authenticateToken, authorizeAdmin, updateCustomerAssignment);
router.get('/', authenticateToken, authorizeAdmin, getAllCustomerAssignments);
router.delete('/:customerId', authenticateToken, authorizeAdmin, removeCustomerAssignment);

module.exports = router;
