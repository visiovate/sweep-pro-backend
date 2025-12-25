const { getRedisConnection } = require('../config/redis');

const FALLBACK_CACHE_TTL_SECONDS = parseInt(process.env.DEFAULT_CACHE_TTL || '60', 10);

const inMemoryCache = new Map();

const getExpiryTimestamp = (ttlSeconds) => Date.now() + ttlSeconds * 1000;

const sweepStaleInMemoryEntries = () => {
  const now = Date.now();
  for (const [key, entry] of inMemoryCache.entries()) {
    if (entry.expiresAt <= now) {
      inMemoryCache.delete(key);
    }
  }
};

async function getCache(key) {
  try {
    const redis = getRedisConnection();
    if (redis) {
      const value = await redis.get(key);
      if (value) {
        return JSON.parse(value);
      }
      return null;
    }
  } catch (error) {
    console.warn('⚠️ Redis cache read failed, falling back to memory store:', error?.message || error);
  }

  sweepStaleInMemoryEntries();
  const fallbackValue = inMemoryCache.get(key);
  if (!fallbackValue) {
    return null;
  }
  if (fallbackValue.expiresAt <= Date.now()) {
    inMemoryCache.delete(key);
    return null;
  }
  return fallbackValue.value;
}

async function setCache(key, value, ttlSeconds = FALLBACK_CACHE_TTL_SECONDS) {
  const ttl = Math.max(ttlSeconds, 1);

  try {
    const redis = getRedisConnection();
    if (redis) {
      await redis.set(key, JSON.stringify(value), 'EX', ttl);
      return;
    }
  } catch (error) {
    console.warn('⚠️ Redis cache write failed, storing in memory:', error?.message || error);
  }

  inMemoryCache.set(key, {
    value,
    expiresAt: getExpiryTimestamp(ttl)
  });
}

async function invalidateCache(key) {
  try {
    const redis = getRedisConnection();
    if (redis) {
      await redis.del(key);
    }
  } catch (error) {
    console.warn('⚠️ Redis cache delete failed:', error?.message || error);
  }

  inMemoryCache.delete(key);
}

module.exports = {
  getCache,
  setCache,
  invalidateCache
};
