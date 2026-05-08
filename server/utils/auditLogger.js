import { getDatabase } from '../database/db.js';
import logger from './logger.js';

/**
 * Audit Logger Utility
 * Handles logging of administrative actions to the audit_logs table
 * Captures before/after snapshots for change tracking and compliance
 */

/**
 * Compares two objects and returns only the fields that changed
 * @param {Object} oldObj - Original object state
 * @param {Object} newObj - Updated object state
 * @returns {Object} Object containing only changed fields with {old, new} values
 */
export const getFieldDiff = (oldObj, newObj) => {
  if (!oldObj || !newObj) return {};

  const diff = {};
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    const oldValue = oldObj[key];
    const newValue = newObj[key];

    // Skip if values are identical
    if (oldValue === newValue) continue;

    // Handle null/undefined edge cases
    if (oldValue == null && newValue == null) continue;

    // Record the difference
    diff[key] = {
      old: oldValue,
      new: newValue
    };
  }

  return diff;
};

/**
 * Logs a playlist change to the audit_logs table
 * @param {Object} params - Logging parameters
 * @param {number} params.userId - ID of user making the change
 * @param {string} params.username - Username of user making the change
 * @param {number} params.playlistId - ID of playlist being modified
 * @param {string} params.action - Action type (create, update, delete, publish, etc)
 * @param {Object} params.oldValues - Snapshot of playlist before change
 * @param {Object} params.newValues - Snapshot of playlist after change
 * @param {Object} params.req - Express request object for metadata
 * @returns {Object} Created audit log entry
 */
export const logPlaylistChange = ({
  userId,
  username,
  playlistId,
  action,
  oldValues,
  newValues,
  req
}) => {
  const db = getDatabase();

  try {
    // Extract request metadata
    const ipAddress = req?.ip || req?.connection?.remoteAddress || 'unknown';
    const userAgent = req?.get?.('user-agent') || null;
    const endpoint = req?.originalUrl || req?.url || null;
    const method = req?.method || null;
    const sessionId = req?.sessionID || null;
    const requestId = req?.id || null;

    // Calculate field diff for efficient storage
    const fieldDiff = getFieldDiff(oldValues, newValues);

    // Prepare JSON values
    const oldValuesJson = oldValues ? JSON.stringify(oldValues) : null;
    const newValuesJson = newValues ? JSON.stringify(fieldDiff) : null;

    // Insert audit log entry
    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        user_id,
        username,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        ip_address,
        user_agent,
        endpoint,
        method,
        session_id,
        request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userId,
      username,
      action,
      'playlist',
      playlistId,
      oldValuesJson,
      newValuesJson,
      ipAddress,
      userAgent,
      endpoint,
      method,
      sessionId,
      requestId
    );

    // Log to application logs
    logger.info('AUDIT_LOG', `${action.toUpperCase()} playlist ${playlistId} by ${username}`, {
      playlist_id: playlistId,
      user_id: userId,
      action,
      changed_fields: Object.keys(fieldDiff).length,
      ip_address: ipAddress
    });

    return {
      id: result.lastInsertRowid,
      userId,
      username,
      action,
      resourceType: 'playlist',
      resourceId: playlistId,
      changedFields: Object.keys(fieldDiff)
    };

  } catch (error) {
    // Log error but don't throw - audit logging should not block operations
    logger.error('AUDIT_LOG', 'Failed to log playlist change', error, {
      playlist_id: playlistId,
      user_id: userId,
      action
    });

    return null;
  }
};

/**
 * Logs a generic administrative action to the audit_logs table
 * @param {Object} params - Logging parameters
 * @param {number} params.userId - ID of user performing action
 * @param {string} params.username - Username of user
 * @param {string} params.action - Action type
 * @param {string} params.resourceType - Type of resource (playlist, curator, export_request, etc)
 * @param {number} params.resourceId - ID of resource
 * @param {Object} params.data - Additional data to log
 * @param {Object} params.req - Express request object
 * @param {number} params.statusCode - HTTP status code
 * @param {string} params.errorMessage - Error message if action failed
 * @returns {Object} Created audit log entry
 */
export const logAdminAction = ({
  userId,
  username,
  action,
  resourceType,
  resourceId = null,
  data = null,
  req,
  statusCode = 200,
  errorMessage = null
}) => {
  const db = getDatabase();

  try {
    const ipAddress = req?.ip || req?.connection?.remoteAddress || 'unknown';
    const userAgent = req?.get?.('user-agent') || null;
    const endpoint = req?.originalUrl || req?.url || null;
    const method = req?.method || null;
    const sessionId = req?.sessionID || null;
    const requestId = req?.id || null;

    const dataJson = data ? JSON.stringify(data) : null;

    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        user_id,
        username,
        action,
        resource_type,
        resource_id,
        new_values,
        ip_address,
        user_agent,
        endpoint,
        method,
        status_code,
        error_message,
        session_id,
        request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userId,
      username,
      action,
      resourceType,
      resourceId,
      dataJson,
      ipAddress,
      userAgent,
      endpoint,
      method,
      statusCode,
      errorMessage,
      sessionId,
      requestId
    );

    logger.info('AUDIT_LOG', `${action.toUpperCase()} ${resourceType} ${resourceId || ''} by ${username}`, {
      resource_type: resourceType,
      resource_id: resourceId,
      user_id: userId,
      action,
      status_code: statusCode
    });

    return {
      id: result.lastInsertRowid,
      userId,
      username,
      action,
      resourceType,
      resourceId
    };

  } catch (error) {
    logger.error('AUDIT_LOG', 'Failed to log admin action', error, {
      resource_type: resourceType,
      resource_id: resourceId,
      user_id: userId,
      action
    });

    return null;
  }
};

export default {
  logPlaylistChange,
  logAdminAction,
  getFieldDiff
};
