import http from 'http';

/**
 * Health check HTTP server
 * Provides /health and /metrics endpoints for monitoring
 */

class HealthServer {
  constructor(options = {}) {
    this.port = options.port || 3001;
    this.metrics = options.metrics;
    this.logger = options.logger;
    this.server = null;
  }

  /**
   * Start health check server
   */
  start() {
    this.server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      // CORS headers for browser access
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      // Route handling
      if (url.pathname === '/health') {
        this.handleHealth(req, res);
      } else if (url.pathname === '/metrics') {
        this.handleMetrics(req, res);
      } else if (url.pathname === '/ready') {
        this.handleReady(req, res);
      } else if (url.pathname === '/live') {
        this.handleLive(req, res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Not found',
          endpoints: ['/health', '/metrics', '/ready', '/live']
        }));
      }
    });

    this.server.listen(this.port, () => {
      if (this.logger) {
        this.logger.info('Health server started', { port: this.port });
      }
    });

    this.server.on('error', (err) => {
      if (this.logger) {
        this.logger.error('Health server error', { error: err.message });
      }
    });
  }

  /**
   * Stop health check server
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          if (this.logger) {
            this.logger.info('Health server stopped');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle /health endpoint - comprehensive health status
   */
  handleHealth(req, res) {
    const snapshot = this.metrics ? this.metrics.getSnapshot() : {};
    const health = snapshot.health || {};

    // Determine HTTP status based on health
    let statusCode = 200;
    if (health.status === 'unhealthy') {
      statusCode = 503;
    } else if (health.status === 'degraded') {
      statusCode = 200; // Still accepting traffic but degraded
    }

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: health.status || 'unknown',
      timestamp: Date.now(),
      uptime: snapshot.uptime,
      inflight: snapshot.gauges?.inflightTracks || 0,
      counters: snapshot.counters,
      lastError: health.lastError,
      lastErrorTime: health.lastErrorTime,
      consecutiveErrors: health.consecutiveErrors,
    }, null, 2));
  }

  /**
   * Handle /metrics endpoint - detailed metrics
   */
  handleMetrics(req, res) {
    const snapshot = this.metrics ? this.metrics.getSnapshot() : {};

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(snapshot, null, 2));
  }

  /**
   * Handle /ready endpoint - Kubernetes readiness probe
   * Returns 200 if worker is ready to accept work
   */
  handleReady(req, res) {
    const snapshot = this.metrics ? this.metrics.getSnapshot() : {};
    const health = snapshot.health || {};

    // Not ready if unhealthy or too many consecutive errors
    const isReady = health.status !== 'unhealthy' && health.consecutiveErrors < 10;

    res.writeHead(isReady ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ready: isReady,
      status: health.status || 'unknown',
      consecutiveErrors: health.consecutiveErrors,
    }));
  }

  /**
   * Handle /live endpoint - Kubernetes liveness probe
   * Returns 200 if worker process is alive
   */
  handleLive(req, res) {
    // If we can respond, we're alive
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      alive: true,
      timestamp: Date.now(),
    }));
  }
}

export default HealthServer;
