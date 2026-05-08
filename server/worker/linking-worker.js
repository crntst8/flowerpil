#!/usr/bin/env node

// Minimal distributed linking worker
// Uses coordinator endpoints for leasing/heartbeat/report and reuses existing services for DSP lookups

import os from 'os';
import process from 'process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

// Reuse existing services for lookups only (no DB writes here)
import { searchAppleMusicByTrack } from '../services/appleMusicService.js';
import { searchTidalByTrack } from '../services/tidalService.js';
import SpotifyService from '../services/spotifyService.js';
import { searchYouTubeMusicByTrack } from '../services/youtubeMusicService.js';
import { captureWorkerError } from '../utils/pm2ErrorHandler.js';
import DistributedRateLimiter from '../utils/DistributedRateLimiter.js';

// Single Spotify service instance (handles rate limiting internally)
const spotifyService = new SpotifyService();

const normalizeStorefront = (value) => {
  if (!value) return 'us';
  const trimmed = String(value).trim().toLowerCase();
  return /^[a-z]{2}$/.test(trimmed) ? trimmed : 'us';
};

const API_BASE = process.env.LINKING_API_BASE || process.env.API_BASE || 'https://localhost:3000';
const normalizeWorkerKey = (raw) => {
  if (!raw) return '';
  const first = String(raw).split(',')[0]?.trim() || '';
  if (
    (first.startsWith('"') && first.endsWith('"')) ||
    (first.startsWith("'") && first.endsWith("'"))
  ) {
    return first.slice(1, -1).trim();
  }
  return first;
};
const WORKER_KEY = normalizeWorkerKey(process.env.LINKING_WORKER_KEY || process.env.LINKING_WORKER_KEYS);
const WORKER_ID = process.env.LINKING_WORKER_ID || `${os.hostname()}-${process.pid}`;
const PLAYLIST_ID = process.env.LINKING_PLAYLIST_ID ? parseInt(process.env.LINKING_PLAYLIST_ID, 10) : null;

if (!WORKER_KEY) {
  console.error('[WORKER] Missing LINKING_WORKER_KEY/LINKING_WORKER_KEYS env');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Worker-Key': WORKER_KEY
};

async function fetchJSON(path, opts = {}) {
  const url = API_BASE.replace(/\/$/, '') + path;
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${opts.method || 'GET'} ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

async function getConfig() {
  const { data } = await fetchJSON('/api/v1/cross-platform/worker-config');
  return data;
}

async function getConfigWithRetry({ maxAttempts = 30 } = {}) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await getConfig();
    } catch (error) {
      const message = error?.message || String(error);
      const isAuthError = /\s401:/.test(message) || /\s403:/.test(message);
      if (isAuthError) {
        throw error;
      }
      const backoffMs = Math.min(15000, 500 * Math.pow(2, Math.min(6, attempt - 1)));
      console.error('[WORKER] Failed to fetch worker-config, retrying', {
        attempt,
        maxAttempts,
        backoffMs,
        error: message
      });
      await delay(backoffMs + Math.floor(Math.random() * 250));
    }
  }
  throw new Error('Failed to fetch worker-config after retries');
}

async function leaseTracks(max, playlistId) {
  const body = JSON.stringify({ max, playlistId, workerId: WORKER_ID });
  const { data } = await fetchJSON('/api/v1/cross-platform/lease', { method: 'POST', body });
  return data.tracks || [];
}

async function heartbeat(trackIds, extendSec) {
  if (!trackIds.length) return;
  const body = JSON.stringify({ trackIds, workerId: WORKER_ID, extendSec });
  await fetchJSON('/api/v1/cross-platform/heartbeat', { method: 'POST', body }).catch(() => {});
}

async function release(trackIds) {
  if (!trackIds.length) return;
  const body = JSON.stringify({ trackIds, workerId: WORKER_ID });
  await fetchJSON('/api/v1/cross-platform/release', { method: 'POST', body }).catch(() => {});
}

async function report(results) {
  if (!results.length) return { applied: 0 };
  const body = JSON.stringify({ workerId: WORKER_ID, results });
  const startTime = Date.now();
  try {
    const { data } = await fetchJSON('/api/v1/cross-platform/report', { method: 'POST', body });
    const duration = Date.now() - startTime;
    console.log('[WORKER] Report batch sent', {
      workerId: WORKER_ID,
      count: results.length,
      durationMs: duration,
      trackIds: results.map(r => r.trackId)
    });
    return data;
  } catch (error) {
    await captureWorkerError('linking-worker', error, {
      batchSize: results.length,
      workerId: WORKER_ID
    }).catch(() => {}); // Don't fail if error capture fails
    const duration = Date.now() - startTime;
    console.error('[WORKER] Report batch failed', {
      workerId: WORKER_ID,
      count: results.length,
      error: error.message,
      durationMs: duration
    });
    throw error;
  }
}

function createPool(limit = 1) {
  let active = 0;
  const queue = [];
  const runNext = () => {
    if (active >= limit) return;
    const next = queue.shift();
    if (!next) return;
    active++;
    next()
      .catch(() => {})
      .finally(() => {
        active--;
        runNext();
      });
  };
  const submit = (fn) => {
    queue.push(fn);
    runNext();
  };
  return { submit, pending: () => queue.length + active };
}

let appleStorefront = normalizeStorefront(process.env.APPLE_MUSIC_STOREFRONT);

async function processTrack(track) {
  const result = { trackId: track.id };
  try {
    // Apple: sequential by design (handled by apple pool size 1)
    try {
      const apple = await searchAppleMusicByTrack(track, { storefront: appleStorefront });
      if (apple && apple.url) {
        result.apple = { ...apple, storefront: apple.storefront || appleStorefront };
      }
    } catch (e) {
      result.error = result.error ? `${result.error}; Apple: ${e.message}` : `Apple: ${e.message}`;
    }

    // Tidal: faster; can be concurrent via pool
    try {
      const tidal = await searchTidalByTrack(track);
      if (tidal && tidal.url) {
        result.tidal = tidal;
      }
    } catch (e) {
      result.error = result.error ? `${result.error}; Tidal: ${e.message}` : `Tidal: ${e.message}`;
    }

    // Spotify: search for track to populate spotify_id for export/cross-link
    try {
      const sp = await spotifyService.searchByTrack(track);
      if (sp && sp.id) {
        result.spotify = sp; // { id, url, ... }
      }
    } catch (e) {
      result.error = result.error ? `${result.error}; Spotify: ${e.message}` : `Spotify: ${e.message}`;
    }
  } catch (e) {
    result.error = result.error || e.message;
  }
  return result;
}

async function main() {
  // Only relax TLS for local development (localhost/http). In production keep verification on.
  try {
    const parsed = new URL(API_BASE);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1' || parsed.protocol === 'http:';
    if (isLocal && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
  } catch {}

  // Wait for API to be available before proceeding
  let config = null;
  let retryCount = 0;
  const maxRetries = 10;

  while (!config && retryCount < maxRetries) {
    try {
      config = await getConfig();
    } catch (error) {
      retryCount++;
      if (retryCount >= maxRetries) {
        console.error('[WORKER] Failed to connect to API after', maxRetries, 'attempts');
        console.error('[WORKER] Will retry in 60 seconds...');
        await delay(60000);
        retryCount = 0; // Reset and try again
      } else {
        console.log(`[WORKER] Waiting for API... (attempt ${retryCount}/${maxRetries})`);
        await delay(2000); // Wait 2 seconds before retry
      }
    }
  }

  // Check if distributed linking is enabled
  if (config?.enabled === false) {
    console.log('[WORKER] Distributed linking is disabled (LINKING_DISTRIBUTED=off)');
    console.log('[WORKER] Worker will idle and check every 60 seconds...');

    // Idle mode: check every 60 seconds if distributed mode has been enabled
    while (true) {
      await delay(60000); // Wait 60 seconds
      try {
        const freshConfig = await getConfig();
        if (freshConfig?.enabled === true) {
          console.log('[WORKER] Distributed linking has been enabled! Restarting worker...');
          // Trigger PM2 restart by exiting
          process.exit(0);
        }
      } catch (error) {
        console.error('[WORKER] Failed to check config:', error.message);
      }
    }
  }

  console.log('[WORKER] Distributed linking is enabled');

  const batchSize = Math.max(1, config?.batch?.size || 5);
  const renewEverySec = Math.max(30, config?.lease?.renewEverySec || 60);
  const extendSec = Math.max(60, (config?.lease?.ttlSec || 120) - 15);
  const reportBatchSize = Math.max(1, config?.report?.batchSize || 10); // Batch results before reporting
  const reportIntervalMs = Math.max(1000, config?.report?.intervalMs || 2000); // Max wait between batches

  // Distributed rate limiters for all platforms (coordinates across multiple workers via Redis)
  const spotifyRateLimiter = new DistributedRateLimiter('spotify');
  const appleRateLimiter = new DistributedRateLimiter('apple');

  // Best-effort: give Redis a moment to connect so startup logs reflect reality
  await Promise.allSettled([
    spotifyRateLimiter.waitForReady(1000),
    appleRateLimiter.waitForReady(1000)
  ]);
  
  if (config?.apple?.storefront) {
    appleStorefront = normalizeStorefront(config.apple.storefront) || appleStorefront;
  }

  const applePool = createPool(config?.apple?.concurrency || 1);
  const tidalPool = createPool(config?.tidal?.concurrency || 3);
  const spotifyPool = createPool(config?.spotify?.concurrency || 3);
  const youtubePool = createPool(config?.youtube?.concurrency || 2);

  const inflight = new Set();
  let lastHeartbeat = Date.now();
  
  // Batch reporting queue
  const reportQueue = [];
  let lastReportTime = Date.now();
  let reportScheduled = false;

  console.log('[WORKER] Started', {
    workerId: WORKER_ID,
    apiBase: API_BASE,
    batchSize,
    reportBatchSize,
    distributedRateLimiting: {
      spotify: { capacity: spotifyRateLimiter.capacity, refillRate: spotifyRateLimiter.refillRate, redis: spotifyRateLimiter.getRedisState() },
      apple: { capacity: appleRateLimiter.capacity, refillRate: appleRateLimiter.refillRate, redis: appleRateLimiter.getRedisState() }
    }
  });

  while (true) {
    try {
      // Renew leases periodically
      if (Date.now() - lastHeartbeat > renewEverySec * 1000) {
        await heartbeat(Array.from(inflight), extendSec);
        lastHeartbeat = Date.now();
      }

      // Top up queue if below batch size
      if (inflight.size < batchSize) {
        const toLease = batchSize - inflight.size;
        const leased = await leaseTracks(toLease, PLAYLIST_ID);
        if (leased.length === 0) {
          await delay(250 + Math.floor(Math.random() * 500));
        }

        for (const t of leased) {
          inflight.add(t.id);

          // Per-track aggregator: waits for all four platform tasks, then queues for batched reporting
          const pending = new Set(['apple', 'tidal', 'spotify', 'youtube']);
          const partial = { trackId: t.id };
          const onDone = async () => {
            if (pending.size === 0) {
              // Queue result for batched reporting
              reportQueue.push(partial);
              inflight.delete(t.id);
              
              // Trigger batched report if queue is full or enough time has passed
              const shouldReport = reportQueue.length >= reportBatchSize || 
                (reportQueue.length > 0 && Date.now() - lastReportTime > reportIntervalMs);
              
              if (shouldReport && !reportScheduled) {
                reportScheduled = true;
                // Schedule report asynchronously to avoid blocking
                setImmediate(async () => {
                  reportScheduled = false;
                  if (reportQueue.length === 0) return;
                  
                  const batch = reportQueue.splice(0, reportBatchSize);
                  lastReportTime = Date.now();
                  
                  try {
                    await report(batch);
                  } catch (err) {
                    console.error('[WORKER] Failed to report batch, re-queuing', {
                      batchSize: batch.length,
                      error: err.message
                    });
                    // Re-queue failed results at the front
                    reportQueue.unshift(...batch);
                  }
                });
              }
            }
          };

          // Apple (serialized by pool with distributed rate limiting)
          applePool.submit(async () => {
            const trackStartTime = Date.now();
            try {
              // Acquire rate limit token (waits if needed)
              await appleRateLimiter.acquire(1, 30000); // 30s max wait
              const apple = await searchAppleMusicByTrack(t, { storefront: appleStorefront });
              const duration = Date.now() - trackStartTime;
              if (apple && apple.url) {
                partial.apple = { ...apple, storefront: apple.storefront || appleStorefront };
                console.log('[WORKER] Apple Music search success', {
                  trackId: t.id,
                  durationMs: duration,
                  storefront: apple.storefront || appleStorefront,
                  artist: t.artist,
                  title: t.title
                });
              } else {
                console.log('[WORKER] Apple Music search no match', {
                  trackId: t.id,
                  durationMs: duration,
                  artist: t.artist,
                  title: t.title
                });
              }
            } catch (e) {
              const duration = Date.now() - trackStartTime;
              partial.error = partial.error ? `${partial.error}; Apple: ${e.message}` : `Apple: ${e.message}`;
              console.error('[WORKER] Apple Music search error', {
                trackId: t.id,
                error: e.message,
                durationMs: duration,
                artist: t.artist,
                title: t.title
              });
            } finally {
              pending.delete('apple');
              await onDone();
            }
          });

          // Tidal (concurrent with distributed rate limiting)
          tidalPool.submit(async () => {
            const trackStartTime = Date.now();
            try {
              const tidal = await searchTidalByTrack(t);
              const duration = Date.now() - trackStartTime;
              if (tidal && tidal.url) {
                partial.tidal = tidal;
                console.log('[WORKER] TIDAL search success', {
                  trackId: t.id,
                  durationMs: duration,
                  artist: t.artist,
                  title: t.title
                });
              } else {
                console.log('[WORKER] TIDAL search no match', {
                  trackId: t.id,
                  durationMs: duration,
                  artist: t.artist,
                  title: t.title
                });
              }
            } catch (e) {
              const duration = Date.now() - trackStartTime;
              partial.error = partial.error ? `${partial.error}; Tidal: ${e.message}` : `Tidal: ${e.message}`;
              console.error('[WORKER] TIDAL search error', {
                trackId: t.id,
                error: e.message,
                durationMs: duration,
                artist: t.artist,
                title: t.title
              });
            } finally {
              pending.delete('tidal');
              await onDone();
            }
          });

          // Spotify (concurrent with distributed rate limiting)
          spotifyPool.submit(async () => {
            const trackStartTime = Date.now();
            try {
              // Acquire rate limit token (waits if needed)
              await spotifyRateLimiter.acquire(1, 30000); // 30s max wait
              const sp = await spotifyService.searchByTrack(t);
              const duration = Date.now() - trackStartTime;
              if (sp && sp.id) {
                partial.spotify = sp;
                console.log('[WORKER] Spotify search success', {
                  trackId: t.id,
                  durationMs: duration,
                  artist: t.artist,
                  title: t.title
                });
              } else {
                console.log('[WORKER] Spotify search no match', {
                  trackId: t.id,
                  durationMs: duration,
                  artist: t.artist,
                  title: t.title
                });
              }
            } catch (e) {
              const duration = Date.now() - trackStartTime;
              partial.error = partial.error ? `${partial.error}; Spotify: ${e.message}` : `Spotify: ${e.message}`;
              console.error('[WORKER] Spotify search error', {
                trackId: t.id,
                error: e.message,
                durationMs: duration,
                artist: t.artist,
                title: t.title
              });
            } finally {
              pending.delete('spotify');
              await onDone();
            }
          });

          // YouTube Music (concurrent, no distributed rate limiter needed for microservice)
          youtubePool.submit(async () => {
            const trackStartTime = Date.now();
            try {
              const yt = await searchYouTubeMusicByTrack(t);
              const duration = Date.now() - trackStartTime;
              if (yt && yt.videoId) {
                partial.youtube = {
                  id: yt.videoId,
                  url: yt.url || `https://music.youtube.com/watch?v=${yt.videoId}`,
                  confidence: yt.confidence || 80,
                  source: yt.source || 'search'
                };
                console.log('[WORKER] YouTube Music search success', {
                  trackId: t.id,
                  durationMs: duration,
                  artist: t.artist,
                  title: t.title
                });
              } else {
                console.log('[WORKER] YouTube Music search no match', {
                  trackId: t.id,
                  durationMs: duration,
                  artist: t.artist,
                  title: t.title
                });
              }
            } catch (e) {
              const duration = Date.now() - trackStartTime;
              partial.error = partial.error ? `${partial.error}; YouTube: ${e.message}` : `YouTube: ${e.message}`;
              console.error('[WORKER] YouTube Music search error', {
                trackId: t.id,
                error: e.message,
                durationMs: duration,
                artist: t.artist,
                title: t.title
              });
            } finally {
              pending.delete('youtube');
              await onDone();
            }
          });
        }
      }

      // Flush any pending reports if enough time has passed
      if (reportQueue.length > 0 && Date.now() - lastReportTime > reportIntervalMs && !reportScheduled) {
        reportScheduled = true;
        setImmediate(async () => {
          reportScheduled = false;
          if (reportQueue.length === 0) return;
          
          const batch = reportQueue.splice(0, reportBatchSize);
          lastReportTime = Date.now();
          
          try {
            await report(batch);
          } catch (err) {
            console.error('[WORKER] Failed to report batch, re-queuing', {
              batchSize: batch.length,
              error: err.message
            });
            reportQueue.unshift(...batch);
          }
        });
      }

      // Small idle delay to prevent tight loop
      await delay(100);
    } catch (loopErr) {
      console.error('[WORKER] Loop error', {
        error: loopErr.message,
        stack: loopErr.stack,
        inflightCount: inflight.size,
        reportQueueSize: reportQueue.length
      });
      await delay(1000);
    }
  }
}

main().catch(err => {
  console.error('[WORKER] Fatal:', err);
  process.exit(1);
});
