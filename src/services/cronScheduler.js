const cron = require('node-cron');
const AutomaticAssignmentService = require('./automaticAssignmentService');

/**
 * Cron job scheduler for automatic assignment requests
 */
class CronScheduler {
  
  static init() {
    console.log('🕐 Initializing automatic assignment cron jobs...');
    
    // Run every hour to check for assignment requests that need to be created
    // This ensures we don't miss any time slots
    const hourlyJob = cron.schedule('0 * * * *', async () => {
      console.log('⏰ Running hourly automatic assignment check...');
      try {
        const result = await AutomaticAssignmentService.processAutomaticRequests();
        if (result.created > 0) {
          console.log(`✅ Created ${result.created} automatic assignment requests`);
        }
      } catch (error) {
        console.error('❌ Hourly assignment check failed:', error);
      }
    }, {
      scheduled: false // Don't start immediately
    });

    // Run every 15 minutes for more precise timing
    const quarterHourlyJob = cron.schedule('*/15 * * * *', async () => {
      console.log('🔄 Running 15-minute automatic assignment check...');
      try {
        const result = await AutomaticAssignmentService.processAutomaticRequests();
        if (result.created > 0) {
          console.log(`✅ Created ${result.created} automatic assignment requests`);
        }
      } catch (error) {
        console.error('❌ 15-minute assignment check failed:', error);
      }
    }, {
      scheduled: false
    });

    // Daily cleanup job at midnight
    const dailyCleanupJob = cron.schedule('0 0 * * *', async () => {
      console.log('🧹 Running daily cleanup...');
      try {
        // Add any cleanup tasks here
        console.log('✅ Daily cleanup completed');
      } catch (error) {
        console.error('❌ Daily cleanup failed:', error);
      }
    }, {
      scheduled: false
    });

    return {
      hourlyJob,
      quarterHourlyJob,
      dailyCleanupJob,
      
      start() {
        console.log('▶️ Starting automatic assignment cron jobs...');
        hourlyJob.start();
        quarterHourlyJob.start();
        dailyCleanupJob.start();
        console.log('✅ All cron jobs started successfully');
      },
      
      stop() {
        console.log('⏸️ Stopping automatic assignment cron jobs...');
        hourlyJob.stop();
        quarterHourlyJob.stop();
        dailyCleanupJob.stop();
        console.log('✅ All cron jobs stopped');
      },
      
      getStatus() {
        return {
          hourlyJob: hourlyJob.getStatus(),
          quarterHourlyJob: quarterHourlyJob.getStatus(),
          dailyCleanupJob: dailyCleanupJob.getStatus()
        };
      }
    };
  }
  
  /**
   * Manual trigger for testing
   */
  static async triggerManual() {
    console.log('🔧 Manual trigger for automatic assignment processing');
    try {
      const result = await AutomaticAssignmentService.processAutomaticRequests();
      console.log('✅ Manual trigger completed:', result);
      return result;
    } catch (error) {
      console.error('❌ Manual trigger failed:', error);
      throw error;
    }
  }
}

module.exports = CronScheduler;
