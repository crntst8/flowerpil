import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { getRequestContext } from './requestContext.js';
import { pushLogEntry } from './logBuffer.js';

const LOG_DIR = path.join(process.cwd(), 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const getTimestamp = () => {
  const now = new Date();

  // Get Melbourne time
  const melbourneTime = now.toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  // Calculate actual offset for daylight savings
  const melbDate = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
  const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMinutes = (melbDate - utcDate) / (1000 * 60);
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const offset = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;

  // ISO format with correct offset
  const isoMelb = now.toLocaleString('sv-SE', {
    timeZone: 'Australia/Melbourne'
  }).replace(' ', 'T');

  // Determine timezone name (AEDT or AEST)
  const tzName = offsetHours === 11 ? 'AEDT' : 'AEST';

  return `${isoMelb}${offset} ${tzName}`;
};

// Log level hierarchy: ERROR > WARN > INFO > DEBUG
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  SUCCESS: 2,  // Same level as INFO for filtering purposes
  INFO: 2,
  DEBUG: 3
};

class Logger {
  constructor() {
    this.logStreams = new Map();
    // Set log level based on environment
    // Production: ERROR only (0), Development: DEBUG (3)
    const envLogLevel = process.env.LOG_LEVEL?.toUpperCase() ||
      (process.env.NODE_ENV === 'production' ? 'ERROR' : 'DEBUG');
    this.minLogLevel = LOG_LEVELS[envLogLevel] ?? LOG_LEVELS.DEBUG;

    // Initialize pino logger
    const pinoLevel = envLogLevel === 'ERROR' ? 'error' :
                      envLogLevel === 'WARN' ? 'warn' :
                      envLogLevel === 'INFO' || envLogLevel === 'SUCCESS' ? 'info' : 'debug';

    // Use custom console output for PM2 compatibility
    this.pino = pino({
      level: pinoLevel,
      formatters: {
        level: (label) => ({ level: label })
      }
      // No transport - we'll handle formatting in console output below
    });

    this.initializeLogFiles();
  }

  initializeLogFiles() {
    const logFiles = [
      'api.log',       // API requests/responses
      'database.log',  // Database operations
      'curator.log',   // Curator-specific operations
      'error.log',     // All errors
      'debug.log'      // Debug information
    ];

    logFiles.forEach(file => {
      const filepath = path.join(LOG_DIR, file);
      this.logStreams.set(file, fs.createWriteStream(filepath, { flags: 'a' }));
    });

    // Log startup
    const logLevelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === this.minLogLevel) || 'DEBUG';
    this.info('logger', 'Logger initialized', {
      logFiles,
      logDir: LOG_DIR,
      logLevel: logLevelName,
      environment: process.env.NODE_ENV || 'development'
    });
  }

  writeToFile(filename, level, component, message, data = {}) {
    // Filter logs based on configured log level
    const levelValue = LOG_LEVELS[level] ?? LOG_LEVELS.DEBUG;
    if (levelValue > this.minLogLevel) {
      return; // Skip this log entry
    }

    const context = getRequestContext() || {};
    const nowIso = new Date().toISOString();
    const requestId = data?.request_id || data?.requestId || context.requestId || null;
    const route = context.route || data?.route || data?.url || null;
    const method = context.method || data?.method || null;
    const userId = (context.user && context.user.id) || data?.userId || data?.user_id || null;
    const sanitizedData = this.prepareLogData(data);

    const logEntry = {
      timestamp: getTimestamp(),
      iso_timestamp: nowIso,
      ts: Date.now(),
      level,
      component,
      message,
      msg: message,
      request_id: requestId || undefined,
      route: route || undefined,
      method: method || undefined,
      user_id: userId || undefined,
      tester: context.user?.tester !== undefined ? context.user.tester : undefined,
      service: process.env.SERVICE_NAME || 'flowerpil-api',
      env: process.env.NODE_ENV || 'development',
      pid: process.pid,
      data: sanitizedData
    };

    if (context.metadata && Object.keys(context.metadata).length > 0) {
      logEntry.context = context.metadata;
    }

    if (!logEntry.data) {
      delete logEntry.data;
    }

    const logLine = JSON.stringify(logEntry) + '\n';

    // Write to specific log file
    const stream = this.logStreams.get(filename);
    if (stream) {
      stream.write(logLine);
    }

    // Also write errors to error.log
    if (level === 'ERROR' && filename !== 'error.log') {
      const errorStream = this.logStreams.get('error.log');
      if (errorStream) {
        errorStream.write(logLine);
      }
    }

    try {
      pushLogEntry(logEntry);
    } catch (bufferError) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[LOGGER] Failed to push log entry into buffer', bufferError?.message);
      }
    }

    // Console output - works with both development and PM2 in production
    // Suppress noisy console logs for cross-platform stats endpoints in dev
    const isApiResponse = component === 'API_RESPONSE';
    const isApiRequest = component === 'API_REQUEST';
    const url = route || '';
    const status = (sanitizedData && typeof sanitizedData === 'object') ? (sanitizedData.status || 0) : 0;
    const isStats = typeof url === 'string' && url.includes('/api/v1/cross-platform/stats');
    const suppressInDev = process.env.NODE_ENV !== 'production' && ((isApiRequest && isStats) || (isApiResponse && isStats));

    if (suppressInDev) {
      return; // still written to file above; only suppress console noise in dev
    }

    // Human-readable console output for PM2
    const colors = {
      ERROR: '\x1b[31m',   // Red
      WARN: '\x1b[33m',    // Yellow
      INFO: '\x1b[36m',    // Cyan
      DEBUG: '\x1b[90m',   // Gray
      SUCCESS: '\x1b[32m'  // Green
    };
    const reset = '\x1b[0m';
    const color = colors[level] || '';

    // Format readable log line for console
    let consoleOutput = `${color}[${level}]${reset} ${component}: ${message}`;

    // Add user info if present
    if (userId) {
      consoleOutput += ` ${color}(user=${userId})${reset}`;
    }

    // Add request info for API calls
    if (method && route) {
      consoleOutput += ` ${color}${method} ${route}${reset}`;
    }

    // Add status and duration for API responses
    if (status) {
      const statusColor = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
      consoleOutput += ` ${statusColor}${status}${reset}`;
    }

    if (sanitizedData?.duration) {
      consoleOutput += ` ${color}(${sanitizedData.duration})${reset}`;
    }

    // Add extra data if present and not already shown
    const extraData = { ...sanitizedData };
    delete extraData.method;
    delete extraData.url;
    delete extraData.route;
    delete extraData.status;
    delete extraData.duration;

    if (Object.keys(extraData).length > 0 && level === 'DEBUG') {
      consoleOutput += ` ${JSON.stringify(extraData)}`;
    }

    console.log(consoleOutput);
  }

  // API logging methods
  apiRequest(method, url, params = {}, body = {}) {
    // Filter out noisy endpoints
    const path = url?.split('?')[0] || '';
    if (this.shouldSkipLogging(path)) {
      return;
    }

    this.writeToFile('api.log', 'INFO', 'API_REQUEST', `${method} ${url}`, {
      method, url, params, body: this.sanitizeBody(body)
    });
  }

  apiResponse(method, url, status, data = {}, duration = 0) {
    // Filter out noisy endpoints
    const path = url?.split('?')[0] || '';
    if (this.shouldSkipLogging(path)) {
      return;
    }

    // Log export failures as errors since they indicate real issues that need debugging
    const level = status >= 500 ? 'ERROR' : status >= 400 ? 'ERROR' : status >= 300 ? 'WARN' : 'SUCCESS';
    this.writeToFile('api.log', level, 'API_RESPONSE', `${method} ${url} - ${status}`, {
      method, url, status, duration: `${duration}ms`,
      data: this.sanitizeResponse(data)
    });
  }

  shouldSkipLogging(path) {
    // Skip health checks and high-frequency worker endpoints
    return path === '/health' ||
           path === '/api/health' ||
           path === '/api/v1/cross-platform/lease' ||
           path === '/api/v1/cross-platform/heartbeat' ||
           path.includes('/api/v1/cross-platform/stats');
  }

  // Database logging methods
  dbQuery(sql, params = [], duration = 0) {
    this.writeToFile('database.log', 'INFO', 'DB_QUERY', sql, {
      params, duration: `${duration}ms`
    });
  }

  dbError(sql, error, params = []) {
    this.writeToFile('database.log', 'ERROR', 'DB_ERROR', error.message, {
      sql, params, stack: error.stack
    });
  }

  // Curator-specific logging methods
  curatorOperation(operation, curatorName, data = {}) {
    this.writeToFile('curator.log', 'INFO', 'CURATOR_OP', `${operation}: ${curatorName}`, data);
  }

  curatorError(operation, curatorName, error, data = {}) {
    this.writeToFile('curator.log', 'ERROR', 'CURATOR_ERROR', 
      `${operation} failed for ${curatorName}: ${error.message}`, {
        ...data, stack: error.stack
      });
  }

  // General logging methods
  info(component, message, data = {}) {
    this.writeToFile('debug.log', 'INFO', component, message, data);
  }

  warn(component, message, data = {}) {
    this.writeToFile('debug.log', 'WARN', component, message, data);
  }

  error(component, message, error = null, data = {}) {
    const errorData = error ? {
      ...data,
      error: error.message,
      stack: error.stack
    } : data;
    
    this.writeToFile('error.log', 'ERROR', component, message, errorData);
  }

  debug(component, message, data = {}) {
    this.writeToFile('debug.log', 'DEBUG', component, message, data);
  }

  success(component, message, data = {}) {
    this.writeToFile('debug.log', 'SUCCESS', component, message, data);
  }

  // Create child logger with additional context (useful for request tracing)
  child(bindings) {
    const childLogger = Object.create(this);
    childLogger.pino = this.pino.child(bindings);
    childLogger._childBindings = { ...(this._childBindings || {}), ...bindings };
    return childLogger;
  }

  // Utility methods
  prepareLogData(raw) {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw !== 'object') return raw;

    try {
      const clone = JSON.parse(JSON.stringify(raw));
      if (clone && typeof clone === 'object') {
        if ('request_id' in clone) delete clone.request_id;
        if ('requestId' in clone) delete clone.requestId;
      }
      return Object.keys(clone || {}).length > 0 ? clone : undefined;
    } catch (error) {
      return {
        _unserializable: true,
        reason: error?.message || 'Failed to serialize log data'
      };
    }
  }

  sanitizeBody(body) {
    if (!body || typeof body !== 'object') return body;
    
    const sanitized = { ...body };
    // Remove sensitive fields
    ['password', 'token', 'secret', 'key'].forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }

  sanitizeResponse(data) {
    if (!data || typeof data !== 'object') return data;
    try {
      const json = JSON.stringify(data);
      if (json.length > 1000) {
        return `${json.slice(0, 1000)}...[TRUNCATED]`;
      }
      return JSON.parse(json);
    } catch (error) {
      return {
        _unserializable: true,
        reason: error?.message || 'Failed to sanitize response'
      };
    }
  }

  // Cleanup method
  close() {
    this.logStreams.forEach(stream => stream.end());
    // Flush pino logs
    if (this.pino && this.pino.flush) {
      this.pino.flush();
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('logger', 'Shutting down logger');
  logger.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('logger', 'Shutting down logger');
  logger.close();
  process.exit(0);
});

export default logger;
