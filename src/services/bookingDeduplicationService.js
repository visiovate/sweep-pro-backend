const { getRedisConnection } = require('../config/redis');

/**
 * Booking Deduplication Service using Redis
 * Prevents duplicate booking requests from being sent to the same maid
 * Stores booking request hashes with TTL to avoid conflicts on server restarts
 */
class BookingDeduplicationService {
  constructor() {
    this.redis = null;
    this.keyPrefix = 'booking:dedup:';
    this.defaultTTL = 24 * 60 * 60; // 24 hours in seconds
  }

  /**
   * Initialize Redis connection
   */
  async init() {
    try {
      this.redis = getRedisConnection();
      await this.redis.connect();
      console.log('✅ Booking Deduplication Service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Booking Deduplication Service:', error);
      return false;
    }
  }

  /**
   * Generate a unique key for a booking request
   * Format: booking:dedup:{customerId}:{maidId}:{date}
   */
  generateKey(customerId, maidId, scheduledDate) {
    // Extract just the date part (YYYY-MM-DD) to avoid time differences
    const dateStr = new Date(scheduledDate).toISOString().split('T')[0];
    return `${this.keyPrefix}${customerId}:${maidId}:${dateStr}`;
  }

  /**
   * Check if a booking request already exists
   * @returns {Promise<boolean>} true if request exists (duplicate), false if new
   */
  async isDuplicate(customerId, maidId, scheduledDate) {
    if (!this.redis) {
      console.warn('⚠️ Redis not initialized, skipping deduplication check');
      return false;
    }

    try {
      const key = this.generateKey(customerId, maidId, scheduledDate);
      const exists = await this.redis.exists(key);
      
      if (exists) {
        console.log(`🚫 Duplicate booking request detected: ${key}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Error checking duplicate booking:', error);
      // On error, allow the request to proceed (fail open)
      return false;
    }
  }

  /**
   * Mark a booking request as processed
   * @param {string} customerId - Customer ID
   * @param {string} maidId - Maid ID
   * @param {Date|string} scheduledDate - Scheduled date
   * @param {number} ttl - Time to live in seconds (default: 24 hours)
   * @returns {Promise<boolean>} true if successfully marked
   */
  async markAsProcessed(customerId, maidId, scheduledDate, ttl = this.defaultTTL) {
    if (!this.redis) {
      console.warn('⚠️ Redis not initialized, skipping deduplication marking');
      return false;
    }

    try {
      const key = this.generateKey(customerId, maidId, scheduledDate);
      const timestamp = new Date().toISOString();
      
      // Store with metadata
      const data = JSON.stringify({
        customerId,
        maidId,
        scheduledDate,
        markedAt: timestamp
      });
      
      await this.redis.setex(key, ttl, data);
      console.log(`✅ Marked booking request as processed: ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      console.error('❌ Error marking booking as processed:', error);
      return false;
    }
  }

  /**
   * Check and mark in one atomic operation
   * @returns {Promise<boolean>} true if new request (not duplicate), false if duplicate
   */
  async checkAndMark(customerId, maidId, scheduledDate, ttl = this.defaultTTL) {
    if (!this.redis) {
      console.warn('⚠️ Redis not initialized, allowing request without deduplication');
      return true;
    }

    try {
      const key = this.generateKey(customerId, maidId, scheduledDate);
      const timestamp = new Date().toISOString();
      
      const data = JSON.stringify({
        customerId,
        maidId,
        scheduledDate,
        markedAt: timestamp
      });
      
      // Use SET with NX (only set if not exists) and EX (expiry)
      const result = await this.redis.set(key, data, 'EX', ttl, 'NX');
      
      if (result === 'OK') {
        console.log(`✅ New booking request marked: ${key}`);
        return true; // New request
      } else {
        console.log(`🚫 Duplicate booking request prevented: ${key}`);
        return false; // Duplicate
      }
    } catch (error) {
      console.error('❌ Error in checkAndMark:', error);
      // On error, allow the request to proceed (fail open)
      return true;
    }
  }

  /**
   * Remove a booking request marker (e.g., if booking was cancelled)
   */
  async remove(customerId, maidId, scheduledDate) {
    if (!this.redis) {
      return false;
    }

    try {
      const key = this.generateKey(customerId, maidId, scheduledDate);
      await this.redis.del(key);
      console.log(`🗑️ Removed booking request marker: ${key}`);
      return true;
    } catch (error) {
      console.error('❌ Error removing booking marker:', error);
      return false;
    }
  }

  /**
   * Get information about a booking request
   */
  async getInfo(customerId, maidId, scheduledDate) {
    if (!this.redis) {
      return null;
    }

    try {
      const key = this.generateKey(customerId, maidId, scheduledDate);
      const data = await this.redis.get(key);
      
      if (data) {
        return JSON.parse(data);
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error getting booking info:', error);
      return null;
    }
  }

  /**
   * Clear all booking deduplication keys (use with caution)
   */
  async clearAll() {
    if (!this.redis) {
      return false;
    }

    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`🗑️ Cleared ${keys.length} booking deduplication keys`);
      }
      return true;
    } catch (error) {
      console.error('❌ Error clearing booking markers:', error);
      return false;
    }
  }

  /**
   * Get statistics about stored booking requests
   */
  async getStats() {
    if (!this.redis) {
      return { total: 0, keys: [] };
    }

    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      return {
        total: keys.length,
        keys: keys.map(k => k.replace(this.keyPrefix, ''))
      };
    } catch (error) {
      console.error('❌ Error getting stats:', error);
      return { total: 0, keys: [] };
    }
  }
}

// Create singleton instance
const bookingDeduplicationService = new BookingDeduplicationService();

module.exports = bookingDeduplicationService;
