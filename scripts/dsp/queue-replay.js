#!/usr/bin/env node

/**
 * DSP Export Queue Replay
 *
 * Requeue failed or completed export requests for retry.
 * Usage:
 *   node scripts/dsp/queue-replay.js --request 123       # Replay specific request
 *   node scripts/dsp/queue-replay.js --failed            # Replay all failed requests
 *   node scripts/dsp/queue-replay.js --failed --dry-run  # Preview without making changes
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import readline from 'readline';

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

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    requestId: null,
    failed: false,
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--request':
        options.requestId = parseInt(args[++i], 10);
        break;
      case '--failed':
        options.failed = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  if (!options.requestId && !options.failed) {
    console.error(`${colors.red}Error: Must specify --request ID or --failed${colors.reset}`);
    printHelp();
    process.exit(1);
  }

  return options;
}

function printHelp() {
  console.log(`
${colors.bright}DSP Export Queue Replay${colors.reset}

Requeue failed or completed export requests for retry.

${colors.bright}Usage:${colors.reset}
  node scripts/dsp/queue-replay.js [options]

${colors.bright}Options:${colors.reset}
  --request ID           Replay specific request by ID
  --failed               Replay all failed requests
  --dry-run              Preview changes without executing
  -h, --help             Show this help message

${colors.bright}Examples:${colors.reset}
  node scripts/dsp/queue-replay.js --request 123
  node scripts/dsp/queue-replay.js --failed
  node scripts/dsp/queue-replay.js --failed --dry-run

${colors.bright}Notes:${colors.reset}
  - Replaying resets the request to 'pending' status
  - Retry count is preserved (for failed requests)
  - Worker will automatically pick up pending requests
  - Use --dry-run to preview changes before applying
`);
}

async function confirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

function getRequestById(id) {
  return db.prepare('SELECT * FROM export_requests WHERE id = ?').get(id);
}

function getFailedRequests() {
  return db.prepare('SELECT * FROM export_requests WHERE status = \'failed\'').all();
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function printRequestSummary(request) {
  const ageMs = Date.now() - new Date(request.created_at).getTime();
  const age = formatDuration(ageMs);

  let destinations = [];
  try {
    destinations = JSON.parse(request.destinations || '[]');
  } catch (e) {}

  let metadata = {};
  try {
    metadata = JSON.parse(request.job_metadata || '{}');
  } catch (e) {}

  console.log(`\n  Request #${colors.bright}${request.id}${colors.reset} - Playlist ${request.playlist_id}`);
  console.log(`  Status: ${request.status}`);
  console.log(`  Created: ${formatTimestamp(request.created_at)} (${age} ago)`);
  console.log(`  Destinations: ${destinations.join(', ')}`);

  if (metadata.retry_count) {
    console.log(`  Retry count: ${metadata.retry_count}`);
  }

  if (request.last_error) {
    const errorPreview = request.last_error.length > 80
      ? request.last_error.substring(0, 80) + '...'
      : request.last_error;
    console.log(`  Last error: ${colors.red}${errorPreview}${colors.reset}`);
  }
}

function replayRequest(requestId, dryRun = false) {
  const request = getRequestById(requestId);

  if (!request) {
    console.error(`${colors.red}Error: Request ${requestId} not found${colors.reset}`);
    return false;
  }

  if (request.status === 'in_progress') {
    console.error(`${colors.red}Error: Request ${requestId} is currently in progress${colors.reset}`);
    console.log(`${colors.yellow}Wait for it to complete or fail before replaying.${colors.reset}`);
    return false;
  }

  printRequestSummary(request);

  if (dryRun) {
    console.log(`\n${colors.cyan}[DRY RUN] Would reset request to pending${colors.reset}`);
    return true;
  }

  // Update request to pending
  try {
    let metadata = {};
    try {
      metadata = request.job_metadata ? JSON.parse(request.job_metadata) : {};
    } catch (e) {}

    // Clear worker lease info but preserve retry count
    delete metadata.worker_id;
    delete metadata.leased_at;
    delete metadata.started_at;
    delete metadata.completed_at;
    delete metadata.failed_at;
    delete metadata.next_retry_at;

    // Update status and metadata
    db.prepare('UPDATE export_requests SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('pending', null, requestId);

    db.prepare('UPDATE export_requests SET job_metadata = ? WHERE id = ?')
      .run(JSON.stringify(metadata), requestId);

    console.log(`\n${colors.green}✓ Request ${requestId} reset to pending${colors.reset}`);
    console.log(`${colors.gray}Worker will automatically process it in the next polling cycle.${colors.reset}`);

    return true;
  } catch (err) {
    console.error(`${colors.red}Error replaying request:${colors.reset}`, err.message);
    return false;
  }
}

async function replayFailedRequests(dryRun = false) {
  const failedRequests = getFailedRequests();

  if (failedRequests.length === 0) {
    console.log(`\n${colors.green}No failed requests found.${colors.reset}`);
    return;
  }

  console.log(`\n${colors.bright}${colors.cyan}=== Replay Failed Requests ===${colors.reset}`);
  console.log(`\nFound ${colors.bright}${failedRequests.length}${colors.reset} failed requests:`);

  for (const request of failedRequests) {
    printRequestSummary(request);
  }

  if (dryRun) {
    console.log(`\n${colors.cyan}[DRY RUN] Would reset ${failedRequests.length} requests to pending${colors.reset}`);
    return;
  }

  console.log('');
  const confirmed = await confirm(`Reset ${failedRequests.length} failed requests to pending?`);

  if (!confirmed) {
    console.log(`${colors.yellow}Cancelled.${colors.reset}`);
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (const request of failedRequests) {
    try {
      let metadata = {};
      try {
        metadata = request.job_metadata ? JSON.parse(request.job_metadata) : {};
      } catch (e) {}

      // Clear worker lease info but preserve retry count
      delete metadata.worker_id;
      delete metadata.leased_at;
      delete metadata.started_at;
      delete metadata.completed_at;
      delete metadata.failed_at;
      delete metadata.next_retry_at;

      // Update status and metadata
      db.prepare('UPDATE export_requests SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('pending', null, request.id);

      db.prepare('UPDATE export_requests SET job_metadata = ? WHERE id = ?')
        .run(JSON.stringify(metadata), request.id);

      successCount++;
    } catch (err) {
      console.error(`  ${colors.red}✗ Failed to replay request ${request.id}:${colors.reset}`, err.message);
      errorCount++;
    }
  }

  console.log(`\n${colors.green}✓ Reset ${successCount} requests to pending${colors.reset}`);

  if (errorCount > 0) {
    console.log(`${colors.red}✗ ${errorCount} errors${colors.reset}`);
  }

  console.log(`${colors.gray}Worker will automatically process them in the next polling cycle.${colors.reset}\n`);
}

// Main execution
async function main() {
  try {
    const options = parseArgs();

    if (options.dryRun) {
      console.log(`${colors.cyan}\n[DRY RUN MODE] No changes will be made\n${colors.reset}`);
    }

    if (options.requestId) {
      replayRequest(options.requestId, options.dryRun);
    } else if (options.failed) {
      await replayFailedRequests(options.dryRun);
    }
  } catch (err) {
    console.error(`${colors.red}Error:${colors.reset}`, err.message);
    process.exit(1);
  }
}

main();
