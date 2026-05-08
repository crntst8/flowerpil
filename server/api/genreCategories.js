import express from 'express';
import { getDatabase } from '../database/db.js';
import { getGenreCategoryConfig } from '../utils/genreCategories.js';

const router = express.Router();

const appendVaryHeader = (res, value) => {
  if (!value) return;
  const additions = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (!additions.length) return;

  const existing = res.get('Vary');
  if (!existing) {
    res.set('Vary', additions.join(', '));
    return;
  }

  const current = existing.split(',').map((part) => part.trim()).filter(Boolean);
  const seen = new Set(current.map((item) => item.toLowerCase()));
  const merged = [...current];

  additions.forEach((item) => {
    const lower = item.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      merged.push(item);
    }
  });

  res.set('Vary', merged.join(', '));
};

const applyPublicCache = (res) => {
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
  appendVaryHeader(res, 'Accept, Accept-Encoding');
};

router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const { list } = getGenreCategoryConfig(db);
    applyPublicCache(res);
    res.json({ success: true, categories: list });
  } catch (error) {
    console.error('Error fetching public genre categories:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch genre categories' });
  }
});

export default router;
