const { Worker } = require('bullmq');
const { PrismaClient } = require('@prisma/client');
const { createRedisConnection } = require('../config/redis');
const resendEmailService = require('../notifications/email/resendEmailService');
const emailTemplates = require('../notifications/email/templates');
const { publishNotificationEvent } = require('../notifications/events/publishEvent');
const { NOTIFICATION_TOPICS } = require('../notifications/events/topics');

const prisma = new PrismaClient();
const connection = createRedisConnection();

async function getUserPreferences(userId) {
  const prefs = await prisma.notificationPreference.findUnique({ where: { userId } });
  return prefs || {
    inAppEnabled: true,
    emailEnabled: true,
    transactionalEmailEnabled: true,
    marketingEmailEnabled: true
  };
}

async function ensureDelivery({ outboxEventId, userId, channel }) {
  try {
    return await prisma.notificationDelivery.create({
      data: { outboxEventId, userId, channel }
    });
  } catch (err) {
    if (err?.code === 'P2002') {
      return null;
    }
    throw err;
  }
}

async function markDelivery({ deliveryId, status, provider, providerMessageId, lastError }) {
  return prisma.notificationDelivery.update({
    where: { id: deliveryId },
    data: {
      status,
      provider: provider || null,
      providerMessageId: providerMessageId || null,
      lastError: lastError || null
    }
  });
}

async function createInAppNotification({ userId, type, title, message, data, outboxEventId }) {
  // Delivery row provides idempotency. Notification table itself is append-only.
  const delivery = await ensureDelivery({ outboxEventId, userId, channel: 'IN_APP' });
  if (!delivery) return;

  const prefs = await getUserPreferences(userId);
  if (!prefs.inAppEnabled) {
    await markDelivery({ deliveryId: delivery.id, status: 'SKIPPED' });
    return;
  }

  await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      data: data || {}
    }
  });

  await markDelivery({ deliveryId: delivery.id, status: 'SENT' });
}

async function sendEmailNotification({ userId, type, templateFn, templateData, outboxEventId, isMarketing }) {
  const delivery = await ensureDelivery({ outboxEventId, userId, channel: 'EMAIL' });
  if (!delivery) return;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  if (!user?.email) {
    await markDelivery({ deliveryId: delivery.id, status: 'SKIPPED', lastError: 'USER_EMAIL_MISSING' });
    return;
  }

  const prefs = await getUserPreferences(userId);
  if (!prefs.emailEnabled) {
    await markDelivery({ deliveryId: delivery.id, status: 'SKIPPED', lastError: 'EMAIL_DISABLED' });
    return;
  }

  if (isMarketing && !prefs.marketingEmailEnabled) {
    await markDelivery({ deliveryId: delivery.id, status: 'SKIPPED', lastError: 'MARKETING_EMAIL_DISABLED' });
    return;
  }

  if (!isMarketing && !prefs.transactionalEmailEnabled) {
    await markDelivery({ deliveryId: delivery.id, status: 'SKIPPED', lastError: 'TRANSACTIONAL_EMAIL_DISABLED' });
    return;
  }

  const { subject, html, text } = templateFn({
    ...templateData,
    customerName: templateData.customerName || user.name
  });

  const result = await resendEmailService.sendEmail({
    to: user.email,
    subject,
    html,
    text
  });

  if (!result.success) {
    await markDelivery({
      deliveryId: delivery.id,
      status: 'FAILED',
      provider: result.provider,
      lastError: result.error || result.reason || 'EMAIL_SEND_FAILED'
    });

    const err = new Error(result.error || 'Email send failed');
    err.retryable = true;
    throw err;
  }

  await markDelivery({
    deliveryId: delivery.id,
    status: 'SENT',
    provider: result.provider,
    providerMessageId: result.messageId
  });
}

async function handleBookingCreated(outboxEvent) {
  const { bookingId } = outboxEvent.payload || {};
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { customer: true, service: true }
  });

  if (!booking) {
    await prisma.notificationOutboxEvent.update({
      where: { id: outboxEvent.id },
      data: { status: 'FAILED', lastError: 'BOOKING_NOT_FOUND' }
    });
    return;
  }

  // Customer in-app + transactional email
  await createInAppNotification({
    outboxEventId: outboxEvent.id,
    userId: booking.customerId,
    type: 'BOOKING_CREATED',
    title: 'Booking Confirmed',
    message: `Your booking for ${booking.service.name} has been created successfully`,
    data: { bookingId: booking.id, scheduledAt: booking.scheduledAt }
  });

  await sendEmailNotification({
    outboxEventId: outboxEvent.id,
    userId: booking.customerId,
    type: 'BOOKING_CREATED',
    templateFn: emailTemplates.bookingCreatedEmail,
    templateData: {
      serviceName: booking.service.name,
      scheduledAt: booking.scheduledAt,
      bookingId: booking.id
    },
    isMarketing: false
  });

  // Admin in-app only
  const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPERVISOR'] } }, select: { id: true } });
  for (const admin of admins) {
    await createInAppNotification({
      outboxEventId: outboxEvent.id,
      userId: admin.id,
      type: 'BOOKING_CREATED',
      title: 'New Booking Created',
      message: `New booking for ${booking.service.name} by ${booking.customer.name}`,
      data: { bookingId: booking.id, customerId: booking.customerId }
    });
  }
}

async function handleBookingMaidAssigned(outboxEvent) {
  const { bookingId } = outboxEvent.payload || {};
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { customer: true, service: true, maid: true }
  });

  if (!booking) {
    await prisma.notificationOutboxEvent.update({
      where: { id: outboxEvent.id },
      data: { status: 'FAILED', lastError: 'BOOKING_NOT_FOUND' }
    });
    return;
  }

  await createInAppNotification({
    outboxEventId: outboxEvent.id,
    userId: booking.customerId,
    type: 'MAID_ASSIGNED',
    title: 'Maid Assigned',
    message: booking.maid?.name
      ? `${booking.maid.name} has been assigned to your booking`
      : 'A maid has been assigned to your booking',
    data: {
      bookingId: booking.id,
      maidId: booking.maidId,
      maidName: booking.maid?.name,
      serviceName: booking.service?.name,
      scheduledAt: booking.scheduledAt
    }
  });

  await sendEmailNotification({
    outboxEventId: outboxEvent.id,
    userId: booking.customerId,
    type: 'MAID_ASSIGNED',
    templateFn: emailTemplates.maidAssignedEmail,
    templateData: {
      maidName: booking.maid?.name,
      maidPhone: booking.maid?.phone,
      serviceName: booking.service?.name,
      scheduledAt: booking.scheduledAt,
      bookingId: booking.id
    },
    isMarketing: false
  });
}

async function handlePaymentStatusUpdated(outboxEvent) {
  const { paymentId, status } = outboxEvent.payload || {};

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: { include: { service: true, customer: true } },
      customer: true
    }
  });

  if (!payment) {
    await prisma.notificationOutboxEvent.update({
      where: { id: outboxEvent.id },
      data: { status: 'FAILED', lastError: 'PAYMENT_NOT_FOUND' }
    });
    return;
  }

  const customerId = payment.customerId;
  const amount = payment.finalAmount;

  if (status === 'COMPLETED') {
    await createInAppNotification({
      outboxEventId: outboxEvent.id,
      userId: customerId,
      type: 'PAYMENT_RECEIVED',
      title: 'Payment Received',
      message: `Payment of ₹${amount} received successfully`,
      data: { paymentId: payment.id, amount }
    });

    await sendEmailNotification({
      outboxEventId: outboxEvent.id,
      userId: customerId,
      type: 'PAYMENT_RECEIVED',
      templateFn: emailTemplates.paymentStatusEmail,
      templateData: { status, amount, paymentId: payment.id },
      isMarketing: false
    });
  }

  if (status === 'FAILED') {
    await createInAppNotification({
      outboxEventId: outboxEvent.id,
      userId: customerId,
      type: 'PAYMENT_FAILED',
      title: 'Payment Failed',
      message: `Payment of ₹${amount} failed. Please try again.`,
      data: { paymentId: payment.id, amount }
    });
  }

  const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPERVISOR'] } }, select: { id: true } });
  for (const admin of admins) {
    await createInAppNotification({
      outboxEventId: outboxEvent.id,
      userId: admin.id,
      type: status === 'COMPLETED' ? 'PAYMENT_RECEIVED' : 'PAYMENT_FAILED',
      title: 'Payment Update',
      message: `Payment ${status} for customer ${customerId}`,
      data: { paymentId: payment.id, status }
    });
  }
}

async function handleSubscriptionActivated(outboxEvent) {
  const { subscriptionId } = outboxEvent.payload || {};

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, customer: { include: { user: true } } }
  });

  if (!subscription) {
    await prisma.notificationOutboxEvent.update({
      where: { id: outboxEvent.id },
      data: { status: 'FAILED', lastError: 'SUBSCRIPTION_NOT_FOUND' }
    });
    return;
  }

  const userId = subscription.customer.userId;

  await createInAppNotification({
    outboxEventId: outboxEvent.id,
    userId,
    type: 'SUBSCRIPTION_CREATED',
    title: 'Subscription Activated',
    message: `Your ${subscription.plan.name} subscription is now active`,
    data: { subscriptionId: subscription.id, planName: subscription.plan.name }
  });

  await sendEmailNotification({
    outboxEventId: outboxEvent.id,
    userId,
    type: 'SUBSCRIPTION_CREATED',
    templateFn: emailTemplates.subscriptionActivatedEmail,
    templateData: { planName: subscription.plan.name, subscriptionId: subscription.id },
    isMarketing: false
  });
}

async function handleSubscriptionCancelled(outboxEvent) {
  const { subscriptionId } = outboxEvent.payload || {};

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, customer: { include: { user: true } } }
  });

  if (!subscription) {
    await prisma.notificationOutboxEvent.update({
      where: { id: outboxEvent.id },
      data: { status: 'FAILED', lastError: 'SUBSCRIPTION_NOT_FOUND' }
    });
    return;
  }

  const userId = subscription.customer.userId;

  await createInAppNotification({
    outboxEventId: outboxEvent.id,
    userId,
    type: 'SUBSCRIPTION_CANCELLED',
    title: 'Subscription Cancelled',
    message: `Your ${subscription.plan.name} subscription has been cancelled`,
    data: { subscriptionId: subscription.id, planName: subscription.plan.name }
  });

  await sendEmailNotification({
    outboxEventId: outboxEvent.id,
    userId,
    type: 'SUBSCRIPTION_CANCELLED',
    templateFn: emailTemplates.subscriptionCancelledEmail,
    templateData: { planName: subscription.plan.name },
    isMarketing: false
  });
}

async function handlePricingVisited(outboxEvent) {
  const { userId } = outboxEvent.payload || {};
  if (!userId) return;

  // Schedule a follow-up marketing email in 24h.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dedupeKey = `pricing-abandoned:${userId}:${tomorrow.toISOString().slice(0, 10)}`;

  await publishNotificationEvent({
    topic: NOTIFICATION_TOPICS.PRICING_ABANDONED,
    payload: { userId },
    dedupeKey,
    availableAt: tomorrow
  });
}

async function handlePricingAbandoned(outboxEvent) {
  const { userId } = outboxEvent.payload || {};
  if (!userId) return;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
  if (!user) return;

  const customerProfile = await prisma.customerProfile.findUnique({
    where: { userId: userId },
    include: { subscription: true }
  });

  const hasActiveSubscription = !!(customerProfile?.subscription && customerProfile.subscription.status === 'ACTIVE');
  if (hasActiveSubscription) {
    return;
  }

  await sendEmailNotification({
    outboxEventId: outboxEvent.id,
    userId,
    type: 'PROMOTIONAL_OFFER',
    templateFn: emailTemplates.pricingAbandonedEmail,
    templateData: { customerName: user.name },
    isMarketing: true
  });
}

async function processOutboxEvent(outboxEvent) {
  switch (outboxEvent.topic) {
    case NOTIFICATION_TOPICS.BOOKING_CREATED:
      await handleBookingCreated(outboxEvent);
      break;
    case NOTIFICATION_TOPICS.BOOKING_MAID_ASSIGNED:
      await handleBookingMaidAssigned(outboxEvent);
      break;
    case NOTIFICATION_TOPICS.PAYMENT_STATUS_UPDATED:
      await handlePaymentStatusUpdated(outboxEvent);
      break;
    case NOTIFICATION_TOPICS.SUBSCRIPTION_ACTIVATED:
      await handleSubscriptionActivated(outboxEvent);
      break;
    case NOTIFICATION_TOPICS.SUBSCRIPTION_CANCELLED:
      await handleSubscriptionCancelled(outboxEvent);
      break;
    case NOTIFICATION_TOPICS.PRICING_VISITED:
      await handlePricingVisited(outboxEvent);
      break;
    case NOTIFICATION_TOPICS.PRICING_ABANDONED:
      await handlePricingAbandoned(outboxEvent);
      break;
    default:
      break;
  }
}

async function markOutboxProcessed(outboxEventId) {
  await prisma.notificationOutboxEvent.update({
    where: { id: outboxEventId },
    data: {
      status: 'PROCESSED',
      processedAt: new Date()
    }
  });
}

async function processJob(job) {
  const { outboxEventId } = job.data || {};
  if (!outboxEventId) return;

  const outboxEvent = await prisma.notificationOutboxEvent.findUnique({ where: { id: outboxEventId } });
  if (!outboxEvent) return;

  if (outboxEvent.status === 'PROCESSED') return;

  await processOutboxEvent(outboxEvent);
  await markOutboxProcessed(outboxEventId);
}

const worker = new Worker('notifications', processJob, {
  connection,
  concurrency: parseInt(process.env.NOTIFICATION_WORKER_CONCURRENCY || '5', 10),
  settings: {
    stalledInterval: 30_000,
    maxStalledCount: 1
  }
});

worker.on('ready', () => {
  console.log('✅ Notification Worker ready');
});

worker.on('failed', (job, err) => {
  console.error('❌ Notification job failed', job?.id, err?.message || err);
});

worker.on('completed', (job) => {
  console.log('✅ Notification job completed', job?.id);
});
