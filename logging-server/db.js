import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveDbPath = () => {
  const configured = process.env.LOGGING_DB_PATH;
  if (configured) {
    return configured.startsWith('.')
      ? path.resolve(process.cwd(), configured)
      : configured;
  }
  return path.join(__dirname, 'data', 'logging.db');
};

const dbPath = resolveDbPath();
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const init = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_id TEXT UNIQUE NOT NULL,
      request_id TEXT,
      user_id INTEGER,
      curator_id INTEGER,
      curator_name TEXT,
      user_email TEXT,
      url TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT,
      received_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_request ON feedback(request_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_user_email ON feedback(user_email);
    CREATE INDEX IF NOT EXISTS idx_feedback_route ON feedback(url);
    CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
  `);
};

init();

export default db;
