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
import { hashPassword } from '../utils/authUtils.js';

/**
 * Dev-only: Seed test users for rapid development and testing
 * Run with: npm run seed:users
 */

// Test admin users (admin_users table) - for curator and admin testing
const testAdminUsers = [
  {
    username: 'curator@test.com',
    password: 'password',
    role: 'curator',
    curatorId: 1570 // Dev Curator test profile
  },
  {
    username: 'admin@test.com',
    password: 'password',
    role: 'admin',
    curatorId: null
  }
];

// Test regular users (users table) - for end user testing
const testUsers = [
  {
    email: 'user@test.com',
    username: 'testuser',
    password: 'password',
    displayName: 'Test User',
    bio: 'Regular user test account',
    isPrivateSaved: 0
  }
];

export async function seedTestUsers() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Cannot seed test users in production environment');
    process.exit(1);
  }

  const queries = getQueries();
  const db = getDatabase();

  console.log('🌱 Seeding test users...\n');

  // Seed admin users
  console.log('📋 Seeding admin users (admin_users table)...\n');
  for (const user of testAdminUsers) {
    try {
      // Check if admin user already exists
      const existing = queries.findAdminUserByUsername?.get(user.username);

      if (existing) {
        console.log(`⏭️  Admin user ${user.username} already exists (id: ${existing.id})`);

        // Update curator_id if needed
        if (user.curatorId && existing.curator_id !== user.curatorId) {
          queries.setCuratorId.run(user.curatorId, existing.id);
          console.log(`   ✏️  Updated curator_id to ${user.curatorId}`);
        }
        continue;
      }

      // Hash password
      const passwordHash = await hashPassword(user.password);

      // Create admin user
      const result = queries.createAdminUser.run(
        user.username,
        passwordHash,
        user.role,
        1 // is_active
      );

      const userId = result.lastInsertRowid;

      // Set curator_id if provided
      if (user.curatorId) {
        queries.setCuratorId.run(user.curatorId, userId);
      }

      console.log(`✅ Created admin user: ${user.username} (id: ${userId})`);
      console.log(`   Role: ${user.role}`);
      if (user.curatorId) {
        console.log(`   Curator ID: ${user.curatorId}`);
      }
      console.log(`   Password: ${user.password}`);
      console.log();

    } catch (error) {
      console.error(`❌ Failed to create admin user ${user.username}:`, error.message);
    }
  }

  // Seed regular users
  console.log('\n📋 Seeding regular users (users table)...\n');
  for (const user of testUsers) {
    try {
      // Check if user already exists
      const existing = queries.getUserByEmail?.get(user.email);

      if (existing) {
        console.log(`⏭️  User ${user.email} already exists (id: ${existing.id})`);
        continue;
      }

      // Hash password
      const passwordHash = await hashPassword(user.password);

      // Create user
      const result = db.prepare(`
        INSERT INTO users (email, username, password_hash, display_name, bio, is_private_saved)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        user.email,
        user.username,
        passwordHash,
        user.displayName,
        user.bio,
        user.isPrivateSaved
      );

      console.log(`✅ Created user: ${user.email} (id: ${result.lastInsertRowid})`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Password: ${user.password}`);
      console.log();

    } catch (error) {
      console.error(`❌ Failed to create user ${user.email}:`, error.message);
    }
  }

  console.log('✨ Seeding complete!\n');
  console.log('Test credentials:');
  console.log('\n🔐 Admin Users (admin_users table):');
  testAdminUsers.forEach(u => {
    console.log(`  ${u.username} / ${u.password} [${u.role}]`);
  });
  console.log('\n👤 Regular Users (users table):');
  testUsers.forEach(u => {
    console.log(`  ${u.email} / ${u.password}`);
  });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedTestUsers()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}