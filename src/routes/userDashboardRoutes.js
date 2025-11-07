const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getSubscriptionDashboard,
  getMonthlyServiceCalendar,
  getBufferPeriodHistory,
  getSubscriptionCycleHistory,
  getServicePreferences,
  getDashboardRecentBookings,
  getDashboardRecentNotifications,
  getDashboardRecentPayments
} = require('../controllers/userDashboardController');

// All routes require authentication
router.use(authenticateToken);

// Dashboard routes
router.get('/dashboard', getSubscriptionDashboard);
router.get('/calendar', getMonthlyServiceCalendar);
router.get('/buffer-history', getBufferPeriodHistory);
router.get('/cycle-history', getSubscriptionCycleHistory);
router.get('/preferences', getServicePreferences);

// Instagram-style recent lists (cursor-based pagination)
router.get('/recent/bookings', getDashboardRecentBookings);
router.get('/recent/notifications', getDashboardRecentNotifications);
router.get('/recent/payments', getDashboardRecentPayments);

module.exports = router;
