const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const feedbackAdminController = require('../controllers/feedbackAdminController');
const { authenticateToken, authorizeAdmin, authorizeMaid } = require('../middleware/auth');

// Customer routes
router.post('/', authenticateToken, feedbackController.submitFeedback);
router.get('/my-feedback', authenticateToken, feedbackController.getCustomerFeedback);
router.get('/eligible-bookings', authenticateToken, feedbackController.getEligibleBookings);
router.get('/booking/:bookingId', authenticateToken, feedbackController.getFeedbackByBooking);

// Maid routes
router.get('/maid-reviews', authenticateToken, authorizeMaid, feedbackController.getMaidReviews);

// Admin routes - Basic
router.get('/all', authenticateToken, authorizeAdmin, feedbackController.getAllFeedback);
router.get('/stats', authenticateToken, authorizeAdmin, feedbackController.getFeedbackStats);
router.patch('/:feedbackId/admin-response', authenticateToken, authorizeAdmin, feedbackController.updateAdminResponse);

// Admin routes - Enhanced
router.patch('/:feedbackId/status', authenticateToken, authorizeAdmin, feedbackAdminController.changeFeedbackStatus);
router.patch('/:feedbackId/weight', authenticateToken, authorizeAdmin, feedbackAdminController.adjustFeedbackWeight);
router.get('/maid/:maidId/analytics', authenticateToken, authorizeAdmin, feedbackAdminController.getMaidFeedbackAnalytics);
router.get('/:feedbackId/audit-trail', authenticateToken, authorizeAdmin, feedbackAdminController.getFeedbackAuditTrail);
router.get('/maid/:maidId/recent', authenticateToken, authorizeAdmin, feedbackAdminController.getMaidRecentFeedback);
router.post('/maid/:maidId/recalculate', authenticateToken, authorizeAdmin, feedbackAdminController.recalculateMaidRating);
router.get('/disputed', authenticateToken, authorizeAdmin, feedbackAdminController.getDisputedFeedback);
router.post('/:feedbackId/impact', authenticateToken, authorizeAdmin, feedbackAdminController.calculateRatingImpact);
router.get('/maid/:maidId/performance-report', authenticateToken, authorizeAdmin, feedbackAdminController.getMaidPerformanceReport);
router.get('/admin/dashboard-stats', authenticateToken, authorizeAdmin, feedbackAdminController.getAdminDashboardStats);
router.post('/admin/batch-recalculate', authenticateToken, authorizeAdmin, feedbackAdminController.batchRecalculateRatings);
router.patch('/:feedbackId/note', authenticateToken, authorizeAdmin, feedbackAdminController.addFeedbackNote);
router.patch('/:feedbackId/verification', authenticateToken, authorizeAdmin, feedbackAdminController.toggleFeedbackVerification);
router.get('/admin/audit-summary', authenticateToken, authorizeAdmin, feedbackAdminController.getAuditSummary);

module.exports = router;

