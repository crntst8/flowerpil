// Migration for blog post flags/content-tags
// Creates blog_post_flag_assignments table and "Posts" content tag

export const up = (db) => {
  console.log('🔄 Running migration 045_blog_post_flags - UP');

  db.exec('BEGIN TRANSACTION');

  try {
    // Create blog_post_flag_assignments table (similar to playlist_flag_assignments)
    console.log('  📝 Creating blog_post_flag_assignments table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS blog_post_flag_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        flag_id INTEGER NOT NULL,
        assigned_by INTEGER,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (post_id, flag_id),
        FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE,
        FOREIGN KEY (flag_id) REFERENCES custom_playlist_flags(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES admin_users(id)
      )
    `);
    console.log('    ✅ Created blog_post_flag_assignments table');

    // Create indexes
    console.log('  📊 Creating indexes...');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_blog_post_flag_assignments_post ON blog_post_flag_assignments(post_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_blog_post_flag_assignments_flag ON blog_post_flag_assignments(flag_id)
    `);
    console.log('    ✅ Created indexes');

    // Check if "Posts" content tag exists
    const postsTag = db.prepare(`
      SELECT id FROM custom_playlist_flags WHERE url_slug = 'posts'
    `).get();

    let postsTagId;

    if (!postsTag) {
      // Create "Post" content tag
      console.log('  📝 Creating "Post" content tag...');
      const result = db.prepare(`
        INSERT INTO custom_playlist_flags (text, color, text_color, url_slug, description, allow_self_assign)
        VALUES ('Post', '#78862C', '#000000', 'posts', 'Blog posts and articles', 0)
      `).run();
      postsTagId = result.lastInsertRowid;
      console.log(`    ✅ Created "Post" content tag with id ${postsTagId}`);
    } else {
      postsTagId = postsTag.id;
      console.log(`    ℹ️  "Post" content tag already exists with id ${postsTagId}`);
    }

    // Auto-assign "Post" tag to all existing blog posts
    console.log('  📝 Auto-assigning "Post" tag to existing blog posts...');
    const blogPosts = db.prepare('SELECT id FROM blog_posts').all();

    if (blogPosts.length > 0) {
      const insertAssignment = db.prepare(`
        INSERT OR IGNORE INTO blog_post_flag_assignments (post_id, flag_id)
        VALUES (?, ?)
      `);

      for (const post of blogPosts) {
        insertAssignment.run(post.id, postsTagId);
      }
      console.log(`    ✅ Assigned "Post" tag to ${blogPosts.length} existing blog posts`);
    } else {
      console.log('    ℹ️  No existing blog posts to tag');
    }

    db.exec('COMMIT');
    console.log('✅ Migration 045_blog_post_flags completed successfully');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 045_blog_post_flags failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 045_blog_post_flags - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    console.log('  🔄 Dropping indexes...');
    db.exec('DROP INDEX IF EXISTS idx_blog_post_flag_assignments_post');
    db.exec('DROP INDEX IF EXISTS idx_blog_post_flag_assignments_flag');

    console.log('  🔄 Dropping blog_post_flag_assignments table...');
    db.exec('DROP TABLE IF EXISTS blog_post_flag_assignments');

    console.log('  🔄 Removing "Post" content tag...');
    db.exec(`DELETE FROM custom_playlist_flags WHERE url_slug = 'posts'`);

    db.exec('COMMIT');
    console.log('✅ Migration 045_blog_post_flags rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 045_blog_post_flags rollback failed:', error);
    throw error;
  }
};
