#!/usr/bin/env node

import { getDatabase } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database Migration Runner
 *
 * Usage:
 *   node migrate.js up   - Run pending migrations
 *   node migrate.js down - Rollback last migration
 *   node migrate.js up --force - Skip environment validation
 */

// Detect environment and database path
const detectEnvironment = () => {
  const dbPath = process.env.DATABASE_URL?.replace('sqlite://', '') ||
                 process.env.DATABASE_PATH ||
                 './data/flowerpil.db';

  const isStaging = process.env.STAGING === 'true' || process.env.NODE_ENV === 'staging';
  const isProduction = process.env.NODE_ENV === 'production' && !isStaging;
  const isDevelopment = !isProduction && !isStaging;

  const dbContainsStaging = dbPath.includes('staging');
  const dbContainsProd = dbPath.includes('prod');

  return {
    dbPath,
    isStaging,
    isProduction,
    isDevelopment,
    dbContainsStaging,
    dbContainsProd
  };
};

// Validate environment matches database
const validateEnvironment = () => {
  const env = detectEnvironment();

  console.log('\n📊 Environment Check:');
  console.log(`  Database: ${env.dbPath}`);
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  console.log(`  STAGING: ${process.env.STAGING || 'not set'}`);

  const warnings = [];

  // Check for potential mismatches
  if (env.isStaging && !env.dbContainsStaging) {
    warnings.push('⚠️  STAGING=true but database path does not contain "staging"');
  }

  if (env.dbContainsStaging && !env.isStaging) {
    warnings.push('⚠️  Database contains "staging" but STAGING env var is not set');
  }

  if (env.isProduction && (env.dbContainsStaging || env.dbContainsProd)) {
    if (env.dbContainsStaging) {
      warnings.push('⚠️  NODE_ENV=production but database contains "staging"');
    }
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  Environment Warnings:');
    warnings.forEach(w => console.log(`  ${w}`));
    return false;
  }

  console.log('✅ Environment check passed\n');
  return true;
};

// Prompt user for confirmation
const promptConfirmation = (question) => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
};

// Create migrations tracking table
const initializeMigrationsTable = () => {
  const db = getDatabase();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

// Get applied migrations
const getAppliedMigrations = () => {
  const db = getDatabase();
  const migrations = db.prepare('SELECT filename FROM migrations ORDER BY applied_at').all();
  return migrations.map(m => m.filename);
};

// Get available migration files
const getAvailableMigrations = () => {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  
  return fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.js'))
    .sort();
};

// Run pending migrations
const runPendingMigrations = async (force = false) => {
  // Validate environment unless --force flag is used
  if (!force) {
    const isValid = validateEnvironment();
    if (!isValid) {
      const confirmed = await promptConfirmation('\n⚠️  Continue anyway? (y/N): ');
      if (!confirmed) {
        console.log('❌ Migration cancelled');
        process.exit(0);
      }
    }
  }

  initializeMigrationsTable();

  const applied = getAppliedMigrations();
  const available = getAvailableMigrations();
  const pending = available.filter(migration => !applied.includes(migration));

  if (pending.length === 0) {
    console.log('✅ No pending migrations');
    return;
  }

  console.log(`🔄 Running ${pending.length} pending migration(s):`);
  console.log(pending.map(m => `  - ${m}`).join('\n'));

  const db = getDatabase();

  for (const migrationFile of pending) {
    console.log(`\n🔄 Running: ${migrationFile}`);

    try {
      // Dynamic import of migration
      const migrationPath = path.join(__dirname, 'migrations', migrationFile);
      const migration = await import(`file://${migrationPath}`);

      // Run the up function
      await migration.up(db);

      // Record migration as applied
      db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(migrationFile);

      console.log(`✅ Completed: ${migrationFile}`);

    } catch (error) {
      console.error(`❌ Failed: ${migrationFile}`, error);
      process.exit(1);
    }
  }

  console.log('\n✅ All migrations completed successfully');
};

// Rollback last migration
const rollbackLastMigration = async (force = false) => {
  // Validate environment unless --force flag is used
  if (!force) {
    const isValid = validateEnvironment();
    if (!isValid) {
      const confirmed = await promptConfirmation('\n⚠️  Continue anyway? (y/N): ');
      if (!confirmed) {
        console.log('❌ Rollback cancelled');
        process.exit(0);
      }
    }
  }

  initializeMigrationsTable();

  const db = getDatabase();
  const lastMigration = db.prepare(`
    SELECT filename FROM migrations
    ORDER BY applied_at DESC
    LIMIT 1
  `).get();

  if (!lastMigration) {
    console.log('✅ No migrations to rollback');
    return;
  }

  console.log(`🔄 Rolling back: ${lastMigration.filename}`);

  try {
    // Dynamic import of migration
    const migrationPath = path.join(__dirname, 'migrations', lastMigration.filename);
    const migration = await import(`file://${migrationPath}`);

    // Run the down function
    await migration.down(db);

    // Remove migration record
    db.prepare('DELETE FROM migrations WHERE filename = ?').run(lastMigration.filename);

    console.log(`✅ Rolled back: ${lastMigration.filename}`);

  } catch (error) {
    console.error(`❌ Rollback failed: ${lastMigration.filename}`, error);
    process.exit(1);
  }
};

// CLI interface
const command = process.argv[2];
const hasForceFlag = process.argv.includes('--force');

switch (command) {
  case 'up':
    runPendingMigrations(hasForceFlag);
    break;
  case 'down':
    rollbackLastMigration(hasForceFlag);
    break;
  default:
    console.log('Usage:');
    console.log('  node migrate.js up           - Run pending migrations');
    console.log('  node migrate.js down         - Rollback last migration');
    console.log('  node migrate.js up --force   - Skip environment validation');
    console.log('  node migrate.js down --force - Skip environment validation');
    process.exit(1);
}