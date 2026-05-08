import { getDatabase } from '../database/db.js';

/**
 * Security event logger for audit trails and monitoring
 * Logs security-related events to database and console
 */

// Security event types
export const SECURITY_EVENTS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  USER_CREATION: 'USER_CREATION',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_SUCCESS: 'PASSWORD_RESET_SUCCESS',
  ACCOUNT_SETTINGS_CHANGED: 'ACCOUNT_SETTINGS_CHANGED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED: 'ACCOUNT_UNLOCKED',
  CSRF_TOKEN_MISMATCH: 'CSRF_TOKEN_MISMATCH',
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  ADMIN_ACTION: 'ADMIN_ACTION',
  // Public user events
  PUBLIC_USER_SIGNUP: 'PUBLIC_USER_SIGNUP',
  PUBLIC_USER_SUSPENDED: 'PUBLIC_USER_SUSPENDED',
  PUBLIC_USER_RESTRICTED: 'PUBLIC_USER_RESTRICTED',
  PUBLIC_USER_REVOKED: 'PUBLIC_USER_REVOKED',
  PUBLIC_USER_EXPORTS_UNLOCKED: 'PUBLIC_USER_EXPORTS_UNLOCKED',
  PUBLIC_USER_IMPORT_LIMIT_HIT: 'PUBLIC_USER_IMPORT_LIMIT_HIT',
  PUBLIC_USER_EXPORT_BLOCKED: 'PUBLIC_USER_EXPORT_BLOCKED',
  PUBLIC_USER_EXPORT_REQUEST: 'PUBLIC_USER_EXPORT_REQUEST'
};

/**
 * Log security event to database and console
 * @param {string} eventType - Type of security event (use SECURITY_EVENTS constants)
 * @param {Object} eventData - Event context data
 * @param {string} eventData.ip - Client IP address
 * @param {number} [eventData.userId] - User ID (for authenticated requests)
 * @param {string} [eventData.username] - Username
 * @param {string} [eventData.userAgent] - User agent string
 * @param {string} [eventData.endpoint] - API endpoint accessed
 * @param {Object} [eventData.details] - Additional context (will be JSON stringified)
 */
export async function logSecurityEvent(eventType, eventData = {}) {
  const db = getDatabase();
  
  try {
    const {
      ip = 'unknown',
      userId = null,
      username = null,
      userAgent = null,
      endpoint = null,
      details = null
    } = eventData;

    // Prepare details as JSON string if provided
    const detailsJson = details ? JSON.stringify(details) : null;
    
    // Insert into security_events table
    const insertStmt = db.prepare(`
      INSERT INTO security_events (
        event_type, ip_address, user_id, username, 
        user_agent, endpoint, details, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    
    insertStmt.run(
      eventType,
      ip,
      userId,
      username,
      userAgent,
      endpoint,
      detailsJson
    );
    
    // Console logging with appropriate log level
    const logLevel = getLogLevel(eventType);
    const logMessage = formatLogMessage(eventType, eventData);
    
    switch (logLevel) {
      case 'error':
        console.error(`🚨 SECURITY: ${logMessage}`);
        break;
      case 'warn':
        console.warn(`⚠️  SECURITY: ${logMessage}`);
        break;
      default:
        console.log(`🔐 SECURITY: ${logMessage}`);
    }
    
  } catch (error) {
    console.error('Failed to log security event:', error);
    // Don't throw - security logging should not break application flow
  }
}

/**
 * Track failed login attempt
 * @param {string} ip - Client IP address
 * @param {string} username - Attempted username
 * @param {string} userAgent - User agent string
 */
export async function logFailedLoginAttempt(ip, username, userAgent) {
  const db = getDatabase();
  
  try {
    const insertStmt = db.prepare(`
      INSERT INTO failed_login_attempts (ip_address, username, user_agent, attempted_at)
      VALUES (?, ?, ?, datetime('now'))
    `);
    
    insertStmt.run(ip, username, userAgent);
    
    // Also log as security event
    await logSecurityEvent(SECURITY_EVENTS.LOGIN_FAILURE, {
      ip,
      username,
      userAgent,
      details: { reason: 'Invalid credentials' }
    });
    
  } catch (error) {
    console.error('Failed to log failed login attempt:', error);
  }
}

/**
 * Check if account should be locked due to failed attempts
 * @param {string} username - Username to check
 * @param {number} maxAttempts - Maximum failed attempts before lockout (default: 5)
 * @param {number} windowMinutes - Time window for attempts (default: 15)
 * @returns {Promise<boolean>} - True if account should be locked
 */
export async function shouldLockAccount(username, maxAttempts = 5, windowMinutes = 15) {
  const db = getDatabase();
  
  try {
    // Count failed attempts in the time window
    const countStmt = db.prepare(`
      SELECT COUNT(*) as attempt_count
      FROM failed_login_attempts
      WHERE username = ? 
        AND attempted_at > datetime('now', '-${windowMinutes} minutes')
    `);
    
    const result = countStmt.get(username);
    return result.attempt_count >= maxAttempts;
    
  } catch (error) {
    console.error('Failed to check account lockout status:', error);
    return false;
  }
}

/**
 * Calculate exponential backoff lockout duration based on attempt count
 * Implements progressive delays to deter repeated attacks while being fair to legitimate users
 *
 * @param {number} attemptCount - Number of failed attempts
 * @returns {number} - Lockout duration in minutes
 */
function calculateExponentialLockout(attemptCount) {
  // Exponential backoff schedule:
  // 1-4 attempts: No lockout (handled by caller)
  // 5-7 attempts: 1 minute
  // 8-10 attempts: 5 minutes
  // 11-15 attempts: 15 minutes
  // 16-20 attempts: 30 minutes
  // 21-30 attempts: 60 minutes (1 hour)
  // 31+ attempts: 240 minutes (4 hours)

  if (attemptCount <= 4) return 0;
  if (attemptCount <= 7) return 1;
  if (attemptCount <= 10) return 5;
  if (attemptCount <= 15) return 15;
  if (attemptCount <= 20) return 30;
  if (attemptCount <= 30) return 60;
  return 240; // Maximum 4 hour lockout
}

/**
 * Lock user account temporarily with exponential backoff
 * @param {string} username - Username to lock
 * @param {number} lockoutMinutes - Duration of lockout in minutes (optional, will use exponential if not provided)
 */
export async function lockAccount(username, lockoutMinutes = null) {
  const db = getDatabase();

  try {
    // Count current failed attempts in the last 24 hours for exponential calculation
    const countStmt = db.prepare(`
      SELECT COUNT(*) as attempt_count
      FROM failed_login_attempts
      WHERE username = ?
        AND attempted_at > datetime('now', '-24 hours')
    `);
    const attemptCount = countStmt.get(username).attempt_count;

    // Use exponential backoff if lockoutMinutes not specified
    const calculatedLockout = lockoutMinutes !== null ? lockoutMinutes : calculateExponentialLockout(attemptCount);

    // If calculated lockout is 0, don't lock the account
    if (calculatedLockout === 0) {
      console.log(`[LOCKOUT] Not locking ${username} - only ${attemptCount} attempts`);
      return;
    }

    const lockUntil = new Date();
    lockUntil.setMinutes(lockUntil.getMinutes() + calculatedLockout);
    const lockUntilISO = lockUntil.toISOString();

    // Insert or replace lockout record in account_lockouts table
    const lockStmt = db.prepare(`
      INSERT OR REPLACE INTO account_lockouts (username, locked_until, attempt_count)
      VALUES (?, ?, ?)
    `);

    lockStmt.run(username, lockUntilISO, attemptCount);

    // IMPORTANT: Also update admin_users.locked_until so isAccountLocked() works correctly
    // This is where auth.js checks for locks
    const updateAdminStmt = db.prepare(`
      UPDATE admin_users
      SET locked_until = ?
      WHERE username = ?
    `);

    updateAdminStmt.run(lockUntilISO, username);

    // Log security event
    await logSecurityEvent(SECURITY_EVENTS.ACCOUNT_LOCKED, {
      username,
      details: {
        lockoutMinutes: calculatedLockout,
        attemptCount,
        lockUntil: lockUntilISO,
        exponentialBackoff: lockoutMinutes === null
      }
    });

    console.warn(`🔒 Account locked: ${username} for ${calculatedLockout} minutes (${attemptCount} attempts) until ${lockUntilISO}`);

  } catch (error) {
    console.error('Failed to lock account:', error);
  }
}

/**
 * Check if account is currently locked
 * @param {string} username - Username to check
 * @returns {Promise<Object>} - { isLocked: boolean, lockUntil: string|null }
 */
export async function isAccountLocked(username) {
  const db = getDatabase();
  
  try {
    const checkStmt = db.prepare(`
      SELECT locked_until
      FROM account_lockouts
      WHERE username = ?
        AND locked_until > datetime('now')
    `);
    
    const result = checkStmt.get(username);
    
    return {
      isLocked: !!result,
      lockUntil: result?.locked_until || null
    };
    
  } catch (error) {
    console.error('Failed to check account lock status:', error);
    return { isLocked: false, lockUntil: null };
  }
}

/**
 * Clean up old security events and failed login attempts
 * Should be called periodically (e.g., via cron job)
 * @param {number} retentionDays - Days to retain records (default: 90)
 */
export async function cleanupSecurityLogs(retentionDays = 90) {
  const db = getDatabase();
  
  try {
    // Clean up old security events
    const cleanupEvents = db.prepare(`
      DELETE FROM security_events
      WHERE created_at < datetime('now', '-${retentionDays} days')
    `);
    
    // Clean up old failed login attempts
    const cleanupAttempts = db.prepare(`
      DELETE FROM failed_login_attempts
      WHERE attempted_at < datetime('now', '-${retentionDays} days')
    `);
    
    // Clean up expired lockouts
    const cleanupLockouts = db.prepare(`
      DELETE FROM account_lockouts
      WHERE locked_until < datetime('now')
    `);
    
    const eventsDeleted = cleanupEvents.run().changes;
    const attemptsDeleted = cleanupAttempts.run().changes;
    const lockoutsDeleted = cleanupLockouts.run().changes;
    
    console.log(`🧹 Security logs cleanup: ${eventsDeleted} events, ${attemptsDeleted} attempts, ${lockoutsDeleted} lockouts removed`);
    
  } catch (error) {
    console.error('Failed to cleanup security logs:', error);
  }
}

// Helper functions
function getLogLevel(eventType) {
  const errorEvents = [
    SECURITY_EVENTS.LOGIN_FAILURE,
    SECURITY_EVENTS.RATE_LIMIT_EXCEEDED,
    SECURITY_EVENTS.CSRF_TOKEN_MISMATCH,
    SECURITY_EVENTS.SUSPICIOUS_ACTIVITY
  ];
  
  const warnEvents = [
    SECURITY_EVENTS.ACCOUNT_LOCKED,
    SECURITY_EVENTS.PASSWORD_CHANGE
  ];
  
  if (errorEvents.includes(eventType)) return 'error';
  if (warnEvents.includes(eventType)) return 'warn';
  return 'info';
}

function formatLogMessage(eventType, eventData) {
  const { ip, username, endpoint, details } = eventData;
  let message = `${eventType}`;
  
  if (username) message += ` - User: ${username}`;
  if (ip) message += ` - IP: ${ip}`;
  if (endpoint) message += ` - Endpoint: ${endpoint}`;
  if (details) message += ` - Details: ${JSON.stringify(details)}`;
  
  return message;
}
