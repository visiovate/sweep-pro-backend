const { getPrismaClient } = require('../../utils/database');
const { PrismaClient } = require('@prisma/client');
const simplifiedNotificationService = require('../../services/simplifiedNotificationService');

// Use singleton pattern to prevent connection pool exhaustion
let prisma = null;

function getPrismaInstance() {
  if (!prisma) {
    prisma = getPrismaClient();
  }
  return prisma;
}

/**
 * Simplified publish notification event
 * Directly triggers notifications without BullMQ/Redis queue system
 * 
 * Critical guarantees:
 * - This function is safe to call from controllers/services
 * - Uses simplified notification service for direct database operations
 * - Maintains compatibility with existing publishEvent API
 */
async function publishNotificationEvent({
  prisma: prismaClient,
  topic,
  payload,
  dedupeKey,
  availableAt
}) {
  if (!topic) throw new Error('publishNotificationEvent: topic is required');

  const db = getPrismaInstance();

  // Check for deduplication if dedupeKey is provided
  if (dedupeKey) {
    try {
      const existing = await db.notificationOutboxEvent.findUnique({
        where: { dedupeKey }
      });
      if (existing) {
        return existing;
      }
    } catch (err) {
      // Ignore if table doesn't exist or other errors
    }
  }

  // Process notification immediately using simplified service
  // Map topics to notification methods
  const { NOTIFICATION_TOPICS } = require('./topics');
  
  try {
    switch (topic) {
      case NOTIFICATION_TOPICS.BOOKING_CREATED:
        if (payload.bookingId) {
          const booking = await db.booking.findUnique({
            where: { id: payload.bookingId },
            include: { customer: true, service: true }
          });
          if (booking) {
            await simplifiedNotificationService.notifyBookingCreated(booking);
          }
        }
        break;

      case NOTIFICATION_TOPICS.PAYMENT_STATUS_UPDATED:
        if (payload.paymentId) {
          const payment = await db.payment.findUnique({
            where: { id: payload.paymentId },
            include: { customer: true }
          });
          if (payment) {
            if (payload.status === 'COMPLETED') {
              await simplifiedNotificationService.notifyPaymentReceived(payment);
            } else if (payload.status === 'FAILED') {
              await simplifiedNotificationService.notifyPaymentFailed(payment);
            }
          }
        }
        break;

      case NOTIFICATION_TOPICS.SUBSCRIPTION_ACTIVATED:
        if (payload.subscriptionId) {
          const subscription = await db.subscription.findUnique({
            where: { id: payload.subscriptionId },
            include: { plan: true, customer: { include: { user: true } } }
          });
          if (subscription) {
            await simplifiedNotificationService.notifySubscriptionCreated(subscription);
          }
        }
        break;

      case NOTIFICATION_TOPICS.SUBSCRIPTION_CANCELLED:
        if (payload.subscriptionId) {
          const subscription = await db.subscription.findUnique({
            where: { id: payload.subscriptionId },
            include: { plan: true, customer: { include: { user: true } } }
          });
          if (subscription) {
            await simplifiedNotificationService.notifySubscriptionCancelled(subscription, payload.reason || 'User requested');
          }
        }
        break;

      case NOTIFICATION_TOPICS.ASSIGNMENT_REQUEST_CREATED:
        if (payload.assignmentRequestId) {
          const assignmentRequest = await db.assignmentRequest.findUnique({
            where: { id: payload.assignmentRequestId },
            include: { booking: true }
          });
          if (assignmentRequest) {
            await simplifiedNotificationService.notifyAssignmentRequest(assignmentRequest);
          }
        }
        break;

      case NOTIFICATION_TOPICS.ASSIGNMENT_ACCEPTED:
        if (payload.assignmentRequestId) {
          const assignmentRequest = await db.assignmentRequest.findUnique({
            where: { id: payload.assignmentRequestId }
          });
          if (assignmentRequest) {
            await simplifiedNotificationService.notifyAssignmentAccepted(assignmentRequest);
          }
        }
        break;

      case NOTIFICATION_TOPICS.ASSIGNMENT_REJECTED:
        if (payload.assignmentRequestId) {
          const assignmentRequest = await db.assignmentRequest.findUnique({
            where: { id: payload.assignmentRequestId }
          });
          if (assignmentRequest) {
            await simplifiedNotificationService.notifyAssignmentRejected(assignmentRequest);
          }
        }
        break;

      case NOTIFICATION_TOPICS.SERVICE_COMPLETED:
        if (payload.bookingId) {
          const booking = await db.booking.findUnique({
            where: { id: payload.bookingId },
            include: { service: true, maid: true, customer: true }
          });
          if (booking) {
            await simplifiedNotificationService.notifyServiceCompleted(booking);
          }
        }
        break;

      case NOTIFICATION_TOPICS.USER_REGISTERED:
        if (payload.userId) {
          const user = await db.user.findUnique({
            where: { id: payload.userId }
          });
          if (user) {
            await simplifiedNotificationService.notifyUserRegistration(user);
          }
        }
        break;

      default:
        console.log(`[publishNotificationEvent] Topic ${topic} not handled by simplified service`);
    }

    // Still log to outbox for audit purposes (optional)
    try {
      const client = prismaClient || db;
      return await client.notificationOutboxEvent.create({
        data: {
          topic,
          payload,
          dedupeKey: dedupeKey || null,
          availableAt: availableAt || new Date(),
          status: 'PROCESSED',
          processedAt: new Date()
        }
      });
    } catch (err) {
      // Ignore outbox errors - notification was sent directly
      console.warn('[publishNotificationEvent] Failed to log to outbox:', err.message);
      return { success: true };
    }
  } catch (error) {
    console.error('[publishNotificationEvent] Failed to process notification:', error);
    throw error;
  }
}

module.exports = {
  publishNotificationEvent
};
