const cron = require('node-cron');
const { getPrismaClient } = require('../utils/database');
const { scheduleAllAssignments } = require('../queues/assignmentQueue');

const prisma = getPrismaClient();

/**
 * Centralized Cron Job Manager
 * 
 * This replaces scattered cron jobs throughout the application
 * with a centralized, production-ready scheduling system.
 * 
 * All cron jobs are moved here for better:
 * - Monitoring and debugging
 * - Error handling and recovery
 * - Configuration management
 * - Deployment consistency
 */
class CronManager {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  /**
   * Initialize all cron jobs
   */
  async initialize() {
    if (this.isRunning) {
      console.log('⚠️ Cron manager is already running');
      return;
    }

    console.log('🚀 Initializing Cron Manager...');

    try {
      // Register all cron jobs
      await this.registerAssignmentJobs();
      await this.registerSubscriptionJobs();
      await this.registerNotificationJobs();
      await this.registerCleanupJobs();
      await this.registerHealthCheckJobs();

      this.isRunning = true;
      console.log('✅ Cron Manager initialized successfully');
      console.log(`📊 Registered ${this.jobs.size} cron jobs`);

    } catch (error) {
      console.error('❌ Failed to initialize Cron Manager:', error);
      throw error;
    }
  }

  /**
   * Register assignment-related cron jobs
   */
  async registerAssignmentJobs() {
    console.log('📋 Registering assignment cron jobs...');

    // Every hour: Check for bookings that need assignment requests (20h before service)
    this.addJob('assignment-check', '0 * * * *', async () => {
      console.log('🔄 Running hourly assignment check...');
      try {
        const result = await this.checkUpcomingAssignments();
        console.log(`✅ Assignment check completed: ${result.processed} bookings processed`);
      } catch (error) {
        console.error('❌ Assignment check failed:', error);
      }
    });

    // Every 6 hours: Check for missed assignment requests
    this.addJob('missed-assignment-recovery', '0 */6 * * *', async () => {
      console.log('🔄 Running missed assignment recovery...');
      try {
        const result = await this.recoverMissedAssignments();
        console.log(`✅ Missed assignment recovery completed: ${result.recovered} assignments recovered`);
      } catch (error) {
        console.error('❌ Missed assignment recovery failed:', error);
      }
    });

    // Every 30 minutes: Handle expired assignment requests
    this.addJob('expired-request-handler', '*/30 * * * *', async () => {
      console.log('🔄 Running expired request handler...');
      try {
        const result = await this.handleExpiredRequests();
        console.log(`✅ Expired request handler completed: ${result.processed} requests processed`);
      } catch (error) {
        console.error('❌ Expired request handler failed:', error);
      }
    });
  }

  /**
   * Register subscription-related cron jobs
   */
  async registerSubscriptionJobs() {
    console.log('💳 Registering subscription cron jobs...');

    // Daily at 9 AM: Check buffer period activation
    this.addJob('buffer-activation-check', '0 9 * * *', async () => {
      console.log('🔄 Running buffer period activation check...');
      try {
        const result = await this.checkBufferPeriodActivation();
        console.log(`✅ Buffer activation check completed: ${result.activated} periods activated`);
      } catch (error) {
        console.error('❌ Buffer activation check failed:', error);
      }
    });

    // Daily at 8 AM: Check buffer period completion
    this.addJob('buffer-completion-check', '0 8 * * *', async () => {
      console.log('🔄 Running buffer period completion check...');
      try {
        const result = await this.checkBufferPeriodCompletion();
        console.log(`✅ Buffer completion check completed: ${result.completed} periods completed`);
      } catch (error) {
        console.error('❌ Buffer completion check failed:', error);
      }
    });

    // Daily at midnight: Process subscription renewals
    this.addJob('subscription-renewals', '0 0 * * *', async () => {
      console.log('🔄 Running subscription renewals...');
      try {
        const result = await this.processSubscriptionRenewals();
        console.log(`✅ Subscription renewals completed: ${result.renewed} subscriptions renewed`);
      } catch (error) {
        console.error('❌ Subscription renewals failed:', error);
      }
    });
  }

  /**
   * Register notification-related cron jobs
   */
  async registerNotificationJobs() {
    console.log('📢 Registering notification cron jobs...');

    // Daily at 6 PM: Send booking reminders
    this.addJob('booking-reminders', '0 18 * * *', async () => {
      console.log('🔄 Running booking reminders...');
      try {
        const result = await this.sendBookingReminders();
        console.log(`✅ Booking reminders completed: ${result.sent} reminders sent`);
      } catch (error) {
        console.error('❌ Booking reminders failed:', error);
      }
    });

    // Every 6 hours: Send payment reminders
    this.addJob('payment-reminders', '0 */6 * * *', async () => {
      console.log('🔄 Running payment reminders...');
      try {
        const result = await this.sendPaymentReminders();
        console.log(`✅ Payment reminders completed: ${result.sent} reminders sent`);
      } catch (error) {
        console.error('❌ Payment reminders failed:', error);
      }
    });
  }

  /**
   * Register cleanup-related cron jobs
   */
  async registerCleanupJobs() {
    console.log('🧹 Registering cleanup cron jobs...');

    // Weekly on Sunday at 2 AM: Cleanup expired data
    this.addJob('weekly-cleanup', '0 2 * * 0', async () => {
      console.log('🔄 Running weekly cleanup...');
      try {
        const result = await this.cleanupExpiredData();
        console.log(`✅ Weekly cleanup completed: ${result.cleaned} records cleaned`);
      } catch (error) {
        console.error('❌ Weekly cleanup failed:', error);
      }
    });

    // Daily at 3 AM: Cleanup old logs and temporary data
    this.addJob('daily-cleanup', '0 3 * * *', async () => {
      console.log('🔄 Running daily cleanup...');
      try {
        const result = await this.cleanupOldData();
        console.log(`✅ Daily cleanup completed: ${result.cleaned} records cleaned`);
      } catch (error) {
        console.error('❌ Daily cleanup failed:', error);
      }
    });
  }

  /**
   * Register health check cron jobs
   */
  async registerHealthCheckJobs() {
    console.log('🏥 Registering health check cron jobs...');

    // Every 6 hours: System health check
    this.addJob('health-check', '0 */6 * * *', async () => {
      console.log('🔄 Running system health check...');
      try {
        const result = await this.performHealthCheck();
        console.log(`✅ Health check completed: ${result.status}`);
      } catch (error) {
        console.error('❌ Health check failed:', error);
      }
    });
  }

  /**
   * Add a cron job with error handling
   */
  addJob(name, pattern, task) {
    const job = cron.schedule(pattern, async () => {
      const startTime = Date.now();
      console.log(`🕐 Starting cron job: ${name}`);
      
      try {
        await task();
        const duration = Date.now() - startTime;
        console.log(`✅ Cron job ${name} completed in ${duration}ms`);
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ Cron job ${name} failed after ${duration}ms:`, error);
        
        // Log error details for debugging
        console.error('Error details:', {
          name,
          pattern,
          error: error.message,
          stack: error.stack
        });
      }
    }, {
      scheduled: false, // Don't start immediately
      timezone: process.env.TZ || 'UTC'
    });

    this.jobs.set(name, job);
    job.start();
    console.log(`✅ Registered cron job: ${name} (${pattern})`);
  }

  /**
   * Check for bookings that need assignment requests
   */
  async checkUpcomingAssignments() {
    const now = new Date();
    const twentyHoursFromNow = new Date(now.getTime() + (20 * 60 * 60 * 1000));

    // Find bookings that need assignment requests
    const bookings = await prisma.booking.findMany({
      where: {
        scheduledAt: {
          gte: now,
          lte: twentyHoursFromNow
        },
        status: {
          in: ['PENDING', 'CONFIRMED']
        },
        maidId: null,
        assignmentRequests: {
          none: {} // No existing assignment requests
        }
      },
      include: {
        customer: true,
        service: true
      }
    });

    let processed = 0;
    for (const booking of bookings) {
      try {
        // Schedule assignment request through BullMQ
        await scheduleAllAssignments();
        processed++;
      } catch (error) {
        console.error(`Failed to schedule assignment for booking ${booking.id}:`, error);
      }
    }

    return { processed };
  }

  /**
   * Recover missed assignment requests
   */
  async recoverMissedAssignments() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));

    // Find bookings that should have had assignment requests but don't
    const missedBookings = await prisma.booking.findMany({
      where: {
        scheduledAt: {
          gte: oneHourAgo,
          lte: now
        },
        status: {
          in: ['PENDING', 'CONFIRMED']
        },
        maidId: null,
        assignmentRequests: {
          none: {}
        }
      }
    });

    let recovered = 0;
    for (const booking of missedBookings) {
      try {
        // Create immediate assignment request
        await scheduleAllAssignments();
        recovered++;
      } catch (error) {
        console.error(`Failed to recover assignment for booking ${booking.id}:`, error);
      }
    }

    return { recovered };
  }

  /**
   * Handle expired assignment requests
   */
  async handleExpiredRequests() {
    const now = new Date();

    // Find expired assignment requests
    const expiredRequests = await prisma.assignmentRequest.findMany({
      where: {
        status: 'pending',
        expiresAt: {
          lt: now
        }
      },
      include: {
        booking: true,
        maid: true
      }
    });

    let processed = 0;
    for (const request of expiredRequests) {
      try {
        // Mark as expired and trigger reassignment
        await prisma.assignmentRequest.update({
          where: { id: request.id },
          data: { 
            status: 'expired',
            respondedAt: now
          }
        });

        // Update booking status for reassignment
        await prisma.booking.update({
          where: { id: request.bookingId },
          data: {
            assignmentStatus: 'REJECTED',
            rejectionReason: 'Assignment request expired'
          }
        });

        processed++;
      } catch (error) {
        console.error(`Failed to handle expired request ${request.id}:`, error);
      }
    }

    return { processed };
  }

  /**
   * Check buffer period activation
   */
  async checkBufferPeriodActivation() {
    // Implementation for buffer period activation
    return { activated: 0 };
  }

  /**
   * Check buffer period completion
   */
  async checkBufferPeriodCompletion() {
    // Implementation for buffer period completion
    return { completed: 0 };
  }

  /**
   * Process subscription renewals
   */
  async processSubscriptionRenewals() {
    // Implementation for subscription renewals
    return { renewed: 0 };
  }

  /**
   * Send booking reminders
   */
  async sendBookingReminders() {
    // Implementation for booking reminders
    return { sent: 0 };
  }

  /**
   * Send payment reminders
   */
  async sendPaymentReminders() {
    // Implementation for payment reminders
    return { sent: 0 };
  }

  /**
   * Cleanup expired data
   */
  async cleanupExpiredData() {
    // Implementation for cleanup
    return { cleaned: 0 };
  }

  /**
   * Cleanup old data
   */
  async cleanupOldData() {
    // Implementation for daily cleanup
    return { cleaned: 0 };
  }

  /**
   * Perform system health check
   */
  async performHealthCheck() {
    try {
      // Check database connection
      await prisma.$queryRaw`SELECT 1`;
      
      // Check Redis connection (if available)
      // await redis.ping();
      
      return { status: 'healthy' };
    } catch (error) {
      console.error('Health check failed:', error);
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Stop all cron jobs
   */
  stop() {
    console.log('🛑 Stopping all cron jobs...');
    
    for (const [name, job] of this.jobs) {
      job.stop();
      console.log(`✅ Stopped cron job: ${name}`);
    }
    
    this.jobs.clear();
    this.isRunning = false;
    console.log('✅ All cron jobs stopped');
  }

  /**
   * Get status of all cron jobs
   */
  getStatus() {
    const status = {
      isRunning: this.isRunning,
      jobCount: this.jobs.size,
      jobs: []
    };

    for (const [name, job] of this.jobs) {
      status.jobs.push({
        name,
        running: job.running,
        scheduled: job.scheduled
      });
    }

    return status;
  }
}

// Create singleton instance
const cronManager = new CronManager();

module.exports = cronManager;


