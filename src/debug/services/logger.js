import winston from 'winston';
import debug from 'debug';

// Structured logging categories for FLOWERPIL
const LOG_CATEGORIES = {
  AUDIO: 'flowerpil:audio',
  BIO: 'flowerpil:bio', 
  API: 'flowerpil:api',
  DATABASE: 'flowerpil:database',
  AUTH: 'flowerpil:auth',
  EXTERNAL: 'flowerpil:external',
  PERFORMANCE: 'flowerpil:performance',
  SECURITY: 'flowerpil:security',
  FILE: 'flowerpil:file',
  ADMIN: 'flowerpil:admin'
};

// Debug loggers for each category (replaces console.log)
const debugLoggers = Object.fromEntries(
  Object.entries(LOG_CATEGORIES).map(([key, value]) => [
    key, debug(value)
  ])
);

// Winston logger for structured logging in production
const winstonLogger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'flowerpil' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/debug.log',
      level: 'debug'
    })
  ]
});

// Console transport for development
if (process.env.NODE_ENV !== 'production') {
  winstonLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Structured logger interface - replaces all console.log usage
class StructuredLogger {
  // Audio Preview System logging
  audio = {
    trackStarted: (trackId, title) => {
      debugLoggers.AUDIO(`Track started: ${trackId} - ${title}`);
      winstonLogger.info('Audio track started', { trackId, title, category: 'audio' });
    },
    trackStopped: (trackId) => {
      debugLoggers.AUDIO(`Track stopped: ${trackId}`);
      winstonLogger.info('Audio track stopped', { trackId, category: 'audio' });
    },
    contextError: (error, trackId) => {
      debugLoggers.AUDIO(`Audio context error: ${error.message}`);
      winstonLogger.error('Audio context error', { error: error.message, trackId, category: 'audio' });
    },
    previewLoadFailed: (trackId, reason) => {
      debugLoggers.AUDIO(`Preview load failed: ${trackId} - ${reason}`);
      winstonLogger.error('Preview load failed', { trackId, reason, category: 'audio' });
    }
  };

  // Bio Page Editor logging
  bio = {
    editorLoaded: (handle, contentLength) => {
      debugLoggers.BIO(`Editor loaded for ${handle}, content length: ${contentLength}`);
      winstonLogger.info('Bio editor loaded', { handle, contentLength, category: 'bio' });
    },
    linkAdded: (handle, linkType, position) => {
      debugLoggers.BIO(`Link added to ${handle}: ${linkType} at position ${position}`);
      winstonLogger.info('Bio link added', { handle, linkType, position, category: 'bio' });
    },
    validationError: (handle, errors) => {
      debugLoggers.BIO(`Validation errors for ${handle}: ${JSON.stringify(errors)}`);
      winstonLogger.error('Bio validation error', { handle, errors, category: 'bio' });
    },
    publishAttempt: (handle, success) => {
      debugLoggers.BIO(`Publish attempt for ${handle}: ${success ? 'SUCCESS' : 'FAILED'}`);
      winstonLogger.info('Bio publish attempt', { handle, success, category: 'bio' });
    }
  };

  // API endpoint logging
  api = {
    request: (method, endpoint, userId, duration) => {
      debugLoggers.API(`${method} ${endpoint} [${userId || 'anonymous'}] ${duration}ms`);
      winstonLogger.info('API request', { method, endpoint, userId, duration, category: 'api' });
    },
    error: (method, endpoint, error, statusCode) => {
      debugLoggers.API(`ERROR ${method} ${endpoint}: ${error.message} (${statusCode})`);
      winstonLogger.error('API error', { method, endpoint, error: error.message, statusCode, category: 'api' });
    },
    rateLimited: (endpoint, ip) => {
      debugLoggers.API(`Rate limited: ${endpoint} from ${ip}`);
      winstonLogger.warn('API rate limited', { endpoint, ip, category: 'api' });
    }
  };

  // Database operation logging
  database = {
    query: (table, operation, duration, recordCount) => {
      debugLoggers.DATABASE(`${operation} on ${table}: ${recordCount} records in ${duration}ms`);
      winstonLogger.debug('Database query', { table, operation, duration, recordCount, category: 'database' });
    },
    migration: (version, status) => {
      debugLoggers.DATABASE(`Migration ${version}: ${status}`);
      winstonLogger.info('Database migration', { version, status, category: 'database' });
    },
    error: (query, error) => {
      debugLoggers.DATABASE(`Database error: ${error.message} | Query: ${query}`);
      winstonLogger.error('Database error', { query, error: error.message, category: 'database' });
    }
  };

  // External API integration logging
  external = {
    spotifyRequest: (endpoint, duration, success) => {
      debugLoggers.EXTERNAL(`Spotify ${endpoint}: ${success ? 'SUCCESS' : 'FAILED'} (${duration}ms)`);
      winstonLogger.info('Spotify API call', { endpoint, duration, success, category: 'external' });
    },
    deezerPreview: (trackId, found, confidence) => {
      debugLoggers.EXTERNAL(`Deezer preview ${trackId}: ${found ? 'FOUND' : 'NOT FOUND'} (confidence: ${confidence})`);
      winstonLogger.info('Deezer preview lookup', { trackId, found, confidence, category: 'external' });
    },
    crossPlatformJob: (jobId, status, linksFound) => {
      debugLoggers.EXTERNAL(`Cross-platform job ${jobId}: ${status} (${linksFound} links)`);
      winstonLogger.info('Cross-platform linking', { jobId, status, linksFound, category: 'external' });
    }
  };

  // Performance monitoring
  performance = {
    componentRender: (componentName, duration) => {
      debugLoggers.PERFORMANCE(`${componentName} rendered in ${duration}ms`);
      winstonLogger.debug('Component render', { componentName, duration, category: 'performance' });
    },
    pageLoad: (route, duration, resourcesLoaded) => {
      debugLoggers.PERFORMANCE(`Page load ${route}: ${duration}ms (${resourcesLoaded} resources)`);
      winstonLogger.info('Page load', { route, duration, resourcesLoaded, category: 'performance' });
    },
    memoryUsage: (heapUsed, heapTotal) => {
      debugLoggers.PERFORMANCE(`Memory usage: ${heapUsed}MB / ${heapTotal}MB`);
      winstonLogger.debug('Memory usage', { heapUsed, heapTotal, category: 'performance' });
    }
  };

  // Security event logging
  security = {
    loginAttempt: (username, success, ip) => {
      debugLoggers.SECURITY(`Login attempt: ${username} from ${ip} - ${success ? 'SUCCESS' : 'FAILED'}`);
      winstonLogger.info('Login attempt', { username, success, ip, category: 'security' });
    },
    accountLocked: (username, duration) => {
      debugLoggers.SECURITY(`Account locked: ${username} for ${duration} minutes`);
      winstonLogger.warn('Account locked', { username, duration, category: 'security' });
    },
    suspiciousActivity: (type, details, ip) => {
      debugLoggers.SECURITY(`Suspicious activity: ${type} from ${ip}`);
      winstonLogger.error('Suspicious activity', { type, details, ip, category: 'security' });
    }
  };

  // File processing logging
  file = {
    imageUpload: (filename, size, processingTime) => {
      debugLoggers.FILE(`Image uploaded: ${filename} (${size}KB) processed in ${processingTime}ms`);
      winstonLogger.info('Image upload', { filename, size, processingTime, category: 'file' });
    },
    sharpProcessing: (input, output, dimensions, duration) => {
      debugLoggers.FILE(`Sharp processing: ${input} -> ${output} (${dimensions}) in ${duration}ms`);
      winstonLogger.debug('Sharp processing', { input, output, dimensions, duration, category: 'file' });
    }
  };
}

// Singleton logger instance
export const logger = new StructuredLogger();

// Enable debug categories in development
if (process.env.NODE_ENV !== 'production') {
  // Enable all debug categories by default in development
  process.env.DEBUG = Object.values(LOG_CATEGORIES).join(',');
}

export { LOG_CATEGORIES, debugLoggers, winstonLogger };