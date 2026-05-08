export async function up(db) {
  console.log('👥 Creating user_groups, user_group_members, and user_emails tables...');

  // Create user_groups table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create user_group_members table (junction table)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_group_members (
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Create user_emails table for tracking sent emails
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      recipient_type TEXT,
      recipient_id INTEGER,
      sent_by_admin_id INTEGER,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sent_by_admin_id) REFERENCES admin_users(id)
    );
  `);

  // Create index for user_group_members for efficient group lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_group_members_group
    ON user_group_members(group_id);
  `);

  // Create index for user_group_members for efficient user lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_group_members_user
    ON user_group_members(user_id);
  `);

  // Create index for user_emails for efficient admin lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_emails_admin
    ON user_emails(sent_by_admin_id);
  `);

  // Create index for user_emails for efficient recipient lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_emails_recipient
    ON user_emails(recipient_type, recipient_id);
  `);

  console.log('✅ User groups and communications tables created successfully');
}

export async function down(db) {
  console.log('🔄 Dropping user_groups, user_group_members, and user_emails tables...');

  // Drop indexes
  db.exec('DROP INDEX IF EXISTS idx_user_group_members_group;');
  db.exec('DROP INDEX IF EXISTS idx_user_group_members_user;');
  db.exec('DROP INDEX IF EXISTS idx_user_emails_admin;');
  db.exec('DROP INDEX IF EXISTS idx_user_emails_recipient;');

  // Drop tables (order matters for foreign keys)
  db.exec('DROP TABLE IF EXISTS user_emails;');
  db.exec('DROP TABLE IF EXISTS user_group_members;');
  db.exec('DROP TABLE IF EXISTS user_groups;');

  console.log('✅ User groups and communications tables dropped successfully');
}
