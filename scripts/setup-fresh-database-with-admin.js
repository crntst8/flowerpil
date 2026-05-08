import { exportAdminUser } from './export-admin-user.js';
import { createFreshDatabase } from './create-fresh-database.js';
import { restoreAdminUser } from './restore-admin-user.js';
import { closeDatabase } from '../server/database/db.js';

const setupFreshDatabaseWithAdmin = async () => {
  console.log('🚀 Starting fresh database setup with admin user...\n');

  try {
    // Step 1: Export current admin user
    console.log('1️⃣ Exporting current admin user...');
    const exportResult = exportAdminUser();
    if (!exportResult) {
      throw new Error('Failed to export admin user');
    }
    console.log('');

    // Step 2: Create fresh database
    console.log('2️⃣ Creating fresh database...');
    const dbResult = await createFreshDatabase();
    if (!dbResult.success) {
      throw new Error(`Failed to create fresh database: ${dbResult.error}`);
    }
    console.log('');

    // Step 3: Restore admin user
    console.log('3️⃣ Restoring admin user to fresh database...');
    const restoreResult = restoreAdminUser();
    if (!restoreResult.success) {
      throw new Error(`Failed to restore admin user: ${restoreResult.error}`);
    }
    console.log('');

    // Success summary
    console.log('🎉 FRESH DATABASE SETUP COMPLETE!');
    console.log('================================');
    console.log(`📊 Database has ${dbResult.tableCount} tables`);
    console.log(`👤 Admin user "${restoreResult.adminUser.username}" ready`);
    console.log('✅ You can now start the server with a clean database');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Start the server: npm run dev');
    console.log('  2. Login with username "admin" and your existing password');
    console.log('  3. Begin fresh setup in admin panel');

    return {
      success: true,
      database: dbResult,
      adminUser: restoreResult.adminUser
    };

  } catch (error) {
    console.error('\n❌ FRESH DATABASE SETUP FAILED');
    console.error('================================');
    console.error('Error:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('  - Ensure the server is not running (pm2 stop all)');
    console.log('  - Check that data/flowerpil.db is not locked');
    console.log('  - Verify you have write permissions to data/ directory');

    return {
      success: false,
      error: error.message
    };
  } finally {
    // Clean up database connections
    try {
      closeDatabase();
    } catch (e) {
      // Ignore cleanup errors
    }
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupFreshDatabaseWithAdmin().then(result => {
    if (!result.success) {
      process.exit(1);
    }
  });
}

export { setupFreshDatabaseWithAdmin };