/**
 * Backend Test Setup - In-memory database with truncation-based isolation
 *
 * This setup configures a shared in-memory database for all backend tests and
 * keeps the schema up to date by running project migrations. Each test starts
 * from a clean slate by truncating all application tables while preserving the
 * schema created by migrations.
 *
 * Why truncation instead of transactions?
 * - better-sqlite3 caches prepared statements, which makes transaction rollback
 *   unreliable when schema/migrations use ALTER TABLE.
 * - Recreating the schema for every test is expensive given 30+ migrations.
 * - Truncation keeps tests fast while guaranteeing isolation.
 *
 * NOTE: This file is only loaded for backend tests (server/**\/*.test.js)
 * Frontend tests use setup.frontend.js instead.
 */

import { beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Ensure test environment variables are set before the database module loads
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = process.env.DATABASE_PATH ?? ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRY = process.env.JWT_EXPIRY ?? '14d';
process.env.EMAIL_CODE_PEPPER = process.env.EMAIL_CODE_PEPPER ?? 'test-email-code-pepper';

let getDatabase;
let initializeDatabase;
let closeDatabase;

let db = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../server/database/migrations');

const runMigrationsForTests = async () => {
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

 /**
 * Load migrations in lexical order so schema evolves the same way as prod.
 */
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter(file => file.endsWith('.js'))
    .sort();

  const database = getDatabase();

  for (const file of migrationFiles) {
    const moduleUrl = pathToFileURL(path.join(migrationsDir, file)).href;
    const migration = await import(moduleUrl);

    if (typeof migration.up === 'function') {
      await migration.up(database);
    }
  }
};

const clearDatabaseForTests = () => {
  if (!getDatabase) {
    return;
  }

  const database = getDatabase();

  database.exec('PRAGMA foreign_keys = OFF;');

  const tables = database.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type = 'table' 
      AND name NOT LIKE 'sqlite_%'
  `).all();

  for (const { name } of tables) {
    // Preserve migrations metadata so we don't re-run migrations mid-suite
    if (name === 'migrations') {
      database.exec(`DELETE FROM "${name}"`);
      continue;
    }
    // Skip FTS5 shadow tables — they cannot be modified directly
    if (/_fts_(data|idx|content|docsize|config)$/.test(name)) {
      continue;
    }
    try {
      database.exec(`DELETE FROM "${name}"`);
    } catch (error) {
      // FTS virtual tables or other internal tables may reject DELETE; skip them
      if (!String(error?.message).includes('may not be modified')) {
        throw error;
      }
    }
  }

  try {
    database.exec('DELETE FROM sqlite_sequence');
  } catch (error) {
    // sqlite_sequence only exists when AUTOINCREMENT is used; ignore otherwise
  }

  database.exec('PRAGMA foreign_keys = ON;');
};

/**
 * Setup test environment and initialize in-memory database + migrations
 */
beforeAll(async () => {
  // Dynamically import database helpers after env vars are in place
  const dbModule = await import('../server/database/db.js');
  ({
    getDatabase,
    initializeDatabase,
    closeDatabase
  } = dbModule);

  initializeDatabase();
  await runMigrationsForTests();
  clearDatabaseForTests();
  db = getDatabase();

  console.log('🧪 Backend test environment initialized (in-memory database)');
});

/**
 * Before each test: truncate data to guarantee isolation
 */
beforeEach(() => {
  clearDatabaseForTests();
});

/**
 * Cleanup: Close database connection
 */
afterAll(() => {
  if (db) {
    closeDatabase?.();
    db = null;
  }
  console.log('🧹 Backend test environment cleaned up');
});

/**
 * Export database instance for tests that need direct access
 */
export { db };
