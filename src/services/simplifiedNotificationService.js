const { getPrismaClient } = require('../utils/database');

/**
 * Simplified Notification Service
 * Production-ready, cost-effective notification system without BullMQ/Redis
 * Uses direct database operations + existing WebSocket infrastructure
 */

class SimplifiedNotificationService {
  constructor() {
    this.notificationStats = {
      totalSent: 0,
      totalFailed: 0,
      lastError: null,
      lastErrorTime: null
    };
    // Use single PrismaClient instance to prevent connection pool exhaustion
    this.prisma = null;
    this.wss = null; // WebSocket server instance
  }

  /**
   * Initialize with WebSocket server
   * @param {WebSocketServer} wss - WebSocket server instance
   */
  init(wss) {
    this.wss = wss;
    console.log('[SimplifiedNotification] WebSocket server initialized');
  }

  /**
   * Broadcast notification to specific user via WebSocket
   * @param {string} userId - User ID to send notification to
   * @param {object} notification - Notification object
   */
  broadcastToUser(userId, notification) {
    if (!this.wss) {
      console.warn('[SimplifiedNotification] WebSocket server not initialized, skipping broadcast');
      return;
    }

    try {
      const notificationData = {
        type: 'notification',
        notification: {
          id: notification.id || null, // Will be null before DB save
          userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data || {},
          read: false,
          delivered: true,
          createdAt: notification.timestamp || new Date().toISOString()
        }
      };

      let sentCount = 0;
      this.wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN && client.authenticated && client.user?.id === userId) {
          client.send(JSON.stringify(notificationData));
          sentCount++;
        }
      });

      if (sentCount > 0) {
        console.log(`[SimplifiedNotification] Broadcasted notification to user ${userId} (${sentCount} connection(s))`);
      }
    } catch (error) {
      console.error('[SimplifiedNotification] Failed to broadcast notification:', error.message);
    }
  }

  /**
   * Get Prisma client instance (singleton pattern)
   */
  getPrisma() {
    if (!this.prisma) {
      this.prisma = getPrismaClient();
    }
    return this.prisma;
  }

  /**
   * Send notification to a specific user
   * @param {string} userId - User ID
   * @param {object} notification - Notification object {type, title, message, data}
   */
  async sendToUser(userId, notification) {
    try {
      await this.saveNotificationToDatabase(userId, notification);
      // Broadcast via WebSocket after saving to database
      this.broadcastToUser(userId, notification);
      this.notificationStats.totalSent++;
      return { success: true };
    } catch (error) {
      this.notificationStats.totalFailed++;
      this.notificationStats.lastError = error.message;
      this.notificationStats.lastErrorTime = new Date();
      console.error(`[SimplifiedNotification] Failed to send to user ${userId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to all admins
   * @param {object} notification - Notification object
   */
  async sendToAdmins(notification) {
    try {
      const adminUsers = await this.getPrisma().user.findMany({
        where: { role: { in: ['ADMIN', 'SUPERVISOR'] } },
        select: { id: true, name: true }
      });

      for (const admin of adminUsers) {
        await this.saveNotificationToDatabase(admin.id, notification);
        // Broadcast to each admin
        this.broadcastToUser(admin.id, notification);
      }

      this.notificationStats.totalSent += adminUsers.length;
      console.log(`[SimplifiedNotification] Sent to ${adminUsers.length} admins`);
      return { success: true, count: adminUsers.length };
    } catch (error) {
      this.notificationStats.totalFailed++;
      this.notificationStats.lastError = error.message;
      this.notificationStats.lastErrorTime = new Date();
      console.error('[SimplifiedNotification] Failed to send to admins:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to all maids
   * @param {object} notification - Notification object
   */
  async sendToAllMaids(notification) {
    try {
      const maidUsers = await this.getPrisma().user.findMany({
        where: { role: { in: ['MAID', 'FLOATING_MAID'] } },
        select: { id: true }
      });

      for (const maid of maidUsers) {
        await this.saveNotificationToDatabase(maid.id, notification);
        // Broadcast to each maid
        this.broadcastToUser(maid.id, notification);
      }

      this.notificationStats.totalSent += maidUsers.length;
      console.log(`[SimplifiedNotification] Sent to ${maidUsers.length} maids`);
      return { success: true, count: maidUsers.length };
    } catch (error) {
      this.notificationStats.totalFailed++;
      this.notificationStats.lastError = error.message;
      this.notificationStats.lastErrorTime = new Date();
      console.error('[SimplifiedNotification] Failed to send to maids:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to specific maid
   * @param {string} maidId - Maid user ID
   * @param {object} notification - Notification object
   */
  async sendToMaid(maidId, notification) {
    try {
      await this.saveNotificationToDatabase(maidId, notification);
      // Broadcast via WebSocket
      this.broadcastToUser(maidId, notification);
      this.notificationStats.totalSent++;
      return { success: true };
    } catch (error) {
      this.notificationStats.totalFailed++;
      this.notificationStats.lastError = error.message;
      this.notificationStats.lastErrorTime = new Date();
      console.error(`[SimplifiedNotification] Failed to send to maid ${maidId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Broadcast to all customers
   * @param {object} notification - Notification object
   */
  async sendToAllCustomers(notification) {
    try {
      const customers = await this.getPrisma().user.findMany({
        where: { role: 'CUSTOMER' },
        select: { id: true }
      });

      for (const customer of customers) {
        await this.saveNotificationToDatabase(customer.id, notification);
        // Broadcast to each customer
        this.broadcastToUser(customer.id, notification);
      }

      this.notificationStats.totalSent += customers.length;
      console.log(`[SimplifiedNotification] Sent to ${customers.length} customers`);
      return { success: true, count: customers.length };
    } catch (error) {
      this.notificationStats.totalFailed++;
      this.notificationStats.lastError = error.message;
      this.notificationStats.lastErrorTime = new Date();
      console.error('[SimplifiedNotification] Failed to send to customers:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save notification to database with retry logic
   * @param {string} userId - User ID
   * @param {object} notification - Notification object
   * @param {number} retries - Number of retries
   */
  async saveNotificationToDatabase(userId, notification, retries = 3) {
    const maxRetries = retries;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        await this.getPrisma().notification.create({
          data: {
            userId,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data || {},
            read: false,
            delivered: false
          }
        });
        return;
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) {
          throw error;
        }
        // Exponential backoff: 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
      }
    }
  }

  /**
   * Get notification statistics
   */
  getStats() {
    return {
      ...this.notificationStats,
      successRate: this.notificationStats.totalSent > 0 
        ? ((this.notificationStats.totalSent - this.notificationStats.totalFailed) / this.notificationStats.totalSent * 100).toFixed(2)
        : 100
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.notificationStats = {
      totalSent: 0,
      totalFailed: 0,
      lastError: null,
      lastErrorTime: null
    };
  }

  // ===== Notification Type Methods =====

  async notifyBookingCreated(booking) {
    const notification = {
      type: 'BOOKING_CREATED',
      title: 'New Booking Created',
      message: `New booking for ${booking.service?.name || 'Service'}`,
      data: {
        bookingId: booking.id,
        customerId: booking.customerId,
        serviceName: booking.service?.name,
        scheduledAt: booking.scheduledAt,
        amount: booking.finalAmount
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await this.sendToUser(booking.customerId, {
      ...notification,
      title: 'Booking Confirmed',
      message: `Your booking for ${booking.service?.name || 'Service'} has been created successfully`
    });

    // Notify admins
    await this.sendToAdmins(notification);
  }

  async notifyMaidAssigned(booking) {
    const notification = {
      type: 'MAID_ASSIGNED',
      title: 'Maid Assigned',
      message: `${booking.maid?.name || 'A maid'} has been assigned to your booking`,
      data: {
        bookingId: booking.id,
        maidId: booking.maidId,
        maidName: booking.maid?.name,
        serviceName: booking.service?.name,
        scheduledAt: booking.scheduledAt
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await this.sendToUser(booking.customerId, notification);

    // Notify assigned maid
    if (booking.maidId) {
      await this.sendToMaid(booking.maidId, {
        ...notification,
        title: 'New Service Assignment',
        message: `You have been assigned to a new service: ${booking.service?.name || 'Service'}`
      });
    }

    // Notify admins
    await this.sendToAdmins({
      ...notification,
      title: 'Maid Assignment Completed',
      message: `${booking.maid?.name || 'Maid'} assigned to booking ${booking.id}`
    });
  }

  async notifyPaymentReceived(payment) {
    const notification = {
      type: 'PAYMENT_RECEIVED',
      title: 'Payment Received',
      message: `Payment of ₹${payment.finalAmount} received successfully`,
      data: {
        paymentId: payment.id,
        amount: payment.finalAmount,
        paymentMethod: payment.paymentMethod,
        bookingId: payment.bookingId,
        subscriptionId: payment.subscriptionId
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await this.sendToUser(payment.customerId, notification);

    // Notify admins
    await this.sendToAdmins({
      ...notification,
      title: 'Payment Confirmation',
      message: `Payment of ₹${payment.finalAmount} received from customer`
    });
  }

  async notifyPaymentFailed(payment) {
    const notification = {
      type: 'PAYMENT_FAILED',
      title: 'Payment Failed',
      message: `Payment of ₹${payment.finalAmount} failed. Please try again.`,
      data: {
        paymentId: payment.id,
        amount: payment.finalAmount,
        paymentMethod: payment.paymentMethod,
        bookingId: payment.bookingId
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await this.sendToUser(payment.customerId, notification);

    // Notify admins
    await this.sendToAdmins({
      ...notification,
      title: 'Payment Failure Alert',
      message: `Payment failure for customer ${payment.customerId}`
    });
  }

  async notifySubscriptionCreated(subscription) {
    const notification = {
      type: 'SUBSCRIPTION_CREATED',
      title: 'Subscription Activated',
      message: `Your ${subscription.plan?.name || 'Subscription'} subscription is now active`,
      data: {
        subscriptionId: subscription.id,
        planName: subscription.plan?.name,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        amount: subscription.amount
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await this.sendToUser(subscription.customer?.userId, notification);

    // Notify admins
    await this.sendToAdmins({
      ...notification,
      title: 'New Subscription',
      message: `New subscription created: ${subscription.plan?.name}`
    });
  }

  async notifySubscriptionCancelled(subscription, reason) {
    const notification = {
      type: 'SUBSCRIPTION_CANCELLED',
      title: 'Subscription Cancelled',
      message: `Your ${subscription.plan?.name || 'Subscription'} subscription has been cancelled`,
      data: {
        subscriptionId: subscription.id,
        planName: subscription.plan?.name,
        reason,
        cancelledAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await this.sendToUser(subscription.customer?.userId, notification);

    // Notify admins
    await this.sendToAdmins({
      ...notification,
      title: 'Subscription Cancellation',
      message: `Subscription cancelled: ${subscription.plan?.name} - ${reason}`
    });
  }

  async notifyAssignmentRequest(assignmentRequest) {
    const notification = {
      type: 'ASSIGNMENT_REQUEST',
      title: 'New Service Assignment Request',
      message: `You have a new service assignment request`,
      data: {
        assignmentRequestId: assignmentRequest.id,
        bookingId: assignmentRequest.bookingId,
        expiresAt: assignmentRequest.expiresAt
      },
      timestamp: new Date().toISOString()
    };

    // Notify maid
    await this.sendToMaid(assignmentRequest.maidId, notification);
  }

  async notifyAssignmentAccepted(assignmentRequest) {
    const notification = {
      type: 'ASSIGNMENT_ACCEPTED',
      title: 'Assignment Accepted',
      message: `Maid has accepted the service assignment`,
      data: {
        assignmentRequestId: assignmentRequest.id,
        bookingId: assignmentRequest.bookingId
      },
      timestamp: new Date().toISOString()
    };

    // Notify admins
    await this.sendToAdmins(notification);
  }

  async notifyAssignmentRejected(assignmentRequest) {
    const notification = {
      type: 'ASSIGNMENT_REJECTED',
      title: 'Assignment Rejected',
      message: `Maid has rejected the service assignment`,
      data: {
        assignmentRequestId: assignmentRequest.id,
        bookingId: assignmentRequest.bookingId
      },
      timestamp: new Date().toISOString()
    };

    // Notify admins
    await this.sendToAdmins(notification);
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    try {
      const result = await this.getPrisma().notification.updateMany({
        where: {
          id: notificationId,
          userId
        },
        data: {
          read: true,
          readAt: new Date()
        }
      });

      if (result.count === 0) {
        throw new Error('Notification not found or you do not have permission to update it');
      }

      return await this.getPrisma().notification.findUnique({
        where: { id: notificationId }
      });
    } catch (error) {
      console.error('[SimplifiedNotification] Failed to mark as read:', error.message);
      throw error;
    }
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId) {
    try {
      return await this.getPrisma().notification.updateMany({
        where: {
          userId,
          read: false
        },
        data: {
          read: true,
          readAt: new Date()
        }
      });
    } catch (error) {
      console.error('[SimplifiedNotification] Failed to mark all as read:', error.message);
      throw error;
    }
  }

  async notifyServiceCompleted(booking) {
    const notification = {
      type: 'SERVICE_COMPLETED',
      title: 'Service Completed',
      message: `Your ${booking.service?.name || 'Service'} service has been completed`,
      data: {
        bookingId: booking.id,
        maidId: booking.maidId,
        maidName: booking.maid?.name,
        serviceName: booking.service?.name,
        completedAt: booking.completedAt
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await this.sendToUser(booking.customerId, notification);

    // Notify admins
    await this.sendToAdmins({
      ...notification,
      title: 'Service Completion Notification',
      message: `Service completed by ${booking.maid?.name || 'Maid'} for booking ${booking.id}`
    });
  }

  async notifyBookingReminder(booking) {
    const notification = {
      type: 'BOOKING_REMINDER',
      title: 'Service Reminder',
      message: `Your ${booking.service?.name || 'Service'} service is scheduled for tomorrow`,
      data: {
        bookingId: booking.id,
        serviceName: booking.service?.name,
        scheduledAt: booking.scheduledAt,
        maidName: booking.maid?.name
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await this.sendToUser(booking.customerId, notification);

    // Notify assigned maid
    if (booking.maidId) {
      await this.sendToMaid(booking.maidId, {
        ...notification,
        title: 'Service Reminder',
        message: `You have a service scheduled for tomorrow: ${booking.service?.name || 'Service'}`
      });
    }
  }

  async notifyIssueReported(issue) {
    const notification = {
      type: 'ISSUE_REPORTED',
      title: 'Issue Reported',
      message: `Issue reported: ${issue.title}`,
      data: {
        issueId: issue.id,
        issueType: issue.type,
        issueTitle: issue.title,
        priority: issue.priority,
        bookingId: issue.bookingId,
        reportedBy: issue.reportedBy
      },
      timestamp: new Date().toISOString()
    };

    // Notify admins
    await this.sendToAdmins(notification);
  }

  async notifyUserRegistration(user) {
    const notification = {
      type: 'USER_REGISTERED',
      title: 'New User Registration',
      message: `New ${user.role.toLowerCase()} registered: ${user.name}`,
      data: {
        userId: user.id,
        userRole: user.role,
        userName: user.name,
        userEmail: user.email
      },
      timestamp: new Date().toISOString()
    };

    // Notify admins
    await this.sendToAdmins(notification);
  }
}

module.exports = new SimplifiedNotificationService();
