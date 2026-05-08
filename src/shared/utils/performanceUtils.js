// Performance optimization utilities for Flowerpil

import React from 'react';

const PERF_ENDPOINT = '/api/v1/logs/performance';
const DEFAULT_SAMPLE_RATE = 0.05;
const MAX_PERF_EVENTS = 25;
let perfEventsSent = 0;

const resolveSampleRate = () => {
  if (typeof window !== 'undefined') {
    const fromWindow = Number(window.__FLOWERPIL_PERF_SAMPLE_RATE);
    if (Number.isFinite(fromWindow) && fromWindow >= 0 && fromWindow <= 1) {
      return fromWindow;
    }
  }
  const envRate = typeof import.meta !== 'undefined' && import.meta.env
    ? Number.parseFloat(import.meta.env.VITE_PERF_SAMPLE_RATE || 'NaN')
    : NaN;
  if (Number.isFinite(envRate) && envRate >= 0 && envRate <= 1) {
    return envRate;
  }
  return DEFAULT_SAMPLE_RATE;
};

const shouldSampleMetric = () => {
  const rate = resolveSampleRate();
  return rate > 0 && Math.random() <= rate;
};

const sendPerformancePayload = (payload) => {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(PERF_ENDPOINT, blob);
      return;
    }
    if (typeof fetch === 'function') {
      fetch(PERF_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      }).catch(() => {});
    }
  } catch {
    // swallow client-side errors to avoid impacting UX
  }
};

const normalizeMetricName = (label = '') => (
  label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'metric'
);

export const reportFrontendMetric = (metricName, value, tags = {}) => {
  if (typeof window === 'undefined') {
    return;
  }
  if (perfEventsSent >= MAX_PERF_EVENTS) {
    return;
  }
  if (!metricName || typeof metricName !== 'string') {
    return;
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return;
  }
  if (!shouldSampleMetric()) {
    return;
  }
  perfEventsSent += 1;
  sendPerformancePayload({
    metric: normalizeMetricName(metricName),
    value: Math.round(numericValue),
    audience: 'public-client',
    tags: {
      path: window.location?.pathname || '/',
      ...tags
    }
  });
};

// Image lazy loading with intersection observer
export class LazyImageLoader {
  constructor(options = {}) {
    this.options = {
      rootMargin: '50px',
      threshold: 0.1,
      ...options
    };
    
    this.observer = new IntersectionObserver(
      this.handleIntersection.bind(this),
      this.options
    );
    
    this.imageCache = new Map();
  }

  observe(element) {
    if (element) {
      this.observer.observe(element);
    }
  }

  unobserve(element) {
    if (element) {
      this.observer.unobserve(element);
    }
  }

  handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        this.loadImage(entry.target);
        this.observer.unobserve(entry.target);
      }
    });
  }

  async loadImage(element) {
    const src = element.dataset.src;
    if (!src) return;

    try {
      // Check cache first
      if (this.imageCache.has(src)) {
        element.src = src;
        element.classList.add('loaded');
        return;
      }

      // Load image
      const img = new Image();
      img.onload = () => {
        element.src = src;
        element.classList.add('loaded');
        this.imageCache.set(src, true);
      };
      img.onerror = () => {
        element.classList.add('error');
      };
      img.src = src;
    } catch (error) {
      console.error('Error loading image:', error);
      element.classList.add('error');
    }
  }

  disconnect() {
    this.observer.disconnect();
    this.imageCache.clear();
  }
}

// API response caching
export class APICache {
  constructor(ttl = 5 * 60 * 1000) { // 5 minutes default
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, data, ttlOverride) {
    try {
      JSON.stringify(data); // Validate before storing
      const entry = {
        data,
        timestamp: Date.now(),
        ttl: typeof ttlOverride === 'number' ? ttlOverride : this.ttl
      };
      this.cache.set(key, entry);
    } catch (error) {
      console.error('Failed to cache data (invalid JSON):', key, error);
    }
  }

  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  keys() {
    return Array.from(this.cache.keys());
  }

  // Clean up expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Debounce utility for search inputs
export function debounce(func, wait, immediate = false) {
  let timeout;
  
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    
    if (callNow) func(...args);
  };
}

// Throttle utility for scroll events
export function throttle(func, limit) {
  let inThrottle;
  
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Virtual scrolling for large lists
export class VirtualScroller {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      itemHeight: 60,
      buffer: 5,
      ...options
    };
    
    this.scrollTop = 0;
    this.containerHeight = 0;
    this.totalItems = 0;
    this.visibleItems = [];
    
    this.init();
  }

  init() {
    this.updateDimensions();
    this.container.addEventListener('scroll', this.handleScroll.bind(this));
    window.addEventListener('resize', this.updateDimensions.bind(this));
  }

  updateDimensions() {
    this.containerHeight = this.container.clientHeight;
    this.calculate();
  }

  setItems(items) {
    this.totalItems = items.length;
    this.calculate();
  }

  calculate() {
    const itemsInView = Math.ceil(this.containerHeight / this.options.itemHeight);
    const startIndex = Math.floor(this.scrollTop / this.options.itemHeight);
    
    const start = Math.max(0, startIndex - this.options.buffer);
    const end = Math.min(
      this.totalItems,
      startIndex + itemsInView + this.options.buffer
    );

    this.visibleItems = {
      start,
      end,
      offsetY: start * this.options.itemHeight
    };
  }

  handleScroll() {
    this.scrollTop = this.container.scrollTop;
    this.calculate();
  }

  getVisibleRange() {
    return this.visibleItems;
  }

  destroy() {
    this.container.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.updateDimensions);
  }
}

// Performance monitoring
export class PerformanceMonitor {
  constructor(options = {}) {
    this.metrics = new Map();
    this.autoReport = Boolean(options.autoReport);
  }

  start(label) {
    this.metrics.set(label, performance.now());
  }

  end(label) {
    const startTime = this.metrics.get(label);
    if (startTime) {
      const duration = performance.now() - startTime;
      console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
      this.metrics.delete(label);
      if (this.autoReport) {
        reportFrontendMetric(`trace_${normalizeMetricName(label)}`, duration, { label });
      }
      return duration;
    }
  }

  measure(label, fn) {
    this.start(label);
    const result = fn();
    this.end(label);
    return result;
  }

  async measureAsync(label, fn) {
    this.start(label);
    const result = await fn();
    this.end(label);
    return result;
  }
}

// Component performance wrapper
export function withPerformanceMonitoring(Component, name) {
  return function PerformanceWrappedComponent(props) {
    React.useEffect(() => {
      if (typeof performance === 'undefined') {
        return undefined;
      }
      const start = performance.now();
      const rafId = requestAnimationFrame(() => {
        const duration = performance.now() - start;
        reportFrontendMetric('component_first_paint', duration, {
          component: name
        });
      });
      return () => {
        cancelAnimationFrame(rafId);
      };
    }, []);

    return React.createElement(Component, props);
  };
}

// Memory usage tracking
export function trackMemoryUsage(label = 'Memory Usage') {
  if (performance.memory) {
    const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
    const total = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
    console.log(`🧠 ${label}: ${used}MB / ${total}MB`);
    return { used, total };
  }
  return null;
}

// Preload critical resources
export function preloadResource(url, type = 'image') {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = type;
    link.href = url;
    
    link.onload = resolve;
    link.onerror = reject;
    
    document.head.appendChild(link);
  });
}

// Batch DOM updates
export function batchDOMUpdates(updates) {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      updates.forEach(update => update());
      resolve();
    });
  });
}

// Global cache instances
export const imageLoader = new LazyImageLoader();
export const apiCache = new APICache();
export const performanceMonitor = new PerformanceMonitor({ autoReport: true });
