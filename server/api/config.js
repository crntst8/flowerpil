import express from 'express';
import { getDatabase } from '../database/db.js';

const router = express.Router();
const db = getDatabase();
const envTesterFeedbackEnabled = String(process.env.FEATURE_TESTER_FEEDBACK || '').toLowerCase() === 'true';

/**
 * GET /api/v1/config/google-places-key
 * Returns the Google Places API key for frontend usage, if configured.
 */
router.get('/google-places-key', (_req, res) => {
  const apiKey =
    process.env.VITE_GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_PLACES_KEY ||
    process.env.MAPS_API_KEY ||
    '';

  if (!apiKey) {
    return res.status(404).json({
      success: false,
      error: 'Google Places API key not configured'
    });
  }

  res.json({
    success: true,
    key: apiKey
  });
});

/**
 * GET /api/v1/config/site-settings
 * Returns public site-wide settings for frontend usage
 */
router.get('/site-settings', (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    // Default settings
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

    // Query to get specific public site settings
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

    // Parse and structure the settings, starting with defaults
    const settings = { ...defaultSettings };
    configs.forEach(config => {
      try {
        settings[config.config_key] = JSON.parse(config.config_value);
      } catch (e) {
        console.error(`[PM2_ERROR] Failed to parse config ${config.config_key}: ${e.message}`);
        settings[config.config_key] = defaultSettings[config.config_key] || null;
      }
    });

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    console.error(`[PM2_ERROR] Site settings fetch error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    // Return default values on error
    res.json({
      success: true,
      data: {
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
      }
    });
  }
});

export default router;
