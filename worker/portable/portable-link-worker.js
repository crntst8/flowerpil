#!/usr/bin/env node

// Portable distributed linking worker (standalone package)
// Coordinates with core API via lease/heartbeat/report endpoints

import process from 'process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load .env from this package directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Import new modules
import { getConfig, validateConfig, getConfigSummary } from './config.js';
import Logger from './logger.js';
import Metrics from './metrics.js';
import HealthServer from './health-server.js';

// DSP services (portable copies)
import { searchAppleMusicByTrack } from './services/appleSearch.js';
import { searchTidalByTrack } from './services/tidalService.js';
import SpotifyService from './services/spotifyService.js';

// Load and validate configuration
let config;
let logger;
let metrics;
let healthServer;

try {
  config = getConfig();
  const validation = validateConfig(config);

  // Initialize logger
  logger = new Logger({
    level: config.logLevel,
    format: config.logFormat,
    workerId: config.workerId,
  });

  // Log configuration warnings
  if (validation.warnings && validation.warnings.length > 0) {
    logger.logConfigWarnings(validation.warnings);
  }

  // Initialize metrics
  metrics = new Metrics();

  // Initialize health server
  if (config.healthCheckEnabled) {
    healthServer = new HealthServer({
      port: config.healthCheckPort,
      metrics,
      logger,
    });
  }
} catch (err) {
  console.error('[PORTABLE-WORKER] Configuration error:', err.message);
  process.exit(1);
}

// Configure TLS
if (!config.tlsRejectUnauthorized) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Single Spotify service instance
const spotifyService = new SpotifyService();

// API client headers
const headers = {
  'Content-Type': 'application/json',
  'X-Worker-Key': config.workerKey
};

async function fetchJSON(path, opts = {}) {
  const url = config.apiBase + path;
  const startTime = Date.now();

  try {
    const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    const duration = Date.now() - startTime;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${opts.method || 'GET'} ${path} ${res.status}: ${text}`);
    }

    // Record API call timing
    const endpoint = path.split('/').pop() || 'unknown';
    if (metrics && metrics.timers.apiCallTimes[endpoint]) {
      metrics.recordTiming('apiCallTimes', endpoint, duration);
    }

    return res.json();
  } catch (err) {
    metrics?.incrementCounter('errorsEncountered');
    throw err;
  }
}

async function getWorkerConfig() {
  const { data } = await fetchJSON('/api/v1/cross-platform/worker-config');
  return data;
}

async function leaseTracks(max, playlistId) {
  const body = JSON.stringify({ max, playlistId, workerId: config.workerId });
  const { data } = await fetchJSON('/api/v1/cross-platform/lease', { method: 'POST', body });
  const tracks = data.tracks || [];

  if (tracks.length > 0) {
    metrics?.incrementCounter('tracksLeased', tracks.length);
    logger?.logLease(tracks.length);
  }

  return tracks;
}

async function heartbeat(trackIds, extendSec) {
  if (!trackIds.length) return;
  const body = JSON.stringify({ trackIds, workerId: config.workerId, extendSec });
  await fetchJSON('/api/v1/cross-platform/heartbeat', { method: 'POST', body }).catch(() => {});

  metrics?.incrementCounter('heartbeatsSent');
  metrics?.setGauge('lastHeartbeatTime', Date.now());
  logger?.logHeartbeat(trackIds.length);
}

async function report(results) {
  if (!results.length) return { applied: 0 };
  const body = JSON.stringify({ workerId: config.workerId, results });
  const { data } = await fetchJSON('/api/v1/cross-platform/report', { method: 'POST', body });

  metrics?.incrementCounter('reportsSubmitted');
  metrics?.setGauge('lastReportTime', Date.now());
  logger?.logReport(results.length, data.applied || 0);

  return data;
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

// Graceful shutdown handling
let isShuttingDown = false;
const inflight = new Set();

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger?.logShutdown(signal, inflight.size);

  // Stop accepting new work and wait for inflight to complete
  const shutdownTimeout = setTimeout(() => {
    logger?.warn('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, config.shutdownTimeoutMs);

  // Wait for inflight tracks to complete
  while (inflight.size > 0) {
    logger?.debug('Waiting for inflight tracks', { count: inflight.size });
    await delay(1000);
  }

  clearTimeout(shutdownTimeout);

  // Stop health server
  if (healthServer) {
    await healthServer.stop();
  }

  logger?.info('Shutdown complete');
  process.exit(0);
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

async function main() {
  try {
    // Fetch worker configuration from API
    const workerConfig = await getWorkerConfig();
    const batchSize = Math.max(1, config.batchSize || workerConfig?.batch?.size || 5);
    const renewEverySec = Math.max(30, config.heartbeatIntervalSec || workerConfig?.lease?.renewEverySec || 60);
    const extendSec = Math.max(60, (workerConfig?.lease?.ttlSec || 120) - 15);
    const tidalDelayMs = Math.max(0, workerConfig?.tidal?.delayMs || 100);

    let appleStorefront = config.apple.storefront;
    if (workerConfig?.apple?.storefront) {
      const normalizeStorefront = (value) => {
        if (!value) return 'us';
        const trimmed = String(value).trim().toLowerCase();
        return /^[a-z]{2}$/.test(trimmed) ? trimmed : 'us';
      };
      appleStorefront = normalizeStorefront(workerConfig.apple.storefront) || appleStorefront;
    }

    const applePool = createPool(workerConfig?.apple?.concurrency || 1);
    const tidalPool = createPool(workerConfig?.tidal?.concurrency || 3);
    const spotifyPool = createPool(workerConfig?.spotify?.concurrency || 3);

    let lastHeartbeat = Date.now();
    let lastMetricsLog = Date.now();
    const metricsLogInterval = 60000; // Log metrics every 60 seconds

    // Start health server
    if (healthServer) {
      healthServer.start();
    }

    // Log startup
    logger.logStartup({
      apiBase: config.apiBase,
      playlistId: config.playlistId,
      batchSize,
      platforms: {
        spotify: config.spotify.enabled,
        tidal: config.tidal.enabled,
        apple: config.apple.enabled,
      }
    });

    metrics.updateHealth('healthy');

    // Main worker loop
    while (!isShuttingDown) {
      try {
        // Update inflight gauge
        metrics.setGauge('inflightTracks', inflight.size);

        // Renew leases periodically
        if (Date.now() - lastHeartbeat > renewEverySec * 1000) {
          await heartbeat(Array.from(inflight), extendSec);
          lastHeartbeat = Date.now();
        }

        // Log metrics periodically
        if (config.metricsEnabled && Date.now() - lastMetricsLog > metricsLogInterval) {
          const snapshot = metrics.getSnapshot();
          logger.logMetrics(snapshot);
          lastMetricsLog = Date.now();
        }

        // Top up if we have capacity
        if (inflight.size < batchSize) {
          const toLease = batchSize - inflight.size;
          const leased = await leaseTracks(toLease, config.playlistId);

          if (leased.length === 0) {
            // No work available, wait with jitter
            await delay(250 + Math.floor(Math.random() * 500));
          }

          for (const t of leased) {
            const trackStartTime = Date.now();
            inflight.add(t.id);

            const pending = new Set(['apple', 'tidal', 'spotify']);
            const partial = { trackId: t.id };

            const onDone = async () => {
              if (pending.size === 0) {
                try {
                  const trackDuration = Date.now() - trackStartTime;
                  metrics.recordTiming('trackProcessingTimes', null, trackDuration);

                  await report([partial]);

                  if (partial.error) {
                    metrics.incrementCounter('tracksFailed');
                    logger.logTrackComplete(t.id, ['apple', 'tidal', 'spotify'], true);
                  } else {
                    metrics.incrementCounter('tracksCompleted');
                    logger.logTrackComplete(t.id, ['apple', 'tidal', 'spotify'], false);
                  }

                  metrics.updateHealth('healthy');
                } catch (err) {
                  logger.logError('Report failed', err, { trackId: t.id });
                  metrics.updateHealth('degraded', err);
                } finally {
                  inflight.delete(t.id);
                }
              }
            };

            // Apple (serialized)
            if (config.apple.enabled) {
              applePool.submit(async () => {
                try {
                  const apple = await searchAppleMusicByTrack(t, { storefront: appleStorefront });
                  if (apple && apple.url) {
                    partial.apple = { ...apple, storefront: appleStorefront };
                    metrics.recordPlatformResult('apple', true, true);
                  } else {
                    metrics.recordPlatformResult('apple', true, false);
                  }
                  logger.logTrackProcessing(t.id, 'apple', apple);
                } catch (e) {
                  metrics.recordPlatformResult('apple', false, false);
                  partial.error = partial.error ? `${partial.error}; Apple: ${e.message}` : `Apple: ${e.message}`;
                  logger.logError('Apple search failed', e, { trackId: t.id });
                } finally {
                  pending.delete('apple');
                  await onDone();
                }
              });
            } else {
              pending.delete('apple');
            }

            // Tidal (concurrent)
            if (config.tidal.enabled) {
              tidalPool.submit(async () => {
                try {
                  await delay(tidalDelayMs);
                  const tidal = await searchTidalByTrack(t);
                  if (tidal && tidal.url) {
                    partial.tidal = tidal;
                    metrics.recordPlatformResult('tidal', true, true);
                  } else {
                    metrics.recordPlatformResult('tidal', true, false);
                  }
                  logger.logTrackProcessing(t.id, 'tidal', tidal);
                } catch (e) {
                  metrics.recordPlatformResult('tidal', false, false);
                  partial.error = partial.error ? `${partial.error}; Tidal: ${e.message}` : `Tidal: ${e.message}`;
                  logger.logError('Tidal search failed', e, { trackId: t.id });
                } finally {
                  pending.delete('tidal');
                  await onDone();
                }
              });
            } else {
              pending.delete('tidal');
            }

            // Spotify (concurrent)
            if (config.spotify.enabled) {
              spotifyPool.submit(async () => {
                try {
                  const sp = await spotifyService.searchByTrack(t);
                  if (sp && sp.id) {
                    partial.spotify = sp;
                    metrics.recordPlatformResult('spotify', true, true);
                  } else {
                    metrics.recordPlatformResult('spotify', true, false);
                  }
                  logger.logTrackProcessing(t.id, 'spotify', sp);
                } catch (e) {
                  metrics.recordPlatformResult('spotify', false, false);
                  partial.error = partial.error ? `${partial.error}; Spotify: ${e.message}` : `Spotify: ${e.message}`;
                  logger.logError('Spotify search failed', e, { trackId: t.id });
                } finally {
                  pending.delete('spotify');
                  await onDone();
                }
              });
            } else {
              pending.delete('spotify');
            }
          }
        }

        await delay(config.pollIntervalMs);
      } catch (loopErr) {
        logger.logError('Worker loop error', loopErr);
        metrics.updateHealth('degraded', loopErr);
        await delay(1000);
      }
    }
  } catch (err) {
    logger?.logError('Fatal error', err);
    metrics?.updateHealth('unhealthy', err);
    throw err;
  }
}

main().catch(err => {
  logger?.error('Fatal error, exiting', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});
