import logger from './logger.js';

/**
 * Metrics collection and aggregation utility
 * Supports histograms (with percentiles), counters, and gauges
 * Maintains rolling 1-hour window for histograms
 */

const ONE_HOUR_MS = 60 * 60 * 1000;

class Metrics {
  constructor() {
    this.histograms = new Map(); // key -> { values: [{value, timestamp}], labels }
    this.counters = new Map(); // key -> { count, labels }
    this.gauges = new Map(); // key -> { value, labels }

    // Start cleanup interval to remove old histogram data
    this.cleanupInterval = setInterval(() => {
      this._cleanupOldHistogramData();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Record a histogram value (for timing data)
   * @param {string} name - Metric name
   * @param {number} value - Value to record
   * @param {object} labels - Labels for this metric
   */
  recordHistogram(name, value, labels = {}) {
    const key = this._makeKey(name, labels);

    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        name,
        labels,
        values: []
      });
    }

    const metric = this.histograms.get(key);
    metric.values.push({
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Increment a counter
   * @param {string} name - Metric name
   * @param {number} increment - Amount to increment by (default 1)
   * @param {object} labels - Labels for this metric
   */
  incrementCounter(name, increment = 1, labels = {}) {
    const key = this._makeKey(name, labels);

    if (!this.counters.has(key)) {
      this.counters.set(key, {
        name,
        labels,
        count: 0
      });
    }

    const metric = this.counters.get(key);
    metric.count += increment;
  }

  /**
   * Set a gauge value
   * @param {string} name - Metric name
   * @param {number} value - Value to set
   * @param {object} labels - Labels for this metric
   */
  setGauge(name, value, labels = {}) {
    const key = this._makeKey(name, labels);

    this.gauges.set(key, {
      name,
      labels,
      value
    });
  }

  /**
   * Get all metrics in JSON format
   * @returns {object} All metrics with calculated statistics
   */
  getMetrics() {
    const now = Date.now();
    const oneHourAgo = now - ONE_HOUR_MS;

    const result = {
      timestamp: new Date().toISOString(),
      histograms: {},
      counters: {},
      gauges: {}
    };

    // Process histograms with percentile calculations
    for (const [key, metric] of this.histograms.entries()) {
      const recentValues = metric.values
        .filter(v => v.timestamp >= oneHourAgo)
        .map(v => v.value)
        .sort((a, b) => a - b);

      if (recentValues.length === 0) continue;

      const stats = {
        count: recentValues.length,
        min: recentValues[0],
        max: recentValues[recentValues.length - 1],
        mean: recentValues.reduce((a, b) => a + b, 0) / recentValues.length,
        p50: this._percentile(recentValues, 0.50),
        p95: this._percentile(recentValues, 0.95),
        p99: this._percentile(recentValues, 0.99),
        labels: metric.labels
      };

      if (!result.histograms[metric.name]) {
        result.histograms[metric.name] = [];
      }
      result.histograms[metric.name].push(stats);
    }

    // Process counters
    for (const [key, metric] of this.counters.entries()) {
      if (!result.counters[metric.name]) {
        result.counters[metric.name] = [];
      }
      result.counters[metric.name].push({
        count: metric.count,
        labels: metric.labels
      });
    }

    // Process gauges
    for (const [key, metric] of this.gauges.entries()) {
      if (!result.gauges[metric.name]) {
        result.gauges[metric.name] = [];
      }
      result.gauges[metric.name].push({
        value: metric.value,
        labels: metric.labels
      });
    }

    return result;
  }

  /**
   * Get metrics in Prometheus text format
   * @returns {string} Metrics in Prometheus format
   */
  getPrometheusMetrics() {
    const metrics = this.getMetrics();
    const lines = [];

    // Histograms
    for (const [name, entries] of Object.entries(metrics.histograms)) {
      lines.push(`# HELP ${name} Request duration in milliseconds`);
      lines.push(`# TYPE ${name} histogram`);

      for (const entry of entries) {
        const labelStr = this._formatPrometheusLabels(entry.labels);
        lines.push(`${name}_count${labelStr} ${entry.count}`);
        lines.push(`${name}_sum${labelStr} ${(entry.mean * entry.count).toFixed(2)}`);
        lines.push(`${name}_bucket{le="0.5"${this._formatPrometheusLabelsInline(entry.labels)}} ${entry.p50.toFixed(2)}`);
        lines.push(`${name}_bucket{le="0.95"${this._formatPrometheusLabelsInline(entry.labels)}} ${entry.p95.toFixed(2)}`);
        lines.push(`${name}_bucket{le="0.99"${this._formatPrometheusLabelsInline(entry.labels)}} ${entry.p99.toFixed(2)}`);
      }
    }

    // Counters
    for (const [name, entries] of Object.entries(metrics.counters)) {
      lines.push(`# HELP ${name} Total count`);
      lines.push(`# TYPE ${name} counter`);

      for (const entry of entries) {
        const labelStr = this._formatPrometheusLabels(entry.labels);
        lines.push(`${name}${labelStr} ${entry.count}`);
      }
    }

    // Gauges
    for (const [name, entries] of Object.entries(metrics.gauges)) {
      lines.push(`# HELP ${name} Current value`);
      lines.push(`# TYPE ${name} gauge`);

      for (const entry of entries) {
        const labelStr = this._formatPrometheusLabels(entry.labels);
        lines.push(`${name}${labelStr} ${entry.value}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.histograms.clear();
    this.counters.clear();
    this.gauges.clear();
  }

  /**
   * Cleanup old histogram data (keep only last hour)
   */
  _cleanupOldHistogramData() {
    const oneHourAgo = Date.now() - ONE_HOUR_MS;
    let totalCleaned = 0;

    for (const [key, metric] of this.histograms.entries()) {
      const originalLength = metric.values.length;
      metric.values = metric.values.filter(v => v.timestamp >= oneHourAgo);
      totalCleaned += originalLength - metric.values.length;

      // Remove metric entirely if no values remain
      if (metric.values.length === 0) {
        this.histograms.delete(key);
      }
    }

    if (totalCleaned > 0) {
      logger.debug({
        event: 'metrics_cleanup',
        cleaned: totalCleaned,
        remaining: Array.from(this.histograms.values()).reduce((sum, m) => sum + m.values.length, 0)
      }, 'Cleaned up old histogram data');
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  _percentile(sortedValues, percentile) {
    if (sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0];

    const index = (percentile * (sortedValues.length - 1));
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  /**
   * Create unique key for metric with labels
   */
  _makeKey(name, labels) {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  /**
   * Format labels for Prometheus
   */
  _formatPrometheusLabels(labels) {
    if (Object.keys(labels).length === 0) return '';

    const labelPairs = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `{${labelPairs}}`;
  }

  /**
   * Format labels inline for Prometheus (without outer braces)
   */
  _formatPrometheusLabelsInline(labels) {
    if (Object.keys(labels).length === 0) return '';

    const labelPairs = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `,${labelPairs}`;
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Singleton instance
const metrics = new Metrics();

// Convenience functions for common metrics
const metricsHelpers = {
  /**
   * Record HTTP request duration
   */
  recordHttpRequest(method, route, status, durationMs) {
    metrics.recordHistogram('http_request_duration_ms', durationMs, {
      method,
      route,
      status: String(status)
    });
  },

  /**
   * Record database query duration
   */
  recordDbQuery(queryName, durationMs) {
    metrics.recordHistogram('db_query_duration_ms', durationMs, {
      query_name: queryName
    });
  },

  /**
   * Record linking job duration
   */
  recordLinkingJob(platform, durationMs) {
    metrics.recordHistogram('linking_job_duration_ms', durationMs, {
      platform
    });
  },

  /**
   * Record export duration
   */
  recordExport(platform, durationMs) {
    metrics.recordHistogram('export_duration_ms', durationMs, {
      platform
    });
  },

  /**
   * Increment API call counter
   */
  incrementApiCall(platform, endpoint) {
    metrics.incrementCounter('api_call_count', 1, {
      platform,
      endpoint
    });
  },

  /**
   * Set cache hit rate
   */
  setCacheHitRate(cacheType, rate) {
    metrics.setGauge('cache_hit_rate', rate, {
      cache_type: cacheType
    });
  },

  /**
   * Set worker queue depth
   */
  setWorkerQueueDepth(workerType, depth) {
    metrics.setGauge('worker_queue_depth', depth, {
      worker_type: workerType
    });
  },

  /**
   * Increment error counter
   */
  incrementError(errorType, severity = 'error') {
    metrics.incrementCounter('error_count', 1, {
      error_type: errorType,
      severity
    });
  }
};

export { metrics };
export const {
  recordHttpRequest,
  recordDbQuery,
  recordLinkingJob,
  recordExport,
  incrementApiCall,
  setCacheHitRate,
  setWorkerQueueDepth,
  incrementError
} = metricsHelpers;
