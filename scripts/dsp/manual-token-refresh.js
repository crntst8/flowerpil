#!/usr/bin/env node

/**
 * Manual Token Refresh Script
 *
 * Manually triggers a token refresh cycle for testing and debugging.
 *
 * Usage:
 *   node scripts/dsp/manual-token-refresh.js
 *   node scripts/dsp/manual-token-refresh.js --status-only
 *   node scripts/dsp/manual-token-refresh.js --force
 *
 * Options:
 *   --status-only   Show current token status without refreshing
 *   --force         Attempt refresh even if not expiring soon (for testing)
 *   --help          Show this help message
 */

import { refreshAllTokens, getRefreshStatus } from '../../server/services/tokenRefreshService.js';
import { getTokensNeedingRefresh, refreshAllTokenHealthStatuses } from '../../server/services/tokenHealthService.js';

const args = process.argv.slice(2);
const showHelp = args.includes('--help');
const statusOnly = args.includes('--status-only');
const force = args.includes('--force');

if (showHelp) {
  console.log(`
Manual Token Refresh Script

Usage:
  node scripts/dsp/manual-token-refresh.js
  node scripts/dsp/manual-token-refresh.js --status-only
  node scripts/dsp/manual-token-refresh.js --force

Options:
  --status-only   Show current token status without refreshing
  --force         Attempt refresh even if not expiring soon (for testing)
  --help          Show this help message

Examples:
  # Show current token status
  node scripts/dsp/manual-token-refresh.js --status-only

  # Run manual refresh
  node scripts/dsp/manual-token-refresh.js

  # Force refresh (for testing)
  node scripts/dsp/manual-token-refresh.js --force
  `);
  process.exit(0);
}

/**
 * Display token status in a formatted table
 */
function displayTokenStatus() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('                            TOKEN STATUS REPORT');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('');

  const status = getRefreshStatus();

  if (status.length === 0) {
    console.log('  No active tokens found in database.');
    console.log('');
    return;
  }

  // Group by platform
  const byPlatform = status.reduce((acc, token) => {
    if (!acc[token.platform]) {
      acc[token.platform] = [];
    }
    acc[token.platform].push(token);
    return acc;
  }, {});

  for (const [platform, tokens] of Object.entries(byPlatform)) {
    console.log(`  ${platform.toUpperCase()}:`);
    console.log('  ' + '─'.repeat(77));

    tokens.forEach(token => {
      const timeStr = token.time_until_expiry !== null
        ? `${Math.floor(token.time_until_expiry / 60)}h ${token.time_until_expiry % 60}m`
        : 'unknown';

      const refreshStr = token.has_refresh_token ? '✓' : '✗';
      const needsRefreshStr = token.needs_refresh ? '⚠️  NEEDS REFRESH' : '   ';
      const healthIcon = {
        healthy: '✓',
        expiring: '⚠',
        expired: '✗',
        revoked: '⊗',
        unknown: '?'
      }[token.health_status] || '?';

      console.log(
        `  ${needsRefreshStr} ${healthIcon} [${token.account_type.padEnd(9)}] ${token.account_label.padEnd(25)} ` +
        `expires: ${timeStr.padEnd(12)} | refresh: ${refreshStr}`
      );
    });

    console.log('');
  }

  // Summary
  const needsRefresh = status.filter(t => t.needs_refresh).length;
  const healthy = status.filter(t => t.health_status === 'healthy').length;
  const expiring = status.filter(t => t.health_status === 'expiring').length;
  const expired = status.filter(t => t.health_status === 'expired').length;
  const revoked = status.filter(t => t.health_status === 'revoked').length;

  console.log('  Summary:');
  console.log('  ' + '─'.repeat(77));
  console.log(`    Total active tokens: ${status.length}`);
  console.log(`    Healthy: ${healthy}`);
  console.log(`    Expiring: ${expiring}`);
  console.log(`    Expired: ${expired}`);
  console.log(`    Revoked: ${revoked}`);
  console.log(`    Needs refresh: ${needsRefresh}`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('');
}

/**
 * Run refresh cycle
 */
async function runRefresh() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('                       MANUAL TOKEN REFRESH CYCLE');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('');

  if (force) {
    console.log('⚠️  Running in FORCE mode - will attempt to refresh all tokens');
    console.log('');
  }

  try {
    // Update health statuses first
    console.log('Step 1: Updating health statuses...');
    const healthUpdate = refreshAllTokenHealthStatuses();
    console.log(`  Updated: ${healthUpdate.updated} | Unchanged: ${healthUpdate.unchanged}`);
    console.log('');

    // Show what needs refresh
    const tokensNeedingRefresh = getTokensNeedingRefresh();
    if (tokensNeedingRefresh.length === 0 && !force) {
      console.log('✓ No tokens need refresh at this time');
      console.log('');
      displayTokenStatus();
      return;
    }

    console.log('Step 2: Refreshing tokens...');
    console.log(`  Found ${tokensNeedingRefresh.length} token(s) eligible for refresh`);
    console.log('');

    // Run refresh
    const result = await refreshAllTokens();

    // Display results
    console.log('Step 3: Results');
    console.log('  ' + '─'.repeat(77));
    console.log(`  Total checked: ${result.total}`);
    console.log(`  Successfully refreshed: ${result.refreshed}`);
    console.log(`  Failed: ${result.failed}`);
    console.log(`  Skipped: ${result.skipped}`);
    console.log('');

    if (result.results.length > 0) {
      console.log('  Details:');
      result.results.forEach(r => {
        const status = r.success
          ? (r.skipped ? '⊘ SKIPPED' : '✓ SUCCESS')
          : '✗ FAILED';

        const detail = r.success
          ? (r.skipped ? r.reason : `expires: ${r.expiresAt}`)
          : r.error;

        console.log(`    ${status} [${r.platform.toUpperCase()}] Token ID ${r.tokenId} - ${detail}`);
      });
      console.log('');
    }

    // Show updated status
    displayTokenStatus();

  } catch (error) {
    console.error('');
    console.error('✗ Error during refresh cycle:');
    console.error('  ', error.message);
    console.error('');
    console.error(error.stack);
    console.error('');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('');
}

// Main
(async () => {
  try {
    if (statusOnly) {
      displayTokenStatus();
    } else {
      await runRefresh();
    }
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();
