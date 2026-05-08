import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { logSecurityEvent } from '../utils/securityLogger.js';

const isDev = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

const hashKey = (value) => crypto.createHash('sha256').update(value).digest('hex');

// IPs exempt from rate limiting
const exemptIPs = [
  '103.252.195.186',
  '2401:2520:20b7:0:dde6:3e8c:bd3e:f12e', 
  '45.134.39.248'
];

// Function to check if IP should be exempt from rate limiting
function isExemptIP(ip) {
  // Check exact matches
  if (exemptIPs.includes(ip)) return true;
  
  // Check 100.64.0.* range
  if (ip && ip.startsWith('100.64.0.')) return true;
  
  return false;
}

// Custom key generator that exempts certain IPs
function exemptKeyGenerator(req) {
  if (isExemptIP(req.ip)) {
    return null; // Exempt from rate limiting
  }
  return ipKeyGenerator(req);
}

// Login rate limiter - balanced protection for real users
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 10000 : (isDev ? 20 : 10), // Test: unlimited, Dev: 20 attempts, Prod: 10 attempts
  message: {
    error: 'Too many login attempts from this IP',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  keyGenerator: ipKeyGenerator,
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      endpoint: req.originalUrl,
      userAgent: req.get('User-Agent'),
      type: 'LOGIN_ATTEMPTS'
    });

    res.status(429).json({
      error: 'Too many login attempts from this IP',
      retryAfter: '15 minutes'
    });
  }
});

// Password change limiter - per user protection
const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isTest ? 10000 : (isDev ? 10 : 3), // Test: unlimited, Dev: 10 changes, Prod: 3 changes
  message: {
    error: 'Too many password change attempts',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID from JWT token for authenticated requests
    return req.user ? `user_${req.user.id}` : ipKeyGenerator(req);
  },
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userId: req.user?.id,
      endpoint: req.originalUrl,
      type: 'PASSWORD_CHANGES'
    });

    res.status(429).json({
      error: 'Too many password change attempts',
      retryAfter: '1 hour'
    });
  }
});

// Password reset limiter - stricter than general auth to prevent email enumeration and spam
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isTest ? 10000 : (isDev ? 10 : 3), // Test: unlimited, Dev: 10 requests, Prod: 3 requests per hour
  message: {
    error: 'Too many password reset requests',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests to prevent email enumeration
  keyGenerator: ipKeyGenerator,
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      endpoint: req.originalUrl,
      userAgent: req.get('User-Agent'),
      type: 'PASSWORD_RESET'
    });

    res.status(429).json({
      error: 'Too many password reset requests from this IP',
      message: 'To prevent abuse, password reset requests are limited to 3 per hour',
      retryAfter: '1 hour'
    });
  }
});

// General admin API limiter
const adminApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 10000 : (isDev ? 500 : 100), // Test: unlimited, Dev: 500 requests, Prod: 100 requests
  message: {
    error: 'Too many API requests',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true, // Don't count 4xx/5xx responses (e.g., 401 "DSP not connected")
  keyGenerator: (req) => {
    return req.user ? `user_${req.user.id}` : ipKeyGenerator(req);
  },
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userId: req.user?.id,
      endpoint: req.originalUrl,
      type: 'ADMIN_API'
    });

    res.status(429).json({
      error: 'Too many API requests',
      retryAfter: '15 minutes'
    });
  }
});

// Upload endpoints limiter - strictest for resource-intensive operations
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isTest ? 10000 : (isDev ? 50 : 10), // Test: unlimited, Dev: 50 uploads, Prod: 10 uploads
  message: {
    error: 'Too many upload attempts',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? `user_${req.user.id}` : ipKeyGenerator(req);
  },
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userId: req.user?.id,
      endpoint: req.originalUrl,
      type: 'UPLOADS'
    });

    res.status(429).json({
      error: 'Too many upload attempts',
      retryAfter: '1 hour'
    });
  }
});

// Site access rate limiter - protect against brute force attacks
const siteAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 10000 : (isDev ? 20 : 15), // Test: unlimited, Dev: 20 attempts, Prod: 15 attempts
  message: {
    error: 'Too many site access attempts from this IP',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  keyGenerator: exemptKeyGenerator,
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      endpoint: req.originalUrl,
      userAgent: req.get('User-Agent'),
      type: 'SITE_ACCESS_ATTEMPTS'
    });

    res.status(429).json({
      error: 'Too many site access attempts from this IP',
      retryAfter: '15 minutes'
    });
  }
});

// General public API limiter - more lenient
const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 10000 : (isDev ? 1000 : 300), // Test: unlimited, Dev: 1000 requests, Prod: 300 requests
  message: {
    error: 'Too many requests from this IP',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      endpoint: req.originalUrl,
      type: 'PUBLIC_API'
    });

    res.status(429).json({
      error: 'Too many requests from this IP',
      retryAfter: '15 minutes'
    });
  }
});

const top10CreateLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: isTest ? 10000 : (isDev ? 20 : 6),
  message: {
    error: 'Too many Top 10 submissions',
    retryAfter: '30 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const raw = req.user ? `top10_user_${req.user.id}` : ipKeyGenerator(req);
    return hashKey(raw);
  },
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userId: req.user?.id,
      endpoint: req.originalUrl,
      type: 'TOP10_CREATE'
    });

    res.status(429).json({
      error: 'Too many Top 10 submissions',
      retryAfter: '30 minutes'
    });
  }
});

const top10ImportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 10000 : (isDev ? 30 : 8),
  message: {
    error: 'Too many import requests',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const raw = req.user ? `top10_import_${req.user.id}` : ipKeyGenerator(req);
    return hashKey(raw);
  },
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userId: req.user?.id,
      endpoint: req.originalUrl,
      type: 'TOP10_IMPORT'
    });

    res.status(429).json({
      error: 'Too many import requests',
      retryAfter: '15 minutes'
    });
  }
});

const quickImportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 10000 : (isDev ? 30 : 10),
  message: {
    error: 'Too many import requests',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      endpoint: req.originalUrl,
      userAgent: req.get('User-Agent'),
      type: 'QUICK_IMPORT'
    });

    res.status(429).json({
      error: 'Too many import requests',
      retryAfter: '15 minutes'
    });
  }
});

const testerFeedbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 10000 : (isDev ? 40 : 15),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? `tester_${req.user.id}` : ipKeyGenerator(req);
  },
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userId: req.user?.id,
      endpoint: req.originalUrl,
      type: 'TESTER_FEEDBACK'
    });

    res.status(429).json({
      error: 'Too many feedback submissions',
      retryAfter: '1 minute'
    });
  }
});

export {
  loginLimiter,
  passwordChangeLimiter,
  passwordResetLimiter,
  adminApiLimiter,
  uploadLimiter,
  publicApiLimiter,
  top10CreateLimiter,
  top10ImportLimiter,
  siteAccessLimiter,
  testerFeedbackLimiter,
  quickImportLimiter
};
