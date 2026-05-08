#!/usr/bin/env node

/**
 * DSP Export Worker - Automated Export Request Processor
 *
 * Continuously polls for pending export requests and processes them automatically.
 * Features:
 * - Retry logic with exponential backoff
 * - Request leasing to prevent duplicate processing
 * - Graceful shutdown handling
 * - Structured logging for monitoring
 * - Token health tracking
 *
 * Phase 2 deliverable for DSP Automation project.
 */

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

import { getQueries, getDatabase } from '../database/db.js';
import { runPlaylistExport } from '../services/playlistExportRunner.js';
import {
  getDestinationsFromStoredValue,
  parseResultsField,
  parseAccountPreferencesField
} from '../services/exportRequestService.js';
import {
  recordWorkerHeartbeat,
  countPendingRequests,
  cleanupStaleHeartbeats
} from '../services/dspTelemetryService.js';
import { captureWorkerError } from '../utils/pm2ErrorHandler.js';
import { broadcastExportProgress } from '../api/sse.js';

// Configuration
const WORKER_ID = process.env.WORKER_ID || `export-worker-${os.hostname()}-${process.pid}`;
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '10000', 10);
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3', 10);
const MAX_RETRIES = parseInt(process.env.WORKER_MAX_RETRIES || '3', 10);
const RETRY_BACKOFF_BASE = parseInt(process.env.WORKER_RETRY_BACKOFF_BASE || '60', 10); // seconds
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS || '15000', 10);

// Circuit breaker: pause playlist exports if too many failures
const CIRCUIT_BREAKER_FAILURES = 5; // Max failures before circuit opens
const CIRCUIT_BREAKER_WINDOW_HOURS = 2; // Time window for counting failures

// Retry backoff schedule: 1m, 5m, 15m, 30m, 1h
const RETRY_DELAYS_SEC = [60, 300, 900, 1800, 3600];

// Error codes that should trigger retry
const RETRYABLE_ERROR_CODES = new Set([
  'AUTH_REQUIRED',
  'TOKEN_EXPIRED',
  'RATE_LIMIT_EXCEEDED',
  'NETWORK_ERROR',
  'TIMEOUT',
  'API_ERROR_5XX'
]);

const queries = getQueries();
const db = getDatabase();

// Graceful shutdown handling
let shutdownRequested = false;
const activeProcessing = new Set(); // Track in-flight request IDs
let processedCount = 0;
let failedCount = 0;
let lastHeartbeatSentAt = 0;

function updateHeartbeat(status = 'idle', lastError = null, force = false) {
  try {
    const now = Date.now();
    if (!force && now - lastHeartbeatSentAt < HEARTBEAT_INTERVAL_MS) {
      return;
    }
    lastHeartbeatSentAt = now;
    let queueDepth = 0;
    try {
      queueDepth = countPendingRequests();
    } catch (err) {
      // Ignore - heartbeats are non-critical telemetry
    }

    recordWorkerHeartbeat({
      workerId: WORKER_ID,
      status,
      queueDepth,
      activeRequests: activeProcessing.size,
      processedTotal: processedCount,
      failedTotal: failedCount,
      lastError,
      metrics: {
        poll_interval_ms: POLL_INTERVAL_MS,
        concurrency: CONCURRENCY
      }
    });
  } catch (err) {
    // Heartbeat failures should never crash the worker
    // recordWorkerHeartbeat has its own try/catch, but be extra safe
  }
}

process.on('SIGTERM', async () => {
  console.log('[WORKER] SIGTERM received, graceful shutdown initiated');
  shutdownRequested = true;
  updateHeartbeat('stopping', null, true);
  await waitForActiveProcessing();
  updateHeartbeat('offline', null, true);
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[WORKER] SIGINT received, graceful shutdown initiated');
  shutdownRequested = true;
  updateHeartbeat('stopping', null, true);
  await waitForActiveProcessing();
  updateHeartbeat('offline', null, true);
  process.exit(0);
});

async function waitForActiveProcessing() {
  const maxWait = 60000; // 60 seconds max wait
  const startTime = Date.now();

  while (activeProcessing.size > 0 && (Date.now() - startTime) < maxWait) {
    console.log(`[WORKER] Waiting for ${activeProcessing.size} active requests to complete...`);
    await delay(1000);
  }

  if (activeProcessing.size > 0) {
    console.warn(`[WORKER] Force shutdown with ${activeProcessing.size} active requests still processing`);
    // Release leases for abandoned requests
    for (const requestId of activeProcessing) {
      releaseRequest(requestId);
    }
  } else {
    console.log('[WORKER] All active requests completed, shutting down cleanly');
  }
}

/**
 * Lease a pending request for processing
 * Marks request as in_progress and records worker_id to prevent duplicate processing
 */
function leaseRequest(requestId) {
  try {
    const now = new Date().toISOString();

    // Get current request
    const request = queries.findExportRequestById.get(requestId);
    if (!request) {
      return null;
    }

    // Only lease if status is pending
    if (request.status !== 'pending') {
      console.log(`[WORKER] Request ${requestId} status is ${request.status}, skipping lease`);
      return null;
    }

    // Parse existing job_metadata
    let metadata = {};
    try {
      metadata = request.job_metadata ? JSON.parse(request.job_metadata) : {};
    } catch (e) {
      console.warn(`[WORKER] Failed to parse job_metadata for request ${requestId}, starting fresh`);
    }

    // Update metadata with worker info
    metadata.worker_id = WORKER_ID;
    metadata.leased_at = now;
    metadata.retry_count = metadata.retry_count || 0;
    metadata.max_retries = MAX_RETRIES;

    // Update request to in_progress with metadata
    queries.updateExportRequestStatus.run('in_progress', null, requestId);
    queries.updateExportRequestJobMetadata.run(JSON.stringify(metadata), requestId);

    console.log(`[WORKER] Leased request ${requestId} (retry ${metadata.retry_count}/${MAX_RETRIES})`);

    return {
      ...request,
      status: 'in_progress',
      job_metadata: JSON.stringify(metadata)
    };
  } catch (err) {
    console.error(`[WORKER] Failed to lease request ${requestId}:`, err.message);
    return null;
  }
}

/**
 * Release a request lease (mark as pending again)
 * Used when worker shuts down before completing processing
 */
function releaseRequest(requestId) {
  try {
    queries.updateExportRequestStatus.run('pending', 'Worker shutdown before completion', requestId);
    console.log(`[WORKER] Released request ${requestId} back to pending`);
  } catch (err) {
    console.error(`[WORKER] Failed to release request ${requestId}:`, err.message);
  }
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error) {
  if (!error) return false;

  const errorCode = error.code || error.errorCode || '';
  const errorMessage = error.message || '';

  // Check error code
  if (RETRYABLE_ERROR_CODES.has(errorCode)) {
    return true;
  }

  // Check error message patterns
  if (errorMessage.includes('rate limit') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('503') ||
      errorMessage.includes('502') ||
      errorMessage.includes('500')) {
    return true;
  }

  return false;
}

/**
 * Calculate next retry time based on retry count
 */
function calculateNextRetry(retryCount) {
  const delaySec = RETRY_DELAYS_SEC[Math.min(retryCount, RETRY_DELAYS_SEC.length - 1)] || 3600;
  return new Date(Date.now() + (delaySec * 1000)).toISOString();
}

/**
 * Handle failed export - determine if should retry or mark as failed
 */
function handleFailedExport(requestId, error, metadata) {
  const retryCount = metadata.retry_count || 0;
  const isRetryable = isRetryableError(error);

  if (isRetryable && retryCount < MAX_RETRIES) {
    // Schedule retry
    const nextRetryAt = calculateNextRetry(retryCount);
    metadata.retry_count = retryCount + 1;
    metadata.next_retry_at = nextRetryAt;
    metadata.last_error = error.message;
    metadata.error_code = error.code || error.errorCode || 'UNKNOWN';

    // Reset to pending for retry
    queries.updateExportRequestStatus.run('pending', error.message, requestId);
    queries.updateExportRequestJobMetadata.run(JSON.stringify(metadata), requestId);

    console.log(`[WORKER] Request ${requestId} will retry at ${nextRetryAt} (attempt ${retryCount + 1}/${MAX_RETRIES})`);
    return 'retry_scheduled';
  } else {
    // Mark as permanently failed
    metadata.failed_at = new Date().toISOString();
    metadata.last_error = error.message;
    metadata.error_code = error.code || error.errorCode || 'UNKNOWN';
    metadata.failure_reason = isRetryable ? 'max_retries_exceeded' : 'non_retryable_error';

    queries.updateExportRequestStatus.run('failed', error.message, requestId);
    queries.updateExportRequestJobMetadata.run(JSON.stringify(metadata), requestId);

    const reason = isRetryable ? `after ${MAX_RETRIES} retries` : 'non-retryable error';
    console.error(`[WORKER] Request ${requestId} marked as failed (${reason}):`, error.message);
    return 'failed';
  }
}

/**
 * Process a single export request
 */
async function processExportRequest(request) {
  const requestId = request.id;
  const playlistId = request.playlist_id;

  activeProcessing.add(requestId);

  try {
    const destinations = getDestinationsFromStoredValue(request.destinations);
    let accountPreferences = {};
    try {
      accountPreferences = parseAccountPreferencesField(request.account_preferences);
    } catch (err) {
      console.warn(`[WORKER] Failed to parse account preferences for request ${requestId}:`, err.message);
    }

    if (!destinations || destinations.length === 0) {
      throw new Error('No destinations specified for export');
    }

    console.log('[WORKER] Processing export request', {
      requestId,
      playlistId,
      destinations: destinations.join(', '),
      accountPreferences: Object.keys(accountPreferences).length > 0 ? accountPreferences : 'default'
    });

    let metadata = {};
    try {
      metadata = request.job_metadata ? JSON.parse(request.job_metadata) : {};
    } catch (e) {
      console.warn(`[WORKER] Failed to parse job_metadata, using empty object`);
    }

    metadata.started_at = new Date().toISOString();
    metadata.platforms = {}; // Per-platform progress tracking
    const startTime = Date.now();

    // Process each destination
    const results = parseResultsField(request.results) || {};

    const workerDestinations = destinations.filter((platform) => {
      const accountType = (accountPreferences?.[platform]?.account_type || 'flowerpil').toLowerCase();
      if (accountType !== 'flowerpil') {
        results[platform] = {
          status: 'skipped',
          reason: 'curator_owned_account'
        };
        metadata.platforms[platform] = {
          status: 'skipped',
          reason: 'curator_owned_account',
          skipped_at: new Date().toISOString()
        };
        return false;
      }
      // Initialize platform progress
      metadata.platforms[platform] = {
        status: 'pending',
        started_at: null,
        completed_at: null,
        tracks_added: 0,
        total_tracks: 0
      };
      return true;
    });

    if (!workerDestinations.length) {
      const failureMessage = 'Worker only processes Flowerpil destinations';
      metadata.failure_reason = 'non_flowerpil_request';
      metadata.completed_at = new Date().toISOString();
      metadata.last_error = failureMessage;
      queries.updateExportRequestResults.run(JSON.stringify(results), requestId);
      queries.updateExportRequestStatus.run('failed', failureMessage, requestId);
      queries.updateExportRequestJobMetadata.run(JSON.stringify(metadata), requestId);
      activeProcessing.delete(requestId);
      releaseRequest(requestId);
      return;
    }
    let hasErrors = false;
    let lastError = null;

    for (const platform of workerDestinations) {
      const accountPreference = accountPreferences?.[platform] || null;
      const platformStartTime = Date.now();
      
      // Update platform status to in_progress
      metadata.platforms[platform].status = 'in_progress';
      metadata.platforms[platform].started_at = new Date().toISOString();
      queries.updateExportRequestJobMetadata.run(JSON.stringify(metadata), requestId);

      // Broadcast progress via SSE
      try {
        const playlist = queries.getPlaylistById.get(playlistId);
        if (playlist) {
          broadcastExportProgress(requestId, null, playlist.curator_id, {
            status: 'in_progress',
            platform,
            platforms: metadata.platforms
          });
        }
      } catch (sseErr) {
        // Don't fail export if SSE fails
        console.warn('[WORKER] Failed to broadcast export progress:', sseErr.message);
      }
      
      try {
        console.log('[WORKER] Starting platform export', {
          requestId,
          playlistId,
          platform,
          accountType: accountPreference?.account_type || 'flowerpil'
        });

        const result = await runPlaylistExport({
          playlistId,
          platform,
          isPublic: true,
          allowDraftExport: false, // Worker only processes published playlists
          exportRequestId: requestId,
          accountPreference
        });

        const platformDuration = Date.now() - platformStartTime;
        const tracksAdded = result.result?.tracksAdded || 0;
        const totalTracks = result.result?.totalTracks || 0;

        results[platform] = {
          status: 'success',
          url: result.result?.playlistUrl || null,
          id: result.result?.playlistId || null,
          tracks_added: tracksAdded,
          completed_at: new Date().toISOString()
        };

        // Update platform progress
        metadata.platforms[platform] = {
          status: 'completed',
          started_at: metadata.platforms[platform].started_at,
          completed_at: new Date().toISOString(),
          tracks_added: tracksAdded,
          total_tracks: totalTracks,
          duration_ms: platformDuration,
          playlist_url: result.result?.playlistUrl || null
        };
        queries.updateExportRequestJobMetadata.run(JSON.stringify(metadata), requestId);

        // Broadcast completion via SSE
        try {
          const playlist = queries.getPlaylistById.get(playlistId);
          if (playlist) {
            broadcastExportProgress(requestId, null, playlist.curator_id, {
              status: 'platform_completed',
              platform,
              platforms: metadata.platforms,
              url: result.result?.playlistUrl || null
            });
          }
        } catch (sseErr) {
          console.warn('[WORKER] Failed to broadcast export completion:', sseErr.message);
        }

        console.log('[WORKER] Platform export completed', {
          requestId,
          playlistId,
          platform,
          tracksAdded,
          totalTracks,
          durationMs: platformDuration,
          playlistUrl: result.result?.playlistUrl || null
        });
      } catch (err) {
        await captureWorkerError('dsp-export-worker', err, {
          playlistId,
          requestId,
          platform,
          dspType: platform
        }).catch(() => {}); // Don't fail if error capture fails
        hasErrors = true;
        lastError = err;
        const platformDuration = Date.now() - platformStartTime;

        results[platform] = {
          status: 'failed',
          error: err.message,
          error_code: err.code || err.errorCode || 'EXPORT_ERROR',
          failed_at: new Date().toISOString()
        };

        // Update platform progress
        metadata.platforms[platform] = {
          status: 'failed',
          started_at: metadata.platforms[platform].started_at,
          failed_at: new Date().toISOString(),
          error: err.message,
          error_code: err.code || err.errorCode || 'EXPORT_ERROR',
          duration_ms: platformDuration
        };
        queries.updateExportRequestJobMetadata.run(JSON.stringify(metadata), requestId);

        // Broadcast failure via SSE
        try {
          const playlist = queries.getPlaylistById.get(playlistId);
          if (playlist) {
            broadcastExportProgress(requestId, null, playlist.curator_id, {
              status: 'platform_failed',
              platform,
              platforms: metadata.platforms,
              error: err.message
            });
          }
        } catch (sseErr) {
          console.warn('[WORKER] Failed to broadcast export failure:', sseErr.message);
        }

        console.error('[WORKER] Platform export failed', {
          requestId,
          playlistId,
          platform,
          error: err.message,
          errorCode: err.code || err.errorCode || 'EXPORT_ERROR',
          durationMs: platformDuration,
          stack: err.stack
        });
      }
    }

    // Update results in database
    queries.updateExportRequestResults.run(JSON.stringify(results), requestId);

    // Calculate execution time
    const executionTimeMs = Date.now() - startTime;
    metadata.execution_time_ms = executionTimeMs;
    metadata.completed_at = new Date().toISOString();

    // Determine final status
    if (hasErrors) {
      // Some platforms failed - use retry logic
      const retryStatus = handleFailedExport(requestId, lastError, metadata);

      if (retryStatus === 'retry_scheduled') {
        console.log('[WORKER] Export request completed with errors, retry scheduled', {
          requestId,
          playlistId,
          executionTimeMs,
          platforms: Object.keys(metadata.platforms || {}),
          retryCount: metadata.retry_count || 0
        });
      } else {
        console.log('[WORKER] Export request failed permanently', {
          requestId,
          playlistId,
          executionTimeMs,
          platforms: Object.keys(metadata.platforms || {}),
          lastError: lastError?.message
        });
      }
    } else {
      // All platforms succeeded
      metadata.success = true;
      queries.updateExportRequestStatus.run('completed', null, requestId);
      queries.updateExportRequestJobMetadata.run(JSON.stringify(metadata), requestId);

      console.log('[WORKER] Export request completed successfully', {
        requestId,
        playlistId,
        executionTimeMs,
        platforms: Object.keys(metadata.platforms || {}),
        totalTracks: Object.values(metadata.platforms || {}).reduce((sum, p) => sum + (p.total_tracks || 0), 0),
        tracksAdded: Object.values(metadata.platforms || {}).reduce((sum, p) => sum + (p.tracks_added || 0), 0)
      });
    }
    processedCount += 1;

    // Force garbage collection if available to prevent memory buildup
    if (global.gc && processedCount % 5 === 0) {
      global.gc();
    }

  } catch (err) {
    await captureWorkerError('dsp-export-worker', err, {
      playlistId: request?.playlist_id,
      requestId
    }).catch(() => {}); // Don't fail if error capture fails
    console.error('[WORKER] Fatal error processing export request', {
      requestId,
      playlistId: request?.playlist_id,
      error: err.message,
      errorCode: err.code || err.errorCode || 'FATAL_ERROR',
      stack: err.stack
    });

    // Parse metadata for retry logic
    let metadata = {};
    try {
      metadata = request.job_metadata ? JSON.parse(request.job_metadata) : {};
    } catch (e) {}

    handleFailedExport(requestId, err, metadata);
    failedCount += 1;
  } finally {
    activeProcessing.delete(requestId);
    updateHeartbeat(activeProcessing.size > 0 ? 'active' : 'idle');
  }
}

/**
 * Check if playlist has too many recent failures (circuit breaker)
 */
function isCircuitOpen(playlistId) {
  try {
    const sql = `
      SELECT COUNT(*) as failure_count FROM export_requests
      WHERE playlist_id = ?
        AND status = 'failed'
        AND updated_at > datetime('now', ?)
    `;
    const result = db.prepare(sql).get(playlistId, `-${CIRCUIT_BREAKER_WINDOW_HOURS} hours`);
    const failureCount = result?.failure_count || 0;

    if (failureCount >= CIRCUIT_BREAKER_FAILURES) {
      console.warn(`[WORKER] Circuit breaker OPEN for playlist ${playlistId} - ${failureCount} failures in last ${CIRCUIT_BREAKER_WINDOW_HOURS}h`);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[WORKER] Circuit breaker check failed:', err?.message);
    return false; // Fail open
  }
}

/**
 * Get pending requests that are ready to process
 * Respects retry schedule (next_retry_at) and circuit breaker
 */
function getPendingRequests(limit) {
  const now = new Date().toISOString();

  const sql = `
    SELECT * FROM export_requests
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT ?
  `;

  let rows;
  try {
    rows = db.prepare(sql).all(limit);
  } catch (err) {
    // Return empty array on DB errors (e.g., database locked) - loop will retry next cycle
    if (err?.message?.includes('database is locked') || err?.code === 'SQLITE_BUSY') {
      // Silent fail on lock - this is expected during high contention
      return [];
    }
    console.warn('[WORKER] Failed to query pending requests:', err?.message || err);
    return [];
  }

  // Filter out requests that are waiting for retry or have circuit breaker open
  return rows.filter(row => {
    try {
      // Check circuit breaker first
      if (isCircuitOpen(row.playlist_id)) {
        // Mark as failed with circuit breaker reason
        try {
          queries.updateExportRequestStatus.run(
            'failed',
            `Circuit breaker: ${CIRCUIT_BREAKER_FAILURES}+ failures in ${CIRCUIT_BREAKER_WINDOW_HOURS}h`,
            row.id
          );
        } catch (updateErr) {
          console.warn('[WORKER] Failed to update circuit-broken request:', updateErr?.message);
        }
        return false;
      }

      const metadata = row.job_metadata ? JSON.parse(row.job_metadata) : {};
      const nextRetryAt = metadata.next_retry_at;

      // If no next_retry_at, process immediately
      if (!nextRetryAt) return true;

      // If next_retry_at is in the past, process now
      return new Date(nextRetryAt) <= new Date(now);
    } catch (e) {
      // If can't parse metadata, process anyway
      return true;
    }
  });
}

/**
 * Main worker loop
 */
async function workerLoop() {
  console.log('[WORKER] Starting export worker', {
    workerId: WORKER_ID,
    pollIntervalMs: POLL_INTERVAL_MS,
    concurrency: CONCURRENCY,
    maxRetries: MAX_RETRIES,
    retryBackoffBase: RETRY_BACKOFF_BASE
  });
  updateHeartbeat('starting', null, true);

  let loopCount = 0;

  while (!shutdownRequested) {
    loopCount++;
    let pendingCountForHeartbeat = 0;

    try {
      // Check if we have capacity to process more requests
      const availableSlots = CONCURRENCY - activeProcessing.size;

      if (availableSlots > 0) {
        // Get pending requests
        const pendingRequests = getPendingRequests(availableSlots);
        pendingCountForHeartbeat = pendingRequests.length;

        if (pendingRequests.length > 0) {
          console.log('[WORKER] Found pending requests', {
            count: pendingRequests.length,
            active: activeProcessing.size,
            availableSlots
          });

          // Lease and process each request
          for (const request of pendingRequests) {
            const leasedRequest = leaseRequest(request.id);

            if (leasedRequest) {
              // Process asynchronously (don't await)
              processExportRequest(leasedRequest).catch(err => {
                console.error('[WORKER] Unhandled error in processExportRequest', {
                  requestId: leasedRequest.id,
                  error: err.message,
                  stack: err.stack
                });
              });
            }
          }
          updateHeartbeat('active');
        } else if (loopCount % 60 === 0) {
          // Log idle status every 10 minutes (60 loops * 10s)
          console.log('[WORKER] Idle - no pending requests', {
            active: activeProcessing.size,
            processedTotal: processedCount,
            failedTotal: failedCount
          });
        }
      } else if (loopCount % 12 === 0) {
        // Log busy status every 2 minutes (12 loops * 10s)
        console.log('[WORKER] At capacity', {
          active: activeProcessing.size,
          concurrency: CONCURRENCY
        });
      }

      const loopStatus = (activeProcessing.size > 0 || pendingCountForHeartbeat > 0) ? 'active' : 'idle';
      updateHeartbeat(loopStatus);

      // Wait before next poll
      await delay(POLL_INTERVAL_MS);

    } catch (err) {
      console.error('[WORKER] Error in main loop', {
        error: err.message,
        stack: err.stack,
        loopCount,
        activeRequests: activeProcessing.size
      });

      // Try to record error heartbeat, but don't crash if this also fails
      try {
        updateHeartbeat('error', err?.message || 'loop_error', true);
      } catch (heartbeatErr) {
        // Ignore heartbeat errors during error recovery
      }

      // Wait longer on error to avoid tight error loop
      await delay(POLL_INTERVAL_MS * 5);
    }
  }

  console.log('[WORKER] Main loop exited');
  updateHeartbeat('offline', null, true);
}

/**
 * Entry point
 */
async function main() {
  try {
    // Validate database connection
    const dbPath = process.env.DATABASE_PATH || './data/flowerpil.db';
    console.log(`[WORKER] Database: ${dbPath}`);

    // Test database connection
    const testQuery = db.prepare('SELECT COUNT(*) as count FROM export_requests');
    const result = testQuery.get();
    console.log(`[WORKER] Database connection OK (${result.count} total export requests)`);

    // Clean up stale heartbeats on startup
    try {
      cleanupStaleHeartbeats(60); // Remove heartbeats older than 60 minutes
      console.log('[WORKER] Cleaned up stale heartbeat records');
    } catch (err) {
      console.warn('[WORKER] Failed to cleanup stale heartbeats:', err?.message || err);
    }

    // Start worker loop
    await workerLoop();

  } catch (err) {
    console.error('[WORKER] Fatal error:', err);
    process.exit(1);
  }
}

// Start the worker
main().catch(err => {
  console.error('[WORKER] Unhandled error:', err);
  process.exit(1);
});
