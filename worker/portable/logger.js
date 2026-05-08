/**
 * Structured logging for portable linking worker
 * Supports both JSON and text output formats
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.format = options.format || 'json'; // 'json' or 'text'
    this.workerId = options.workerId || 'unknown';
    this.minLevel = LOG_LEVELS[this.level] || LOG_LEVELS.info;
  }

  /**
   * Format log entry based on configured format
   */
  formatEntry(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      level,
      workerId: this.workerId,
      message,
      ...meta,
    };

    if (this.format === 'json') {
      return JSON.stringify(entry);
    } else {
      // Text format
      const metaStr = Object.keys(meta).length > 0
        ? ' ' + Object.entries(meta)
            .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(' ')
        : '';
      return `[${timestamp}] ${level.toUpperCase().padEnd(5)} [${this.workerId}] ${message}${metaStr}`;
    }
  }

  /**
   * Write log entry to stdout or stderr
   */
  write(level, message, meta = {}) {
    if (LOG_LEVELS[level] < this.minLevel) return;

    const formatted = this.formatEntry(level, message, meta);
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(formatted + '\n');
  }

  debug(message, meta) {
    this.write('debug', message, meta);
  }

  info(message, meta) {
    this.write('info', message, meta);
  }

  warn(message, meta) {
    this.write('warn', message, meta);
  }

  error(message, meta) {
    this.write('error', message, meta);
  }

  /**
   * Log worker startup
   */
  logStartup(config) {
    this.info('Worker starting', {
      apiBase: config.apiBase,
      playlistId: config.playlistId || 'all',
      batchSize: config.batchSize,
      platforms: Object.entries(config.platforms || {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(','),
    });
  }

  /**
   * Log track processing
   */
  logTrackProcessing(trackId, platform, result) {
    this.debug('Track processed', {
      trackId,
      platform,
      found: !!result,
    });
  }

  /**
   * Log track completion
   */
  logTrackComplete(trackId, platforms, hasErrors) {
    this.info('Track completed', {
      trackId,
      platforms: platforms.join(','),
      status: hasErrors ? 'with_errors' : 'success',
    });
  }

  /**
   * Log lease operations
   */
  logLease(count) {
    if (count > 0) {
      this.info('Tracks leased', { count });
    }
  }

  /**
   * Log heartbeat
   */
  logHeartbeat(count) {
    this.debug('Heartbeat sent', { count });
  }

  /**
   * Log report
   */
  logReport(count, applied) {
    this.info('Results reported', { count, applied });
  }

  /**
   * Log error with context
   */
  logError(context, error, meta = {}) {
    this.error(`${context}: ${error.message}`, {
      ...meta,
      errorName: error.name,
      errorStack: error.stack?.split('\n').slice(0, 3).join(' | '),
    });
  }

  /**
   * Log metrics
   */
  logMetrics(metrics) {
    this.info('Metrics', metrics);
  }

  /**
   * Log graceful shutdown
   */
  logShutdown(reason, inflight) {
    this.info('Shutting down gracefully', {
      reason,
      inflight,
    });
  }

  /**
   * Log configuration warnings
   */
  logConfigWarnings(warnings) {
    warnings.forEach(warning => {
      this.warn('Configuration warning', { warning });
    });
  }
}

export default Logger;
