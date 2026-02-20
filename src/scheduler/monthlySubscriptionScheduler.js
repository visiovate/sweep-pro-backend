const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const subscriptionBufferService = require('../services/subscriptionBufferService');
const notificationService = require('../services/notificationService');
const maidSchedulingService = require('../services/maidSchedulingService');

const prisma = getPrismaClient();

class MonthlySubscriptionScheduler {
  constructor() {
    this.isRunning = false;
    this.init();
  }

  init() {
    console.log('🚀 Monthly Subscription Scheduler initialized');
    
    // Check for buffer period activation every day at 9 AM
    cron.schedule('0 9 * * *', async () => {
      console.log('🔄 Running daily buffer period check...');
      await this.checkBufferPeriodActivation();
    });

    // Check for buffer period completion every day at 8 AM
    cron.schedule('0 8 * * *', async () => {
      console.log('🔄 Running daily buffer period completion check...');
      await this.checkBufferPeriodCompletion();
    });

    // Process subscription renewals every day at 12 AM (midnight)
    cron.schedule('0 0 * * *', async () => {
      console.log('🔄 Running daily subscription renewal check...');
      await this.processSubscriptionRenewals();
    });

    // Send buffer period reminders every day at 7 PM
    cron.schedule('0 19 * * *', async () => {
      console.log('🔄 Running buffer period reminder check...');
      await this.sendBufferPeriodReminders();
    });

    // Schedule monthly services for active subscriptions every day at 6 AM
    cron.schedule('0 6 * * *', async () => {
      console.log('🔄 Running monthly service scheduling check...');
      await this.scheduleMonthlyServicesForActiveSubscriptions();
    });

    // Cleanup expired cycles and buffer periods every week on Sunday at 2 AM
    cron.schedule('0 2 * * 0', async () => {
      console.log('🔄 Running weekly cleanup...');
      await this.cleanupExpiredData();
    });

    // Assign maids to unassigned bookings every day at 7 AM
    cron.schedule('0 7 * * *', async () => {
      console.log('🔄 Running daily maid assignment...');
      await this.runDailyMaidScheduling();
    });

    // Health check every 6 hours
    cron.schedule('0 */6 * * *', () => {
      this.healthCheck();
    });

    console.log('📅 Monthly Subscription Scheduler cron jobs registered');
  }

  /**
   * Check if any subscriptions should enter buffer period
   */
  async checkBufferPeriodActivation() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Get last 3 days of current month
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const bufferStartDate = new Date(monthEnd);
      bufferStartDate.setDate(bufferStartDate.getDate() - 2); // 3 days before month end
      
      // Check if today is within the last 3 days of the month
      if (today.getTime() < bufferStartDate.getTime()) {
        console.log('📅 Not yet time for buffer period activation');
        this.isRunning = false;
        return;
      }

      const subscriptionsForBuffer = await subscriptionBufferService.getSubscriptionsForBufferActivation();
      
      console.log(`🛡️ Found ${subscriptionsForBuffer.length} subscriptions ready for buffer period`);

      for (const subscription of subscriptionsForBuffer) {
        try {
          console.log(`🛡️ Starting buffer period for subscription: ${subscription.id}`);
          await subscriptionBufferService.startBufferPeriod(subscription.id, 'END_OF_MONTH');
          
          // Send notification to customer
          await notificationService.notifyBufferPeriodStarted(subscription, {
            reason: 'END_OF_MONTH',
            message: 'Your subscription has entered the buffer period for the end of the month.'
          });
          
          console.log(`✅ Buffer period started for subscription: ${subscription.id}`);
        } catch (error) {
          console.error(`❌ Failed to start buffer period for subscription ${subscription.id}:`, error);
        }
      }

      console.log(`🛡️ Buffer period activation check completed. Processed ${subscriptionsForBuffer.length} subscriptions.`);
    } catch (error) {
      console.error('❌ Error in buffer period activation check:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if any buffer periods should be completed
   */
  async checkBufferPeriodCompletion() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const bufferPeriodsToEnd = await subscriptionBufferService.getBufferPeriodsToEnd();
      
      console.log(`🔚 Found ${bufferPeriodsToEnd.length} buffer periods ready to end`);

      for (const bufferPeriod of bufferPeriodsToEnd) {
        try {
          console.log(`🔚 Ending buffer period: ${bufferPeriod.id} for subscription: ${bufferPeriod.subscriptionId}`);
          await subscriptionBufferService.endBufferPeriod(bufferPeriod.subscriptionId);
          
          console.log(`✅ Buffer period ended for subscription: ${bufferPeriod.subscriptionId}`);
        } catch (error) {
          console.error(`❌ Failed to end buffer period ${bufferPeriod.id}:`, error);
        }
      }

      console.log(`🔚 Buffer period completion check completed. Processed ${bufferPeriodsToEnd.length} buffer periods.`);
    } catch (error) {
      console.error('❌ Error in buffer period completion check:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process subscription renewals
   */
  async processSubscriptionRenewals() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Find subscriptions that should be renewed (end date is today or past)
      const subscriptionsToRenew = await prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          currentCycleEnd: {
            lte: today
          },
          isInBufferPeriod: false // Don't renew subscriptions still in buffer
        },
        include: {
          plan: true,
          customer: { include: { user: true } }
        }
      });

      console.log(`🔄 Found ${subscriptionsToRenew.length} subscriptions ready for renewal`);

      for (const subscription of subscriptionsToRenew) {
        try {
          console.log(`🔄 Processing renewal for subscription: ${subscription.id}`);
          
          if (subscription.autoRenew) {
            await subscriptionBufferService.processSubscriptionRenewal(subscription.id);
            console.log(`✅ Subscription renewed: ${subscription.id}`);
          } else {
            // Mark as expired
            await prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                status: 'EXPIRED',
                completedCycles: { increment: 1 }
              }
            });
            
            // Send expiration notification
            await notificationService.notifySubscriptionExpired(subscription);
            console.log(`⏰ Subscription expired: ${subscription.id} (auto-renew disabled)`);
          }
        } catch (error) {
          console.error(`❌ Failed to process renewal for subscription ${subscription.id}:`, error);
        }
      }

      console.log(`🔄 Subscription renewal process completed. Processed ${subscriptionsToRenew.length} subscriptions.`);
    } catch (error) {
      console.error('❌ Error in subscription renewal process:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Send buffer period reminders
   */
  async sendBufferPeriodReminders() {
    try {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Get month end date
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const bufferStartDate = new Date(monthEnd);
      bufferStartDate.setDate(bufferStartDate.getDate() - 2);

      // Check if tomorrow is the buffer start date
      if (tomorrow.toDateString() === bufferStartDate.toDateString()) {
        const activeSubscriptions = await prisma.subscription.findMany({
          where: {
            status: 'ACTIVE',
            isInBufferPeriod: false
          },
          include: {
            plan: true,
            customer: { include: { user: true } }
          }
        });

        console.log(`📬 Sending buffer period reminders to ${activeSubscriptions.length} customers`);

        for (const subscription of activeSubscriptions) {
          try {
            await notificationService.notifyBufferPeriodApproaching(subscription, 1);
          } catch (error) {
            console.error(`❌ Failed to send buffer reminder for subscription ${subscription.id}:`, error);
          }
        }
      }

      // Send reminders for subscriptions currently in buffer period
      const activeBufferPeriods = await prisma.bufferPeriod.findMany({
        where: {
          status: 'ACTIVE'
        },
        include: {
          subscription: {
            include: {
              plan: true,
              customer: { include: { user: true } }
            }
          }
        }
      });

      for (const bufferPeriod of activeBufferPeriods) {
        const daysLeft = Math.ceil((bufferPeriod.endDate - now) / (1000 * 60 * 60 * 24));
        
        if (daysLeft === 1) {
          try {
            await notificationService.notifyBufferPeriodEnding(bufferPeriod.subscription, daysLeft);
          } catch (error) {
            console.error(`❌ Failed to send buffer ending reminder for subscription ${bufferPeriod.subscriptionId}:`, error);
          }
        }
      }

    } catch (error) {
      console.error('❌ Error sending buffer period reminders:', error);
    }
  }

  /**
   * Schedule monthly services for active subscriptions
   */
  async scheduleMonthlyServicesForActiveSubscriptions() {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Check if it's the first day of the month
      if (today.getDate() !== 1) {
        return; // Only schedule on the 1st of each month
      }

      const activeSubscriptions = await prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          isInBufferPeriod: false
        }
      });

      console.log(`📅 Scheduling monthly services for ${activeSubscriptions.length} active subscriptions`);

      for (const subscription of activeSubscriptions) {
        try {
          await subscriptionBufferService.scheduleMonthlyServices(subscription.id);
          console.log(`✅ Monthly services scheduled for subscription: ${subscription.id}`);
        } catch (error) {
          console.error(`❌ Failed to schedule services for subscription ${subscription.id}:`, error);
        }
      }

      console.log('📅 Monthly service scheduling completed');
    } catch (error) {
      console.error('❌ Error scheduling monthly services:', error);
    }
  }

  /**
   * Cleanup expired data
   */
  async cleanupExpiredData() {
    try {
      console.log('🧹 Starting weekly cleanup of expired data...');

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Archive old completed cycles
      const oldCompletedCycles = await prisma.subscriptionCycle.count({
        where: {
          status: 'COMPLETED',
          endDate: {
            lt: thirtyDaysAgo
          }
        }
      });

      console.log(`🧹 Found ${oldCompletedCycles} old completed cycles to archive`);

      // Archive old completed buffer periods
      const oldCompletedBuffers = await prisma.bufferPeriod.count({
        where: {
          status: 'COMPLETED',
          endDate: {
            lt: thirtyDaysAgo
          }
        }
      });

      console.log(`🧹 Found ${oldCompletedBuffers} old completed buffer periods to archive`);

      // Update cycle statistics
      await this.updateCycleStatistics();

      console.log('🧹 Weekly cleanup completed');
    } catch (error) {
      console.error('❌ Error during weekly cleanup:', error);
    }
  }

  /**
   * Update cycle statistics
   */
  async updateCycleStatistics() {
    try {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      // Update statistics for active subscriptions
      const activeSubscriptions = await prisma.subscription.findMany({
        where: {
          status: 'ACTIVE'
        },
        include: {
          cycles: {
            where: {
              status: 'COMPLETED'
            }
          }
        }
      });

      for (const subscription of activeSubscriptions) {
        const completedCyclesCount = subscription.cycles.length;
        
        if (subscription.completedCycles !== completedCyclesCount) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              completedCycles: completedCyclesCount
            }
          });
        }
      }

      console.log(`📊 Updated statistics for ${activeSubscriptions.length} subscriptions`);
    } catch (error) {
      console.error('❌ Error updating cycle statistics:', error);
    }
  }

  /**
   * Health check
   */
  healthCheck() {
    try {
      const now = new Date();
      console.log(`💓 Monthly Subscription Scheduler health check - ${now.toISOString()}`);
      console.log(`🏃‍♂️ Scheduler running: ${!this.isRunning ? 'Available' : 'Busy'}`);
      
      // Log memory usage
      const memUsage = process.memoryUsage();
      console.log(`💾 Memory usage: RSS ${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    } catch (error) {
      console.error('❌ Health check error:', error);
    }
  }

  /**
   * Manual trigger for buffer period activation (for testing)
   */
  async manualTriggerBufferActivation() {
    console.log('🔧 Manual trigger: Buffer period activation');
    await this.checkBufferPeriodActivation();
  }

  /**
   * Manual trigger for buffer period completion (for testing)
   */
  async manualTriggerBufferCompletion() {
    console.log('🔧 Manual trigger: Buffer period completion');
    await this.checkBufferPeriodCompletion();
  }

  /**
   * Manual trigger for subscription renewals (for testing)
   */
  async manualTriggerRenewals() {
    console.log('🔧 Manual trigger: Subscription renewals');
    await this.processSubscriptionRenewals();
  }

  /**
   * Run daily maid scheduling
   */
  async runDailyMaidScheduling() {
    try {
      const today = new Date();
      const assignments = await maidSchedulingService.scheduleAndAssignMaids({ date: today });
      
      console.log(`📊 Daily maid scheduling completed. Made ${assignments.length} assignments.`);
      
      // Send summary to admins if there were assignments
      if (assignments.length > 0) {
        await notificationService.sendToAdmins({
          type: 'DAILY_ASSIGNMENTS_SUMMARY',
          title: 'Daily Maid Assignments Summary',
          message: `Successfully assigned ${assignments.length} maids to bookings for ${today.toDateString()}`,
          data: {
            date: today.toISOString(),
            totalAssignments: assignments.length,
            assignments: assignments.slice(0, 5) // Show first 5 assignments
          },
          timestamp: new Date().toISOString()
        });
      }
      
      return assignments;
    } catch (error) {
      console.error('❌ Error in daily maid scheduling:', error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      timestamp: new Date().toISOString(),
      memoryUsage: process.memoryUsage()
    };
  }
}

// Create singleton instance
const monthlyScheduler = new MonthlySubscriptionScheduler();

module.exports = monthlyScheduler;
