import express from 'express';
import Joi from 'joi';
import crypto from 'crypto';
import { hashPassword, verifyPassword, generateToken, validatePassword, validateUsername, isAccountLocked, getAccountLockTimeRemaining } from '../utils/authUtils.js';
import { authMiddleware, optionalAuth, authRateLimit } from '../middleware/auth.js';
import { getQueries, getDatabase } from '../database/db.js';
import { 
  logSecurityEvent, 
  logFailedLoginAttempt, 
  shouldLockAccount, 
  lockAccount,
  SECURITY_EVENTS 
} from '../utils/securityLogger.js';
import { generateCSRFTokenForUser, revokeCSRFTokenForUser, buildCSRFCookieOptions, validateCSRFToken } from '../middleware/csrfProtection.js';
import { passwordChangeLimiter, passwordResetLimiter } from '../middleware/rateLimiting.js';
import {
  generateVerificationCode,
  hashCode,
  verifyCodeHash,
  sendSignupConfirmationEmail,
  sendPasswordResetEmail,
  sendTop10ResumeEmail
} from '../utils/emailService.js';
import logger from '../utils/logger.js';
import slackService from '../services/SlackNotificationService.js';
import { isOpenSignupEnabled } from '../services/featureFlagService.js';
import { evaluateSignupRisk, explainRiskFlags } from '../utils/signupRiskEvaluator.js';

const router = express.Router();

const TOKEN_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const PASSWORD_RESET_EXP_MINUTES = Number.parseInt(process.env.PASSWORD_RESET_EXP_MINUTES || '60', 10);
const PASSWORD_RESET_LINK_BASE = process.env.PASSWORD_RESET_LINK_BASE || 'https://flowerpil.io/reset-password';
const TOP10_RESUME_LINK_BASE = process.env.TOP10_RESUME_LINK_BASE
  || process.env.FRONTEND_URL
  || process.env.BASE_URL
  || 'https://flowerpil.com';

const buildPasswordResetLink = (token) => {
  const separator = PASSWORD_RESET_LINK_BASE.includes('?') ? '&' : '?';
  return `${PASSWORD_RESET_LINK_BASE}${separator}token=${encodeURIComponent(token)}`;
};

const buildTop10ResumeLink = (email, code) => {
  const base = TOP10_RESUME_LINK_BASE.replace(/\/$/, '');
  const params = new URLSearchParams({
    email,
    code,
    resume: '1'
  });
  return `${base}/top10/start?${params.toString()}`;
};

const hasPublishedTop10 = (db, userId) => {
  if (!userId) return false;
  const result = db.prepare(`
    SELECT id
    FROM top10_playlists
    WHERE user_id = ? AND is_published = 1
    LIMIT 1
  `).get(userId);
  return Boolean(result?.id);
};

const hashResetToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const buildAuthCookieOptions = (req, overrides = {}) => {
  const csrfCookieBase = buildCSRFCookieOptions(req);
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: csrfCookieBase.sameSite ?? 'lax',
    maxAge: TOKEN_MAX_AGE_MS,
    path: '/',
    ...(csrfCookieBase.domain ? { domain: csrfCookieBase.domain } : {}),
    ...overrides
  };

  return options;
};

const buildAuthCookieClearOptions = (req) => {
  const options = { ...buildAuthCookieOptions(req) };
  delete options.maxAge;
  return options;
};

// Input validation schemas
const loginSchema = Joi.object({
  username: Joi.alternatives()
    .try(
      Joi.string()
        .alphanum()
        .min(3)
        .max(50),
      Joi.string()
        .email()
        .max(100)
    )
    .required()
    .messages({
      'alternatives.match': 'Username must be alphanumeric or a valid email address',
      'string.alphanum': 'Username can only contain letters and numbers',
      'string.email': 'Username must be a valid email address',
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username must be less than 100 characters long',
      'any.required': 'Username is required'
    }),
  password: Joi.string()
    .min(1)
    .required()
    .messages({
      'string.min': 'Password is required',
      'any.required': 'Password is required'
    })
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .min(1)
    .required()
    .messages({
      'any.required': 'Current password is required'
    }),
  newPassword: Joi.string()
    .min(10)
    .max(128)
    .required()
    .messages({
      'string.min': 'New password must be at least 10 characters long',
      'string.max': 'New password must be less than 128 characters long',
      'any.required': 'New password is required'
    })
});

// Change email schema
const changeEmailSchema = Joi.object({
  currentPassword: Joi.string().min(1).required(),
  newEmail: Joi.string().email().max(100).required()
});

const passwordResetRequestSchema = Joi.object({
  email: Joi.string().email().required()
});

const passwordResetConfirmSchema = Joi.object({
  token: Joi.string().min(16).max(256).required(),
  newPassword: Joi.string().min(10).max(128).required()
});

const firstLoginSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(50)
    .required(),
  tempPassword: Joi.string()
    .min(1)
    .required(),
  newPassword: Joi.string()
    .min(10)
    .max(128)
    .required()
});

// POST /api/v1/auth/login - Admin login
router.post('/login', authRateLimit, async (req, res) => {
  // Timing attack protection: ensure consistent response time
  const AUTH_MIN_DELAY_MS = 200;
  const startTime = Date.now();

  // Helper function to ensure minimum delay before responding
  const ensureMinDelay = async () => {
    const elapsed = Date.now() - startTime;
    if (elapsed < AUTH_MIN_DELAY_MS) {
      await new Promise(resolve => setTimeout(resolve, AUTH_MIN_DELAY_MS - elapsed));
    }
  };

  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      logger.warn('AUTH_LOGIN', 'Invalid input', {
        timestamp: new Date().toISOString(),
        ip: req.ip,
        errors: error.details.map(d => d.message),
        userAgent: req.get('User-Agent')
      });

      await ensureMinDelay();
      return res.status(400).json({
        error: 'Invalid input',
        message: error.details[0].message,
        type: 'validation_error',
        details: error.details.map(d => ({ field: d.path[0], message: d.message }))
      });
    }
    
    const { username, password } = value;
    const queries = getQueries();
    
    // Find user by username
    const user = queries.findAdminUserByUsername.get(username);

    if (!user) {
      // Log failed login attempt (even if user doesn't exist - prevents user enumeration)
      await logFailedLoginAttempt(req.ip, username, req.get('User-Agent'));

      logger.warn('AUTH_LOGIN', 'User not found', {
        timestamp: new Date().toISOString(),
        username,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      await ensureMinDelay();
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username or password is incorrect',
        type: 'invalid_credentials'
      });
    }
    
    // Check if user is active
    if (!user.is_active) {
      logger.warn('AUTH_LOGIN', 'Inactive user login attempt', {
        timestamp: new Date().toISOString(),
        userId: user.id,
        username: user.username,
        ip: req.ip
      });

      await ensureMinDelay();
      return res.status(403).json({
        error: 'Account disabled',
        message: 'Your account has been disabled',
        type: 'account_disabled'
      });
    }
    
    // Check if account is locked
    if (isAccountLocked(user)) {
      const timeRemaining = getAccountLockTimeRemaining(user);
      const minutesRemaining = Math.ceil(timeRemaining / (1000 * 60));

      logger.warn('AUTH_LOGIN', 'Locked account login attempt', {
        timestamp: new Date().toISOString(),
        userId: user.id,
        username: user.username,
        lockedUntil: user.locked_until,
        minutesRemaining,
        ip: req.ip
      });

      await ensureMinDelay();
      return res.status(423).json({
        error: 'Account locked',
        message: `Account is locked for ${minutesRemaining} more minutes due to too many failed login attempts`,
        type: 'account_locked',
        lockedUntil: user.locked_until,
        minutesRemaining
      });
    }
    
    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    
    if (!isPasswordValid) {
      // Increment failed login attempts
      queries.incrementFailedLogins.run(username);
      
      // Log failed login attempt with detailed tracking
      await logFailedLoginAttempt(req.ip, username, req.get('User-Agent'));
      
      // Check if account should be locked due to too many failed attempts
      // Using exponential backoff (null = use calculated backoff based on attempt count)
      if (await shouldLockAccount(username)) {
        await lockAccount(username); // Uses exponential backoff
      }
      
      logger.warn('AUTH_LOGIN', 'Invalid password', {
        timestamp: new Date().toISOString(),
        userId: user.id,
        username: user.username,
        failedAttempts: user.failed_login_attempts + 1,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      await ensureMinDelay();
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username or password is incorrect',
        type: 'invalid_credentials'
      });
    }
    
    let curatorRecord = null;
    let testerFlag = false;
    let demoFlag = false;
    let curatorName = null;
    if (user.curator_id) {
      try {
        curatorRecord = queries.getCuratorById.get(user.curator_id);
        if (curatorRecord) {
          testerFlag = !!curatorRecord.tester;
          demoFlag = !!curatorRecord.is_demo;
          curatorName = curatorRecord.name || null;
        }
      } catch (curatorError) {
        logger.warn('AUTH_LOGIN', 'Unable to load curator record during login', {
          userId: user.id,
          curatorId: user.curator_id,
          error: curatorError?.message
        });
      }
    }

    // Successful login - generate JWT token
    const token = generateToken(user.id, user.role, null, {
      curator_id: user.curator_id || null,
      tester: testerFlag
    });
    
    // Update last login and reset failed attempts
    queries.updateLastLogin.run(user.id);
    
    // Generate CSRF token for this session
    const csrfToken = await generateCSRFTokenForUser(req, res, user.id);
    
    // Set secure httpOnly cookie for auth token
    // Use same domain settings as CSRF cookie for cross-subdomain compatibility
    res.cookie('auth_token', token, buildAuthCookieOptions(req));
    
    // Log successful login
    await logSecurityEvent(SECURITY_EVENTS.LOGIN_SUCCESS, {
      ip: req.ip,
      userId: user.id,
      username: user.username,
      userAgent: req.get('User-Agent'),
      details: {
        role: user.role,
        csrfTokenGenerated: !!csrfToken
      }
    });
    
    logger.info('AUTH_LOGIN', 'Login successful', {
      timestamp: new Date().toISOString(),
      userId: user.id,
      username: user.username,
      role: user.role,
      tester: testerFlag,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Ensure consistent timing even for successful logins
    await ensureMinDelay();

    // Return user info (no sensitive data)
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        curator_id: user.curator_id || null,
        curator_name: curatorName,
        tester: testerFlag,
        is_demo: demoFlag,
        lastLogin: user.last_login,
        createdAt: user.created_at
      },
      tokenExpiry: new Date(Date.now() + TOKEN_MAX_AGE_MS).toISOString(),
      csrfToken // Frontend needs this for API calls
    });

  } catch (error) {
    logger.error('AUTH_LOGIN', 'Unexpected error', error);

    await ensureMinDelay();
    res.status(500).json({
      error: 'Login failed',
      message: 'An unexpected error occurred during login',
      type: 'server_error'
    });
  }
});

// POST /api/v1/auth/logout - Clear authentication
// NOTE: Using optionalAuth instead of authMiddleware so users can logout even with expired/invalid tokens
// This prevents the catch-22 where expired sessions can't logout
router.post('/logout', optionalAuth, validateCSRFToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const username = req.user?.username;

    // Clear the httpOnly auth cookie (works even if token was invalid)
    const authCookieClearOptions = buildAuthCookieClearOptions(req);
    res.clearCookie('auth_token', authCookieClearOptions);

    // Clear the CSRF token cookie
    const csrfClearOptions = buildCSRFCookieOptions(req);
    delete csrfClearOptions.maxAge;
    res.clearCookie('csrf_token', csrfClearOptions);

    // Revoke CSRF tokens from database if user is authenticated
    if (userId) {
      try {
        await revokeCSRFTokenForUser(userId);
      } catch (revokeError) {
        logger.warn('AUTH_LOGOUT', 'Failed to revoke CSRF tokens', { error: revokeError.message });
        // Continue with logout even if token revocation fails
      }
    }

    // Log logout event
    try {
      await logSecurityEvent(SECURITY_EVENTS.LOGOUT, {
        ip: req.ip,
        userId: userId || null,
        username: username || 'anonymous',
        userAgent: req.get('User-Agent'),
        details: {
          csrfTokenRevoked: !!userId,
          hadValidSession: !!req.user
        }
      });
    } catch (logError) {
      logger.warn('AUTH_LOGOUT', 'Failed to log logout event', { error: logError.message });
      // Continue with logout even if logging fails
    }

    logger.info('AUTH_LOGOUT', 'User logged out', {
      timestamp: new Date().toISOString(),
      userId: userId || 'unknown',
      username: username || 'anonymous',
      hadValidSession: !!req.user,
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('AUTH_LOGOUT', 'Error during logout', error);

    // Even if there's an error, try to clear cookies
    try {
      res.clearCookie('auth_token', buildAuthCookieClearOptions(req));
      res.clearCookie('csrf_token', buildCSRFCookieOptions(req));
    } catch (cookieError) {
      logger.error('AUTH_LOGOUT', 'Failed to clear cookies', cookieError, { message: cookieError.message });
    }

    res.status(500).json({
      error: 'Logout failed',
      message: 'An error occurred during logout',
      type: 'server_error'
    });
  }
});

// GET /api/v1/auth/me - Get current user info
router.get('/me', authMiddleware, (req, res) => {
  try {
    logger.info('AUTH_ME', 'User info requested', {
      timestamp: new Date().toISOString(),
      userId: req.user.id,
      username: req.user.username,
      ip: req.ip
    });
    
    res.json({
      success: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
        lastLogin: req.user.lastLogin,
        createdAt: req.user.createdAt
      },
      tokenExpiry: new Date(req.tokenInfo.exp * 1000).toISOString()
    });
    
  } catch (error) {
    logger.error('AUTH_ME', 'Error getting user info', error);

    res.status(500).json({
      error: 'Failed to get user info',
      message: 'An error occurred while retrieving user information',
      type: 'server_error'
    });
  }
});

// POST /api/v1/auth/password/reset-request - Issue reset link via email
router.post('/password/reset-request', passwordResetLimiter, async (req, res) => {
  try {
    const { error, value } = passwordResetRequestSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const emailInput = value.email.trim();
    const normalized = emailInput.toLowerCase();
    const emailVariants = normalized === emailInput ? [emailInput] : [emailInput, normalized];

    const queries = getQueries();
    let userRecord = null;
    let userType = null;

    for (const variant of emailVariants) {
      const adminUser = queries.findAdminUserByUsername.get(variant);
      if (adminUser) {
        userRecord = adminUser;
        userType = 'admin';
        break;
      }
    }

    if (!userRecord) {
      for (const variant of emailVariants) {
        const endUser = queries.getUserByEmail?.get(variant);
        if (endUser) {
          userRecord = endUser;
          userType = 'user';
          break;
        }
      }
    }

    // Only proceed if user exists AND is active (for admin users)
    // This prevents sending reset emails to deleted/deactivated accounts
    if (userRecord && userType === 'admin' && !userRecord.is_active) {
      logger.info('AUTH_PASSWORD_RESET_REQUEST', 'Skipped reset for inactive admin account', {
        email: emailInput,
        userId: userRecord.id
      });
      userRecord = null; // Treat as non-existent to prevent email
    }

    if (userRecord) {
      try {
        queries.purgeExpiredPasswordResetTokens.run();
      } catch (purgeError) {
        logger.warn('AUTH_PASSWORD_RESET_REQUEST', 'Failed to purge expired tokens', { error: purgeError?.message || purgeError });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashResetToken(token);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXP_MINUTES * 60 * 1000).toISOString();

      try {
        queries.invalidatePasswordResetTokensForUser.run(userRecord.id, userType);
      } catch (invalidateError) {
        logger.warn('AUTH_PASSWORD_RESET_REQUEST', 'Failed to invalidate previous tokens', { error: invalidateError?.message || invalidateError });
      }

      try {
        queries.createPasswordResetToken.run(
          userRecord.id,
          userType,
          tokenHash,
          req.ip || null,
          expiresAt
        );
      } catch (insertError) {
        logger.error('AUTH_PASSWORD_RESET_REQUEST', 'Failed to persist reset token', insertError);
        return res.status(500).json({
          error: 'Unable to process request',
          message: 'Please try again shortly',
          type: 'server_error'
        });
      }

      const resetLink = buildPasswordResetLink(token);

      try {
        await sendPasswordResetEmail({
          email: emailInput,
          resetLink,
          expiresMinutes: PASSWORD_RESET_EXP_MINUTES
        });

        await logSecurityEvent(SECURITY_EVENTS.PASSWORD_RESET_REQUEST, {
          ip: req.ip,
          userId: userRecord.id,
          username: userRecord.username || userRecord.email,
          endpoint: '/api/v1/auth/password/reset-request',
          details: { userType }
        });
      } catch (emailError) {
        logger.error('AUTH_PASSWORD_RESET_REQUEST', 'Failed to dispatch email', emailError);
        try {
          queries.invalidatePasswordResetTokensForUser.run(userRecord.id, userType);
        } catch (_) { /* no-op */ }
      }
    }

    return res.json({
      success: true,
      message: 'If the email exists, a reset link will arrive shortly.'
    });
  } catch (error) {
    logger.error('AUTH_PASSWORD_RESET_REQUEST', 'Unexpected error', error);
    return res.status(500).json({
      error: 'Unable to process request',
      message: 'An unexpected error occurred',
      type: 'server_error'
    });
  }
});

// POST /api/v1/auth/password/reset - Apply new password using reset token
router.post('/password/reset', passwordResetLimiter, async (req, res) => {
  try {
    const { error, value } = passwordResetConfirmSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { token, newPassword } = value;
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: 'Weak password',
        message: passwordValidation.errors.join(', '),
        type: 'weak_password',
        requirements: passwordValidation.errors
      });
    }

    const queries = getQueries();
    const tokenHash = hashResetToken(token);
    const resetRecord = queries.getActivePasswordResetToken.get(tokenHash);

    if (!resetRecord) {
      return res.status(400).json({
        error: 'Invalid or expired token',
        message: 'The reset link is invalid or has expired',
        type: 'invalid_token'
      });
    }

    let account = null;
    if (resetRecord.user_type === 'admin') {
      account = queries.findAdminUserById.get(resetRecord.user_id);
    } else if (resetRecord.user_type === 'user') {
      account = queries.getUserById?.get(resetRecord.user_id);
    }

    if (!account) {
      queries.invalidatePasswordResetTokensForUser.run(resetRecord.user_id, resetRecord.user_type);
      return res.status(400).json({
        error: 'Invalid or expired token',
        message: 'The reset link is invalid or has expired',
        type: 'invalid_token'
      });
    }

    const newHash = await hashPassword(newPassword);
    let updateResult;

    // Use prepared statements from queries module for security
    if (resetRecord.user_type === 'admin') {
      updateResult = queries.updateAdminUserPassword.run(newHash, resetRecord.user_id);
    } else {
      updateResult = queries.updateUserPassword.run(newHash, resetRecord.user_id);
    }

    if (!updateResult?.changes) {
      queries.invalidatePasswordResetTokensForUser.run(resetRecord.user_id, resetRecord.user_type);
      return res.status(500).json({
        error: 'Unable to update password',
        message: 'Please request a new reset link',
        type: 'server_error'
      });
    }

    queries.markPasswordResetTokenUsed.run(resetRecord.id);

    // SECURITY: Revoke all existing CSRF tokens to invalidate active sessions
    // This forces re-authentication on all devices after password reset
    try {
      await revokeCSRFTokenForUser(resetRecord.user_id);
      logger.info('AUTH_PASSWORD_RESET', 'Revoked CSRF tokens for user after password reset', {
        userId: resetRecord.user_id,
        userType: resetRecord.user_type
      });
    } catch (revokeError) {
      logger.warn('AUTH_PASSWORD_RESET', 'Failed to revoke CSRF tokens', {
        error: revokeError.message,
        userId: resetRecord.user_id
      });
      // Continue - password was changed successfully
    }

    // TODO: Implement JWT token versioning for complete session invalidation
    // Current approach invalidates CSRF tokens but JWTs remain valid until expiry

    await logSecurityEvent(SECURITY_EVENTS.PASSWORD_RESET_SUCCESS, {
      ip: req.ip,
      userId: resetRecord.user_id,
      username: account.username || account.email,
      endpoint: '/api/v1/auth/password/reset',
      details: { userType: resetRecord.user_type }
    });

    return res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    logger.error('AUTH_PASSWORD_RESET', 'Unexpected error', error);
    return res.status(500).json({
      error: 'Unable to reset password',
      message: 'An unexpected error occurred',
      type: 'server_error'
    });
  }
});

// POST /api/v1/auth/change-password - Change password (authenticated users)
router.post('/change-password', passwordChangeLimiter, authMiddleware, async (req, res) => {
  try {
    // Validate input
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input',
        message: error.details[0].message,
        type: 'validation_error',
        details: error.details.map(d => ({ field: d.path[0], message: d.message }))
      });
    }
    
    const { currentPassword, newPassword } = value;
    const queries = getQueries();
    
    // Get current user from database
    const user = queries.findAdminUserByUsername.get(req.user.username);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account no longer exists',
        type: 'user_not_found'
      });
    }
    
    // Verify current password
    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      logger.warn('AUTH_CHANGE_PASSWORD', 'Invalid current password', {
        timestamp: new Date().toISOString(),
        userId: req.user.id,
        username: req.user.username,
        ip: req.ip
      });
      
      return res.status(400).json({
        error: 'Invalid current password',
        message: 'The current password is incorrect',
        type: 'invalid_current_password'
      });
    }
    
    // Validate new password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: 'Weak password',
        message: 'Password does not meet security requirements',
        type: 'weak_password',
        requirements: passwordValidation.errors
      });
    }
    
    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password in database using prepared statement for security
    queries.updateAdminUserPassword.run(newPasswordHash, user.id);

    // SECURITY: Revoke all existing CSRF tokens to invalidate active sessions
    // This forces re-authentication on all devices
    try {
      await revokeCSRFTokenForUser(user.id);
      logger.info('AUTH_CHANGE_PASSWORD', 'Revoked CSRF tokens for user after password change', {
        userId: user.id,
        username: user.username
      });
    } catch (revokeError) {
      logger.warn('AUTH_CHANGE_PASSWORD', 'Failed to revoke CSRF tokens', {
        error: revokeError.message,
        userId: user.id
      });
      // Continue - password was changed successfully
    }

    // TODO: Implement JWT token versioning for complete session invalidation
    // Current approach invalidates CSRF tokens but JWTs remain valid until expiry
    // Consider adding 'token_version' field to admin_users and incrementing on password change

    // Log password change event
    await logSecurityEvent(SECURITY_EVENTS.PASSWORD_CHANGE, {
      ip: req.ip,
      userId: req.user.id,
      username: req.user.username,
      userAgent: req.get('User-Agent'),
      details: {
        passwordStrength: passwordValidation.score || 'strong'
      }
    });
    
    logger.info('AUTH_CHANGE_PASSWORD', 'Password changed successfully', {
      timestamp: new Date().toISOString(),
      userId: req.user.id,
      username: req.user.username,
      ip: req.ip
    });
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    logger.error('AUTH_CHANGE_PASSWORD', 'Error changing password', error);

    res.status(500).json({
      error: 'Password change failed',
      message: 'An error occurred while changing the password',
      type: 'server_error'
    });
  }
});

// POST /api/v1/auth/change-email - Change login email (username) for authenticated users
router.post('/change-email', authMiddleware, async (req, res) => {
  try {
    const { error, value } = changeEmailSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input',
        message: error.details[0].message,
        type: 'validation_error',
        details: error.details.map(d => ({ field: d.path[0], message: d.message }))
      });
    }
    const { currentPassword, newEmail } = value;
    const queries = getQueries();
    
    const user = queries.findAdminUserByUsername.get(req.user.username);
    if (!user) {
      return res.status(404).json({ error: 'User not found', type: 'user_not_found' });
    }
    
    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Invalid current password', type: 'invalid_current_password' });
    }
    
    const existing = queries.findAdminUserByUsername.get(newEmail);
    if (existing && existing.id !== user.id) {
      return res.status(409).json({ error: 'Email already in use', type: 'email_in_use' });
    }
    
    queries.updateAdminUser.run(newEmail, user.role, user.is_active, user.locked_until, user.id);
    
    res.json({ success: true, message: 'Email updated successfully', user: { id: user.id, username: newEmail, role: user.role } });
  } catch (err) {
    logger.error('AUTH_CHANGE_EMAIL', 'Error', err);
    res.status(500).json({ error: 'Failed to change email', type: 'server_error' });
  }
});

// POST /api/v1/auth/first-login - Force password change for new accounts
router.post('/first-login', authRateLimit, async (req, res) => {
  try {
    // Validate input
    const { error, value } = firstLoginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input',
        message: error.details[0].message,
        type: 'validation_error',
        details: error.details.map(d => ({ field: d.path[0], message: d.message }))
      });
    }
    
    const { username, tempPassword, newPassword } = value;
    const queries = getQueries();
    
    // Find user
    const user = queries.findAdminUserByUsername.get(username);
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username or temporary password is incorrect',
        type: 'invalid_credentials'
      });
    }
    
    // Check if account is active and not locked
    if (!user.is_active || isAccountLocked(user)) {
      return res.status(403).json({
        error: 'Account not available',
        message: 'Account is disabled or locked',
        type: 'account_unavailable'
      });
    }
    
    // Verify temporary password
    const isTempPasswordValid = await verifyPassword(tempPassword, user.password_hash);
    if (!isTempPasswordValid) {
      queries.incrementFailedLogins.run(username);
      
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username or temporary password is incorrect',
        type: 'invalid_credentials'
      });
    }
    
    // Validate new password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: 'Weak password',
        message: 'New password does not meet security requirements',
        type: 'weak_password',
        requirements: passwordValidation.errors
      });
    }
    
    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);
    
    // Update password
    const updatePasswordQuery = getQueries().getDatabase().prepare(`
      UPDATE admin_users SET password_hash = ? WHERE id = ?
    `);
    updatePasswordQuery.run(newPasswordHash, user.id);
    
    // Generate token for immediate login
    const token = generateToken(user.id, user.role);
    
    // Update last login and reset failed attempts
    queries.updateLastLogin.run(user.id);
    
    // Set secure cookie
    // Use same domain settings as CSRF cookie for cross-subdomain compatibility
    res.cookie('auth_token', token, buildAuthCookieOptions(req));
    
    logger.info('AUTH_FIRST_LOGIN', 'First login password change successful', {
      timestamp: new Date().toISOString(),
      userId: user.id,
      username: user.username,
      ip: req.ip
    });
    
    res.json({
      success: true,
      message: 'Password changed and login successful',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        lastLogin: new Date().toISOString(),
        createdAt: user.created_at
      },
      tokenExpiry: new Date(Date.now() + TOKEN_MAX_AGE_MS).toISOString()
    });
    
  } catch (error) {
    logger.error('AUTH_FIRST_LOGIN', 'Error during first login', error);

    res.status(500).json({
      error: 'First login failed',
      message: 'An error occurred during first login',
      type: 'server_error'
    });
  }
});

// GET /api/v1/auth/status - Check authentication status (no auth required)
router.get('/status', async (req, res) => {
  try {
    // Extract token without requiring authentication
    const token = req.cookies?.auth_token;

    if (!token) {
      return res.json({
        authenticated: false,
        message: 'No authentication token found'
      });
    }

    try {
      // Import here to avoid circular dependency
      const { verifyToken } = await import('../utils/authUtils.js');
      const decoded = verifyToken(token);

      const queries = getQueries();

      // Check if it's an admin user first
      let user = queries.findAdminUserById.get(decoded.userId);
      let isAdminUser = true;

      // If not found in admin_users, check regular users table
      if (!user) {
        user = queries.getUserById?.get(decoded.userId);
        isAdminUser = false;
      }

      if (!user) {
        return res.json({
          authenticated: false,
          message: 'User account not available'
        });
      }

      // Check account status for admin users only
      if (isAdminUser && (!user.is_active || isAccountLocked(user))) {
        return res.json({
          authenticated: false,
          message: 'User account not available'
        });
      }

      let testerFlag = false;
      let demoFlag = false;
      let curatorName = null;
      if (user.curator_id) {
        try {
          const curatorRecord = queries.getCuratorById.get(user.curator_id);
          if (curatorRecord) {
            testerFlag = !!curatorRecord.tester;
            demoFlag = !!curatorRecord.is_demo;
            curatorName = curatorRecord.name || null;
          }
        } catch (curatorError) {
          logger.warn('AUTH_STATUS', 'Failed to load curator during status check', {
            userId: user.id,
            curatorId: user.curator_id,
            error: curatorError?.message
          });
        }
      }

      // Auto-regenerate CSRF token if missing or expired
      const csrfToken = req.cookies?.csrf_token;
      let newCsrfToken = null;
      if (!csrfToken) {
        try {
          newCsrfToken = await generateCSRFTokenForUser(req, res, user.id);
          logger.debug('AUTH_STATUS', 'CSRF token auto-regenerated during status check', { userId: user.id });
        } catch (error) {
          logger.error('AUTH_STATUS', 'Failed to generate CSRF token during status check', error);
        }
      }

      const responseBody = {
        authenticated: true,
        user: {
          id: user.id,
          username: user.username || user.email,
          email: user.email || user.username,
          role: user.role || 'user', // Default to 'user' role for regular users
          curator_id: user.curator_id || null,
          curator_name: curatorName,
          tester: testerFlag,
          is_demo: demoFlag,
          top10_playlist_id: user.top10_playlist_id ?? null
        },
        tokenExpiry: new Date(decoded.exp * 1000).toISOString()
      };

      const resolvedCsrfToken = newCsrfToken || csrfToken;
      if (resolvedCsrfToken) {
        responseBody.csrfToken = resolvedCsrfToken;
      }

      res.json(responseBody);
      
    } catch (tokenError) {
      return res.json({
        authenticated: false,
        message: 'Invalid or expired token'
      });
    }
    
  } catch (error) {
    logger.error('AUTH_STATUS', 'Error checking status', error);

    res.status(500).json({
      error: 'Status check failed',
      message: 'An error occurred while checking authentication status',
      type: 'server_error'
    });
  }
});

// POST /api/v1/auth/csrf-validate - Validate CSRF token for authenticated sessions
const csrfValidateHandler = (req, res) => {
  return res.json({ success: true, message: 'CSRF token valid' });
};

router.post('/csrf/validate', authMiddleware, validateCSRFToken, csrfValidateHandler);
// Backward-compatible dashed route used by clients
router.post('/csrf-validate', authMiddleware, validateCSRFToken, csrfValidateHandler);

// Resend cooldown in milliseconds (60 seconds)
const RESEND_COOLDOWN_MS = 60 * 1000;

// POST /api/v1/auth/curator/open-signup/check - Preflight check for open signup
router.post('/curator/open-signup/check', authRateLimit, async (req, res) => {
  try {
    // Only applicable when open signup is enabled
    if (!isOpenSignupEnabled()) {
      return res.status(400).json({
        success: false,
        error: 'Open signup is not enabled',
        type: 'open_signup_disabled'
      });
    }

    const schema = Joi.object({
      email: Joi.string().email().required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { email } = value;
    const queries = getQueries();

    // Check if email already exists
    const existingAdmin = queries.findAdminUserByUsername.get(email);
    if (existingAdmin) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists',
        type: 'email_exists'
      });
    }

    const existingUser = queries.getUserByEmail.get(email);
    if (existingUser) {
      const db = getDatabase();
      const allowCurator = hasPublishedTop10(db, existingUser.id);
      if (!allowCurator) {
        return res.status(409).json({
          success: false,
          error: 'An account with this email already exists',
          type: 'email_exists'
        });
      }
    }

    // Evaluate risk
    const country = req.headers['cf-ipcountry'] || '';
    const userAgent = req.get('User-Agent') || '';
    const riskResult = evaluateSignupRisk({
      email,
      ip: req.ip,
      country,
      userAgent
    });

    // If no verification needed, return success
    if (!riskResult.requiresVerification) {
      logger.info('CURATOR_OPEN_SIGNUP_CHECK', 'Trusted traffic, no verification required', {
        email,
        ip: req.ip,
        country,
        riskFlags: riskResult.riskFlags,
        riskScore: riskResult.riskScore
      });

      return res.json({
        success: true,
        requiresVerification: false,
        riskFlags: []
      });
    }

    // Check for existing active code and resend cooldown
    const existingCode = queries.getCuratorEmailCode.get(email);
    if (existingCode) {
      const lastSent = new Date(existingCode.last_sent_at).getTime();
      const now = Date.now();
      if (now - lastSent < RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSent)) / 1000);
        return res.status(429).json({
          success: false,
          error: `Please wait ${waitSeconds} seconds before requesting a new code`,
          type: 'resend_cooldown',
          retryAfter: waitSeconds
        });
      }

      // Update last_sent_at for existing code
      queries.updateCuratorCodeLastSent.run(existingCode.id);
    }

    // Generate and send verification code
    const code = generateVerificationCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Delete any existing codes for this email
    queries.deleteCuratorEmailCodes.run(email);

    // Create new code
    queries.createCuratorEmailCode.run(email, codeHash, expiresAt, req.ip || null);

    // Send verification email
    try {
      await sendSignupConfirmationEmail({
        email,
        confirmationCode: code,
        accountType: 'curator verification'
      });

      logger.info('CURATOR_OPEN_SIGNUP_CHECK', 'Verification code sent', {
        email,
        ip: req.ip,
        country,
        riskFlags: riskResult.riskFlags,
        riskScore: riskResult.riskScore
      });

      await logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, {
        ip: req.ip,
        username: email,
        userAgent,
        endpoint: '/api/v1/auth/curator/open-signup/check',
        details: {
          action: 'verification_required',
          riskFlags: riskResult.riskFlags,
          riskScore: riskResult.riskScore,
          country
        }
      });
    } catch (emailError) {
      logger.error('CURATOR_OPEN_SIGNUP_CHECK', 'Failed to send verification email', emailError);
      queries.deleteCuratorEmailCodes.run(email);
      return res.status(500).json({
        success: false,
        error: 'Failed to send verification email. Please try again.',
        type: 'email_error'
      });
    }

    return res.json({
      success: true,
      requiresVerification: true,
      riskFlags: riskResult.riskFlags,
      expiresAt
    });

  } catch (error) {
    logger.error('CURATOR_OPEN_SIGNUP_CHECK', 'Unexpected error', error);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred',
      type: 'server_error'
    });
  }
});

// POST /api/v1/auth/curator/verify-email - Verify email code for open signup
router.post('/curator/verify-email', authRateLimit, async (req, res) => {
  try {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      code: Joi.string().length(6).pattern(/^\d+$/).required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { email, code } = value;
    const queries = getQueries();

    // Get active code for email
    const emailCode = queries.getCuratorEmailCode.get(email);
    if (!emailCode) {
      return res.status(400).json({
        success: false,
        error: 'No verification code found or code has expired',
        type: 'code_expired'
      });
    }

    // Check attempt limit (5 attempts)
    if (emailCode.attempts >= 5) {
      queries.deleteCuratorEmailCodes.run(email);
      return res.status(429).json({
        success: false,
        error: 'Too many failed attempts. Please request a new code.',
        type: 'max_attempts'
      });
    }

    // Verify code
    const isValid = verifyCodeHash(code, emailCode.code_hash);

    if (!isValid) {
      queries.incrementCuratorCodeAttempt.run(emailCode.id);
      const remainingAttempts = 5 - (emailCode.attempts + 1);

      logger.warn('CURATOR_VERIFY_EMAIL', 'Invalid code attempt', {
        email,
        ip: req.ip,
        attempts: emailCode.attempts + 1
      });

      return res.status(400).json({
        success: false,
        error: 'Invalid verification code',
        type: 'invalid_code',
        remainingAttempts: Math.max(0, remainingAttempts)
      });
    }

    // Mark as verified
    queries.markCuratorEmailVerified.run(emailCode.id);

    logger.info('CURATOR_VERIFY_EMAIL', 'Email verified successfully', {
      email,
      ip: req.ip
    });

    // Verification valid for 10 minutes
    const verificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    return res.json({
      success: true,
      verified: true,
      expiresAt: verificationExpiresAt
    });

  } catch (error) {
    logger.error('CURATOR_VERIFY_EMAIL', 'Unexpected error', error);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred',
      type: 'server_error'
    });
  }
});

// POST /api/v1/auth/curator/open-signup/resend - Resend verification code
router.post('/curator/open-signup/resend', authRateLimit, async (req, res) => {
  try {
    if (!isOpenSignupEnabled()) {
      return res.status(400).json({
        success: false,
        error: 'Open signup is not enabled',
        type: 'open_signup_disabled'
      });
    }

    const schema = Joi.object({
      email: Joi.string().email().required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { email } = value;
    const queries = getQueries();

    // Check for existing code and cooldown
    const existingCode = queries.getCuratorEmailCode.get(email);
    if (existingCode) {
      const lastSent = new Date(existingCode.last_sent_at).getTime();
      const now = Date.now();
      if (now - lastSent < RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSent)) / 1000);
        return res.status(429).json({
          success: false,
          error: `Please wait ${waitSeconds} seconds before requesting a new code`,
          type: 'resend_cooldown',
          retryAfter: waitSeconds
        });
      }
    }

    // Generate new code
    const code = generateVerificationCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Delete old codes and create new one
    queries.deleteCuratorEmailCodes.run(email);
    queries.createCuratorEmailCode.run(email, codeHash, expiresAt, req.ip || null);

    // Send email
    try {
      await sendSignupConfirmationEmail({
        email,
        confirmationCode: code,
        accountType: 'curator verification'
      });

      logger.info('CURATOR_OPEN_SIGNUP_RESEND', 'Verification code resent', {
        email,
        ip: req.ip
      });

      return res.json({
        success: true,
        message: 'Verification code sent',
        expiresAt
      });
    } catch (emailError) {
      logger.error('CURATOR_OPEN_SIGNUP_RESEND', 'Failed to send email', emailError);
      queries.deleteCuratorEmailCodes.run(email);
      return res.status(500).json({
        success: false,
        error: 'Failed to send verification email',
        type: 'email_error'
      });
    }

  } catch (error) {
    logger.error('CURATOR_OPEN_SIGNUP_RESEND', 'Unexpected error', error);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred',
      type: 'server_error'
    });
  }
});

// Curator signup validation schema
// referralCode is optional when open signup is enabled (validated in handler)
const curatorSignupSchema = Joi.object({
  referralCode: Joi.string()
    .min(6)
    .max(64)
    .allow('', null)
    .optional()
    .messages({
      'string.min': 'Referral code must be at least 6 characters',
      'string.max': 'Referral code must be less than 64 characters'
    }),
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Valid email address is required',
      'any.required': 'Email address is required'
    }),
  password: Joi.string()
    .min(10)
    .max(128)
    .required()
    .messages({
      'string.min': 'Password must be at least 10 characters long',
      'string.max': 'Password must be less than 128 characters long',
      'any.required': 'Password is required'
    }),
  curatorProfile: Joi.object({
    curatorName: Joi.string().max(120),
    curatorType: Joi.string().max(64),
    location: Joi.string().max(120).allow('', null).optional()
  }).optional()
});

// POST /api/v1/auth/curator/signup - Curator account creation via referral
router.post('/curator/signup', authRateLimit, async (req, res) => {
  try {
    // Check if open signup mode is enabled
    const openSignupMode = isOpenSignupEnabled();

    // Validate input
    const { error, value } = curatorSignupSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { referralCode, email, password, curatorProfile } = value;
    const queries = getQueries();

    let referral = null;

    // Only validate referral code if open signup is NOT enabled
    if (!openSignupMode) {
      // Require referral code when open signup is disabled
      if (!referralCode) {
        return res.status(400).json({
          error: 'Referral code required',
          message: 'A referral code is required to sign up',
          type: 'referral_required'
        });
      }

      // 1. Validate referral code exists and is unused
      referral = queries.getReferralByCode.get(referralCode);
      if (!referral) {
        return res.status(400).json({
          error: 'Invalid referral code',
          message: 'The referral code provided is not valid',
          type: 'invalid_referral'
        });
      }

      if (referral.status !== 'unused') {
        return res.status(400).json({
          error: 'Referral code already used',
          message: 'This referral code has already been used',
          type: 'referral_used'
        });
      }

      // 2. Verify email matches referral (case-insensitive)
      if (referral.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({
          error: 'Email mismatch',
          message: 'Email must match the one associated with this referral code',
          type: 'email_mismatch'
        });
      }
    } else {
      // Open signup mode: check if verification was required and completed
      const country = req.headers['cf-ipcountry'] || '';
      const userAgent = req.get('User-Agent') || '';
      const riskResult = evaluateSignupRisk({
        email,
        ip: req.ip,
        country,
        userAgent
      });

      if (riskResult.requiresVerification) {
        // Check for recent verified email record
        const verifiedEmail = queries.getVerifiedCuratorEmail.get(email);
        if (!verifiedEmail) {
          logger.warn('CURATOR_SIGNUP', 'Open signup blocked - email verification required', {
            email,
            ip: req.ip,
            country,
            riskFlags: riskResult.riskFlags,
            riskScore: riskResult.riskScore
          });

          return res.status(403).json({
            error: 'Email verification required',
            message: 'Please verify your email address before signing up',
            type: 'email_verification_required',
            riskFlags: riskResult.riskFlags
          });
        }

        logger.info('CURATOR_SIGNUP', 'Open signup proceeding with verified email', {
          email,
          ip: req.ip,
          verifiedAt: verifiedEmail.verified_at
        });
      }
    }

    // 3. Check if email already exists in public users table
    const existingUser = queries.getUserByEmail.get(email);
    if (existingUser) {
      const db = getDatabase();
      const allowCurator = hasPublishedTop10(db, existingUser.id);
      if (!allowCurator) {
        return res.status(400).json({
          error: 'Account already exists',
          message: 'An account with this email already exists',
          type: 'email_exists'
        });
      }
    }

    // 3b. Ensure we don't already have an admin user for this email
    const existingAdminUser = queries.findAdminUserByUsername.get(email);
    if (existingAdminUser) {
      return res.status(400).json({
        error: 'Account already exists',
        message: 'An account with this email already exists',
        type: 'email_exists'
      });
    }
    
    const isTesterReferral = referral && typeof referral.code === 'string' && /^TESTER-/i.test(referral.code);

    // 4. Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: 'Weak password',
        message: passwordValidation.errors.join(', '),
        type: 'password_validation'
      });
    }
    
    // 5. Hash password
    const passwordHash = await hashPassword(password);
    
    // 6. Create admin_users entry with curator role
    const userResult = queries.createAdminUser.run(
      email, // username = email for curators
      passwordHash,
      'curator',
      1 // is_active
    );
    
    const userId = userResult.lastInsertRowid;
    
    // 7. Create curator profile using data from referral or provided profile
    const curatorName = curatorProfile?.curatorName || referral?.curator_name || '';
    let curatorType = curatorProfile?.curatorType || referral?.curator_type || 'curator';
    // Validate curatorType against DB-defined options + defaults
    try {
      const { getDatabase } = await import('../database/db.js');
      const db = getDatabase();
      const configs = db.prepare(`
        SELECT config_key FROM admin_system_config 
        WHERE config_key LIKE 'curator_type_%' AND config_key NOT LIKE 'curator_type_color_%'
      `).all();
      const defaultTypes = ['curator','label','label-ar','artist-manager','musician','dj','magazine','blog','podcast','venue','radio-station','producer'];
      const customTypes = configs.map(c => c.config_key.replace('curator_type_',''));
      const allowed = new Set([...defaultTypes, ...customTypes]);
      if (!allowed.has(curatorType)) {
        curatorType = 'curator';
      }
    } catch (e) {
      // leave curatorType as-is on error
    }
    const location = curatorProfile?.location || null;
    
    const curatorResult = queries.insertCurator.run(
      curatorName,           // name
      curatorType,          // type
      curatorType,          // profile_type
      isTesterReferral ? 1 : 0, // tester flag
      '',                   // bio - empty initially
      '',                   // bio_short - empty initially
      '',                   // profile_image
      location,             // location
      '',                   // website_url
      '',                   // contact_email - will be set during profile completion
      '',                   // spotify_url
      '',                   // apple_url
      '',                   // tidal_url
      '',                   // bandcamp_url
      '',                   // social_links
      '',                   // external_links
      'verified',           // verification_status
      'public',             // profile_visibility
      0,                    // upcoming_releases_enabled (0 = false)
      0,                    // upcoming_shows_enabled (0 = false)
      'not_yet_implemented', // dsp_implementation_status - FIX: was missing
      ''                    // custom_fields
    );
    
    const curatorId = curatorResult.lastInsertRowid;
    
    // 8. Link admin_users to curator profile
    queries.setCuratorId.run(curatorId, userId);
    
    // 9. Mark referral as used (only if referral was required/used)
    if (referral) {
      queries.markReferralUsed.run(userId, referral.id);
    }
    
    // 10. Generate auth token and set cookie
    const token = generateToken(userId, 'curator', null, { curator_id: curatorId, tester: isTesterReferral ? true : false });
    const csrfToken = await generateCSRFTokenForUser(req, res, userId);

    // Use same domain settings as CSRF cookie for cross-subdomain compatibility
    res.cookie('auth_token', token, buildAuthCookieOptions(req));
    
    // 11. Log successful signup
    await logSecurityEvent(SECURITY_EVENTS.USER_CREATION, {
      ip: req.ip,
      userId: userId,
      username: email,
      userAgent: req.get('User-Agent'),
      details: {
        role: 'curator',
        curatorId: curatorId,
        referralCode: referralCode,
        curatorName: curatorName,
        curatorType: curatorType,
        tester: isTesterReferral
      }
    });
    
    logger.info('CURATOR_SIGNUP', 'Account created successfully', {
      timestamp: new Date().toISOString(),
      userId: userId,
      curatorId: curatorId,
      email: email,
      curatorName: curatorName,
      curatorType: curatorType,
      tester: isTesterReferral,
      referralCode: referralCode,
      ip: req.ip
    });
    
    try {
      await sendSignupConfirmationEmail({
        email,
        accountType: 'curator account'
      });
    } catch (emailError) {
      logger.error('CURATOR_SIGNUP', 'Failed to send confirmation email', emailError, {
        email
      });
    }
    
    // 12. Return success with user data
    res.status(201).json({
      success: true,
      message: 'Curator account created successfully',
      user: {
        id: userId,
        email: email,
        role: 'curator',
        curator_id: curatorId,
        curator_name: curatorName,
        curator_type: curatorType,
        tester: isTesterReferral
      },
      nextStep: 'profile_completion',
      csrfToken: csrfToken
    });
    
  } catch (error) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' && /admin_users\.username/.test(error?.message || '')) {
      logger.warn('CURATOR_SIGNUP', 'Duplicate admin user prevented at database layer', {
        timestamp: new Date().toISOString(),
        email: req.body?.email,
        referralCode: req.body?.referralCode
      });

      return res.status(400).json({
        error: 'Account already exists',
        message: 'An account with this email already exists',
        type: 'email_exists'
      });
    }

    logger.error('CURATOR_SIGNUP', 'Unexpected error', error);
    
    res.status(500).json({
      error: 'Signup failed',
      message: 'An unexpected error occurred during account creation',
      type: 'server_error'
    });
  }
});

// POST /api/v1/auth/curator/spotify-import - Submit Spotify import email
router.post('/curator/spotify-import', authMiddleware, async (req, res) => {
  try {
    const { spotifyEmail } = req.body;
    const curatorId = req.user.curator_id;

    if (!curatorId) {
      return res.status(403).json({
        success: false,
        message: 'Only curators can submit Spotify import requests'
      });
    }

    // Basic email validation
    if (!spotifyEmail || typeof spotifyEmail !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Spotify email is required'
      });
    }

    const trimmedEmail = spotifyEmail.trim();
    if (trimmedEmail.length === 0 || trimmedEmail.length > 255) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    const queries = getQueries();

    // Check if curator already has a Spotify import request
    const existing = queries.getSpotifyImportByCuratorId.get(curatorId);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Spotify import request already exists'
      });
    }

    const result = queries.createSpotifyImport.run(curatorId, trimmedEmail);
    const importId = result.lastInsertRowid;

    // Get curator information for Slack notification
    const curator = queries.getCuratorById.get(curatorId);
    const curatorName = curator?.name || 'Unknown Curator';
    const curatorEmail = req.user.email || 'No email available';

    logger.info(`[SPOTIFY_IMPORT] Created request for curator ${curatorId}`, {
      importId,
      curatorId,
      email: trimmedEmail
    });

    // Send Slack notification to Curator Actions channel
    try {
      await slackService.notifySpotifyAccessRequest({
        curatorName,
        curatorEmail,
        spotifyEmail: trimmedEmail,
        curatorId
      });
    } catch (slackError) {
      // Log but don't fail the request if Slack notification fails
      logger.error('[SPOTIFY_IMPORT] Failed to send Slack notification', {
        curatorId,
        error: slackError.message
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Spotify import request submitted successfully',
      importId
    });

  } catch (error) {
    logger.error('[API_ERROR] Spotify import submission failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit Spotify import request'
    });
  }
});

// POST /api/v1/auth/signup - User account signup with email verification
router.post('/signup', authRateLimit, async (req, res) => {
  try {
    const schema = Joi.object({
      email: Joi.string().email().max(100).required(),
      password: Joi.string().min(10).max(128).required(),
      username: Joi.string().alphanum().min(3).max(50).optional(),
      autoVerify: Joi.boolean().optional() // For passwordless flows (e.g., top10)
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { email, password, username, autoVerify } = value;
    const queries = getQueries();

    // Check if email already exists
    const existingUser = queries.getUserByEmail.get(email);
    if (existingUser) {
      if (autoVerify === true) {
        const code = generateVerificationCode();
        const codeHash = hashCode(code);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        queries.invalidateCodes.run(existingUser.id, 'login');
        queries.createEmailCode.run(existingUser.id, codeHash, 'login', expiresAt);

        const resumeUrl = buildTop10ResumeLink(email, code);

        try {
          await sendTop10ResumeEmail({
            email,
            displayName: existingUser.display_name,
            resumeUrl,
            expiresMinutes: 10
          });
        } catch (emailError) {
          logger.error('AUTH_SIGNUP', 'Failed to send Top 10 resume email', emailError, { email });
          return res.status(500).json({
            error: 'Email delivery failed',
            message: 'Unable to send restart email. Please try again.',
            type: 'email_error'
          });
        }

        return res.status(200).json({
          success: true,
          message: 'Check your email for a restart link.',
          type: 'login_link_sent',
          next: 'login_link_sent'
        });
      }

      return res.status(409).json({
        error: 'Email already exists',
        message: 'An account with this email already exists',
        type: 'email_exists'
      });
    }

    // Check if username is taken (if provided)
    if (username) {
      const existingUsername = queries.getUserByUsername.get(username);
      if (existingUsername) {
        return res.status(409).json({
          error: 'Username taken',
          message: 'This username is already in use',
          type: 'username_taken'
        });
      }
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: 'Weak password',
        message: passwordValidation.errors.join(', '),
        type: 'password_validation'
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user (unverified)
    const userResult = queries.createUser.run(
      email,
      username || null,
      passwordHash,
      null, // display_name
      null, // bio
      0     // is_private_saved
    );

    // Debug logging
    console.log('🔍 userResult:', userResult);
    console.log('🔍 lastInsertRowid:', userResult.lastInsertRowid);
    console.log('🔍 typeof lastInsertRowid:', typeof userResult.lastInsertRowid);

    const userId = Number(userResult.lastInsertRowid);
    console.log('🔍 userId after Number():', userId);

    // Auto-verify flow for passwordless signup (e.g., top10)
    if (autoVerify === true) {
      // Mark user as verified immediately
      queries.updateUserVerified.run(userId);

      // Generate JWT token
      const token = generateToken(userId, 'user', null, {
        email: email
      });

      // Set auth cookie
      res.cookie('auth_token', token, buildAuthCookieOptions(req));

      // Generate and set CSRF token
      const csrfToken = await generateCSRFTokenForUser(req, res, userId);
      const csrfCookieOpts = buildCSRFCookieOptions(req);
      res.cookie('csrf_token', csrfToken, {
        ...csrfCookieOpts,
        httpOnly: false // CSRF token needs to be readable by client
      });

      // Log auto-verified signup
      await logSecurityEvent(SECURITY_EVENTS.USER_CREATION, {
        ip: req.ip,
        userId: userId,
        username: email,
        userAgent: req.get('User-Agent'),
        details: { autoVerified: true }
      });

      logger.info('AUTH_SIGNUP', 'User created and auto-verified (passwordless)', {
        timestamp: new Date().toISOString(),
        userId: userId,
        email: email
      });

      return res.status(201).json({
        success: true,
        message: 'Account created and verified',
        user: {
          id: userId,
          email: email,
          username: username || null,
          is_verified: true
        },
        csrfToken: csrfToken
      });
    }

    // Standard email verification flow
    // Generate verification code
    const code = generateVerificationCode();
    const codeHash = hashCode(code);

    // Store hashed code with 10-minute expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    queries.createEmailCode.run(userId, codeHash, 'signup', expiresAt);

    // Send verification email
    try {
      await sendSignupConfirmationEmail({
        email,
        confirmationCode: code,
        accountType: 'account'
      });
    } catch (emailError) {
      logger.error('AUTH_SIGNUP', 'Failed to send verification email', emailError);

      // Clean up created user
      queries.deleteUser.run(userId);

      return res.status(500).json({
        error: 'Email delivery failed',
        message: 'Unable to send verification email. Please try again.',
        type: 'email_error'
      });
    }

    // Log successful signup
    await logSecurityEvent(SECURITY_EVENTS.USER_CREATION, {
      ip: req.ip,
      userId: userId,
      username: email,
      userAgent: req.get('User-Agent'),
      details: { requiresVerification: true }
    });

    logger.info('AUTH_SIGNUP', 'User created, verification email sent', {
      timestamp: new Date().toISOString(),
      userId: userId,
      email: email
    });

    res.status(201).json({
      success: true,
      message: 'Account created. Please check your email for verification code.',
      next: 'verify_code_required'
    });

  } catch (error) {
    logger.error('AUTH_SIGNUP', 'Unexpected error', error);
    res.status(500).json({
      error: 'Signup failed',
      message: 'An unexpected error occurred during signup',
      type: 'server_error'
    });
  }
});

// POST /api/v1/auth/verify - Verify email code and issue JWT
router.post('/verify', authRateLimit, async (req, res) => {
  try {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      code: Joi.string().length(6).pattern(/^\d+$/).required(),
      purpose: Joi.string().valid('signup', 'login').default('signup')
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { email, code, purpose } = value;
    const queries = getQueries();

    // Find user
    const user = queries.getUserByEmail.get(email);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No account found with this email',
        type: 'user_not_found'
      });
    }

    // Get active verification code
    const emailCode = queries.getActiveCode.get(user.id, purpose);
    if (!emailCode) {
      return res.status(400).json({
        error: 'No verification code',
        message: 'No valid verification code found. Please request a new one.',
        type: 'code_expired'
      });
    }

    // Check attempt limit
    if (emailCode.attempts >= 5) {
      queries.invalidateCodes.run(user.id, purpose);

      return res.status(429).json({
        error: 'Too many attempts',
        message: 'Verification code locked due to too many failed attempts',
        type: 'rate_limit'
      });
    }

    // Verify code
    const isValid = verifyCodeHash(code, emailCode.code_hash);

    if (!isValid) {
      // Increment attempts
      queries.incrementCodeAttempt.run(emailCode.id);

      const remainingAttempts = 5 - (emailCode.attempts + 1);

      return res.status(400).json({
        error: 'Invalid code',
        message: 'Verification code is incorrect',
        type: 'invalid_code',
        remainingAttempts: remainingAttempts > 0 ? remainingAttempts : 0
      });
    }

    // Code is valid - invalidate all codes and issue JWT
    queries.invalidateCodes.run(user.id, purpose);

    if (!user.is_verified) {
      queries.updateUserVerified.run(user.id);
    }

    // Generate JWT token
    const token = generateToken(user.id, 'user');

    // Generate CSRF token
    const csrfToken = await generateCSRFTokenForUser(req, res, user.id);

    // Set auth cookie
    // Use same domain settings as CSRF cookie for cross-subdomain compatibility
    res.cookie('auth_token', token, buildAuthCookieOptions(req));

    // Log successful verification
    await logSecurityEvent(SECURITY_EVENTS.LOGIN_SUCCESS, {
      ip: req.ip,
      userId: user.id,
      username: user.email,
      userAgent: req.get('User-Agent'),
      details: { emailVerified: true, purpose }
    });

    logger.info('AUTH_VERIFY', 'Email verified, user logged in', {
      timestamp: new Date().toISOString(),
      userId: user.id,
      email: user.email
    });

    res.json({
      success: true,
      message: 'Email verified successfully',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        role: 'user'
      },
      csrfToken: csrfToken
    });

  } catch (error) {
    logger.error('AUTH_VERIFY', 'Unexpected error', error);
    res.status(500).json({
      error: 'Verification failed',
      message: 'An unexpected error occurred during verification',
      type: 'server_error'
    });
  }
});

// POST /api/v1/auth/curator/verify-referral - Validate referral code + email before onboarding
router.post('/curator/verify-referral', authRateLimit, async (req, res) => {
  try {
    const schema = Joi.object({
      referralCode: Joi.string().min(6).max(64).required(),
      email: Joi.string().email().required()
    });
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: 'Validation failed', message: error.details[0].message });
    }
    const { referralCode, email } = value;
    const queries = getQueries();

    const referral = queries.getReferralByCode.get(referralCode);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'Invalid referral code' });
    }
    if (referral.status !== 'unused') {
      return res.status(409).json({ success: false, error: 'Referral code already used' });
    }
    if (referral.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({ success: false, error: 'Email does not match referral code' });
    }
    const existingUser = queries.getUserByEmail.get(email);
    if (existingUser) {
      const db = getDatabase();
      const allowCurator = hasPublishedTop10(db, existingUser.id);
      if (!allowCurator) {
        return res.status(409).json({ success: false, error: 'An account with this email already exists' });
      }
    }
    return res.json({ success: true, data: { curator_name: referral.curator_name, curator_type: referral.curator_type, email: referral.email } });
  } catch (err) {
    logger.error('CURATOR_VERIFY_REFERRAL', 'Error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DEV ONLY - Quick login bypass for testing
// POST /api/v1/auth/dev/quick-login - Skip password verification in development
if (process.env.NODE_ENV === 'development') {
  // Helper function to create dummy Top10 data
  // createDummyTop10 function removed - demo data now handled via onboarding UI button
  // See: src/modules/top10/components/Top10Onboarding.jsx - handleInjectDemoData()

  router.post('/dev/quick-login', async (req, res) => {
    try {
      const { email, curatorName } = req.body || {};

      if (!email) {
        return res.status(400).json({
          error: 'Email required',
          message: 'Email address is required for quick login',
          type: 'validation_error'
        });
      }

      const queries = getQueries();
      const db = getDatabase();

      const normalizedCuratorName = typeof curatorName === 'string' ? curatorName.trim() : '';

      // Optional dev hint: resolve a real linked curator account by curator display name.
      // This keeps the Colby switcher entry tied to a fully functional profile when available.
      let user = null;
      let resolvedByCuratorName = false;
      if (normalizedCuratorName) {
        try {
          user = db.prepare(`
            SELECT au.*
            FROM admin_users au
            JOIN curators c ON c.id = au.curator_id
            WHERE LOWER(c.name) = LOWER(?)
              AND au.role = 'curator'
              AND au.is_active = 1
            ORDER BY au.id DESC
            LIMIT 1
          `).get(normalizedCuratorName);
          resolvedByCuratorName = !!user;
        } catch (lookupError) {
          logger.warn('DEV_QUICK_LOGIN', 'Curator-name quick-login lookup failed', {
            curatorName: normalizedCuratorName,
            error: lookupError?.message
          });
        }
      }

      // Fall back to the requested login identifier.
      if (!user) {
        user = queries.findAdminUserByUsername?.get(email);
      }
      let isAdminUser = true;
      let curatorId = null;
      let demoFlag = false;

      // If not found in admin_users, try users table (email field)
      if (!user) {
        user = queries.getUserByEmail?.get(email);
        isAdminUser = false;
      }

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          message: `No user found with email/username: ${email}`,
          type: 'user_not_found'
        });
      }

      // Get curator_id for admin users with curator role
      if (isAdminUser && user.curator_id) {
        curatorId = user.curator_id;
        try {
          const curatorRecord = queries.getCuratorById?.get(curatorId);
          demoFlag = !!curatorRecord?.is_demo;
        } catch (curatorError) {
          logger.warn('DEV_QUICK_LOGIN', 'Failed to read curator demo flag', {
            curatorId,
            error: curatorError?.message
          });
        }
      }

      // Generate token with appropriate role and metadata
      const token = generateToken(
        user.id,
        user.role || 'user',
        null,
        curatorId ? { curator_id: curatorId } : undefined
      );
      const csrfToken = await generateCSRFTokenForUser(req, res, user.id);

      // Use same domain settings as CSRF cookie for cross-subdomain compatibility
      res.cookie('auth_token', token, buildAuthCookieOptions(req));

      logger.info('DEV_QUICK_LOGIN', 'User logged in via dev bypass', {
        timestamp: new Date().toISOString(),
        userId: user.id,
        email: user.email || user.username,
        username: user.username,
        role: user.role || 'user',
        curatorId: curatorId,
        requestedCuratorName: normalizedCuratorName || null,
        resolvedByCuratorName,
        table: isAdminUser ? 'admin_users' : 'users'
      });

      res.json({
        success: true,
        message: 'Dev quick login successful',
        user: {
          id: user.id,
          email: user.email || user.username,
          username: user.username,
          displayName: user.display_name,
          role: user.role || 'user',
          curator_id: curatorId,
          is_demo: demoFlag
        },
        csrfToken
      });

    } catch (error) {
      logger.error('DEV_QUICK_LOGIN', 'Error', error);
      res.status(500).json({
        error: 'Quick login failed',
        message: error.message,
        type: 'server_error'
      });
    }
  });

  logger.info('AUTH', 'Dev quick-login endpoint enabled at POST /api/v1/auth/dev/quick-login');
}

// GET /api/v1/auth/invite-code/validate - Validate an invite code
router.get('/invite-code/validate', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: 'Code is required'
      });
    }

    const queries = getQueries();
    const cleanCode = code.trim().toUpperCase();
    const inviteCode = queries.getInviteCodeByCode.get(cleanCode);

    if (!inviteCode) {
      return res.json({
        success: true,
        valid: false,
        error: 'Invalid code'
      });
    }

    if (!inviteCode.enabled) {
      return res.json({
        success: true,
        valid: false,
        error: 'Code is not active'
      });
    }

    // Check max uses if set
    if (inviteCode.max_uses && inviteCode.use_count >= inviteCode.max_uses) {
      return res.json({
        success: true,
        valid: false,
        error: 'Code has reached maximum uses'
      });
    }

    return res.json({
      success: true,
      valid: true,
      code: inviteCode.code
    });
  } catch (error) {
    logger.error('AUTH_INVITE_CODE', 'Validation error', error);
    return res.status(500).json({
      success: false,
      valid: false,
      error: 'Server error'
    });
  }
});

// POST /api/v1/auth/invite-code/use - Record invite code usage
router.post('/invite-code/use', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Code is required'
      });
    }

    const queries = getQueries();
    const cleanCode = code.trim().toUpperCase();
    const inviteCode = queries.getInviteCodeByCode.get(cleanCode);

    if (!inviteCode || !inviteCode.enabled) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or inactive code'
      });
    }

    queries.incrementInviteCodeUse.run(cleanCode);

    return res.json({
      success: true,
      message: 'Code usage recorded'
    });
  } catch (error) {
    logger.error('AUTH_INVITE_CODE', 'Usage recording error', error);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// GET /api/v1/auth/invite-code/active - Get currently active code (for admin check)
router.get('/invite-code/active', async (req, res) => {
  try {
    const queries = getQueries();
    const activeCode = queries.getActiveInviteCode.get();

    return res.json({
      success: true,
      active: !!activeCode,
      code: activeCode?.code || null
    });
  } catch (error) {
    logger.error('AUTH_INVITE_CODE', 'Active code check error', error);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

export default router;
