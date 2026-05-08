import { getDatabase } from '../database/db.js';

export const createUserReport = ({ userId, pageUrl, content, metadata }) => {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO user_feedback (user_id, page_url, content, metadata)
    VALUES (?, ?, ?, ?)
  `);
  
  const info = stmt.run(userId, pageUrl, content, JSON.stringify(metadata));
  return info.lastInsertRowid;
};

export const getUserReports = ({ limit = 50, offset = 0, status = 'open' } = {}) => {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT 
      uf.*,
      au.username as admin_username,
      c.name as curator_name,
      c.contact_email as curator_email
    FROM user_feedback uf
    LEFT JOIN admin_users au ON uf.user_id = au.id
    LEFT JOIN curators c ON au.curator_id = c.id
    WHERE uf.status = ?
    ORDER BY uf.created_at DESC
    LIMIT ? OFFSET ?
  `);
  
  const rows = stmt.all(status, Number(limit), Number(offset));
  return rows.map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : {}
  }));
};

export const resolveUserReport = (id) => {
    const db = getDatabase();
    const stmt = db.prepare(`
        UPDATE user_feedback SET status = 'resolved', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    return stmt.run(id);
};
