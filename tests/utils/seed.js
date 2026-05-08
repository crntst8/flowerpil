/**
 * Database Seeding Utilities for Tests
 *
 * Provides functions to create test data in the database.
 * All functions use the transaction rollback pattern - data is automatically
 * cleaned up after each test via the rollback in setup.backend.js
 */

import { getDatabase, getQueries } from '../../server/database/db.js';
import { hashPassword } from '../../server/utils/authUtils.js';
import { hashCode } from '../../server/utils/emailService.js';

/**
 * Create a test curator with admin user account
 *
 * @param {Object} options - Curator options
 * @param {string} options.email - Email/username for login
 * @param {string} options.password - Plain text password (will be hashed)
 * @param {string} options.curatorName - Display name for curator
 * @param {string} options.curatorType - Type of curator (default: 'curator')
 * @returns {Promise<Object>} Created curator data with userId and curatorId
 *
 * @example
 * const curator = await seedTestCurator({
 *   email: 'test@example.com',
 *   password: 'TestPass123!',
 *   curatorName: 'Test Curator',
 *   curatorType: 'dj'
 * });
 */
export async function seedTestCurator({
  email,
  password = 'TestPass123!',
  curatorName,
  curatorType = 'curator',
  tester = false,
  isActive = true,
  failedLoginAttempts = 0,
  lockedUntil = null
}) {
  const queries = getQueries();
  const db = getDatabase();
  const passwordHash = await hashPassword(password);

  // Generate unique curator name if not provided (prevents UNIQUE constraint failures)
  const uniqueCuratorName = curatorName || `Test Curator ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Create admin user with curator role
  const userResult = queries.createAdminUser.run(
    email,
    passwordHash,
    'curator',
    isActive ? 1 : 0
  );
  const userId = Number(userResult.lastInsertRowid);

  // Set failed attempts and lock if specified
  if (failedLoginAttempts > 0 || lockedUntil) {
    db.prepare(`
      UPDATE admin_users
      SET failed_login_attempts = ?, locked_until = ?
      WHERE id = ?
    `).run(failedLoginAttempts, lockedUntil, userId);
  }

  // Create curator profile
  const curatorResult = queries.insertCurator.run(
    uniqueCuratorName,
    curatorType,
    curatorType, // profile_type
    tester ? 1 : 0,
    '', // bio
    '', // bio_short
    '', // profile_image
    null, // location
    '', // website_url
    '', // contact_email
    '', // spotify_url
    '', // apple_url
    '', // tidal_url
    '', // bandcamp_url
    '', // social_links
    '', // external_links
    'verified',
    'public',
    0, // upcoming_releases_enabled
    0, // upcoming_shows_enabled
    'not_yet_implemented', // dsp_implementation_status
    '' // custom_fields
  );
  const curatorId = Number(curatorResult.lastInsertRowid);

  // Link admin user to curator
  queries.setCuratorId.run(curatorId, userId);

  return {
    userId,
    curatorId,
    email,
    password, // Return plain password for test login
    curatorName: uniqueCuratorName,
    curatorType,
    tester: tester ? true : false
  };
}

/**
 * Create a test referral code
 *
 * @param {Object} options - Referral options
 * @param {string} options.code - Referral code (default: auto-generated)
 * @param {string} options.email - Email associated with referral
 * @param {string} options.curatorName - Curator name for referral
 * @param {string} options.curatorType - Curator type
 * @param {number} options.issuedBy - User ID who issued the referral (optional)
 * @returns {Object} Created referral data
 *
 * @example
 * const referral = seedTestReferral({
 *   code: 'TEST123',
 *   email: 'newcurator@example.com',
 *   curatorName: 'New Curator',
 *   curatorType: 'label'
 * });
 */
export function seedTestReferral({
  code = `TEST-${Date.now()}`,
  email,
  curatorName = 'New Curator',
  curatorType = 'curator',
  issuedBy = null
}) {
  const queries = getQueries();

  const result = queries.createReferral.run(
    code,
    curatorName,
    curatorType,
    email,
    issuedBy,
    null // issued_by_curator_id
  );

  return {
    id: Number(result.lastInsertRowid),
    code,
    email,
    curatorName,
    curatorType,
    status: 'unused'
  };
}

/**
 * Create a test user (non-curator, regular user account)
 *
 * @param {Object} options - User options
 * @param {string} options.email - User email
 * @param {string} options.username - Username (optional)
 * @param {string} options.password - Plain text password
 * @returns {Promise<Object>} Created user data
 *
 * @example
 * const user = await seedTestUser({
 *   email: 'user@example.com',
 *   username: 'testuser',
 *   password: 'UserPass123!'
 * });
 */
export async function seedTestUser({
  email,
  username = null,
  password = 'TestPass123!'
}) {
  const queries = getQueries();
  const passwordHash = await hashPassword(password);

  const result = queries.createUser.run(
    email,
    username,
    passwordHash,
    null, // display_name
    null, // bio
    0 // is_private_saved
  );

  return {
    id: Number(result.lastInsertRowid),
    email,
    username,
    password // Return plain password for test login
  };
}

/**
 * Create a test verification code for email verification
 *
 * @param {Object} options - Code options
 * @param {number} options.userId - User ID for verification
 * @param {string} options.code - 6-digit verification code
 * @param {string} options.purpose - Purpose (signup, verify_email, etc.)
 * @param {number} options.expiresInMinutes - Expiry time in minutes (default: 10)
 * @returns {Object} Created code data
 *
 * @example
 * const verificationCode = seedTestEmailCode({
 *   userId: 1,
 *   code: '123456',
 *   purpose: 'signup'
 * });
 */
export function seedTestEmailCode({
  userId,
  code = '123456',
  purpose = 'signup',
  expiresInMinutes = 10
}) {
  const queries = getQueries();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

  const result = queries.createEmailCode.run(
    userId,
    codeHash,
    purpose,
    expiresAt
  );

  return {
    id: Number(result.lastInsertRowid),
    userId,
    code, // Return plain code for testing
    codeHash,
    purpose,
    expiresAt
  };
}

/**
 * Create a test playlist with tracks
 *
 * @param {Object} options - Playlist options
 * @param {number} options.curatorId - Curator ID who owns the playlist
 * @param {string} options.curatorName - Curator name
 * @param {string} options.title - Playlist title
 * @param {number} options.trackCount - Number of tracks to generate (default: 10)
 * @param {boolean} options.published - Whether playlist is published
 * @returns {Object} Created playlist data with tracks
 *
 * @example
 * const playlist = seedTestPlaylist({
 *   curatorId: 1,
 *   curatorName: 'Test Curator',
 *   title: 'Test Playlist',
 *   trackCount: 5,
 *   published: true
 * });
 */
export function seedTestPlaylist({
  curatorId,
  curatorName = 'Test Curator',
  title = 'Test Playlist',
  trackCount = 10,
  published = false
}) {
  const db = getDatabase();

  // Create playlist
  const playlistResult = db.prepare(`
    INSERT INTO playlists (title, curator_id, curator_name, description, published, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(title, curatorId, curatorName, 'Test playlist description', published ? 1 : 0);

  const playlistId = Number(playlistResult.lastInsertRowid);

  // Create tracks
  const trackInsert = db.prepare(`
    INSERT INTO tracks (playlist_id, position, title, artist, album, duration, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const tracks = [];
  for (let i = 0; i < trackCount; i++) {
    const trackResult = trackInsert.run(
      playlistId,
      i,
      `Test Track ${i + 1}`,
      `Test Artist ${i + 1}`,
      'Test Album',
      '3:45'
    );
    tracks.push({
      id: Number(trackResult.lastInsertRowid),
      position: i,
      title: `Test Track ${i + 1}`,
      artist: `Test Artist ${i + 1}`
    });
  }

  return {
    id: playlistId,
    title,
    curatorId,
    curatorName,
    published,
    trackCount,
    tracks
  };
}

/**
 * Seed DSP IDs onto existing playlist tracks for export tests.
 */
export function seedTrackDspIds(playlistId, { spotify = true, tidal = true } = {}) {
  const db = getDatabase();
  const tracks = db.prepare('SELECT id FROM tracks WHERE playlist_id = ? ORDER BY position').all(playlistId);
  for (const track of tracks) {
    if (spotify) {
      db.prepare('UPDATE tracks SET spotify_id = ? WHERE id = ?').run(`sp-${track.id}`, track.id);
    }
    if (tidal) {
      db.prepare('UPDATE tracks SET tidal_id = ? WHERE id = ?').run(`${1000 + track.id}`, track.id);
    }
  }
  return tracks.length;
}

/**
 * Create a password reset token for a user
 *
 * @param {number} userId - User ID
 * @param {string} userType - User type ('admin' or 'user')
 * @returns {Promise<string>} The plain token (not hashed)
 */
export async function createResetToken(userId, userType = 'admin') {
  const crypto = await import('crypto');
  const db = getDatabase();

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  db.prepare(`
    INSERT INTO password_reset_tokens (user_id, user_type, token_hash, requested_ip, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(userId, userType, tokenHash, '127.0.0.1', expiresAt);

  return token;
}

/**
 * Create an expired password reset token
 *
 * @param {number} userId - User ID
 * @param {string} userType - User type ('admin' or 'user')
 * @returns {Promise<string>} The plain token (not hashed)
 */
export async function createExpiredResetToken(userId, userType = 'admin') {
  const crypto = await import('crypto');
  const db = getDatabase();

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() - 1000).toISOString(); // Already expired

  db.prepare(`
    INSERT INTO password_reset_tokens (user_id, user_type, token_hash, requested_ip, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(userId, userType, tokenHash, '127.0.0.1', expiresAt);

  return token;
}

/**
 * Get user from database by ID
 *
 * @param {number} userId - User ID
 * @returns {Object} User object
 */
export function getUserFromDb(userId) {
  const queries = getQueries();
  return queries.findAdminUserById.get(userId);
}

/**
 * Clean up all test data (NOTE: Only needed for non-transactional tests)
 * When using transaction rollback pattern, cleanup is automatic
 *
 * @returns {void}
 */
export function cleanupTestData() {
  const db = getDatabase();

  // Delete in correct order to avoid FK violations
  const tables = [
    'tracks',
    'playlists',
    'email_codes',
    'password_reset_tokens',
    'curator_referrals',
    'curators',
    'admin_users',
    'users',
    'csrf_tokens',
    'failed_login_attempts',
    'security_events'
  ];

  for (const table of tables) {
    try {
      db.prepare(`DELETE FROM ${table}`).run();
    } catch (error) {
      // Table might not exist, ignore
    }
  }
}
