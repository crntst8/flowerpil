/**
 * Metrics collection for portable linking worker
 * Tracks operational metrics for monitoring and observability
 */

class Metrics {
  constructor() {
    this.startTime = Date.now();
    this.counters = {
      tracksLeased: 0,
      tracksCompleted: 0,
      tracksFailed: 0,
      heartbeatsSent: 0,
      reportsSubmitted: 0,
      errorsEncountered: 0,
    };

    this.platformCounters = {
      apple: { success: 0, failure: 0, notFound: 0 },
      tidal: { success: 0, failure: 0, notFound: 0 },
      spotify: { success: 0, failure: 0, notFound: 0 },
    };

    this.gauges = {
      inflightTracks: 0,
      lastHeartbeatTime: 0,
      lastReportTime: 0,
    };

    this.timers = {
      trackProcessingTimes: [],
      apiCallTimes: {
        lease: [],
        heartbeat: [],
        report: [],
      },
    };

    this.health = {
      status: 'starting', // starting, healthy, degraded, unhealthy
      lastError: null,
      lastErrorTime: null,
      consecutiveErrors: 0,
    };
  }

  /**
   * Increment a counter
   */
  incrementCounter(name, value = 1) {
    if (this.counters[name] !== undefined) {
      this.counters[name] += value;
    }
  }

  /**
   * Set a gauge value
   */
  setGauge(name, value) {
    if (this.gauges[name] !== undefined) {
      this.gauges[name] = value;
    }
  }

  /**
   * Record a timing measurement (in milliseconds)
   */
  recordTiming(category, subcategory, value) {
    if (subcategory && this.timers[category] && this.timers[category][subcategory]) {
      this.timers[category][subcategory].push(value);
      // Keep only last 100 measurements to avoid memory issues
      if (this.timers[category][subcategory].length > 100) {
        this.timers[category][subcategory].shift();
      }
    } else if (this.timers[category] && Array.isArray(this.timers[category])) {
      this.timers[category].push(value);
      if (this.timers[category].length > 100) {
        this.timers[category].shift();
      }
    }
  }

  /**
   * Record platform result
   */
  recordPlatformResult(platform, success, found) {
    if (this.platformCounters[platform]) {
      if (success) {
        if (found) {
          this.platformCounters[platform].success++;
        } else {
          this.platformCounters[platform].notFound++;
        }
      } else {
        this.platformCounters[platform].failure++;
      }
    }
  }

  /**
   * Update health status
   */
  updateHealth(status, error = null) {
    this.health.status = status;
    if (error) {
      this.health.lastError = error.message || String(error);
      this.health.lastErrorTime = Date.now();
      this.health.consecutiveErrors++;
    } else {
      this.health.consecutiveErrors = 0;
    }
  }

  /**
   * Calculate average from array of timings
   */
  calculateAverage(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Calculate percentile from array of timings
   */
  calculatePercentile(arr, percentile) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Get current metrics snapshot
   */
  getSnapshot() {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      uptime: {
        seconds: uptimeSeconds,
        human: this.formatUptime(uptimeSeconds),
      },
      counters: { ...this.counters },
      gauges: { ...this.gauges },
      platforms: Object.entries(this.platformCounters).reduce((acc, [platform, counts]) => {
        const total = counts.success + counts.failure + counts.notFound;
        acc[platform] = {
          ...counts,
          total,
          successRate: total > 0 ? (counts.success / total * 100).toFixed(2) + '%' : 'N/A',
        };
        return acc;
      }, {}),
      performance: {
        trackProcessing: {
          avg: Math.round(this.calculateAverage(this.timers.trackProcessingTimes)),
          p95: Math.round(this.calculatePercentile(this.timers.trackProcessingTimes, 95)),
          p99: Math.round(this.calculatePercentile(this.timers.trackProcessingTimes, 99)),
        },
        apiCalls: {
          lease: {
            avg: Math.round(this.calculateAverage(this.timers.apiCallTimes.lease)),
          },
          heartbeat: {
            avg: Math.round(this.calculateAverage(this.timers.apiCallTimes.heartbeat)),
          },
          report: {
            avg: Math.round(this.calculateAverage(this.timers.apiCallTimes.report)),
          },
        },
      },
      health: {
        ...this.health,
        timestamp: Date.now(),
      },
      rates: {
        tracksPerMinute: uptimeSeconds > 0
          ? ((this.counters.tracksCompleted / uptimeSeconds) * 60).toFixed(2)
          : '0.00',
        errorRate: this.counters.tracksCompleted > 0
          ? ((this.counters.tracksFailed / this.counters.tracksCompleted) * 100).toFixed(2) + '%'
          : 'N/A',
      },
    };
  }

  /**
   * Format uptime in human-readable format
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.startTime = Date.now();
    Object.keys(this.counters).forEach(key => this.counters[key] = 0);
    Object.keys(this.gauges).forEach(key => this.gauges[key] = 0);
    Object.keys(this.platformCounters).forEach(platform => {
      this.platformCounters[platform] = { success: 0, failure: 0, notFound: 0 };
    });
    Object.keys(this.timers).forEach(key => {
      if (typeof this.timers[key] === 'object') {
        Object.keys(this.timers[key]).forEach(subkey => {
          this.timers[key][subkey] = [];
        });
      } else {
        this.timers[key] = [];
      }
    });
    this.health = {
      status: 'healthy',
      lastError: null,
      lastErrorTime: null,
      consecutiveErrors: 0,
    };
  }
}

export default Metrics;
