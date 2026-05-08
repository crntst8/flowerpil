
// Save as: src/core/store/Store.js
// MODULE: Store | DEPS: [EventBus] | PURPOSE: Centralised state management

import logger from '../../utils/logger';

export default class Store {
  constructor(eventBus) {
    this.state = {};
    this.eventBus = eventBus;
    this.subscribers = new Map();
    this.debug = process.env.NODE_ENV === 'development';
  }

  /**
   * Register a module's state namespace
   */
  registerModule(moduleId, initialState = {}) {
    if (this.state[moduleId]) {
      logger.warn('Store', `Module ${moduleId} already registered`);
      return;
    }
    
    this.state[moduleId] = initialState;
    this.subscribers.set(moduleId, new Set());
    
    if (this.debug) {
      logger.debug('Store', `Registered module: ${moduleId}`, { initialState });
    }
  }

  /**
   * Get module-specific store interface
   */
  getModuleStore(moduleId) {
    return {
      getState: () => this.state[moduleId] || {},
      setState: (newState) => this.setState(moduleId, newState),
      dispatch: (action) => this.dispatch(moduleId, action),
      subscribe: (callback) => this.subscribe(moduleId, callback),
    };
  }

  /**
   * Update state
   */
  setState(moduleId, newState) {
    if (!this.state[moduleId]) {
      logger.error('Store', `Module ${moduleId} not registered`);
      return;
    }
    
    const oldState = this.state[moduleId];
    this.state[moduleId] = { ...oldState, ...newState };
    
    // Notify subscribers
    this.notifySubscribers(moduleId);
    
    // Emit state change event
    this.eventBus.emit('store:changed', {
      moduleId,
      oldState,
      newState: this.state[moduleId],
    });
  }

  /**
   * Dispatch an action (Redux-style)
   */
  dispatch(moduleId, action) {
    if (this.debug) {
      logger.debug('Store', `Dispatch ${moduleId}`, { action });
    }
    
    // Simple reducer pattern - modules can implement their own logic
    this.eventBus.emit(`${moduleId}:action`, action);
  }

  /**
   * Subscribe to state changes
   */
  subscribe(moduleId, callback) {
    if (!this.subscribers.has(moduleId)) {
      this.subscribers.set(moduleId, new Set());
    }
    
    this.subscribers.get(moduleId).add(callback);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.get(moduleId).delete(callback);
    };
  }

  /**
   * Notify subscribers of state changes
   */
  notifySubscribers(moduleId) {
    const subscribers = this.subscribers.get(moduleId) || new Set();
    const state = this.state[moduleId];
    
    subscribers.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        logger.error('Store', `Subscriber error in ${moduleId}`, error);
      }
    });
  }

  /**
   * Get full state (for debugging)
   */
  getState() {
    return this.state;
  }
}

