import { recordHttpRequest } from '../utils/metrics.js';

/**
 * Middleware to collect HTTP request metrics
 * Records duration, method, route, and status for each request
 */
function metricsMiddleware(req, res, next) {
  const startTime = Date.now();

  // Capture the original end function
  const originalEnd = res.end;

  // Override res.end to capture metrics when response completes
  res.end = function (...args) {
    // Calculate duration
    const duration = Date.now() - startTime;

    // Get route - try to use the matched route if available, otherwise use path
    const route = (req.route && req.route.path) || req.path || req.url;

    // Normalize route to remove IDs and make it more generic for better aggregation
    const normalizedRoute = normalizeRoute(route);

    // Record the metric
    recordHttpRequest(
      req.method,
      normalizedRoute,
      res.statusCode,
      duration
    );

    // Call the original end function
    originalEnd.apply(res, args);
  };

  next();
}

/**
 * Normalize route by replacing ID patterns with placeholders
 * This helps group similar routes together for better metrics aggregation
 * Examples:
 *   /api/v1/playlists/123 -> /api/v1/playlists/:id
 *   /api/v1/curators/abc-123/playlists -> /api/v1/curators/:id/playlists
 */
function normalizeRoute(route) {
  if (Array.isArray(route)) {
    const first = route.find((entry) => typeof entry === 'string');
    return normalizeRoute(first || '');
  }

  const normalized = typeof route === 'string' ? route : String(route || '');

  return normalized
    // Replace UUIDs
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    // Replace numeric IDs
    .replace(/\/\d+/g, '/:id')
    // Replace alphanumeric IDs (at least 8 chars with numbers)
    .replace(/\/[a-z0-9]{8,}/gi, '/:id')
    // Replace hex strings (common in some IDs)
    .replace(/\/[0-9a-f]{6,}/gi, '/:id')
    // Clean up multiple consecutive :id patterns
    .replace(/(\/:id){2,}/g, '/:id');
}

export default metricsMiddleware;
