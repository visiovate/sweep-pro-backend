
const { PrismaClient } = require('@prisma/client');
const notificationService = require('./notificationService');

const prisma = new PrismaClient();

/**
 * Enhanced Notification Methods
 * Additional notification handlers for assignment requests, task completions, and more
 */

class NotificationEnhancements {
  // Assignment Request Notifications
  async notifyAssignmentRequestSent(assignmentRequest, booking, maid) {
    const notification = {
      type: 'ASSIGNMENT_REQUEST',
      title: 'New Service Assignment Request',
      message: `You have a new service request for ${booking.service.name} on ${new Date(booking.scheduledAt).toLocaleDateString()}`,
      data: {
        assignmentRequestId: assignmentRequest.id,
        bookingId: booking.id,
        customerId: booking.customerId,
        customerName: booking.customer.name,
        serviceName: booking.service.name,
        serviceAddress: booking.serviceAddress,
        scheduledAt: booking.scheduledAt,
        timeSlot: booking.timeSlot,
        expiresAt: assignmentRequest.expiresAt,
        hoursToRespond: Math.ceil((new Date(assignmentRequest.expiresAt) - new Date()) / (1000 * 60 * 60))
      },
      timestamp: new Date().toISOString()
    };

    // Notify maid
    await notificationService.sendToMaid(maid.userId, notification);

    // Notify admins
    await notificationService.sendToAdmins({
      ...notification,
      title: 'Assignment Request Sent',
      message: `Assignment request sent to ${maid.user.name} for booking ${booking.id}`
    });
  }

  async notifyAssignmentAccepted(assignmentRequest, booking, maid) {
    const notification = {
      type: 'ASSIGNMENT_ACCEPTED',
      title: 'Maid Accepted Assignment',
      message: `${maid.user.name} has accepted your service request`,
      data: {
        assignmentRequestId: assignmentRequest.id,
        bookingId: booking.id,
        maidId: maid.userId,
        maidName: maid.user.name,
        maidPhone: maid.user.phone,
        serviceName: booking.service.name,
        scheduledAt: booking.scheduledAt,
        acceptedAt: assignmentRequest.respondedAt
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await notificationService.sendToUser(booking.customerId, notification);

    // Notify admins
    await notificationService.sendToAdmins({
      ...notification,
      title: 'Assignment Accepted',
      message: `${maid.user.name} accepted assignment for booking ${booking.id}`
    });
  }

  async notifyAssignmentRejected(assignmentRequest, booking, maid) {
    const notification = {
      type: 'ASSIGNMENT_REJECTED',
      title: 'Assignment Request Declined',
      message: `${maid.user.name} declined the service request. We're finding another maid for you.`,
      data: {
        assignmentRequestId: assignmentRequest.id,
        bookingId: booking.id,
        maidId: maid.userId,
        maidName: maid.user.name,
        serviceName: booking.service.name,
        scheduledAt: booking.scheduledAt,
        rejectionReason: assignmentRequest.rejectionReason,
        rejectedAt: assignmentRequest.respondedAt
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await notificationService.sendToUser(booking.customerId, notification);

    // Notify admins with urgency
    await notificationService.sendToAdmins({
      ...notification,
      title: 'Assignment Rejected - Action Required',
      message: `${maid.user.name} rejected assignment for booking ${booking.id}. Reason: ${assignmentRequest.rejectionReason || 'Not specified'}. Reassignment needed.`
    });
  }

  async notifyAssignmentExpired(assignmentRequest, booking, maid) {
    const notification = {
      type: 'ASSIGNMENT_EXPIRED',
      title: 'Assignment Request Expired',
      message: `Assignment request for ${booking.service.name} has expired without response`,
      data: {
        assignmentRequestId: assignmentRequest.id,
        bookingId: booking.id,
        maidId: maid.userId,
        maidName: maid.user.name,
        serviceName: booking.service.name,
        scheduledAt: booking.scheduledAt,
        expiresAt: assignmentRequest.expiresAt
      },
      timestamp: new Date().toISOString()
    };

    // Notify admins
    await notificationService.sendToAdmins({
      ...notification,
      title: 'Assignment Request Expired - Action Required',
      message: `Assignment request to ${maid.user.name} for booking ${booking.id} expired. Reassignment needed.`
    });

    // Notify customer
    await notificationService.sendToUser(booking.customerId, {
      ...notification,
      title: 'Finding Another Maid',
      message: `We're assigning another maid for your ${booking.service.name} service`
    });
  }

  async notifyReassignmentRequired(booking, reason) {
    const notification = {
      type: 'REASSIGNMENT_REQUIRED',
      title: 'Booking Reassignment Required',
      message: `Booking ${booking.id} requires reassignment. Reason: ${reason}`,
      data: {
        bookingId: booking.id,
        customerId: booking.customerId,
        customerName: booking.customer.name,
        serviceName: booking.service.name,
        scheduledAt: booking.scheduledAt,
        reason,
        reassignmentCount: booking.reassignmentCount
      },
      timestamp: new Date().toISOString()
    };

    // Notify admins with high priority
    await notificationService.sendToAdmins(notification);
  }

  // Task Completion Notifications
  async notifyTaskStarted(taskCompletion, booking, task) {
    const notification = {
      type: 'TASK_STARTED',
      title: 'Task Started',
      message: `Maid has started: ${task.name}`,
      data: {
        taskCompletionId: taskCompletion.id,
        bookingId: booking.id,
        taskId: task.id,
        taskName: task.name,
        startedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await notificationService.sendToUser(booking.customerId, notification);
  }

  async notifyTaskCompleted(taskCompletion, booking, task) {
    const notification = {
      type: 'TASK_COMPLETED',
      title: 'Task Completed',
      message: `${task.name} has been completed`,
      data: {
        taskCompletionId: taskCompletion.id,
        bookingId: booking.id,
        taskId: task.id,
        taskName: task.name,
        completedAt: taskCompletion.updatedAt,
        timeSpent: taskCompletion.timeSpent,
        proofImages: taskCompletion.proofImages
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await notificationService.sendToUser(booking.customerId, notification);

    // Notify admins
    await notificationService.sendToAdmins({
      ...notification,
      title: 'Task Completion Logged',
      message: `Task "${task.name}" completed for booking ${booking.id}`
    });
  }

  async notifyAllTasksCompleted(booking) {
    const notification = {
      type: 'ALL_TASKS_COMPLETED',
      title: 'All Tasks Completed',
      message: `All tasks for your ${booking.service.name} service have been completed`,
      data: {
        bookingId: booking.id,
        serviceName: booking.service.name,
        completedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await notificationService.sendToUser(booking.customerId, notification);
  }

  async notifyVerificationRequired(taskCompletion, booking) {
    const notification = {
      type: 'VERIFICATION_REQUIRED',
      title: 'Service Verification Required',
      message: `Please verify the completion of your ${booking.service.name} service`,
      data: {
        taskCompletionId: taskCompletion.id,
        bookingId: booking.id,
        serviceName: booking.service.name,
        verificationMethod: taskCompletion.verificationMethod,
        customerOtp: taskCompletion.customerOtp
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await notificationService.sendToUser(booking.customerId, notification);
  }

  // Customer-Maid Assignment Notifications
  async notifyCustomerMaidAssignmentRequest(request, customer, maid, admin) {
    const notification = {
      type: 'CUSTOMER_ASSIGNMENT_REQUEST',
      title: 'New Customer Assignment Request',
      message: `You have a new permanent assignment request from customer ${customer.name}`,
      data: {
        requestId: request.id,
        customerId: customer.id,
        customerName: customer.name,
        customerAddress: customer.address,
        requestedBy: admin.name,
        expiresAt: request.expiresAt,
        notes: request.notes
      },
      timestamp: new Date().toISOString()
    };

    // Notify maid
    await notificationService.sendToMaid(maid.userId, notification);
  }

  async notifyCustomerMaidAssignmentAccepted(assignment, customer, maid) {
    const notification = {
      type: 'CUSTOMER_ASSIGNMENT_ACCEPTED',
      title: 'Permanent Maid Assigned',
      message: `${maid.user.name} has been assigned as your permanent maid`,
      data: {
        assignmentId: assignment.id,
        maidId: maid.userId,
        maidName: maid.user.name,
        maidPhone: maid.user.phone,
        assignedAt: assignment.assignedAt
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await notificationService.sendToUser(customer.id, notification);

    // Notify admins
    await notificationService.sendToAdmins({
      ...notification,
      title: 'Customer-Maid Assignment Completed',
      message: `${maid.user.name} assigned to customer ${customer.name}`
    });
  }

  async notifyCustomerMaidAssignmentRejected(request, customer, maid) {
    const notification = {
      type: 'CUSTOMER_ASSIGNMENT_REJECTED',
      title: 'Assignment Request Declined',
      message: `Maid ${maid.user.name} declined the permanent assignment request`,
      data: {
        requestId: request.id,
        maidId: maid.userId,
        maidName: maid.user.name,
        rejectionReason: request.rejectionReason
      },
      timestamp: new Date().toISOString()
    };

    // Notify admins
    await notificationService.sendToAdmins(notification);
  }

  // Attendance & Performance Notifications
  async notifyMaidCheckIn(attendance, maid) {
    const notification = {
      type: 'MAID_CHECK_IN',
      title: 'Check-In Successful',
      message: `You have successfully checked in for today`,
      data: {
        attendanceId: attendance.id,
        checkInTime: attendance.checkIn,
        location: attendance.checkInLocation
      },
      timestamp: new Date().toISOString()
    };

    // Notify maid
    await notificationService.sendToMaid(maid.userId, notification);
  }

  async notifyMaidCheckOut(attendance, maid) {
    const notification = {
      type: 'MAID_CHECK_OUT',
      title: 'Check-Out Successful',
      message: `You have successfully checked out. Hours worked: ${attendance.hoursWorked}`,
      data: {
        attendanceId: attendance.id,
        checkOutTime: attendance.checkOut,
        hoursWorked: attendance.hoursWorked,
        overtime: attendance.overtime
      },
      timestamp: new Date().toISOString()
    };

    // Notify maid
    await notificationService.sendToMaid(maid.userId, notification);
  }

  async notifyMissedCheckIn(maid) {
    const notification = {
      type: 'MISSED_CHECK_IN',
      title: 'Missed Check-In Alert',
      message: `You haven't checked in today. Please check in to start your shift`,
      data: {
        date: new Date().toISOString().split('T')[0]
      },
      timestamp: new Date().toISOString()
    };

    // Notify maid
    await notificationService.sendToMaid(maid.userId, notification);

    // Notify admins
    await notificationService.sendToAdmins({
      ...notification,
      title: 'Maid Missed Check-In',
      message: `${maid.user.name} missed check-in today`
    });
  }

  async notifyLowPerformanceWarning(maid, metrics) {
    const notification = {
      type: 'LOW_PERFORMANCE_WARNING',
      title: 'Performance Improvement Required',
      message: `Your performance metrics need attention. Please review and improve.`,
      data: {
        maidId: maid.id,
        overallScore: metrics.overallScore,
        averageRating: metrics.averageRating,
        completionRate: metrics.completedBookings / metrics.totalBookings,
        cancellationRate: metrics.cancelledBookings / metrics.totalBookings
      },
      timestamp: new Date().toISOString()
    };

    // Notify maid
    await notificationService.sendToMaid(maid.userId, notification);
  }

  // Booking Lifecycle Notifications
  async notifyBookingApproaching(booking, hoursLeft) {
    const notification = {
      type: 'BOOKING_APPROACHING',
      title: 'Service Starting Soon',
      message: `Your ${booking.service.name} service starts in ${hoursLeft} hour${hoursLeft > 1 ? 's' : ''}`,
      data: {
        bookingId: booking.id,
        serviceName: booking.service.name,
        scheduledAt: booking.scheduledAt,
        serviceAddress: booking.serviceAddress,
        hoursLeft
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await notificationService.sendToUser(booking.customerId, notification);

    // Notify maid if assigned
    if (booking.maidId) {
      await notificationService.sendToMaid(booking.maidId, {
        ...notification,
        message: `Service at ${booking.customer.name}'s location starts in ${hoursLeft} hour${hoursLeft > 1 ? 's' : ''}`
      });
    }
  }

  async notifyBookingOverdue(booking) {
    const notification = {
      type: 'BOOKING_OVERDUE',
      title: 'Service Overdue',
      message: `Booking ${booking.id} is overdue and not started`,
      data: {
        bookingId: booking.id,
        customerId: booking.customerId,
        maidId: booking.maidId,
        serviceName: booking.service.name,
        scheduledAt: booking.scheduledAt
      },
      timestamp: new Date().toISOString()
    };

    // Notify admins with urgency
    await notificationService.sendToAdmins(notification);

    // Notify maid if assigned
    if (booking.maidId) {
      await notificationService.sendToMaid(booking.maidId, {
        ...notification,
        title: 'Service Overdue - Action Required',
        message: `Your service at ${booking.customer.name}'s location is overdue. Please start immediately or contact support.`
      });
    }
  }

  async notifyServiceDelayed(booking, delay) {
    const notification = {
      type: 'SERVICE_DELAYED',
      title: 'Service Delayed',
      message: `Your maid is running ${delay} minutes late`,
      data: {
        bookingId: booking.id,
        maidName: booking.maid.name,
        delay,
        estimatedArrival: new Date(Date.now() + delay * 60000).toISOString()
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await notificationService.sendToUser(booking.customerId, notification);
  }

  // Payment Notifications
  async notifyPaymentPending(payment, booking) {
    const notification = {
      type: 'PAYMENT_PENDING',
      title: 'Payment Pending',
      message: `Payment of ₹${payment.finalAmount} is pending for your ${booking.service.name} service`,
      data: {
        paymentId: payment.id,
        bookingId: booking.id,
        amount: payment.finalAmount,
        paymentMethod: payment.paymentMethod
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await notificationService.sendToUser(payment.customerId, notification);
  }

  async notifyPaymentOverdue(payment, booking, daysOverdue) {
    const notification = {
      type: 'PAYMENT_OVERDUE',
      title: 'Payment Overdue',
      message: `Payment of ₹${payment.finalAmount} is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`,
      data: {
        paymentId: payment.id,
        bookingId: booking.id,
        amount: payment.finalAmount,
        daysOverdue
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await notificationService.sendToUser(payment.customerId, notification);

    // Notify admins
    await notificationService.sendToAdmins({
      ...notification,
      title: 'Overdue Payment Alert',
      message: `Payment of ₹${payment.finalAmount} from customer ${booking.customer.name} is ${daysOverdue} days overdue`
    });
  }

  // Feedback Notifications
  async notifyFeedbackRequest(booking) {
    const notification = {
      type: 'FEEDBACK_REQUEST',
      title: 'How was your service?',
      message: `Please rate your ${booking.service.name} service and help us improve`,
      data: {
        bookingId: booking.id,
        serviceName: booking.service.name,
        maidName: booking.maid?.name,
        completedAt: booking.completedAt
      },
      timestamp: new Date().toISOString()
    };

    // Notify customer
    await notificationService.sendToUser(booking.customerId, notification);
  }

  async notifyPositiveFeedback(feedback, maid) {
    const notification = {
      type: 'POSITIVE_FEEDBACK',
      title: 'Great Job!',
      message: `You received a ${feedback.overallRating}-star rating! Keep up the excellent work!`,
      data: {
        feedbackId: feedback.id,
        bookingId: feedback.bookingId,
        rating: feedback.overallRating,
        comment: feedback.comment
      },
      timestamp: new Date().toISOString()
    };

    // Notify maid
    await notificationService.sendToMaid(maid.userId, notification);
  }

  async notifyNegativeFeedback(feedback, maid) {
    const notification = {
      type: 'NEGATIVE_FEEDBACK',
      title: 'Feedback Received',
      message: `You received a ${feedback.overallRating}-star rating. Please review the feedback and improve.`,
      data: {
        feedbackId: feedback.id,
        bookingId: feedback.bookingId,
        rating: feedback.overallRating,
        comment: feedback.comment,
        improvements: feedback.improvements
      },
      timestamp: new Date().toISOString()
    };

    // Notify maid
    await notificationService.sendToMaid(maid.userId, notification);

    // Notify admins if rating is very low
    if (feedback.overallRating <= 2) {
      await notificationService.sendToAdmins({
        ...notification,
        title: 'Low Rating Alert',
        message: `${maid.user.name} received a ${feedback.overallRating}-star rating. Review required.`
      });
    }
  }
}

// Create singleton instance
const notificationEnhancements = new NotificationEnhancements();

module.exports = notificationEnhancements;
