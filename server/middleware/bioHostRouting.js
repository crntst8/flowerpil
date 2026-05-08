import { getQueries } from '../database/db.js';
import logger from '../utils/logger.js';

// Reserved handles that should redirect to main site
const RESERVED_HANDLES = new Set([
  'www', 'api', 'admin', 'mail', 'ftp', 'blog', 'shop', 'store',
  'help', 'support', 'contact', 'about', 'privacy', 'terms',
  'login', 'register', 'signin', 'signup', 'auth', 'account',
  'profile', 'user', 'users', 'member', 'members', 'public',
  'private', 'secure', 'ssl', 'cdn', 'static', 'assets',
  'uploads', 'download', 'downloads', 'file', 'files',
  'image', 'images', 'media', 'video', 'videos', 'audio',
  'test', 'staging', 'dev', 'demo', 'beta', 'alpha'
]);

// Handle validation regex (3-30 chars, alphanumeric with hyphens)
const HANDLE_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Get bio domain from environment
 * Supports both production (pil.bio) and staging (flowerpil.club)
 * @returns {string} - Bio domain (e.g., 'pil.bio' or 'flowerpil.club')
 */
const getBioDomain = () => {
  return process.env.BIO_DOMAIN || 'pil.bio';
};

/**
 * Extract bio handle from host header
 * Environment-aware: supports both pil.bio and flowerpil.club
 * @param {string} host - Host header value
 * @returns {string|null} - Bio handle or null if not a bio page request
 */
const extractBioHandle = (host) => {
  if (!host) return null;

  const bioDomain = getBioDomain();
  // Escape dots for regex
  const escapedDomain = bioDomain.replace(/\./g, '\\.');

  // Check if it's a bio subdomain (e.g., handle.pil.bio or handle.flowerpil.club)
  const bioRegex = new RegExp(`^([^.]+)\\.${escapedDomain}$`);
  const bioMatch = host.match(bioRegex);

  if (!bioMatch) return null;

  const handle = bioMatch[1].toLowerCase();

  // Validate handle format
  if (!HANDLE_REGEX.test(handle)) {
    return null;
  }

  // Check if handle is reserved
  if (RESERVED_HANDLES.has(handle)) {
    return null;
  }

  return handle;
};

/**
 * Bio page host-based routing middleware
 * Detects bio page requests and adds bio context to request
 */
export const bioHostRouting = async (req, res, next) => {
  try {
    // Skip for API routes to avoid noisy logs and unnecessary processing
    const requestPath = req.path || req.originalUrl || '';
    if (requestPath.startsWith('/api/')) {
      return next();
    }

    const host = req.headers.host || req.headers['x-original-host'] || '';
    const bioHandle = req.headers['x-bio-handle'] || extractBioHandle(host);
    
    if (process.env.BIO_DEBUG === 'true') {
      console.log('DEBUG bioHostRouting check:', {
        host,
        bioHandle,
        path: req.path,
        method: req.method
      });
    }

    // Not a bio page request
    if (!bioHandle) {
      req.isBioPageRequest = false;
      return next();
    }

    // Mark as bio page request
    req.isBioPageRequest = true;
    req.bioHandle = bioHandle;

    logger.info('BIO_ROUTING', `Bio page request detected: ${bioHandle}`, {
      host,
      userAgent: req.headers['user-agent'],
      path: req.path,
      ip: req.ip
    });

    // For API requests to bio pages, continue to API handlers
    if (req.path.startsWith('/api/')) {
      return next();
    }

    // For non-API requests, check if bio page exists and is published
    const queries = getQueries();
    const bioProfile = queries.getPublishedBioProfile?.get(bioHandle);
    
    if (process.env.BIO_DEBUG === 'true') {
      console.log('DEBUG bioHostRouting:', {
        bioHandle,
        bioProfile: !!bioProfile,
        bioProfileId: bioProfile?.id,
        host: req.headers.host,
        path: req.path
      });
    }

    if (!bioProfile) {
      logger.warn('BIO_ROUTING', `Bio page not found: ${bioHandle}`, {
        host,
        path: req.path,
        ip: req.ip
      });

      // Return 404 for non-existent bio pages
      const frontendUrl = process.env.FRONTEND_URL || 'https://flowerpil.io';
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Bio Page Not Found</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body {
                font-family: 'Paper Mono', monospace;
                background: #000;
                color: #fff;
                margin: 0;
                padding: 2rem;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
              }
              .container {
                text-align: center;
                border: 1px dashed rgba(255,255,255,0.3);
                padding: 2rem;
                max-width: 500px;
              }
              h1 { margin-bottom: 1rem; text-transform: uppercase; }
              p { margin-bottom: 1rem; opacity: 0.8; }
              a { color: #fff; text-decoration: none; border: 1px dashed rgba(255,255,255,0.3); padding: 0.5rem 1rem; }
              a:hover { background: rgba(255,255,255,0.1); }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Bio Page Not Found</h1>
              <p>The bio page "${bioHandle}" doesn't exist or isn't published yet.</p>
              <a href="${frontendUrl}">← Back to Flowerpil</a>
            </div>
          </body>
        </html>
      `);
    }

    // Add bio profile data to request
    req.bioProfile = bioProfile;

    logger.info('BIO_ROUTING', `Bio page found: ${bioHandle}`, {
      profileId: bioProfile.id,
      curatorId: bioProfile.curator_id,
      publishedAt: bioProfile.published_at
    });

    next();
  } catch (error) {
    logger.error('BIO_ROUTING', 'Error in bio host routing', {
      error: error.message,
      stack: error.stack,
      host: req.headers.host,
      path: req.path
    });

    // Continue to normal request handling on error
    req.isBioPageRequest = false;
    next();
  }
};

/**
 * Development-only middleware for local bio page testing
 * Allows testing bio pages via query parameter: ?bio_handle=test-handle
 */
export const devBioRouting = (req, res, next) => {
  if (process.env.NODE_ENV !== 'development') {
    return next();
  }

  const testHandle = req.query.bio_handle;
  if (!testHandle) {
    return next();
  }

  // Validate test handle
  if (!HANDLE_REGEX.test(testHandle) || RESERVED_HANDLES.has(testHandle)) {
    return res.status(400).json({
      error: 'Invalid bio handle for testing',
      handle: testHandle
    });
  }

  // Set up request as bio page request
  req.isBioPageRequest = true;
  req.bioHandle = testHandle;
  
  logger.info('DEV_BIO_ROUTING', `Development bio page test: ${testHandle}`, {
    path: req.path,
    query: req.query
  });

  // Load bio profile from database (same as bioHostRouting)
  try {
    const queries = getQueries();
    const bioProfile = queries.getPublishedBioProfile.get(testHandle);
    
    if (!bioProfile) {
      return res.status(404).json({
        error: 'Bio profile not found',
        handle: testHandle,
        message: 'Create a bio profile with this handle in the admin panel first'
      });
    }

    // Add bio profile data to request
    req.bioProfile = bioProfile;
    
    logger.info('DEV_BIO_ROUTING', `Development bio profile found: ${testHandle}`, {
      profileId: bioProfile.id,
      curatorId: bioProfile.curator_id
    });

    next();
  } catch (error) {
    logger.error('DEV_BIO_ROUTING', 'Error loading bio profile for development', {
      error: error.message,
      handle: testHandle
    });
    
    return res.status(500).json({
      error: 'Error loading bio profile',
      handle: testHandle
    });
  }
};

export default {
  bioHostRouting,
  devBioRouting,
  extractBioHandle,
  RESERVED_HANDLES
};
