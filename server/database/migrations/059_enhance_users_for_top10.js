export async function up(db) {
  console.log('👤 Enhancing users table for Top 10 feature...');

  // Helper function to check if column exists
  const columnExists = (tableName, columnName) => {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns.some(col => col.name === columnName);
  };

  // Add top10_playlist_id column (reference to their Top 10 playlist)
  if (!columnExists('users', 'top10_playlist_id')) {
    db.exec(`
      ALTER TABLE users
      ADD COLUMN top10_playlist_id INTEGER REFERENCES top10_playlists(id);
    `);
    console.log('   ✓ Added top10_playlist_id column');
  } else {
    console.log('   ⊙ top10_playlist_id column already exists');
  }

  // Add onboarding_completed flag
  if (!columnExists('users', 'onboarding_completed')) {
    db.exec(`
      ALTER TABLE users
      ADD COLUMN onboarding_completed INTEGER DEFAULT 0;
    `);
    console.log('   ✓ Added onboarding_completed column');
  } else {
    console.log('   ⊙ onboarding_completed column already exists');
  }

  // Add avatar_url for user profile pictures
  if (!columnExists('users', 'avatar_url')) {
    db.exec(`
      ALTER TABLE users
      ADD COLUMN avatar_url TEXT;
    `);
    console.log('   ✓ Added avatar_url column');
  } else {
    console.log('   ⊙ avatar_url column already exists');
  }

  // Add bio for user profile bios
  if (!columnExists('users', 'bio')) {
    db.exec(`
      ALTER TABLE users
      ADD COLUMN bio TEXT;
    `);
    console.log('   ✓ Added bio column');
  } else {
    console.log('   ⊙ bio column already exists');
  }

  // Add is_verified for email verification status (needed for passwordless auth)
  if (!columnExists('users', 'is_verified')) {
    db.exec(`
      ALTER TABLE users
      ADD COLUMN is_verified INTEGER DEFAULT 0;
    `);
    console.log('   ✓ Added is_verified column');
  } else {
    console.log('   ⊙ is_verified column already exists');
  }

  // Create index for top10_playlist_id for efficient lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_top10_playlist
    ON users(top10_playlist_id);
  `);

  console.log('✅ Users table enhanced successfully for Top 10 feature');
}

export async function down(db) {
  console.log('🔄 Removing Top 10 enhancements from users table...');

  // Drop index
  db.exec('DROP INDEX IF EXISTS idx_users_top10_playlist;');

  // Note: SQLite doesn't support DROP COLUMN directly in older versions
  // This would require recreating the table without these columns
  // For now, we'll leave columns in place but document the rollback limitation
  console.log('⚠️  Note: SQLite does not support DROP COLUMN. Columns remain but are unused.');
  console.log('✅ Users table rollback completed (columns preserved)');
}
