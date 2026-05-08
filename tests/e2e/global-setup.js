/**
 * Playwright Global Setup
 *
 * Runs once before all E2E tests to initialize the test database
 * by running all migrations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from '../../server/database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, '../../server/database/migrations');

export default async function globalSetup() {
  console.log('\n🔧 Setting up E2E test database...\n');

  // Set environment to use test-e2e database
  process.env.DATABASE_PATH = path.join(__dirname, '../../data/test-e2e.db');
  process.env.NODE_ENV = 'test';

  try {
    // Initialize database (creates tables if needed)
    console.log('📦 Initializing database...');
    initializeDatabase();

    // Get all migration files
    const migrationFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.js'))
      .sort();

    console.log(`📁 Found ${migrationFiles.length} migration files`);

    // Run each migration
    for (const file of migrationFiles) {
      const migrationPath = path.join(MIGRATIONS_DIR, file);

      try {
        console.log(`  ✓ Running migration: ${file}`);

        // Import and run the migration
        const migration = await import(migrationPath);
        if (migration.up && typeof migration.up === 'function') {
          await migration.up();
        }
      } catch (err) {
        // Skip errors for already-applied migrations
        if (err.message.includes('duplicate column') ||
            err.message.includes('already exists')) {
          console.log(`    ⏭️  Skipped (already applied)`);
        } else {
          console.warn(`    ⚠️  Warning in ${file}: ${err.message}`);
        }
      }
    }

    console.log('\n✅ E2E test database initialized successfully!\n');

  } catch (error) {
    console.error('\n❌ Failed to initialize E2E test database:', error);
    throw error;
  }
}
