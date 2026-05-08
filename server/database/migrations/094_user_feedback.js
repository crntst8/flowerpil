// Migration: Create user_feedback table
// Description: Store feedback/reports from authenticated users (curators)

export const up = async (db) => {
  console.log('🔄 Running migration 094_user_feedback - UP');

  // Create user_feedback table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      page_url TEXT,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'open', -- 'open', 'resolved', 'archived'
      metadata JSON, -- user_agent, screen_size, etc.
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  await db.exec('CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(status)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at)');

  console.log('✅ Migration 094_user_feedback completed');
};

export const down = async (db) => {
  console.log('🔄 Running migration 094_user_feedback - DOWN');
  await db.exec('DROP TABLE IF EXISTS user_feedback');
  console.log('✅ Migration 094_user_feedback rollback completed');
};