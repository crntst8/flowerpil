import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import DistributedRateLimiter from '../utils/DistributedRateLimiter.js';

describe('DistributedRateLimiter', () => {
  let spotifyLimiter;
  let tidalLimiter;
  let appleLimiter;

  beforeAll(() => {
    spotifyLimiter = new DistributedRateLimiter('spotify');
    tidalLimiter = new DistributedRateLimiter('tidal');
    appleLimiter = new DistributedRateLimiter('apple');
  });

  afterAll(async () => {
    await spotifyLimiter.disconnect();
    await tidalLimiter.disconnect();
    await appleLimiter.disconnect();
  });

  describe('Platform Configuration', () => {
    it('should configure Spotify with correct capacity and refill rate', () => {
      expect(spotifyLimiter.capacity).toBe(100);
      expect(spotifyLimiter.refillRate).toBe(10);
    });

    it('should configure TIDAL with correct capacity and refill rate', () => {
      expect(tidalLimiter.capacity).toBe(2);
      expect(tidalLimiter.refillRate).toBe(2);
    });

    it('should configure Apple Music with correct capacity and refill rate', () => {
      expect(appleLimiter.capacity).toBe(20);
      expect(appleLimiter.refillRate).toBe(5);
    });
  });

  describe('Token Acquisition', () => {
    it('should successfully acquire a single token', async () => {
      const result = await spotifyLimiter.acquire(1, 0);
      expect(result).toBe(true);
    });

    it('should successfully acquire multiple tokens', async () => {
      const result = await spotifyLimiter.acquire(5, 0);
      expect(result).toBe(true);
    });

    it('should wait and acquire when tokens are available', async () => {
      // This test might take a moment as it waits for refill
      const startTime = Date.now();
      const result = await tidalLimiter.acquire(1, 5000); // 5s max wait
      const duration = Date.now() - startTime;

      expect(result).toBe(true);
      // Should either be immediate or wait for refill
      expect(duration).toBeLessThan(5000);
    }, 10000);
  });

  describe('Token Release', () => {
    it('should successfully release tokens back to the bucket', async () => {
      await spotifyLimiter.release(5);
      const available = await spotifyLimiter.getAvailable();
      expect(available).toBeGreaterThan(0);
    });
  });

  describe('Metrics', () => {
    it('should track acquisition metrics', async () => {
      await spotifyLimiter.acquire(1, 0);
      const metrics = spotifyLimiter.getMetrics();

      expect(metrics.acquireCount).toBeGreaterThan(0);
      expect(metrics.platform).toBe('spotify');
      expect(metrics.capacity).toBe(100);
      expect(metrics.refillRate).toBe(10);
    });

    it('should provide denial rate statistics', () => {
      const metrics = spotifyLimiter.getMetrics();
      expect(metrics).toHaveProperty('denialRate');
      expect(metrics).toHaveProperty('averageWaitTime');
    });
  });

  describe('Fallback Behavior', () => {
    it('should work without Redis (local fallback)', async () => {
      // Create limiter without Redis
      const localLimiter = new DistributedRateLimiter('test', {
        capacity: 10,
        refillRate: 5,
        redisUrl: undefined
      });

      const result = await localLimiter.acquire(1, 0);
      expect(result).toBe(true);

      const metrics = localLimiter.getMetrics();
      expect(metrics.redisAvailable).toBe(false);

      await localLimiter.disconnect();
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent token acquisitions', async () => {
      const promises = [];

      // Try to acquire 5 tokens concurrently
      for (let i = 0; i < 5; i++) {
        promises.push(appleLimiter.acquire(1, 2000));
      }

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r === true).length;

      // At least some should succeed (depending on available tokens)
      expect(successCount).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Capacity Limits', () => {
    it('should not exceed capacity', async () => {
      const available = await tidalLimiter.getAvailable();
      expect(available).toBeLessThanOrEqual(tidalLimiter.capacity);
    });

    it('should deny acquisition when capacity exhausted with no wait', async () => {
      // Try to acquire more than capacity with no wait
      const result = await tidalLimiter.acquire(1000, 0);
      expect(result).toBe(false);
    });
  });
});
