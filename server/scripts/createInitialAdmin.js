import { hashPassword } from '../utils/authUtils.js';
import { getQueries } from '../database/db.js';
import crypto from 'crypto';

// Generate a cryptographically secure temporary password
const generatePassword = () => {
  // Generate 16 random bytes and convert to hex for readability
  return crypto.randomBytes(16).toString('hex');
};

const createInitialAdmin = async () => {
  console.log('🔧 Creating initial admin user...\n');
  
  const username = 'admin';
  const tempPassword = generatePassword();
  
  try {
    // Hash the temporary password
    console.log('📝 Generating secure password hash...');
    const hashedPassword = await hashPassword(tempPassword);
    
    // Get database queries
    const queries = getQueries();
    
    // Check if admin user already exists
    const existingAdmin = queries.findAdminUserByUsername.get(username);
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists!');
      console.log(`   Username: ${existingAdmin.username}`);
      console.log(`   Created: ${existingAdmin.created_at}`);
      console.log(`   Active: ${existingAdmin.is_active ? 'Yes' : 'No'}`);
      console.log(`   Last Login: ${existingAdmin.last_login || 'Never'}`);
      console.log('\n💡 To reset password, delete the user and run this script again.');
      return;
    }
    
    // Create the admin user
    console.log('💾 Creating admin user in database...');
    const result = queries.createAdminUser.run(username, hashedPassword, 'admin', 1);
    
    if (result.changes === 1) {
      console.log('✅ Initial admin user created successfully!\n');
      console.log('🔐 ADMIN CREDENTIALS (SAVE IMMEDIATELY):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Username: ${username}`);
      console.log(`Temporary Password: ${tempPassword}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n⚠️  SECURITY REQUIREMENTS:');
      console.log('   1. CHANGE PASSWORD IMMEDIATELY after first login');
      console.log('   2. Use a strong password with uppercase, lowercase, numbers, and symbols');
      console.log('   3. Do not share these credentials');
      console.log('   4. This temporary password will not be displayed again');
      console.log('\n🌐 Login URL: https://dev.flowerpil.com/admin/login');
      console.log('📱 API Endpoint: POST /api/v1/auth/login');
      
      // Verify the user was created
      const newAdmin = queries.findAdminUserByUsername.get(username);
      console.log('\n📊 User Details:');
      console.log(`   User ID: ${newAdmin.id}`);
      console.log(`   Role: ${newAdmin.role}`);
      console.log(`   Created: ${newAdmin.created_at}`);
      console.log(`   Active: ${newAdmin.is_active ? 'Yes' : 'No'}`);
      
    } else {
      console.error('❌ Failed to create admin user - no rows affected');
    }
    
  } catch (error) {
    console.error('❌ Error creating initial admin user:', error);
    
    if (error.message.includes('UNIQUE constraint')) {
      console.log('\n💡 Admin user already exists. To create a new admin:');
      console.log('   1. Delete existing admin: DELETE FROM admin_users WHERE username = "admin";');
      console.log('   2. Run this script again');
    } else if (error.code === 'SQLITE_CONSTRAINT') {
      console.log('\n💡 Database constraint error. Check that:');
      console.log('   1. The admin_users table exists');
      console.log('   2. Migrations have been run: node server/database/migrate.js up');
    } else {
      console.log('\n🔍 Debug information:');
      console.log('   Error type:', error.constructor.name);
      console.log('   Error code:', error.code);
      console.log('   Error message:', error.message);
    }
    
    process.exit(1);
  }
};

// Run the script
createInitialAdmin()
  .then(() => {
    console.log('\n✨ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });