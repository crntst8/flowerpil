#!/usr/bin/env node

/**
 * DSP Export Queue Tail
 *
 * Display recent export request logs with human-readable status icons.
 * Usage:
 *   node scripts/dsp/queue-tail.js                    # Show last 20 requests
 *   node scripts/dsp/queue-tail.js --limit 50         # Show last 50 requests
 *   node scripts/dsp/queue-tail.js --status failed    # Show only failed
 *   node scripts/dsp/queue-tail.js --playlist 42      # Show requests for playlist 42
 *   node scripts/dsp/queue-tail.js --since 2h         # Show requests from last 2 hours
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
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Status icons
const statusIcons = {
  pending: `${colors.yellow}⏳${colors.reset}`,
  in_progress: `${colors.cyan}⚙ ${colors.reset}`,
  completed: `${colors.green}✓${colors.reset}`,
  failed: `${colors.red}✗${colors.reset}`
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: 20,
    status: null,
    playlistId: null,
    since: null
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--limit':
        options.limit = parseInt(args[++i], 10) || 20;
        break;
      case '--status':
        options.status = args[++i];
        break;
      case '--playlist':
        options.playlistId = parseInt(args[++i], 10);
        break;
      case '--since':
        options.since = parseSinceArg(args[++i]);
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function parseSinceArg(since) {
  if (!since) return null;

  const match = since.match(/^(\d+)([smhd])$/);
  if (!match) {
    console.error(`Invalid --since format: ${since}. Use format like: 30s, 5m, 2h, 1d`);
    process.exit(1);
  }

  const [, value, unit] = match;
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

  const ms = parseInt(value, 10) * multipliers[unit];
  return new Date(Date.now() - ms).toISOString();
}

function printHelp() {
  console.log(`
${colors.bright}DSP Export Queue Tail${colors.reset}

Display recent export request logs with status and details.

${colors.bright}Usage:${colors.reset}
  node scripts/dsp/queue-tail.js [options]

${colors.bright}Options:${colors.reset}
  --limit N              Show last N requests (default: 20)
  --status STATUS        Filter by status: pending|in_progress|completed|failed
  --playlist ID          Filter by playlist ID
  --since DURATION       Show requests since duration ago (e.g., 30s, 5m, 2h, 1d)
  -h, --help             Show this help message

${colors.bright}Examples:${colors.reset}
  node scripts/dsp/queue-tail.js
  node scripts/dsp/queue-tail.js --limit 50
  node scripts/dsp/queue-tail.js --status failed
  node scripts/dsp/queue-tail.js --playlist 42
  node scripts/dsp/queue-tail.js --since 2h
  node scripts/dsp/queue-tail.js --status failed --since 1d

${colors.bright}Status Icons:${colors.reset}
  ${statusIcons.pending}  pending
  ${statusIcons.in_progress}  in progress
  ${statusIcons.completed}  completed
  ${statusIcons.failed}  failed
`);
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

function getRequests(options) {
  let sql = `
    SELECT * FROM export_requests
    WHERE 1=1
  `;
  const params = [];

  if (options.status) {
    sql += ` AND status = ?`;
    params.push(options.status);
  }

  if (options.playlistId) {
    sql += ` AND playlist_id = ?`;
    params.push(options.playlistId);
  }

  if (options.since) {
    sql += ` AND created_at >= ?`;
    params.push(options.since);
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(options.limit);

  return db.prepare(sql).all(...params);
}

function printRequest(request) {
  const statusIcon = statusIcons[request.status] || '?';
  const ageMs = Date.now() - new Date(request.created_at).getTime();
  const age = formatDuration(ageMs);

  // Parse destinations
  let destinations = [];
  try {
    destinations = JSON.parse(request.destinations || '[]');
  } catch (e) {}

  // Parse results
  let results = {};
  try {
    results = JSON.parse(request.results || '{}');
  } catch (e) {}

  // Parse metadata
  let metadata = {};
  try {
    metadata = JSON.parse(request.job_metadata || '{}');
  } catch (e) {}

  // Build status line
  console.log(`\n${statusIcon} ${colors.bright}Request #${request.id}${colors.reset} - Playlist ${request.playlist_id}`);
  console.log(`  ${colors.dim}Created: ${formatTimestamp(request.created_at)} (${age})${colors.reset}`);
  console.log(`  Status: ${request.status}`);

  if (destinations.length > 0) {
    const destStr = destinations.map(d => {
      const result = results[d];
      if (!result) return `${colors.gray}${d}${colors.reset}`;

      if (result.status === 'success') {
        return `${colors.green}${d}${colors.reset}`;
      } else if (result.status === 'failed') {
        return `${colors.red}${d}${colors.reset}`;
      }
      return d;
    }).join(', ');

    console.log(`  Destinations: ${destStr}`);
  }

  // Show retry information for pending/failed
  if ((request.status === 'pending' || request.status === 'failed') && metadata.retry_count) {
    console.log(`  ${colors.yellow}Retries: ${metadata.retry_count}/${metadata.max_retries || 3}${colors.reset}`);

    if (metadata.next_retry_at) {
      const retryInMs = new Date(metadata.next_retry_at).getTime() - Date.now();
      if (retryInMs > 0) {
        const retryInFormatted = formatDuration(retryInMs).replace(' ago', '');
        console.log(`  Next retry: ${colors.yellow}in ${retryInFormatted}${colors.reset}`);
      } else {
        console.log(`  Next retry: ${colors.green}ready now${colors.reset}`);
      }
    }
  }

  // Show worker info for in_progress
  if (request.status === 'in_progress' && metadata.worker_id) {
    console.log(`  Worker: ${metadata.worker_id}`);
    if (metadata.leased_at) {
      const leaseAgeMs = Date.now() - new Date(metadata.leased_at).getTime();
      const leaseAge = formatDuration(leaseAgeMs);
      console.log(`  Leased: ${leaseAge}`);
    }
  }

  // Show completion info
  if (request.status === 'completed' && metadata.execution_time_ms) {
    const execTime = metadata.execution_time_ms < 1000
      ? `${metadata.execution_time_ms}ms`
      : `${(metadata.execution_time_ms / 1000).toFixed(1)}s`;
    console.log(`  ${colors.green}Completed in ${execTime}${colors.reset}`);

    // Show success URLs
    for (const platform of destinations) {
      const result = results[platform];
      if (result && result.status === 'success' && result.url) {
        console.log(`  ${colors.green}✓${colors.reset} ${platform}: ${colors.dim}${result.url}${colors.reset}`);
      }
    }
  }

  // Show error info
  if (request.status === 'failed' || (request.last_error && request.status !== 'completed')) {
    if (metadata.failure_reason) {
      console.log(`  Reason: ${colors.red}${metadata.failure_reason}${colors.reset}`);
    }
    if (request.last_error) {
      const errorPreview = request.last_error.length > 100
        ? request.last_error.substring(0, 100) + '...'
        : request.last_error;
      console.log(`  Error: ${colors.red}${errorPreview}${colors.reset}`);
    }

    // Show platform-specific errors
    for (const platform of destinations) {
      const result = results[platform];
      if (result && result.status === 'failed' && result.error) {
        console.log(`  ${colors.red}✗${colors.reset} ${platform}: ${colors.dim}${result.error}${colors.reset}`);
      }
    }

    // Show remediation hint for repeated errors
    if (metadata.retry_count >= 2) {
      console.log(`  ${colors.yellow}💡 Hint: Multiple retries failed. Check token health or platform status.${colors.reset}`);
    }
  }
}

function printRequestList(requests, options) {
  console.log(`\n${colors.bright}${colors.cyan}=== DSP Export Queue ===${colors.reset}`);

  if (options.status) {
    console.log(`Filter: status = ${options.status}`);
  }
  if (options.playlistId) {
    console.log(`Filter: playlist_id = ${options.playlistId}`);
  }
  if (options.since) {
    console.log(`Filter: since ${options.since}`);
  }

  console.log(`Showing ${requests.length} requests (limit: ${options.limit})\n`);

  if (requests.length === 0) {
    console.log(`${colors.dim}No requests found matching filters.${colors.reset}\n`);
    return;
  }

  for (const request of requests) {
    printRequest(request);
  }

  console.log('');
}

// Main execution
try {
  const options = parseArgs();
  const requests = getRequests(options);
  printRequestList(requests, options);
} catch (err) {
  console.error(`${colors.red}Error:${colors.reset}`, err.message);
  process.exit(1);
}
