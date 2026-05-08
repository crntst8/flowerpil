// Migration for blog posts feature
// Creates blog_posts table for site admin blog functionality

export const up = (db) => {
  console.log('🔄 Running migration 044_blog_posts_table - UP');

  db.exec('BEGIN TRANSACTION');

  try {
    console.log('  📝 Creating blog_posts table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        author_id INTEGER,
        excerpt TEXT,
        content TEXT,
        featured_image TEXT,
        published INTEGER DEFAULT 0,
        published_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        featured_on_homepage INTEGER DEFAULT 1,
        homepage_display_order INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        FOREIGN KEY (author_id) REFERENCES curators(id) ON DELETE SET NULL
      )
    `);

    console.log('    ✅ Created blog_posts table');

    // Create indexes for performance
    console.log('  📊 Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published, published_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug)',
      'CREATE INDEX IF NOT EXISTS idx_blog_posts_featured ON blog_posts(featured_on_homepage, homepage_display_order)',
      'CREATE INDEX IF NOT EXISTS idx_blog_posts_author ON blog_posts(author_id)'
    ];

    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }

    console.log('    ✅ Created indexes');

    db.exec('COMMIT');
    console.log('✅ Migration 044_blog_posts_table completed successfully');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 044_blog_posts_table failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 044_blog_posts_table - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    console.log('  🔄 Dropping indexes...');
    const indexes = [
      'DROP INDEX IF EXISTS idx_blog_posts_published',
      'DROP INDEX IF EXISTS idx_blog_posts_slug',
      'DROP INDEX IF EXISTS idx_blog_posts_featured',
      'DROP INDEX IF EXISTS idx_blog_posts_author'
    ];

    for (const dropSQL of indexes) {
      db.exec(dropSQL);
    }

    console.log('  🔄 Dropping blog_posts table...');
    db.exec('DROP TABLE IF EXISTS blog_posts');

    db.exec('COMMIT');
    console.log('✅ Migration 044_blog_posts_table rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 044_blog_posts_table rollback failed:', error);
    throw error;
  }
};
