#!/usr/bin/env node

/**
 * scheduled-health-check.js - Automated DSP Token Health Monitoring
 *
 * Purpose:
 *   Runs periodic health checks on all DSP OAuth tokens and updates their
 *   health status in the database. Logs critical alerts for expired or
 *   expiring tokens.
 *
 * Usage:
 *   node scripts/dsp/scheduled-health-check.js
 *
 * Deployment:
 *   Option 1 - PM2 with cron pattern:
 *     pm2 start scripts/dsp/scheduled-health-check.js --name "dsp-health-check" --cron "0 *\/6 * * *"
 *
 *   Option 2 - System cron:
 *     0 *\/6 * * * cd /var/www/flowerpil && node scripts/dsp/scheduled-health-check.js
 *
 *   Recommended frequency: Every 6 hours
 *
 * Behavior:
 *   - Validates all active tokens via API calls
 *   - Updates health_status and last_validated_at in database
 *   - Logs warnings for expiring tokens (< 48h)
 *   - Logs errors for expired or revoked tokens
 *   - Sends alert summary to configured notification channel (future)
 *
 * Phase: 1 (Token Management Overhaul)
 * Status: PRODUCTION READY
 */

import { getDatabase } from '../../server/database/db.js';
import tokenHealthService from '../../server/services/tokenHealthService.js';

const {
  refreshAllTokenHealthStatuses,
  getHealthReport
} = tokenHealthService;

const db = getDatabase();

/**
 * Format duration for human-readable output
 */
function formatDuration(ms) {
  if (ms === null || Number.isNaN(ms)) return 'unknown';
  if (ms <= 0) return 'expired';

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    const minutes = Math.floor((ms - hours * 60 * 60 * 1000) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  }
  const minutes = Math.floor(ms / (60 * 1000));
  return minutes > 0 ? `${minutes}m` : `${Math.max(0, Math.floor(ms / 1000))}s`;
}

/**
 * Main health check execution
 */
async function runHealthCheck() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🏥 DSP Token Health Check - ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Refresh all token health statuses
    console.log('🔄 Refreshing token health statuses...');
    const refreshResult = refreshAllTokenHealthStatuses();
    console.log(`✅ Health statuses refreshed (${refreshResult.updated} updated, ${refreshResult.unchanged} unchanged, ${refreshResult.total} total)\n`);

    // Generate health report
    console.log('📊 Generating health report...');
    const report = getHealthReport();
    const summary = report.summary || {};
    const byPlatform = report.byPlatform || {};
    const tokens = report.tokens || [];
    const healthyPct = summary.total
      ? Math.round((summary.healthy / summary.total) * 100)
      : 0;

    // Display summary
    console.log('Summary:');
    console.log(`  Total tokens: ${summary.total}`);
    console.log(`  Healthy: ${summary.healthy} (${healthyPct}%)`);
    console.log(`  Expiring: ${summary.expiring}`);
    console.log(`  Needs refresh (<48h): ${summary.needsRefresh}`);
    console.log(`  Expired: ${summary.expired}`);
    console.log(`  Revoked: ${summary.revoked}`);
    console.log(`  Unknown: ${summary.unknown}`);
    console.log('');

    // Display per-platform breakdown
    if (Object.keys(byPlatform).length > 0) {
      console.log('Platform Status:');
      for (const [platform, platformTokens] of Object.entries(byPlatform)) {
        const totalTokens = platformTokens.length;
        const healthyCount = platformTokens.filter((t) => t.health_status === 'healthy').length;
        const warningCount = platformTokens.filter((t) => t.health_status === 'expiring').length;
        const criticalCount = platformTokens.filter((t) => ['expired', 'revoked'].includes(t.health_status)).length;
        const icon = criticalCount > 0 ? '❌' : warningCount > 0 ? '⚠️' : '✅';
        console.log(`  ${icon} ${platform}: ${healthyCount}/${totalTokens} healthy (${warningCount} warning, ${criticalCount} critical)`);
      }
      console.log('');
    }

    // Build alerts from token list
    const criticalAlerts = tokens.filter((token) =>
      token && ['expired', 'revoked'].includes(token.health_status)
    );

    const criticalIds = new Set(criticalAlerts.map((token) => token.id));

    const warningAlerts = tokens.filter((token) => {
      if (!token || criticalIds.has(token.id)) return false;
      if (token.health_status === 'expiring') return true;
      return ['CRITICAL', 'WARNING', 'EXPIRING'].includes(token.expiry_urgency);
    });

    if (criticalAlerts.length > 0) {
      console.error('🚨 CRITICAL ALERTS:');
      for (const token of criticalAlerts) {
        const expiresIn = token.expires_at
          ? formatDuration(new Date(token.expires_at) - new Date())
          : 'unknown';
        const reason = token.health_status === 'revoked' ? 'authorization revoked' : 'token expired';
        console.error(`  ❌ ${token.platform.toUpperCase()} (${token.account_label}) — ${reason}`);
        console.error(`     Expires in: ${expiresIn}`);
        console.error('     Action: npx ts-node scripts/dsp/setup-token.ts');
      }
      console.error('');
    }

    if (warningAlerts.length > 0) {
      console.warn('⚠️  TOKENS NEEDING REFRESH:');
      for (const token of warningAlerts) {
        const expiresIn = token.expires_at
          ? formatDuration(new Date(token.expires_at) - new Date())
          : 'unknown';
        console.warn(`  ⚠️  ${token.platform.toUpperCase()} (${token.account_label})`);
        console.warn(`     Health: ${token.health_status} (urgency: ${token.expiry_urgency})`);
        console.warn(`     Expires in: ${expiresIn}`);
        console.warn('     Action: rotate token before window closes');
      }
      console.warn('');
    }

    // Display detailed token status
    if (tokens.length > 0) {
      console.log('Token Details:');
      for (const token of tokens) {
        const statusIcon = {
          healthy: '✅',
          expiring: '⚠️',
          expired: '❌',
          revoked: '🚫',
          unknown: '❓'
        }[token.health_status] || '❓';

        const activeFlag = token.is_active === 1 ? '[ACTIVE]' : '[BACKUP]';
        const expiresAt = token.expires_at ? new Date(token.expires_at).toISOString() : 'N/A';
        const lastValidated = token.last_validated_at ?
          new Date(token.last_validated_at).toISOString() :
          'Never';

        console.log(`  ${statusIcon} ${token.platform} - ${token.account_label} ${activeFlag}`);
        console.log(`     Health: ${token.health_status}`);
        console.log(`     Expires: ${expiresAt}`);
        console.log(`     Last validated: ${lastValidated}`);
      }
      console.log('');
    }

    // Exit with appropriate status code
    if (criticalAlerts.length > 0) {
      console.error('❌ Health check completed with critical issues');
      console.error('   Action required: Refresh expired/revoked tokens immediately\n');
      process.exit(1);
    } else if (warningAlerts.length > 0) {
      console.warn('⚠️  Health check completed with warnings');
      console.warn('   Action recommended: Refresh expiring tokens soon\n');
      process.exit(0); // Don't fail on warnings
    } else {
      console.log('✅ Health check completed - all tokens healthy\n');
      process.exit(0);
    }

  } catch (err) {
    console.error('❌ Health check failed with error:');
    console.error(err);
    console.error('');
    process.exit(1);
  }
}

/**
 * Send alerts to configured notification channels
 * TODO: Implement email/Slack notifications in Phase 3
 */
async function sendAlerts(report) {
  // Placeholder for Phase 3 alerting integration
  // - Email via Brevo
  // - Slack webhook
  // - Discord webhook
  // - etc.

  if (process.env.ALERT_WEBHOOK_URL) {
    console.log('📢 Sending alerts to webhook...');
    // TODO: Implement webhook posting
  }
}

/**
 * Validate environment before running
 */
function validateEnvironment() {
  // Check database exists
  try {
    const tokenCount = db.prepare('SELECT COUNT(*) as count FROM export_oauth_tokens').get();
    console.log(`ℹ️  Found ${tokenCount.count} tokens in database\n`);
  } catch (err) {
    console.error('❌ Database validation failed:', err.message);
    console.error('   Ensure database migrations are up to date: npm run migrate\n');
    process.exit(1);
  }

  // Check required environment variables for DSP APIs
  const requiredEnvVars = {
    spotify: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'],
    apple: ['APPLE_MUSIC_TEAM_ID', 'APPLE_MUSIC_KEY_ID', 'APPLE_MUSIC_PRIVATE_KEY'],
    tidal: ['TIDAL_CLIENT_ID', 'TIDAL_CLIENT_SECRET']
  };

  let missingVars = [];
  for (const [platform, vars] of Object.entries(requiredEnvVars)) {
    for (const varName of vars) {
      if (!process.env[varName]) {
        missingVars.push(`${varName} (${platform})`);
      }
    }
  }

  if (missingVars.length > 0) {
    console.warn('⚠️  Missing environment variables (token validation may fail):');
    for (const varName of missingVars) {
      console.warn(`   - ${varName}`);
    }
    console.warn('');
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateEnvironment();
  runHealthCheck().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
}

export { runHealthCheck, validateEnvironment };
