import { verifyToken, isAccountLocked, getAccountLockTimeRemaining } from '../utils/authUtils.js';
import { getQueries } from '../database/db.js';
import { setRequestUser } from '../utils/requestContext.js';
import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// Rate limiting for auth endpoints
// More lenient to avoid false positives while still protecting against brute force
export const authRateLimit = isTest
  ? (req, _res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: isDev ? 100 : 15, // Increased from 5 to 15 attempts per 15 minutes in production
      message: {
        error: 'Too many authentication attempts',
        message: 'Please try again in 15 minutes',
        type: 'rate_limit_exceeded',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true, // Don't count successful requests
      skip: (req) => {
        // Skip rate limiting for successful requests to avoid penalizing valid users
        return req.method === 'GET' && req.url === '/api/v1/admin/verify';
      },
      handler: (req, res) => {
        console.warn('[AUTH_RATE_LIMIT] Rate limit exceeded', {
          timestamp: new Date().toISOString(),
          ip: req.ip,
          path: req.path,
          userAgent: req.get('User-Agent')
        });

        res.status(429).json({
          error: 'Too many authentication attempts',
          message: 'Too many login attempts from this IP address. Please try again in 15 minutes.',
          type: 'rate_limit_exceeded',
          retryAfter: '15 minutes'
        });
      }
    });

// Extract token from Authorization header or cookies
const extractToken = (req) => {
  // Try Authorization header first (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Try httpOnly cookie as fallback
  const cookieToken = req.cookies?.auth_token;
  if (cookieToken) {
    return cookieToken;
  }
  
  return null;
};

// Core JWT verification middleware
export const authMiddleware = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      console.warn('[AUTH_MIDDLEWARE] No token provided', {
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No authentication token provided',
        type: 'auth_required'
      });
    }
    
    // Verify JWT token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (tokenError) {
      console.warn('[AUTH_MIDDLEWARE] Token verification failed', {
        timestamp: new Date().toISOString(),
        ip: req.ip,
        error: tokenError.message,
        path: req.path
      });
      
      return res.status(401).json({
        error: 'Invalid token',
        message: tokenError.message,
        type: 'invalid_token'
      });
    }
    
    // Get user from database to check account status
    const queries = getQueries();

    // Check the appropriate table based on the token's role
    // Regular users have role 'user', admin/curator users have other roles
    const isAdminUser = decoded.role && decoded.role !== 'user';
    let user;

    if (isAdminUser) {
      // Check admin_users table for admin/curator users
      user = queries.findAdminUserById.get(decoded.userId);
    } else {
      // Check users table for regular users
      user = queries.getUserById?.get(decoded.userId);
    }

    if (!user) {
      console.warn('[AUTH_MIDDLEWARE] User not found for valid token', {
        timestamp: new Date().toISOString(),
        userId: decoded.userId,
        ip: req.ip
      });

      return res.status(401).json({
        error: 'User not found',
        message: 'User account no longer exists',
        type: 'user_not_found'
      });
    }

    // Check if account is active (admin users only)
    if (isAdminUser && !user.is_active) {
      console.warn('[AUTH_MIDDLEWARE] Inactive user attempted access', {
        timestamp: new Date().toISOString(),
        userId: user.id,
        username: user.username,
        ip: req.ip
      });

      return res.status(403).json({
        error: 'Account disabled',
        message: 'Your account has been disabled',
        type: 'account_disabled'
      });
    }

    // Check if account is locked (admin users only)
    if (isAdminUser && isAccountLocked(user)) {
      const timeRemaining = getAccountLockTimeRemaining(user);
      const minutesRemaining = Math.ceil(timeRemaining / (1000 * 60));

      console.warn('[AUTH_MIDDLEWARE] Locked user attempted access', {
        timestamp: new Date().toISOString(),
        userId: user.id,
        username: user.username,
        lockedUntil: user.locked_until,
        minutesRemaining,
        ip: req.ip
      });

      return res.status(423).json({
        error: 'Account locked',
        message: `Account is locked for ${minutesRemaining} more minutes`,
        type: 'account_locked',
        lockedUntil: user.locked_until,
        minutesRemaining
      });
    }

    let testerFlag = false;
    let demoFlag = false;
    let curatorName = null;
    if (user.curator_id) {
      try {
        const curatorRecord = queries.getCuratorById?.get(user.curator_id);
        if (curatorRecord) {
          testerFlag = !!curatorRecord.tester;
          demoFlag = !!curatorRecord.is_demo;
          curatorName = curatorRecord.name || null;
        }
      } catch (curatorError) {
        console.warn('[AUTH_MIDDLEWARE] Failed to load curator tester flag', {
          timestamp: new Date().toISOString(),
          error: curatorError?.message,
          curatorId: user.curator_id
        });
      }
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      username: user.username || user.email,
      email: user.email || user.username,
      role: user.role || 'user', // Default to 'user' for regular users
      curator_id: user.curator_id || null,
      curator_name: curatorName,
      tester: testerFlag,
      is_demo: demoFlag,
      lastLogin: user.last_login,
      createdAt: user.created_at
    };
    setRequestUser({
      id: req.user.id,
      role: req.user.role,
      curatorId: req.user.curator_id,
      tester: req.user.tester
    });
    
    // Attach token info for potential refresh
    req.tokenInfo = {
      iat: decoded.iat,
      exp: decoded.exp,
      type: decoded.type
    };
    
    console.log('[AUTH_MIDDLEWARE] Authentication successful', {
      timestamp: new Date().toISOString(),
      userId: user.id,
      username: user.username,
      role: user.role,
      tester: testerFlag,
      path: req.path,
      ip: req.ip
    });
    
    next();
    
  } catch (error) {
    console.error('[AUTH_MIDDLEWARE] Unexpected error:', error);
    
    res.status(500).json({
      error: 'Authentication error',
      message: 'An unexpected error occurred during authentication',
      type: 'auth_error'
    });
  }
};

// Optional authentication middleware (doesn't block unauthenticated users)
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      // No token provided, continue without authentication
      req.user = null;
      req.tokenInfo = null;
      return next();
    }
    
    try {
      const decoded = verifyToken(token);
      const queries = getQueries();

      // Check the appropriate table based on the token's role
      // Regular users have role 'user', admin/curator users have other roles
      const isAdminUser = decoded.role && decoded.role !== 'user';
      let user;

      if (isAdminUser) {
        // Check admin_users table for admin/curator users
        user = queries.findAdminUserById.get(decoded.userId);
      } else {
        // Check users table for regular users
        user = queries.getUserById?.get(decoded.userId);
      }

      // For admin users, check active status and lock status
      // For regular users, just check if they exist
      const isValidAdmin = isAdminUser && user.is_active && !isAccountLocked(user);
      const isValidRegularUser = !isAdminUser && user;

      if (isValidAdmin || isValidRegularUser) {
      let testerFlag = false;
      let demoFlag = false;
      let curatorName = null;
      if (user.curator_id) {
        try {
          const curatorRecord = queries.getCuratorById?.get(user.curator_id);
          if (curatorRecord) {
            testerFlag = !!curatorRecord.tester;
            demoFlag = !!curatorRecord.is_demo;
            curatorName = curatorRecord.name || null;
          }
        } catch (curatorError) {
          console.warn('[OPTIONAL_AUTH] Failed to load curator tester flag', {
            timestamp: new Date().toISOString(),
              error: curatorError?.message,
              curatorId: user.curator_id
            });
          }
        }

        req.user = {
          id: user.id,
          username: user.username || user.email,
          email: user.email || user.username,
          role: user.role || 'user', // Default to 'user' for regular users
          curator_id: user.curator_id || null,
          curator_name: curatorName,
          tester: testerFlag,
          is_demo: demoFlag,
          lastLogin: user.last_login,
          createdAt: user.created_at
        };
        setRequestUser({
          id: req.user.id,
          role: req.user.role,
          curatorId: req.user.curator_id,
          tester: req.user.tester
        });

        req.tokenInfo = {
          iat: decoded.iat,
          exp: decoded.exp,
          type: decoded.type
        };
        
        // console.log('[OPTIONAL_AUTH] User authenticated', {
        //   timestamp: new Date().toISOString(),
        //   userId: user.id,
        //   username: user.username,
        //   path: req.path
        // });
      } else {
        req.user = null;
        req.tokenInfo = null;
      }
    } catch (tokenError) {
      // Invalid token, continue without authentication
      req.user = null;
      req.tokenInfo = null;
      
      console.log('[OPTIONAL_AUTH] Invalid token, continuing unauthenticated', {
        timestamp: new Date().toISOString(),
        error: tokenError.message,
        path: req.path
      });
    }
    
    next();
    
  } catch (error) {
    console.error('[OPTIONAL_AUTH] Unexpected error:', error);
    // Continue without authentication on error
    req.user = null;
    req.tokenInfo = null;
    next();
  }
};

// Role-based access control middleware
export const requireRole = (requiredRole) => {
  const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be authenticated to access this resource',
        type: 'auth_required'
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      console.warn('[ROLE_CHECK] Insufficient permissions', {
        timestamp: new Date().toISOString(),
        userId: req.user.id,
        username: req.user.username,
        userRole: req.user.role,
        requiredRole: allowedRoles,
        path: req.path,
        ip: req.ip
      });
      
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This resource requires ${allowedRoles.join(', ')} role${allowedRoles.length > 1 ? 's' : ''}`,
        type: 'insufficient_permissions',
        userRole: req.user.role,
        requiredRole: allowedRoles,
        allowedRoles
      });
    }
    
    next();
  };
};

// Admin role middleware (convenience wrapper)
export const requireAdmin = requireRole('admin');

// Super admin role middleware (for future use)
export const requireSuperAdmin = requireRole('super_admin');

// Check if user has any of the specified roles
export const requireAnyRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be authenticated to access this resource',
        type: 'auth_required'
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      console.warn('[MULTI_ROLE_CHECK] Insufficient permissions', {
        timestamp: new Date().toISOString(),
        userId: req.user.id,
        username: req.user.username,
        userRole: req.user.role,
        allowedRoles,
        path: req.path,
        ip: req.ip
      });
      
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This resource requires one of: ${allowedRoles.join(', ')}`,
        type: 'insufficient_permissions',
        userRole: req.user.role,
        allowedRoles
      });
    }
    
    next();
  };
};

// Middleware to check if token is expiring soon and suggest refresh
export const checkTokenExpiry = (thresholdMinutes = 60) => {
  return (req, res, next) => {
    if (req.tokenInfo && req.tokenInfo.exp) {
      const expirationTime = req.tokenInfo.exp * 1000;
      const thresholdTime = Date.now() + (thresholdMinutes * 60 * 1000);
      
      if (expirationTime < thresholdTime) {
        res.setHeader('X-Token-Expiring', 'true');
        res.setHeader('X-Token-Expires-At', new Date(expirationTime).toISOString());
        
        console.info('[TOKEN_EXPIRY] Token expiring soon', {
          timestamp: new Date().toISOString(),
          userId: req.user?.id,
          expiresAt: new Date(expirationTime).toISOString(),
          minutesUntilExpiry: Math.round((expirationTime - Date.now()) / (1000 * 60))
        });
      }
    }
    
    next();
  };
};
