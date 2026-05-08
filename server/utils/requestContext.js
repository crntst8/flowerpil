import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

const storage = new AsyncLocalStorage();

const generateRequestId = () => crypto.randomUUID();

export const runWithRequestContext = (data, fn) => {
  const baseContext = {
    requestId: data.requestId || generateRequestId(),
    method: data.method || 'GET',
    route: data.route || '/',
    startTime: data.startTime || Date.now(),
    user: data.user || null,
    metadata: data.metadata || {}
  };

  storage.run(baseContext, fn);
};

export const getRequestContext = () => storage.getStore() || null;

export const setRequestContextValue = (key, value) => {
  const store = storage.getStore();
  if (store) {
    store[key] = value;
  }
};

export const setRequestUser = (user) => {
  const store = storage.getStore();
  if (store) {
    store.user = user;
  }
};

export const appendRequestMetadata = (metadata = {}) => {
  const store = storage.getStore();
  if (store) {
    store.metadata = {
      ...(store.metadata || {}),
      ...metadata
    };
  }
};

export const requestContextMiddleware = (req, res, next) => {
  const incomingId = typeof req.headers['x-request-id'] === 'string'
    ? req.headers['x-request-id'].trim()
    : '';
  const requestId = incomingId || generateRequestId();

  runWithRequestContext(
    {
      requestId,
      method: req.method,
      route: req.originalUrl || req.url || '',
      metadata: {
        ip: req.ip,
        userAgent: req.get?.('User-Agent') || ''
      }
    },
    () => {
      req.requestId = requestId;
      res.locals.requestId = requestId;
      res.setHeader('X-Request-Id', requestId);

      const originalJson = res.json.bind(res);
      res.json = (body) => {
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          if (!Object.prototype.hasOwnProperty.call(body, 'request_id')) {
            body.request_id = requestId;
          }
        }
        return originalJson(body);
      };

      next();
    }
  );
};

