import { describe, it, expect, beforeEach, vi } from 'vitest';
import Store from '../Store';
import EventBus from '../../events/EventBus';

describe('Store', () => {
  let store;
  let eventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    store = new Store(eventBus);
  });

  describe('Module registration', () => {
    it('should register a module with initial state', () => {
      const initialState = { count: 0, name: 'test' };
      store.registerModule('testModule', initialState);

      expect(store.state.testModule).toEqual(initialState);
    });

    it('should register module with empty state if not provided', () => {
      store.registerModule('emptyModule');

      expect(store.state.emptyModule).toEqual({});
    });

    it('should prevent duplicate module registration', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      store.registerModule('testModule', { count: 0 });
      store.registerModule('testModule', { count: 1 });

      // Should keep the first registration
      expect(store.state.testModule).toEqual({ count: 0 });

      consoleSpy.mockRestore();
    });

    it('should create subscriber set for registered module', () => {
      store.registerModule('testModule', { count: 0 });

      expect(store.subscribers.has('testModule')).toBe(true);
      expect(store.subscribers.get('testModule')).toBeInstanceOf(Set);
    });

    it('should register multiple modules independently', () => {
      store.registerModule('module1', { value: 1 });
      store.registerModule('module2', { value: 2 });
      store.registerModule('module3', { value: 3 });

      expect(store.state.module1).toEqual({ value: 1 });
      expect(store.state.module2).toEqual({ value: 2 });
      expect(store.state.module3).toEqual({ value: 3 });
    });
  });

  describe('Module store interface', () => {
    beforeEach(() => {
      store.registerModule('testModule', { count: 0, name: 'test' });
    });

    it('should return module-specific store interface', () => {
      const moduleStore = store.getModuleStore('testModule');

      expect(moduleStore).toHaveProperty('getState');
      expect(moduleStore).toHaveProperty('setState');
      expect(moduleStore).toHaveProperty('dispatch');
      expect(moduleStore).toHaveProperty('subscribe');
    });

    it('should getState return module state', () => {
      const moduleStore = store.getModuleStore('testModule');

      expect(moduleStore.getState()).toEqual({ count: 0, name: 'test' });
    });

    it('should return empty object for unregistered module', () => {
      const moduleStore = store.getModuleStore('nonExistent');

      expect(moduleStore.getState()).toEqual({});
    });

    it('should setState update module state', () => {
      const moduleStore = store.getModuleStore('testModule');

      moduleStore.setState({ count: 5 });

      expect(moduleStore.getState()).toEqual({ count: 5, name: 'test' });
    });

    it('should dispatch call store dispatch with module context', () => {
      const moduleStore = store.getModuleStore('testModule');
      const eventSpy = vi.fn();

      eventBus.on('testModule:action', eventSpy);
      moduleStore.dispatch({ type: 'INCREMENT' });

      expect(eventSpy).toHaveBeenCalledWith({ type: 'INCREMENT' });
    });

    it('should subscribe work through module interface', () => {
      const moduleStore = store.getModuleStore('testModule');
      const callback = vi.fn();

      moduleStore.subscribe(callback);
      moduleStore.setState({ count: 1 });

      expect(callback).toHaveBeenCalledWith({ count: 1, name: 'test' });
    });
  });

  describe('State management', () => {
    beforeEach(() => {
      store.registerModule('counter', { count: 0, multiplier: 1 });
    });

    it('should update state and merge with existing state', () => {
      store.setState('counter', { count: 5 });

      expect(store.state.counter).toEqual({ count: 5, multiplier: 1 });
    });

    it('should update multiple properties at once', () => {
      store.setState('counter', { count: 10, multiplier: 2 });

      expect(store.state.counter).toEqual({ count: 10, multiplier: 2 });
    });

    it('should not modify state if module not registered', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      store.setState('nonExistent', { value: 1 });

      expect(store.state.nonExistent).toBeUndefined();

      consoleSpy.mockRestore();
    });

    it('should preserve state immutability', () => {
      const oldState = store.state.counter;
      store.setState('counter', { count: 5 });

      expect(store.state.counter).not.toBe(oldState);
      expect(oldState).toEqual({ count: 0, multiplier: 1 });
    });

    it('should handle nested object updates', () => {
      store.registerModule('user', {
        profile: { name: 'John', age: 30 },
        settings: { theme: 'dark' }
      });

      store.setState('user', {
        profile: { name: 'Jane', age: 25 }
      });

      expect(store.state.user).toEqual({
        profile: { name: 'Jane', age: 25 },
        settings: { theme: 'dark' }
      });
    });
  });

  describe('Subscriber notifications', () => {
    beforeEach(() => {
      store.registerModule('notifications', { count: 0 });
    });

    it('should notify subscribers on state change', () => {
      const callback = vi.fn();
      store.subscribe('notifications', callback);

      store.setState('notifications', { count: 1 });

      expect(callback).toHaveBeenCalledWith({ count: 1 });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should notify multiple subscribers', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      store.subscribe('notifications', callback1);
      store.subscribe('notifications', callback2);
      store.subscribe('notifications', callback3);

      store.setState('notifications', { count: 5 });

      expect(callback1).toHaveBeenCalledWith({ count: 5 });
      expect(callback2).toHaveBeenCalledWith({ count: 5 });
      expect(callback3).toHaveBeenCalledWith({ count: 5 });
    });

    it('should handle subscriber errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorCallback = vi.fn(() => {
        throw new Error('Subscriber error');
      });
      const goodCallback = vi.fn();

      store.subscribe('notifications', errorCallback);
      store.subscribe('notifications', goodCallback);

      // Should not throw, and good callback should still run
      store.setState('notifications', { count: 1 });

      expect(errorCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = store.subscribe('notifications', callback);

      expect(typeof unsubscribe).toBe('function');

      store.setState('notifications', { count: 1 });
      expect(callback).toHaveBeenCalledTimes(1);

      // Unsubscribe and verify no more calls
      unsubscribe();
      store.setState('notifications', { count: 2 });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should isolate module state changes', () => {
      store.registerModule('module1', { value: 0 });
      store.registerModule('module2', { value: 0 });

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      store.subscribe('module1', callback1);
      store.subscribe('module2', callback2);

      store.setState('module1', { value: 1 });

      expect(callback1).toHaveBeenCalledWith({ value: 1 });
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('Event bus integration', () => {
    beforeEach(() => {
      store.registerModule('events', { count: 0 });
    });

    it('should emit store:changed event on state update', () => {
      const eventSpy = vi.fn();
      eventBus.on('store:changed', eventSpy);

      const oldState = { count: 0 };
      store.setState('events', { count: 1 });

      expect(eventSpy).toHaveBeenCalledWith({
        moduleId: 'events',
        oldState,
        newState: { count: 1 }
      });
    });

    it('should dispatch actions through event bus', () => {
      const actionSpy = vi.fn();
      eventBus.on('events:action', actionSpy);

      const action = { type: 'INCREMENT', payload: 1 };
      store.dispatch('events', action);

      expect(actionSpy).toHaveBeenCalledWith(action);
    });

    it('should emit module-specific action events', () => {
      store.registerModule('counter', { count: 0 });
      store.registerModule('timer', { seconds: 0 });

      const counterSpy = vi.fn();
      const timerSpy = vi.fn();

      eventBus.on('counter:action', counterSpy);
      eventBus.on('timer:action', timerSpy);

      store.dispatch('counter', { type: 'INCREMENT' });

      expect(counterSpy).toHaveBeenCalledWith({ type: 'INCREMENT' });
      expect(timerSpy).not.toHaveBeenCalled();
    });

    it('should maintain event log in EventBus', () => {
      store.setState('events', { count: 1 });
      store.dispatch('events', { type: 'TEST' });

      const eventLog = eventBus.getEventLog();

      expect(eventLog.length).toBeGreaterThan(0);
      expect(eventLog.some(e => e.event === 'store:changed')).toBe(true);
      expect(eventLog.some(e => e.event === 'events:action')).toBe(true);
    });
  });

  describe('Global state access', () => {
    it('should return full state object', () => {
      store.registerModule('module1', { value: 1 });
      store.registerModule('module2', { value: 2 });

      const fullState = store.getState();

      expect(fullState).toEqual({
        module1: { value: 1 },
        module2: { value: 2 }
      });
    });

    it('should return empty object initially', () => {
      const newStore = new Store(eventBus);

      expect(newStore.getState()).toEqual({});
    });

    it('should reflect state changes in getState', () => {
      store.registerModule('counter', { count: 0 });

      expect(store.getState().counter).toEqual({ count: 0 });

      store.setState('counter', { count: 5 });

      expect(store.getState().counter).toEqual({ count: 5 });
    });
  });

  describe('Complex scenarios', () => {
    it('should handle rapid state updates', () => {
      store.registerModule('rapid', { count: 0 });
      const callback = vi.fn();
      store.subscribe('rapid', callback);

      for (let i = 1; i <= 10; i++) {
        store.setState('rapid', { count: i });
      }

      expect(callback).toHaveBeenCalledTimes(10);
      expect(store.state.rapid).toEqual({ count: 10 });
    });

    it('should support Redux-style reducer pattern', () => {
      store.registerModule('counter', { count: 0 });

      // Set up a reducer-style listener
      eventBus.on('counter:action', (action) => {
        const state = store.state.counter;

        switch (action.type) {
          case 'INCREMENT':
            store.setState('counter', { count: state.count + 1 });
            break;
          case 'DECREMENT':
            store.setState('counter', { count: state.count - 1 });
            break;
          case 'SET':
            store.setState('counter', { count: action.payload });
            break;
        }
      });

      store.dispatch('counter', { type: 'INCREMENT' });
      expect(store.state.counter.count).toBe(1);

      store.dispatch('counter', { type: 'INCREMENT' });
      expect(store.state.counter.count).toBe(2);

      store.dispatch('counter', { type: 'DECREMENT' });
      expect(store.state.counter.count).toBe(1);

      store.dispatch('counter', { type: 'SET', payload: 10 });
      expect(store.state.counter.count).toBe(10);
    });

    it('should handle cross-module communication', () => {
      store.registerModule('auth', { isLoggedIn: false });
      store.registerModule('ui', { showLoginModal: false });

      // When auth changes, update UI
      eventBus.on('store:changed', ({ moduleId, newState }) => {
        if (moduleId === 'auth' && !newState.isLoggedIn) {
          store.setState('ui', { showLoginModal: true });
        }
      });

      store.setState('auth', { isLoggedIn: false });

      expect(store.state.ui.showLoginModal).toBe(true);
    });

    it('should maintain module isolation', () => {
      store.registerModule('module1', { shared: 'value1', unique1: 'data1' });
      store.registerModule('module2', { shared: 'value2', unique2: 'data2' });

      store.setState('module1', { shared: 'updated1' });

      expect(store.state.module1.shared).toBe('updated1');
      expect(store.state.module2.shared).toBe('value2');
      expect(store.state.module1.unique1).toBe('data1');
      expect(store.state.module2.unique2).toBe('data2');
    });

    it('should handle cleanup of multiple subscribers', () => {
      store.registerModule('cleanup', { count: 0 });

      const callbacks = Array.from({ length: 5 }, () => vi.fn());
      const unsubscribers = callbacks.map(cb => store.subscribe('cleanup', cb));

      store.setState('cleanup', { count: 1 });
      callbacks.forEach(cb => expect(cb).toHaveBeenCalledTimes(1));

      // Unsubscribe all
      unsubscribers.forEach(unsub => unsub());

      store.setState('cleanup', { count: 2 });
      callbacks.forEach(cb => expect(cb).toHaveBeenCalledTimes(1));
    });
  });
});
