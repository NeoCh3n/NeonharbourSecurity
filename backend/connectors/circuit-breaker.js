/**
 * Circuit Breaker Implementation for Connector Framework
 * 
 * Implements circuit breaker pattern to handle external service failures
 * Prevents cascading failures and provides graceful degradation
 */

const EventEmitter = require('events');

/**
 * Circuit breaker states
 */
const CircuitState = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Failing fast, not calling service
  HALF_OPEN: 'HALF_OPEN' // Testing if service has recovered
};

/**
 * Circuit breaker implementation
 */
class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 3;
    this.successThreshold = options.successThreshold || 2;
    
    // State
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.halfOpenCalls = 0;
    
    // Metrics
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      averageResponseTime: 0,
      lastCallTime: null,
      stateChanges: 0
    };
    
    // Call history for monitoring period
    this.callHistory = [];
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @param {...any} args - Arguments to pass to function
   * @returns {Promise<any>} Function result
   */
  async execute(fn, ...args) {
    const startTime = Date.now();
    this.metrics.totalCalls++;
    this.metrics.lastCallTime = startTime;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        this.metrics.rejectedCalls++;
        const error = new Error('Circuit breaker is OPEN');
        error.code = 'CIRCUIT_BREAKER_OPEN';
        this.emit('callRejected', { reason: 'circuit_open', error });
        throw error;
      } else {
        // Transition to half-open
        this.transitionToHalfOpen();
      }
    }

    // Check if we're in half-open and have exceeded max calls
    if (this.state === CircuitState.HALF_OPEN && this.halfOpenCalls >= this.halfOpenMaxCalls) {
      this.metrics.rejectedCalls++;
      const error = new Error('Circuit breaker is HALF_OPEN with max calls reached');
      error.code = 'CIRCUIT_BREAKER_HALF_OPEN_LIMIT';
      this.emit('callRejected', { reason: 'half_open_limit', error });
      throw error;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls++;
    }

    try {
      // Execute the function
      const result = await fn(...args);
      
      // Record success
      this.onSuccess(Date.now() - startTime);
      
      return result;
    } catch (error) {
      // Record failure
      this.onFailure(error, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Handle successful call
   * @param {number} responseTime - Response time in milliseconds
   */
  onSuccess(responseTime) {
    this.metrics.successfulCalls++;
    this.updateAverageResponseTime(responseTime);
    this.addToCallHistory(true, responseTime);

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.successThreshold) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
    }

    this.emit('callSuccess', { 
      responseTime, 
      state: this.state,
      successCount: this.successCount 
    });
  }

  /**
   * Handle failed call
   * @param {Error} error - Error that occurred
   * @param {number} responseTime - Response time in milliseconds
   */
  onFailure(error, responseTime) {
    this.metrics.failedCalls++;
    this.updateAverageResponseTime(responseTime);
    this.addToCallHistory(false, responseTime);
    
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state transitions back to open
      this.transitionToOpen();
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should transition to open
      if (this.shouldTransitionToOpen()) {
        this.transitionToOpen();
      }
    }

    this.emit('callFailure', { 
      error, 
      responseTime, 
      state: this.state,
      failureCount: this.failureCount 
    });
  }

  /**
   * Check if circuit should transition to open state
   * @returns {boolean} True if should transition to open
   */
  shouldTransitionToOpen() {
    // Simple threshold-based check
    if (this.failureCount >= this.failureThreshold) {
      return true;
    }

    // Check failure rate in monitoring period
    const recentCalls = this.getRecentCalls();
    if (recentCalls.length >= this.failureThreshold) {
      const failureRate = recentCalls.filter(call => !call.success).length / recentCalls.length;
      return failureRate >= 0.5; // 50% failure rate
    }

    return false;
  }

  /**
   * Transition to CLOSED state
   */
  transitionToClosed() {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
    this.nextAttemptTime = null;
    this.metrics.stateChanges++;

    this.emit('stateChange', {
      from: previousState,
      to: this.state,
      timestamp: Date.now()
    });
  }

  /**
   * Transition to OPEN state
   */
  transitionToOpen() {
    const previousState = this.state;
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.recoveryTimeout;
    this.successCount = 0;
    this.halfOpenCalls = 0;
    this.metrics.stateChanges++;

    this.emit('stateChange', {
      from: previousState,
      to: this.state,
      timestamp: Date.now(),
      nextAttemptTime: this.nextAttemptTime
    });
  }

  /**
   * Transition to HALF_OPEN state
   */
  transitionToHalfOpen() {
    const previousState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.successCount = 0;
    this.halfOpenCalls = 0;
    this.nextAttemptTime = null;
    this.metrics.stateChanges++;

    this.emit('stateChange', {
      from: previousState,
      to: this.state,
      timestamp: Date.now()
    });
  }

  /**
   * Add call to history for monitoring
   * @param {boolean} success - Whether call was successful
   * @param {number} responseTime - Response time in milliseconds
   */
  addToCallHistory(success, responseTime) {
    const now = Date.now();
    this.callHistory.push({
      timestamp: now,
      success,
      responseTime
    });

    // Remove old entries outside monitoring period
    const cutoff = now - this.monitoringPeriod;
    this.callHistory = this.callHistory.filter(call => call.timestamp > cutoff);
  }

  /**
   * Get recent calls within monitoring period
   * @returns {Array} Recent call history
   */
  getRecentCalls() {
    const cutoff = Date.now() - this.monitoringPeriod;
    return this.callHistory.filter(call => call.timestamp > cutoff);
  }

  /**
   * Update average response time
   * @param {number} responseTime - Response time in milliseconds
   */
  updateAverageResponseTime(responseTime) {
    const totalCalls = this.metrics.successfulCalls + this.metrics.failedCalls;
    const totalTime = this.metrics.averageResponseTime * (totalCalls - 1) + responseTime;
    this.metrics.averageResponseTime = totalTime / totalCalls;
  }

  /**
   * Get current circuit breaker status
   * @returns {Object} Current status
   */
  getStatus() {
    const recentCalls = this.getRecentCalls();
    const recentFailureRate = recentCalls.length > 0 ? 
      recentCalls.filter(call => !call.success).length / recentCalls.length : 0;

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      halfOpenCalls: this.halfOpenCalls,
      recentFailureRate,
      recentCallsCount: recentCalls.length,
      metrics: { ...this.metrics },
      config: {
        failureThreshold: this.failureThreshold,
        recoveryTimeout: this.recoveryTimeout,
        monitoringPeriod: this.monitoringPeriod,
        halfOpenMaxCalls: this.halfOpenMaxCalls,
        successThreshold: this.successThreshold
      }
    };
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset() {
    this.transitionToClosed();
    this.callHistory = [];
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      averageResponseTime: 0,
      lastCallTime: null,
      stateChanges: 0
    };

    this.emit('reset', { timestamp: Date.now() });
  }

  /**
   * Force circuit breaker to open state
   */
  forceOpen() {
    this.transitionToOpen();
    this.emit('forceOpen', { timestamp: Date.now() });
  }

  /**
   * Force circuit breaker to closed state
   */
  forceClosed() {
    this.transitionToClosed();
    this.emit('forceClosed', { timestamp: Date.now() });
  }

  /**
   * Check if circuit breaker allows calls
   * @returns {boolean} True if calls are allowed
   */
  allowsCall() {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }
    
    if (this.state === CircuitState.OPEN) {
      return Date.now() >= this.nextAttemptTime;
    }
    
    if (this.state === CircuitState.HALF_OPEN) {
      return this.halfOpenCalls < this.halfOpenMaxCalls;
    }
    
    return false;
  }
}

module.exports = {
  CircuitBreaker,
  CircuitState
};