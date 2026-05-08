/**
 * Site Analytics - Privacy-first frontend tracking
 * - No cookies (uses sessionStorage)
 * - SPA-aware with route change detection
 * - Tracks scroll depth and time on page
 * - Uses sendBeacon for reliable exit tracking
 */

import metaPixel from './metaPixel';

const API_BASE = '/api/v1/analytics';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const ACTION_FLUSH_INTERVAL = 5000; // 5 seconds
const ACTION_FLUSH_THRESHOLD = 25;
const ACTION_QUEUE_MAX = 100;
const DEDUP_WINDOW_MS = 200;

class SiteAnalytics {
  constructor() {
    this.sessionId = null;
    this.startTime = null;
    this.maxScrollDepth = 0;
    this.heartbeatTimer = null;
    this.currentPath = null;
    this.isInitialized = false;

    // Action tracking queue
    this.actionQueue = [];
    this.actionFlushTimer = null;
    this.lastAction = null;
    this.lastActionTime = 0;
  }

  /**
   * Initialize analytics tracking
   * Call this once when the app mounts
   */
  init() {
    if (this.isInitialized || typeof window === 'undefined') return;

    this.sessionId = this.getOrCreateSession();
    this.isInitialized = true;

    // Track initial pageview
    this.trackPageview();

    // Set up scroll tracking
    this.setupScrollTracking();

    // Set up exit tracking
    this.setupExitTracking();

    // Set up SPA route change detection
    this.setupRouteChangeDetection();

    // Set up action queue flushing
    this.setupActionQueue();
  }

  /**
   * Get or create session ID (stored in sessionStorage, no cookies)
   */
  getOrCreateSession() {
    try {
      let sessionId = sessionStorage.getItem('fp_analytics_session');
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem('fp_analytics_session', sessionId);
      }
      return sessionId;
    } catch {
      // Fallback if sessionStorage is not available
      return crypto.randomUUID();
    }
  }

  /**
   * Get UTM parameters from URL
   */
  getUTMParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      return {
        utm_source: params.get('utm_source') || undefined,
        utm_medium: params.get('utm_medium') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined,
        utm_term: params.get('utm_term') || undefined,
        utm_content: params.get('utm_content') || undefined
      };
    } catch {
      return {};
    }
  }

  /**
   * Track a pageview
   */
  async trackPageview() {
    const pagePath = window.location.pathname;

    // Skip if same page (prevents duplicate tracking)
    if (this.currentPath === pagePath) return;

    // If we have a previous page, send exit event for it
    if (this.currentPath && this.startTime) {
      this.sendExitEvent(this.currentPath);
    }

    // Reset for new page
    this.currentPath = pagePath;
    this.startTime = Date.now();
    this.maxScrollDepth = 0;

    // Stop previous heartbeat
    this.stopHeartbeat();

    const data = {
      page_path: pagePath,
      referrer: document.referrer || null,
      ...this.getUTMParams()
    };

    await this.send(`${API_BASE}/track`, data);

    metaPixel.trackPageView();

    // Start heartbeat for realtime tracking
    this.startHeartbeat();
  }

  /**
   * Set up scroll depth tracking
   */
  setupScrollTracking() {
    const handleScroll = () => {
      try {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const docHeight = Math.max(
          document.documentElement.scrollHeight - window.innerHeight,
          1
        );
        const scrollPercent = Math.round((scrollTop / docHeight) * 100);
        this.maxScrollDepth = Math.max(this.maxScrollDepth, Math.min(scrollPercent, 100));
      } catch {
        // Ignore scroll tracking errors
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  /**
   * Set up exit tracking via beforeunload
   */
  setupExitTracking() {
    const handleExit = () => {
      if (this.currentPath) {
        this.sendExitEvent(this.currentPath);
      }
    };

    // Use visibilitychange for mobile (more reliable than beforeunload)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        handleExit();
      }
    });

    // Also use beforeunload for desktop
    window.addEventListener('beforeunload', handleExit);

    // Use pagehide for Safari
    window.addEventListener('pagehide', handleExit);
  }

  /**
   * Set up SPA route change detection
   */
  setupRouteChangeDetection() {
    // Intercept history navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      // Small delay to let React update the URL
      setTimeout(() => this.trackPageview(), 50);
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      setTimeout(() => this.trackPageview(), 50);
    };

    // Handle back/forward navigation
    window.addEventListener('popstate', () => {
      setTimeout(() => this.trackPageview(), 50);
    });
  }

  /**
   * Send exit event for a page
   */
  sendExitEvent(pagePath) {
    const timeOnPage = this.startTime
      ? Math.round((Date.now() - this.startTime) / 1000)
      : 0;

    const data = JSON.stringify({
      page_path: pagePath,
      time_on_page: timeOnPage,
      scroll_depth: this.maxScrollDepth
    });

    // Use sendBeacon for reliable delivery during page unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${API_BASE}/exit`, data);
    } else {
      // Fallback for older browsers
      this.send(`${API_BASE}/exit`, JSON.parse(data));
    }
  }

  /**
   * Start heartbeat for realtime tracking
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send(`${API_BASE}/heartbeat`, {
        page_path: this.currentPath
      });
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ===== Action Tracking =====

  setupActionQueue() {
    this.actionFlushTimer = setInterval(() => this.flushActions(), ACTION_FLUSH_INTERVAL);

    // Flush on visibility hidden and pagehide
    const flushBeacon = () => this.flushActions(true);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushBeacon();
    });
    window.addEventListener('pagehide', flushBeacon);
  }

  isDuplicateAction(payload) {
    const now = Date.now();
    if (now - this.lastActionTime < DEDUP_WINDOW_MS && this.lastAction) {
      if (
        this.lastAction.feature_key === payload.feature_key &&
        this.lastAction.action_name === payload.action_name &&
        this.lastAction.target_key === payload.target_key
      ) {
        return true;
      }
    }
    this.lastAction = payload;
    this.lastActionTime = now;
    return false;
  }

  enqueueAction(payload) {
    try {
      if (!this.isInitialized) return;
      if (this.isDuplicateAction(payload)) return;

      // Add page_path
      payload.page_path = window.location.pathname;

      this.actionQueue.push(payload);

      // Overflow: drop oldest
      if (this.actionQueue.length > ACTION_QUEUE_MAX) {
        this.actionQueue = this.actionQueue.slice(-ACTION_QUEUE_MAX);
      }

      // Flush at threshold
      if (this.actionQueue.length >= ACTION_FLUSH_THRESHOLD) {
        this.flushActions();
      }
    } catch {
      // Never throw from analytics
    }
  }

  flushActions(useBeacon = false) {
    try {
      if (this.actionQueue.length === 0) return;

      const batch = this.actionQueue.splice(0, ACTION_FLUSH_THRESHOLD);
      const payload = JSON.stringify(batch);

      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(`${API_BASE}/actions`, payload);
      } else {
        this.send(`${API_BASE}/actions`, batch);
      }
    } catch {
      // Discard on failure - analytics is non-critical
    }
  }

  trackAction(payload) {
    try {
      this.enqueueAction(payload);
    } catch {
      // Never throw
    }
  }

  trackFeatureStart(featureKey, actionName, metadata) {
    this.trackAction({
      feature_key: featureKey,
      action_type: 'start',
      action_name: actionName,
      metadata,
    });
  }

  trackFeatureComplete(featureKey, actionName, metadata) {
    this.trackAction({
      feature_key: featureKey,
      action_type: 'complete',
      action_name: actionName,
      metadata,
    });
  }

  trackFeatureError(featureKey, actionName, metadata) {
    this.trackAction({
      feature_key: featureKey,
      action_type: 'error',
      action_name: actionName,
      metadata,
    });
  }

  trackClick(featureKey, targetKey, metadata) {
    this.trackAction({
      feature_key: featureKey,
      action_type: 'click',
      action_name: targetKey,
      target_key: targetKey,
      metadata,
    });
  }

  trackPerformance(featureKey, metricName, durationMs, metadata) {
    this.trackAction({
      feature_key: featureKey,
      action_type: 'performance',
      action_name: metricName,
      duration_ms: durationMs,
      value_num: durationMs,
      metadata,
    });
  }

  /**
   * Send data to analytics API
   */
  async send(endpoint, data) {
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true
      });
    } catch {
      // Fail silently - analytics should never break the site
    }
  }
}

// Singleton instance
const siteAnalytics = new SiteAnalytics();

export default siteAnalytics;
