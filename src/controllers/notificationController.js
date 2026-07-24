const { getPrismaClient } = require('../utils/database');
const notificationService = require('../services/simplifiedNotificationService');
const notificationErrorHandler = require('../utils/notificationErrorHandler');

/**
 * Enhanced Notification Controller
 * Handles all notification-related operations for Customer, Admin, and Maid roles
 */

// Get user's notifications with advanced filtering
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      limit = 20, 
      read, 
      type, 
      priority,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const where = { userId };
    
    // Apply filters
    if (read !== undefined) where.read = read === 'true';
    if (type) where.type = type;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const notifications = await getPrismaClient().notification.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit)
    });

    const totalCount = await getPrismaClient().notification.count({ where });
    const unreadCount = await getPrismaClient().notification.count({
      where: { userId, read: false }
    });

    res.json({
      success: true,
      data: notifications,
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
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch notifications' 
    });
  }
};

// Get unread notifications count
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const unreadCount = await getPrismaClient().notification.count({
      where: { userId, read: false }
    });

    res.json({
      success: true,
      unreadCount
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch unread count' 
    });
  }
};

// Get unread notifications
const getUnreadNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await notificationService.getUnreadNotifications(userId);
    
    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Error fetching unread notifications:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch unread notifications' 
    });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const notification = await notificationService.markAsRead(id, userId);
    
    res.json({
      success: true,
      data: notification,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to mark notification as read' 
    });
  }
};

// Mark multiple notifications as read
const markMultipleAsRead = async (req, res) => {
  try {
    const { notificationIds } = req.body;
    const userId = req.user.id;
    
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'notificationIds must be a non-empty array' 
      });
    }

    await getPrismaClient().notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId
      },
      data: {
        read: true,
        readAt: new Date()
      }
    });
    
    res.json({
      success: true,
      message: `${notificationIds.length} notifications marked as read`
    });
  } catch (error) {
    console.error('Error marking multiple notifications as read:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to mark notifications as read' 
    });
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await notificationService.markAllAsRead(userId);
    
    res.json({
      success: true,
      message: 'All notifications marked as read',
      count: result.count
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to mark all notifications as read' 
    });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    await getPrismaClient().notification.delete({
      where: { id, userId }
    });
    
    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete notification' 
    });
  }
};

// Delete multiple notifications
const deleteMultipleNotifications = async (req, res) => {
  try {
    const { notificationIds } = req.body;
    const userId = req.user.id;
    
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'notificationIds must be a non-empty array' 
      });
    }

    const result = await getPrismaClient().notification.deleteMany({
      where: {
        id: { in: notificationIds },
        userId
      }
    });
    
    res.json({
      success: true,
      message: `${result.count} notifications deleted successfully`,
      count: result.count
    });
  } catch (error) {
    console.error('Error deleting multiple notifications:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete notifications' 
    });
  }
};

// Clear all read notifications
const clearReadNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await getPrismaClient().notification.deleteMany({
      where: {
        userId,
        read: true
      }
    });
    
    res.json({
      success: true,
      message: `${result.count} read notifications cleared`,
      count: result.count
    });
  } catch (error) {
    console.error('Error clearing read notifications:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to clear read notifications' 
    });
  }
};

// Get notification statistics (Admin only)
const getNotificationStats = async (req, res) => {
  try {
    const { timeframe = '7d', userRole } = req.query;
    
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

    // Build user filter if role specified
    const userFilter = userRole ? {
      user: { role: userRole }
    } : {};

    const [
      totalNotifications,
      sentNotifications,
      readNotifications,
      unreadNotifications,
      deliveredNotifications,
      notificationsByType,
      notificationsByUser
    ] = await Promise.all([
      getPrismaClient().notification.count(),
      getPrismaClient().notification.count({
        where: { 
          createdAt: { gte: startDate },
          ...userFilter
        }
      }),
      getPrismaClient().notification.count({
        where: {
          read: true,
          createdAt: { gte: startDate },
          ...userFilter
        }
      }),
      getPrismaClient().notification.count({
        where: {
          read: false,
          createdAt: { gte: startDate },
          ...userFilter
        }
      }),
      getPrismaClient().notification.count({
        where: {
          delivered: true,
          createdAt: { gte: startDate },
          ...userFilter
        }
      }),
      getPrismaClient().notification.groupBy({
        by: ['type'],
        where: {
          createdAt: { gte: startDate },
          ...userFilter
        },
        _count: { type: true }
      }),
      getPrismaClient().notification.groupBy({
        by: ['userId'],
        where: { 
          createdAt: { gte: startDate }
        },
        _count: { userId: true },
        orderBy: {
          _count: {
            userId: 'desc'
          }
        },
        take: 10
      })
    ]);

    res.json({
      success: true,
      data: {
        totalNotifications,
        sentNotifications,
        readNotifications,
        unreadNotifications,
        deliveredNotifications,
        readRate: sentNotifications > 0 ? ((readNotifications / sentNotifications) * 100).toFixed(2) : 0,
        deliveryRate: sentNotifications > 0 ? ((deliveredNotifications / sentNotifications) * 100).toFixed(2) : 0,
        notificationsByType: notificationsByType.map(item => ({
          type: item.type,
          count: item._count.type
        })),
        topUsers: notificationsByUser.map(item => ({
          userId: item.userId,
          count: item._count.userId
        })),
        connections: notificationService.getConnectionStats(),
        timeframe
      }
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch notification statistics' 
    });
  }
};

// Send test notification (Admin only)
const sendTestNotification = async (req, res) => {
  try {
    const { userId, type = 'SYSTEM_ALERT', title, message, data = {} } = req.body;
    
    if (!userId || !title || !message) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: userId, title, message' 
      });
    }

    const notification = {
      type,
      title,
      message,
      data,
      timestamp: new Date().toISOString()
    };

    await notificationErrorHandler.withErrorHandling(
      async () => await notificationService.sendToUser(userId, notification),
      { action: 'sendTestNotification', userId }
    );
    
    res.json({
      success: true,
      message: 'Test notification sent successfully'
    });
  } catch (error) {
    notificationErrorHandler.logError(error, { action: 'sendTestNotification' });
    res.status(500).json({ 
      success: false,
      error: 'Failed to send test notification' 
    });
  }
};

// Send broadcast notification (Admin only)
const sendBroadcastNotification = async (req, res) => {
  try {
    const { type = 'SYSTEM_ALERT', title, message, data = {}, targetRole } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: title, message' 
      });
    }

    const notification = {
      type,
      title,
      message,
      data,
      timestamp: new Date().toISOString()
    };

    if (targetRole) {
      // Send to specific role
      if (targetRole === 'ADMIN' || targetRole === 'SUPERVISOR') {
        await notificationErrorHandler.withErrorHandling(
          async () => await notificationService.sendToAdmins(notification),
          { action: 'sendBroadcastNotification', targetRole }
        );
      } else if (targetRole === 'MAID' || targetRole === 'FLOATING_MAID') {
        await notificationErrorHandler.withErrorHandling(
          async () => await notificationService.sendToAllMaids(notification),
          { action: 'sendBroadcastNotification', targetRole }
        );
      } else if (targetRole === 'CUSTOMER') {
        await notificationErrorHandler.withErrorHandling(
          async () => await notificationService.sendToAllCustomers(notification),
          { action: 'sendBroadcastNotification', targetRole }
        );
      }
    } else {
      // Broadcast to all (send to admins, maids, and customers)
      await notificationErrorHandler.withErrorHandling(
        async () => {
          await notificationService.sendToAdmins(notification);
          await notificationService.sendToAllMaids(notification);
          await notificationService.sendToAllCustomers(notification);
        },
        { action: 'sendBroadcastNotification', targetRole: 'ALL' }
      );
    }
    
    res.json({
      success: true,
      message: 'Broadcast notification sent successfully'
    });
  } catch (error) {
    notificationErrorHandler.logError(error, { action: 'sendBroadcastNotification' });
    res.status(500).json({ 
      success: false,
      error: 'Failed to send broadcast notification' 
    });
  }
};

// Send system maintenance notification (Admin only)
const sendMaintenanceNotification = async (req, res) => {
  try {
    const { startTime, endTime, description } = req.body;
    
    if (!startTime || !endTime || !description) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: startTime, endTime, description' 
      });
    }

    await notificationService.notifySystemMaintenance({ startTime, endTime, description });
    
    res.json({
      success: true,
      message: 'System maintenance notification sent successfully'
    });
  } catch (error) {
    console.error('Error sending maintenance notification:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to send maintenance notification' 
    });
  }
};

// Send emergency alert (Admin only)
const sendEmergencyAlert = async (req, res) => {
  try {
    const { alertType, message, priority = 'HIGH' } = req.body;
    
    if (!alertType || !message) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: alertType, message' 
      });
    }

    await notificationService.notifyEmergencyAlert(alertType, message, priority);
    
    res.json({
      success: true,
      message: 'Emergency alert sent successfully'
    });
  } catch (error) {
    console.error('Error sending emergency alert:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to send emergency alert' 
    });
  }
};

// Get WebSocket connection health (Admin only)
const getConnectionHealth = async (req, res) => {
  try {
    const healthStatus = {
      service: 'simplified',
      stats: notificationService.getStats(),
      errorStats: notificationErrorHandler.getErrorStats(),
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: healthStatus
    });
  } catch (error) {
    notificationErrorHandler.logError(error, { action: 'getConnectionHealth' });
    res.status(500).json({ 
      success: false,
      error: 'Failed to check notification health' 
    });
  }
};

// Get notification types and their descriptions
const getNotificationTypes = (req, res) => {
  const notificationTypes = [
    // User & Authentication
    { type: 'USER_REGISTERED', description: 'User registration notification', roles: ['ADMIN'] },
    { type: 'PROFILE_UPDATED', description: 'Profile updated', roles: ['ALL'] },
    { type: 'USER_STATUS_CHANGED', description: 'User status changed', roles: ['ALL'] },
    
    // Booking Lifecycle
    { type: 'BOOKING_CREATED', description: 'New booking created', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'BOOKING_CONFIRMED', description: 'Booking confirmed', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'MAID_ASSIGNED', description: 'Maid assigned to booking', roles: ['CUSTOMER', 'MAID', 'ADMIN'] },
    { type: 'SERVICE_ASSIGNED', description: 'Service assigned to maid', roles: ['MAID', 'ADMIN'] },
    { type: 'ASSIGNMENT_REQUEST', description: 'Assignment request sent to maid', roles: ['MAID', 'ADMIN'] },
    { type: 'ASSIGNMENT_ACCEPTED', description: 'Maid accepted assignment', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'ASSIGNMENT_REJECTED', description: 'Maid rejected assignment', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'MAID_ARRIVED', description: 'Maid arrived at location', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'SERVICE_STARTED', description: 'Service started', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'SERVICE_COMPLETED', description: 'Service completed', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'BOOKING_CANCELLED', description: 'Booking cancelled', roles: ['CUSTOMER', 'MAID', 'ADMIN'] },
    { type: 'SERVICE_CANCELLED', description: 'Service cancelled', roles: ['MAID', 'ADMIN'] },
    { type: 'BOOKING_RESCHEDULED', description: 'Booking rescheduled', roles: ['CUSTOMER', 'MAID', 'ADMIN'] },
    { type: 'BOOKING_REMINDER', description: 'Booking reminder', roles: ['CUSTOMER', 'MAID'] },
    { type: 'BOOKING_STATUS_CHANGED', description: 'Booking status updated', roles: ['CUSTOMER', 'MAID', 'ADMIN'] },
    { type: 'MAID_RUNNING_LATE', description: 'Maid running late', roles: ['CUSTOMER', 'ADMIN'] },
    
    // Payment
    { type: 'PAYMENT_RECEIVED', description: 'Payment received successfully', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'PAYMENT_SUCCESS', description: 'Payment successful', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'PAYMENT_FAILED', description: 'Payment failed', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'PAYMENT_REMINDER', description: 'Payment reminder', roles: ['CUSTOMER'] },
    { type: 'REFUND_PROCESSED', description: 'Refund processed', roles: ['CUSTOMER', 'ADMIN'] },
    
    // Subscription
    { type: 'SUBSCRIPTION_CREATED', description: 'New subscription created', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'SUBSCRIPTION_EXPIRING', description: 'Subscription expiring soon', roles: ['CUSTOMER'] },
    { type: 'SUBSCRIPTION_RENEWED', description: 'Subscription renewed', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'SUBSCRIPTION_CANCELLED', description: 'Subscription cancelled', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'SUBSCRIPTION_EXPIRED', description: 'Subscription expired', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'SUBSCRIPTION_PAUSED', description: 'Subscription paused', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'SUBSCRIPTION_RESUMED', description: 'Subscription resumed', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'MONTHLY_CYCLE_STARTED', description: 'Monthly cycle started', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'MONTHLY_CYCLE_COMPLETED', description: 'Monthly cycle completed', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'CYCLE_COMPLETED', description: 'Subscription cycle completed', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'MONTHLY_SERVICES_SCHEDULED', description: 'Monthly services scheduled', roles: ['CUSTOMER'] },
    
    // Buffer Period
    { type: 'BUFFER_REQUEST', description: 'Buffer period requested', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'BUFFER_APPROVED', description: 'Buffer period approved', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'BUFFER_REJECTED', description: 'Buffer period rejected', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'BUFFER_STARTED', description: 'Buffer period started', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'BUFFER_ENDED', description: 'Buffer period ended', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'BUFFER_PERIOD_STARTED', description: 'Service buffer period started', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'BUFFER_PERIOD_ENDED', description: 'Service buffer period ended', roles: ['CUSTOMER', 'ADMIN'] },
    { type: 'BUFFER_PERIOD_APPROACHING', description: 'Buffer period approaching', roles: ['CUSTOMER'] },
    { type: 'BUFFER_PERIOD_ENDING', description: 'Buffer period ending soon', roles: ['CUSTOMER'] },
    
    // Issues & Feedback
    { type: 'ISSUE_REPORTED', description: 'Issue reported', roles: ['MAID', 'ADMIN'] },
    { type: 'ISSUE_RESOLVED', description: 'Issue resolved', roles: ['CUSTOMER', 'MAID', 'ADMIN'] },
    { type: 'FEEDBACK_RECEIVED', description: 'Feedback received', roles: ['MAID', 'ADMIN'] },
    { type: 'FEEDBACK_REQUEST', description: 'Feedback request', roles: ['CUSTOMER'] },
    
    // Maid Specific
    { type: 'MAID_STATUS_CHANGED', description: 'Maid status changed', roles: ['MAID', 'ADMIN'] },
    { type: 'DOCUMENT_VERIFIED', description: 'Document verified', roles: ['MAID'] },
    { type: 'PERFORMANCE_ALERT', description: 'Performance alert', roles: ['MAID', 'ADMIN'] },
    { type: 'ATTENDANCE_ALERT', description: 'Attendance alert', roles: ['MAID', 'ADMIN'] },
    { type: 'SHIFT_REMINDER', description: 'Shift reminder', roles: ['MAID'] },
    
    // System
    { type: 'SYSTEM_MAINTENANCE', description: 'System maintenance', roles: ['ALL'] },
    { type: 'EMERGENCY_ALERT', description: 'Emergency alert', roles: ['ALL'] },
    { type: 'SYSTEM_ALERT', description: 'System alert', roles: ['ALL'] },
    { type: 'NEW_SERVICE_AVAILABLE', description: 'New service available', roles: ['CUSTOMER'] },
    { type: 'PROMOTIONAL_OFFER', description: 'Promotional offer', roles: ['CUSTOMER'] },
    { type: 'PROMOTION', description: 'Promotion', roles: ['CUSTOMER'] }
  ];

  res.json({
    success: true,
    data: notificationTypes
  });
};

module.exports = {
  getNotifications,
  getUnreadCount,
  getUnreadNotifications,
  markAsRead,
  markMultipleAsRead,
  markAllAsRead,
  deleteNotification,
  deleteMultipleNotifications,
  clearReadNotifications,
  getNotificationStats,
  sendTestNotification,
  sendBroadcastNotification,
  sendMaintenanceNotification,
  sendEmergencyAlert,
  getConnectionHealth,
  getNotificationTypes
};
