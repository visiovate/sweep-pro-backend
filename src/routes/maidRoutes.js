const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  getAllMaids,
  getMaidById,
  updateMaidProfile,
  updateMaidStatus,
  deleteMaid,
  verifyStartOTP,
  completeService,
  getMaidAssignments,
  generateEndOTP
} = require('../controllers/maidController');

// Maid service workflow routes (put specific routes first)
router.get('/my-assignments', authenticateToken, getMaidAssignments);
router.put('/profile', authenticateToken, updateMaidProfile);
router.post('/verify-start-otp', authenticateToken, verifyStartOTP);
router.post('/generate-end-otp', authenticateToken, generateEndOTP);
router.post('/complete-service', authenticateToken, completeService);

// Admin routes for maid management
router.get('/', authenticateToken, authorizeAdmin, getAllMaids);
router.get('/:id', authenticateToken, authorizeAdmin, getMaidById);
router.put('/:id/status', authenticateToken, authorizeAdmin, updateMaidStatus);
router.delete('/:id', authenticateToken, authorizeAdmin, deleteMaid);

module.exports = router;
