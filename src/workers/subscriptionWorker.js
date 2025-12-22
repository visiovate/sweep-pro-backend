const { Worker } = require('bullmq');
const { PrismaClient } = require('@prisma/client');
const { createRedisConnection } = require('../config/redis');
const { JOB_TYPES } = require('../services/subscriptionScheduler');
const subscriptionBufferService = require('../services/subscriptionBufferService');
const notificationService = require('../services/notificationService');
const maidSchedulingService = require('../services/maidSchedulingService');
const BufferDayService = require('../services/BufferDayService');

const prisma = new PrismaClient();
const bufferService = new BufferDayService();

/**
 * BullMQ Worker for Subscription Management Jobs
 * Processes buffer periods, renewals, and other subscription-related tasks
 */

const connection = createRedisConnection();

// Job processor function
const processSubscriptionJob = async (job) => {
  console.log(`\n🔄 Processing subscription job: ${job.name} (ID: ${job.id})`);
  console.log(`📦 Job data:`, JSON.stringify(job.data, null, 2));

  try {
    switch (job.name) {
      case JOB_TYPES.CHECK_BUFFER_ACTIVATION:
        return await checkBufferPeriodActivation();
      
      case JOB_TYPES.CHECK_BUFFER_COMPLETION:
        return await checkBufferPeriodCompletion();
      
      case JOB_TYPES.PROCESS_RENEWALS:
        return await processSubscriptionRenewals();
      
      case JOB_TYPES.SEND_BUFFER_REMINDERS:
        return await sendBufferPeriodReminders();
      
      case JOB_TYPES.SCHEDULE_MONTHLY_SERVICES:
        return await scheduleMonthlyServices();
      
      case JOB_TYPES.CLEANUP_EXPIRED_DATA:
        return await cleanupExpiredData();
      
      case JOB_TYPES.ASSIGN_DAILY_MAIDS:
        return await runDailyMaidScheduling();
      
      case JOB_TYPES.CHECK_EXPIRED_BUFFER_PERIODS:
        return await checkExpiredBufferPeriods();
      
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  } catch (error) {
    console.error(`❌ Job ${job.id} failed:`, error);
    throw error;
  }
};

/**
 * Check if any subscriptions should enter buffer period
 */
async function checkBufferPeriodActivation() {
  console.log('🛡️ Checking for buffer period activation...');
  
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Get last 3 days of current month
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const bufferStartDate = new Date(monthEnd);
    bufferStartDate.setDate(bufferStartDate.getDate() - 2);
    
    if (today.getTime() < bufferStartDate.getTime()) {
      console.log('📅 Not yet time for buffer period activation');
      return { success: true, message: 'Not time yet' };
    }

    const subscriptionsForBuffer = await subscriptionBufferService.getSubscriptionsForBufferActivation();
    console.log(`🛡️ Found ${subscriptionsForBuffer.length} subscriptions ready for buffer period`);

    const results = [];
    for (const subscription of subscriptionsForBuffer) {
      try {
        await subscriptionBufferService.startBufferPeriod(subscription.id, 'END_OF_MONTH');
        await notificationService.notifyBufferPeriodStarted(subscription, {
          reason: 'END_OF_MONTH',
          message: 'Your subscription has entered the buffer period for the end of the month.',
        });
        results.push({ subscriptionId: subscription.id, status: 'activated' });
        console.log(`✅ Buffer period started for subscription: ${subscription.id}`);
      } catch (error) {
        console.error(`❌ Failed to start buffer period for subscription ${subscription.id}:`, error);
        results.push({ subscriptionId: subscription.id, status: 'failed', error: error.message });
      }
    }

    return {
      success: true,
      processed: subscriptionsForBuffer.length,
      results,
    };
  } catch (error) {
    console.error('❌ Error in buffer period activation check:', error);
    throw error;
  }
}

/**
 * Check if any buffer periods should be completed
 */
async function checkBufferPeriodCompletion() {
  console.log('🔚 Checking for buffer period completion...');
  
  try {
    const bufferPeriodsToEnd = await subscriptionBufferService.getBufferPeriodsToEnd();
    console.log(`🔚 Found ${bufferPeriodsToEnd.length} buffer periods ready to end`);

    const results = [];
    for (const bufferPeriod of bufferPeriodsToEnd) {
      try {
        await subscriptionBufferService.endBufferPeriod(bufferPeriod.subscriptionId);
        results.push({ bufferPeriodId: bufferPeriod.id, status: 'ended' });
        console.log(`✅ Buffer period ended for subscription: ${bufferPeriod.subscriptionId}`);
      } catch (error) {
        console.error(`❌ Failed to end buffer period ${bufferPeriod.id}:`, error);
        results.push({ bufferPeriodId: bufferPeriod.id, status: 'failed', error: error.message });
      }
    }

    return {
      success: true,
      processed: bufferPeriodsToEnd.length,
      results,
    };
  } catch (error) {
    console.error('❌ Error in buffer period completion check:', error);
    throw error;
  }
}

/**
 * Process subscription renewals
 */
async function processSubscriptionRenewals() {
  console.log('🔄 Processing subscription renewals...');
  
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const subscriptionsToRenew = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        currentCycleEnd: {
          lte: today,
        },
        isInBufferPeriod: false,
      },
      include: {
        plan: true,
        customer: { include: { user: true } },
      },
    });

    console.log(`🔄 Found ${subscriptionsToRenew.length} subscriptions ready for renewal`);

    const results = [];
    for (const subscription of subscriptionsToRenew) {
      try {
        if (subscription.autoRenew) {
          await subscriptionBufferService.processSubscriptionRenewal(subscription.id);
          results.push({ subscriptionId: subscription.id, status: 'renewed' });
          console.log(`✅ Subscription renewed: ${subscription.id}`);
        } else {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              status: 'EXPIRED',
              completedCycles: { increment: 1 },
            },
          });
          await notificationService.notifySubscriptionExpired(subscription);
          results.push({ subscriptionId: subscription.id, status: 'expired' });
          console.log(`⏰ Subscription expired: ${subscription.id}`);
        }
      } catch (error) {
        console.error(`❌ Failed to process renewal for subscription ${subscription.id}:`, error);
        results.push({ subscriptionId: subscription.id, status: 'failed', error: error.message });
      }
    }

    return {
      success: true,
      processed: subscriptionsToRenew.length,
      results,
    };
  } catch (error) {
    console.error('❌ Error in subscription renewal process:', error);
    throw error;
  }
}

/**
 * Send buffer period reminders
 */
async function sendBufferPeriodReminders() {
  console.log('📬 Sending buffer period reminders...');
  
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const bufferStartDate = new Date(monthEnd);
    bufferStartDate.setDate(bufferStartDate.getDate() - 2);

    const results = [];

    // Check if tomorrow is the buffer start date
    if (tomorrow.toDateString() === bufferStartDate.toDateString()) {
      const activeSubscriptions = await prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          isInBufferPeriod: false,
        },
        include: {
          plan: true,
          customer: { include: { user: true } },
        },
      });

      for (const subscription of activeSubscriptions) {
        try {
          await notificationService.notifyBufferPeriodApproaching(subscription, 1);
          results.push({ subscriptionId: subscription.id, type: 'approaching' });
        } catch (error) {
          console.error(`❌ Failed to send reminder for subscription ${subscription.id}:`, error);
        }
      }
    }

    // Send reminders for subscriptions currently in buffer period
    const activeBufferPeriods = await prisma.bufferPeriod.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        subscription: {
          include: {
            plan: true,
            customer: { include: { user: true } },
          },
        },
      },
    });

    for (const bufferPeriod of activeBufferPeriods) {
      const daysLeft = Math.ceil((bufferPeriod.endDate - now) / (1000 * 60 * 60 * 24));
      
      if (daysLeft === 1) {
        try {
          await notificationService.notifyBufferPeriodEnding(bufferPeriod.subscription, daysLeft);
          results.push({ subscriptionId: bufferPeriod.subscriptionId, type: 'ending' });
        } catch (error) {
          console.error(`❌ Failed to send ending reminder for subscription ${bufferPeriod.subscriptionId}:`, error);
        }
      }
    }

    return {
      success: true,
      reminders: results.length,
      results,
    };
  } catch (error) {
    console.error('❌ Error sending buffer period reminders:', error);
    throw error;
  }
}

/**
 * Schedule monthly services for active subscriptions
 */
async function scheduleMonthlyServices() {
  console.log('📅 Scheduling monthly services...');
  
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Only run on the 1st of each month
    if (today.getDate() !== 1) {
      console.log('📅 Not the 1st of the month, skipping');
      return { success: true, message: 'Not time yet' };
    }

    const activeSubscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        isInBufferPeriod: false,
      },
    });

    const results = [];
    for (const subscription of activeSubscriptions) {
      try {
        await subscriptionBufferService.scheduleMonthlyServices(subscription.id);
        results.push({ subscriptionId: subscription.id, status: 'scheduled' });
      } catch (error) {
        console.error(`❌ Failed to schedule services for subscription ${subscription.id}:`, error);
        results.push({ subscriptionId: subscription.id, status: 'failed', error: error.message });
      }
    }

    return {
      success: true,
      processed: activeSubscriptions.length,
      results,
    };
  } catch (error) {
    console.error('❌ Error scheduling monthly services:', error);
    throw error;
  }
}

/**
 * Cleanup expired data
 */
async function cleanupExpiredData() {
  console.log('🧹 Starting weekly cleanup of expired data...');
  
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const oldCompletedCycles = await prisma.subscriptionCycle.count({
      where: {
        status: 'COMPLETED',
        endDate: {
          lt: thirtyDaysAgo,
        },
      },
    });

    const oldCompletedBuffers = await prisma.bufferPeriod.count({
      where: {
        status: 'COMPLETED',
        endDate: {
          lt: thirtyDaysAgo,
        },
      },
    });

    console.log(`🧹 Found ${oldCompletedCycles} old completed cycles`);
    console.log(`🧹 Found ${oldCompletedBuffers} old completed buffer periods`);

    return {
      success: true,
      oldCycles: oldCompletedCycles,
      oldBuffers: oldCompletedBuffers,
    };
  } catch (error) {
    console.error('❌ Error during weekly cleanup:', error);
    throw error;
  }
}

/**
 * Run daily maid scheduling
 */
async function runDailyMaidScheduling() {
  console.log('📊 Running daily maid scheduling...');
  
  try {
    const today = new Date();
    const assignments = await maidSchedulingService.scheduleAndAssignMaids({ date: today });
    
    console.log(`📊 Daily maid scheduling completed. Made ${assignments.length} assignments.`);

    if (assignments.length > 0) {
      await notificationService.sendToAdmins({
        type: 'DAILY_ASSIGNMENTS_SUMMARY',
        title: 'Daily Maid Assignments Summary',
        message: `Successfully assigned ${assignments.length} maids to bookings for ${today.toDateString()}`,
        data: {
          date: today.toISOString(),
          totalAssignments: assignments.length,
          assignments: assignments.slice(0, 5),
        },
        timestamp: new Date().toISOString(),
      });
    }

    return {
      success: true,
      assignments: assignments.length,
    };
  } catch (error) {
    console.error('❌ Error in daily maid scheduling:', error);
    throw error;
  }
}

/**
 * Check expired buffer periods
 */
async function checkExpiredBufferPeriods() {
  console.log('🔄 Checking for expired buffer periods...');
  
  try {
    const result = await bufferService.processExpiredBufferPeriods();
    
    if (result.processedCount > 0) {
      console.log(`✅ Processed ${result.processedCount} expired buffer periods`);
    }

    return {
      success: true,
      processed: result.processedCount,
    };
  } catch (error) {
    console.error('❌ Error checking expired buffer periods:', error);
    throw error;
  }
}

// Create the worker
const subscriptionWorker = new Worker('subscription-management', processSubscriptionJob, {
  connection,
  concurrency: 3,
  limiter: {
    max: 5,
    duration: 1000,
  },
});

// Worker event listeners
subscriptionWorker.on('ready', () => {
  console.log('✅ Subscription Worker is ready and waiting for jobs');
});

subscriptionWorker.on('active', (job) => {
  console.log(`🔄 Subscription worker processing job ${job.id}: ${job.name}`);
});

subscriptionWorker.on('completed', (job, result) => {
  console.log(`✅ Subscription job ${job.id} completed successfully`);
});

subscriptionWorker.on('failed', (job, err) => {
  console.error(`❌ Subscription job ${job?.id} failed:`, err.message);
});

subscriptionWorker.on('error', (err) => {
  console.error('❌ Subscription worker error:', err);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down subscription worker...');
  await subscriptionWorker.close();
  await prisma.$disconnect();
  console.log('✅ Subscription worker shut down gracefully');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🚀 SWEEPRO SUBSCRIPTION WORKER                              ║
║                                                                ║
║   Status: Running 24/7                                        ║
║   Queue: subscription-management                              ║
║   Concurrency: 3 jobs                                         ║
║                                                                ║
║   Handles buffer periods, renewals, and subscriptions         ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);

module.exports = subscriptionWorker;
