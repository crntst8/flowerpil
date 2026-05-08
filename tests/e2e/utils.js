/**
 * E2E Test Utilities
 *
 * Helper functions for Playwright E2E tests including:
 * - Authentication (login, logout)
 * - Test data seeding and cleanup
 * - Common page interactions
 * - Database utilities
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path - use dev DB (E2E tests run against dev server)
const DB_PATH = path.join(__dirname, '../../data/flowerpil.db');

/**
 * Get database connection
 * @returns {Database.Database} SQLite database instance
 */
export function getTestDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

/**
 * Login as a curator via the UI
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} credentials - Login credentials
 * @param {string} credentials.username - Username or email
 * @param {string} credentials.password - Plain text password
 * @returns {Promise<void>}
 */
export async function loginAsCurator(page, { username, password }) {
  // Navigate to curator login page
  await page.goto('/curator-admin/login');

  // Wait for login form to be visible
  await page.waitForSelector('input[name="username"]', { state: 'visible' });

  // Fill in credentials
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for navigation to complete (should redirect to curator dashboard)
  await page.waitForURL('**/curator-admin', { timeout: 10000 });

  // Give a moment for auth state to settle
  await page.waitForTimeout(500);
}

/**
 * Seed a test referral code in the database
 *
 * @param {Object} options - Referral options
 * @param {string} options.email - Email address for the referral
 * @param {string} [options.referralCode] - Referral code (auto-generated if not provided)
 * @param {string} [options.curatorType='dj'] - Type of curator (dj, radio, blog, etc.)
 * @param {string} [options.referrerName='Test Referrer'] - Name of the person who created the referral
 * @returns {Promise<Object>} Created referral with {id, code, email, curatorType}
 */
export async function seedTestReferral({
  email,
  referralCode,
  curatorType = 'dj',
  referrerName = 'Test Referrer'
}) {
  const db = getTestDb();

  const code = referralCode || crypto.randomBytes(8).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  const result = db.prepare(`
    INSERT INTO curator_referrals (
      code,
      email,
      curator_type,
      referrer_name,
      expires_at,
      is_used,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
  `).run(code, email, curatorType, referrerName, expiresAt);

  db.close();

  return {
    id: result.lastInsertRowid,
    code,
    email,
    curatorType,
    referrerName
  };
}

/**
 * Seed a test curator account with full profile
 *
 * @param {Object} options - Curator options
 * @param {string} options.email - Email address (stored in referral, used for matching)
 * @param {string} options.username - Username for login
 * @param {string} options.password - Plain text password (will be hashed)
 * @param {string} [options.curatorName] - Display name for curator
 * @param {string} [options.curatorType='dj'] - Type of curator
 * @param {string} [options.referralCode] - Associated referral code
 * @returns {Promise<Object>} Created curator with credentials
 */
export async function seedTestCurator({
  email,
  username,
  password,
  curatorName,
  curatorType = 'dj',
  referralCode
}) {
  const db = getTestDb();

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create curator profile first
  const curatorResult = db.prepare(`
    INSERT INTO curators (
      name,
      type,
      bio,
      location,
      contact_email,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(
    curatorName || `${username} Curator`,
    curatorType,
    `Test curator bio for ${username}`,
    'Test City, TC',
    email
  );

  const curatorId = curatorResult.lastInsertRowid;

  // Create admin user account linked to curator
  const adminUserResult = db.prepare(`
    INSERT INTO admin_users (
      username,
      password_hash,
      role,
      is_active,
      curator_id,
      created_at
    )
    VALUES (?, ?, 'curator', 1, ?, datetime('now'))
  `).run(username, hashedPassword, curatorId);

  const adminUserId = adminUserResult.lastInsertRowid;

  // If referral code provided, mark it as used
  if (referralCode) {
    db.prepare(`
      UPDATE curator_referrals
      SET is_used = 1, used_by = ?, used_at = datetime('now')
      WHERE code = ?
    `).run(email, referralCode);
  }

  db.close();

  return {
    adminUserId,
    curatorId,
    email,
    username,
    password, // Return plain password for login tests
    curatorName: curatorName || `${username} Curator`,
    curatorType
  };
}

/**
 * Seed a test playlist
 *
 * @param {Object} options - Playlist options
 * @param {number} options.curatorId - Curator ID who owns the playlist
 * @param {string} [options.title='Test Playlist'] - Playlist title
 * @param {string} [options.description] - Playlist description
 * @param {number} [options.trackCount=5] - Number of tracks to add
 * @returns {Promise<Object>} Created playlist with tracks
 */
export async function seedTestPlaylist({
  curatorId,
  title = 'Test Playlist',
  description = 'A test playlist for E2E testing',
  trackCount = 5
}) {
  const db = getTestDb();

  // Create playlist
  const playlistResult = db.prepare(`
    INSERT INTO playlists (
      curator_id,
      title,
      description,
      status,
      created_at
    )
    VALUES (?, ?, ?, 'published', datetime('now'))
  `).run(curatorId, title, description);

  const playlistId = playlistResult.lastInsertRowid;

  // Add tracks
  const tracks = [];
  for (let i = 0; i < trackCount; i++) {
    const trackResult = db.prepare(`
      INSERT INTO tracks (
        title,
        artist,
        album,
        duration,
        isrc,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(
      `Test Track ${i + 1}`,
      `Test Artist ${i + 1}`,
      `Test Album`,
      180 + (i * 10), // 3:00 to 3:40
      `TEST${String(i).padStart(10, '0')}`
    );

    const trackId = trackResult.lastInsertRowid;

    // Link track to playlist
    db.prepare(`
      INSERT INTO playlist_tracks (
        playlist_id,
        track_id,
        position,
        created_at
      )
      VALUES (?, ?, ?, datetime('now'))
    `).run(playlistId, trackId, i);

    tracks.push({
      id: trackId,
      title: `Test Track ${i + 1}`,
      artist: `Test Artist ${i + 1}`,
      position: i
    });
  }

  db.close();

  return {
    id: playlistId,
    curatorId,
    title,
    description,
    tracks
  };
}

/**
 * Clean up test data from the database
 *
 * Removes all test data created during E2E tests.
 * Safe to run after each test or test suite.
 *
 * @param {Object} [options] - Cleanup options
 * @param {boolean} [options.all=false] - If true, wipe entire test database
 * @param {string[]} [options.emails] - Specific emails to clean up
 * @param {string[]} [options.usernames] - Specific usernames to clean up
 * @returns {Promise<void>}
 */
export async function cleanupTestData(options = {}) {
  const db = getTestDb();

  if (options.all) {
    // Wipe everything (for teardown)
    const tables = [
      'playlist_tracks',
      'tracks',
      'playlists',
      'curator_referrals',
      'curators',
      'admin_users',
      'users',
      'email_verification_codes',
      'csrf_tokens'
    ];

    for (const table of tables) {
      try {
        db.prepare(`DELETE FROM ${table} WHERE 1=1`).run();
      } catch (err) {
        // Table might not exist, that's okay
        console.warn(`Could not clean table ${table}:`, err.message);
      }
    }
  } else {
    // Targeted cleanup by username
    if (options.usernames && options.usernames.length > 0) {
      const placeholders = options.usernames.map(() => '?').join(',');

      // Get admin user IDs and their curator IDs
      const adminUsers = db.prepare(`
        SELECT id, curator_id FROM admin_users WHERE username IN (${placeholders})
      `).all(...options.usernames);

      const adminUserIds = adminUsers.map(u => u.id);
      const curatorIds = adminUsers.map(u => u.curator_id).filter(id => id);

      // Delete cascade
      if (curatorIds.length > 0) {
        const curatorPlaceholders = curatorIds.map(() => '?').join(',');

        // Get playlist IDs
        const playlists = db.prepare(`
          SELECT id FROM playlists WHERE curator_id IN (${curatorPlaceholders})
        `).all(...curatorIds);

        const playlistIds = playlists.map(p => p.id);

        if (playlistIds.length > 0) {
          const playlistPlaceholders = playlistIds.map(() => '?').join(',');

          // Delete playlist tracks
          db.prepare(`DELETE FROM playlist_tracks WHERE playlist_id IN (${playlistPlaceholders})`).run(...playlistIds);

          // Delete playlists
          db.prepare(`DELETE FROM playlists WHERE id IN (${playlistPlaceholders})`).run(...playlistIds);
        }

        // Delete curators
        db.prepare(`DELETE FROM curators WHERE id IN (${curatorPlaceholders})`).run(...curatorIds);
      }

      // Delete admin users
      if (adminUserIds.length > 0) {
        const adminIdPlaceholders = adminUserIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM admin_users WHERE id IN (${adminIdPlaceholders})`).run(...adminUserIds);
      }
    }

    // Cleanup by email (for referrals)
    if (options.emails && options.emails.length > 0) {
      const placeholders = options.emails.map(() => '?').join(',');
      // Delete referrals
      db.prepare(`DELETE FROM curator_referrals WHERE email IN (${placeholders})`).run(...options.emails);
    }
  }

  db.close();
}

/**
 * Wait for element and click
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {string} selector - CSS selector
 * @param {Object} [options] - Wait options
 * @returns {Promise<void>}
 */
export async function waitAndClick(page, selector, options = {}) {
  await page.waitForSelector(selector, { state: 'visible', ...options });
  await page.click(selector);
}

/**
 * Wait for element and fill
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {string} selector - CSS selector
 * @param {string} value - Value to fill
 * @param {Object} [options] - Wait options
 * @returns {Promise<void>}
 */
export async function waitAndFill(page, selector, value, options = {}) {
  await page.waitForSelector(selector, { state: 'visible', ...options });
  await page.fill(selector, value);
}

/**
 * Logout via UI
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @returns {Promise<void>}
 */
export async function logoutCurator(page) {
  // Click user menu (dev switcher in dev mode)
  await waitAndClick(page, 'button:has-text("👤"), [data-testid="user-menu"], .user-menu');

  // Click logout button
  await waitAndClick(page, '[data-testid="logout-button"], button:has-text("Logout")');

  // Wait for redirect to login page
  await page.waitForURL('**/curator-admin/login', { timeout: 5000 });
}
