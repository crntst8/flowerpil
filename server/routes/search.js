import express from 'express';
import { getDatabase } from '../database/db.js';
import { searchPreview, searchFull } from '../services/siteSearchService.js';

const router = express.Router();
const db = getDatabase();

let editorialSchemaEnsured = false;
const ensureSearchEditorialSchema = () => {
  if (editorialSchemaEnsured) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_editorials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      preset_query TEXT,
      target_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_search_editorials_active_sort
      ON search_editorials(active, sort_order ASC, updated_at DESC);
    CREATE TRIGGER IF NOT EXISTS trg_search_editorials_updated
    AFTER UPDATE ON search_editorials
    BEGIN
      UPDATE search_editorials
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);
  try {
    const columns = db.prepare('PRAGMA table_info(search_editorials)').all();
    if (!columns.some(col => col.name === 'target_url')) {
      db.prepare('ALTER TABLE search_editorials ADD COLUMN target_url TEXT').run();
    }
  } catch (error) {
    console.error('[search] Failed to ensure target_url column', error);
  }
  editorialSchemaEnsured = true;
};

ensureSearchEditorialSchema();

const suggestionsStmt = db.prepare(`
  SELECT id, title, description, image_url, preset_query, target_url
  FROM search_editorials
  WHERE active = 1
  ORDER BY sort_order ASC, updated_at DESC
  LIMIT ?
`);

router.get('/suggestions', (req, res) => {
  try {
    ensureSearchEditorialSchema();
    const limitParam = parseInt(req.query.limit ?? '4', 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 6) : 4;
    const items = suggestionsStmt.all(limit).map(item => ({
      id: item.id,
      title: item.title,
      description: item.description || null,
      image_url: item.image_url || null,
      preset_query: item.preset_query || null,
      target_url: item.target_url || null
    }));
    return res.json({ success: true, items });
  } catch (error) {
    console.error('[search] suggestions fetch failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load suggestions' });
  }
});

router.get('/', (req, res) => {
  const mode = req.query.mode || 'preview';

  if (mode === 'full') {
    const result = searchFull({
      query: req.query.q,
      limit: req.query.limit,
      offset: req.query.offset
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  }

  // Default: preview mode
  const result = searchPreview({ query: req.query.q });
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

export default router;
