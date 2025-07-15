const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Get user's notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, read, type } = req.query;
    
    const where = { userId };
    if (read !== undefined) where.read = read === 'true';
    if (type) where.type = type;

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit)
    });

    const totalCount = await prisma.notification.count({ where });
    const unreadCount = await prisma.notification.count({
      where: { userId, read: false }
    });

    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / parseInt(limit))
      },
      unreadCount
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get unread notifications
router.get('/unread', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await notificationService.getUnreadNotifications(userId);
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching unread notifications:', error);
    res.status(500).json({ error: 'Failed to fetch unread notifications' });
  }
});

// Mark notification as read
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const notification = await notificationService.markAsRead(id, userId);
    res.json(notification);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.patch('/read-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    await notificationService.markAllAsRead(userId);
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    await prisma.notification.delete({
      where: { id, userId }
    });
    
    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Get notification statistics (Admin only)
router.get('/stats', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { timeframe = '7d' } = req.query;
    
    let startDate;
    switch (timeframe) {
      case '24h':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    const [
      totalNotifications,
      sentNotifications,
      readNotifications,
      unreadNotifications,
      notificationsByType
    ] = await Promise.all([
      prisma.notification.count(),
      prisma.notification.count({
        where: { createdAt: { gte: startDate } }
      }),
      prisma.notification.count({
        where: { read: true, createdAt: { gte: startDate } }
      }),
      prisma.notification.count({
        where: { read: false, createdAt: { gte: startDate } }
      }),
      prisma.notification.groupBy({
        by: ['type'],
        where: { createdAt: { gte: startDate } },
        _count: { type: true }
      })
    ]);

    res.json({
      totalNotifications,
      sentNotifications,
      readNotifications,
      unreadNotifications,
      readRate: sentNotifications > 0 ? (readNotifications / sentNotifications * 100).toFixed(2) : 0,
      notificationsByType: notificationsByType.map(item => ({
        type: item.type,
        count: item._count.type
      })),
      connections: notificationService.getConnectionStats(),
      timeframe
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({ error: 'Failed to fetch notification statistics' });
  }
});

// Send test notification (Admin only)
router.post('/test', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { userId, type = 'SYSTEM_ALERT', title, message, data = {} } = req.body;
    
    if (!userId || !title || !message) {
      return res.status(400).json({ error: 'Missing required fields: userId, title, message' });
    }

    const notification = {
      type,
      title,
      message,
      data,
      timestamp: new Date().toISOString()
    };

    await notificationService.sendToUser(userId, notification);
    res.json({ message: 'Test notification sent successfully' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Send broadcast notification (Admin only)
router.post('/broadcast', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { type = 'SYSTEM_ALERT', title, message, data = {} } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'Missing required fields: title, message' });
    }

    const notification = {
      type,
      title,
      message,
      data,
      timestamp: new Date().toISOString()
    };

    await notificationService.broadcast(notification);
    res.json({ message: 'Broadcast notification sent successfully' });
  } catch (error) {
    console.error('Error sending broadcast notification:', error);
    res.status(500).json({ error: 'Failed to send broadcast notification' });
  }
});

// Send system maintenance notification (Admin only)
router.post('/maintenance', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { startTime, endTime, description } = req.body;
    
    if (!startTime || !endTime || !description) {
      return res.status(400).json({ error: 'Missing required fields: startTime, endTime, description' });
    }

    await notificationService.notifySystemMaintenance({ startTime, endTime, description });
    res.json({ message: 'System maintenance notification sent successfully' });
  } catch (error) {
    console.error('Error sending maintenance notification:', error);
    res.status(500).json({ error: 'Failed to send maintenance notification' });
  }
});

// Send emergency alert (Admin only)
router.post('/emergency', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { alertType, message, priority = 'HIGH' } = req.body;
    
    if (!alertType || !message) {
      return res.status(400).json({ error: 'Missing required fields: alertType, message' });
    }

    await notificationService.notifyEmergencyAlert(alertType, message, priority);
    res.json({ message: 'Emergency alert sent successfully' });
  } catch (error) {
    console.error('Error sending emergency alert:', error);
    res.status(500).json({ error: 'Failed to send emergency alert' });
  }
});

// Get WebSocket connection health (Admin only)
router.get('/health', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const healthStatus = await notificationService.healthCheck();
    res.json(healthStatus);
  } catch (error) {
    console.error('Error checking notification health:', error);
    res.status(500).json({ error: 'Failed to check notification health' });
  }
});

// Get notification types and their descriptions
router.get('/types', authenticateToken, (req, res) => {
  const notificationTypes = [
    { type: 'USER_REGISTERED', description: 'User registration notification' },
    { type: 'BOOKING_CREATED', description: 'New booking created' },
    { type: 'BOOKING_CONFIRMED', description: 'Booking confirmed' },
    { type: 'MAID_ASSIGNED', description: 'Maid assigned to booking' },
    { type: 'MAID_ARRIVED', description: 'Maid arrived at location' },
    { type: 'SERVICE_STARTED', description: 'Service started' },
    { type: 'SERVICE_COMPLETED', description: 'Service completed' },
    { type: 'PAYMENT_RECEIVED', description: 'Payment received successfully' },
    { type: 'PAYMENT_FAILED', description: 'Payment failed' },
    { type: 'PAYMENT_REMINDER', description: 'Payment reminder' },
    { type: 'REFUND_PROCESSED', description: 'Refund processed' },
    { type: 'SUBSCRIPTION_CREATED', description: 'New subscription created' },
    { type: 'SUBSCRIPTION_EXPIRING', description: 'Subscription expiring soon' },
    { type: 'SUBSCRIPTION_RENEWED', description: 'Subscription renewed' },
    { type: 'SUBSCRIPTION_CANCELLED', description: 'Subscription cancelled' },
    { type: 'BOOKING_CANCELLED', description: 'Booking cancelled' },
    { type: 'BOOKING_RESCHEDULED', description: 'Booking rescheduled' },
    { type: 'BOOKING_REMINDER', description: 'Booking reminder' },
    { type: 'ISSUE_REPORTED', description: 'Issue reported' },
    { type: 'ISSUE_RESOLVED', description: 'Issue resolved' },
    { type: 'FEEDBACK_RECEIVED', description: 'Feedback received' },
    { type: 'PROFILE_UPDATED', description: 'Profile updated' },
    { type: 'USER_STATUS_CHANGED', description: 'User status changed' },
    { type: 'MAID_STATUS_CHANGED', description: 'Maid status changed' },
    { type: 'DOCUMENT_VERIFIED', description: 'Document verified' },
    { type: 'PERFORMANCE_ALERT', description: 'Performance alert' },
    { type: 'ATTENDANCE_ALERT', description: 'Attendance alert' },
    { type: 'SHIFT_REMINDER', description: 'Shift reminder' },
    { type: 'SYSTEM_MAINTENANCE', description: 'System maintenance' },
    { type: 'EMERGENCY_ALERT', description: 'Emergency alert' },
    { type: 'NEW_SERVICE_AVAILABLE', description: 'New service available' },
    { type: 'PROMOTIONAL_OFFER', description: 'Promotional offer' },
    { type: 'SYSTEM_ALERT', description: 'System alert' }
  ];

  res.json(notificationTypes);
});

module.exports = router;
