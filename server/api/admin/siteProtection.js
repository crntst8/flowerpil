/**
 * Admin API endpoints for managing site protection
 * Route: /api/v1/admin/site-protection
 */

import express from 'express';
import { 
  isSiteProtectionEnabled,
  enableSiteProtection,
  disableSiteProtection,
  getSiteProtectionStatus,
  toggleSiteProtection 
} from '../../utils/siteProtection.js';

const router = express.Router();

/**
 * GET /api/v1/admin/site-protection/status
 * Get current site protection status
 */
router.get('/status', (req, res) => {
  try {
    const status = getSiteProtectionStatus();
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting site protection status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get site protection status',
      details: error.message
    });
  }
});

/**
 * POST /api/v1/admin/site-protection/enable
 * Enable site protection
 * Body: { password?: string, username?: string }
 */
router.post('/enable', (req, res) => {
  try {
    const { password = 'FlowerpilTest2025', username = 'flowerpil' } = req.body;
    
    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }
    
    const result = enableSiteProtection(password, username);
    
    if (result) {
      res.json({
        success: true,
        message: `Site protection enabled for user: ${username}`,
        data: getSiteProtectionStatus()
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to enable site protection'
      });
    }
  } catch (error) {
    console.error('Error enabling site protection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable site protection',
      details: error.message
    });
  }
});

/**
 * POST /api/v1/admin/site-protection/disable
 * Disable site protection
 */
router.post('/disable', (req, res) => {
  try {
    const result = disableSiteProtection();
    
    if (result) {
      res.json({
        success: true,
        message: 'Site protection disabled',
        data: getSiteProtectionStatus()
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to disable site protection'
      });
    }
  } catch (error) {
    console.error('Error disabling site protection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable site protection',
      details: error.message
    });
  }
});

/**
 * POST /api/v1/admin/site-protection/toggle
 * Toggle site protection on/off
 * Body: { enable: boolean, password?: string }
 */
router.post('/toggle', (req, res) => {
  try {
    const { enable, password = 'FlowerpilTest2025' } = req.body;
    
    if (typeof enable !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enable parameter must be a boolean'
      });
    }
    
    if (enable && (!password || password.length < 6)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long when enabling protection'
      });
    }
    
    const result = toggleSiteProtection(enable, password);
    
    if (result) {
      res.json({
        success: true,
        message: `Site protection ${enable ? 'enabled' : 'disabled'}`,
        data: getSiteProtectionStatus()
      });
    } else {
      res.status(500).json({
        success: false,
        error: `Failed to ${enable ? 'enable' : 'disable'} site protection`
      });
    }
  } catch (error) {
    console.error('Error toggling site protection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle site protection',
      details: error.message
    });
  }
});

export default router;