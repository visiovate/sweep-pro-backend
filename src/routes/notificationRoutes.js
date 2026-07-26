const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

// User notification routes
router.get('/', authenticateToken, notificationController.getNotifications);
router.get('/unread', authenticateToken, notificationController.getUnreadNotifications);
router.get('/unread/count', authenticateToken, notificationController.getUnreadCount);
router.get('/types', authenticateToken, notificationController.getNotificationTypes);

// Mark as read (bulk routes first to avoid :id matching)
router.patch('/read-multiple', authenticateToken, notificationController.markMultipleAsRead);
router.patch('/read-all', authenticateToken, notificationController.markAllAsRead);
router.patch('/:id/read', authenticateToken, notificationController.markAsRead);

// Delete notifications (bulk routes first to avoid :id matching)
router.delete('/bulk/delete', authenticateToken, notificationController.deleteMultipleNotifications);
router.delete('/bulk/clear-read', authenticateToken, notificationController.clearReadNotifications);
router.delete('/:id', authenticateToken, notificationController.deleteNotification);

// Admin routes
router.get('/admin/stats', authenticateToken, authorizeAdmin, notificationController.getNotificationStats);
router.get('/admin/health', authenticateToken, authorizeAdmin, notificationController.getConnectionHealth);
router.post('/admin/test', authenticateToken, authorizeAdmin, notificationController.sendTestNotification);
router.post('/admin/broadcast', authenticateToken, authorizeAdmin, notificationController.sendBroadcastNotification);
router.post('/admin/maintenance', authenticateToken, authorizeAdmin, notificationController.sendMaintenanceNotification);
router.post('/admin/emergency', authenticateToken, authorizeAdmin, notificationController.sendEmergencyAlert);

module.exports = router;
