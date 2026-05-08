import Redis from 'ioredis';
import logger from './logger.js';

let redisClient = null;
let redisConfigured = false;
let redisAvailable = false;
let initialized = false;

const initializeRedis = () => {
  if (initialized) {
    return;
  }
  initialized = true;

  const rawUrl = process.env.REDIS_URL;
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : rawUrl;

  if (!url) {
    return;
  }

  try {
    redisConfigured = true;
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        if (times > 3) {
          return null;
        }
        return Math.min(times * 100, 2000);
      }
    });

    redisClient.on('connect', () => {
      redisAvailable = true;
    });

    redisClient.on('ready', () => {
      redisAvailable = true;
    });

    redisClient.on('error', (err) => {
      redisAvailable = false;
      logger.error('REDIS_CLIENT', 'Redis client error', err, {
        event: 'redis_client_error'
      });
    });

    redisClient.on('close', () => {
      redisAvailable = false;
    });

    redisClient.on('end', () => {
      redisAvailable = false;
    });
  } catch (error) {
    logger.error('REDIS_CLIENT', 'Redis client init error', error, {
      event: 'redis_client_init_error'
    });
  }
};

export const getRedisClient = () => {
  initializeRedis();
  return {
    client: redisClient,
    configured: redisConfigured,
    available: redisAvailable
  };
};

export const getRedisState = () => {
  const { client } = getRedisClient();
  if (!redisConfigured || !client) {
    return { configured: false, status: 'disabled', available: false };
  }
  return {
    configured: true,
    status: client.status || 'unknown',
    available: redisAvailable
  };
};
