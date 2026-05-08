#!/usr/bin/env node

/**
 * DSP Export Queue Health Check
 *
 * Shows queue statistics and worker status for export automation.
 * Usage: node scripts/dsp/queue-health.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

import { getDatabase } from '../../server/database/db.js';

const db = getDatabase();

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function getQueueStatistics() {
  const stats = {
    total: 0,
    pending: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
    pending_retry: 0,
    oldest_pending: null,
    newest_completed: null
  };

  // Count by status
  const statusCounts = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM export_requests
    GROUP BY status
  `).all();

  for (const row of statusCounts) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }

  // Count pending with retry schedule
  const pendingRetry = db.prepare(`
    SELECT COUNT(*) as count
    FROM export_requests
    WHERE status = 'pending'
      AND job_metadata IS NOT NULL
      AND json_extract(job_metadata, '$.next_retry_at') IS NOT NULL
  `).get();
  stats.pending_retry = pendingRetry.count;

  // Get oldest pending request
  const oldestPending = db.prepare(`
    SELECT id, playlist_id, created_at
    FROM export_requests
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
  `).get();
  stats.oldest_pending = oldestPending;

  // Get newest completed request
  const newestCompleted = db.prepare(`
    SELECT id, playlist_id, updated_at
    FROM export_requests
    WHERE status = 'completed'
    ORDER BY updated_at DESC
    LIMIT 1
  `).get();
  stats.newest_completed = newestCompleted;

  return stats;
}

function getWorkerStatus() {
  // Check for active in_progress requests with worker_id
  const activeRequests = db.prepare(`
    SELECT id, playlist_id, job_metadata, updated_at
    FROM export_requests
    WHERE status = 'in_progress'
  `).all();

  const workers = new Map();

  for (const request of activeRequests) {
    try {
      const metadata = request.job_metadata ? JSON.parse(request.job_metadata) : {};
      const workerId = metadata.worker_id || 'unknown';
      const leasedAt = metadata.leased_at || request.updated_at;
      const ageMs = Date.now() - new Date(leasedAt).getTime();

      if (!workers.has(workerId)) {
        workers.set(workerId, {
          worker_id: workerId,
          active_requests: [],
          oldest_lease_age_ms: 0
        });
      }

      const worker = workers.get(workerId);
      worker.active_requests.push({
        id: request.id,
        playlist_id: request.playlist_id,
        age_ms: ageMs
      });

      if (ageMs > worker.oldest_lease_age_ms) {
        worker.oldest_lease_age_ms = ageMs;
      }
    } catch (e) {
      console.error('Failed to parse job_metadata:', e.message);
    }
  }

  return Array.from(workers.values());
}

function getRecentFailures(limit = 5) {
  return db.prepare(`
    SELECT id, playlist_id, last_error, updated_at, job_metadata
    FROM export_requests
    WHERE status = 'failed'
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit);
}

function printQueueHealth() {
  const stats = getQueueStatistics();
  const workers = getWorkerStatus();
  const recentFailures = getRecentFailures(5);

  console.log(`\n${colors.bright}${colors.cyan}=== DSP Export Queue Health ===${colors.reset}\n`);

  // Queue statistics
  console.log(`${colors.bright}Queue Statistics:${colors.reset}`);
  console.log(`  Total requests:      ${stats.total}`);
  console.log(`  ${colors.yellow}Pending:${colors.reset}             ${stats.pending} (${stats.pending_retry} awaiting retry)`);
  console.log(`  ${colors.cyan}In progress:${colors.reset}         ${stats.in_progress}`);
  console.log(`  ${colors.green}Completed:${colors.reset}           ${stats.completed}`);
  console.log(`  ${colors.red}Failed:${colors.reset}              ${stats.failed}`);

  if (stats.oldest_pending) {
    const ageMs = Date.now() - new Date(stats.oldest_pending.created_at).getTime();
    const ageFormatted = formatDuration(ageMs);
    console.log(`\n  Oldest pending: #${stats.oldest_pending.id} (${ageFormatted} old)`);
  }

  if (stats.newest_completed) {
    const ageMs = Date.now() - new Date(stats.newest_completed.updated_at).getTime();
    const ageFormatted = formatDuration(ageMs);
    console.log(`  Last completion: #${stats.newest_completed.id} (${ageFormatted} ago)`);
  }

  // Worker status
  console.log(`\n${colors.bright}Worker Status:${colors.reset}`);

  if (workers.length === 0) {
    console.log(`  ${colors.gray}No active workers${colors.reset}`);
  } else {
    for (const worker of workers) {
      const oldestAge = formatDuration(worker.oldest_lease_age_ms);
      const isStale = worker.oldest_lease_age_ms > 300000; // 5 minutes

      const statusColor = isStale ? colors.red : colors.green;
      const status = isStale ? 'STALE' : 'ACTIVE';

      console.log(`  ${statusColor}● ${worker.worker_id}${colors.reset}`);
      console.log(`    Status: ${statusColor}${status}${colors.reset}`);
      console.log(`    Processing: ${worker.active_requests.length} requests`);
      console.log(`    Oldest lease: ${oldestAge}`);

      if (worker.active_requests.length > 0 && worker.active_requests.length <= 3) {
        console.log(`    Requests: ${worker.active_requests.map(r => `#${r.id}`).join(', ')}`);
      }
    }
  }

  // Recent failures
  if (recentFailures.length > 0) {
    console.log(`\n${colors.bright}Recent Failures:${colors.reset}`);

    for (const failure of recentFailures) {
      const ageMs = Date.now() - new Date(failure.updated_at).getTime();
      const ageFormatted = formatDuration(ageMs);

      let retryInfo = '';
      try {
        const metadata = failure.job_metadata ? JSON.parse(failure.job_metadata) : {};
        if (metadata.retry_count) {
          retryInfo = ` (${metadata.retry_count} retries)`;
        }
      } catch (e) {}

      console.log(`  ${colors.red}✗${colors.reset} Request #${failure.id} - Playlist ${failure.playlist_id}${retryInfo}`);
      console.log(`    Failed ${ageFormatted} ago`);
      console.log(`    Error: ${colors.gray}${failure.last_error || 'Unknown error'}${colors.reset}`);
    }
  }

  // Health summary
  console.log(`\n${colors.bright}Health Summary:${colors.reset}`);

  const issues = [];

  if (stats.pending > 50) {
    issues.push(`${colors.yellow}⚠${colors.reset}  High queue depth (${stats.pending} pending)`);
  }

  if (stats.in_progress > 0 && workers.length === 0) {
    issues.push(`${colors.red}✗${colors.reset}  Requests stuck in progress with no active workers`);
  }

  if (workers.some(w => w.oldest_lease_age_ms > 300000)) {
    issues.push(`${colors.red}✗${colors.reset}  Stale worker detected (lease > 5 minutes)`);
  }

  if (stats.failed > 10) {
    issues.push(`${colors.yellow}⚠${colors.reset}  High failure rate (${stats.failed} failed)`);
  }

  if (issues.length === 0) {
    console.log(`  ${colors.green}✓ All systems healthy${colors.reset}`);
  } else {
    for (const issue of issues) {
      console.log(`  ${issue}`);
    }
  }

  console.log('');
}

// Main execution
try {
  printQueueHealth();
} catch (err) {
  console.error(`${colors.red}Error:${colors.reset}`, err.message);
  process.exit(1);
}
