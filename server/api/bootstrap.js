import express from 'express';
import { getDatabase } from '../database/db.js';
import { getGenreCategoryConfig } from '../utils/genreCategories.js';
import { getAllFlags } from '../services/featureFlagService.js';

const router = express.Router();
const db = getDatabase();
const envTesterFeedbackEnabled = String(process.env.FEATURE_TESTER_FEEDBACK || '').toLowerCase() === 'true';

const getSiteSettings = () => {
  const defaultSettings = {
    hide_curator_type_sitewide: { enabled: false },
    tester_feedback_sitewide: { enabled: envTesterFeedbackEnabled },
    show_top10_in_nav: { enabled: false },
    instagram_track_linking_enabled: { enabled: false },
    playlist_love_enabled: { enabled: true },
    playlist_comments_enabled: { enabled: true },
    open_signup_enabled: { enabled: false },
    analytics_settings: {
      data_retention_days: 365,
      enable_detailed_tracking: true,
      privacy_mode: false,
      anonymize_after_days: 90
    },
    meta_pixel_enabled: { enabled: false },
    meta_ads_enabled: { enabled: false },
    meta_require_admin_approval: { enabled: true },
    meta_pixel_mode: { mode: 'curator' },
    meta_global_pixel_id: { value: '' },
    meta_pixel_advanced_matching: { enabled: false }
  };

  const query = db.prepare(`
    SELECT config_key, config_value
    FROM admin_system_config
    WHERE config_key IN (
      'hide_curator_type_sitewide',
      'tester_feedback_sitewide',
      'show_top10_in_nav',
      'instagram_track_linking_enabled',
      'playlist_love_enabled',
      'playlist_comments_enabled',
      'open_signup_enabled',
      'analytics_settings',
      'meta_pixel_enabled',
      'meta_ads_enabled',
      'meta_require_admin_approval',
      'meta_pixel_mode',
      'meta_global_pixel_id',
      'meta_pixel_advanced_matching'
    )
  `);

  const configs = query.all();
  const settings = { ...defaultSettings };

  configs.forEach((config) => {
    try {
      settings[config.config_key] = JSON.parse(config.config_value);
    } catch (error) {
      console.error(`[PM2_ERROR] Failed to parse config ${config.config_key}: ${error.message}`);
      settings[config.config_key] = defaultSettings[config.config_key] || null;
    }
  });

  return settings;
};

router.get('/', (_req, res) => {
  try {
    const siteSettings = getSiteSettings();
    const { list: genres } = getGenreCategoryConfig(db);
    const featureFlags = getAllFlags();

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({
      success: true,
      data: {
        siteSettings,
        genres,
        featureFlags
      }
    });
  } catch (error) {
    console.error('[PM2_ERROR] Bootstrap endpoint failed', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load bootstrap data'
    });
  }
});

export default router;
