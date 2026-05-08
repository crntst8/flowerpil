import { getDatabase } from '../server/database/db.js';
import bcrypt from 'bcryptjs';

const changeAdminPassword = (username = 'admin', newPassword) => {
  try {
    if (!newPassword) {
      throw new Error('New password is required');
    }

    const db = getDatabase();

    // Check if admin user exists
    const existingAdmin = db.prepare(`
      SELECT id, username, role, is_active FROM admin_users
      WHERE username = ? AND role = 'admin'
    `).get(username);

    if (!existingAdmin) {
      console.log('❌ Admin user not found');
      return { success: false, error: 'Admin user not found' };
    }

    if (!existingAdmin.is_active) {
      console.log('❌ Admin user is not active');
      return { success: false, error: 'Admin user is not active' };
    }

    // Hash the new password
    const passwordHash = bcrypt.hashSync(newPassword, 12);

    // Update admin user password
    const updateStmt = db.prepare(`
      UPDATE admin_users
      SET password_hash = ?,
          failed_login_attempts = 0,
          locked_until = NULL
      WHERE username = ? AND role = 'admin'
    `);

    const result = updateStmt.run(passwordHash, username);

    if (result.changes === 0) {
      console.log('❌ Failed to update password');
      return { success: false, error: 'Failed to update password' };
    }

    // Verify update
    const updatedAdmin = db.prepare(`
      SELECT id, username, role, is_active, created_at
      FROM admin_users
      WHERE username = ? AND role = 'admin'
    `).get(username);

    console.log('✅ Admin password changed successfully!');
    console.log('📋 Admin user details:');
    console.log(`   ID: ${updatedAdmin.id}`);
    console.log(`   Username: ${updatedAdmin.username}`);
    console.log(`   Role: ${updatedAdmin.role}`);
    console.log(`   Active: ${updatedAdmin.is_active ? 'Yes' : 'No'}`);
    console.log(`   Created: ${updatedAdmin.created_at}`);
    console.log('');
    console.log('🔐 Password has been updated. Failed login attempts reset.');

    return {
      success: true,
      adminUser: updatedAdmin
    };

  } catch (error) {
    console.error('❌ Error changing admin password:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const username = process.argv[2] || 'admin';
  const newPassword = process.argv[3];

  if (!newPassword) {
    console.log('❌ Usage: node change-admin-password.js [username] <new_password>');
    console.log('   Example: node change-admin-password.js admin myNewPassword123');
    process.exit(1);
  }

  console.log('🔐 Changing admin password...');
  const result = changeAdminPassword(username, newPassword);

  if (!result.success) {
    process.exit(1);
  }
}

export { changeAdminPassword };