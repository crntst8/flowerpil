/**
 * Admin API endpoints for security monitoring and incident management
 * Route: /api/v1/admin/security-monitor
 */

import express from 'express';
import { getDatabase } from '../../database/db.js';
import { apiLoggingMiddleware } from '../../middleware/logging.js';
import { authMiddleware } from '../../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

// Apply logging and auth middleware to all security monitor routes
router.use(apiLoggingMiddleware);
router.use(authMiddleware); // Admin only

const db = getDatabase();

// Prepared statements for security monitoring
const queries = {
  // Security incidents
  getAllIncidents: db.prepare(`
    SELECT 
      si.*,
      au.username as resolved_by_username
    FROM security_incidents si
    LEFT JOIN admin_users au ON si.resolved_by = au.id
    ORDER BY si.timestamp DESC
    LIMIT 500
  `),
  
  getIncidentById: db.prepare(`
    SELECT 
      si.*,
      au.username as resolved_by_username
    FROM security_incidents si
    LEFT JOIN admin_users au ON si.resolved_by = au.id
    WHERE si.id = ?
  `),
  
  getIncidentsByStatus: db.prepare(`
    SELECT * FROM security_incidents 
    WHERE resolved = ? 
    ORDER BY timestamp DESC
    LIMIT 200
  `),
  
  getIncidentsBySeverity: db.prepare(`
    SELECT * FROM security_incidents 
    WHERE severity = ? 
    ORDER BY timestamp DESC
    LIMIT 100
  `),
  
  // Recent incidents
  getRecentIncidents: db.prepare(`
    SELECT * FROM security_incidents 
    WHERE timestamp >= datetime('now', '-24 hours')
    ORDER BY severity DESC, timestamp DESC
  `),
  
  // Critical unresolved incidents
  getCriticalIncidents: db.prepare(`
    SELECT * FROM security_incidents 
    WHERE severity IN ('high', 'critical') 
    AND resolved = 0
    ORDER BY timestamp DESC
  `),
  
  // Security statistics
  getSecurityStats: db.prepare(`
    SELECT 
      COUNT(*) as total_incidents,
      COUNT(CASE WHEN resolved = 0 THEN 1 END) as unresolved_incidents,
      COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_incidents,
      COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_severity_incidents,
      COUNT(CASE WHEN timestamp >= datetime('now', '-24 hours') THEN 1 END) as recent_incidents
    FROM security_incidents
  `),
  
  getIncidentTypeStats: db.prepare(`
    SELECT 
      incident_type,
      COUNT(*) as count,
      COUNT(CASE WHEN resolved = 0 THEN 1 END) as unresolved_count,
      MAX(timestamp) as latest_incident
    FROM security_incidents 
    WHERE timestamp >= datetime('now', '-7 days')
    GROUP BY incident_type
    ORDER BY count DESC
  `),
  
  // Create security incident
  createIncident: db.prepare(`
    INSERT INTO security_incidents 
    (incident_type, severity, user_identifier, details, ip_address, user_agent_hash, geo_location) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  
  // Update incident resolution
  resolveIncident: db.prepare(`
    UPDATE security_incidents 
    SET 
      resolved = 1,
      resolved_by = ?,
      resolution_notes = ?,
      timestamp = COALESCE(timestamp, datetime('now'))
    WHERE id = ?
  `),
  
  // Update incident severity
  updateIncidentSeverity: db.prepare(`
    UPDATE security_incidents 
    SET severity = ?
    WHERE id = ?
  `),
  
  // User restriction queries
  getAllUserRestrictions: db.prepare(`
    SELECT 
      ur.*,
      au.username as applied_by_username
    FROM bio_user_restrictions ur
    LEFT JOIN admin_users au ON ur.applied_by = au.id
    WHERE ur.active = 1
    ORDER BY ur.applied_at DESC
    LIMIT 200
  `),
  
  getUserRestrictions: db.prepare(`
    SELECT * FROM bio_user_restrictions 
    WHERE user_identifier = ? AND active = 1
  `),
  
  createUserRestriction: db.prepare(`
    INSERT INTO bio_user_restrictions 
    (user_identifier, restriction_type, restriction_value, reason, applied_by, expires_at) 
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  
  removeUserRestriction: db.prepare(`
    UPDATE bio_user_restrictions 
    SET active = 0 
    WHERE id = ?
  `),
  
  // Audit log queries
  getRecentAuditLog: db.prepare(`
    SELECT 
      al.*,
      au.username
    FROM admin_audit_log al
    LEFT JOIN admin_users au ON al.admin_user_id = au.id
    ORDER BY al.timestamp DESC
    LIMIT 100
  `),
  
  // Security alert thresholds
  getSecurityThresholds: db.prepare(`
    SELECT config_value FROM admin_system_config 
    WHERE config_key = 'security_alert_thresholds'
  `)
};

/**
 * GET /api/v1/admin/security-monitor/incidents
 * Get security incidents with optional filters
 */
router.get('/incidents', (req, res) => {
  try {
    const { status, severity, type } = req.query;
    
    let incidents;
    if (status === 'resolved') {
      incidents = queries.getIncidentsByStatus.all(1);
    } else if (status === 'unresolved') {
      incidents = queries.getIncidentsByStatus.all(0);
    } else if (severity && ['low', 'medium', 'high', 'critical'].includes(severity)) {
      incidents = queries.getIncidentsBySeverity.all(severity);
    } else {
      incidents = queries.getAllIncidents.all();
    }
    
    // Parse JSON details for each incident
    incidents = incidents.map(incident => ({
      ...incident,
      details: incident.details ? JSON.parse(incident.details) : null
    }));
    
    const stats = queries.getSecurityStats.get();
    const typeStats = queries.getIncidentTypeStats.all();
    
    res.json({
      success: true,
      data: {
        incidents: incidents,
        stats: stats,
        type_stats: typeStats,
        filters: { status, severity, type },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Security monitor incidents error: ${JSON.stringify({
      query: req.query,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch security incidents'
    });
  }
});

/**
 * GET /api/v1/admin/security-monitor/dashboard
 * Get security dashboard summary
 */
router.get('/dashboard', (req, res) => {
  try {
    const stats = queries.getSecurityStats.get();
    const recentIncidents = queries.getRecentIncidents.all();
    const criticalIncidents = queries.getCriticalIncidents.all();
    const typeStats = queries.getIncidentTypeStats.all();
    const recentAuditLog = queries.getRecentAuditLog.all();
    
    // Parse JSON details for recent incidents
    const parsedRecentIncidents = recentIncidents.map(incident => ({
      ...incident,
      details: incident.details ? JSON.parse(incident.details) : null
    }));
    
    const parsedCriticalIncidents = criticalIncidents.map(incident => ({
      ...incident,
      details: incident.details ? JSON.parse(incident.details) : null
    }));
    
    res.json({
      success: true,
      data: {
        overview: stats,
        recent_incidents: parsedRecentIncidents,
        critical_incidents: parsedCriticalIncidents,
        incident_types: typeStats,
        recent_admin_actions: recentAuditLog.slice(0, 20),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Security monitor dashboard error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch security dashboard data'
    });
  }
});

/**
 * POST /api/v1/admin/security-monitor/incident
 * Create a new security incident
 */
router.post('/incident', (req, res) => {
  try {
    const { 
      incident_type, 
      severity = 'medium', 
      user_identifier, 
      details, 
      ip_address,
      user_agent,
      geo_location 
    } = req.body;
    
    if (!incident_type) {
      return res.status(400).json({
        success: false,
        error: 'incident_type is required'
      });
    }
    
    if (!['low', 'medium', 'high', 'critical'].includes(severity)) {
      return res.status(400).json({
        success: false,
        error: 'severity must be low, medium, high, or critical'
      });
    }
    
    // Hash user agent for privacy
    const userAgentHash = user_agent ? 
      crypto.createHash('sha256').update(user_agent).digest('hex') : null;
    
    const result = queries.createIncident.run(
      incident_type,
      severity,
      user_identifier || null,
      details ? JSON.stringify(details) : null,
      ip_address || null,
      userAgentHash,
      geo_location || null
    );
    
    res.json({
      success: true,
      data: {
        incident_id: result.lastInsertRowid,
        incident_type,
        severity,
        created_by: req.user.id,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Security monitor create incident error: ${JSON.stringify({
      body: req.body,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to create security incident'
    });
  }
});

/**
 * PUT /api/v1/admin/security-monitor/incident/:id/resolve
 * Mark security incident as resolved
 */
router.put('/incident/:id/resolve', (req, res) => {
  try {
    const incidentId = parseInt(req.params.id, 10);
    const { resolution_notes } = req.body;
    
    if (!incidentId || isNaN(incidentId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid incident ID'
      });
    }
    
    // Get existing incident
    const existingIncident = queries.getIncidentById.get(incidentId);
    if (!existingIncident) {
      return res.status(404).json({
        success: false,
        error: 'Security incident not found'
      });
    }
    
    if (existingIncident.resolved === 1) {
      return res.status(400).json({
        success: false,
        error: 'Incident is already resolved'
      });
    }
    
    // Resolve incident
    const result = queries.resolveIncident.run(
      req.user.id,
      resolution_notes || null,
      incidentId
    );
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Failed to resolve incident'
      });
    }
    
    res.json({
      success: true,
      data: {
        incident_id: incidentId,
        resolved_by: req.user.id,
        resolution_notes: resolution_notes,
        resolved_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Security monitor resolve incident error: ${JSON.stringify({
      incidentId: req.params.id,
      body: req.body,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to resolve security incident'
    });
  }
});

/**
 * PUT /api/v1/admin/security-monitor/incident/:id/severity
 * Update security incident severity
 */
router.put('/incident/:id/severity', (req, res) => {
  try {
    const incidentId = parseInt(req.params.id, 10);
    const { severity } = req.body;
    
    if (!incidentId || isNaN(incidentId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid incident ID'
      });
    }
    
    if (!severity || !['low', 'medium', 'high', 'critical'].includes(severity)) {
      return res.status(400).json({
        success: false,
        error: 'severity must be low, medium, high, or critical'
      });
    }
    
    const result = queries.updateIncidentSeverity.run(severity, incidentId);
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Security incident not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        incident_id: incidentId,
        new_severity: severity,
        updated_by: req.user.id,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Security monitor update severity error: ${JSON.stringify({
      incidentId: req.params.id,
      body: req.body,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to update incident severity'
    });
  }
});

/**
 * GET /api/v1/admin/security-monitor/user-restrictions
 * Get active user restrictions
 */
router.get('/user-restrictions', (req, res) => {
  try {
    const restrictions = queries.getAllUserRestrictions.all();
    
    // Parse restriction values
    const parsedRestrictions = restrictions.map(restriction => ({
      ...restriction,
      restriction_value: restriction.restriction_value ? 
        JSON.parse(restriction.restriction_value) : null
    }));
    
    res.json({
      success: true,
      data: {
        restrictions: parsedRestrictions,
        count: parsedRestrictions.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Security monitor user restrictions error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user restrictions'
    });
  }
});

/**
 * POST /api/v1/admin/security-monitor/user-restriction
 * Create a new user restriction
 */
router.post('/user-restriction', (req, res) => {
  try {
    const { 
      user_identifier, 
      restriction_type, 
      restriction_value, 
      reason, 
      expires_in_hours 
    } = req.body;
    
    if (!user_identifier || !restriction_type) {
      return res.status(400).json({
        success: false,
        error: 'user_identifier and restriction_type are required'
      });
    }
    
    if (!['creation_limit', 'temporary_ban', 'rate_limit'].includes(restriction_type)) {
      return res.status(400).json({
        success: false,
        error: 'restriction_type must be creation_limit, temporary_ban, or rate_limit'
      });
    }
    
    // Calculate expiry date
    const expiresAt = expires_in_hours > 0 ? 
      new Date(Date.now() + (expires_in_hours * 60 * 60 * 1000)).toISOString() : 
      null;
    
    const result = queries.createUserRestriction.run(
      user_identifier,
      restriction_type,
      restriction_value ? JSON.stringify(restriction_value) : null,
      reason || null,
      req.user.id,
      expiresAt
    );
    
    res.json({
      success: true,
      data: {
        restriction_id: result.lastInsertRowid,
        user_identifier,
        restriction_type,
        expires_at: expiresAt,
        applied_by: req.user.id,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Security monitor create user restriction error: ${JSON.stringify({
      body: req.body,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to create user restriction'
    });
  }
});

/**
 * DELETE /api/v1/admin/security-monitor/user-restriction/:id
 * Remove a user restriction
 */
router.delete('/user-restriction/:id', (req, res) => {
  try {
    const restrictionId = parseInt(req.params.id, 10);
    
    if (!restrictionId || isNaN(restrictionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid restriction ID'
      });
    }
    
    const result = queries.removeUserRestriction.run(restrictionId);
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'User restriction not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        restriction_id: restrictionId,
        removed_by: req.user.id,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Security monitor remove user restriction error: ${JSON.stringify({
      restrictionId: req.params.id,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to remove user restriction'
    });
  }
});

/**
 * GET /api/v1/admin/security-monitor/audit-log
 * Get recent admin audit log entries
 */
router.get('/audit-log', (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const auditEntries = queries.getRecentAuditLog.all();
    
    // Limit results
    const limitedEntries = auditEntries.slice(0, parseInt(limit, 10) || 100);
    
    // Parse details JSON
    const parsedEntries = limitedEntries.map(entry => ({
      ...entry,
      details: entry.details ? JSON.parse(entry.details) : null
    }));
    
    res.json({
      success: true,
      data: {
        audit_entries: parsedEntries,
        count: parsedEntries.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Security monitor audit log error: ${JSON.stringify({
      query: req.query,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit log'
    });
  }
});

export default router;