export async function up(db) {
  console.log('Adding added_by column to user_group_members table...');

  try {
    db.exec(`
      ALTER TABLE user_group_members ADD COLUMN added_by INTEGER;
    `);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('duplicate column name')) {
      throw error;
    }
  }

  console.log('Added added_by column to user_group_members');
}

export async function down(db) {
  console.log('SQLite does not support DROP COLUMN directly - skipping down migration');
}
