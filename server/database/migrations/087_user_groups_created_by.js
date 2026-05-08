export async function up(db) {
  console.log('Adding created_by column to user_groups table...');

  try {
    db.exec(`
      ALTER TABLE user_groups ADD COLUMN created_by INTEGER REFERENCES admin_users(id);
    `);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('duplicate column name')) {
      throw error;
    }
  }

  console.log('Added created_by column to user_groups');
}

export async function down(db) {
  console.log('SQLite does not support DROP COLUMN directly - recreating table without created_by...');

  db.exec(`
    CREATE TABLE user_groups_backup AS SELECT id, name, description, created_at FROM user_groups;
    DROP TABLE user_groups;
    CREATE TABLE user_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO user_groups SELECT * FROM user_groups_backup;
    DROP TABLE user_groups_backup;
  `);

  console.log('Removed created_by column from user_groups');
}
