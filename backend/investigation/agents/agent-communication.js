const EventEmitter = require('events');

/**
 * Agent Communication System
 * 
 * Enables agents to communicate with each other through events and message passing
 */
class AgentCommunication extends EventEmitter {
  constructor() {
    super();
    this.messageQueue = new Map(); // investigationId -> messages[]
    this.subscriptions = new Map(); // agentId -> Set<eventTypes>
    this.messageHistory = new Map(); // investigationId -> message history
    this.maxHistorySize = 100;
  }

  /**
   * Subscribe an agent to specific event types
   * @param {string} agentId - Agent instance ID
   * @param {string[]} eventTypes - Array of event types to subscribe to
   */
  subscribe(agentId, eventTypes) {
    if (!this.subscriptions.has(agentId)) {
      this.subscriptions.set(agentId, new Set());
    }

    const agentSubscriptions = this.subscriptions.get(agentId);
    eventTypes.forEach(eventType => {
      agentSubscriptions.add(eventType);
      this.on(eventType, (data) => this._handleAgentEvent(agentId, eventType, data));
    });

    console.log(`Agent ${agentId} subscribed to events: ${eventTypes.join(', ')}`);
  }

  /**
   * Unsubscribe an agent from event types
   * @param {string} agentId - Agent instance ID
   * @param {string[]} eventTypes - Array of event types to unsubscribe from
   */
  unsubscribe(agentId, eventTypes = null) {
    const agentSubscriptions = this.subscriptions.get(agentId);
    if (!agentSubscriptions) return;

    if (eventTypes === null) {
      // Unsubscribe from all events
      agentSubscriptions.clear();
      this.removeAllListeners();
    } else {
      eventTypes.forEach(eventType => {
        agentSubscriptions.delete(eventType);
        // Note: We don't remove the listener here as other agents might be subscribed
      });
    }
  }

  /**
   * Send a message between agents
   * @param {Object} message - Message object
   * @param {string} message.from - Sender agent ID
   * @param {string} message.to - Recipient agent ID (or 'broadcast' for all)
   * @param {string} message.investigationId - Investigation ID
   * @param {string} message.type - Message type
   * @param {*} message.data - Message payload
   * @param {number} message.priority - Message priority (1-5, 5 = highest)
   */
  sendMessage(message) {
    const {
      from,
      to,
      investigationId,
      type,
      data,
      priority = 3
    } = message;

    if (!from || !investigationId || !type) {
      throw new Error('Message must have from, investigationId, and type fields');
    }

    const fullMessage = {
      id: this._generateMessageId(),
      from,
      to: to || 'broadcast',
      investigationId,
      type,
      data,
      priority,
      timestamp: new Date().toISOString(),
      delivered: false
    };

    // Add to message queue
    if (!this.messageQueue.has(investigationId)) {
      this.messageQueue.set(investigationId, []);
    }
    this.messageQueue.get(investigationId).push(fullMessage);

    // Add to history
    this._addToHistory(investigationId, fullMessage);

    // Emit event for real-time delivery
    this.emit('agent_message', fullMessage);

    // Emit specific message type event
    this.emit(`message_${type}`, fullMessage);

    console.log(`Message sent from ${from} to ${to}: ${type}`);
    return fullMessage.id;
  }

  /**
   * Get messages for an agent in an investigation
   * @param {string} investigationId - Investigation ID
   * @param {string} agentId - Agent ID (optional, for filtering)
   * @param {Object} options - Query options
   * @returns {Array} Array of messages
   */
  getMessages(investigationId, agentId = null, options = {}) {
    const {
      limit = 50,
      offset = 0,
      messageType = null,
      undeliveredOnly = false,
      since = null
    } = options;

    const messages = this.messageQueue.get(investigationId) || [];
    
    let filtered = messages.filter(msg => {
      // Filter by recipient
      if (agentId && msg.to !== 'broadcast' && msg.to !== agentId) {
        return false;
      }

      // Filter by message type
      if (messageType && msg.type !== messageType) {
        return false;
      }

      // Filter by delivery status
      if (undeliveredOnly && msg.delivered) {
        return false;
      }

      // Filter by timestamp
      if (since && new Date(msg.timestamp) <= new Date(since)) {
        return false;
      }

      return true;
    });

    // Sort by priority (high to low) then by timestamp (newest first)
    filtered.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    // Apply pagination
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Mark messages as delivered
   * @param {string[]} messageIds - Array of message IDs
   */
  markDelivered(messageIds) {
    for (const [investigationId, messages] of this.messageQueue) {
      messages.forEach(msg => {
        if (messageIds.includes(msg.id)) {
          msg.delivered = true;
        }
      });
    }
  }

  /**
   * Get message history for an investigation
   * @param {string} investigationId - Investigation ID
   * @param {Object} options - Query options
   * @returns {Array} Message history
   */
  getMessageHistory(investigationId, options = {}) {
    const { limit = 100, messageType = null } = options;
    
    const history = this.messageHistory.get(investigationId) || [];
    
    let filtered = history;
    if (messageType) {
      filtered = history.filter(msg => msg.type === messageType);
    }

    return filtered.slice(-limit);
  }

  /**
   * Clear messages for an investigation
   * @param {string} investigationId - Investigation ID
   */
  clearMessages(investigationId) {
    this.messageQueue.delete(investigationId);
    this.messageHistory.delete(investigationId);
  }

  /**
   * Broadcast a system message to all agents in an investigation
   * @param {string} investigationId - Investigation ID
   * @param {string} type - Message type
   * @param {*} data - Message data
   */
  broadcastSystemMessage(investigationId, type, data) {
    this.sendMessage({
      from: 'system',
      to: 'broadcast',
      investigationId,
      type,
      data,
      priority: 4
    });
  }

  /**
   * Get communication statistics
   * @returns {Object} Statistics
   */
  getStats() {
    let totalMessages = 0;
    let totalInvestigations = 0;
    const messagesByType = {};

    for (const [investigationId, messages] of this.messageQueue) {
      totalInvestigations++;
      totalMessages += messages.length;

      messages.forEach(msg => {
        messagesByType[msg.type] = (messagesByType[msg.type] || 0) + 1;
      });
    }

    return {
      totalMessages,
      totalInvestigations,
      activeSubscriptions: this.subscriptions.size,
      messagesByType
    };
  }

  /**
   * Cleanup old messages and investigations
   * @param {number} maxAgeMs - Maximum age in milliseconds
   * @returns {number} Number of investigations cleaned up
   */
  cleanup(maxAgeMs = 86400000) { // Default: 24 hours
    const now = new Date();
    const investigationsToClean = [];

    for (const [investigationId, messages] of this.messageQueue) {
      if (messages.length === 0) continue;

      const latestMessage = messages[messages.length - 1];
      const age = now - new Date(latestMessage.timestamp);

      if (age > maxAgeMs) {
        investigationsToClean.push(investigationId);
      }
    }

    investigationsToClean.forEach(id => {
      this.clearMessages(id);
    });

    return investigationsToClean.length;
  }

  // Private methods

  _handleAgentEvent(agentId, eventType, data) {
    // This method is called when an agent receives an event
    // Agents can override this behavior by implementing their own event handlers
    console.log(`Agent ${agentId} received event: ${eventType}`);
  }

  _generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _addToHistory(investigationId, message) {
    if (!this.messageHistory.has(investigationId)) {
      this.messageHistory.set(investigationId, []);
    }

    const history = this.messageHistory.get(investigationId);
    history.push({ ...message });

    // Trim history if it exceeds max size
    if (history.length > this.maxHistorySize) {
      history.splice(0, history.length - this.maxHistorySize);
    }
  }
}

// Singleton instance
const agentCommunication = new AgentCommunication();

module.exports = { AgentCommunication, agentCommunication };