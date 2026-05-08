import pinoHttp from 'pino-http';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

// Create pino-http middleware with silent logger (we use our custom logger instead)
export const pinoHttpMiddleware = pinoHttp({
  // Use silent logger - we handle logging with our custom logger
  logger: pino({ level: 'silent' }),

  // Generate unique request ID for tracing
  genReqId: (req, res) => {
    // Use existing request ID if available, otherwise generate new one
    const existingId = req.headers['x-request-id'] ||
                       req.headers['x-correlation-id'] ||
                       req.id;
    return existingId || uuidv4();
  },

  // Disable auto logging completely - we use our custom logger
  autoLogging: false
});

// Middleware to attach request ID to context
export const requestIdMiddleware = (req, res, next) => {
  // Ensure request has an ID (pino-http will have added it)
  if (!req.id) {
    req.id = uuidv4();
  }

  // Add request ID to response headers for client-side tracing
  res.setHeader('X-Request-ID', req.id);

  next();
};
