/**
 * Rate Limiter for Apple Music Scraping
 * 
 * Implements respectful scraping limits to avoid detection
 * and comply with rate limiting best practices.
 */
class RateLimiter {
  constructor(maxRequests = 10, timeWindowMs = 60000) {
    this.maxRequests = maxRequests;
    this.timeWindowMs = timeWindowMs;
    this.requests = []; // Array of timestamps
    this.waitQueue = []; // Promises waiting for capacity
  }

  /**
   * Wait for capacity to make a request
   */
  async wait() {
    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
      this.processQueue();
    });
  }

  /**
   * Process the wait queue and release requests when capacity is available
   */
  processQueue() {
    const now = Date.now();
    
    // Remove requests outside the time window
    this.requests = this.requests.filter(timestamp => now - timestamp < this.timeWindowMs);
    
    // Check if we have capacity
    if (this.requests.length < this.maxRequests && this.waitQueue.length > 0) {
      // Record this request
      this.requests.push(now);
      
      // Release the next waiting request
      const resolve = this.waitQueue.shift();
      resolve();
      
      // Process more if we still have capacity
      if (this.waitQueue.length > 0) {
        // Use setTimeout to avoid blocking
        setTimeout(() => this.processQueue(), 100);
      }
    } else if (this.waitQueue.length > 0) {
      // No capacity, schedule retry
      const timeToNextSlot = this.getTimeToNextSlot();
      setTimeout(() => this.processQueue(), timeToNextSlot);
    }
  }

  /**
   * Calculate time until next request slot is available
   */
  getTimeToNextSlot() {
    if (this.requests.length === 0) {
      return 0;
    }
    
    const oldestRequest = Math.min(...this.requests);
    const timeToExpire = this.timeWindowMs - (Date.now() - oldestRequest);
    return Math.max(100, timeToExpire);
  }

  /**
   * Get current rate limit status
   */
  getStatus() {
    const now = Date.now();
    this.requests = this.requests.filter(timestamp => now - timestamp < this.timeWindowMs);
    
    return {
      requestsInWindow: this.requests.length,
      maxRequests: this.maxRequests,
      timeWindowMs: this.timeWindowMs,
      queueLength: this.waitQueue.length,
      available: this.requests.length < this.maxRequests
    };
  }

  /**
   * Reset the rate limiter
   */
  reset() {
    this.requests = [];
    this.waitQueue = [];
  }
}

export default RateLimiter;