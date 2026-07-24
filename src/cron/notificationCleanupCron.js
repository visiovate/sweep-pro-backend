const cron = require('node-cron');
const { getPrismaClient } = require('../utils/database');

/**
 * Notification Cleanup Cron Job
 * Runs daily to clean up old notifications and prevent database bloat
 * 
 * Cleanup Rules:
 * - Delete read notifications older than 90 days
 * - Delete failed notifications older than 30 days
 * - Keep unread notifications indefinitely (user may need to see them)
 * - Keep critical notifications (payment, subscription) for 180 days
 */

class NotificationCleanupCron {
  constructor() {
    this.cronJob = null;
    this.prisma = null;
    this.cleanupStats = {
      lastRun: null,
      notificationsDeleted: 0,
      outboxEventsDeleted: 0,
      deliveryRecordsDeleted: 0,
      duration: 0,
      error: null
    };
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
   * Perform cleanup of old notifications
   */
  async performCleanup() {
    const startTime = Date.now();
    console.log('🧹 [NotificationCleanup] Starting cleanup process...');

    try {
      const db = this.getPrisma();
      const now = new Date();
      
      // Calculate cutoff dates
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const oneHundredEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

      let totalDeleted = 0;

      // 1. Delete read notifications older than 90 days (except critical types)
      const readNotificationsResult = await db.notification.deleteMany({
        where: {
          read: true,
          createdAt: { lt: ninetyDaysAgo },
          type: {
            notIn: ['PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_CANCELLED']
          }
        }
      });
      totalDeleted += readNotificationsResult.count;
      console.log(`🗑️  Deleted ${readNotificationsResult.count} old read notifications`);

      // 2. Delete failed notifications older than 30 days
      const failedNotificationsResult = await db.notification.deleteMany({
        where: {
          read: false,
          createdAt: { lt: thirtyDaysAgo },
          type: {
            notIn: ['PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_CANCELLED']
          }
        }
      });
      totalDeleted += failedNotificationsResult.count;
      console.log(`🗑️  Deleted ${failedNotificationsResult.count} old failed notifications`);

      // 3. Delete critical notifications older than 180 days
      const criticalNotificationsResult = await db.notification.deleteMany({
        where: {
          type: { in: ['PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_CANCELLED'] },
          createdAt: { lt: oneHundredEightyDaysAgo }
        }
      });
      totalDeleted += criticalNotificationsResult.count;
      console.log(`🗑️  Deleted ${criticalNotificationsResult.count} old critical notifications`);

      // 4. Clean up processed outbox events older than 30 days
      const outboxEventsResult = await db.notificationOutboxEvent.deleteMany({
        where: {
          status: 'PROCESSED',
          processedAt: { lt: thirtyDaysAgo }
        }
      });
      console.log(`🗑️  Deleted ${outboxEventsResult.count} old outbox events`);

      // 5. Clean up delivery records older than 90 days
      const deliveryRecordsResult = await db.notificationDelivery.deleteMany({
        where: {
          createdAt: { lt: ninetyDaysAgo }
        }
      });
      console.log(`🗑️  Deleted ${deliveryRecordsResult.count} old delivery records`);

      const duration = Date.now() - startTime;

      this.cleanupStats = {
        lastRun: now,
        notificationsDeleted: totalDeleted,
        outboxEventsDeleted: outboxEventsResult.count,
        deliveryRecordsDeleted: deliveryRecordsResult.count,
        duration,
        error: null
      };

      console.log(`✅ [NotificationCleanup] Cleanup completed in ${duration}ms`);
      console.log(`📊 Total records deleted: ${totalDeleted + outboxEventsResult.count + deliveryRecordsResult.count}`);

      return this.cleanupStats;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.cleanupStats = {
        lastRun: new Date(),
        notificationsDeleted: 0,
        outboxEventsDeleted: 0,
        deliveryRecordsDeleted: 0,
        duration,
        error: error.message
      };
      console.error('❌ [NotificationCleanup] Cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Get cleanup statistics
   */
  getStats() {
    return this.cleanupStats;
  }

  /**
   * Start the cron job (runs daily at 2 AM)
   */
  start() {
    if (this.cronJob) {
      console.log('⚠️  [NotificationCleanup] Cron job already running');
      return;
    }

    // Run daily at 2 AM server time
    this.cronJob = cron.schedule('0 2 * * *', async () => {
      console.log('⏰ [NotificationCleanup] Scheduled cleanup triggered');
      await this.performCleanup();
    });

    console.log('✅ [NotificationCleanup] Cron job started (runs daily at 2 AM)');
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 [NotificationCleanup] Cron job stopped');
    }
  }

  /**
   * Run cleanup immediately (for testing or manual trigger)
   */
  async runNow() {
    return await this.performCleanup();
  }
}

module.exports = new NotificationCleanupCron();
