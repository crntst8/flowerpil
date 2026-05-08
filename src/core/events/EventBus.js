// Save as: src/core/events/EventBus.js
// MODULE: EventBus | DEPS: [] | PURPOSE: Inter-module communication

import logger from '../../utils/logger';

export default class EventBus {
  constructor() {
    this.events = new Map();
    this.eventLog = [];
    this.debug = process.env.NODE_ENV === 'development';
  }

  /**
   * Subscribe to an event
   */
  on(event, handler, moduleId = 'unknown') {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    
    this.events.get(event).push({ handler, moduleId });
    

  }

  /**
   * Unsubscribe from an event
   */
  off(event, handler) {
    if (!this.events.has(event)) return;
    
    const handlers = this.events.get(event);
    const index = handlers.findIndex(h => h.handler === handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emit an event
   */
  emit(event, data = {}) {
    if (this.debug) {
      logger.debug('EventBus', `Event: ${event}`, { data });
    }
    
    // Log event for debugging
    this.eventLog.push({
      event,
      data,
      timestamp: new Date().toISOString(),
    });
    
    // Keep only last 100 events
    if (this.eventLog.length > 100) {
      this.eventLog.shift();
    }
    
    const handlers = this.events.get(event) || [];
    handlers.forEach(({ handler, moduleId }) => {
      try {
        handler(data);
      } catch (error) {
        logger.error('EventBus', `Error in ${moduleId} handler for ${event}`, error);
      }
    });
  }

  /**
   * Get event log for debugging
   */
  getEventLog() {
    return this.eventLog;
  }
}