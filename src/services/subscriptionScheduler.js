const { getPrismaClient } = require('../utils/database');
const { Queue } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const { PrismaClient } = require('@prisma/client');
const subscriptionBufferService = require('./subscriptionBufferService');
const notificationService = require('./notificationService');
const maidSchedulingService = require('./maidSchedulingService');

const prisma = getPrismaClient();

/**
 * BullMQ-based Subscription & Buffer Period Scheduler
 * Replaces all node-cron schedulers with persistent BullMQ jobs
 */

// Create subscription management queue
const subscriptionQueue = new Queue('subscription-management', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 50,
      age: 7 * 24 * 3600,
    },
    removeOnFail: {
      count: 20,
      age: 14 * 24 * 3600,
    },
  },
});

// Job types
const JOB_TYPES = {
  CHECK_BUFFER_ACTIVATION: 'check-buffer-activation',
  CHECK_BUFFER_COMPLETION: 'check-buffer-completion',
  PROCESS_RENEWALS: 'process-renewals',
  SEND_BUFFER_REMINDERS: 'send-buffer-reminders',
  SCHEDULE_MONTHLY_SERVICES: 'schedule-monthly-services',
  CLEANUP_EXPIRED_DATA: 'cleanup-expired-data',
  ASSIGN_DAILY_MAIDS: 'assign-daily-maids',
  CHECK_EXPIRED_BUFFER_PERIODS: 'check-expired-buffer-periods',
};

class SubscriptionScheduler {
  /**
   * Initialize all recurring jobs
   */
  static async initialize() {
    try {
      console.log('🚀 Initializing Subscription Scheduler with BullMQ...');

      // Remove any existing repeatable jobs
      await this.clearExistingJobs();

      // Check buffer period activation - Daily at 9 AM
      await subscriptionQueue.add(
        JOB_TYPES.CHECK_BUFFER_ACTIVATION,
        { scheduled: true },
        {
          repeat: {
            pattern: '0 9 * * *',
          },
          jobId: 'daily-buffer-activation-check',
        }
      );
      console.log('✅ Scheduled: Buffer activation check (daily 9 AM)');

      // Check buffer period completion - Daily at 8 AM
      await subscriptionQueue.add(
        JOB_TYPES.CHECK_BUFFER_COMPLETION,
        { scheduled: true },
        {
          repeat: {
            pattern: '0 8 * * *',
          },
          jobId: 'daily-buffer-completion-check',
        }
      );
      console.log('✅ Scheduled: Buffer completion check (daily 8 AM)');

      // Process subscription renewals - Daily at midnight
      await subscriptionQueue.add(
        JOB_TYPES.PROCESS_RENEWALS,
        { scheduled: true },
        {
          repeat: {
            pattern: '0 0 * * *',
          },
          jobId: 'daily-subscription-renewals',
        }
      );
      console.log('✅ Scheduled: Subscription renewals (daily midnight)');

      // Send buffer period reminders - Daily at 7 PM
      await subscriptionQueue.add(
        JOB_TYPES.SEND_BUFFER_REMINDERS,
        { scheduled: true },
        {
          repeat: {
            pattern: '0 19 * * *',
          },
          jobId: 'daily-buffer-reminders',
        }
      );
      console.log('✅ Scheduled: Buffer reminders (daily 7 PM)');

      // Schedule monthly services - Daily at 6 AM
      await subscriptionQueue.add(
        JOB_TYPES.SCHEDULE_MONTHLY_SERVICES,
        { scheduled: true },
        {
          repeat: {
            pattern: '0 6 * * *',
          },
          jobId: 'daily-monthly-services-schedule',
        }
      );
      console.log('✅ Scheduled: Monthly services scheduling (daily 6 AM)');

      // Cleanup expired data - Weekly on Sunday at 2 AM
      await subscriptionQueue.add(
        JOB_TYPES.CLEANUP_EXPIRED_DATA,
        { scheduled: true },
        {
          repeat: {
            pattern: '0 2 * * 0',
          },
          jobId: 'weekly-cleanup',
        }
      );
      console.log('✅ Scheduled: Weekly cleanup (Sunday 2 AM)');

      // Assign daily maids - Daily at 7 AM
      await subscriptionQueue.add(
        JOB_TYPES.ASSIGN_DAILY_MAIDS,
        { scheduled: true },
        {
          repeat: {
            pattern: '0 7 * * *',
          },
          jobId: 'daily-maid-assignments',
        }
      );
      console.log('✅ Scheduled: Daily maid assignments (daily 7 AM)');

      // Check expired buffer periods - Every hour
      await subscriptionQueue.add(
        JOB_TYPES.CHECK_EXPIRED_BUFFER_PERIODS,
        { scheduled: true },
        {
          repeat: {
            pattern: '0 * * * *',
          },
          jobId: 'hourly-expired-buffer-check',
        }
      );
      console.log('✅ Scheduled: Expired buffer check (hourly)');

      console.log('🎉 Subscription Scheduler initialized successfully with BullMQ');
    } catch (error) {
      console.error('❌ Failed to initialize Subscription Scheduler:', error);
      throw error;
    }
  }

  /**
   * Clear existing repeatable jobs
   */
  static async clearExistingJobs() {
    const repeatableJobs = await subscriptionQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await subscriptionQueue.removeRepeatableByKey(job.key);
      console.log(`🗑️ Removed existing job: ${job.name}`);
    }
  }

  /**
   * Manual triggers for testing
   */
  static async triggerBufferActivation() {
    return await subscriptionQueue.add(JOB_TYPES.CHECK_BUFFER_ACTIVATION, {
      manual: true,
      triggeredAt: new Date().toISOString(),
    });
  }

  static async triggerBufferCompletion() {
    return await subscriptionQueue.add(JOB_TYPES.CHECK_BUFFER_COMPLETION, {
      manual: true,
      triggeredAt: new Date().toISOString(),
    });
  }

  static async triggerRenewals() {
    return await subscriptionQueue.add(JOB_TYPES.PROCESS_RENEWALS, {
      manual: true,
      triggeredAt: new Date().toISOString(),
    });
  }

  static async triggerMaidAssignments() {
    return await subscriptionQueue.add(JOB_TYPES.ASSIGN_DAILY_MAIDS, {
      manual: true,
      triggeredAt: new Date().toISOString(),
    });
  }

  /**
   * Get queue statistics
   */
  static async getStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      subscriptionQueue.getWaitingCount(),
      subscriptionQueue.getActiveCount(),
      subscriptionQueue.getCompletedCount(),
      subscriptionQueue.getFailedCount(),
      subscriptionQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }
}

module.exports = {
  SubscriptionScheduler,
  subscriptionQueue,
  JOB_TYPES,
};
