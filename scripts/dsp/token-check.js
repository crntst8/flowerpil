#!/usr/bin/env node

/**
 * token-check.js - Verify DSP token health and expiration
 *
 * Provides a fast health report for export OAuth tokens stored in
 * export_oauth_tokens (v2 schema). Designed for both ad-hoc use and
 * automation (CI, cron, PM2).
 */

import process from 'process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

import { getDatabase } from '../../server/database/db.js';
import {
  HealthStatus,
  calculateHealthStatus
} from '../../server/services/tokenHealthService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

const db = getDatabase();

const DEFAULT_WARN_HOURS = parseInt(process.env.DSP_TOKEN_EXPIRY_WARNING_HOURS || '48', 10);
const CRITICAL_HOURS = parseInt(process.env.DSP_TOKEN_CRITICAL_HOURS || '12', 10);

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const severityRank = { ok: 0, info: 0, warn: 1, critical: 2 };

const validPlatforms = new Set(['spotify', 'apple', 'tidal']);
const validAccountTypes = new Set(['flowerpil', 'curator']);

const icons = {
  ok: '✅',
  info: 'ℹ️ ',
  warn: '⚠️ ',
  critical: '❌'
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    platform: null,
    label: null,
    accountType: null,
    includeInactive: false,
    all: false,
    warnHours: DEFAULT_WARN_HOURS,
    color: process.stdout.isTTY,
    json: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--platform':
      case '-p':
        options.platform = (args[i + 1] || '').toLowerCase();
        if (!options.platform || !validPlatforms.has(options.platform)) {
          throw new Error(`Invalid --platform value. Expected one of: ${[...validPlatforms].join(', ')}`);
        }
        i += 1;
        break;
      case '--label':
        options.label = args[i + 1];
        if (!options.label) {
          throw new Error('Missing value for --label');
        }
        i += 1;
        break;
      case '--account-type':
        options.accountType = (args[i + 1] || '').toLowerCase();
        if (!options.accountType || !validAccountTypes.has(options.accountType)) {
          throw new Error(`Invalid --account-type value. Expected one of: ${[...validAccountTypes].join(', ')}`);
        }
        i += 1;
        break;
      case '--all':
        options.all = true;
        options.includeInactive = true;
        break;
      case '--include-inactive':
        options.includeInactive = true;
        break;
      case '--warn-hours':
        options.warnHours = parseInt(args[i + 1], 10);
        if (Number.isNaN(options.warnHours) || options.warnHours <= 0) {
          throw new Error('Invalid --warn-hours value (must be positive integer)');
        }
        i += 1;
        break;
      case '--json':
        options.json = true;
        break;
      case '--no-color':
        options.color = false;
        break;
      case '--help':
      case '-h':
        displayHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function displayHelp() {
  console.log('');
  console.log('token-check.js - Verify DSP token health and expiration');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/dsp/token-check.js --platform spotify');
  console.log('  node scripts/dsp/token-check.js --label flowerpil-primary');
  console.log('  node scripts/dsp/token-check.js --all');
  console.log('');
  console.log('Options:');
  console.log('  --platform, -p <name>     Only inspect a specific platform (spotify|apple|tidal)');
  console.log('  --label <account_label>   Inspect a token by label');
  console.log('  --account-type <type>     Filter by account type (flowerpil|curator)');
  console.log('  --all                     Show every token (active + inactive)');
  console.log('  --include-inactive        Include inactive tokens in the report');
  console.log('  --warn-hours <hours>      Override expiry warning threshold (default 48)');
  console.log('  --json                    Output machine-readable JSON');
  console.log('  --no-color                Disable ANSI color output');
  console.log('  --help, -h                Show this help and exit');
  console.log('');
  console.log('Exit Codes:');
  console.log('  0  All checked tokens healthy');
  console.log('  1  Missing tokens or token(s) expiring/expired');
  console.log('  2  Invalid arguments');
  console.log('  3  Database or runtime error');
  console.log('');
}

function fetchTokens(options) {
  let sql = `
    SELECT *
    FROM export_oauth_tokens
    WHERE 1 = 1
  `;
  const params = [];

  if (options.platform) {
    sql += ' AND platform = ?';
    params.push(options.platform);
  }

  if (options.label) {
    sql += ' AND account_label = ?';
    params.push(options.label);
  }

  if (options.accountType) {
    sql += ' AND account_type = ?';
    params.push(options.accountType);
  }

  if (!options.includeInactive) {
    sql += ' AND is_active = 1';
  }

  sql += `
    ORDER BY
      platform,
      is_active DESC,
      COALESCE(last_validated_at, '') DESC,
      id DESC
  `;

  if (!options.all && options.platform && !options.label) {
    sql += ' LIMIT 1';
  }

  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

function parseUserInfo(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const HOURS_IN_MS = 60 * 60 * 1000;

function formatDuration(ms) {
  if (ms === null || Number.isNaN(ms)) return 'unknown';
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / HOURS_IN_MS);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    const remainingHours = hours - days * 24;
    return `${days}d ${remainingHours}h`;
  }
  if (hours > 0) {
    const minutes = Math.floor((ms - hours * HOURS_IN_MS) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  }
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes > 0) {
    const seconds = Math.floor((ms - minutes * 60 * 1000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${seconds}s`;
}

function formatDate(date) {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function classifyToken(token, warnHours) {
  const now = Date.now();
  const expiresAt = token.expires_at ? new Date(token.expires_at) : null;
  const expiresInMs = expiresAt ? expiresAt.getTime() - now : null;
  const warnMs = warnHours * HOURS_IN_MS;
  const derivedStatus = calculateHealthStatus(token.expires_at, token.refresh_expires_at);
  const storedStatus = token.health_status || HealthStatus.UNKNOWN;
  const finalStatus = storedStatus === HealthStatus.UNKNOWN ? derivedStatus : storedStatus;

  let severity = 'ok';
  const notes = [];

  if (!expiresAt) {
    severity = 'warn';
    notes.push('No expiration timestamp recorded');
  } else if (expiresInMs <= 0) {
    severity = 'critical';
    notes.push('Expired token');
  } else if (expiresInMs <= warnMs) {
    severity = 'warn';
    notes.push(`Expiring in ${formatDuration(expiresInMs)}`);
  }

  if (finalStatus === HealthStatus.EXPIRED || finalStatus === HealthStatus.REVOKED) {
    severity = 'critical';
    notes.push(`Health status: ${finalStatus}`);
  } else if (finalStatus === HealthStatus.EXPIRING && severity !== 'critical') {
    severity = 'warn';
    notes.push('Health status: expiring');
  } else if (finalStatus === HealthStatus.UNKNOWN && severity === 'ok') {
    severity = 'warn';
    notes.push('Health status unknown – run scheduled-health-check');
  }

  if (token.is_active !== 1 && severity === 'ok') {
    severity = 'info';
    notes.push('Backup token (inactive)');
  }

  if (expiresInMs !== null && expiresInMs <= CRITICAL_HOURS * HOURS_IN_MS && severity !== 'critical') {
    severity = 'warn';
    notes.push(`Critical window (< ${CRITICAL_HOURS}h)`);
  }

  return {
    token,
    expiresAt,
    expiresInMs,
    derivedStatus,
    storedStatus,
    finalStatus,
    severity,
    notes,
    userInfo: parseUserInfo(token.user_info)
  };
}

function colorize(str, colorCode, enabled) {
  if (!enabled || !colorCode) return str;
  return `${colorCode}${str}${colors.reset}`;
}

function renderToken(entry, options) {
  const {
    token,
    expiresAt,
    expiresInMs,
    finalStatus,
    severity,
    notes,
    userInfo
  } = entry;

  const icon = icons[severity] || icons.ok;
  const color =
    severity === 'critical' ? colors.red :
    severity === 'warn' ? colors.yellow :
    severity === 'info' ? colors.cyan :
    colors.green;

  const header = `${token.platform.toUpperCase()} · ${token.account_label} (#${token.id})`;
  console.log(colorize(`${icon} ${header}`, color, options.color));

  const activeLabel = token.is_active === 1 ? 'ACTIVE' : 'INACTIVE';
  console.log(`  Account type:   ${token.account_type} (${activeLabel})`);
  if (token.owner_curator_id) {
    console.log(`  Curator owner:  #${token.owner_curator_id}`);
  }
  console.log(`  Health status:  ${finalStatus}`);
  if (token.last_validated_at) {
    console.log(`  Last validated: ${formatDate(token.last_validated_at)}`);
  }
  console.log(`  Expires at:     ${formatDate(expiresAt)} (${formatDuration(expiresInMs)})`);
  if (token.refresh_expires_at) {
    console.log(`  Refresh until:  ${formatDate(token.refresh_expires_at)}`);
  }
  console.log(`  Has refresh:    ${token.refresh_token ? 'yes' : 'no'}`);

  if (userInfo?.scopes) {
    const scopes = Array.isArray(userInfo.scopes) ? userInfo.scopes.join(', ') : String(userInfo.scopes);
    console.log(`  Scopes:         ${scopes}`);
  }
  if (userInfo?.email) {
    console.log(`  Account email:  ${userInfo.email}`);
  }
  if (notes.length > 0) {
    notes.forEach((note) => {
      console.log(colorize(`  › ${note}`, color, options.color));
    });
  }
  console.log('');
}

function renderSummary(report, options) {
  const total = report.length;
  const counts = report.reduce(
    (acc, entry) => {
      acc[entry.severity] = (acc[entry.severity] || 0) + 1;
      return acc;
    },
    { ok: 0, info: 0, warn: 0, critical: 0 }
  );

  console.log(colorize('Summary', colors.bright, options.color));
  console.log(`  Total tokens checked: ${total}`);
  console.log(`  Healthy:   ${counts.ok}`);
  console.log(`  Info:      ${counts.info}`);
  console.log(`  Warnings:  ${counts.warn}`);
  console.log(`  Critical:  ${counts.critical}`);
  console.log('');
}

function determineExitCode(report) {
  const worstSeverity = report.reduce((max, entry) => {
    return Math.max(max, severityRank[entry.severity] ?? 0);
  }, 0);
  return worstSeverity > 0 ? 1 : 0;
}

function toJson(report, metadata) {
  return {
    generated_at: new Date().toISOString(),
    warn_hours: metadata.warnHours,
    filters: {
      platform: metadata.platform,
      label: metadata.label,
      account_type: metadata.accountType,
      include_inactive: metadata.includeInactive,
      limit_single_platform: Boolean(!metadata.all && metadata.platform && !metadata.label)
    },
    results: report.map((entry) => ({
      id: entry.token.id,
      platform: entry.token.platform,
      account_label: entry.token.account_label,
      account_type: entry.token.account_type,
      is_active: entry.token.is_active === 1,
      owner_curator_id: entry.token.owner_curator_id,
      expires_at: entry.token.expires_at,
      expires_in_ms: entry.expiresInMs,
      refresh_expires_at: entry.token.refresh_expires_at,
      last_validated_at: entry.token.last_validated_at,
      stored_health_status: entry.storedStatus,
      derived_health_status: entry.derivedStatus,
      final_health_status: entry.finalStatus,
      severity: entry.severity,
      notes: entry.notes,
      scopes: entry.userInfo?.scopes ?? null,
      email: entry.userInfo?.email ?? null
    }))
  };
}

async function main() {
  try {
    const options = parseArgs();

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🔍 Flowerpil DSP Token Health Check');
    console.log('═══════════════════════════════════════════════════════════\n');

    const tokens = fetchTokens(options);

    if (!tokens.length) {
      const scope = options.label
        ? `label "${options.label}"`
        : options.platform
          ? `${options.platform.toUpperCase()}`
          : 'active tokens';

      const message = `No tokens found for ${scope}. Run: npx ts-node scripts/dsp/setup-token.ts`;
      if (options.json) {
        console.log(JSON.stringify({ error: message }, null, 2));
      } else {
        console.error(colorize(`❌ ${message}`, colors.red, options.color));
      }
      process.exit(1);
    }

    const report = tokens.map((token) => classifyToken(token, options.warnHours));

    if (options.json) {
      console.log(JSON.stringify(toJson(report, options), null, 2));
    } else {
      report.forEach((entry) => renderToken(entry, options));
      renderSummary(report, options);
      console.log('Next steps:');
      console.log('  • Rotate expiring tokens via setup-token.ts');
      console.log('  • Run scripts/dsp/scheduled-health-check.js via PM2 for continuous monitoring\n');
    }

    const exitCode = determineExitCode(report);
    process.exit(exitCode);
  } catch (error) {
    if (error.message && /invalid|unknown|missing/i.test(error.message)) {
      console.error(colorize(`❌ ${error.message}`, colors.red, true));
      console.error('');
      displayHelp();
      process.exit(2);
    }

    console.error('');
    console.error('❌ Token health check failed:');
    console.error(error?.stack || error?.message || error);
    console.error('');
    process.exit(3);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

