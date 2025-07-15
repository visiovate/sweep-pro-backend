const { PrismaClient } = require('@prisma/client');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');

const prisma = new PrismaClient();

class NotificationService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // userId -> WebSocket connection
    this.adminClients = new Set(); // Set of admin WebSocket connections
    this.maidClients = new Map(); // maidId -> WebSocket connection
    this.customerClients = new Map(); // customerId -> WebSocket connection
    this.supervisorClients = new Set(); // Set of supervisor WebSocket connections
    this.connectionStats = {
      totalConnections: 0,
      activeConnections: 0,
      adminConnections: 0,
      maidConnections: 0,
      customerConnections: 0
    };
    this.initializeScheduledJobs();
  }

  init(wss) {
    this.wss = wss;
    this.setupWebSocketHandlers();
  }

  setupWebSocketHandlers() {
    if (!this.wss) return;

    this.wss.on('connection', (ws, req) => {
      console.log('New WebSocket connection');

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          
          if (data.type === 'auth') {
            await this.authenticateClient(ws, data.token);
          } else if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });

      ws.on('close', () => {
        this.removeClientFromMaps(ws);
        console.log('Client disconnected');
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.removeClientFromMaps(ws);
      });
    });
  }

  async authenticateClient(ws, token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId || decoded.id },
        include: {
          maidProfile: true,
          adminProfile: true
        }
      });

      if (!user) {
        ws.close(1008, 'Invalid token');
        return;
      }

      // Store client connection
      ws.userId = user.id;
      ws.userRole = user.role;
      ws.userName = user.name;
      ws.lastActivity = new Date();
      this.clients.set(user.id, ws);

      // Add to role-specific maps
      if (user.role === 'ADMIN') {
        this.adminClients.add(ws);
        this.connectionStats.adminConnections++;
      } else if (user.role === 'SUPERVISOR') {
        this.supervisorClients.add(ws);
        this.connectionStats.adminConnections++;
      } else if (user.role === 'MAID' || user.role === 'FLOATING_MAID') {
        this.maidClients.set(user.id, ws);
        this.connectionStats.maidConnections++;
      } else if (user.role === 'CUSTOMER') {
        this.customerClients.set(user.id, ws);
        this.connectionStats.customerConnections++;
      }

      this.connectionStats.activeConnections++;
      this.connectionStats.totalConnections++;

      // Send authentication success
      ws.send(JSON.stringify({
        type: 'auth_success',
        user: {
          id: user.id,
          name: user.name,
          role: user.role
        }
      }));

      console.log(`User ${user.name} (${user.role}) authenticated`);
    } catch (error) {
      console.error('Authentication error:', error);
      ws.close(1008, 'Authentication failed');
    }
  }

  removeClientFromMaps(ws) {
    if (ws.userId) {
      this.clients.delete(ws.userId);
      this.adminClients.delete(ws);
      this.supervisorClients.delete(ws);
      this.maidClients.delete(ws.userId);
      this.customerClients.delete(ws.userId);
      
      // Update connection stats
      this.connectionStats.activeConnections--;
      if (ws.userRole === 'ADMIN' || ws.userRole === 'SUPERVISOR') {
        this.connectionStats.adminConnections--;
      } else if (ws.userRole === 'MAID' || ws.userRole === 'FLOATING_MAID') {
        this.connectionStats.maidConnections--;
      } else if (ws.userRole === 'CUSTOMER') {
        this.connectionStats.customerConnections--;
      }
    }
  }

  // Send notification to specific user
  async sendToUser(userId, notification) {
    const client = this.clients.get(userId);
    if (client && client.readyState === client.OPEN) {
      client.send(JSON.stringify(notification));
    }
    
    // Also save to database for offline users
    await this.saveNotificationToDatabase(userId, notification);
  }

  // Send notification to all admins
  async sendToAdmins(notification) {
    this.adminClients.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(notification));
      }
    });

    // Save to admin users in database
    const adminUsers = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPERVISOR'] } },
      select: { id: true }
    });

    for (const admin of adminUsers) {
      await this.saveNotificationToDatabase(admin.id, notification);
    }
  }

  // Send notification to specific maid
  async sendToMaid(maidId, notification) {
    const client = this.maidClients.get(maidId);
    if (client && client.readyState === client.OPEN) {
      client.send(JSON.stringify(notification));
    }
    
    await this.saveNotificationToDatabase(maidId, notification);
  }

  // Send notification to all maids
  async sendToAllMaids(notification) {
    this.maidClients.forEach((client, maidId) => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(notification));
      }
    });

    // Save to all maid users in database
    const maidUsers = await prisma.user.findMany({
      where: { role: { in: ['MAID', 'FLOATING_MAID'] } },
      select: { id: true }
    });

    for (const maid of maidUsers) {
      await this.saveNotificationToDatabase(maid.id, notification);
    }
  }

  // Broadcast to all connected clients
  async broadcast(notification) {
    this.clients.forEach((client, userId) => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(notification));
      }
    });
  }

  // Save notification to database
  async saveNotificationToDatabase(userId, notification) {
    try {
      await prisma.notification.create({
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
    } catch (error) {
      console.error('Error saving notification to database:', error);
    }
  }

  // Get unread notifications for a user
  async getUnreadNotifications(userId) {
    return await prisma.notification.findMany({
      where: {
        userId,
        read: false
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    return await prisma.notification.update({
      where: {
        id: notificationId,
        userId
      },
      data: {
        read: true,
        readAt: new Date()
      }
    });
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId) {
    return await prisma.notification.updateMany({
      where: {
        userId,
        read: false
      },
      data: {
        read: true,
        readAt: new Date()
      }
    });
  }

  // Notification types and methods
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

    await this.sendToAdmins(notification);
  }

  async notifyBookingCreated(booking) {
    const notification = {
      type: 'BOOKING_CREATED',
      title: 'New Booking Created',
      message: `New booking for ${booking.service.name}`,
      data: {
        bookingId: booking.id,
        customerId: booking.customerId,
        customerName: booking.customer.name,
        serviceName: booking.service.name,
        scheduledAt: booking.scheduledAt,
        amount: booking.finalAmount
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await this.sendToUser(booking.customerId, {
      ...notification,
      title: 'Booking Confirmed',
      message: `Your booking for ${booking.service.name} has been created successfully`
    });

    // Notify admins
    await this.sendToAdmins(notification);
  }

  async notifyMaidAssigned(booking) {
    const notification = {
      type: 'MAID_ASSIGNED',
      title: 'Maid Assigned',
      message: `${booking.maid.name} has been assigned to your booking`,
      data: {
        bookingId: booking.id,
        maidId: booking.maidId,
        maidName: booking.maid.name,
        serviceName: booking.service.name,
        scheduledAt: booking.scheduledAt,
        customerAddress: booking.serviceAddress
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await this.sendToUser(booking.customerId, notification);

    // Notify assigned maid
    await this.sendToMaid(booking.maidId, {
      ...notification,
      title: 'New Service Assignment',
      message: `You have been assigned to a new service: ${booking.service.name}`
    });

    // Notify admins
    await this.sendToAdmins({
      ...notification,
      title: 'Maid Assignment Completed',
      message: `${booking.maid.name} assigned to booking ${booking.id}`
    });
  }

  async notifyServiceCompleted(booking) {
    const notification = {
      type: 'SERVICE_COMPLETED',
      title: 'Service Completed',
      message: `Your ${booking.service.name} service has been completed`,
      data: {
        bookingId: booking.id,
        maidId: booking.maidId,
        maidName: booking.maid.name,
        serviceName: booking.service.name,
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
      message: `Service completed by ${booking.maid.name} for booking ${booking.id}`
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
      message: `Your ${subscription.plan.name} subscription is now active`,
      data: {
        subscriptionId: subscription.id,
        planName: subscription.plan.name,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        amount: subscription.amount
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await this.sendToUser(subscription.customer.userId, notification);

    // Notify admins
    await this.sendToAdmins({
      ...notification,
      title: 'New Subscription',
      message: `New subscription created: ${subscription.plan.name}`
    });
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

    // If issue involves a maid, notify them
    if (issue.booking && issue.booking.maidId) {
      await this.sendToMaid(issue.booking.maidId, {
        ...notification,
        title: 'Issue Reported for Your Service',
        message: `An issue has been reported for your recent service`
      });
    }
  }

  async notifyMaidStatusChange(maid, newStatus) {
    const notification = {
      type: 'MAID_STATUS_CHANGED',
      title: 'Status Updated',
      message: `Your status has been updated to ${newStatus}`,
      data: {
        maidId: maid.id,
        newStatus,
        updatedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    // Notify maid
    await this.sendToMaid(maid.userId, notification);

    // Notify admins
    await this.sendToAdmins({
      ...notification,
      title: 'Maid Status Update',
      message: `${maid.user.name} status changed to ${newStatus}`
    });
  }

  async notifyBookingReminder(booking) {
    const notification = {
      type: 'BOOKING_REMINDER',
      title: 'Service Reminder',
      message: `Your ${booking.service.name} service is scheduled for tomorrow`,
      data: {
        bookingId: booking.id,
        serviceName: booking.service.name,
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
        message: `You have a service scheduled for tomorrow: ${booking.service.name}`
      });
    }
  }

  async notifyFeedbackReceived(feedback) {
    const notification = {
      type: 'FEEDBACK_RECEIVED',
      title: 'Feedback Received',
      message: `New feedback received with ${feedback.overallRating} star rating`,
      data: {
        feedbackId: feedback.id,
        bookingId: feedback.bookingId,
        rating: feedback.overallRating,
        comment: feedback.comment
      },
      timestamp: new Date().toISOString()
    };

    // Notify admins
    await this.sendToAdmins(notification);

    // Notify maid if booking has assigned maid
    if (feedback.booking && feedback.booking.maidId) {
      await this.sendToMaid(feedback.booking.maidId, {
        ...notification,
        title: 'New Feedback',
        message: `You received ${feedback.overallRating} star rating for your service`
      });
    }
  }

  // Additional comprehensive notification methods
  async notifyUserProfileUpdate(user) {
    const notification = {
      type: 'PROFILE_UPDATED',
      title: 'Profile Updated',
      message: 'Your profile has been updated successfully',
      data: {
        userId: user.id,
        userName: user.name,
        updatedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(user.id, notification);
  }

  async notifyUserStatusChange(user, newStatus, changedBy) {
    const notification = {
      type: 'USER_STATUS_CHANGED',
      title: 'Account Status Updated',
      message: `Your account status has been updated to ${newStatus}`,
      data: {
        userId: user.id,
        newStatus,
        changedBy,
        updatedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(user.id, notification);
    await this.sendToAdmins({
      ...notification,
      title: 'User Status Change',
      message: `User ${user.name} status changed to ${newStatus}`
    });
  }

  async notifyBookingStatusChange(booking, newStatus) {
    const notification = {
      type: 'BOOKING_STATUS_CHANGED',
      title: 'Booking Status Updated',
      message: `Your booking status has been updated to ${newStatus}`,
      data: {
        bookingId: booking.id,
        newStatus,
        serviceName: booking.service.name,
        scheduledAt: booking.scheduledAt
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(booking.customerId, notification);
    
    if (booking.maidId) {
      await this.sendToMaid(booking.maidId, {
        ...notification,
        title: 'Service Status Updated',
        message: `Service status updated to ${newStatus}`
      });
    }

    await this.sendToAdmins({
      ...notification,
      title: 'Booking Status Change',
      message: `Booking ${booking.id} status changed to ${newStatus}`
    });
  }

  async notifyBookingCancellation(booking, reason) {
    const notification = {
      type: 'BOOKING_CANCELLED',
      title: 'Booking Cancelled',
      message: `Your booking for ${booking.service.name} has been cancelled`,
      data: {
        bookingId: booking.id,
        serviceName: booking.service.name,
        reason,
        scheduledAt: booking.scheduledAt,
        cancelledAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(booking.customerId, notification);
    
    if (booking.maidId) {
      await this.sendToMaid(booking.maidId, {
        ...notification,
        title: 'Service Cancelled',
        message: `Service assignment cancelled for ${booking.service.name}`
      });
    }

    await this.sendToAdmins({
      ...notification,
      title: 'Booking Cancellation',
      message: `Booking ${booking.id} cancelled - ${reason}`
    });
  }

  async notifyBookingRescheduled(booking, oldDate, newDate) {
    const notification = {
      type: 'BOOKING_RESCHEDULED',
      title: 'Booking Rescheduled',
      message: `Your booking has been rescheduled to ${new Date(newDate).toLocaleDateString()}`,
      data: {
        bookingId: booking.id,
        serviceName: booking.service.name,
        oldDate,
        newDate,
        rescheduledAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(booking.customerId, notification);
    
    if (booking.maidId) {
      await this.sendToMaid(booking.maidId, {
        ...notification,
        title: 'Service Rescheduled',
        message: `Service rescheduled to ${new Date(newDate).toLocaleDateString()}`
      });
    }

    await this.sendToAdmins({
      ...notification,
      title: 'Booking Rescheduled',
      message: `Booking ${booking.id} rescheduled`
    });
  }

  async notifyServiceStarted(booking) {
    const notification = {
      type: 'SERVICE_STARTED',
      title: 'Service Started',
      message: `Your ${booking.service.name} service has started`,
      data: {
        bookingId: booking.id,
        serviceName: booking.service.name,
        maidName: booking.maid.name,
        startedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(booking.customerId, notification);
    await this.sendToAdmins({
      ...notification,
      title: 'Service Started',
      message: `Service started by ${booking.maid.name}`
    });
  }

  async notifyMaidArrival(booking) {
    const notification = {
      type: 'MAID_ARRIVED',
      title: 'Maid Arrived',
      message: `${booking.maid.name} has arrived at your location`,
      data: {
        bookingId: booking.id,
        maidName: booking.maid.name,
        arrivedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(booking.customerId, notification);
  }

  async notifyMaidRunningLate(booking, estimatedDelay) {
    const notification = {
      type: 'MAID_RUNNING_LATE',
      title: 'Maid Running Late',
      message: `${booking.maid.name} is running ${estimatedDelay} minutes late`,
      data: {
        bookingId: booking.id,
        maidName: booking.maid.name,
        estimatedDelay,
        updatedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(booking.customerId, notification);
    await this.sendToAdmins({
      ...notification,
      title: 'Maid Delay Alert',
      message: `${booking.maid.name} running late for booking ${booking.id}`
    });
  }

  async notifySubscriptionExpiring(subscription, daysLeft) {
    const notification = {
      type: 'SUBSCRIPTION_EXPIRING',
      title: 'Subscription Expiring',
      message: `Your ${subscription.plan.name} subscription expires in ${daysLeft} days`,
      data: {
        subscriptionId: subscription.id,
        planName: subscription.plan.name,
        endDate: subscription.endDate,
        daysLeft
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(subscription.customer.userId, notification);
  }

  async notifySubscriptionRenewed(subscription) {
    const notification = {
      type: 'SUBSCRIPTION_RENEWED',
      title: 'Subscription Renewed',
      message: `Your ${subscription.plan.name} subscription has been renewed`,
      data: {
        subscriptionId: subscription.id,
        planName: subscription.plan.name,
        newEndDate: subscription.endDate,
        renewedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(subscription.customer.userId, notification);
    await this.sendToAdmins({
      ...notification,
      title: 'Subscription Renewal',
      message: `Subscription renewed: ${subscription.plan.name}`
    });
  }

  async notifySubscriptionCancelled(subscription, reason) {
    const notification = {
      type: 'SUBSCRIPTION_CANCELLED',
      title: 'Subscription Cancelled',
      message: `Your ${subscription.plan.name} subscription has been cancelled`,
      data: {
        subscriptionId: subscription.id,
        planName: subscription.plan.name,
        reason,
        cancelledAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(subscription.customer.userId, notification);
    await this.sendToAdmins({
      ...notification,
      title: 'Subscription Cancellation',
      message: `Subscription cancelled: ${subscription.plan.name} - ${reason}`
    });
  }

  async notifyPaymentReminder(booking) {
    const notification = {
      type: 'PAYMENT_REMINDER',
      title: 'Payment Reminder',
      message: `Payment pending for your ${booking.service.name} booking`,
      data: {
        bookingId: booking.id,
        serviceName: booking.service.name,
        amount: booking.finalAmount,
        dueDate: booking.scheduledAt
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(booking.customerId, notification);
  }

  async notifyRefundProcessed(payment, refundAmount) {
    const notification = {
      type: 'REFUND_PROCESSED',
      title: 'Refund Processed',
      message: `Refund of ₹${refundAmount} has been processed`,
      data: {
        paymentId: payment.id,
        refundAmount,
        originalAmount: payment.finalAmount,
        processedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(payment.customerId, notification);
    await this.sendToAdmins({
      ...notification,
      title: 'Refund Processed',
      message: `Refund of ₹${refundAmount} processed for customer`
    });
  }

  async notifyIssueResolved(issue) {
    const notification = {
      type: 'ISSUE_RESOLVED',
      title: 'Issue Resolved',
      message: `Your reported issue has been resolved: ${issue.title}`,
      data: {
        issueId: issue.id,
        issueTitle: issue.title,
        resolution: issue.resolution,
        resolvedAt: issue.resolvedAt
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToUser(issue.reportedBy, notification);
    await this.sendToAdmins({
      ...notification,
      title: 'Issue Resolution',
      message: `Issue resolved: ${issue.title}`
    });
  }

  async notifyMaidDocumentVerified(maid, documentType, status) {
    const notification = {
      type: 'DOCUMENT_VERIFIED',
      title: 'Document Verification',
      message: `Your ${documentType} document has been ${status}`,
      data: {
        maidId: maid.id,
        documentType,
        status,
        verifiedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToMaid(maid.userId, notification);
  }

  async notifyMaidPerformanceAlert(maid, alertType, details) {
    const notification = {
      type: 'PERFORMANCE_ALERT',
      title: 'Performance Alert',
      message: `Performance alert: ${alertType}`,
      data: {
        maidId: maid.id,
        alertType,
        details,
        alertedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToMaid(maid.userId, notification);
    await this.sendToAdmins({
      ...notification,
      title: 'Maid Performance Alert',
      message: `Performance alert for ${maid.user.name}: ${alertType}`
    });
  }

  async notifySystemMaintenance(maintenanceWindow) {
    const notification = {
      type: 'SYSTEM_MAINTENANCE',
      title: 'System Maintenance',
      message: `Scheduled maintenance: ${maintenanceWindow.startTime} - ${maintenanceWindow.endTime}`,
      data: {
        startTime: maintenanceWindow.startTime,
        endTime: maintenanceWindow.endTime,
        description: maintenanceWindow.description
      },
      timestamp: new Date().toISOString()
    };

    await this.broadcast(notification);
  }

  async notifyEmergencyAlert(alertType, message, priority = 'HIGH') {
    const notification = {
      type: 'EMERGENCY_ALERT',
      title: 'Emergency Alert',
      message,
      data: {
        alertType,
        priority,
        issuedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await this.broadcast(notification);
  }

  async notifyNewServiceAvailable(service) {
    const notification = {
      type: 'NEW_SERVICE_AVAILABLE',
      title: 'New Service Available',
      message: `New service available: ${service.name}`,
      data: {
        serviceId: service.id,
        serviceName: service.name,
        description: service.description,
        price: service.basePrice
      },
      timestamp: new Date().toISOString()
    };

    // Notify all customers
    this.customerClients.forEach((client, customerId) => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(notification));
      }
    });
  }

  async notifyPromotionalOffer(offer) {
    const notification = {
      type: 'PROMOTIONAL_OFFER',
      title: 'Special Offer',
      message: offer.message,
      data: {
        offerId: offer.id,
        discountPercent: offer.discountPercent,
        validUntil: offer.validUntil,
        terms: offer.terms
      },
      timestamp: new Date().toISOString()
    };

    // Notify all customers
    this.customerClients.forEach((client, customerId) => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(notification));
      }
    });
  }

  async notifyMaidShiftReminder(maid, shift) {
    const notification = {
      type: 'SHIFT_REMINDER',
      title: 'Shift Reminder',
      message: `Your shift starts in 30 minutes`,
      data: {
        maidId: maid.id,
        shiftStart: shift.startTime,
        shiftEnd: shift.endTime,
        location: shift.location
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToMaid(maid.userId, notification);
  }

  async notifyAttendanceAlert(maid, alertType) {
    const notification = {
      type: 'ATTENDANCE_ALERT',
      title: 'Attendance Alert',
      message: `Attendance alert: ${alertType}`,
      data: {
        maidId: maid.id,
        alertType,
        date: new Date().toISOString().split('T')[0]
      },
      timestamp: new Date().toISOString()
    };

    await this.sendToMaid(maid.userId, notification);
    await this.sendToAdmins({
      ...notification,
      title: 'Maid Attendance Alert',
      message: `Attendance alert for ${maid.user.name}: ${alertType}`
    });
  }

  // Scheduled job initialization
  initializeScheduledJobs() {
    // Daily booking reminders at 6 PM
    cron.schedule('0 18 * * *', async () => {
      await this.sendDailyBookingReminders();
    });

    // Payment reminders every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      await this.sendPaymentReminders();
    });

    // Subscription expiry reminders daily at 9 AM
    cron.schedule('0 9 * * *', async () => {
      await this.sendSubscriptionExpiryReminders();
    });

    // Performance alerts weekly on Monday at 10 AM
    cron.schedule('0 10 * * 1', async () => {
      await this.sendPerformanceAlerts();
    });

    // Attendance alerts daily at 9:30 AM
    cron.schedule('30 9 * * *', async () => {
      await this.sendAttendanceAlerts();
    });

    // Connection cleanup every hour
    cron.schedule('0 * * * *', () => {
      this.cleanupInactiveConnections();
    });
  }

  async sendDailyBookingReminders() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const bookings = await prisma.booking.findMany({
      where: {
        scheduledAt: {
          gte: tomorrow,
          lt: dayAfterTomorrow
        },
        status: { in: ['CONFIRMED', 'ASSIGNED'] }
      },
      include: {
        customer: true,
        maid: true,
        service: true
      }
    });

    for (const booking of bookings) {
      await this.notifyBookingReminder(booking);
    }
  }

  async sendPaymentReminders() {
    const pendingPayments = await prisma.payment.findMany({
      where: {
        status: 'PENDING',
        createdAt: {
          lte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
        }
      },
      include: {
        booking: {
          include: {
            service: true
          }
        }
      }
    });

    for (const payment of pendingPayments) {
      if (payment.booking) {
        await this.notifyPaymentReminder(payment.booking);
      }
    }
  }

  async sendSubscriptionExpiryReminders() {
    const expiringSubscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        endDate: {
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
        }
      },
      include: {
        customer: {
          include: {
            user: true
          }
        },
        plan: true
      }
    });

    for (const subscription of expiringSubscriptions) {
      const daysLeft = Math.ceil((subscription.endDate - new Date()) / (1000 * 60 * 60 * 24));
      await this.notifySubscriptionExpiring(subscription, daysLeft);
    }
  }

  async sendPerformanceAlerts() {
    const maids = await prisma.maidProfile.findMany({
      where: {
        status: 'ACTIVE'
      },
      include: {
        user: true,
        performanceMetrics: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      }
    });

    for (const maid of maids) {
      if (maid.performanceMetrics.length > 0) {
        const metrics = maid.performanceMetrics[0];
        
        // Low performance alert
        if (metrics.overallScore < 3.0) {
          await this.notifyMaidPerformanceAlert(maid, 'LOW_PERFORMANCE', {
            score: metrics.overallScore,
            rating: metrics.averageRating
          });
        }
        
        // High cancellation rate
        if (metrics.cancelledBookings > 0 && (metrics.cancelledBookings / metrics.totalBookings) > 0.2) {
          await this.notifyMaidPerformanceAlert(maid, 'HIGH_CANCELLATION_RATE', {
            cancellationRate: (metrics.cancelledBookings / metrics.totalBookings) * 100
          });
        }
      }
    }
  }

  async sendAttendanceAlerts() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const absentMaids = await prisma.attendance.findMany({
      where: {
        date: today,
        status: 'ABSENT'
      },
      include: {
        maid: {
          include: {
            user: true
          }
        }
      }
    });

    for (const attendance of absentMaids) {
      await this.notifyAttendanceAlert(attendance.maid, 'ABSENT');
    }
  }

  cleanupInactiveConnections() {
    const now = new Date();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

    this.clients.forEach((client, userId) => {
      if (client.lastActivity && (now - client.lastActivity) > inactiveThreshold) {
        if (client.readyState === client.OPEN) {
          client.close(1000, 'Inactive connection');
        }
        this.removeClientFromMaps(client);
      }
    });
  }

  // Connection statistics
  getConnectionStats() {
    return {
      ...this.connectionStats,
      timestamp: new Date().toISOString()
    };
  }

  // Health check for WebSocket connections
  async healthCheck() {
    const stats = this.getConnectionStats();
    const recentNotifications = await prisma.notification.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });

    return {
      status: 'healthy',
      connections: stats,
      recentNotifications,
      timestamp: new Date().toISOString()
    };
  }
}

// Create singleton instance
const notificationService = new NotificationService();

module.exports = notificationService;
