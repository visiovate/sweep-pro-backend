const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  getAllMaids,
  getMaidById,
  updateMaidProfile,
  updateMaidStatus,
  deleteMaid
} = require('../controllers/maidController');

// Get all maids (admin only)
router.get('/', authenticateToken, authorizeAdmin, getAllMaids);

// Get a maid by ID (admin only)
router.get('/:id', authenticateToken, authorizeAdmin, getMaidById);

// Update own maid profile (maid only)
router.put('/profile', authenticateToken, updateMaidProfile);

// Update maid status (admin only)
router.put('/:id/status', authenticateToken, authorizeAdmin, updateMaidStatus);

// Delete maid (admin only)
router.delete('/:id', authenticateToken, authorizeAdmin, deleteMaid);

module.exports = router; 