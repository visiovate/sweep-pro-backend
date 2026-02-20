const redis = require('ioredis');

// Initialize Redis client for token blacklist
let redisClient = null;

function getRedisClient() {
  if (!redisClient) {
    redisClient = new redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableOfflineQueue: false,
      lazyConnect: true
    });
  }
  return redisClient;
}

/**
 * Add a token to the blacklist
 * @param {string} token - JWT token to blacklist
 * @param {number} expiresIn - Token expiration time in seconds
 */
async function blacklistToken(token, expiresIn = 86400) {
  try {
    const redis = getRedisClient();
    
    // Connect if not already connected
    if (!redis.status || redis.status === 'end') {
      try {
        await redis.connect();
      } catch (e) {
        // Redis not available, but don't fail the logout
        console.warn('⚠️ Could not connect to Redis for token blacklist:', e.message);
        return false;
      }
    }

    // Add token to blacklist with expiration
    await redis.setex(`blacklist:${token}`, expiresIn, 'revoked');
    console.log('✅ Token added to blacklist');
    return true;
  } catch (error) {
    console.error('⚠️ Failed to blacklist token:', error.message);
    // Don't throw error - allow logout to succeed even if blacklist fails
    return false;
  }
}

/**
 * Check if a token is blacklisted
 * @param {string} token - JWT token to check
 * @returns {Promise<boolean>} - True if token is blacklisted, false otherwise
 */
async function isTokenBlacklisted(token) {
  try {
    const redis = getRedisClient();
    
    // Skip check if Redis not available
    if (!redis.status || redis.status === 'end') {
      try {
        await redis.connect();
      } catch (e) {
        // Redis not available, accept the token (fail open)
        console.warn('⚠️ Redis unavailable for token check');
        return false;
      }
    }

    const result = await redis.get(`blacklist:${token}`);
    return result !== null;
  } catch (error) {
    console.error('⚠️ Failed to check token blacklist:', error.message);
    // Fail open - don't block valid tokens if blacklist check fails
    return false;
  }
}

/**
 * Clear all blacklisted tokens (for testing/cleanup)
 */
async function clearBlacklist() {
  try {
    const redis = getRedisClient();
    
    if (!redis.status || redis.status === 'end') {
      await redis.connect();
    }

    await redis.del(await redis.keys('blacklist:*'));
    console.log('✅ Blacklist cleared');
    return true;
  } catch (error) {
    console.error('⚠️ Failed to clear blacklist:', error.message);
    return false;
  }
}

module.exports = {
  blacklistToken,
  isTokenBlacklisted,
  clearBlacklist,
  getRedisClient
};
