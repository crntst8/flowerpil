import logger from '../utils/logger.js';

// API request/response logging middleware
export const apiLoggingMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Log incoming request
  logger.apiRequest(req.method, req.originalUrl, req.params, req.body);
  
  // Capture original res.json to log responses
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    logger.apiResponse(req.method, req.originalUrl, res.statusCode, data, duration);
    return originalJson.call(this, data);
  };
  
  // Capture original res.status().json() pattern
  const originalStatus = res.status;
  res.status = function(code) {
    const result = originalStatus.call(this, code);
    
    // Override json again to capture status codes
    result.json = function(data) {
      const duration = Date.now() - startTime;
      logger.apiResponse(req.method, req.originalUrl, code, data, duration);
      return originalJson.call(this, data);
    };
    
    return result;
  };
  
  next();
};

// Error logging middleware
export const errorLoggingMiddleware = (err, req, res, next) => {
  logger.error('EXPRESS_ERROR', `Unhandled error on ${req.method} ${req.originalUrl}`, err, {
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    query: req.query,
    body: logger.sanitizeBody(req.body),
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  
  // Don't send error details in production
  const errorResponse = process.env.NODE_ENV === 'production' 
    ? { error: 'Internal server error' }
    : { error: err.message, stack: err.stack };
    
  res.status(500).json(errorResponse);
};

// Database operation logging wrapper
export const logDbOperation = (operationName, queryFn) => {
  return (...args) => {
    const startTime = Date.now();
    
    try {
      const result = queryFn(...args);
      const duration = Date.now() - startTime;
      
      logger.dbQuery(operationName, args, duration);
      return result;
    } catch (error) {
      logger.dbError(operationName, error, args);
      throw error;
    }
  };
};