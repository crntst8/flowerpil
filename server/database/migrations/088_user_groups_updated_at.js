export async function up(db) {
  console.log('Adding updated_at column to user_groups table...');

  try {
    db.exec(`
      ALTER TABLE user_groups ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
    `);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('duplicate column name')) {
      throw error;
    }
  }

  console.log('Added updated_at column to user_groups');
}

export async function down(db) {
  console.log('SQLite does not support DROP COLUMN directly - skipping down migration');
}
