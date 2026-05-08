import { getDatabase } from '../db.js';

export const up = (database) => {
  const db = database ?? getDatabase();

  // Add pending_admin_approval column to curator_dsp_accounts
  try {
    db.exec(`
      ALTER TABLE curator_dsp_accounts
      ADD COLUMN pending_admin_approval BOOLEAN DEFAULT 0
    `);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    // Column already exists - this is okay
    if (!message.includes('duplicate column')) {
      throw error;
    }
  }
};

export const down = (database) => {
  const db = database ?? getDatabase();

  // SQLite doesn't support DROP COLUMN directly in older versions
  // This would require recreating the table, but for simplicity we'll document it
  // In production, you might want to recreate the table without this column
  console.log('Note: SQLite may not support dropping columns. Manual intervention may be required.');
};
