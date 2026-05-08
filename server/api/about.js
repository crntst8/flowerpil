import express from 'express';
import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get about page content (public endpoint)
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();

    const config = db.prepare(`
      SELECT config_value
      FROM admin_system_config
      WHERE config_key = 'about_page_content'
    `).get();

    if (!config) {
      // Return default empty structure
      return res.json({
        topText: '',
        items: []
      });
    }

    try {
      const content = JSON.parse(config.config_value);
      res.json(content);
    } catch (parseError) {
      logger.error('API_ERROR', 'Error parsing about page content', parseError);
      // Return default on parse error
      res.json({
        topText: '',
        items: []
      });
    }
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching about page content', error);
    res.status(500).json({ error: 'Failed to fetch about page content' });
  }
});

export default router;
