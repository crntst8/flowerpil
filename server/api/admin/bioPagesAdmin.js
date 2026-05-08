/**
 * Admin API endpoints for bio page administration and bulk operations
 * Route: /api/v1/admin/bio-pages
 */

import express from 'express';
import { getDatabase } from '../../database/db.js';
import { apiLoggingMiddleware } from '../../middleware/logging.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = express.Router();

// Apply logging and auth middleware to all bio pages admin routes
router.use(apiLoggingMiddleware);
router.use(authMiddleware); // Admin only

const db = getDatabase();

// Prepared statements for bio pages administration
const queries = {
  // Get all bio pages with admin settings and curator info
  getAllBioPages: db.prepare(`
    SELECT 
      bp.id,
      bp.handle,
      bp.curator_id,
      c.name as curator_name,
      c.profile_type as curator_type,
      bp.is_published,
      bp.created_at,
      bp.updated_at,
      bp.published_at,
      bas.locked,
      bas.locked_by,
      bas.locked_reason,
      bas.optimization_status,
      bas.performance_score,
      bas.priority_featured,
      COUNT(DISTINCT bav.id) as total_views,
      COUNT(DISTINCT bac.id) as total_clicks
    FROM bio_profiles bp
    LEFT JOIN curators c ON bp.curator_id = c.id
    LEFT JOIN bio_admin_settings bas ON bp.id = bas.bio_profile_id
    LEFT JOIN bio_analytics_views bav ON bp.id = bav.bio_profile_id
    LEFT JOIN bio_analytics_clicks bac ON bp.id = bac.bio_profile_id
    GROUP BY bp.id
    ORDER BY bp.updated_at DESC
    LIMIT 500
  `),
  
  // Search bio pages
  searchBioPages: db.prepare(`
    SELECT 
      bp.id,
      bp.handle,
      bp.curator_id,
      c.name as curator_name,
      bp.is_published,
      bp.created_at,
      bp.updated_at,
      bas.locked,
      bas.optimization_status
    FROM bio_profiles bp
    LEFT JOIN curators c ON bp.curator_id = c.id
    LEFT JOIN bio_admin_settings bas ON bp.id = bas.bio_profile_id
    WHERE bp.handle LIKE ? OR c.name LIKE ?
    ORDER BY bp.updated_at DESC
    LIMIT 100
  `),
  
  // Get bio page details for admin
  getBioPageDetails: db.prepare(`
    SELECT 
      bp.*,
      c.name as curator_name,
      c.profile_type as curator_type,
      c.bio as curator_bio,
      bas.*
    FROM bio_profiles bp
    LEFT JOIN curators c ON bp.curator_id = c.id
    LEFT JOIN bio_admin_settings bas ON bp.id = bas.bio_profile_id
    WHERE bp.id = ?
  `),
  
  // Bulk operations
  bulkPublish: db.prepare(`
    UPDATE bio_profiles 
    SET is_published = 1, published_at = datetime('now') 
    WHERE id = ? AND is_published = 0
  `),
  
  bulkUnpublish: db.prepare(`
    UPDATE bio_profiles 
    SET is_published = 0, published_at = NULL 
    WHERE id = ? AND is_published = 1
  `),
  
  bulkLock: db.prepare(`
    INSERT OR REPLACE INTO bio_admin_settings 
    (bio_profile_id, locked, locked_by, locked_reason, locked_at) 
    VALUES (?, 1, ?, ?, datetime('now'))
  `),
  
  bulkUnlock: db.prepare(`
    UPDATE bio_admin_settings 
    SET locked = 0, locked_by = NULL, locked_reason = NULL, locked_at = NULL
    WHERE bio_profile_id = ?
  `),
  
  bulkDelete: db.prepare(`
    DELETE FROM bio_profiles WHERE id = ?
  `),
  
  // Admin stats
  getAdminStats: db.prepare(`
    SELECT 
      COUNT(*) as total_bio_pages,
      COUNT(CASE WHEN is_published = 1 THEN 1 END) as published_pages,
      COUNT(CASE WHEN is_published = 0 THEN 1 END) as draft_pages,
      COUNT(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 END) as created_this_week,
      COUNT(CASE WHEN updated_at >= datetime('now', '-7 days') THEN 1 END) as updated_this_week
    FROM bio_profiles
  `),
  
  getLockedPagesStats: db.prepare(`
    SELECT COUNT(*) as locked_pages
    FROM bio_admin_settings 
    WHERE locked = 1
  `),
  
  getOptimizationStats: db.prepare(`
    SELECT 
      optimization_status,
      COUNT(*) as count
    FROM bio_admin_settings 
    GROUP BY optimization_status
  `),
  
  // Recent activity
  getRecentActivity: db.prepare(`
    SELECT 
      al.*,
      au.username,
      bp.handle as bio_handle
    FROM admin_audit_log al
    LEFT JOIN admin_users au ON al.admin_user_id = au.id
    LEFT JOIN bio_profiles bp ON al.resource_id = bp.id
    WHERE al.resource_type IN ('bio_profile', 'bio_admin_settings')
    ORDER BY al.timestamp DESC
    LIMIT 50
  `),
  
  // Featured pages management
  setFeaturedStatus: db.prepare(`
    INSERT OR REPLACE INTO bio_admin_settings 
    (bio_profile_id, priority_featured) 
    VALUES (?, ?)
  `),
  
  getFeaturedPages: db.prepare(`
    SELECT 
      bp.id,
      bp.handle,
      c.name as curator_name,
      bp.is_published,
      bas.priority_featured
    FROM bio_profiles bp
    LEFT JOIN curators c ON bp.curator_id = c.id
    LEFT JOIN bio_admin_settings bas ON bp.id = bas.bio_profile_id
    WHERE bas.priority_featured = 1
    ORDER BY bp.updated_at DESC
  `),
  
  // Audit logging
  logAdminOperation: db.prepare(`
    INSERT INTO admin_audit_log 
    (admin_user_id, action_type, resource_type, resource_id, details, ip_address, session_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
};

/**
 * GET /api/v1/admin/bio-pages
 * Get all bio pages with admin controls and filtering
 */
router.get('/', (req, res) => {
  try {
    const { 
      status, // published, draft, locked
      optimization, // pending, optimized, needs_attention
      search,
      featured
    } = req.query;
    
    let bioPages;
    
    if (search && search.length >= 2) {
      const searchPattern = `%${search.toLowerCase()}%`;
      bioPages = queries.searchBioPages.all(searchPattern, searchPattern);
    } else {
      bioPages = queries.getAllBioPages.all();
    }
    
    // Apply filters
    if (status) {
      if (status === 'published') {
        bioPages = bioPages.filter(bp => bp.is_published === 1);
      } else if (status === 'draft') {
        bioPages = bioPages.filter(bp => bp.is_published === 0);
      } else if (status === 'locked') {
        bioPages = bioPages.filter(bp => bp.locked === 1);
      }
    }
    
    if (optimization && ['pending', 'optimized', 'needs_attention'].includes(optimization)) {
      bioPages = bioPages.filter(bp => bp.optimization_status === optimization);
    }
    
    if (featured === 'true') {
      bioPages = bioPages.filter(bp => bp.priority_featured === 1);
    }
    
    // Get admin statistics
    const stats = queries.getAdminStats.get();
    const lockedStats = queries.getLockedPagesStats.get();
    const optimizationStats = queries.getOptimizationStats.all();
    
    res.json({
      success: true,
      data: {
        bio_pages: bioPages,
        stats: {
          ...stats,
          ...lockedStats,
          optimization_breakdown: optimizationStats
        },
        filters: { status, optimization, search, featured },
        count: bioPages.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Bio pages admin get all error: ${JSON.stringify({
      query: req.query,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bio pages'
    });
  }
});

/**
 * GET /api/v1/admin/bio-pages/dashboard
 * Get admin dashboard overview
 */
router.get('/dashboard', (req, res) => {
  try {
    const stats = queries.getAdminStats.get();
    const lockedStats = queries.getLockedPagesStats.get();
    const optimizationStats = queries.getOptimizationStats.all();
    const recentActivity = queries.getRecentActivity.all();
    const featuredPages = queries.getFeaturedPages.all();
    
    // Parse activity details
    const parsedActivity = recentActivity.map(entry => ({
      ...entry,
      details: entry.details ? JSON.parse(entry.details) : null
    }));
    
    res.json({
      success: true,
      data: {
        overview: {
          ...stats,
          ...lockedStats,
          optimization_breakdown: optimizationStats
        },
        recent_activity: parsedActivity,
        featured_pages: featuredPages,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Bio pages admin dashboard error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin dashboard data'
    });
  }
});

/**
 * GET /api/v1/admin/bio-pages/:id
 * Get detailed bio page information for admin
 */
router.get('/:id', (req, res) => {
  try {
    const bioId = parseInt(req.params.id, 10);
    
    if (!bioId || isNaN(bioId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bio page ID'
      });
    }
    
    const bioPage = queries.getBioPageDetails.get(bioId);
    
    if (!bioPage) {
      return res.status(404).json({
        success: false,
        error: 'Bio page not found'
      });
    }
    
    // Parse JSON fields
    const parsedBioPage = {
      ...bioPage,
      display_settings: bioPage.display_settings ? JSON.parse(bioPage.display_settings) : null,
      theme_settings: bioPage.theme_settings ? JSON.parse(bioPage.theme_settings) : null,
      seo_metadata: bioPage.seo_metadata ? JSON.parse(bioPage.seo_metadata) : null,
      draft_content: bioPage.draft_content ? JSON.parse(bioPage.draft_content) : null,
      published_content: bioPage.published_content ? JSON.parse(bioPage.published_content) : null
    };
    
    res.json({
      success: true,
      data: {
        bio_page: parsedBioPage,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Bio pages admin get details error: ${JSON.stringify({
      bioId: req.params.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bio page details'
    });
  }
});

/**
 * POST /api/v1/admin/bio-pages/bulk-operation
 * Perform bulk operations on bio pages
 */
router.post('/bulk-operation', (req, res) => {
  try {
    const { operation, bio_page_ids, options = {} } = req.body;
    
    if (!operation || !bio_page_ids || !Array.isArray(bio_page_ids) || bio_page_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'operation and bio_page_ids array are required'
      });
    }
    
    if (!['publish', 'unpublish', 'lock', 'unlock', 'delete', 'set_featured'].includes(operation)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid operation. Must be publish, unpublish, lock, unlock, delete, or set_featured'
      });
    }
    
    const results = [];
    
    for (const bioId of bio_page_ids) {
      try {
        let result;
        let success = false;
        
        switch (operation) {
          case 'publish':
            result = queries.bulkPublish.run(bioId);
            success = result.changes > 0;
            break;
            
          case 'unpublish':
            result = queries.bulkUnpublish.run(bioId);
            success = result.changes > 0;
            break;
            
          case 'lock':
            queries.bulkLock.run(bioId, req.user.id, options.reason || 'Admin bulk lock');
            success = true;
            break;
            
          case 'unlock':
            result = queries.bulkUnlock.run(bioId);
            success = result.changes > 0;
            break;
            
          case 'delete':
            result = queries.bulkDelete.run(bioId);
            success = result.changes > 0;
            break;
            
          case 'set_featured':
            queries.setFeaturedStatus.run(bioId, options.featured ? 1 : 0);
            success = true;
            break;
        }
        
        results.push({
          bio_page_id: bioId,
          operation: operation,
          success: success,
          changes: result?.changes || 0
        });
        
        // Log the operation
        if (success) {
          queries.logAdminOperation.run(
            req.user.id,
            `bulk_${operation}`,
            'bio_profile',
            bioId,
            JSON.stringify({
              operation: operation,
              options: options,
              bulk_operation: true
            }),
            req.ip,
            req.sessionID || null
          );
        }
      } catch (error) {
        results.push({
          bio_page_id: bioId,
          operation: operation,
          success: false,
          error: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      success: true,
      data: {
        operation: operation,
        results: results,
        total_processed: results.length,
        successful_operations: successCount,
        failed_operations: results.length - successCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Bio pages admin bulk operation error: ${JSON.stringify({
      body: req.body,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to perform bulk operation'
    });
  }
});

/**
 * POST /api/v1/admin/bio-pages/:id/lock
 * Lock a bio page from editing
 */
router.post('/:id/lock', (req, res) => {
  try {
    const bioId = parseInt(req.params.id, 10);
    const { reason } = req.body;
    
    if (!bioId || isNaN(bioId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bio page ID'
      });
    }
    
    queries.bulkLock.run(bioId, req.user.id, reason || 'Admin lock');
    
    // Log the operation
    queries.logAdminOperation.run(
      req.user.id,
      'lock_bio_page',
      'bio_profile',
      bioId,
      JSON.stringify({
        reason: reason,
        locked_by: req.user.id
      }),
      req.ip,
      req.sessionID || null
    );
    
    res.json({
      success: true,
      data: {
        bio_page_id: bioId,
        locked: true,
        locked_by: req.user.id,
        reason: reason,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Bio pages admin lock error: ${JSON.stringify({
      bioId: req.params.id,
      body: req.body,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to lock bio page'
    });
  }
});

/**
 * POST /api/v1/admin/bio-pages/:id/unlock
 * Unlock a bio page for editing
 */
router.post('/:id/unlock', (req, res) => {
  try {
    const bioId = parseInt(req.params.id, 10);
    
    if (!bioId || isNaN(bioId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bio page ID'
      });
    }
    
    const result = queries.bulkUnlock.run(bioId);
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bio page not found or not locked'
      });
    }
    
    // Log the operation
    queries.logAdminOperation.run(
      req.user.id,
      'unlock_bio_page',
      'bio_profile',
      bioId,
      JSON.stringify({
        unlocked_by: req.user.id
      }),
      req.ip,
      req.sessionID || null
    );
    
    res.json({
      success: true,
      data: {
        bio_page_id: bioId,
        unlocked: true,
        unlocked_by: req.user.id,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Bio pages admin unlock error: ${JSON.stringify({
      bioId: req.params.id,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to unlock bio page'
    });
  }
});

export default router;