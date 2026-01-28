const { Queue } = require('bullmq');
const { createRedisConnection } = require('../../config/redis');

const connection = createRedisConnection();

// Dedicated queue for all notification deliveries.
const notificationQueue = new Queue('notifications', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 10_000
    },
    removeOnComplete: {
      count: 1000,
      age: 24 * 3600
    },
    removeOnFail: {
      count: 500,
      age: 7 * 24 * 3600
    }
  },
  settings: {
    stalledInterval: 30_000,
    maxStalledCount: 1
  }
});

module.exports = {
  notificationQueue
};
