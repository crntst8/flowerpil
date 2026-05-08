import { getDb } from '../database/db.js';
import crypto from 'crypto';

/**
 * Comprehensive audit logging middleware for administrative actions
 * Tracks all changes with before/after values, user context, and request metadata
 */

// Action types for audit logging
export const AUDIT_ACTIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE', 
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  UPLOAD: 'UPLOAD',
  IMPORT: 'IMPORT',
  EXPORT: 'EXPORT',
  BATCH_UPDATE: 'BATCH_UPDATE'
};

// Resource types being audited
export const RESOURCE_TYPES = {
  TRACK: 'TRACK',
  PLAYLIST: 'PLAYLIST',
  CURATOR: 'CURATOR',
  RELEASE: 'RELEASE',
  SHOW: 'SHOW',
  USER: 'USER',
  ARTWORK: 'ARTWORK',
  PREVIEW: 'PREVIEW'
};

/**
 * Generate unique request ID for correlation
 */
function generateRequestId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Log administrative action to audit trail
 * @param {Object} auditData - Audit information
 * @param {number} auditData.userId - ID of user performing action
 * @param {string} auditData.username - Username of user performing action
 * @param {string} auditData.action - Action being performed (use AUDIT_ACTIONS)
 * @param {string} auditData.resourceType - Type of resource (use RESOURCE_TYPES)
 * @param {number} [auditData.resourceId] - ID of affected resource
 * @param {Object} [auditData.oldValues] - Previous values before change
 * @param {Object} [auditData.newValues] - New values after change
 * @param {string} auditData.ipAddress - Client IP address
 * @param {string} [auditData.userAgent] - Client user agent
 * @param {string} [auditData.endpoint] - API endpoint accessed
 * @param {string} [auditData.method] - HTTP method
 * @param {number} [auditData.statusCode] - Response status code
 * @param {string} [auditData.errorMessage] - Error message if action failed
 * @param {string} [auditData.sessionId] - Session identifier
 * @param {string} [auditData.requestId] - Request correlation ID
 */
export async function logAuditEvent(auditData) {
  const db = getDb();
  
  try {
    const {
      userId,
      username,
      action,
      resourceType,
      resourceId = null,
      oldValues = null,
      newValues = null,
      ipAddress,
      userAgent = null,
      endpoint = null,
      method = null,
      statusCode = null,
      errorMessage = null,
      sessionId = null,
      requestId = null
    } = auditData;

    // Validate required fields
    if (!userId || !username || !action || !resourceType || !ipAddress) {
      throw new Error('Missing required audit fields: userId, username, action, resourceType, ipAddress');
    }

    // Serialize values to JSON
    const oldValuesJson = oldValues ? JSON.stringify(oldValues) : null;
    const newValuesJson = newValues ? JSON.stringify(newValues) : null;

    // Insert audit log entry
    const insertStmt = db.prepare(`
      INSERT INTO audit_logs (
        user_id, username, action, resource_type, resource_id,
        old_values, new_values, ip_address, user_agent, endpoint,
        method, status_code, error_message, session_id, request_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    insertStmt.run(
      userId,
      username,
      action,
      resourceType,
      resourceId,
      oldValuesJson,
      newValuesJson,
      ipAddress,
      userAgent,
      endpoint,
      method,
      statusCode,
      errorMessage,
      sessionId,
      requestId
    );

    // Console logging for immediate visibility
    const logLevel = errorMessage ? 'ERROR' : 'INFO';
    const logMessage = formatAuditMessage(auditData);
    
    if (logLevel === 'ERROR') {
      console.error(`🚨 AUDIT: ${logMessage}`);
    } else {
      console.log(`📋 AUDIT: ${logMessage}`);
    }

  } catch (error) {
    console.error('Failed to log audit event:', error);
    // Don't throw - audit logging should not break application flow
  }
}

/**
 * Middleware to automatically capture audit information from requests
 * Use this middleware on admin routes that need audit tracking
 */
export function auditMiddleware(action, resourceType) {
  return async (req, res, next) => {
    // Generate request ID for correlation
    req.requestId = generateRequestId();
    
    // Store original data for comparison (if needed)
    req.auditData = {
      action,
      resourceType,
      userId: req.user?.id,
      username: req.user?.username,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      method: req.method,
      requestId: req.requestId,
      sessionId: req.sessionID || req.user?.sessionId
    };

    // Capture response for status code
    const originalSend = res.send;
    res.send = function(data) {
      req.auditData.statusCode = res.statusCode;
      
      // Auto-log certain actions
      if (shouldAutoLog(req.method, res.statusCode)) {
        logAuditEvent({
          ...req.auditData,
          newValues: req.method !== 'GET' ? req.body : undefined
        });
      }
      
      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Determine if action should be automatically logged
 */
function shouldAutoLog(method, statusCode) {
  // Log successful non-GET requests (CREATE, UPDATE, DELETE)
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && statusCode < 400) {
    return true;
  }
  
  // Log failed requests for security monitoring
  if (statusCode >= 400) {
    return true;
  }
  
  return false;
}

/**
 * Helper to log resource changes with before/after comparison
 * Call this manually in endpoints where you need detailed change tracking
 */
export async function logResourceChange(req, resourceId, oldValues, newValues) {
  if (req.auditData) {
    await logAuditEvent({
      ...req.auditData,
      resourceId,
      oldValues: sanitizeForAudit(oldValues),
      newValues: sanitizeForAudit(newValues)
    });
  }
}

/**
 * Sanitize values for audit logging (remove sensitive data)
 */
function sanitizeForAudit(values) {
  if (!values || typeof values !== 'object') {
    return values;
  }

  const sanitized = { ...values };
  
  // Remove sensitive fields
  const sensitiveFields = ['password', 'password_hash', 'token', 'secret', 'key'];
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Query audit logs with filtering options
 * @param {Object} filters - Filter criteria
 * @param {number} [filters.userId] - Filter by user ID
 * @param {string} [filters.action] - Filter by action type
 * @param {string} [filters.resourceType] - Filter by resource type
 * @param {number} [filters.resourceId] - Filter by resource ID
 * @param {string} [filters.startDate] - Start date (ISO string)
 * @param {string} [filters.endDate] - End date (ISO string)
 * @param {number} [filters.limit] - Maximum number of results (default: 100)
 * @param {number} [filters.offset] - Offset for pagination (default: 0)
 * @returns {Array} Array of audit log entries
 */
export function queryAuditLogs(filters = {}) {
  const db = getDb();
  
  try {
    const {
      userId,
      action,
      resourceType,
      resourceId,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = filters;

    let whereClause = '1=1';
    const params = [];

    if (userId) {
      whereClause += ' AND user_id = ?';
      params.push(userId);
    }

    if (action) {
      whereClause += ' AND action = ?';
      params.push(action);
    }

    if (resourceType) {
      whereClause += ' AND resource_type = ?';
      params.push(resourceType);
    }

    if (resourceId) {
      whereClause += ' AND resource_id = ?';
      params.push(resourceId);
    }

    if (startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(endDate);
    }

    const query = `
      SELECT * FROM audit_logs 
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const stmt = db.prepare(query);
    return stmt.all(...params);

  } catch (error) {
    console.error('Failed to query audit logs:', error);
    return [];
  }
}

/**
 * Get audit statistics for dashboard/monitoring
 */
export function getAuditStats(timeframe = '24h') {
  const db = getDb();
  
  try {
    let timeFilter = "datetime('now', '-1 day')";
    
    switch (timeframe) {
      case '1h':
        timeFilter = "datetime('now', '-1 hour')";
        break;
      case '7d':
        timeFilter = "datetime('now', '-7 days')";
        break;
      case '30d':
        timeFilter = "datetime('now', '-30 days')";
        break;
    }

    const stats = db.prepare(`
      SELECT 
        action,
        resource_type,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
      FROM audit_logs 
      WHERE created_at > ${timeFilter}
      GROUP BY action, resource_type
      ORDER BY count DESC
    `).all();

    const totalActions = db.prepare(`
      SELECT COUNT(*) as total 
      FROM audit_logs 
      WHERE created_at > ${timeFilter}
    `).get();

    const errorCount = db.prepare(`
      SELECT COUNT(*) as errors 
      FROM audit_logs 
      WHERE created_at > ${timeFilter} AND status_code >= 400
    `).get();

    return {
      timeframe,
      totalActions: totalActions.total,
      errorCount: errorCount.errors,
      actionBreakdown: stats
    };

  } catch (error) {
    console.error('Failed to get audit stats:', error);
    return null;
  }
}

// Helper function to format audit messages
function formatAuditMessage(auditData) {
  const { action, resourceType, resourceId, username, statusCode, errorMessage } = auditData;
  
  let message = `${username} ${action} ${resourceType}`;
  
  if (resourceId) {
    message += ` (ID: ${resourceId})`;
  }
  
  if (statusCode) {
    message += ` - ${statusCode}`;
  }
  
  if (errorMessage) {
    message += ` - Error: ${errorMessage}`;
  }
  
  return message;
}

/**
 * Clean up old audit logs to prevent database bloat
 * Should be called periodically (e.g., via cron job)
 * @param {number} retentionDays - Days to retain audit logs (default: 365)
 */
export async function cleanupAuditLogs(retentionDays = 365) {
  const db = getDb();
  
  try {
    const cleanupStmt = db.prepare(`
      DELETE FROM audit_logs
      WHERE created_at < datetime('now', '-${retentionDays} days')
    `);
    
    const result = cleanupStmt.run();
    
    if (result.changes > 0) {
      console.log(`🧹 Cleaned up ${result.changes} old audit log entries`);
    }
    
    return result.changes;
    
  } catch (error) {
    console.error('Failed to cleanup audit logs:', error);
    return 0;
  }
}