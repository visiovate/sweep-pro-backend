const Redis = require('ioredis');
const dotenv = require('dotenv');

dotenv.config();

/**
 * Redis connection configuration for BullMQ
 * Supports both local development (Redis on localhost) and production (Redis Cloud/Render)
 */

// Parse Redis URL or use individual connection parameters
const createRedisConnection = () => {
  const redisConfig = {
    // Connection parameters
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    
    // Retry strategy
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      console.log(`⏳ Redis reconnecting... attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
    
    // Connection timeout
    connectTimeout: 10000,
    
    // Keep alive
    keepAlive: 30000,
  };

  // If Redis password is provided (for production)
  if (process.env.REDIS_PASSWORD) {
    redisConfig.password = process.env.REDIS_PASSWORD;
  }

  // If Redis URL is provided (alternative to individual params)
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  return new Redis(redisConfig);
};

// Create shared Redis connection
let redisConnection = null;

const getRedisConnection = () => {
  if (!redisConnection) {
    redisConnection = createRedisConnection();
    
    redisConnection.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });
    
    redisConnection.on('error', (err) => {
      console.error('❌ Redis connection error:', err);
    });
    
    redisConnection.on('close', () => {
      console.log('⚠️ Redis connection closed');
    });
    
    redisConnection.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });
  }
  
  return redisConnection;
};

// Graceful shutdown
const closeRedisConnection = async () => {
  if (redisConnection) {
    console.log('🔌 Closing Redis connection...');
    await redisConnection.quit();
    redisConnection = null;
    console.log('✅ Redis connection closed');
  }
};

// Test Redis connection
const testRedisConnection = async () => {
  try {
    const redis = getRedisConnection();
    await redis.ping();
    console.log('✅ Redis connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Redis connection test failed:', error);
    return false;
  }
};

module.exports = {
  getRedisConnection,
  closeRedisConnection,
  testRedisConnection,
  createRedisConnection
};
