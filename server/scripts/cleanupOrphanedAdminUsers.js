/**
 * Cleanup Orphaned Admin Users
 *
 * This script finds and removes admin_users records (role: curator)
 * that reference non-existent curator_id values.
 *
 * Run with: node server/scripts/cleanupOrphanedAdminUsers.js
 */

import { getDatabase, getQueries } from '../database/db.js';

const cleanupOrphanedAdminUsers = () => {
  console.log('🔍 Scanning for orphaned admin_users records...\n');

  const db = getDatabase();

  // Find admin_users with curator role that have curator_id pointing to deleted curators
  const orphanedUsers = db.prepare(`
    SELECT au.id, au.username, au.curator_id, au.created_at
    FROM admin_users au
    WHERE au.role = 'curator'
    AND au.curator_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM curators c WHERE c.id = au.curator_id
    )
  `).all();

  if (orphanedUsers.length === 0) {
    console.log('✅ No orphaned admin_users records found.');
    return;
  }

  console.log(`⚠️  Found ${orphanedUsers.length} orphaned admin_users record(s):\n`);

  orphanedUsers.forEach(user => {
    console.log(`  - ID: ${user.id}`);
    console.log(`    Username: ${user.username}`);
    console.log(`    Curator ID: ${user.curator_id} (deleted)`);
    console.log(`    Created: ${user.created_at}\n`);
  });

  // Delete orphaned records
  const deleteStmt = db.prepare(`
    DELETE FROM admin_users
    WHERE role = 'curator'
    AND curator_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM curators c WHERE c.id = curator_id
    )
  `);

  const result = deleteStmt.run();

  console.log(`✅ Cleaned up ${result.changes} orphaned admin_users record(s).`);
  console.log('   These emails can now be used for new curator signups.');
};

try {
  cleanupOrphanedAdminUsers();
} catch (error) {
  console.error('❌ Error during cleanup:', error);
  process.exit(1);
}
