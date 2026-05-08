#!/usr/bin/env node

/**
 * Flowerpil Admin CLI Dashboard
 *
 * Provides system statistics and administrative functions for production management
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path
const DB_PATH = process.env.DATABASE_PATH || join(__dirname, '../../data/flowerpil.db');

// Colors for CLI output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
};

// Helper functions
const c = (color, text) => `${colors[color]}${text}${colors.reset}`;
const header = (text) => `\n${c('bgBlue', c('white', ` ${text} `))}`;
const stat = (label, value) => `  ${c('cyan', label.padEnd(35))} ${c('bright', value)}`;
const error = (text) => `${c('red', '✗')} ${text}`;
const success = (text) => `${c('green', '✓')} ${text}`;
const info = (text) => `${c('blue', 'ℹ')} ${text}`;
const warn = (text) => `${c('yellow', '⚠')} ${text}`;

// Initialize database connection
function getDatabase() {
  try {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    return db;
  } catch (err) {
    console.error(error(`Failed to connect to database at ${DB_PATH}`));
    console.error(err.message);
    process.exit(1);
  }
}

// Fetch database statistics
function getDatabaseStats(db) {
  try {
    const stats = {
      curators: db.prepare('SELECT COUNT(*) as count FROM curators').get().count,
      publishedPlaylists: db.prepare('SELECT COUNT(*) as count FROM playlists WHERE published = 1').get().count,
      activeTracks: db.prepare('SELECT COUNT(*) as count FROM tracks').get().count,
      adminUsers: db.prepare('SELECT COUNT(*) as count FROM admin_users WHERE is_active = 1').get().count,
      totalAdminUsers: db.prepare('SELECT COUNT(*) as count FROM admin_users').get().count,
      pendingExports: db.prepare('SELECT COUNT(*) as count FROM export_requests WHERE status IN (\'pending\', \'in_progress\')').get().count,
      unusedReferrals: db.prepare('SELECT COUNT(*) as count FROM curator_referrals WHERE status = \'unused\'').get().count,
      usedReferrals: db.prepare('SELECT COUNT(*) as count FROM curator_referrals WHERE status = \'used\'').get().count
    };
    return stats;
  } catch (err) {
    console.error(error('Failed to fetch database statistics'));
    console.error(err.message);
    return null;
  }
}

// Display dashboard statistics
async function displayDashboard() {
  const db = getDatabase();

  console.clear();
  console.log(header(' FLOWERPIL PRODUCTION DASHBOARD '));
  console.log(c('dim', `  Database: ${DB_PATH}`));
  console.log();

  // Database Statistics
  console.log(c('bright', '📊 SYSTEM STATISTICS'));
  console.log();
  const stats = getDatabaseStats(db);

  if (stats) {
    console.log(stat('Curator Accounts:', stats.curators.toString()));
    console.log(stat('Published Playlists:', stats.publishedPlaylists.toString()));
    console.log(stat('Active Tracks:', stats.activeTracks.toString()));
    console.log(stat('Admin Users (Active/Total):', `${stats.adminUsers}/${stats.totalAdminUsers}`));
    console.log(stat('Pending Export Requests:', stats.pendingExports.toString()));
    console.log(stat('Referral Codes (Unused/Used):', `${stats.unusedReferrals}/${stats.usedReferrals}`));
  }

  console.log();
  db.close();
}

// Create readline interface
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Prompt user for input
function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Generate referral code
function generateReferralCode(length = 14) {
  return crypto.randomBytes(Math.ceil(length * 0.75))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, length)
    .toUpperCase();
}

// Admin function: Generate referral code
async function generateReferral() {
  const db = getDatabase();
  const rl = createPrompt();

  try {
    console.log();
    console.log(c('bright', '🎫 GENERATE REFERRAL CODE'));
    console.log();

    const email = await question(rl, c('cyan', 'Email address: '));
    if (!email || !email.includes('@')) {
      console.log(error('Invalid email address'));
      rl.close();
      db.close();
      return;
    }

    const curatorName = await question(rl, c('cyan', 'Curator name (or press Enter for "Pending"): '));
    const curatorType = await question(rl, c('cyan', 'Curator type (default: curator): '));

    const code = generateReferralCode();
    const name = curatorName.trim() || 'Pending';
    const type = curatorType.trim() || 'curator';

    const query = db.prepare(`
      INSERT INTO curator_referrals (code, curator_name, curator_type, email, issued_by_user_id, status)
      VALUES (?, ?, ?, ?, NULL, 'unused')
    `);

    query.run(code, name, type, email);

    console.log();
    console.log(success('Referral code generated successfully!'));
    console.log();
    console.log(`  ${c('bright', 'Code:')} ${c('green', code)}`);
    console.log(`  ${c('dim', 'Email:')} ${email}`);
    console.log(`  ${c('dim', 'Curator:')} ${name} (${type})`);
    console.log();
    console.log(c('dim', `  Share URL: https://flowerpil.io/signup?ref=${code}`));
    console.log();

  } catch (err) {
    console.log(error('Failed to generate referral code'));
    console.error(err.message);
  } finally {
    rl.close();
    db.close();
  }
}

// Admin function: Change password for an account
async function changePassword() {
  const db = getDatabase();
  const rl = createPrompt();

  try {
    console.log();
    console.log(c('bright', '🔐 CHANGE ACCOUNT PASSWORD'));
    console.log();

    const username = await question(rl, c('cyan', 'Username: '));

    const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    if (!user) {
      console.log(error(`User "${username}" not found`));
      rl.close();
      db.close();
      return;
    }

    console.log(info(`Found: ${user.username} (${user.role})`));
    console.log();

    const newPassword = await question(rl, c('cyan', 'New password (min 8 characters): '));

    if (newPassword.length < 8) {
      console.log(error('Password must be at least 8 characters long'));
      rl.close();
      db.close();
      return;
    }

    const confirm = await question(rl, c('yellow', 'Confirm password change? (yes/no): '));
    if (confirm.toLowerCase() !== 'yes') {
      console.log(info('Password change cancelled'));
      rl.close();
      db.close();
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    db.prepare('UPDATE admin_users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?')
      .run(passwordHash, user.id);

    console.log();
    console.log(success(`Password updated for ${username}`));
    console.log();

  } catch (err) {
    console.log(error('Failed to change password'));
    console.error(err.message);
  } finally {
    rl.close();
    db.close();
  }
}

// Admin function: Reset passwords for all accounts
async function resetAllPasswords() {
  const db = getDatabase();
  const rl = createPrompt();

  try {
    console.log();
    console.log(c('red', c('bright', '⚠️  RESET ALL PASSWORDS')));
    console.log();
    console.log(c('yellow', 'WARNING: This will generate new random passwords for ALL admin accounts!'));
    console.log();

    const confirm = await question(rl, c('red', 'Type "RESET ALL" to confirm: '));
    if (confirm !== 'RESET ALL') {
      console.log(info('Operation cancelled'));
      rl.close();
      db.close();
      return;
    }

    const users = db.prepare('SELECT id, username, role FROM admin_users').all();
    console.log();
    console.log(info(`Found ${users.length} admin account(s)`));
    console.log();

    const newPasswords = [];

    for (const user of users) {
      // Generate random password (16 chars, alphanumeric + symbols)
      const randomPassword = crypto.randomBytes(16).toString('base64').slice(0, 16);
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      db.prepare('UPDATE admin_users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?')
        .run(passwordHash, user.id);

      newPasswords.push({
        username: user.username,
        role: user.role,
        password: randomPassword
      });

      console.log(success(`Reset: ${user.username}`));
    }

    console.log();
    console.log(c('bright', '📋 NEW PASSWORDS'));
    console.log(c('dim', '─'.repeat(70)));

    for (const item of newPasswords) {
      console.log(`  ${c('cyan', item.username.padEnd(25))} ${c('green', item.password.padEnd(20))} ${c('dim', `(${item.role})`)}`);
    }

    console.log(c('dim', '─'.repeat(70)));
    console.log();
    console.log(c('yellow', '⚠️  Save these passwords securely! They cannot be recovered.'));
    console.log();

  } catch (err) {
    console.log(error('Failed to reset passwords'));
    console.error(err.message);
  } finally {
    rl.close();
    db.close();
  }
}

// Admin function: Database analysis
async function databaseAnalysis() {
  const db = getDatabase();
  const rl = createPrompt();

  try {
    console.log();
    console.log(c('bright', '🔍 DATABASE ANALYSIS'));
    console.log();

    // Table sizes
    console.log(c('bright', '📊 TABLE SIZES'));
    console.log();

    const tables = [
      'curators', 'playlists', 'tracks', 'admin_users',
      'curator_referrals', 'export_requests', 'oauth_tokens',
      'user_content_flags', 'users', 'saved_tracks', 'lists'
    ];

    for (const table of tables) {
      try {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
        console.log(stat(table, count.toString()));
      } catch (err) {
        console.log(stat(table, c('dim', 'N/A')));
      }
    }

    // Content health metrics
    console.log();
    console.log(c('bright', '🏥 CONTENT HEALTH'));
    console.log();

    const tracksNoDSP = db.prepare(`
      SELECT COUNT(*) as count FROM tracks
      WHERE spotify_id IS NULL AND apple_id IS NULL AND tidal_id IS NULL
    `).get().count;
    console.log(stat('Tracks without DSP links:', tracksNoDSP.toString()));

    const tracksNoPreview = db.prepare(`
      SELECT COUNT(*) as count FROM tracks
      WHERE preview_url IS NULL AND deezer_preview_url IS NULL
    `).get().count;
    console.log(stat('Tracks without preview:', tracksNoPreview.toString()));

    try {
      const unresolvedFlags = db.prepare(`
        SELECT COUNT(*) as count FROM user_content_flags WHERE status = 'unresolved'
      `).get().count;
      console.log(stat('Unresolved user flags:', unresolvedFlags.toString()));

      const failedExports = db.prepare(`
        SELECT COUNT(*) as count FROM export_requests WHERE status = 'failed'
      `).get().count;
      console.log(stat('Failed export requests:', failedExports.toString()));
    } catch (err) {
      // Tables might not exist
    }

    // Curator insights
    console.log();
    console.log(c('bright', '👥 CURATOR INSIGHTS'));
    console.log();

    const topCurators = db.prepare(`
      SELECT curator_name, COUNT(*) as playlist_count
      FROM playlists
      WHERE published = 1
      GROUP BY curator_name
      ORDER BY playlist_count DESC
      LIMIT 5
    `).all();

    console.log('  Top 5 Curators by Playlist Count:');
    topCurators.forEach((curator, idx) => {
      console.log(`    ${c('cyan', (idx + 1) + '.')} ${curator.curator_name.padEnd(30)} ${c('bright', curator.playlist_count)} playlists`);
    });

    // Playlist insights
    console.log();
    console.log(c('bright', '🎵 PLAYLIST INSIGHTS'));
    console.log();

    const avgTracksPerPlaylist = db.prepare(`
      SELECT AVG(track_count) as avg FROM (
        SELECT COUNT(*) as track_count FROM tracks GROUP BY playlist_id
      )
    `).get().avg;
    console.log(stat('Average tracks per playlist:', Math.round(avgTracksPerPlaylist).toString()));

    const largestPlaylists = db.prepare(`
      SELECT p.title, p.curator_name, COUNT(t.id) as track_count
      FROM playlists p
      LEFT JOIN tracks t ON p.id = t.playlist_id
      WHERE p.published = 1
      GROUP BY p.id
      ORDER BY track_count DESC
      LIMIT 5
    `).all();

    console.log();
    console.log('  Largest Playlists:');
    largestPlaylists.forEach((pl, idx) => {
      console.log(`    ${c('cyan', (idx + 1) + '.')} ${pl.title.substring(0, 35).padEnd(35)} ${c('dim', '·')} ${c('bright', pl.track_count)} tracks ${c('dim', `(${pl.curator_name})`)}`);
    });

    // Recent activity
    console.log();
    console.log(c('bright', '📅 RECENT ACTIVITY'));
    console.log();

    const recentPlaylists = db.prepare(`
      SELECT title, curator_name, created_at
      FROM playlists
      WHERE published = 1
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    console.log('  Recently Created Playlists:');
    recentPlaylists.forEach((pl) => {
      const date = new Date(pl.created_at);
      const timeAgo = getTimeAgo(date);
      console.log(`    ${c('cyan', '•')} ${pl.title.substring(0, 35).padEnd(35)} ${c('dim', timeAgo)}`);
    });

    try {
      const recentLogins = db.prepare(`
        SELECT username, last_login
        FROM admin_users
        WHERE last_login IS NOT NULL
        ORDER BY last_login DESC
        LIMIT 5
      `).all();

      if (recentLogins.length > 0) {
        console.log();
        console.log('  Recent Admin Logins:');
        recentLogins.forEach((user) => {
          const date = new Date(user.last_login);
          const timeAgo = getTimeAgo(date);
          console.log(`    ${c('cyan', '•')} ${user.username.padEnd(20)} ${c('dim', timeAgo)}`);
        });
      }
    } catch (err) {
      // Skip if column doesn't exist
    }

    // Data quality
    console.log();
    console.log(c('bright', '✅ DATA QUALITY'));
    console.log();

    const playlistsNoImage = db.prepare(`
      SELECT COUNT(*) as count FROM playlists WHERE published = 1 AND (image IS NULL OR image = '')
    `).get().count;
    console.log(stat('Published playlists without image:', playlistsNoImage.toString()));

    const curatorsNoBio = db.prepare(`
      SELECT COUNT(*) as count FROM curators WHERE bio IS NULL OR bio = ''
    `).get().count;
    console.log(stat('Curators without bio:', curatorsNoBio.toString()));

    const playlistsNoDescription = db.prepare(`
      SELECT COUNT(*) as count FROM playlists WHERE published = 1 AND (description IS NULL OR description = '')
    `).get().count;
    console.log(stat('Published playlists without description:', playlistsNoDescription.toString()));

    // Database size
    console.log();
    console.log(c('bright', '💾 DATABASE FILE'));
    console.log();

    const fs = await import('fs');
    try {
      const stats = fs.statSync(DB_PATH);
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(stat('Database file size:', `${sizeInMB} MB`));
      console.log(stat('Last modified:', new Date(stats.mtime).toLocaleString()));
    } catch (err) {
      console.log(stat('Database file size:', c('dim', 'Unable to read')));
    }

    console.log();

  } catch (err) {
    console.log(error('Failed to perform database analysis'));
    console.error(err.message);
  } finally {
    rl.close();
    db.close();
  }

  const rl2 = createPrompt();
  await question(rl2, c('dim', '\nPress Enter to continue...'));
  rl2.close();
}

// Helper function to get human-readable time ago
function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

// Admin function: Clear stale tokens
async function clearStaleTokens() {
  const db = getDatabase();
  const rl = createPrompt();

  try {
    console.log();
    console.log(c('bright', '🧹 CLEAR STALE TOKENS'));
    console.log();

    // Check for expired OAuth tokens
    const expiredOAuth = db.prepare(`
      SELECT COUNT(*) as count FROM oauth_tokens
      WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')
    `).get().count;

    // Check for expired CSRF tokens
    let expiredCSRF = 0;
    try {
      expiredCSRF = db.prepare(`
        SELECT COUNT(*) as count FROM csrf_tokens
        WHERE datetime(expires_at) < datetime('now')
      `).get().count;
    } catch (err) {
      // CSRF tokens table might not exist
    }

    // Check for old email codes
    let expiredCodes = 0;
    try {
      expiredCodes = db.prepare(`
        SELECT COUNT(*) as count FROM email_codes
        WHERE datetime(expires_at) < datetime('now')
      `).get().count;
    } catch (err) {
      // Email codes table might not exist
    }

    console.log(info(`Found ${expiredOAuth} expired OAuth tokens`));
    if (expiredCSRF > 0) {
      console.log(info(`Found ${expiredCSRF} expired CSRF tokens`));
    }
    if (expiredCodes > 0) {
      console.log(info(`Found ${expiredCodes} expired email codes`));
    }

    const total = expiredOAuth + expiredCSRF + expiredCodes;

    if (total === 0) {
      console.log();
      console.log(success('No stale tokens found!'));
      console.log();
      rl.close();
      db.close();
      return;
    }

    console.log();
    const confirm = await question(rl, c('yellow', `Clear ${total} stale token(s)? (yes/no): `));
    if (confirm.toLowerCase() !== 'yes') {
      console.log(info('Operation cancelled'));
      rl.close();
      db.close();
      return;
    }

    // Clear expired OAuth tokens
    const oauthResult = db.prepare(`
      DELETE FROM oauth_tokens
      WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')
    `).run();

    // Clear expired CSRF tokens
    let csrfResult = { changes: 0 };
    try {
      csrfResult = db.prepare(`
        DELETE FROM csrf_tokens
        WHERE datetime(expires_at) < datetime('now')
      `).run();
    } catch (err) {
      // Skip if table doesn't exist
    }

    // Clear expired email codes
    let codesResult = { changes: 0 };
    try {
      codesResult = db.prepare(`
        DELETE FROM email_codes
        WHERE datetime(expires_at) < datetime('now')
      `).run();
    } catch (err) {
      // Skip if table doesn't exist
    }

    console.log();
    console.log(success(`Cleared ${oauthResult.changes} OAuth token(s)`));
    if (csrfResult.changes > 0) {
      console.log(success(`Cleared ${csrfResult.changes} CSRF token(s)`));
    }
    if (codesResult.changes > 0) {
      console.log(success(`Cleared ${codesResult.changes} email code(s)`));
    }
    console.log();

  } catch (err) {
    console.log(error('Failed to clear stale tokens'));
    console.error(err.message);
  } finally {
    rl.close();
    db.close();
  }
}

// Admin function: Logout all accounts
async function logoutAllAccounts() {
  const db = getDatabase();
  const rl = createPrompt();

  try {
    console.log();
    console.log(c('bright', '🚪 LOGOUT ALL ACCOUNTS'));
    console.log();
    console.log(c('yellow', 'This will force all users to re-authenticate on their next request.'));
    console.log(c('dim', 'Note: Active JWT tokens will be invalidated via account lock mechanism.'));
    console.log();

    const confirm = await question(rl, c('yellow', 'Proceed? (yes/no): '));
    if (confirm.toLowerCase() !== 'yes') {
      console.log(info('Operation cancelled'));
      rl.close();
      db.close();
      return;
    }

    // Set a temporary lock (1 second) to trigger auth middleware rejection
    // This forces re-authentication without permanently locking accounts
    const result = db.prepare(`
      UPDATE admin_users
      SET locked_until = datetime('now', '+1 second')
      WHERE is_active = 1
    `).run();

    console.log();
    console.log(success(`Invalidated sessions for ${result.changes} account(s)`));
    console.log(info('All users must re-authenticate on their next request'));
    console.log();

  } catch (err) {
    console.log(error('Failed to logout accounts'));
    console.error(err.message);
  } finally {
    rl.close();
    db.close();
  }
}

// Display interactive menu
async function showMenu() {
  const rl = createPrompt();

  console.log();
  console.log(c('bright', '⚙️  ADMIN FUNCTIONS'));
  console.log();
  console.log(`  ${c('cyan', '1.')} Generate referral code for email`);
  console.log(`  ${c('cyan', '2.')} Change password for an account`);
  console.log(`  ${c('cyan', '3.')} Reset passwords for all accounts`);
  console.log(`  ${c('cyan', '4.')} Logout all accounts`);
  console.log(`  ${c('cyan', '5.')} Database analysis (verbose)`);
  console.log(`  ${c('cyan', '6.')} Clear stale tokens`);
  console.log(`  ${c('cyan', '7.')} Refresh dashboard`);
  console.log(`  ${c('cyan', '0.')} Exit`);
  console.log();

  const choice = await question(rl, c('green', 'Select option: '));
  rl.close();

  switch (choice) {
    case '1':
      await generateReferral();
      break;
    case '2':
      await changePassword();
      break;
    case '3':
      await resetAllPasswords();
      break;
    case '4':
      await logoutAllAccounts();
      break;
    case '5':
      await databaseAnalysis();
      await displayDashboard();
      await showMenu();
      return;
    case '6':
      await clearStaleTokens();
      break;
    case '7':
      await displayDashboard();
      await showMenu();
      return;
    case '0':
      console.log();
      console.log(c('dim', 'Goodbye!'));
      console.log();
      process.exit(0);
    default:
      console.log(error('Invalid option'));
      await showMenu();
      return;
  }

  // After operation, show menu again
  const rl2 = createPrompt();
  await question(rl2, c('dim', '\nPress Enter to continue...'));
  rl2.close();

  await displayDashboard();
  await showMenu();
}

// Main entry point
async function main() {
  try {
    await displayDashboard();
    await showMenu();
  } catch (err) {
    console.error(error('Fatal error:'));
    console.error(err);
    process.exit(1);
  }
}

// Run the dashboard
main().catch(console.error);
