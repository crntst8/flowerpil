const STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
};

const registry = new Map();

class CircuitBreaker {
  constructor(name, options = {}) {
    if (!name) {
      throw new Error('CircuitBreaker requires a name');
    }

    this.name = name;
    this.threshold = Number.isFinite(options.threshold) ? options.threshold : 10;
    this.timeout = Number.isFinite(options.timeout) ? options.timeout : 300000; // 5 minutes
    this.halfOpenMaxCalls = Number.isFinite(options.halfOpenMaxCalls) ? options.halfOpenMaxCalls : 3;
    this.onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : null;

    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.lastError = null;
    this.lastErrorAt = null;
    this.lastSuccessAt = null;
    this.lastStateChange = Date.now();
    this.openedAt = null;
    this.nextAttemptAt = null;
    this.halfOpenInFlight = 0;
    this.reason = null;

    registry.set(name, this);
  }

  static getOrCreate(name, options = {}) {
    const existing = registry.get(name);
    if (existing) return existing;
    return new CircuitBreaker(name, options);
  }

  static list() {
    return Array.from(registry.values());
  }

  static get(name) {
    return registry.get(name) || null;
  }

  transitionTo(newState, meta = {}) {
    if (this.state === newState) return;
    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === STATES.OPEN) {
      this.openedAt = this.lastStateChange;
      this.nextAttemptAt = this.lastStateChange + this.timeout;
      this.reason = meta.reason || null;
    }

    if (newState === STATES.CLOSED) {
      this.failureCount = 0;
      this.nextAttemptAt = null;
      this.reason = null;
      this.halfOpenInFlight = 0;
    }

    if (typeof this.onStateChange === 'function') {
      this.onStateChange(this.state, {
        name: this.name,
        failureCount: this.failureCount,
        threshold: this.threshold,
        timeout: this.timeout,
        halfOpenMaxCalls: this.halfOpenMaxCalls,
        openedAt: this.openedAt,
        nextAttemptAt: this.nextAttemptAt,
        lastError: this.lastError,
        reason: this.reason,
        ...meta
      });
    }
  }

  open(reason = null) {
    this.transitionTo(STATES.OPEN, { reason });
  }

  close() {
    this.transitionTo(STATES.CLOSED);
  }

  reset() {
    this.failureCount = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.lastError = null;
    this.lastErrorAt = null;
    this.lastSuccessAt = null;
    this.openedAt = null;
    this.nextAttemptAt = null;
    this.halfOpenInFlight = 0;
    this.reason = null;
    this.state = STATES.CLOSED;
    this.lastStateChange = Date.now();
  }

  canExecute() {
    if (this.state !== STATES.OPEN) return true;
    const now = Date.now();
    if (this.nextAttemptAt && now >= this.nextAttemptAt) {
      this.transitionTo(STATES.HALF_OPEN, { reason: 'timeout_elapsed' });
      return true;
    }
    return false;
  }

  buildOpenError(meta = {}) {
    const error = new Error(`${this.name} circuit is open`);
    error.code = 'CIRCUIT_OPEN';
    error.meta = {
      name: this.name,
      state: this.state,
      nextAttemptAt: this.nextAttemptAt,
      reason: this.reason,
      ...meta
    };
    return error;
  }

  async execute(action, context = {}) {
    if (typeof action !== 'function') {
      throw new Error('CircuitBreaker.execute requires a function');
    }

    if (!this.canExecute()) {
      throw this.buildOpenError(context);
    }

    const wasHalfOpen = this.state === STATES.HALF_OPEN;
    if (wasHalfOpen) {
      if (this.halfOpenInFlight >= this.halfOpenMaxCalls) {
        const error = new Error(`${this.name} circuit is half-open and at capacity`);
        error.code = 'CIRCUIT_HALF_OPEN';
        error.meta = {
          name: this.name,
          state: this.state,
          halfOpenInFlight: this.halfOpenInFlight,
          halfOpenMaxCalls: this.halfOpenMaxCalls
        };
        throw error;
      }
      this.halfOpenInFlight += 1;
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    } finally {
      if (wasHalfOpen) {
        this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
      }
    }
  }

  onSuccess() {
    this.totalSuccesses += 1;
    this.lastSuccessAt = Date.now();

    if (this.state === STATES.HALF_OPEN) {
      this.close();
      return;
    }

    if (this.failureCount > 0) {
      this.failureCount = 0;
    }
  }

  onFailure(error) {
    this.totalFailures += 1;
    this.failureCount += 1;
    this.lastError = error?.message || String(error);
    this.lastErrorAt = Date.now();

    if (this.state === STATES.HALF_OPEN) {
      this.open('half_open_failure');
      return;
    }

    if (this.failureCount >= this.threshold) {
      this.open('threshold_exceeded');
    }
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      threshold: this.threshold,
      timeout: this.timeout,
      halfOpenMaxCalls: this.halfOpenMaxCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt,
      lastSuccessAt: this.lastSuccessAt,
      lastStateChange: this.lastStateChange,
      openedAt: this.openedAt,
      nextAttemptAt: this.nextAttemptAt,
      halfOpenInFlight: this.halfOpenInFlight,
      reason: this.reason
    };
  }
}

export default CircuitBreaker;
