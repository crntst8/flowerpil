import { initializeDatabase, closeDatabase } from '../server/database/db.js';

// Initialize the database using the central schema definition
// This ensures all current columns and indexes are created consistently
(async () => {
  try {
    await initializeDatabase();
    console.log('✅ Database initialised successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
})();
