const cron = require('node-cron');
const BufferDayService = require('../services/BufferDayService');

class BufferPeriodScheduler {
  constructor() {
    this.bufferService = new BufferDayService();
    this.isRunning = false;
  }

  /**
   * Start the buffer period scheduler
   * Runs every hour to check for expired buffer periods
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Buffer period scheduler is already running');
      return;
    }

    // Run every hour at minute 0
    this.job = cron.schedule('0 * * * *', async () => {
      console.log('🔄 Running buffer period expiration check...');
      try {
        const result = await this.bufferService.processExpiredBufferPeriods();
        if (result.processedCount > 0) {
          console.log(`✅ Processed ${result.processedCount} expired buffer periods`);
        }
      } catch (error) {
        console.error('❌ Error in buffer period scheduler:', error);
      }
    }, {
      scheduled: false,
      timezone: "Asia/Kolkata" // Adjust timezone as needed
    });

    this.job.start();
    this.isRunning = true;
    console.log('🚀 Buffer period scheduler started - checking for expired buffer periods every hour');

    // Run immediately on startup to catch any periods that expired while server was down
    this.runImmediateCheck();
  }

  /**
   * Stop the buffer period scheduler
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.isRunning = false;
      console.log('🛑 Buffer period scheduler stopped');
    }
  }

  /**
   * Run an immediate check for expired buffer periods
   */
  async runImmediateCheck() {
    console.log('🔄 Running immediate buffer period expiration check...');
    try {
      const result = await this.bufferService.processExpiredBufferPeriods();
      if (result.processedCount > 0) {
        console.log(`✅ Immediate check: Processed ${result.processedCount} expired buffer periods`);
      } else {
        console.log('✅ Immediate check: No expired buffer periods found');
      }
    } catch (error) {
      console.error('❌ Error in immediate buffer period check:', error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      nextRun: this.job ? this.job.nextDates() : null
    };
  }
}

module.exports = new BufferPeriodScheduler();
