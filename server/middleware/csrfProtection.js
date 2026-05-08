import crypto from 'crypto';
import { isIP } from 'node:net';
import { getDatabase } from '../database/db.js';
import { logSecurityEvent, SECURITY_EVENTS } from '../utils/securityLogger.js';
import { getAllowedWorkerKeys, normalizeWorkerHeaderKey } from '../utils/workerAuth.js';

/**
 * CSRF Protection middleware for SPA applications
 * Uses Double Submit Cookie pattern instead of traditional synchronizer tokens
 * This approach is SPA-friendly and doesn't require server-side session storage
 */

const CSRF_TOKEN_EXPIRY_HOURS = 24;
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

// Allow overriding the cookie domain via environment configuration for multi-tenant setups
const { CSRF_COOKIE_DOMAIN } = process.env;

/**
 * Determine the domain attribute for the CSRF cookie so that subdomains (e.g. api.<root>)
 * and the main site can share the token when served from the same registrable domain.
 * Returns undefined for localhost/IP environments so dev parity is preserved.
 */
function resolveCookieDomain(req) {
  if (CSRF_COOKIE_DOMAIN) {
    const trimmed = CSRF_COOKIE_DOMAIN.trim();
    if (trimmed.length === 0) return undefined;
    return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
  }

  const hostHeader = req.hostname || req.get('host');
  if (!hostHeader) return undefined;

  const host = hostHeader.replace(/:\d+$/, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local')) return undefined;
  if (isIP(host)) return undefined;

  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 1) return undefined;

  if (parts.length === 2) {
    return `.${parts.join('.')}`;
  }

  // Basic fallback: assume last two segments form the registrable domain (e.g. flowerpil.io)
  // For exotic multi-part TLDs set CSRF_COOKIE_DOMAIN explicitly via environment variables.
  return `.${parts.slice(-2).join('.')}`;
}

export function buildCSRFCookieOptions(req, overrides = {}) {
  const base = {
    httpOnly: false, // Client needs to read this for header
    secure: process.env.NODE_ENV === 'production',
    // Lax keeps protection from cross-site posts while allowing subdomains (Pages -> API) to receive it
    sameSite: 'lax',
    path: '/',
    maxAge: CSRF_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000 // 24 hours in milliseconds
  };

  const domain = resolveCookieDomain(req);
  if (domain) {
    base.domain = domain;
  }

  return { ...base, ...overrides };
}

/**
 * Generate a cryptographically secure CSRF token
 * @returns {string} Base64 encoded random token
 */
function generateCSRFToken() {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Generate and set CSRF token for authenticated user
 * Called after successful login to establish CSRF protection
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} userId - Authenticated user ID
 */
export async function generateCSRFTokenForUser(req, res, userId) {
  const db = getDatabase();
  
  try {
    const token = generateCSRFToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CSRF_TOKEN_EXPIRY_HOURS);
    
    // Store token in database
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO csrf_tokens (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `);
    
    insertStmt.run(userId, token, expiresAt.toISOString());
    
    // Set cookie with token (httpOnly: false so client can read it)
    res.cookie(CSRF_COOKIE_NAME, token, buildCSRFCookieOptions(req));
    
    console.log(`🔐 CSRF token generated for user ${userId}`);
    return token;
    
  } catch (error) {
    console.error('Failed to generate CSRF token:', error);
    throw error;
  }
}

/**
 * Validate CSRF token using Double Submit Cookie pattern
 * Compares token in custom header with token in cookie
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export function validateCSRFToken(req, res, next) {
  // Skip CSRF validation for GET, HEAD, OPTIONS (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Allow authenticated worker requests to cross-platform worker endpoints without CSRF
  // This narrowly scopes the exemption to the distributed linking worker routes only.
  try {
    const urlPath = (req.originalUrl || '').split('?')[0] || '';
    const isCrossPlatform = urlPath.startsWith('/api/v1/cross-platform/');
    if (isCrossPlatform) {
      const workerHeader = normalizeWorkerHeaderKey(req.get('X-Worker-Key'));
      const allowed = getAllowedWorkerKeys();
      const isWorker = !!workerHeader && allowed.includes(workerHeader);
      if (isWorker) {
        return next();
      }
    }
  } catch {}
  
  // Normalize potential encoding/quoting differences
  const normalizeToken = (t) => {
    if (!t) return '';
    let s = String(t).trim();
    // Remove wrapping quotes if present
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1);
    }
    try {
      // Decode percent-encoding if present (e.g., %2B, %3D)
      s = decodeURIComponent(s);
    } catch {}
    return s;
  };

  const tokenFromHeaderRaw = req.get(CSRF_HEADER_NAME);
  const tokenFromCookieRaw = req.cookies[CSRF_COOKIE_NAME];
  const tokenFromHeader = normalizeToken(tokenFromHeaderRaw);
  const tokenFromCookie = normalizeToken(tokenFromCookieRaw);
  const userId = req.user?.id;
  
  const validateAgainstDatabase = () => {
    if (!userId || !tokenFromHeader) {
      return false;
    }
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        SELECT token FROM csrf_tokens
        WHERE user_id = ?
          AND token = ?
          AND expires_at > datetime('now')
      `);
      return !!stmt.get(userId, tokenFromHeader);
    } catch {
      return false;
    }
  };

  if (!tokenFromHeader) {
    logSecurityEvent(SECURITY_EVENTS.CSRF_TOKEN_MISMATCH, {
      ip: req.ip,
      userId,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      details: {
        reason: 'Missing CSRF header token'
      }
    });

    return res.status(403).json({
      error: 'CSRF token validation failed',
      code: 'CSRF_HEADER_MISSING'
    });
  }

  if (!tokenFromCookie) {
    if (validateAgainstDatabase()) {
      return next();
    }

    logSecurityEvent(SECURITY_EVENTS.CSRF_TOKEN_MISMATCH, {
      ip: req.ip,
      userId,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      details: {
        reason: 'Missing CSRF cookie token',
        hasHeader: true,
        hasCookie: false
      }
    });

    return res.status(403).json({
      error: 'CSRF token validation failed',
      code: 'CSRF_COOKIE_MISSING'
    });
  }

  // Check if tokens match (timing-safe comparison). If lengths differ, treat as mismatch gracefully.
  try {
    const headerBuf = Buffer.from(tokenFromHeader);
    const cookieBuf = Buffer.from(tokenFromCookie);
    if (headerBuf.length !== cookieBuf.length || !crypto.timingSafeEqual(headerBuf, cookieBuf)) {
      if (validateAgainstDatabase()) {
        return next();
      }
      logSecurityEvent(SECURITY_EVENTS.CSRF_TOKEN_MISMATCH, {
        ip: req.ip,
        userId,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl,
        details: {
          reason: 'Token mismatch',
          headerLength: tokenFromHeader?.length,
          cookieLength: tokenFromCookie?.length
        }
      });
      return res.status(403).json({ error: 'CSRF token validation failed', code: 'CSRF_TOKEN_MISMATCH' });
    }
  } catch (e) {
    // Typically a RangeError when buffer lengths differ; handle as mismatch instead of 500
    // Development fallback: accept header-only if it matches DB for this user
    if (process.env.NODE_ENV !== 'production' && userId) {
      try {
        const db = getDatabase();
        const devTokenStmt = db.prepare(`
          SELECT token FROM csrf_tokens WHERE user_id = ? AND token = ? AND expires_at > datetime('now')
        `);
        const found = devTokenStmt.get(userId, tokenFromHeader);
        if (found) {
          return next();
        }
      } catch {}
    }
    logSecurityEvent(SECURITY_EVENTS.CSRF_TOKEN_MISMATCH, {
      ip: req.ip,
      userId,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      details: {
        reason: 'Token compare error',
        error: e.message,
        headerLength: tokenFromHeader?.length,
        cookieLength: tokenFromCookie?.length
      }
    });
    return res.status(403).json({ error: 'CSRF token validation failed', code: 'CSRF_TOKEN_MISMATCH' });
  }
  
  // If user is authenticated, verify token exists in database and is not expired
  if (userId) {
    try {
      const db = getDatabase();
      const tokenStmt = db.prepare(`
        SELECT token, expires_at
        FROM csrf_tokens
        WHERE user_id = ? AND token = ? AND expires_at > datetime('now')
      `);
      
      const dbToken = tokenStmt.get(userId, tokenFromCookie);
      
      if (!dbToken) {
        logSecurityEvent(SECURITY_EVENTS.CSRF_TOKEN_MISMATCH, {
          ip: req.ip,
          userId,
          userAgent: req.get('User-Agent'),
          endpoint: req.originalUrl,
          details: {
            reason: 'Token not found in database or expired'
          }
        });
        
        return res.status(403).json({
          error: 'CSRF token validation failed',
          code: 'CSRF_TOKEN_EXPIRED'
        });
      }
      
    } catch (error) {
      console.error('CSRF token database validation error:', error);
      return res.status(500).json({
        error: 'Internal server error during CSRF validation'
      });
    }
  }
  
  // Token validation successful
  next();
}

/**
 * Clean up expired CSRF tokens
 * Should be called periodically to prevent token table bloat
 */
export async function cleanupExpiredCSRFTokens() {
  const db = getDatabase();
  
  try {
    const cleanupStmt = db.prepare(`
      DELETE FROM csrf_tokens
      WHERE expires_at < datetime('now')
    `);
    
    const result = cleanupStmt.run();
    
    if (result.changes > 0) {
      console.log(`🧹 Cleaned up ${result.changes} expired CSRF tokens`);
    }
    
  } catch (error) {
    console.error('Failed to cleanup expired CSRF tokens:', error);
  }
}

/**
 * Revoke CSRF token for user (e.g., on logout)
 * @param {number} userId - User ID to revoke tokens for
 */
export async function revokeCSRFTokenForUser(userId) {
  const db = getDatabase();
  
  try {
    const revokeStmt = db.prepare(`
      DELETE FROM csrf_tokens
      WHERE user_id = ?
    `);
    
    const result = revokeStmt.run(userId);
    
    if (result.changes > 0) {
      console.log(`🔐 Revoked ${result.changes} CSRF token(s) for user ${userId}`);
    }
    
  } catch (error) {
    console.error('Failed to revoke CSRF tokens:', error);
  }
}

/**
 * Middleware to set CSRF token info in response headers (for debugging)
 * Only in development mode
 */
export function csrfDebugHeaders(req, res, next) {
  if (process.env.NODE_ENV !== 'production') {
    const tokenFromCookie = req.cookies?.[CSRF_COOKIE_NAME];
    const tokenFromHeader = req.get(CSRF_HEADER_NAME);
    
    res.setHeader('X-Debug-CSRF-Cookie', tokenFromCookie ? 'present' : 'missing');
    res.setHeader('X-Debug-CSRF-Header', tokenFromHeader ? 'present' : 'missing');
  }
  
  next();
}

// Schedule cleanup of expired tokens (run every hour)
if (process.env.NODE_ENV !== 'test') {
  setInterval(cleanupExpiredCSRFTokens, 60 * 60 * 1000); // 1 hour
}
