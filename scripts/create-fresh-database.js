import { initializeDatabase, getDatabase, closeDatabase } from '../server/database/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createFreshDatabase = async () => {
  try {
    const dbPath = path.join(__dirname, '../data/flowerpil.db');
    const backupPath = path.join(__dirname, '../data/backup');

    // Create backup directory if it doesn't exist
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }

    // Backup existing database if it exists
    if (fs.existsSync(dbPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupPath, `flowerpil-backup-${timestamp}.db`);

      console.log('📦 Backing up existing database...');
      fs.copyFileSync(dbPath, backupFile);
      console.log(`✅ Database backed up to: ${backupFile}`);

      // Also backup WAL and SHM files if they exist
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;

      if (fs.existsSync(walPath)) {
        fs.copyFileSync(walPath, `${backupFile}-wal`);
      }
      if (fs.existsSync(shmPath)) {
        fs.copyFileSync(shmPath, `${backupFile}-shm`);
      }
    }

    // Close any existing database connections
    try {
      closeDatabase();
    } catch (e) {
      // Database might not be open, ignore
    }

    // Remove existing database files
    console.log('🗑️  Removing existing database files...');
    [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`   Removed: ${path.basename(file)}`);
      }
    });

    // Initialize fresh database with schema
    console.log('🔨 Creating fresh database with schema...');
    await initializeDatabase();

    console.log('✅ Fresh database created successfully');
    console.log(`📍 Database location: ${dbPath}`);

    // Verify database was created properly
    const db = getDatabase();
    const tableCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).get();

    console.log(`📊 Database contains ${tableCount.count} tables`);

    return {
      success: true,
      databasePath: dbPath,
      tableCount: tableCount.count
    };

  } catch (error) {
    console.error('❌ Error creating fresh database:', error.message);
    console.error('Stack trace:', error.stack);
    return {
      success: false,
      error: error.message
    };
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createFreshDatabase().then(result => {
    if (!result.success) {
      process.exit(1);
    }
  });
}

export { createFreshDatabase };