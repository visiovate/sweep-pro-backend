const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getCompleteProfile,
  getPublicProfile,
  updateUserProfile,
  updateCustomerProfile,
  updateMaidProfile,
  uploadProfileImage,
  deleteProfileImage,
  getProfileStats,
  getRecentActivity
} = require('../controllers/profileController');

// Get complete profile (authenticated user)
router.get('/me', authenticateToken, getCompleteProfile);

// Get public profile (any user can view if public)
router.get('/public/:userId', authenticateToken, getPublicProfile);

// Update user profile (basic info)
router.put('/user', authenticateToken, updateUserProfile);

// Update customer-specific profile
router.put('/customer', authenticateToken, updateCustomerProfile);

// Update maid-specific profile
router.put('/maid', authenticateToken, updateMaidProfile);

// Upload profile/cover image
router.post('/image', authenticateToken, uploadProfileImage);

// Delete profile/cover image
router.delete('/image/:imageType', authenticateToken, deleteProfileImage);

// Get profile statistics
router.get('/stats', authenticateToken, getProfileStats);
router.get('/stats/:userId', authenticateToken, getProfileStats);

// Get recent activity
router.get('/activity', authenticateToken, getRecentActivity);

module.exports = router;
