import helmet from 'helmet';

/**
 * Enhanced security headers middleware
 * Builds upon existing helmet configuration with additional hardening
 */

const isDev = process.env.NODE_ENV !== 'production';

// Content Security Policy for admin routes
const adminCSP = {
  defaultSrc: ["'self'"],
  styleSrc: [
    "'self'", 
    "'unsafe-inline'", // Required for styled-components
    "https://fonts.googleapis.com"
  ],
  fontSrc: [
    "'self'",
    "https://fonts.gstatic.com"
  ],
  scriptSrc: [
    "'self'",
    ...(isDev ? ["'unsafe-eval'"] : []) // Allow eval in development for HMR
  ],
  imgSrc: [
    "'self'",
    "data:",
    "https:", // Allow external images (album artwork, etc.)
    "blob:" // Allow blob URLs for file uploads
  ],
  connectSrc: [
    "'self'",
    ...(isDev ? ["ws://localhost:*", "http://localhost:*", "wss://dev.testing", "https://dev.testing"] : []), // WebSocket for dev server
    "https://api.spotify.com",
    "https://api.music.apple.com",
    "https://api.tidal.com",
    "https://api.deezer.com"
  ],
  mediaSrc: [
    "'self'",
    "https:", // Allow external media sources for audio previews
    "blob:",
    "data:"
  ],
  objectSrc: ["'none'"], // Prevent Flash, Java applets, etc.
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"], // Prevent clickjacking
  ...(isDev ? {} : { upgradeInsecureRequests: [] }) // Only in production
};

// More permissive CSP for public routes (still secure but allows more flexibility)
const publicCSP = {
  defaultSrc: ["'self'"],
  styleSrc: [
    "'self'", 
    "'unsafe-inline'",
    "https://fonts.googleapis.com"
  ],
  fontSrc: [
    "'self'",
    "https://fonts.gstatic.com"
  ],
  scriptSrc: [
    "'self'",
    ...(isDev ? ["'unsafe-eval'"] : [])
  ],
  imgSrc: [
    "'self'",
    "data:",
    "https:",
    "blob:"
  ],
  connectSrc: [
    "'self'",
    ...(isDev ? ["ws://localhost:*", "http://localhost:*", "wss://dev.testing", "https://dev.testing"] : []),
    "https:" // Allow all HTTPS connections for public API integrations
  ],
  mediaSrc: [
    "'self'",
    "https:",
    "blob:",
    "data:"
  ],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'none'"]
};

/**
 * Security headers middleware for admin routes
 */
export const adminSecurityHeaders = helmet({
  contentSecurityPolicy: false, // Disable CSP for now to fix server crash
  crossOriginEmbedderPolicy: false, // May interfere with Spotify/Apple Music embeds
  crossOriginResourcePolicy: {
    policy: "cross-origin" // Allow cross-origin requests for API integrations
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true, // X-Content-Type-Options: nosniff
  frameguard: {
    action: 'deny' // X-Frame-Options: DENY
  },
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin"
  },
  xssFilter: true // X-XSS-Protection header
});

/**
 * Security headers middleware for public routes
 */
export const publicSecurityHeaders = helmet({
  contentSecurityPolicy: false, // Disable CSP for now to fix server crash
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: {
    policy: "cross-origin"
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  // Allow cross-origin framing when EMBED_PERMISSIVE enabled
  frameguard: process.env.EMBED_PERMISSIVE === 'true' ? false : { action: 'sameorigin' },
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin"
  },
  xssFilter: true
});

/**
 * Additional security headers for API responses
 */
export const apiSecurityHeaders = (req, res, next) => {
  // Prevent caching of sensitive API responses
  if (req.path.startsWith('/api/v1/admin') || req.path.startsWith('/api/v1/auth')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  // Add security headers for all API responses
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Prevent information disclosure
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  
  next();
};

/**
 * API cache behavior for personalization safety
 * - Always set Vary: Cookie, Authorization on API responses to prevent cache mixing
 * - Set no-store for mutating requests or when request is likely personalized
 */
export const apiCacheHeaders = (req, res, next) => {
  const method = (req.method || 'GET').toUpperCase();
  const isMutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  // Ensure Vary includes Cookie and Authorization
  try {
    const existing = res.getHeader('Vary');
    const existingStr = Array.isArray(existing) ? existing.join(', ') : (existing || '');
    const current = existingStr.toLowerCase().split(/\s*,\s*/).filter(Boolean);
    const ensure = (h) => (current.includes(h.toLowerCase()) ? null : h);
    const additions = [ensure('Cookie'), ensure('Authorization')].filter(Boolean);
    const newVary = additions.length ? (existingStr ? `${existingStr}, ${additions.join(', ')}` : additions.join(', ')) : existingStr;
    if (newVary) res.setHeader('Vary', newVary);
  } catch (_) {}

  // Detect likely personalized requests
  const hasAuthHeader = !!req.headers?.authorization;
  const hasAuthCookie = !!(req.cookies && (req.cookies.auth_token || req.cookies.session || req.cookies.csrf_token));
  const fullPath = `${req.baseUrl || ''}${req.path || ''}`;
  const sensitivePrefixes = [
    '/api/v1/admin',
    '/api/v1/curator',
    '/api/v1/playlist-actions',
    '/api/v1/uploads',
    '/api/v1/tracks',
    '/api/v1/artwork',
    // Note: /api/v1/preview removed - preview streams should be cached
    '/api/v1/cross-platform',
    '/api/v1/new-music',
    '/api/v1/export',
    '/api/v1/apple',
    '/api/v1/tidal',
    '/api/v1/bio-profiles',
    '/api/v1/bio-handles'
  ];
  const isSensitivePath = sensitivePrefixes.some((p) => fullPath.startsWith(p));

  if (isMutating || hasAuthHeader || hasAuthCookie || isSensitivePath) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
};

/**
 * CORS configuration with security considerations
 */
export const corsConfig = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'https://localhost:3001',
      'http://localhost:3001',
      'https://localhost:5173',
      'http://localhost:5173',
      'https://127.0.0.1:3000',
      'https://127.0.0.1:3001',
      'http://127.0.0.1:3001',
      'https://127.0.0.1:5173',
      'http://127.0.0.1:5173',
      'https://dev.testing', // Local HTTPS dev proxy
      'https://dev.flowerpil.com', // Always allow dev domain
      'https://flowerpil.io' // Production frontend
    ];
    
    // In production, add additional domains if configured
    if (!isDev) {
      if (process.env.FRONTEND_URL && process.env.FRONTEND_URL !== 'https://dev.flowerpil.com') {
        allowedOrigins.push(process.env.FRONTEND_URL);
      }
    }
    
    // Helper: allow common LAN IPs for local dev over HTTP/HTTPS and typical dev ports
    const isLanDevOrigin = (() => {
      try {
        const u = new URL(origin);
        const host = u.hostname;
        const port = u.port || (u.protocol === 'https:' ? '443' : '80');
        const isPrivateIP = (
          /^192\.168\.\d+\.\d+$/.test(host) ||
          /^10\.\d+\.\d+\.\d+$/.test(host) ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/.test(host) ||
          /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.\d+\.\d+$/.test(host) // Tailscale CGNAT range 100.64.0.0/10
        );
        const isDevPort = ['3000', '3001', '5173', '5174'].includes(port);
        return isPrivateIP && isDevPort; // e.g., https://192.168.x.x:3001 or https://100.64.x.x:5173
      } catch {
        return false;
      }
    })();

    // Check exact matches first
    if (allowedOrigins.includes(origin) || isLanDevOrigin) {
      callback(null, true);
    }
    // Check wildcard bio domains (production: *.pil.bio, staging: *.flowerpil.club)
    else if (origin && origin.match(/^https:\/\/[a-zA-Z0-9\-]+\.pil\.bio$/)) {
      callback(null, true);
    }
    else if (origin && origin.match(/^https:\/\/[a-zA-Z0-9\-]+\.flowerpil\.club$/)) {
      callback(null, true);
    }
    else {
      console.warn(`🚨 CORS: Blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies and authentication headers
  optionsSuccessStatus: 200, // Support legacy browsers
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-CSRF-Token' // Include CSRF token header
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ]
};

/**
 * Security middleware stack for different route types
 */
export const securityMiddleware = {
  // For admin routes - strictest security
  admin: [adminSecurityHeaders, apiSecurityHeaders],
  
  // For public API routes - balanced security
  publicApi: [publicSecurityHeaders, apiSecurityHeaders],
  
  // For static file serving - minimal security headers
  static: [
    helmet({
      contentSecurityPolicy: false, // Let CDN/reverse proxy handle
      crossOriginEmbedderPolicy: false,
      hsts: !isDev
    })
  ]
};
