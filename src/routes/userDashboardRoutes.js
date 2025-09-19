const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getSubscriptionDashboard,
  getMonthlyServiceCalendar,
  getBufferPeriodHistory,
  getSubscriptionCycleHistory,
  getServicePreferences
} = require('../controllers/userDashboardController');

// All routes require authentication
router.use(authenticateToken);

// Dashboard routes
router.get('/dashboard', getSubscriptionDashboard);
router.get('/calendar', getMonthlyServiceCalendar);
router.get('/buffer-history', getBufferPeriodHistory);
router.get('/cycle-history', getSubscriptionCycleHistory);
router.get('/preferences', getServicePreferences);

module.exports = router;
