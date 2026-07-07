const express = require('express');
const router = express.Router();
const {
  setupAdmin,
  adminLogin,
  verifyAdminLoginOtp,
  requestAdminPasswordReset,
  resetAdminPassword
} = require('../controllers/adminAuthController');
const { adminAuthRateLimiter } = require('../middleware/rateLimiters');
const { ipWhitelistMiddleware } = require('../middleware/ipWhitelist');

// Apply IP whitelisting to all admin auth routes (if configured)
router.use(ipWhitelistMiddleware);

// One-time admin setup (only works if no admin exists)
// No rate limiting - this is a one-time setup endpoint
router.post('/setup', setupAdmin);

// Admin login with rate limiting
router.post('/login', adminAuthRateLimiter, adminLogin);

// Verify OTP and complete login
router.post('/verify-otp', verifyAdminLoginOtp);

// Request password reset
router.post('/request-password-reset', requestAdminPasswordReset);

// Reset password with OTP
router.post('/reset-password', resetAdminPassword);

module.exports = router;
