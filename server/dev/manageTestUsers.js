// Load environment from ecosystem.config.cjs
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const ecosystem = require(join(__dirname, '../../ecosystem.config.cjs'));
  if (ecosystem.apps?.[0]?.env) {
    Object.assign(process.env, ecosystem.apps[0].env);
  }
} catch (error) {
  // Continue - env vars might be set another way
}

import { getQueries, getDatabase } from '../database/db.js';

/**
 * Dev-only: Manage test users
 *
 * Usage:
 *   npm run dev:users:list
 *   npm run dev:users:clear
 *   node server/dev/manageTestUsers.js info test@test.com
 */

if (process.env.NODE_ENV === 'production') {
  console.error('❌ Cannot manage test users in production environment');
  process.exit(1);
}

const command = process.argv[2];
const arg = process.argv[3];

const queries = getQueries();
const db = getDatabase();

async function listUsers() {
  console.log('\n📋 Test Users:\n');

  const testDomains = ['@test.com'];
  const users = db.prepare(`
    SELECT id, email, username, display_name, is_private_saved, created_at
    FROM users
    WHERE email LIKE '%@test.com'
    ORDER BY created_at DESC
  `).all();

  if (users.length === 0) {
    console.log('  No test users found. Run: npm run seed:users\n');
    return;
  }

  users.forEach((user, index) => {
    const privacy = user.is_private_saved ? '🔒 Private' : '🌐 Public';
    console.log(`${index + 1}. ${user.email}`);
    console.log(`   ID: ${user.id} | Username: ${user.username || 'none'}`);
    console.log(`   Display: ${user.display_name || 'none'} | ${privacy}`);
    console.log(`   Created: ${user.created_at}`);
    console.log();
  });

  console.log(`Total: ${users.length} test users\n`);
}

async function clearTestUsers() {
  const users = db.prepare(`
    SELECT id, email FROM users WHERE email LIKE '%@test.com'
  `).all();

  if (users.length === 0) {
    console.log('\n✅ No test users to clear\n');
    return;
  }

  console.log(`\n⚠️  About to delete ${users.length} test users:`);
  users.forEach(u => console.log(`  - ${u.email}`));
  console.log();

  // Confirm in interactive mode
  if (process.stdin.isTTY) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      rl.question('Continue? [y/N] ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log('Cancelled.\n');
      return;
    }
  }

  // Delete test users (CASCADE will handle related records)
  const result = db.prepare(`
    DELETE FROM users WHERE email LIKE '%@test.com'
  `).run();

  console.log(`\n✅ Deleted ${result.changes} test users\n`);
}

async function showUserInfo(email) {
  const user = queries.getUserByEmail?.get(email);

  if (!user) {
    console.log(`\n❌ User not found: ${email}\n`);
    return;
  }

  console.log('\n👤 User Info:\n');
  console.log(`Email:        ${user.email}`);
  console.log(`ID:           ${user.id}`);
  console.log(`Username:     ${user.username || 'none'}`);
  console.log(`Display Name: ${user.display_name || 'none'}`);
  console.log(`Bio:          ${user.bio || 'none'}`);
  console.log(`Avatar:       ${user.avatar_url || 'none'}`);
  console.log(`Privacy:      ${user.is_private_saved ? '🔒 Private' : '🌐 Public'}`);
  console.log(`Created:      ${user.created_at}`);
  console.log(`Updated:      ${user.updated_at || 'never'}`);

  // Show saved tracks count
  const savedCount = db.prepare(`
    SELECT COUNT(*) as count FROM saved_tracks WHERE user_id = ?
  `).get(user.id);
  console.log(`\nSaved Tracks: ${savedCount.count}`);

  // Show lists count
  const listsCount = db.prepare(`
    SELECT COUNT(*) as count FROM lists WHERE user_id = ?
  `).get(user.id);
  console.log(`Lists:        ${listsCount.count}`);

  console.log();
}

// Execute command
(async () => {
  try {
    switch (command) {
      case 'list':
        await listUsers();
        break;

      case 'clear':
        await clearTestUsers();
        break;

      case 'info':
        if (!arg) {
          console.error('\n❌ Usage: node server/dev/manageTestUsers.js info <email>\n');
          process.exit(1);
        }
        await showUserInfo(arg);
        break;

      default:
        console.log('\n📘 Test User Manager\n');
        console.log('Usage:');
        console.log('  node server/dev/manageTestUsers.js list          - List all test users');
        console.log('  node server/dev/manageTestUsers.js clear         - Delete all test users');
        console.log('  node server/dev/manageTestUsers.js info <email>  - Show user details\n');
        console.log('Shortcuts:');
        console.log('  npm run seed:users        - Create test users');
        console.log('  npm run dev:users:list    - List test users');
        console.log('  npm run dev:users:clear   - Clear test users\n');
        process.exit(command ? 1 : 0);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n');
    process.exit(1);
  }
})();