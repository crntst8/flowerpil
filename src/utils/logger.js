// Frontend logging utility
class FrontendLogger {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.logCache = new Map(); // For throttling duplicate logs
    this.throttleWindow = 1000; // 1 second throttle window
  }

  log(level, component, message, data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      data,
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    // Throttle duplicate logs in development
    const logKey = `${level}-${component}-${message}`;
    const now = Date.now();
    const lastLogged = this.logCache.get(logKey);
    
    if (lastLogged && (now - lastLogged < this.throttleWindow)) {
      return; // Skip this log - too soon since last identical log
    }
    
    this.logCache.set(logKey, now);

    // Always log to console in development
    if (!this.isProduction) {
      const colors = {
        ERROR: 'color: #ff4444; font-weight: bold',
        WARN: 'color: #ffaa00; font-weight: bold',
        INFO: 'color: #4444ff',
        DEBUG: 'color: #666666',
        SUCCESS: 'color: #44ff44; font-weight: bold'
      };
      
      console.log(
        `%c[${level}] ${component}: ${message}`,
        colors[level] || '',
        Object.keys(data).length > 0 ? data : ''
      );
    }

    // Send critical errors to backend for logging
    if (level === 'ERROR') {
      this.sendToBackend(logEntry);
    }
  }

  async sendToBackend(logEntry) {
    try {
      await fetch('/api/v1/logs/frontend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logEntry)
      });
    } catch (error) {
      // Silently fail - don't want logging errors to break the app
      console.error('Failed to send log to backend:', error);
    }
  }

  // Convenience methods
  info(component, message, data = {}) {
    this.log('INFO', component, message, data);
  }

  warn(component, message, data = {}) {
    this.log('WARN', component, message, data);
  }

  error(component, message, error = null, data = {}) {
    const errorData = error ? {
      ...data,
      error: error.message,
      stack: error.stack
    } : data;
    
    this.log('ERROR', component, message, errorData);
  }

  debug(component, message, data = {}) {
    this.log('DEBUG', component, message, data);
  }

  success(component, message, data = {}) {
    this.log('SUCCESS', component, message, data);
  }

  // Component lifecycle logging
  componentMount(componentName, props = {}) {
    this.debug('LIFECYCLE', `${componentName} mounted`, { props });
  }

  componentUnmount(componentName) {
    this.debug('LIFECYCLE', `${componentName} unmounted`);
  }

  // API call logging
  apiCall(method, url, data = {}) {
    this.info('API', `${method} ${url}`, data);
  }

  apiResponse(method, url, status, data = {}, duration = 0) {
    const level = status >= 400 ? 'ERROR' : status >= 300 ? 'WARN' : 'SUCCESS';
    this.log(level, 'API', `${method} ${url} - ${status}`, {
      status, duration: `${duration}ms`, data
    });
  }

  // User interaction logging
  userAction(action, component, data = {}) {
    this.info('USER_ACTION', `${action} in ${component}`, data);
  }

  // Performance logging
  performance(operation, duration, data = {}) {
    const level = duration > 1000 ? 'WARN' : 'INFO';
    this.log(level, 'PERFORMANCE', `${operation} took ${duration}ms`, data);
  }
}

// Create singleton instance
const logger = new FrontendLogger();

// Global error handler
window.addEventListener('error', (event) => {
  logger.error('GLOBAL_ERROR', 'Unhandled error', event.error, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  logger.error('UNHANDLED_PROMISE', 'Unhandled promise rejection', event.reason);
});

export default logger;