const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Persist a domain event in the NotificationOutboxEvent table.
 *
 * Critical guarantees:
 * - This function is safe to call from controllers/services (no side effects besides DB).
 * - When used inside a business transaction, it enables an Outbox pattern: the state change
 *   and the event are committed atomically.
 */
async function publishNotificationEvent({
  prisma: prismaClient,
  topic,
  payload,
  dedupeKey,
  availableAt
}) {
  if (!topic) throw new Error('publishNotificationEvent: topic is required');

  const client = prismaClient || prisma;

  const data = {
    topic,
    payload,
    dedupeKey: dedupeKey || null,
    availableAt: availableAt || new Date()
  };

  try {
    return await client.notificationOutboxEvent.create({ data });
  } catch (err) {
    // If dedupeKey is provided, allow idempotent publishing.
    // Prisma unique constraint error code: P2002
    if (dedupeKey && err?.code === 'P2002') {
      return await client.notificationOutboxEvent.findUnique({
        where: { dedupeKey }
      });
    }
    throw err;
  }
}

module.exports = {
  publishNotificationEvent
};
