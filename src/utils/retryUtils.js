/**
 * Retry Utilities with Exponential Backoff
 * 
 * Production-ready retry logic for database and Redis operations
 * Implements exponential backoff with jitter to prevent thundering herd
 */

/**
 * Calculate backoff delay with jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {number} - Delay in milliseconds
 */
function calculateBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  // Add jitter (±25% randomization)
  const jitter = cappedDelay * 0.25 * (Math.random() - 0.5);
  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxAttempts - Maximum retry attempts
 * @param {number} options.baseDelay - Base delay in ms
 * @param {number} options.maxDelay - Maximum delay in ms
 * @param {Function} options.shouldRetry - Function to determine if should retry (error) => boolean
 * @param {Function} options.onRetry - Callback on retry (error, attempt) => void
 * @returns {Promise<any>} - Result of function
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxAttempts = 5,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = () => true,
    onRetry = () => {},
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      if (!shouldRetry(error)) {
        throw error;
      }
      
      // Check if we've exhausted attempts
      if (attempt === maxAttempts - 1) {
        throw error;
      }
      
      // Calculate backoff delay
      const delay = calculateBackoff(attempt, baseDelay, maxDelay);
      
      // Call retry callback
      onRetry(error, attempt + 1, delay);
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Retry Prisma database operation
 * @param {Function} fn - Async Prisma operation
 * @param {string} operationName - Name for logging
 * @returns {Promise<any>}
 */
async function retryPrismaOperation(fn, operationName = 'DB operation') {
  return retryWithBackoff(fn, {
    maxAttempts: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    shouldRetry: (error) => {
      // Retry on connection errors, timeout, deadlock
      const retryableCodes = [
        'P1001', // Can't reach database server
        'P1002', // Database server timeout
        'P1008', // Operations timed out
        'P1017', // Server has closed the connection
        'P2024', // Timed out fetching a new connection
        'P2034', // Transaction failed due to write conflict
      ];
      
      const isRetryable = retryableCodes.includes(error?.code) ||
                         error?.message?.includes('ECONNREFUSED') ||
                         error?.message?.includes('ETIMEDOUT') ||
                         error?.message?.includes('connection') ||
                         error?.message?.includes('timeout');
      
      return isRetryable;
    },
    onRetry: (error, attempt, delay) => {
      console.warn(
        `⚠️ ${operationName} failed (attempt ${attempt}), retrying in ${delay}ms... ` +
        `Error: ${error?.code || 'UNKNOWN'} - ${error?.message}`
      );
    },
  });
}

/**
 * Retry Redis operation
 * @param {Function} fn - Async Redis operation
 * @param {string} operationName - Name for logging
 * @returns {Promise<any>}
 */
async function retryRedisOperation(fn, operationName = 'Redis operation') {
  return retryWithBackoff(fn, {
    maxAttempts: 5,
    baseDelay: 500,
    maxDelay: 10000,
    shouldRetry: (error) => {
      // Retry on connection errors
      const isRetryable = 
        error?.message?.includes('ECONNREFUSED') ||
        error?.message?.includes('ETIMEDOUT') ||
        error?.message?.includes('connection') ||
        error?.message?.includes('timeout') ||
        error?.message?.includes('closed') ||
        error?.code === 'ENOTFOUND';
      
      return isRetryable;
    },
    onRetry: (error, attempt, delay) => {
      console.warn(
        `⚠️ ${operationName} failed (attempt ${attempt}), retrying in ${delay}ms... ` +
        `Error: ${error?.message}`
      );
    },
  });
}

/**
 * Execute function with timeout
 * @param {Function} fn - Async function
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Operation name for error message
 * @returns {Promise<any>}
 */
async function withTimeout(fn, timeoutMs, operationName = 'Operation') {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Create a circuit breaker for operations
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async execute(fn, operationName = 'Operation') {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`${operationName} circuit breaker is OPEN. Try again later.`);
      }
      // Try to transition to HALF_OPEN
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      // Success - reset circuit breaker
      if (this.state === 'HALF_OPEN') {
        console.log(`✅ ${operationName} circuit breaker transitioning to CLOSED`);
        this.state = 'CLOSED';
        this.failures = 0;
      }
      return result;
    } catch (error) {
      this.failures++;
      
      if (this.failures >= this.failureThreshold) {
        this.state = 'OPEN';
        this.nextAttempt = Date.now() + this.resetTimeout;
        console.error(
          `🔴 ${operationName} circuit breaker OPEN after ${this.failures} failures. ` +
          `Will retry at ${new Date(this.nextAttempt).toISOString()}`
        );
      }
      
      throw error;
    }
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.nextAttempt = Date.now();
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      nextAttempt: new Date(this.nextAttempt).toISOString(),
    };
  }
}

module.exports = {
  calculateBackoff,
  sleep,
  retryWithBackoff,
  retryPrismaOperation,
  retryRedisOperation,
  withTimeout,
  CircuitBreaker,
};
