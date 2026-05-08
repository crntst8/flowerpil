/**
 * Token Refresh Worker
 *
 * Background process that automatically refreshes OAuth tokens before they expire.
 *
 * Schedule: Runs every 30 minutes
 * Strategy: Refreshes tokens expiring within 24 hours
 * Platforms: Spotify, TIDAL (Apple Music uses JWT, no refresh needed)
 *
 * Workflow:
 * 1. Check database for tokens expiring within 24h
 * 2. Use refresh tokens to get new access tokens
 * 3. Update database with new tokens
 * 4. Mark revoked tokens appropriately
 * 5. Log results
 *
 * Error Handling:
 * - Revoked tokens marked as 'revoked' status
 * - Network errors logged but don't stop worker
 * - Worker continues to run on schedule regardless of individual failures
 *
 * Usage:
 *   Development: npm run worker:token-refresh
 *   Production:  pm2 start ecosystem.config.cjs --only token-refresh-worker
 */

import { refreshAllTokens, getRefreshStatus } from '../services/tokenRefreshService.js';
import { refreshAllTokenHealthStatuses } from '../services/tokenHealthService.js';
import { captureWorkerError } from '../utils/pm2ErrorHandler.js';
import { getDatabase } from '../database/db.js';

// Configuration
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const INITIAL_DELAY_MS = 5 * 1000; // 5 seconds - delay before first run

let isShuttingDown = false;
let refreshTimer = null;

/**
 * Purge stale entries from track_match_cache (older than 30 days)
 * Returns number of rows deleted.
 */
function purgeTrackMatchCache() {
  try {
    const db = getDatabase();
    const result = db
      .prepare(`DELETE FROM track_match_cache WHERE created_at < datetime('now', '-30 days')`)
      .run();
    console.log(`[TOKEN_REFRESH_WORKER] Purged ${result.changes} old entries from track_match_cache`);
    return result.changes || 0;
  } catch (error) {
    console.error('[TOKEN_REFRESH_WORKER] Failed to purge track_match_cache:', error.message);
    return 0;
  }
}

/**
 * Run token refresh cycle
 */
async function runRefreshCycle() {
  if (isShuttingDown) {
    console.log('[TOKEN_REFRESH_WORKER] Shutdown in progress, skipping cycle');
    return;
  }

  const startTime = Date.now();
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`[TOKEN_REFRESH_WORKER] Starting refresh cycle at ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════');

  try {
    // Step 1: Update health statuses based on expiration times
    console.log('[TOKEN_REFRESH_WORKER] Step 1: Updating token health statuses...');
    const healthUpdate = refreshAllTokenHealthStatuses();
    console.log(`[TOKEN_REFRESH_WORKER] Health status update: ${healthUpdate.updated} updated, ${healthUpdate.unchanged} unchanged`);

    // Step 2: Refresh tokens that need it
    console.log('[TOKEN_REFRESH_WORKER] Step 2: Refreshing tokens...');
    const result = await refreshAllTokens();

    // Step 3: Purge stale track match cache entries
    console.log('[TOKEN_REFRESH_WORKER] Step 3: Purging stale track match cache entries...');
    purgeTrackMatchCache();

    // Step 4: Log summary
    const duration = Date.now() - startTime;
    console.log('');
    console.log('───────────────────────────────────────────────────────────');
    console.log('[TOKEN_REFRESH_WORKER] Refresh cycle complete');
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Total tokens checked: ${result.total}`);
    console.log(`  Successfully refreshed: ${result.refreshed}`);
    console.log(`  Failed: ${result.failed}`);
    console.log(`  Skipped: ${result.skipped}`);
    console.log('───────────────────────────────────────────────────────────');

    // Log failures in detail
    if (result.failed > 0) {
      console.error('[TOKEN_REFRESH_WORKER] Failed refreshes:');
      result.results
        .filter(r => !r.success)
        .forEach(r => {
          console.error(`  • ${r.platform} token ${r.tokenId}: ${r.error}`);
        });
    }

    // Step 4: Show current status
    showTokenStatus();

  } catch (error) {
    await captureWorkerError('token-refresh-worker', error, {
      cycleStartTime: new Date(startTime).toISOString()
    }).catch(() => {}); // Don't fail if error capture fails
    console.error('[TOKEN_REFRESH_WORKER] Error during refresh cycle:', error);
    console.error(error.stack);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`[TOKEN_REFRESH_WORKER] Next cycle in ${REFRESH_INTERVAL_MS / 1000 / 60} minutes`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
}

/**
 * Display current token status
 */
function showTokenStatus() {
  try {
    const status = getRefreshStatus();

    if (status.length === 0) {
      console.log('[TOKEN_REFRESH_WORKER] No active tokens found');
      return;
    }

    console.log('[TOKEN_REFRESH_WORKER] Current token status:');
    status.forEach(token => {
      const timeStr = token.time_until_expiry !== null
        ? `${token.time_until_expiry}min`
        : 'unknown';

      const refreshFlag = token.has_refresh_token ? '✓' : '✗';
      const needsRefreshFlag = token.needs_refresh ? '⚠️' : '  ';

      console.log(
        `  ${needsRefreshFlag} [${token.platform.toUpperCase()}] ${token.account_label} ` +
        `(${token.health_status}) expires in ${timeStr} | refresh: ${refreshFlag}`
      );
    });
  } catch (error) {
    console.error('[TOKEN_REFRESH_WORKER] Error showing token status:', error.message);
  }
}

/**
 * Start the worker
 */
function start() {
  console.log('');
  console.log('🔐 Token Refresh Worker Starting...');
  console.log('');
  console.log('Configuration:');
  console.log(`  Refresh interval: ${REFRESH_INTERVAL_MS / 1000 / 60} minutes`);
  console.log(`  Initial delay: ${INITIAL_DELAY_MS / 1000} seconds`);
  console.log(`  Refresh threshold: 24 hours before expiration`);
  console.log('');

  // Show initial status
  try {
    showTokenStatus();
  } catch (error) {
    console.error('[TOKEN_REFRESH_WORKER] Error showing initial status:', error.message);
  }

  // Schedule first refresh after initial delay
  console.log(`[TOKEN_REFRESH_WORKER] First refresh cycle will run in ${INITIAL_DELAY_MS / 1000} seconds...`);
  console.log('');

  setTimeout(() => {
    if (isShuttingDown) return;

    // Run first cycle
    runRefreshCycle().then(() => {
      if (isShuttingDown) return;

      // Schedule recurring refreshes
      refreshTimer = setInterval(() => {
        runRefreshCycle();
      }, REFRESH_INTERVAL_MS);
    });
  }, INITIAL_DELAY_MS);
}

/**
 * Graceful shutdown
 */
function shutdown(signal) {
  if (isShuttingDown) return;

  console.log('');
  console.log(`[TOKEN_REFRESH_WORKER] Received ${signal}, shutting down gracefully...`);
  isShuttingDown = true;

  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  console.log('[TOKEN_REFRESH_WORKER] Shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[TOKEN_REFRESH_WORKER] Uncaught exception:', error);
  console.error(error.stack);
  // Don't exit - log and continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[TOKEN_REFRESH_WORKER] Unhandled rejection at:', promise);
  console.error('[TOKEN_REFRESH_WORKER] Reason:', reason);
  // Don't exit - log and continue
});

// Start the worker
start();
