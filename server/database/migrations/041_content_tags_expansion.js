// Migration: Content Tags Expansion
// Date: 2025-10-13
// Description: Add description, allow_self_assign, and url_slug columns to custom_playlist_flags table

export const up = (db) => {
  console.log('🔄 Running migration 041_content_tags_expansion - UP');

  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');

  try {
    // Add description column
    console.log('  📝 Adding description column to custom_playlist_flags table...');
    try {
      db.exec('ALTER TABLE custom_playlist_flags ADD COLUMN description TEXT DEFAULT NULL');
      console.log('  ✅ description column added successfully');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('  ⚠️  description column already exists, skipping...');
      } else {
        throw error;
      }
    }

    // Add allow_self_assign column
    console.log('  📝 Adding allow_self_assign column to custom_playlist_flags table...');
    try {
      db.exec('ALTER TABLE custom_playlist_flags ADD COLUMN allow_self_assign INTEGER DEFAULT 0');
      console.log('  ✅ allow_self_assign column added successfully');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('  ⚠️  allow_self_assign column already exists, skipping...');
      } else {
        throw error;
      }
    }

    // Add url_slug column (without UNIQUE constraint - SQLite limitation)
    console.log('  📝 Adding url_slug column to custom_playlist_flags table...');
    try {
      db.exec('ALTER TABLE custom_playlist_flags ADD COLUMN url_slug TEXT DEFAULT NULL');
      console.log('  ✅ url_slug column added successfully');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('  ⚠️  url_slug column already exists, skipping...');
      } else {
        throw error;
      }
    }

    // Add UNIQUE constraint via index
    console.log('  📝 Adding UNIQUE constraint on url_slug column...');
    try {
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_playlist_flags_slug_unique ON custom_playlist_flags(url_slug)');
      console.log('  ✅ UNIQUE constraint added successfully');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('  ⚠️  UNIQUE constraint already exists, skipping...');
      } else {
        throw error;
      }
    }

    // Note: Additional index for slug lookups not needed as UNIQUE index above serves that purpose

    db.exec('COMMIT');
    console.log('✅ Migration 041_content_tags_expansion completed successfully');

    // Verify migration results
    const schemaInfo = db.prepare("PRAGMA table_info(custom_playlist_flags)").all();
    const newColumns = schemaInfo.filter(col =>
      ['description', 'allow_self_assign', 'url_slug'].includes(col.name)
    );
    console.log(`📊 Migration results: ${newColumns.length}/3 new columns verified`);
    newColumns.forEach(col => {
      console.log(`   ✓ ${col.name} (${col.type})`);
    });

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 041_content_tags_expansion failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 041_content_tags_expansion - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    // Note: SQLite doesn't support DROP COLUMN easily, so we can't easily remove the columns
    // The columns will remain but won't be used by the application after rollback
    console.log('  ⚠️  Note: SQLite does not support DROP COLUMN for the added columns');
    console.log('  ⚠️  Manual rollback required or recreate table (see SPEC.md rollback plan)');
    console.log('  ⚠️  Columns will remain but application will not use them');

    // Drop the unique index (this we can do)
    try {
      db.exec('DROP INDEX IF EXISTS idx_custom_playlist_flags_slug_unique');
      console.log('  ✅ UNIQUE index dropped successfully');
    } catch (error) {
      console.log('  ⚠️  Index drop failed:', error.message);
    }

    db.exec('COMMIT');
    console.log('✅ Migration 041_content_tags_expansion rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 041_content_tags_expansion rollback failed:', error);
    throw error;
  }
};
