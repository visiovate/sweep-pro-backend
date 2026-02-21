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

    // Ensure Redis is connected
    if (!redis.status || redis.status === 'end') {
      try {
        await redis.connect();
      } catch (e) {
        // C5 FIX: FAIL CLOSED in production when Redis is unavailable.
        // In local development, we FAIL OPEN so developers without Redis
        // running aren't trapped in endless login loops.
        const msg = '⚠️ Redis unavailable for token blacklist check';
        if (process.env.NODE_ENV === 'production') {
          console.warn(`${msg} – failing CLOSED (rejecting token)`);
          return true; // Token rejected
        } else {
          console.warn(`${msg} – failing OPEN for local development`);
          return false; // Token accepted
        }
      }
    }

    const result = await redis.get(`blacklist:${token}`);
    return result !== null;
  } catch (error) {
    const msg = `⚠️ Failed to check token blacklist: ${error.message}`;
    if (process.env.NODE_ENV === 'production') {
      console.error(`${msg} - failing CLOSED`);
      return true;
    } else {
      console.error(`${msg} - failing OPEN for local development`);
      return false;
    }
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

    // M10 FIX: Use SCAN instead of KEYS to avoid blocking Redis.
    // KEYS 'blacklist:*' is O(N) and blocks all other commands while running.
    // SCAN iterates in small chunks and is non-blocking.
    let cursor = '0';
    let totalDeleted = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'blacklist:*', 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== '0');

    console.log(`✅ Blacklist cleared (${totalDeleted} entries removed)`);
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
