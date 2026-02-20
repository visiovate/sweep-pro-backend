const { randomUUID } = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { notificationQueue } = require('../notifications/queues/notificationQueue');
const { sleep } = require('../notifications/utils/sleep');

const prisma = getPrismaClient();

const WORKER_ID = process.env.OUTBOX_DISPATCHER_ID || `outbox-dispatcher-${randomUUID()}`;
const POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_DISPATCHER_POLL_INTERVAL_MS || '2000', 10);
const BATCH_SIZE = parseInt(process.env.OUTBOX_DISPATCHER_BATCH_SIZE || '50', 10);

async function claimOutboxEvent(eventId) {
  const now = new Date();
  const result = await prisma.notificationOutboxEvent.updateMany({
    where: {
      id: eventId,
      status: { in: ['PENDING', 'FAILED'] },
      availableAt: { lte: now },
      lockedAt: null
    },
    data: {
      status: 'PROCESSING',
      lockedAt: now,
      lockedBy: WORKER_ID,
      attempts: { increment: 1 }
    }
  });

  return result.count === 1;
}

async function enqueueEvent(event) {
  try {
    await notificationQueue.add(
      'outbox-event',
      { outboxEventId: event.id },
      {
        jobId: event.id,
        priority: 2
      }
    );

    await prisma.notificationOutboxEvent.update({
      where: { id: event.id },
      data: {
        status: 'ENQUEUED',
        enqueuedAt: new Date(),
        lockedAt: null,
        lockedBy: null
      }
    });
  } catch (error) {
    await prisma.notificationOutboxEvent.update({
      where: { id: event.id },
      data: {
        status: 'FAILED',
        lastError: error?.message || String(error),
        lockedAt: null,
        lockedBy: null,
        availableAt: new Date(Date.now() + 60_000)
      }
    });

    throw error;
  }
}

async function runOnce() {
  const now = new Date();

  const candidates = await prisma.notificationOutboxEvent.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      availableAt: { lte: now },
      lockedAt: null
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE
  });

  for (const event of candidates) {
    const claimed = await claimOutboxEvent(event.id);
    if (!claimed) continue;

    const latest = await prisma.notificationOutboxEvent.findUnique({ where: { id: event.id } });
    if (!latest) continue;

    await enqueueEvent(latest);
  }
}

async function main() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runOnce();
    } catch (error) {
      // Keep the dispatcher alive; failures are persisted to the outbox.
      console.error('Outbox dispatcher loop error:', error);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

main().catch((e) => {
  console.error('Outbox dispatcher failed to start:', e);
  process.exit(1);
});
