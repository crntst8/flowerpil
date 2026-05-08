#!/usr/bin/env node

/**
 * Quick smoke test for auth and saved tracks
 * Tests database, queries, and auth flow without requiring email
 *
 * Run: node server/dev/testAuth.js
 */

// Load environment from ecosystem.config.cjs
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load ecosystem config
try {
  const ecosystemPath = join(__dirname, '../../ecosystem.config.cjs');
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const ecosystem = require(ecosystemPath);

  // Apply env vars from first app in ecosystem config
  if (ecosystem.apps && ecosystem.apps[0] && ecosystem.apps[0].env) {
    Object.assign(process.env, ecosystem.apps[0].env);
    console.log('✓ Loaded environment from ecosystem.config.cjs\n');
  }
} catch (error) {
  // Silently continue - env vars might be set another way
}

import { getQueries, getDatabase } from '../database/db.js';
import { hashPassword, verifyPassword, generateToken } from '../utils/authUtils.js';
import { generateVerificationCode, hashCode, verifyCodeHash } from '../utils/emailService.js';

console.log('🧪 Auth System Smoke Test\n');

const runTests = async () => {
  const queries = getQueries();
  const db = getDatabase();
  let passed = 0;
  let failed = 0;

  const test = async (name, fn) => {
    try {
      const result = await fn();
      if (result) {
        console.log(`✅ ${name}`);
        passed++;
      } else {
        console.log(`❌ ${name} - assertion failed`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${name} - ${error.message}`);
      failed++;
    }
  };

  // Test 1: Database tables exist
  await test('users table exists', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    return result !== undefined;
  });

  await test('email_codes table exists', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='email_codes'").get();
    return result !== undefined;
  });

  await test('saved_tracks table exists', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='saved_tracks'").get();
    return result !== undefined;
  });

  await test('track_links table exists', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='track_links'").get();
    return result !== undefined;
  });

  await test('lists table exists', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lists'").get();
    return result !== undefined;
  });

  // Test 2: Query helpers exist
  await test('createUser query exists', () => {
    return typeof queries.createUser === 'object';
  });

  await test('getUserByEmail query exists', () => {
    return typeof queries.getUserByEmail === 'object';
  });

  await test('addSavedTrack query exists', () => {
    return typeof queries.addSavedTrack === 'object';
  });

  // Test 3: Password hashing
  await test('password hashing works', async () => {
    const password = 'TestPassword123!';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(password, hash);
    return isValid === true;
  });

  await test('password verification rejects wrong password', async () => {
    const password = 'TestPassword123!';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword('WrongPassword', hash);
    return isValid === false;
  });

  // Test 4: Email code generation
  await test('verification code is 6 digits', () => {
    const code = generateVerificationCode();
    return /^\d{6}$/.test(code);
  });

  await test('code hashing works', () => {
    const code = '123456';
    const hash = hashCode(code);
    return hash.length === 64; // SHA256 hex = 64 chars
  });

  await test('code verification works', () => {
    const code = '123456';
    const hash = hashCode(code);
    return verifyCodeHash(code, hash);
  });

  await test('code verification rejects wrong code', () => {
    const code = '123456';
    const hash = hashCode(code);
    return !verifyCodeHash('999999', hash);
  });

  // Test 5: JWT generation
  await test('JWT token generation works', () => {
    const token = generateToken(1, 'user');
    return typeof token === 'string' && token.length > 0;
  });

  // Test 6: Create and retrieve test user
  const testEmail = `test-${Date.now()}@smoke-test.local`;
  let testUserId;

  await test('create user', async () => {
    try {
      const passwordHash = await hashPassword('TestPass123!');
      const result = queries.createUser.run(
        testEmail,
        'smoketest',
        passwordHash,
        'Smoke Test User',
        'Testing the system',
        0
      );
      testUserId = result.lastInsertRowid;
      console.log(`   Created user ID: ${testUserId}`);

      // Verify it was actually inserted
      const check = db.prepare('SELECT * FROM users WHERE id = ?').get(testUserId);
      if (!check) {
        console.log(`   WARNING: User ${testUserId} not found immediately after insert`);
        return false;
      }

      return testUserId > 0;
    } catch (error) {
      console.log(`   Error creating user: ${error.message}`);
      return false;
    }
  });

  await test('retrieve user by email', () => {
    if (!testUserId) {
      console.log('   Skipping: testUserId is undefined');
      return false;
    }
    const user = queries.getUserByEmail.get(testEmail);
    if (!user) {
      console.log(`   User not found by email: ${testEmail}`);
      return false;
    }
    return user.email === testEmail;
  });

  await test('retrieve user by id', () => {
    if (!testUserId) {
      console.log('   Skipping: testUserId is undefined');
      return false;
    }
    const user = queries.getUserById.get(testUserId);
    if (!user) {
      console.log(`   User not found by id: ${testUserId}`);
      return false;
    }
    return user.id === testUserId;
  });

  // Test 7: Email codes
  let codeId;
  await test('create email code', () => {
    const code = generateVerificationCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const result = queries.createEmailCode.run(testUserId, codeHash, 'signup', expiresAt);
    codeId = result.lastInsertRowid;
    return codeId > 0;
  });

  await test('retrieve active code', () => {
    const emailCode = queries.getActiveCode.get(testUserId, 'signup');
    return emailCode && emailCode.id === codeId;
  });

  // Test 8: Saved tracks (if tracks exist)
  const sampleTrack = db.prepare('SELECT id FROM tracks LIMIT 1').get();

  if (sampleTrack) {
    await test('save track', () => {
      queries.addSavedTrack.run(testUserId, sampleTrack.id);
      const saved = queries.checkTrackSaved.get(testUserId, sampleTrack.id);
      return saved !== undefined;
    });

    await test('list saved tracks', () => {
      const tracks = queries.listSavedTracks.all(testUserId, 10, 0);
      return tracks.length === 1;
    });

    await test('get saved track count', () => {
      const { count } = queries.getSavedTrackCount.get(testUserId);
      return count === 1;
    });

    await test('unsave track', () => {
      const result = queries.removeSavedTrack.run(testUserId, sampleTrack.id);
      return result.changes === 1;
    });
  } else {
    console.log('⏭️  Saved tracks tests skipped (no tracks in database)');
  }

  // Cleanup
  await test('cleanup test user', () => {
    queries.deleteUser.run(testUserId);
    const user = queries.getUserById.get(testUserId);
    return user === undefined;
  });

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
  }
  console.log(`${'='.repeat(50)}\n`);

  if (failed === 0) {
    console.log('🎉 All tests passed! Auth system is operational.\n');
    console.log('Next steps:');
    console.log('  1. Set up Brevo credentials in .env');
    console.log('  2. Run: npm run seed:users');
    console.log('  3. Add DevUserSwitcher to your App.jsx');
    console.log('  4. Test in browser\n');
  } else {
    console.log('⚠️  Some tests failed. Check the output above.\n');
    process.exit(1);
  }
};

// Check environment
const checkEnv = () => {
  console.log('Environment Check:');
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  DATABASE_PATH: ${process.env.DATABASE_PATH || './data/flowerpil.db'}`);
  console.log(`  EMAIL_CODE_PEPPER: ${process.env.EMAIL_CODE_PEPPER ? '✓ set' : '✗ not set'}`);
  console.log(`  JWT_SECRET: ${process.env.JWT_SECRET ? '✓ set' : '✗ not set'}`);
  console.log(`  BREVO_USER: ${process.env.BREVO_USER ? '✓ set' : '✗ not set'}`);
  console.log(`  BREVO_PASS: ${process.env.BREVO_PASS ? '✓ set' : '✗ not set'}`);
  console.log();

  if (!process.env.EMAIL_CODE_PEPPER) {
    console.log('⚠️  EMAIL_CODE_PEPPER not set. Some tests may fail.');
    console.log('   Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
  }

  if (!process.env.JWT_SECRET) {
    console.log('⚠️  JWT_SECRET not set. Token generation may fail.\n');
  }
};

// Run
checkEnv();
runTests().catch(error => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});