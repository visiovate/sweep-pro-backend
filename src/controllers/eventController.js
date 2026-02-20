const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const { publishNotificationEvent } = require('../notifications/events/publishEvent');
const { NOTIFICATION_TOPICS } = require('../notifications/events/topics');

const prisma = getPrismaClient();

async function pricingVisited(req, res) {
  try {
    const userId = req.user.id;
    const { path, referrer } = req.body || {};

    await prisma.userEvent.create({
      data: {
        userId,
        type: 'PRICING_VISITED',
        data: { path: path || null, referrer: referrer || null }
      }
    });

    // Publish for downstream marketing automation.
    await publishNotificationEvent({
      topic: NOTIFICATION_TOPICS.PRICING_VISITED,
      payload: { userId },
      dedupeKey: `pricing-visited:${userId}:${new Date().toISOString().slice(0, 10)}`
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to record event' });
  }
}

module.exports = {
  pricingVisited
};
