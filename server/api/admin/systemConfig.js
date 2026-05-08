/**
 * Admin API endpoints for system configuration management
 * Route: /api/v1/admin/system-config
 */

import express from 'express';
import { getDatabase } from '../../database/db.js';
import { apiLoggingMiddleware } from '../../middleware/logging.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = express.Router();

// Apply logging and auth middleware to all system config routes
router.use(apiLoggingMiddleware);
router.use(authMiddleware); // Admin only

const db = getDatabase();

// Prepared statements for system configuration
const queries = {
  // Get all configurations
  getAllConfigs: db.prepare(`
    SELECT 
      sc.*,
      au.username as updated_by_username
    FROM admin_system_config sc
    LEFT JOIN admin_users au ON sc.updated_by = au.id
    ORDER BY sc.config_type, sc.config_key
  `),
  
  // Get configurations by type
  getConfigsByType: db.prepare(`
    SELECT * FROM admin_system_config 
    WHERE config_type = ?
    ORDER BY config_key
  `),
  
  // Get single configuration
  getConfigByKey: db.prepare(`
    SELECT 
      sc.*,
      au.username as updated_by_username
    FROM admin_system_config sc
    LEFT JOIN admin_users au ON sc.updated_by = au.id
    WHERE sc.config_key = ?
  `),
  
  // Update configuration
  updateConfig: db.prepare(`
    UPDATE admin_system_config 
    SET 
      config_value = ?,
      updated_by = ?,
      updated_at = datetime('now')
    WHERE config_key = ?
  `),
  
  // Create new configuration
  createConfig: db.prepare(`
    INSERT INTO admin_system_config 
    (config_key, config_value, config_type, description, updated_by) 
    VALUES (?, ?, ?, ?, ?)
  `),
  
  // Delete configuration
  deleteConfig: db.prepare(`
    DELETE FROM admin_system_config 
    WHERE config_key = ?
  `),
  
  // Audit log for config changes
  logConfigOperation: db.prepare(`
    INSERT INTO admin_audit_log 
    (admin_user_id, action_type, resource_type, resource_id, details, ip_address, session_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  
  // Get configuration history
  getConfigHistory: db.prepare(`
    SELECT 
      al.*,
      au.username
    FROM admin_audit_log al
    LEFT JOIN admin_users au ON al.admin_user_id = au.id
    WHERE al.resource_type = 'system_config'
    ORDER BY al.timestamp DESC
    LIMIT 100
  `)
};

// Default system configurations
const DEFAULT_CONFIGS = {
  'bio_creation_daily_limit': {
    value: { limit: 10, window_hours: 24 },
    type: 'system',
    description: 'Daily limit for bio page creation per user'
  },
  'performance_monitoring_interval': {
    value: { interval_seconds: 300, retention_days: 30 },
    type: 'performance',
    description: 'How often to collect performance metrics'
  },
  'security_alert_thresholds': {
    value: { failed_logins: 5, rate_limit_hits: 20, unusual_activity_score: 80 },
    type: 'security',
    description: 'Threshold values for security alerts'
  },
  'handle_reservation_expiry': {
    value: { default_days: 30, vip_days: 90 },
    type: 'system',
    description: 'Default expiry times for handle reservations'
  },
  'performance_optimization_thresholds': {
    value: { page_load_ms: 2000, image_load_ms: 1000, query_ms: 100 },
    type: 'performance',
    description: 'Performance thresholds for optimization alerts'
  },
  'cache_management': {
    value: { 
      bio_page_ttl: 3600, 
      analytics_ttl: 300, 
      static_assets_ttl: 86400,
      enable_edge_caching: true 
    },
    type: 'performance',
    description: 'Cache management and TTL settings'
  },
  'rate_limiting': {
    value: {
      api_requests_per_minute: 60,
      bio_page_views_per_minute: 100,
      admin_requests_per_minute: 200
    },
    type: 'security',
    description: 'Rate limiting configuration'
  },
  'analytics_settings': {
    value: {
      data_retention_days: 365,
      enable_detailed_tracking: true,
      privacy_mode: false,
      anonymize_after_days: 90
    },
    type: 'analytics',
    description: 'Analytics and privacy settings'
  },
  'hide_curator_type_sitewide': {
    value: {
      enabled: false
    },
    type: 'system',
    description: 'Hide curator type display sitewide (except on CuratorProfilePage)'
  },
  'tester_feedback_sitewide': {
    value: {
      enabled: String(process.env.FEATURE_TESTER_FEEDBACK || '').toLowerCase() === 'true'
    },
    type: 'system',
    description: 'Enable tester feedback widget and API access for tester accounts'
  },
  'show_top10_in_nav': {
    value: {
      enabled: false
    },
    type: 'system',
    description: 'Show Top 10 link in public navigation'
  },
  'instagram_track_linking_enabled': {
    value: {
      enabled: false
    },
    type: 'system',
    description: 'Enable Instagram profile linking for playlist tracks'
  },
  'playlist_love_enabled': {
    value: {
      enabled: true
    },
    type: 'system',
    description: 'Enable the playlist love button on public playlist pages'
  },
  'playlist_comments_enabled': {
    value: {
      enabled: true
    },
    type: 'system',
    description: 'Enable the playlist comments section on public playlist pages'
  },
  'open_signup_enabled': {
    value: {
      enabled: false
    },
    type: 'system',
    description: 'Enable open signup without referral codes'
  },
  'meta_pixel_enabled': {
    value: { enabled: false },
    type: 'analytics',
    description: 'Enable Meta Pixel tracking on the public site'
  },
  'meta_ads_enabled': {
    value: { enabled: false },
    type: 'analytics',
    description: 'Enable Meta Ads integrations for curators'
  },
  'meta_require_admin_approval': {
    value: { enabled: true },
    type: 'analytics',
    description: 'Require admin approval before Meta OAuth is allowed'
  },
  'meta_pixel_mode': {
    value: { mode: 'curator' },
    type: 'analytics',
    description: 'Meta Pixel routing mode: curator, global, or both'
  },
  'meta_global_pixel_id': {
    value: { value: '' },
    type: 'analytics',
    description: 'Global Meta Pixel ID for platform-wide tracking'
  },
  'meta_pixel_advanced_matching': {
    value: { enabled: false },
    type: 'analytics',
    description: 'Enable advanced matching for Meta Pixel'
  }
};

/**
 * GET /api/v1/admin/system-config
 * Get all system configurations
 */
router.get('/', (req, res) => {
  try {
    const { type } = req.query;
    
    let configs;
    if (type && ['system', 'performance', 'security', 'analytics'].includes(type)) {
      configs = queries.getConfigsByType.all(type);
    } else {
      configs = queries.getAllConfigs.all();
    }
    
    // Parse JSON config values
    const parsedConfigs = configs.map(config => ({
      ...config,
      config_value: config.config_value ? JSON.parse(config.config_value) : null
    }));
    
    // Group by type for easier frontend consumption
    const groupedConfigs = {};
    parsedConfigs.forEach(config => {
      if (!groupedConfigs[config.config_type]) {
        groupedConfigs[config.config_type] = [];
      }
      groupedConfigs[config.config_type].push(config);
    });
    
    res.json({
      success: true,
      data: {
        configurations: parsedConfigs,
        grouped: groupedConfigs,
        count: parsedConfigs.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] System config get all error: ${JSON.stringify({
      query: req.query,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system configurations'
    });
  }
});

/**
 * GET /api/v1/admin/system-config/:key
 * Get specific configuration by key
 */
router.get('/:key', (req, res) => {
  try {
    const configKey = req.params.key;
    
    const config = queries.getConfigByKey.get(configKey);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found',
        config_key: configKey
      });
    }
    
    // Parse JSON config value
    const parsedConfig = {
      ...config,
      config_value: config.config_value ? JSON.parse(config.config_value) : null
    };
    
    res.json({
      success: true,
      data: {
        configuration: parsedConfig,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] System config get by key error: ${JSON.stringify({
      configKey: req.params.key,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch configuration'
    });
  }
});

/**
 * PUT /api/v1/admin/system-config/:key
 * Update system configuration
 */
router.put('/:key', (req, res) => {
  try {
    const configKey = req.params.key;
    const { config_value, config_type, description } = req.body;
    
    if (!config_value) {
      return res.status(400).json({
        success: false,
        error: 'config_value is required'
      });
    }
    
    // Get existing configuration
    const existingConfig = queries.getConfigByKey.get(configKey);
    
    if (!existingConfig) {
      // Create new configuration if it doesn't exist
      if (!config_type) {
        return res.status(400).json({
          success: false,
          error: 'config_type is required for new configurations'
        });
      }
      
      const result = queries.createConfig.run(
        configKey,
        JSON.stringify(config_value),
        config_type,
        description || null,
        req.user.id
      );
      
      // Log the creation
      queries.logConfigOperation.run(
        req.user.id,
        'create_config',
        'system_config',
        result.lastInsertRowid,
        JSON.stringify({
          config_key: configKey,
          config_value: config_value,
          config_type: config_type
        }),
        req.ip,
        req.sessionID || null
      );
      
      res.json({
        success: true,
        data: {
          config_key: configKey,
          config_value: config_value,
          action: 'created',
          updated_by: req.user.id,
          timestamp: new Date().toISOString()
        }
      });
    } else {
      // Update existing configuration
      const result = queries.updateConfig.run(
        JSON.stringify(config_value),
        req.user.id,
        configKey
      );
      
      if (result.changes === 0) {
        return res.status(404).json({
          success: false,
          error: 'Configuration not found or no changes made'
        });
      }
      
      // Log the update
      queries.logConfigOperation.run(
        req.user.id,
        'update_config',
        'system_config',
        existingConfig.id,
        JSON.stringify({
          config_key: configKey,
          old_value: existingConfig.config_value ? JSON.parse(existingConfig.config_value) : null,
          new_value: config_value
        }),
        req.ip,
        req.sessionID || null
      );
      
      res.json({
        success: true,
        data: {
          config_key: configKey,
          config_value: config_value,
          action: 'updated',
          updated_by: req.user.id,
          timestamp: new Date().toISOString()
        }
      });
    }
  } catch (error) {
    console.error(`[PM2_ERROR] System config update error: ${JSON.stringify({
      configKey: req.params.key,
      body: req.body,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to update configuration'
    });
  }
});

/**
 * POST /api/v1/admin/system-config/reset-defaults
 * Reset configurations to default values
 */
router.post('/reset-defaults', (req, res) => {
  try {
    const { config_keys } = req.body;
    
    let keysToReset = config_keys;
    if (!keysToReset || !Array.isArray(keysToReset) || keysToReset.length === 0) {
      // Reset all defaults if no specific keys provided
      keysToReset = Object.keys(DEFAULT_CONFIGS);
    }
    
    const results = [];
    
    for (const key of keysToReset) {
      if (DEFAULT_CONFIGS[key]) {
        const defaultConfig = DEFAULT_CONFIGS[key];
        
        // Check if config exists
        const existingConfig = queries.getConfigByKey.get(key);
        
        if (existingConfig) {
          // Update to default
          const result = queries.updateConfig.run(
            JSON.stringify(defaultConfig.value),
            req.user.id,
            key
          );
          
          if (result.changes > 0) {
            results.push({ key, action: 'reset_to_default', success: true });
          } else {
            results.push({ key, action: 'no_change', success: true });
          }
        } else {
          // Create with default
          queries.createConfig.run(
            key,
            JSON.stringify(defaultConfig.value),
            defaultConfig.type,
            defaultConfig.description,
            req.user.id
          );
          
          results.push({ key, action: 'created_with_default', success: true });
        }
        
        // Log the operation
        queries.logConfigOperation.run(
          req.user.id,
          'reset_to_default',
          'system_config',
          existingConfig ? existingConfig.id : null,
          JSON.stringify({
            config_key: key,
            default_value: defaultConfig.value
          }),
          req.ip,
          req.sessionID || null
        );
      } else {
        results.push({ key, action: 'no_default_available', success: false });
      }
    }
    
    res.json({
      success: true,
      data: {
        results: results,
        processed_count: results.length,
        successful_resets: results.filter(r => r.success).length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] System config reset defaults error: ${JSON.stringify({
      body: req.body,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to reset configurations to defaults'
    });
  }
});

/**
 * DELETE /api/v1/admin/system-config/:key
 * Delete system configuration
 */
router.delete('/:key', (req, res) => {
  try {
    const configKey = req.params.key;
    
    // Get existing config for logging
    const existingConfig = queries.getConfigByKey.get(configKey);
    if (!existingConfig) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }
    
    const result = queries.deleteConfig.run(configKey);
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }
    
    // Log the deletion
    queries.logConfigOperation.run(
      req.user.id,
      'delete_config',
      'system_config',
      existingConfig.id,
      JSON.stringify({
        config_key: configKey,
        deleted_value: existingConfig.config_value ? JSON.parse(existingConfig.config_value) : null
      }),
      req.ip,
      req.sessionID || null
    );
    
    res.json({
      success: true,
      data: {
        config_key: configKey,
        deleted: true,
        deleted_by: req.user.id,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] System config delete error: ${JSON.stringify({
      configKey: req.params.key,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete configuration'
    });
  }
});

/**
 * GET /api/v1/admin/system-config/history/:key
 * Get configuration change history for a specific key
 */
router.get('/history/:key', (req, res) => {
  try {
    const configKey = req.params.key;
    
    const history = queries.getConfigHistory.all();
    
    // Filter for specific config key
    const keyHistory = history.filter(entry => {
      if (entry.details) {
        try {
          const details = JSON.parse(entry.details);
          return details.config_key === configKey;
        } catch (e) {
          return false;
        }
      }
      return false;
    });
    
    // Parse details JSON for each entry
    const parsedHistory = keyHistory.map(entry => ({
      ...entry,
      details: entry.details ? JSON.parse(entry.details) : null
    }));
    
    res.json({
      success: true,
      data: {
        config_key: configKey,
        history: parsedHistory,
        count: parsedHistory.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] System config history error: ${JSON.stringify({
      configKey: req.params.key,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch configuration history'
    });
  }
});

/**
 * GET /api/v1/admin/system-config/defaults/available
 * Get available default configurations
 */
router.get('/defaults/available', (req, res) => {
  try {
    const availableDefaults = Object.entries(DEFAULT_CONFIGS).map(([key, config]) => ({
      key,
      value: config.value,
      type: config.type,
      description: config.description
    }));
    
    res.json({
      success: true,
      data: {
        available_defaults: availableDefaults,
        count: availableDefaults.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] System config available defaults error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available default configurations'
    });
  }
});

export default router;
