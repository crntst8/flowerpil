import { getRedisClient } from './redisClient.js';

const CACHE_PREFIX = 'fp:cache';

const buildCacheKey = (namespace, key) => `${CACHE_PREFIX}:${namespace}:${key}`;

export const getCacheValue = async (namespace, key) => {
  const { client, available } = getRedisClient();
  if (!client || !available) {
    return undefined;
  }

  try {
    const cacheKey = buildCacheKey(namespace, key);
    const raw = await client.get(cacheKey);
    if (raw === null || raw === undefined) {
      return undefined;
    }
    return JSON.parse(raw);
  } catch (error) {
    return undefined;
  }
};

export const setCacheValue = async (namespace, key, value, ttlMs) => {
  const { client, available } = getRedisClient();
  if (!client || !available) {
    return false;
  }

  try {
    const cacheKey = buildCacheKey(namespace, key);
    const payload = JSON.stringify(value);
    const ttlSeconds = Math.max(1, Math.ceil((Number(ttlMs) || 0) / 1000));
    if (Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
      await client.set(cacheKey, payload, 'EX', ttlSeconds);
    } else {
      await client.set(cacheKey, payload);
    }
    return true;
  } catch (error) {
    return false;
  }
};
