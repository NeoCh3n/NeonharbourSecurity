/**
 * Rate Limiter for Connector Framework
 * 
 * Implements various rate limiting strategies for external API calls
 * Supports token bucket, sliding window, and fixed window algorithms
 */

/**
 * Rate limiting strategies
 */
const RateLimitStrategy = {
  TOKEN_BUCKET: 'token_bucket',
  SLIDING_WINDOW: 'sliding_window',
  FIXED_WINDOW: 'fixed_window'
};

/**
 * Token bucket rate limiter implementation
 */
class TokenBucketLimiter {
  constructor(capacity, refillRate, refillPeriod = 1000) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.refillPeriod = refillPeriod;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume tokens
   * @param {number} tokens - Number of tokens to consume
   * @returns {boolean} True if tokens were consumed
   */
  tryConsume(tokens = 1) {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }

  /**
   * Refill tokens based on time elapsed
   */
  refill() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor((timePassed / this.refillPeriod) * this.refillRate);
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Get time until next token is available
   * @returns {number} Milliseconds until next token
   */
  getTimeUntilNextToken() {
    if (this.tokens > 0) {
      return 0;
    }
    
    const timeForOneToken = this.refillPeriod / this.refillRate;
    const timeSinceLastRefill = Date.now() - this.lastRefill;
    return Math.max(0, timeForOneToken - timeSinceLastRefill);
  }

  /**
   * Get current status
   * @returns {Object} Current limiter status
   */
  getStatus() {
    this.refill();
    return {
      strategy: 'token_bucket',
      tokens: this.tokens,
      capacity: this.capacity,
      refillRate: this.refillRate,
      timeUntilNextToken: this.getTimeUntilNextToken()
    };
  }
}

/**
 * Sliding window rate limiter implementation
 */
class SlidingWindowLimiter {
  constructor(limit, windowSize) {
    this.limit = limit;
    this.windowSize = windowSize;
    this.requests = [];
  }

  /**
   * Try to make a request
   * @returns {boolean} True if request is allowed
   */
  tryRequest() {
    const now = Date.now();
    const windowStart = now - this.windowSize;
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => time > windowStart);
    
    if (this.requests.length < this.limit) {
      this.requests.push(now);
      return true;
    }
    
    return false;
  }

  /**
   * Get time until next request is allowed
   * @returns {number} Milliseconds until next request
   */
  getTimeUntilNextRequest() {
    if (this.requests.length < this.limit) {
      return 0;
    }
    
    const oldestRequest = Math.min(...this.requests);
    const timeUntilExpiry = (oldestRequest + this.windowSize) - Date.now();
    return Math.max(0, timeUntilExpiry);
  }

  /**
   * Get current status
   * @returns {Object} Current limiter status
   */
  getStatus() {
    const now = Date.now();
    const windowStart = now - this.windowSize;
    this.requests = this.requests.filter(time => time > windowStart);
    
    return {
      strategy: 'sliding_window',
      currentRequests: this.requests.length,
      limit: this.limit,
      windowSize: this.windowSize,
      timeUntilNextRequest: this.getTimeUntilNextRequest()
    };
  }
}

/**
 * Fixed window rate limiter implementation
 */
class FixedWindowLimiter {
  constructor(limit, windowSize) {
    this.limit = limit;
    this.windowSize = windowSize;
    this.currentWindow = Math.floor(Date.now() / windowSize);
    this.requestCount = 0;
  }

  /**
   * Try to make a request
   * @returns {boolean} True if request is allowed
   */
  tryRequest() {
    const now = Date.now();
    const window = Math.floor(now / this.windowSize);
    
    // Reset counter if we're in a new window
    if (window > this.currentWindow) {
      this.currentWindow = window;
      this.requestCount = 0;
    }
    
    if (this.requestCount < this.limit) {
      this.requestCount++;
      return true;
    }
    
    return false;
  }

  /**
   * Get time until next window
   * @returns {number} Milliseconds until next window
   */
  getTimeUntilNextWindow() {
    const now = Date.now();
    const currentWindowStart = this.currentWindow * this.windowSize;
    const nextWindowStart = currentWindowStart + this.windowSize;
    return Math.max(0, nextWindowStart - now);
  }

  /**
   * Get current status
   * @returns {Object} Current limiter status
   */
  getStatus() {
    const now = Date.now();
    const window = Math.floor(now / this.windowSize);
    
    if (window > this.currentWindow) {
      this.currentWindow = window;
      this.requestCount = 0;
    }
    
    return {
      strategy: 'fixed_window',
      currentRequests: this.requestCount,
      limit: this.limit,
      windowSize: this.windowSize,
      timeUntilNextWindow: this.getTimeUntilNextWindow()
    };
  }
}

/**
 * Main rate limiter class that manages multiple limiters
 */
class RateLimiter {
  constructor(config) {
    this.limiters = new Map();
    this.config = config;
    this.setupLimiters();
  }

  /**
   * Setup rate limiters based on configuration
   */
  setupLimiters() {
    const { requestsPerSecond, requestsPerMinute, requestsPerHour, strategy = RateLimitStrategy.TOKEN_BUCKET } = this.config;

    if (requestsPerSecond) {
      this.addLimiter('second', requestsPerSecond, 1000, strategy);
    }

    if (requestsPerMinute) {
      this.addLimiter('minute', requestsPerMinute, 60000, strategy);
    }

    if (requestsPerHour) {
      this.addLimiter('hour', requestsPerHour, 3600000, strategy);
    }
  }

  /**
   * Add a rate limiter
   * @param {string} name - Limiter name
   * @param {number} limit - Request limit
   * @param {number} window - Time window in milliseconds
   * @param {string} strategy - Rate limiting strategy
   */
  addLimiter(name, limit, window, strategy) {
    let limiter;

    switch (strategy) {
      case RateLimitStrategy.TOKEN_BUCKET:
        limiter = new TokenBucketLimiter(limit, limit, window);
        break;
      case RateLimitStrategy.SLIDING_WINDOW:
        limiter = new SlidingWindowLimiter(limit, window);
        break;
      case RateLimitStrategy.FIXED_WINDOW:
        limiter = new FixedWindowLimiter(limit, window);
        break;
      default:
        throw new Error(`Unknown rate limiting strategy: ${strategy}`);
    }

    this.limiters.set(name, limiter);
  }

  /**
   * Check if request is allowed by all limiters
   * @returns {Object} Result with allowed status and wait time
   */
  checkRequest() {
    let maxWaitTime = 0;
    let allowed = true;

    for (const [name, limiter] of this.limiters) {
      let canProceed = false;
      let waitTime = 0;

      if (limiter instanceof TokenBucketLimiter) {
        canProceed = limiter.tryConsume();
        waitTime = limiter.getTimeUntilNextToken();
      } else if (limiter instanceof SlidingWindowLimiter) {
        canProceed = limiter.tryRequest();
        waitTime = limiter.getTimeUntilNextRequest();
      } else if (limiter instanceof FixedWindowLimiter) {
        canProceed = limiter.tryRequest();
        waitTime = limiter.getTimeUntilNextWindow();
      }

      if (!canProceed) {
        allowed = false;
        maxWaitTime = Math.max(maxWaitTime, waitTime);
      }
    }

    return {
      allowed,
      waitTime: maxWaitTime,
      retryAfter: allowed ? 0 : Math.ceil(maxWaitTime / 1000) // seconds
    };
  }

  /**
   * Wait for rate limit to allow request
   * @returns {Promise<void>}
   */
  async waitForRequest() {
    const result = this.checkRequest();
    
    if (!result.allowed && result.waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, result.waitTime));
    }
  }

  /**
   * Get status of all limiters
   * @returns {Object} Status of all rate limiters
   */
  getStatus() {
    const status = {};
    
    for (const [name, limiter] of this.limiters) {
      status[name] = limiter.getStatus();
    }
    
    return status;
  }

  /**
   * Reset all limiters
   */
  reset() {
    for (const limiter of this.limiters.values()) {
      if (limiter instanceof TokenBucketLimiter) {
        limiter.tokens = limiter.capacity;
        limiter.lastRefill = Date.now();
      } else if (limiter instanceof SlidingWindowLimiter) {
        limiter.requests = [];
      } else if (limiter instanceof FixedWindowLimiter) {
        limiter.currentWindow = Math.floor(Date.now() / limiter.windowSize);
        limiter.requestCount = 0;
      }
    }
  }
}

module.exports = {
  RateLimiter,
  RateLimitStrategy,
  TokenBucketLimiter,
  SlidingWindowLimiter,
  FixedWindowLimiter
};