import Redis from 'ioredis';
import logger from './logger.js';

/**
 * Token Bucket Algorithm implementation using Redis for distributed rate limiting.
 * Allows multiple workers to coordinate and share rate limits across platforms.
 */
class DistributedRateLimiter {
  constructor(platform, options = {}) {
    this.platform = platform;
    this.redisKey = `rl:${platform}:tokens`;
    this.refillKey = `rl:${platform}:refill_time`;

    // Platform-specific configs with defaults
    // Note: TIDAL is very aggressive with 429s, so we use conservative limits
    const configs = {
      spotify: { capacity: 100, refillRate: 10 }, // 10 tokens per second
      tidal: { capacity: 2, refillRate: 2 },      // 2 tokens per second (conservative for TIDAL's 429 responses)
      apple: { capacity: 20, refillRate: 5 },     // 5 tokens per second
    };

    const config = configs[platform.toLowerCase()] || { capacity: 10, refillRate: 1 };
    this.capacity = options.capacity || config.capacity;
    this.refillRate = options.refillRate || config.refillRate; // tokens per second

    // Redis connection
    this.redis = null;
    this.redisAvailable = false;
    this.redisConfigured = false;
    this.initializeRedis(options.redisUrl);

    // Fallback local rate limiter
    this.localTokens = this.capacity;
    this.localLastRefill = Date.now();

    // Metrics
    this.metrics = {
      acquireCount: 0,
      releaseCount: 0,
      denialCount: 0,
      waitTimeTotal: 0,
      redisErrors: 0,
    };
  }

  /**
   * Initialize Redis connection with error handling
   */
  initializeRedis(redisUrl) {
    const rawUrl = redisUrl || process.env.REDIS_URL;
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : rawUrl;

    if (!url) {
      logger.warn({
        event: 'rate_limiter_redis_disabled',
        platform: this.platform,
        message: 'REDIS_URL not configured, falling back to local rate limiting'
      });
      return;
    }

    try {
      this.redisConfigured = true;
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy: (times) => {
          if (times > 3) {
            logger.error({
              event: 'rate_limiter_redis_connection_failed',
              platform: this.platform,
              retries: times,
            });
            return null; // Stop retrying
          }
          return Math.min(times * 100, 2000); // Exponential backoff
        }
      });

      this.redis.on('connect', () => {
        this.redisAvailable = true;
        logger.info({
          event: 'rate_limiter_redis_connected',
          platform: this.platform,
        });
      });

      this.redis.on('ready', () => {
        this.redisAvailable = true;
        logger.info({
          event: 'rate_limiter_redis_ready',
          platform: this.platform,
        });
      });

      this.redis.on('error', (err) => {
        this.redisAvailable = false;
        this.metrics.redisErrors++;
        logger.error({
          event: 'rate_limiter_redis_error',
          platform: this.platform,
          error: err.message,
        });
      });

      this.redis.on('close', () => {
        this.redisAvailable = false;
        logger.warn({
          event: 'rate_limiter_redis_disconnected',
          platform: this.platform,
        });
      });

      this.redis.on('end', () => {
        this.redisAvailable = false;
        logger.warn({
          event: 'rate_limiter_redis_ended',
          platform: this.platform,
        });
      });

    } catch (error) {
      logger.error({
        event: 'rate_limiter_redis_init_error',
        platform: this.platform,
        error: error.message,
      });
    }
  }

  /**
   * Wait for Redis to become ready (best-effort).
   * @param {number} timeoutMs
   * @returns {Promise<boolean>} true if Redis reports ready before timeout
   */
  async waitForReady(timeoutMs = 1000) {
    if (!this.redisConfigured || !this.redis) return false;

    const status = this.redis.status;
    if (status === 'ready') return true;

    return await new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        this.redis?.off('ready', onReady);
        clearTimeout(timer);
      };

      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(true);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(this.redis?.status === 'ready');
      }, Math.max(0, Number(timeoutMs) || 0));

      this.redis.on('ready', onReady);
    });
  }

  /**
   * Snapshot of the current Redis connection state (safe to log).
   */
  getRedisState() {
    if (!this.redisConfigured || !this.redis) {
      return { configured: false, status: 'disabled', available: false };
    }
    return {
      configured: true,
      status: this.redis.status || 'unknown',
      available: this.redisAvailable
    };
  }

  /**
   * Token bucket refill logic using Lua script for atomic operations
   * Returns current available tokens after refill
   */
  async refillTokens() {
    if (!this.redisAvailable || !this.redis) {
      return this.refillTokensLocal();
    }

    try {
      // Lua script for atomic token bucket refill
      const luaScript = `
        local key = KEYS[1]
        local refill_key = KEYS[2]
        local capacity = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])

        local current_tokens = tonumber(redis.call('GET', key)) or capacity
        local last_refill = tonumber(redis.call('GET', refill_key)) or now

        local time_elapsed = (now - last_refill) / 1000
        local tokens_to_add = time_elapsed * refill_rate
        local new_tokens = math.min(capacity, current_tokens + tokens_to_add)

        redis.call('SET', key, new_tokens)
        redis.call('SET', refill_key, now)

        return new_tokens
      `;

      const result = await this.redis.eval(
        luaScript,
        2,
        this.redisKey,
        this.refillKey,
        this.capacity,
        this.refillRate,
        Date.now()
      );

      return parseFloat(result);
    } catch (error) {
      this.metrics.redisErrors++;
      logger.error({
        event: 'rate_limiter_refill_error',
        platform: this.platform,
        error: error.message,
      });
      return this.refillTokensLocal();
    }
  }

  /**
   * Fallback local token bucket refill
   */
  refillTokensLocal() {
    const now = Date.now();
    const elapsed = (now - this.localLastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;
    this.localTokens = Math.min(this.capacity, this.localTokens + tokensToAdd);
    this.localLastRefill = now;
    return this.localTokens;
  }

  /**
   * Acquire tokens from the bucket (distributed or local)
   * @param {number} count - Number of tokens to acquire
   * @param {number} maxWait - Maximum time to wait in ms (0 = no wait)
   * @returns {Promise<boolean>} - True if tokens acquired, false if denied
   */
  async acquire(count = 1, maxWait = 0) {
    const startTime = Date.now();
    this.metrics.acquireCount++;

    if (!this.redisAvailable || !this.redis) {
      return this.acquireLocal(count, maxWait, startTime);
    }

    try {
      // Lua script for atomic token acquisition
      const luaScript = `
        local key = KEYS[1]
        local refill_key = KEYS[2]
        local capacity = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        local count = tonumber(ARGV[4])

        -- Refill first
        local current_tokens = tonumber(redis.call('GET', key)) or capacity
        local last_refill = tonumber(redis.call('GET', refill_key)) or now
        local time_elapsed = (now - last_refill) / 1000
        local tokens_to_add = time_elapsed * refill_rate
        local new_tokens = math.min(capacity, current_tokens + tokens_to_add)

        -- Try to acquire
        if new_tokens >= count then
          new_tokens = new_tokens - count
          redis.call('SET', key, new_tokens)
          redis.call('SET', refill_key, now)
          return 1
        else
          redis.call('SET', key, new_tokens)
          redis.call('SET', refill_key, now)
          return 0
        end
      `;

      let acquired = false;
      const deadline = startTime + maxWait;

      while (Date.now() < deadline || maxWait === 0) {
        const result = await this.redis.eval(
          luaScript,
          2,
          this.redisKey,
          this.refillKey,
          this.capacity,
          this.refillRate,
          Date.now(),
          count
        );

        if (result === 1) {
          acquired = true;
          break;
        }

        if (maxWait === 0) {
          break;
        }

        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const waitTime = Date.now() - startTime;
      this.metrics.waitTimeTotal += waitTime;

      if (!acquired) {
        this.metrics.denialCount++;
      }

      return acquired;
    } catch (error) {
      this.metrics.redisErrors++;
      logger.error({
        event: 'rate_limiter_acquire_error',
        platform: this.platform,
        error: error.message,
      });
      return this.acquireLocal(count, maxWait, startTime);
    }
  }

  /**
   * Fallback local token acquisition
   */
  async acquireLocal(count, maxWait, startTime) {
    const deadline = startTime + maxWait;

    while (Date.now() < deadline || maxWait === 0) {
      this.refillTokensLocal();

      if (this.localTokens >= count) {
        this.localTokens -= count;
        return true;
      }

      if (maxWait === 0) {
        this.metrics.denialCount++;
        return false;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.metrics.denialCount++;
    return false;
  }

  /**
   * Release tokens back to the bucket (for cases where request failed before using)
   * @param {number} count - Number of tokens to release
   */
  async release(count = 1) {
    this.metrics.releaseCount++;

    if (!this.redisAvailable || !this.redis) {
      this.localTokens = Math.min(this.capacity, this.localTokens + count);
      return;
    }

    try {
      // Lua script for atomic token release
      const luaScript = `
        local key = KEYS[1]
        local capacity = tonumber(ARGV[1])
        local count = tonumber(ARGV[2])

        local current_tokens = tonumber(redis.call('GET', key)) or capacity
        local new_tokens = math.min(capacity, current_tokens + count)

        redis.call('SET', key, new_tokens)
        return new_tokens
      `;

      await this.redis.eval(
        luaScript,
        1,
        this.redisKey,
        this.capacity,
        count
      );
    } catch (error) {
      this.metrics.redisErrors++;
      logger.error({
        event: 'rate_limiter_release_error',
        platform: this.platform,
        error: error.message,
      });
      this.localTokens = Math.min(this.capacity, this.localTokens + count);
    }
  }

  /**
   * Get current available tokens
   * @returns {Promise<number>} - Available token count
   */
  async getAvailable() {
    if (!this.redisAvailable || !this.redis) {
      this.refillTokensLocal();
      return this.localTokens;
    }

    try {
      await this.refillTokens();
      const tokens = await this.redis.get(this.redisKey);
      return parseFloat(tokens) || this.capacity;
    } catch (error) {
      this.metrics.redisErrors++;
      logger.error({
        event: 'rate_limiter_get_available_error',
        platform: this.platform,
        error: error.message,
      });
      this.refillTokensLocal();
      return this.localTokens;
    }
  }

  /**
   * Get rate limiter metrics
   * @returns {Object} - Metrics object
   */
  getMetrics() {
    return {
      ...this.metrics,
      platform: this.platform,
      capacity: this.capacity,
      refillRate: this.refillRate,
      redisAvailable: this.redisAvailable,
      averageWaitTime: this.metrics.acquireCount > 0
        ? this.metrics.waitTimeTotal / this.metrics.acquireCount
        : 0,
      denialRate: this.metrics.acquireCount > 0
        ? this.metrics.denialCount / this.metrics.acquireCount
        : 0,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      acquireCount: 0,
      releaseCount: 0,
      denialCount: 0,
      waitTimeTotal: 0,
      redisErrors: 0,
    };
  }

  /**
   * Clean up Redis connection
   */
  async disconnect() {
    if (this.redis) {
      await this.redis.quit();
      this.redisAvailable = false;
    }
  }
}

export default DistributedRateLimiter;
