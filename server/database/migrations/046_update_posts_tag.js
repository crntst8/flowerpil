// Migration to update existing "Posts" content tag to use new styling
// Changes: text "POSTS" -> "Post", color "#000000" -> "#78862C", text_color "#ffffff" -> "#000000"

export const up = (db) => {
  console.log('🔄 Running migration 046_update_posts_tag - UP');

  db.exec('BEGIN TRANSACTION');

  try {
    // Update the "Posts" content tag with new values
    console.log('  📝 Updating "Post" content tag styling...');

    const result = db.prepare(`
      UPDATE custom_playlist_flags
      SET text = 'Post',
          color = '#78862C',
          text_color = '#000000'
      WHERE url_slug = 'posts'
    `).run();

    if (result.changes > 0) {
      console.log(`    ✅ Updated "Post" content tag (${result.changes} row(s) affected)`);
    } else {
      console.log('    ℹ️  No "Post" content tag found to update');
    }

    db.exec('COMMIT');
    console.log('✅ Migration 046_update_posts_tag completed successfully');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 046_update_posts_tag failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 046_update_posts_tag - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    // Revert the "Posts" content tag to original values
    console.log('  🔄 Reverting "Post" content tag to original styling...');

    db.prepare(`
      UPDATE custom_playlist_flags
      SET text = 'POSTS',
          color = '#000000',
          text_color = '#ffffff'
      WHERE url_slug = 'posts'
    `).run();

    console.log('    ✅ Reverted "Post" content tag');

    db.exec('COMMIT');
    console.log('✅ Migration 046_update_posts_tag rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 046_update_posts_tag rollback failed:', error);
    throw error;
  }
};
