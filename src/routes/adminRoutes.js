const express = require('express');
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

module.exports = router;
