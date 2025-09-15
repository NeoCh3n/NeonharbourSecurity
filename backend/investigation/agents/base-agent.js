/**
 * Base Agent class - Foundation for all investigation agents
 * 
 * All investigation agents (Planning, Execution, Analysis, Response) extend this base class
 * to ensure consistent interface and error handling patterns.
 */
const { agentCommunication } = require('./agent-communication');

class BaseAgent {
  constructor(name, config = {}) {
    this.name = name;
    this.config = {
      maxRetries: 3,
      retryDelayMs: 1000,
      timeoutMs: 30000,
      ...config
    };
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalRetries: 0,
      avgExecutionTime: 0
    };
  }

  /**
   * Execute agent logic - must be implemented by subclasses
   * @param {Object} context - Investigation context
   * @param {Object} input - Input data for the agent
   * @returns {Promise<Object>} Agent execution result
   */
  async execute(context, input) {
    throw new Error(`Agent ${this.name} must implement execute() method`);
  }

  /**
   * Validate input data - can be overridden by subclasses
   * @param {Object} input - Input data to validate
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validate(input) {
    return { valid: true, errors: [] };
  }

  /**
   * Handle execution errors - can be overridden by subclasses
   * @param {Error} error - The error that occurred
   * @param {Object} context - Investigation context
   * @param {number} attempt - Current attempt number
   * @returns {Object} Error handling result { shouldRetry: boolean, delay: number }
   */
  handleError(error, context, attempt) {
    const shouldRetry = attempt < this.config.maxRetries && this._isRetryableError(error);
    const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
    
    return { shouldRetry, delay };
  }

  /**
   * Execute agent with retry logic and metrics tracking
   * @param {Object} context - Investigation context
   * @param {Object} input - Input data
   * @returns {Promise<Object>} Execution result
   */
  async executeWithRetry(context, input) {
    const startTime = Date.now();
    let lastError = null;
    
    // Validate input
    const validation = this.validate(input);
    if (!validation.valid) {
      throw new Error(`Input validation failed: ${validation.errors.join(', ')}`);
    }

    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      try {
        this.metrics.totalExecutions++;
        // Announce step start for live feed
        try {
          if (context?.investigationId) {
            agentCommunication.sendMessage({
              from: this.name,
              to: 'broadcast',
              investigationId: context.investigationId,
              type: 'agent_step_start',
              data: {
                agent: this.name,
                attempt,
                inputPreview: input ? Object.keys(input).slice(0, 5) : []
              },
              priority: 3,
            });
          }
        } catch {}
        
        const result = await this._executeWithTimeout(context, input);
        
        // Success - update metrics
        this.metrics.successfulExecutions++;
        const executionTime = Date.now() - startTime;
        this._updateAvgExecutionTime(executionTime);
        // Announce step completion and reasoning snapshot (if available)
        try {
          if (context?.investigationId) {
            const reasoning = (result && (result.reasoning || result?.verdict?.reasoning || result?.analysis?.core?.summary)) || null;
            agentCommunication.sendMessage({
              from: this.name,
              to: 'broadcast',
              investigationId: context.investigationId,
              type: 'agent_step_complete',
              data: {
                agent: this.name,
                executionTime,
                summary: result?.summary || result?.verdict?.classification || 'completed',
                reasoning: reasoning ? String(reasoning).slice(0, 1000) : null
              },
              priority: 4,
            });
            if (reasoning) {
              agentCommunication.sendMessage({
                from: this.name,
                to: 'broadcast',
                investigationId: context.investigationId,
                type: 'agent_reason',
                data: {
                  agent: this.name,
                  reason: String(reasoning).slice(0, 2000)
                },
                priority: 3,
              });
            }
          }
        } catch {}

        return {
          success: true,
          result,
          executionTime,
          attempts: attempt,
          agent: this.name
        };
        
      } catch (error) {
        lastError = error;
        this.metrics.failedExecutions++;
        // Announce retry/failure
        try {
          if (context?.investigationId) {
            const msgType = (attempt <= this.config.maxRetries) ? 'agent_retry' : 'agent_step_failed';
            agentCommunication.sendMessage({
              from: this.name,
              to: 'broadcast',
              investigationId: context.investigationId,
              type: msgType,
              data: {
                agent: this.name,
                attempt,
                error: String(error?.message || error)
              },
              priority: 5,
            });
          }
        } catch {}
        
        if (attempt <= this.config.maxRetries) {
          const errorHandling = this.handleError(error, context, attempt);
          
          if (errorHandling.shouldRetry) {
            this.metrics.totalRetries++;
            console.warn(`Agent ${this.name} attempt ${attempt} failed, retrying in ${errorHandling.delay}ms:`, error.message);
            
            if (errorHandling.delay > 0) {
              await this._sleep(errorHandling.delay);
            }
            continue;
          }
        }
        
        // No more retries or non-retryable error
        break;
      }
    }

    // All attempts failed
    const executionTime = Date.now() - startTime;
    return {
      success: false,
      error: lastError.message,
      executionTime,
      attempts: this.config.maxRetries + 1,
      agent: this.name
    };
  }

  /**
   * Get agent metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalExecutions > 0 
        ? (this.metrics.successfulExecutions / this.metrics.totalExecutions) * 100 
        : 0
    };
  }

  /**
   * Reset agent metrics
   */
  resetMetrics() {
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalRetries: 0,
      avgExecutionTime: 0
    };
  }

  /**
   * Get agent configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update agent configuration
   * @param {Object} newConfig - Configuration updates
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  // Private methods

  async _executeWithTimeout(context, input) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Agent ${this.name} execution timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      this.execute(context, input)
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  _isRetryableError(error) {
    // Define which errors are retryable
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /rate limit/i,
      /service unavailable/i,
      /internal server error/i
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  _updateAvgExecutionTime(newTime) {
    if (this.metrics.successfulExecutions === 1) {
      this.metrics.avgExecutionTime = newTime;
    } else {
      // Running average calculation
      this.metrics.avgExecutionTime = 
        (this.metrics.avgExecutionTime * (this.metrics.successfulExecutions - 1) + newTime) / 
        this.metrics.successfulExecutions;
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { BaseAgent };
