/**
 * Notification Error Handler
 * Production-ready error handling and monitoring for notification system
 */

class NotificationErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 1000;
    this.errorCounts = {};
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      threshold: 10, // Open circuit after 10 failures
      resetTimeout: 60000 // Reset after 1 minute
    };
  }

  /**
   * Log notification error with context
   */
  logError(error, context = {}) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      context,
      severity: this.determineSeverity(error)
    };

    // Add to error log
    this.errorLog.push(errorEntry);
    
    // Trim log if too large
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }

    // Update error counts
    const errorKey = error.message || 'unknown';
    this.errorCounts[errorKey] = (this.errorCounts[errorKey] || 0) + 1;

    // Update circuit breaker
    this.updateCircuitBreaker(error);

    // Log to console based on severity
    this.logToConsole(errorEntry);

    return errorEntry;
  }

  /**
   * Determine error severity
   */
  determineSeverity(error) {
    const criticalErrors = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'database connection',
      'authentication failed'
    ];

    const errorMessage = error.message?.toLowerCase() || '';
    
    if (criticalErrors.some(critical => errorMessage.includes(critical.toLowerCase()))) {
      return 'CRITICAL';
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
      return 'HIGH';
    }

    return 'MEDIUM';
  }

  /**
   * Log to console with appropriate level
   */
  logToConsole(errorEntry) {
    const { timestamp, error, context, severity } = errorEntry;

    switch (severity) {
      case 'CRITICAL':
        console.error(`🚨 [NotificationError CRITICAL] ${timestamp}: ${error}`, context);
        break;
      case 'HIGH':
        console.error(`⚠️  [NotificationError HIGH] ${timestamp}: ${error}`, context);
        break;
      default:
        console.warn(`📝 [NotificationError MEDIUM] ${timestamp}: ${error}`, context);
    }
  }

  /**
   * Update circuit breaker state
   */
  updateCircuitBreaker(error) {
    const now = Date.now();
    
    // Increment failure count
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = now;

    // Check if threshold reached
    if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
      this.circuitBreaker.isOpen = true;
      console.error('🔌 [CircuitBreaker] Circuit opened due to high failure rate');
    }
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitOpen() {
    const now = Date.now();
    
    // Auto-reset after timeout
    if (this.circuitBreaker.isOpen && 
        this.circuitBreaker.lastFailureTime && 
        now - this.circuitBreaker.lastFailureTime > this.circuitBreaker.resetTimeout) {
      this.resetCircuitBreaker();
    }

    return this.circuitBreaker.isOpen;
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      threshold: this.circuitBreaker.threshold,
      resetTimeout: this.circuitBreaker.resetTimeout
    };
    console.log('🔄 [CircuitBreaker] Circuit reset');
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    return {
      totalErrors: this.errorLog.length,
      errorCounts: this.errorCounts,
      circuitBreaker: {
        isOpen: this.circuitBreaker.isOpen,
        failureCount: this.circuitBreaker.failureCount,
        lastFailureTime: this.circuitBreaker.lastFailureTime
      },
      recentErrors: this.errorLog.slice(-10) // Last 10 errors
    };
  }

  /**
   * Clear error log
   */
  clearErrorLog() {
    this.errorLog = [];
    this.errorCounts = {};
    console.log('🧹 [NotificationErrorHandler] Error log cleared');
  }

  /**
   * Wrap async function with error handling
   */
  async withErrorHandling(fn, context = {}) {
    if (this.isCircuitOpen()) {
      throw new Error('Circuit breaker is open - notifications temporarily disabled');
    }

    try {
      return await fn();
    } catch (error) {
      this.logError(error, context);
      throw error;
    }
  }
}

module.exports = new NotificationErrorHandler();
