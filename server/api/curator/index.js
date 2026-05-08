import express from 'express';
import Joi from 'joi';
import { authMiddleware, requireAnyRole } from '../../middleware/auth.js';
import { getDatabase, getQueries } from '../../database/db.js';
import { adminApiLimiter } from '../../middleware/rateLimiting.js';
import { validateCSRFToken } from '../../middleware/csrfProtection.js';
import { sendReferralSubmissionEmail } from '../../utils/emailService.js';
import SpotifyService from '../../services/spotifyService.js';
import TidalService from '../../services/tidalService.js';
import AppleMusicApiService from '../../services/appleMusicApiService.js';
import { calculateHealthStatus } from '../../services/tokenHealthService.js';
import { importFromSpotify, processSpotifyArtwork } from '../../services/playlistImportService.js';
import crossPlatformLinkingService from '../../services/crossPlatformLinkingService.js';
import { queueAutoExportForPlaylist } from '../../services/autoExportService.js';
import DeezerPreviewService from '../../services/deezerPreviewService.js';
import slackService from '../../services/SlackNotificationService.js';
import archiver from 'archiver';

const router = express.Router();
const spotifyService = new SpotifyService();
const deezerPreviewService = new DeezerPreviewService();
const spotifyPlaylistCooldown = new Map(); // per-user cooldown to prevent request storms
const SPOTIFY_PLAYLIST_ERROR_COOLDOWN_MS = 30_000; // 30s backoff after an error

// Apply authentication middleware to all curator routes
router.use(authMiddleware);

// Apply role-based access control (curator or admin)
router.use(requireAnyRole(['curator', 'admin']));

// Apply CSRF protection to all state-changing operations
// This is applied before rate limiting to prevent CSRF attacks from consuming rate limit quota
router.use((req, res, next) => {
  // Only validate CSRF for state-changing methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return validateCSRFToken(req, res, next);
  }
  next();
});

// Apply rate limiting
router.use(adminApiLimiter);

// Ownership helper function
const ensureOwnResource = (req, resourceCuratorId) => {
  if (req.user.role === 'admin') return true;
  return req.user.role === 'curator' && 
         req.user.curator_id && 
         req.user.curator_id === resourceCuratorId;
};

const getSpotifyPlaylistCooldown = (userId) => {
  if (!userId) return { cooldownUntil: 0 };
  return spotifyPlaylistCooldown.get(userId) || { cooldownUntil: 0 };
};

const setSpotifyPlaylistCooldown = (userId, ms = SPOTIFY_PLAYLIST_ERROR_COOLDOWN_MS) => {
  if (!userId) return;
  spotifyPlaylistCooldown.set(userId, { cooldownUntil: Date.now() + ms });
};

const clearSpotifyPlaylistCooldown = (userId) => {
  if (!userId) return;
  spotifyPlaylistCooldown.delete(userId);
};

// Input validation schemas
const profileUpdateSchema = Joi.object({
  name: Joi.string().max(120).optional(),
  // Accept any configured type; server will persist as provided
  profile_type: Joi.string().max(64).optional(),
  bio: Joi.string().max(2000).allow(null).optional(),
  bio_short: Joi.string().max(200).allow(null).optional(),
  location: Joi.string().max(120).allow(null).optional(),
  contact_email: Joi.string().email().allow(null).optional(),
  website_url: Joi.string().uri().allow(null).optional(),
  spotify_url: Joi.string().uri().allow(null).optional(),
  apple_url: Joi.string().uri().allow(null).optional(),
  tidal_url: Joi.string().uri().allow(null).optional(),
  bandcamp_url: Joi.string().uri().allow(null).optional(),
  // Allow relative or absolute path for profile image (uploaded via /uploads)
  profile_image: Joi.string().max(255).allow(null).optional(),
  // Accept JSON string or array of { platform, url }
  social_links: Joi.alternatives().try(Joi.string(), Joi.array(), Joi.valid(null)).optional(),
  external_links: Joi.alternatives().try(Joi.string(), Joi.array(), Joi.valid(null)).optional(),
  // Accept JSON string or object
  custom_fields: Joi.alternatives().try(Joi.string(), Joi.object(), Joi.valid(null)).optional()
});

const bioUpdateSchema = Joi.object({
  display_name: Joi.string().max(120).optional(),
  bio: Joi.string().max(2000).optional(),
  links: Joi.string().optional(),
  theme: Joi.string().valid('default', 'dark', 'minimal').optional(),
  is_published: Joi.boolean().optional()
});

const handleChangeSchema = Joi.object({
  handle: Joi.string()
    .pattern(/^[a-z0-9-]{3,32}$/)
    .required()
    .messages({
      'string.pattern.base': 'Handle must be 3-32 characters, lowercase letters, numbers, and hyphens only'
    })
});

const playlistSchema = Joi.object({
  title: Joi.string().max(200).required(),
  publish_date: Joi.date().optional(),
  description: Joi.string().max(2000).optional(),
  description_short: Joi.string().max(200).optional(),
  tags: Joi.string().optional(),
  published: Joi.boolean().optional(),
  spotify_url: Joi.string().uri().optional(),
  apple_url: Joi.string().uri().optional(),
  tidal_url: Joi.string().uri().optional()
});

const referralSchema = Joi.object({
  curator_name: Joi.string().max(120).required(),
  curator_type: Joi.string().max(64).optional(),
  email: Joi.string().email().required(),
  tester: Joi.boolean().optional()
});

const dspPlatforms = ['spotify', 'apple', 'tidal'];

const dspEntrySchema = Joi.object({
  y: Joi.boolean().required(),
  email: Joi.alternatives().try(Joi.string().email().allow('').allow(null), Joi.valid(null)).optional(),
  use_own: Joi.boolean().optional()
});

const dspQuestionnaireSchema = Joi.object({
  spotify: dspEntrySchema.optional(),
  apple: dspEntrySchema.optional(),
  tidal: dspEntrySchema.optional(),
  curatorId: Joi.number().integer().optional()
});

const mapAccountsResponse = (rows = []) => {
  const response = {};
  for (const platform of dspPlatforms) {
    // Default to exporting via Flowerpil (y: true, use_own: false)
    // Skip should never be default
    response[platform] = { y: true, email: '', use_own: false, pending_admin_approval: false };
  }

  for (const row of rows) {
    if (!dspPlatforms.includes(row.platform)) continue;

    // Parse metadata to check if platform is actually available
    let isAvailable = true; // Default to true for backwards compatibility
    try {
      if (row.metadata) {
        const meta = JSON.parse(row.metadata);
        isAvailable = meta.available !== false;
      }
    } catch (e) {
      // If metadata parse fails, default to available
    }

    response[row.platform] = {
      y: isAvailable,
      email: row.email || '',
      use_own: !(row.uses_flowerpil_account === 1 || row.uses_flowerpil_account === true),
      pending_admin_approval: row.pending_admin_approval === 1
    };
  }

  return response;
};

const sanitizeProfilePayload = (payload = {}) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      sanitized[key] = trimmed.length === 0 ? null : trimmed;
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
};

// GET /api/v1/curator/profile - Get own curator profile
router.get('/profile', async (req, res) => {
  try {
    const queries = getQueries();
    
    // For curator role, get their own profile
    // For admin role, allow getting profile via query param
    let curatorId = req.user.curator_id;
    
    if (req.user.role === 'admin' && req.query.id) {
      curatorId = parseInt(req.query.id);
    }
    
    if (!curatorId) {
      return res.status(404).json({
        error: 'Curator profile not found',
        message: 'No curator profile associated with this account'
      });
    }
    
    const curator = queries.getCuratorById.get(curatorId);
    if (!curator) {
      return res.status(404).json({
        error: 'Curator profile not found',
        message: 'Curator profile does not exist'
      });
    }
    
    res.json({
      success: true,
      curator: curator
    });
    
  } catch (error) {
    console.error('[CURATOR_PROFILE_GET] Error:', error);
    res.status(500).json({
      error: 'Failed to retrieve profile',
      message: 'An unexpected error occurred'
    });
  }
});

// GET /api/v1/curator/oauth-approval-status - Get curator's OAuth approval status for gated platforms
router.get('/oauth-approval-status', async (req, res) => {
  try {
    const db = getDatabase();
    const curatorId = req.user.curator_id;

    if (!curatorId) {
      return res.status(404).json({
        success: false,
        error: 'Curator profile not found'
      });
    }

    const curator = db.prepare(`
      SELECT spotify_oauth_approved, youtube_oauth_approved
      FROM curators
      WHERE id = ?
    `).get(curatorId);

    if (!curator) {
      return res.status(404).json({
        success: false,
        error: 'Curator not found'
      });
    }

    res.json({
      success: true,
      data: {
        spotify_oauth_approved: curator.spotify_oauth_approved === 1,
        youtube_oauth_approved: curator.youtube_oauth_approved === 1
      }
    });
  } catch (error) {
    console.error('[OAUTH_APPROVAL_STATUS] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve OAuth approval status'
    });
  }
});

// PUT /api/v1/curator/profile - Update own curator profile
router.put('/profile', async (req, res) => {
  try {
    const raw = req.body || {};
    const cleaned = sanitizeProfilePayload(raw);

    const { error, value } = profileUpdateSchema.validate(cleaned, {
      abortEarly: false,
      stripUnknown: true
    });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message
      });
    }

    const queries = getQueries();
    const curatorId = req.user.curator_id;
    
    if (!curatorId) {
      return res.status(404).json({
        error: 'Curator profile not found',
        message: 'No curator profile associated with this account'
      });
    }
    
    // Get current curator data
    const currentCurator = queries.getCuratorById.get(curatorId);
    if (!currentCurator) {
      return res.status(404).json({
        error: 'Curator profile not found',
        message: 'Curator profile does not exist'
      });
    }
    
    // Only allow curators to edit their own profile
    if (!ensureOwnResource(req, curatorId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only edit your own profile'
      });
    }

    if (!value || Object.keys(value).length === 0) {
      return res.json({
        success: true,
        message: 'No changes detected',
        curator: currentCurator,
        updatedFields: [],
        changesApplied: false
      });
    }

    const hasField = (field) => Object.prototype.hasOwnProperty.call(value, field);
    const mergeField = (field, fallback) => hasField(field) ? value[field] : fallback;

    const normalizedSocial = hasField('social_links')
      ? (value.social_links === null
        ? null
        : (typeof value.social_links === 'string'
          ? value.social_links
          : JSON.stringify(value.social_links)))
      : currentCurator.social_links;
    const normalizedExternal = hasField('external_links')
      ? (value.external_links === null
        ? null
        : (typeof value.external_links === 'string'
          ? value.external_links
          : JSON.stringify(value.external_links)))
      : currentCurator.external_links;
    const normalizedCustom = hasField('custom_fields')
      ? (value.custom_fields === null
        ? null
        : (typeof value.custom_fields === 'string'
          ? value.custom_fields
          : JSON.stringify(value.custom_fields)))
      : currentCurator.custom_fields;

    console.log('[CURATOR_PROFILE_PUT] Payload received', {
      keys: Object.keys(value || {}),
      hasSocialLinks: hasField('social_links'),
      hasExternalLinks: hasField('external_links'),
      hasCustomFields: hasField('custom_fields')
    });

    const nextName = mergeField('name', currentCurator.name);
    const nextProfileType = mergeField('profile_type', currentCurator.profile_type);
    const nextBio = mergeField('bio', currentCurator.bio);
    const nextBioShort = mergeField('bio_short', currentCurator.bio_short);
    const nextProfileImage = mergeField('profile_image', currentCurator.profile_image);
    const nextLocation = mergeField('location', currentCurator.location);
    const nextWebsite = mergeField('website_url', currentCurator.website_url);
    const nextContactEmail = mergeField('contact_email', currentCurator.contact_email);
    const nextSpotify = mergeField('spotify_url', currentCurator.spotify_url);
    const nextApple = mergeField('apple_url', currentCurator.apple_url);
    const nextTidal = mergeField('tidal_url', currentCurator.tidal_url);
    const nextBandcamp = mergeField('bandcamp_url', currentCurator.bandcamp_url);

    // Update curator profile
    const result = queries.updateCurator.run(
      nextName,
      currentCurator.type, // keep existing type
      nextProfileType,
      currentCurator.tester, // tester flag should never be mutated here
      currentCurator.spotify_oauth_approved, // preserve oauth status
      currentCurator.youtube_oauth_approved, // preserve oauth status
      nextBio,
      nextBioShort,
      nextProfileImage,
      nextLocation,
      nextWebsite,
      nextContactEmail,
      nextSpotify,
      nextApple,
      nextTidal,
      nextBandcamp,
      normalizedSocial,
      normalizedExternal,
      currentCurator.verification_status,
      currentCurator.profile_visibility,
      currentCurator.upcoming_releases_enabled,
      currentCurator.upcoming_shows_enabled,
      currentCurator.dsp_implementation_status,
      normalizedCustom,
      curatorId
    );
    
    // Return updated curator data
    const updatedCurator = queries.getCuratorById.get(curatorId);

    const trackedFields = [
      'name',
      'profile_type',
      'bio',
      'bio_short',
      'profile_image',
      'location',
      'website_url',
      'contact_email',
      'spotify_url',
      'apple_url',
      'tidal_url',
      'bandcamp_url',
      'social_links',
      'external_links',
      'custom_fields'
    ];
    const updatedFields = trackedFields.filter((field) => {
      const before = currentCurator?.[field] ?? null;
      const after = updatedCurator?.[field] ?? null;
      return before !== after;
    });
    const changesApplied = updatedFields.length > 0 || result.changes > 0;

    // Propagate name change to playlists for consistent display/URLs
    try {
      if (hasField('name') && value.name && value.name.trim() && value.name.trim() !== currentCurator.name) {
        const db = (await import('../../database/db.js')).getDatabase();
        db.prepare('UPDATE playlists SET curator_name = ? WHERE curator_id = ?').run(value.name.trim(), curatorId);
        console.log('[CURATOR_PROFILE_PUT] Propagated curator_name to playlists', { curatorId, name: value.name.trim() });
      }
    } catch (e) {
      console.warn('[CURATOR_PROFILE_PUT] Failed to propagate curator_name to playlists', e.message);
    }
    
    res.json({
      success: true,
      message: changesApplied ? 'Profile updated successfully' : 'No changes detected',
      curator: updatedCurator,
      updatedFields,
      changesApplied
    });
    
  } catch (error) {
    console.error('[CURATOR_PROFILE_UPDATE] Error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: 'An unexpected error occurred'
    });
  }
});

// GET /api/v1/curator/onboarding/dsp - Load curator DSP questionnaire responses
router.get('/onboarding/dsp', async (req, res) => {
  try {
    const queries = getQueries();
    let curatorId = req.user.curator_id;

    if (req.user.role === 'admin' && req.query.curatorId) {
      const parsed = parseInt(req.query.curatorId, 10);
      if (!Number.isNaN(parsed)) {
        curatorId = parsed;
      }
    }

    if (!curatorId) {
      return res.status(404).json({
        error: 'Curator profile not found',
        message: 'No curator profile associated with this account'
      });
    }

    if (!ensureOwnResource(req, curatorId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own questionnaire responses'
      });
    }

    const curator = queries.getCuratorById.get(curatorId);
    if (!curator) {
      return res.status(404).json({
        error: 'Curator profile not found',
        message: 'Curator profile does not exist'
      });
    }

    const rows = queries.getCuratorDSPAccounts.all(curatorId) || [];
    res.json({
      success: true,
      data: mapAccountsResponse(rows)
    });
  } catch (error) {
    console.error('[CURATOR_DSP_GET] Error loading questionnaire:', error);
    res.status(500).json({
      error: 'Failed to load DSP questionnaire',
      message: 'An unexpected error occurred'
    });
  }
});

// POST /api/v1/curator/onboarding/dsp - Persist questionnaire responses
router.post('/onboarding/dsp', async (req, res) => {
  try {
    const { error, value } = dspQuestionnaireSchema.validate(req.body || {}, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details.map((d) => d.message).join(', ')
      });
    }

    const { curatorId: overrideCuratorId, ...payload } = value;

    let curatorId = req.user.curator_id;
    if (req.user.role === 'admin' && overrideCuratorId) {
      curatorId = overrideCuratorId;
    }

    if (!curatorId) {
      return res.status(404).json({
        error: 'Curator profile not found',
        message: 'No curator profile associated with this account'
      });
    }

    if (!ensureOwnResource(req, curatorId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update your own questionnaire'
      });
    }

    const queries = getQueries();
    const curator = queries.getCuratorById.get(curatorId);
    if (!curator) {
      return res.status(404).json({
        error: 'Curator profile not found',
        message: 'Curator profile does not exist'
      });
    }

    const nowIso = new Date().toISOString();
    for (const platform of dspPlatforms) {
      const entry = payload[platform];

      if (!entry) {
        continue;
      }

      // IMPORTANT: When platform is marked unavailable (y: false), we still create a record
      // with uses_flowerpil_account=1 so autoExportService will queue exports using Flowerpil's account.
      // This ensures cross-linking and exports happen for ALL platforms regardless of curator preference.
      const email = typeof entry.email === 'string' ? entry.email.trim().toLowerCase() : '';

      // If platform is unavailable, always use Flowerpil account (uses_flowerpil_account=1)
      // If platform is available, respect curator's preference (use_own determines the value)
      const usesFlowerpilAccount = entry.y ? (entry.use_own ? 0 : 1) : 1;

      // Spotify guardrails: requests with email require admin approval
      const pendingAdminApproval = platform === 'spotify' && entry.y && email ? 1 : 0;

      const metadata = JSON.stringify({
        available: entry.y === true,
        useOwn: entry.y ? (entry.use_own ?? null) : false,
        submittedAt: nowIso,
        pendingAdminApproval: pendingAdminApproval === 1
      });

      queries.upsertCuratorDSPAccount.run(
        curatorId,
        platform,
        email || null,
        usesFlowerpilAccount,
        metadata,
        pendingAdminApproval
      );

      // Send Slack notification for Spotify email submissions
      if (platform === 'spotify' && pendingAdminApproval === 1) {
        try {
          await slackService.notifySpotifyAccessRequest({
            curatorName: curator.name,
            curatorEmail: curator.contact_email || entry.email || 'N/A',
            spotifyEmail: email,
            curatorId: curatorId
          });
        } catch (slackError) {
          console.error('[CURATOR_DSP_POST] Failed to send Slack notification:', slackError);
          // Don't fail the request if Slack notification fails
        }
      }
    }

    const rows = queries.getCuratorDSPAccounts.all(curatorId) || [];
    res.json({
      success: true,
      data: mapAccountsResponse(rows)
    });
  } catch (error) {
    console.error('[CURATOR_DSP_POST] Error saving questionnaire:', error);
    res.status(500).json({
      error: 'Failed to save DSP questionnaire',
      message: 'An unexpected error occurred'
    });
  }
});

// DSP PLAYLIST IMPORT ENDPOINTS

// Helper function to get curator's OAuth token for a platform
const getCuratorOAuthToken = (userId, platform) => {
  try {
    const db = getDatabase();

    // First, get the user's record including role
    const user = db.prepare(`
      SELECT curator_id, role FROM admin_users WHERE id = ?
    `).get(userId);

    if (!user) {
      console.warn(`[CURATOR_OAUTH] No admin_user found for user ${userId}`);
      return null;
    }

    // For admin users operating as curators, they need a curator_id to proceed
    // This is required for curator dashboard operations
    if (!user.curator_id) {
      console.warn(`[CURATOR_OAUTH] No curator_id found for user ${userId} (role: ${user.role})`);
      return null;
    }

    // 1. First, try curator-specific tokens (curator's own connected account)
    let row = db.prepare(`
      SELECT
        id,
        access_token,
        refresh_token,
        expires_at,
        refresh_expires_at,
        owner_curator_id,
        account_type
      FROM export_oauth_tokens
      WHERE platform = ?
        AND account_type = 'curator'
        AND owner_curator_id = ?
        AND is_active = 1
      ORDER BY COALESCE(expires_at, datetime('now')) DESC
      LIMIT 1
    `).get(platform, user.curator_id);

    // 2. If no curator-specific token and user is admin, fall back to Flowerpil tokens
    // This allows admin accounts to use platform features via Flowerpil's managed tokens
    if ((!row || !row.access_token) && user.role === 'admin') {
      row = db.prepare(`
        SELECT
          id,
          access_token,
          refresh_token,
          expires_at,
          refresh_expires_at,
          owner_curator_id,
          account_type
        FROM export_oauth_tokens
        WHERE platform = ?
          AND account_type = 'flowerpil'
          AND is_active = 1
        ORDER BY
          CASE health_status
            WHEN 'healthy' THEN 1
            WHEN 'expiring' THEN 2
            WHEN 'unknown' THEN 3
            ELSE 4
          END,
          COALESCE(expires_at, datetime('now')) DESC
        LIMIT 1
      `).get(platform);

      if (row && row.access_token) {
        console.log(`[CURATOR_OAUTH] Admin user ${userId} using Flowerpil ${platform} token (fallback)`);
      }
    }

    if (!row || !row.access_token) {
      console.warn(`[CURATOR_OAUTH] No active ${platform} token found for curator ${user.curator_id}`);
      return null;
    }

    if (row.expires_at) {
      const expiresAtDate = new Date(row.expires_at);
      if (expiresAtDate <= new Date()) {
        row.isExpired = true;
        console.warn(`[CURATOR_OAUTH] ${platform} token appears expired for curator ${user.curator_id}`);
      }
    }

    console.log(`[CURATOR_OAUTH] Found valid ${platform} token for curator ${user.curator_id} (type: ${row.account_type})`);
    return row;
  } catch (error) {
    console.error(`[CURATOR_OAUTH] Error fetching ${platform} token for user ${userId}:`, error.message);
    return null;
  }
};

const refreshCuratorSpotifyToken = async (tokenRecord, spotifyService) => {
  if (!tokenRecord?.refresh_token) {
    console.warn('[CURATOR_OAUTH] Cannot refresh Spotify token without refresh_token');
    return null;
  }

  try {
    const refreshed = await spotifyService.refreshAccessToken(tokenRecord.refresh_token);
    const newExpiresAt = refreshed.expires_in
      ? new Date(Date.now() + (refreshed.expires_in * 1000)).toISOString()
      : null;
    const db = getDatabase();
    const nextRefreshToken = refreshed.refresh_token || tokenRecord.refresh_token;

    db.prepare(`
      UPDATE export_oauth_tokens
      SET access_token = ?,
          refresh_token = ?,
          expires_at = ?,
          health_status = ?,
          last_validated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      refreshed.access_token,
      nextRefreshToken,
      newExpiresAt,
      calculateHealthStatus(newExpiresAt),
      tokenRecord.id
    );

    console.log(`[CURATOR_OAUTH] Refreshed Spotify token ${tokenRecord.id} for curator ${tokenRecord.owner_curator_id || 'unknown'}`);

    return {
      ...tokenRecord,
      access_token: refreshed.access_token,
      refresh_token: nextRefreshToken,
      expires_at: newExpiresAt,
      isExpired: false
    };
  } catch (error) {
    console.error('[CURATOR_OAUTH] Failed to refresh Spotify token:', error.message);
    throw error;
  }
};

// Get Spotify playlists for authenticated curator
router.get('/dsp/spotify/playlists', async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const { cooldownUntil } = getSpotifyPlaylistCooldown(userId);
    const now = Date.now();
    if (cooldownUntil && cooldownUntil > now) {
      const retryAfter = Math.max(1, Math.ceil((cooldownUntil - now) / 1000));
      return res.status(429).set('Retry-After', String(retryAfter)).json({
        success: false,
        error: 'Spotify playlist requests are temporarily limited. Please wait a moment and try again.',
        code: 'RATE_LIMITED',
        retry_after_seconds: retryAfter
      });
    }

    let tokenRecord = getCuratorOAuthToken(req.user.id, 'spotify');

    if (!tokenRecord) {
      return res.status(401).json({
        success: false,
        error: 'Spotify not connected',
        code: 'AUTH_REQUIRED',
        message: 'Please connect your Spotify account to import playlists'
      });
    }

    const respondWithPlaylists = (items) => {
      clearSpotifyPlaylistCooldown(userId);
      return res.json({
        success: true,
        data: {
          items,
          total: items.length
        }
      });
    };

    const fetchAllPlaylists = async (accessToken) => {
      const limit = 50;
      let offset = 0;
      const collected = [];
      let hasMore = true;

      while (hasMore) {
        const data = await spotifyService.getUserPlaylists(accessToken, limit, offset);
        const items = data?.items || [];
        collected.push(...items);

        hasMore = Boolean(data?.next) && items.length === limit;
        offset += limit;

        if (collected.length >= 500) break;
      }

      return collected;
    };

    // Preemptively refresh if we already know this token expired
    if (tokenRecord.isExpired && tokenRecord.refresh_token) {
      try {
        tokenRecord = await refreshCuratorSpotifyToken(tokenRecord, spotifyService);
      } catch (refreshError) {
        console.error('[CURATOR_SPOTIFY_PLAYLISTS] Failed to refresh expired Spotify token:', refreshError);
        return res.status(401).json({
          success: false,
          error: 'Spotify connection expired',
          code: 'AUTH_REFRESH_FAILED',
          message: 'Please reconnect your Spotify account to import playlists'
        });
      }
    }

    try {
      const playlists = await fetchAllPlaylists(tokenRecord.access_token);
      return respondWithPlaylists(playlists);
    } catch (error) {
      const needsRefresh = error.status === 401 && tokenRecord.refresh_token;
      if (error.status === 429) {
        setSpotifyPlaylistCooldown(userId);
      }

      if (needsRefresh) {
        try {
          tokenRecord = await refreshCuratorSpotifyToken(tokenRecord, spotifyService);
          if (tokenRecord?.access_token) {
            const playlists = await fetchAllPlaylists(tokenRecord.access_token);
            return respondWithPlaylists(playlists);
          }
        } catch (refreshError) {
          console.error('[CURATOR_SPOTIFY_PLAYLISTS] Refresh + retry failed:', refreshError);
          setSpotifyPlaylistCooldown(userId);
          return res.status(401).json({
            success: false,
            error: 'Spotify connection expired',
            code: refreshError.message?.includes('REFRESH_TOKEN_INVALID') ? 'AUTH_REVOKED' : 'AUTH_REFRESH_FAILED',
            message: 'Please reconnect your Spotify account to import playlists'
          });
        }
      }

      if (error.status === 401) {
        setSpotifyPlaylistCooldown(userId);
        return res.status(401).json({
          success: false,
          error: 'Spotify connection expired',
          code: 'AUTH_EXPIRED',
          message: 'Please reconnect your Spotify account to import playlists'
        });
      }

      throw error;
    }
  } catch (error) {
    console.error('[CURATOR_SPOTIFY_PLAYLISTS] Error fetching playlists:', error.message);
    setSpotifyPlaylistCooldown(req.user?.id || null);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch Spotify playlists',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Get Spotify access token for curator (for tools/analysis)
router.get('/dsp/spotify/token', async (req, res) => {
  try {
    let tokenRecord = getCuratorOAuthToken(req.user.id, 'spotify');

    if (!tokenRecord) {
      return res.status(401).json({
        success: false,
        error: 'Spotify not connected',
        code: 'AUTH_REQUIRED',
        message: 'Please connect your Spotify account in DSP Settings'
      });
    }

    // Preemptively refresh if expired
    if (tokenRecord.isExpired && tokenRecord.refresh_token) {
      try {
        tokenRecord = await refreshCuratorSpotifyToken(tokenRecord, spotifyService);
      } catch (refreshError) {
        console.error('[CURATOR_SPOTIFY_TOKEN] Failed to refresh expired token:', refreshError);
        return res.status(401).json({
          success: false,
          error: 'Spotify connection expired',
          code: 'AUTH_REFRESH_FAILED',
          message: 'Please reconnect your Spotify account in DSP Settings'
        });
      }
    }

    return res.json({
      success: true,
      data: {
        access_token: tokenRecord.access_token
      }
    });
  } catch (error) {
    console.error('[CURATOR_SPOTIFY_TOKEN] Error getting token:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get Spotify token',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Import Spotify playlist into Flowerpil using curator token
router.post('/dsp/spotify/import', async (req, res) => {
  try {
    const queries = getQueries();
    const db = getDatabase();
    const {
      playlist_id,
      spotify_playlist_id,
      mode = 'replace',
      append_position = 'top',
      update_metadata = true,
      refresh_publish_date = false
    } = req.body || {};

    const playlistId = Number.parseInt(playlist_id, 10);
    const spotifyPlaylistId = typeof spotify_playlist_id === 'string'
      ? spotify_playlist_id.trim()
      : '';

    if (!playlistId || !spotifyPlaylistId) {
      return res.status(400).json({
        success: false,
        error: 'playlist_id and spotify_playlist_id are required'
      });
    }

    const playlist = queries.getPlaylistById.get(playlistId);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }

    if (!ensureOwnResource(req, playlist.curator_id)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    let tokenRecord = getCuratorOAuthToken(req.user.id, 'spotify');
    if (!tokenRecord) {
      return res.status(401).json({
        success: false,
        error: 'Spotify not connected',
        code: 'AUTH_REQUIRED',
        message: 'Please connect your Spotify account to import playlists'
      });
    }

    if (tokenRecord.isExpired) {
      if (tokenRecord.refresh_token) {
        try {
          tokenRecord = await refreshCuratorSpotifyToken(tokenRecord, spotifyService);
        } catch (refreshError) {
          const isRevoked = refreshError.message?.includes('REFRESH_TOKEN_INVALID');
          return res.status(401).json({
            success: false,
            error: isRevoked ? 'Spotify access revoked' : 'Spotify connection expired',
            code: isRevoked ? 'AUTH_REVOKED' : 'AUTH_REFRESH_FAILED',
            message: 'Please reconnect your Spotify account to import playlists'
          });
        }
      } else {
        return res.status(401).json({
          success: false,
          error: 'Spotify connection expired',
          code: 'AUTH_EXPIRED',
          message: 'Please reconnect your Spotify account to import playlists'
        });
      }
    }

    const normalizedMode = mode === 'append' ? 'append' : 'replace';
    const normalizedAppend = append_position === 'bottom' ? 'bottom' : 'top';
    const shouldUpdateMetadata = update_metadata !== false;

    console.log('[CURATOR_SPOTIFY_IMPORT] Starting import', {
      playlistId,
      spotifyPlaylistId,
      mode: normalizedMode,
      curatorId: req.user.curator_id
    });

    const importStartTime = Date.now();
    const stats = await importFromSpotify({
      playlistId,
      spotifyPlaylistId,
      mode: normalizedMode,
      appendPosition: normalizedAppend,
      handleDeletions: normalizedMode === 'replace',
      curatorToken: tokenRecord.access_token,
      artwork: false,
      returnDetails: shouldUpdateMetadata
    });
    const importDuration = Date.now() - importStartTime;
    console.log('[CURATOR_SPOTIFY_IMPORT] Import completed', {
      playlistId,
      tracksAdded: stats.added,
      totalTracks: stats.total_after,
      durationMs: importDuration
    });

    let nextImage = playlist.image;
    let nextSpotifyUrl = playlist.spotify_url || `https://open.spotify.com/playlist/${spotifyPlaylistId}`;
    let nextTitle = playlist.title;
    let nextDescription = playlist.description;
    let nextShortDescription = playlist.description_short;

    if (shouldUpdateMetadata && stats?.sourcePlaylist) {
      const details = stats.sourcePlaylist;
      if (details.name) nextTitle = details.name;
      if (typeof details.description === 'string') {
        nextDescription = details.description;
        nextShortDescription = spotifyService.truncateDescription(details.description || '');
      }
      if (details.externalUrl) nextSpotifyUrl = details.externalUrl;
      // Playlist artwork will be processed in background to avoid blocking response
      if (details.image) {
        // Store image URL for background processing
        nextImage = details.image;
      }
    }

    const nextPublishDate = refresh_publish_date
      ? new Date().toISOString().split('T')[0]
      : playlist.publish_date;

    db.prepare(`
      UPDATE playlists
      SET title = ?,
          description = ?,
          description_short = ?,
          image = ?,
          spotify_url = ?,
          publish_date = ?
      WHERE id = ?
    `).run(
      nextTitle,
      nextDescription || '',
      nextShortDescription || '',
      nextImage || '',
      nextSpotifyUrl || '',
      nextPublishDate || playlist.publish_date,
      playlistId
    );

    // Return response immediately - don't block on background tasks
    const responseData = {
      success: true,
      data: {
        stats,
        playlist_id: playlistId
      }
    };

    // Send response immediately
    res.json(responseData);

    // Run background tasks asynchronously (fire and forget)
    setImmediate(async () => {
      // Process playlist artwork in background if needed
      if (shouldUpdateMetadata && stats?.sourcePlaylist?.image && nextImage === stats.sourcePlaylist.image) {
        try {
          const artwork = await spotifyService.downloadArtwork(stats.sourcePlaylist.image, `playlist-${playlistId}-${Date.now()}.jpg`);
          if (artwork) {
            const stored = await processSpotifyArtwork(artwork, 'playlist');
            if (stored) {
              db.prepare('UPDATE playlists SET image = ? WHERE id = ?').run(stored, playlistId);
              console.log('[CURATOR_SPOTIFY_IMPORT] Playlist artwork processed', { playlistId });
            }
          }
        } catch (artworkError) {
          console.warn('[CURATOR_SPOTIFY_IMPORT] Failed to process playlist artwork:', artworkError.message);
        }
      }

      try {
        await crossPlatformLinkingService.startPlaylistLinking(playlistId, { forceRefresh: normalizedMode === 'replace' });
        console.log('[CURATOR_SPOTIFY_IMPORT] Linking job enqueued', { playlistId });
      } catch (linkErr) {
        console.warn('[CURATOR_SPOTIFY_IMPORT] Failed to enqueue linking job:', linkErr.message);
      }

      try {
        const autoResult = queueAutoExportForPlaylist({
          playlistId,
          trigger: 'import',
          exclude: ['spotify'],
          resetProgress: true
        });
        if (!autoResult.queued) {
          console.info('[CURATOR_SPOTIFY_IMPORT] Auto export skipped', autoResult.reason);
        }
      } catch (autoErr) {
        console.warn('[CURATOR_SPOTIFY_IMPORT] Failed to queue auto export:', autoErr.message);
      }

      // Fetch Deezer previews for imported tracks (non-blocking)
      try {
        const tracks = queries.getTracksByPlaylistId.all(playlistId);
        if (tracks.length > 0) {
          console.log(`[CURATOR_SPOTIFY_IMPORT] Fetching Deezer previews for ${tracks.length} tracks in playlist ${playlistId}`);

          // Process in batches to avoid overwhelming the API
          const batchSize = 5;
          let previewsFetched = 0;

          for (let i = 0; i < tracks.length; i += batchSize) {
            const batch = tracks.slice(i, i + batchSize);

            await Promise.all(
              batch.map(async (track) => {
                try {
                  // Skip if preview already exists and is fresh (< 24 hours)
                  if (track.deezer_preview_url && track.preview_updated_at) {
                    const updatedAt = new Date(track.preview_updated_at);
                    const hoursAgo = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);
                    if (hoursAgo < 24) {
                      return;
                    }
                  }

                  const previewData = await deezerPreviewService.getPreviewForTrack(track);

                  if (previewData) {
                    queries.updateTrackPreview.run(
                      previewData.deezer_id,
                      previewData.url,
                      previewData.source,
                      previewData.confidence,
                      track.id
                    );
                    previewsFetched++;
                  }
                } catch (previewError) {
                  console.warn(`[CURATOR_SPOTIFY_IMPORT] Failed to fetch preview for track ${track.id}:`, previewError.message);
                }
              })
            );

            // Small delay between batches
            if (i + batchSize < tracks.length) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }

          console.log(`[CURATOR_SPOTIFY_IMPORT] Fetched ${previewsFetched} Deezer previews for playlist ${playlistId}`);
        }
      } catch (previewErr) {
        console.warn('[CURATOR_SPOTIFY_IMPORT] Failed to fetch Deezer previews:', previewErr.message);
      }
    });
  } catch (error) {
    console.error('[CURATOR_SPOTIFY_IMPORT] Failed to import playlist:', error.message);
    
    // Check for specific Spotify Developer Dashboard error
    const errorMessage = error.message || '';
    const errorDetails = error.details || '';
    const isNotRegistered = errorMessage.includes('developer.spotify.com') || 
                           errorMessage.includes('not be registered') ||
                           errorDetails.includes('developer.spotify.com') ||
                           errorDetails.includes('not be registered');
    
    if (isNotRegistered) {
      return res.status(403).json({
        success: false,
        error: 'Spotify account not registered',
        code: 'SPOTIFY_NOT_REGISTERED',
        message: 'Check settings on developer.spotify.com/dashboard, the user may not be registered.',
        details: errorDetails || errorMessage
      });
    }
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to import Spotify playlist',
      details: errorDetails || error.message
    });
  }
});

// Get tracks from Spotify library playlist (for export tools)
router.get('/dsp/spotify/playlist/:playlistId/tracks', async (req, res) => {
  try {
    const { playlistId } = req.params;

    if (!playlistId) {
      return res.status(400).json({
        success: false,
        error: 'Playlist ID is required'
      });
    }

    let tokenRecord = getCuratorOAuthToken(req.user.id, 'spotify');

    if (!tokenRecord) {
      return res.status(401).json({
        success: false,
        error: 'Spotify not connected',
        code: 'AUTH_REQUIRED',
        message: 'Please connect your Spotify account to access your library'
      });
    }

    // Preemptively refresh if expired
    if (tokenRecord.isExpired && tokenRecord.refresh_token) {
      try {
        tokenRecord = await refreshCuratorSpotifyToken(tokenRecord, spotifyService);
      } catch (refreshError) {
        console.error('[CURATOR_SPOTIFY_PLAYLIST_TRACKS] Failed to refresh expired token:', refreshError);
        return res.status(401).json({
          success: false,
          error: 'Spotify connection expired',
          code: 'AUTH_REFRESH_FAILED',
          message: 'Please reconnect your Spotify account to access your library'
        });
      }
    }

    try {
      const playlistDetails = await spotifyService.getPlaylistDetails(tokenRecord.access_token, playlistId);

      // Transform tracks to Flowerpil format
      const tracks = spotifyService.transformTracksForFlowerpil(playlistDetails.tracks);

      return res.json({
        success: true,
        data: {
          playlist: {
            id: playlistDetails.id,
            name: playlistDetails.name,
            description: playlistDetails.description,
            image: playlistDetails.images?.[0]?.url || null,
            total: playlistDetails.tracks.length
          },
          tracks
        }
      });
    } catch (error) {
      const needsRefresh = error.status === 401 && tokenRecord.refresh_token;

      if (needsRefresh) {
        try {
          tokenRecord = await refreshCuratorSpotifyToken(tokenRecord, spotifyService);
          if (tokenRecord?.access_token) {
            const playlistDetails = await spotifyService.getPlaylistDetails(tokenRecord.access_token, playlistId);
            const tracks = spotifyService.transformTracksForFlowerpil(playlistDetails.tracks);

            return res.json({
              success: true,
              data: {
                playlist: {
                  id: playlistDetails.id,
                  name: playlistDetails.name,
                  description: playlistDetails.description,
                  image: playlistDetails.images?.[0]?.url || null,
                  total: playlistDetails.tracks.length
                },
                tracks
              }
            });
          }
        } catch (refreshError) {
          console.error('[CURATOR_SPOTIFY_PLAYLIST_TRACKS] Refresh + retry failed:', refreshError);
          return res.status(401).json({
            success: false,
            error: 'Spotify connection expired',
            code: refreshError.message?.includes('REFRESH_TOKEN_INVALID') ? 'AUTH_REVOKED' : 'AUTH_REFRESH_FAILED',
            message: 'Please reconnect your Spotify account to access your library'
          });
        }
      }

      if (error.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Spotify connection expired',
          code: 'AUTH_EXPIRED',
          message: 'Please reconnect your Spotify account to access your library'
        });
      }

      if (error.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'Playlist not found',
          message: 'The requested Spotify playlist could not be found'
        });
      }

      throw error;
    }
  } catch (error) {
    console.error('[CURATOR_SPOTIFY_PLAYLIST_TRACKS] Error fetching playlist tracks:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch Spotify playlist tracks',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Create a new Spotify playlist from filtered tracks
router.post('/dsp/spotify/playlist/create-from-tracks', async (req, res) => {
  try {
    const {
      trackIds,
      playlistName,
      releaseYear,
      sourcePlaylistId,
      sourcePlaylistName
    } = req.body || {};

    const sanitizedTrackIds = Array.isArray(trackIds)
      ? trackIds
          .map((id) => (id === null || id === undefined ? '' : String(id).trim()))
          .filter(Boolean)
      : [];
    const uniqueTrackIds = Array.from(new Set(sanitizedTrackIds));

    if (uniqueTrackIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'trackIds is required and must include at least one Spotify track ID'
      });
    }

    if (uniqueTrackIds.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Too many tracks to export. Please limit to 1000 tracks or fewer.'
      });
    }

    let tokenRecord = getCuratorOAuthToken(req.user.id, 'spotify');

    if (!tokenRecord) {
      return res.status(401).json({
        success: false,
        error: 'Spotify not connected',
        code: 'AUTH_REQUIRED',
        message: 'Please connect your Spotify account in DSP Settings'
      });
    }

    const runCreate = async (accessToken) => {
      const userProfile = await spotifyService.getUserProfile(accessToken);
      const derivedName = (playlistName && playlistName.trim())
        || [sourcePlaylistName, releaseYear ? `Year ${releaseYear}` : null, 'Filtered Selection']
          .filter(Boolean)
          .join(' • ')
        || 'Flowerpil Filtered Tracks';

      const descriptionParts = [
        `${uniqueTrackIds.length} track${uniqueTrackIds.length === 1 ? '' : 's'}`,
        'Created with Flowerpil'
      ];

      if (releaseYear) {
        descriptionParts.unshift(`Release year: ${releaseYear}`);
      }

      if (sourcePlaylistName) {
        descriptionParts.unshift(`Source: ${sourcePlaylistName}`);
      }

      const playlistData = {
        title: derivedName,
        description: descriptionParts.join(' • '),
        isPublic: true
      };

      const createdPlaylist = await spotifyService.createPlaylist(
        accessToken,
        userProfile.id,
        playlistData
      );

      const tracksAdded = await spotifyService.addTracksToPlaylist(
        accessToken,
        createdPlaylist.id,
        uniqueTrackIds
      );

      return { createdPlaylist, tracksAdded, derivedName };
    };

    try {
      const result = await runCreate(tokenRecord.access_token);
      return res.json({
        success: true,
        data: {
          playlistId: result.createdPlaylist.id,
          playlistName: result.createdPlaylist.name || result.derivedName,
          playlistUrl: result.createdPlaylist.url,
          tracksAdded: result.tracksAdded,
          totalRequested: uniqueTrackIds.length,
          releaseYear: releaseYear || null,
          sourcePlaylistId: sourcePlaylistId || null,
          sourcePlaylistName: sourcePlaylistName || null,
          refreshedToken: false
        }
      });
    } catch (error) {
      const needsRefresh = (error?.status === 401 || error?.response?.status === 401) && tokenRecord.refresh_token;

      if (needsRefresh) {
        try {
          tokenRecord = await refreshCuratorSpotifyToken(tokenRecord, spotifyService);
          const result = await runCreate(tokenRecord.access_token);
          return res.json({
            success: true,
            data: {
              playlistId: result.createdPlaylist.id,
              playlistName: result.createdPlaylist.name || result.derivedName,
              playlistUrl: result.createdPlaylist.url,
              tracksAdded: result.tracksAdded,
              totalRequested: uniqueTrackIds.length,
              releaseYear: releaseYear || null,
              sourcePlaylistId: sourcePlaylistId || null,
              sourcePlaylistName: sourcePlaylistName || null,
              refreshedToken: true
            }
          });
        } catch (refreshError) {
          console.error('[CURATOR_SPOTIFY_CREATE_FILTERED] Refresh + retry failed:', refreshError);
          return res.status(401).json({
            success: false,
            error: 'Spotify connection expired',
            code: refreshError.message?.includes('REFRESH_TOKEN_INVALID') ? 'AUTH_REVOKED' : 'AUTH_REFRESH_FAILED',
            message: 'Please reconnect your Spotify account to create playlists'
          });
        }
      }

      console.error('[CURATOR_SPOTIFY_CREATE_FILTERED] Failed to create playlist:', error.message);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to create Spotify playlist from filtered tracks'
      });
    }
  } catch (error) {
    console.error('[CURATOR_SPOTIFY_CREATE_FILTERED] Unexpected error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to create Spotify playlist from filtered tracks',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Download artwork from Spotify library playlist
router.post('/dsp/spotify/playlist/artwork/download', async (req, res) => {
  try {
    const { playlistId } = req.body;

    if (!playlistId) {
      return res.status(400).json({
        success: false,
        error: 'playlistId is required'
      });
    }

    let tokenRecord = getCuratorOAuthToken(req.user.id, 'spotify');

    if (!tokenRecord) {
      return res.status(401).json({
        success: false,
        error: 'Spotify not connected',
        code: 'AUTH_REQUIRED',
        message: 'Please connect your Spotify account to download artwork'
      });
    }

    // Preemptively refresh if expired
    if (tokenRecord.isExpired && tokenRecord.refresh_token) {
      try {
        tokenRecord = await refreshCuratorSpotifyToken(tokenRecord, spotifyService);
      } catch (refreshError) {
        console.error('[CURATOR_SPOTIFY_ARTWORK_DOWNLOAD] Failed to refresh expired token:', refreshError);
        return res.status(401).json({
          success: false,
          error: 'Spotify connection expired',
          code: 'AUTH_REFRESH_FAILED',
          message: 'Please reconnect your Spotify account to download artwork'
        });
      }
    }

    try {
      const playlistDetails = await spotifyService.getPlaylistDetails(tokenRecord.access_token, playlistId);
      const tracks = spotifyService.transformTracksForFlowerpil(playlistDetails.tracks);

      if (tracks.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Playlist has no tracks'
        });
      }

      // Create ZIP archive
      const archive = archiver('zip', { zlib: { level: 9 } });

      // Set response headers
      const safeFilename = (playlistDetails.name || 'spotify_playlist')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename}_artwork.zip"`
      );

      // Handle archive errors
      archive.on('error', (err) => {
        console.error('[CURATOR_SPOTIFY_ARTWORK_DOWNLOAD] Error creating ZIP archive', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Failed to create artwork archive'
          });
        }
      });

      // Pipe archive to response
      archive.pipe(res);

      let filesAdded = 0;
      const errors = [];

      // Process each track
      for (const [index, track] of tracks.entries()) {
        try {
          // Get artwork URL from Spotify track
          let artworkUrl = track.artwork_url || track.album_artwork_url;

          if (!artworkUrl) {
            errors.push(`No artwork: ${track.artist} - ${track.title}`);
            continue;
          }

          // Prefer large variant for better quality
          artworkUrl = artworkUrl.replace(/\/\d+\//, '/640/');

          // Download image with timeout
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          const imageResponse = await fetch(artworkUrl, {
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (!imageResponse.ok) {
            errors.push(`Failed download (${imageResponse.status}): ${track.artist} - ${track.title}`);
            continue;
          }

          const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

          // Create safe filename
          const filename = `${track.artist || 'Unknown'} - ${track.title || 'Unknown'}`
            .replace(/[^a-z0-9\s\-]/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
          const extension = artworkUrl.includes('.png') ? '.png' : '.jpg';

          // Add to ZIP with position prefix for ordering
          archive.append(imageBuffer, {
            name: `${String(index + 1).padStart(3, '0')}_${filename}${extension}`
          });

          filesAdded++;

        } catch (err) {
          console.error('[CURATOR_SPOTIFY_ARTWORK_DOWNLOAD] Error processing track artwork', {
            trackId: track.id,
            error: err.message
          });

          // Check if it's an abort error (timeout)
          if (err.name === 'AbortError') {
            errors.push(`Timeout: ${track.artist} - ${track.title}`);
          } else {
            errors.push(`Error: ${track.artist} - ${track.title}`);
          }
        }
      }

      if (filesAdded === 0) {
        archive.destroy();
        return res.status(500).json({
          success: false,
          error: 'No artwork could be downloaded'
        });
      }

      // Log errors if any
      if (errors.length > 0) {
        console.warn(`[CURATOR_SPOTIFY_ARTWORK_DOWNLOAD] ${errors.length} errors while downloading artwork:`, errors.slice(0, 5));
      }

      // Finalize archive
      await archive.finalize();

    } catch (error) {
      const needsRefresh = error.status === 401 && tokenRecord.refresh_token;

      if (needsRefresh) {
        try {
          tokenRecord = await refreshCuratorSpotifyToken(tokenRecord, spotifyService);
          // Could retry the download here, but for simplicity, just return error
          return res.status(401).json({
            success: false,
            error: 'Spotify connection expired',
            message: 'Please try again'
          });
        } catch (refreshError) {
          console.error('[CURATOR_SPOTIFY_ARTWORK_DOWNLOAD] Refresh failed:', refreshError);
          return res.status(401).json({
            success: false,
            error: 'Spotify connection expired',
            code: refreshError.message?.includes('REFRESH_TOKEN_INVALID') ? 'AUTH_REVOKED' : 'AUTH_REFRESH_FAILED',
            message: 'Please reconnect your Spotify account to download artwork'
          });
        }
      }

      if (error.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'Playlist not found',
          message: 'The requested Spotify playlist could not be found'
        });
      }

      throw error;
    }
  } catch (error) {
    console.error('[CURATOR_SPOTIFY_ARTWORK_DOWNLOAD] Error downloading artwork:', error.message);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: 'Failed to download artwork',
        message: error.message || 'An unexpected error occurred'
      });
    }
  }
});

// Get playlist tracks from a public Spotify URL (no OAuth required - uses client credentials)
// This allows tools to work with just a URL instead of requiring Spotify account connection
router.post('/dsp/spotify/playlist-from-url', async (req, res) => {
  try {
    const { url } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Spotify playlist URL is required'
      });
    }

    // Extract playlist ID from various URL formats
    const urlPatterns = [
      /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
      /spotify:playlist:([a-zA-Z0-9]+)/
    ];

    let playlistId = null;
    for (const pattern of urlPatterns) {
      const match = url.match(pattern);
      if (match) {
        playlistId = match[1];
        break;
      }
    }

    if (!playlistId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Spotify playlist URL. Please provide a valid Spotify playlist link.'
      });
    }

    // Use client credentials to fetch public playlist (no user auth needed)
    const playlistDetails = await spotifyService.getPublicPlaylistDetails(playlistId);

    // Transform tracks to Flowerpil format
    const tracks = spotifyService.transformTracksForFlowerpil(playlistDetails.tracks);

    console.log(`[CURATOR_SPOTIFY_URL] Fetched ${tracks.length} tracks from public playlist ${playlistId}`);

    return res.json({
      success: true,
      data: {
        playlist: {
          id: playlistDetails.id,
          name: playlistDetails.name,
          description: playlistDetails.description,
          image: playlistDetails.images?.[0]?.url || null,
          total: tracks.length,
          external_url: `https://open.spotify.com/playlist/${playlistId}`
        },
        tracks
      }
    });
  } catch (error) {
    console.error('[CURATOR_SPOTIFY_URL] Error fetching playlist from URL:', error.message);

    // Handle private playlist error
    if (error.message?.includes('private')) {
      return res.status(403).json({
        success: false,
        error: 'This playlist is private',
        message: 'Private playlists require connecting your Spotify account. Please connect Spotify in DSP Settings or use a public playlist URL.'
      });
    }

    // Handle not found
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found',
        message: 'The Spotify playlist could not be found. Please check the URL.'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch playlist',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Get Apple Music playlists for authenticated curator
router.get('/dsp/apple/playlists', async (req, res) => {
  try {
    const tokenRecord = getCuratorOAuthToken(req.user.id, 'apple');
    const token = tokenRecord?.access_token;

    if (!token || tokenRecord?.isExpired) {
      return res.status(401).json({
        success: false,
        error: 'Apple Music not connected',
        code: 'AUTH_REQUIRED',
        message: 'Please connect your Apple Music account to import playlists'
      });
    }

    // AppleMusicApiService is a singleton instance, not a class
    const playlists = await AppleMusicApiService.getUserLibraryPlaylists(token);

    return res.json({
      success: true,
      data: playlists || { data: [] }
    });
  } catch (error) {
    console.error('[CURATOR_APPLE_PLAYLISTS] Error fetching playlists:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch Apple Music playlists',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Get TIDAL playlists for authenticated curator
router.get('/dsp/tidal/playlists', async (req, res) => {
  try {
    const tokenRecord = getCuratorOAuthToken(req.user.id, 'tidal');
    const token = tokenRecord?.access_token;

    if (!token || tokenRecord?.isExpired) {
      return res.status(401).json({
        success: false,
        error: 'TIDAL not connected',
        code: 'AUTH_REQUIRED',
        message: 'Please connect your TIDAL account to import playlists'
      });
    }

    // TidalService is a singleton instance, not a class
    const playlists = await TidalService.getUserPlaylists(token);

    return res.json({
      success: true,
      data: playlists || { data: [] }
    });
  } catch (error) {
    console.error('[CURATOR_TIDAL_PLAYLISTS] Error fetching playlists:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch TIDAL playlists',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

export default router;

// REFERRALS
router.get('/referrals', async (req, res) => {
  try {
    const queries = getQueries();
    if (!req.user.curator_id) {
      return res.status(400).json({ error: 'Curator ID not found on user' });
    }
    const list = queries.listReferralsByIssuerCurator.all(req.user.curator_id);
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list referrals' });
  }
});

router.post('/referrals', async (req, res) => {
  try {
    const { error, value } = referralSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { curator_name, curator_type, email } = value;

    // Determine final curator_type (optional in UI). Validate only if provided, otherwise default to 'curator'.
    let finalType = curator_type;
    try {
      const { getDatabase } = await import('../../database/db.js');
      const db = getDatabase();
      const configs = db.prepare(`
        SELECT config_key FROM admin_system_config 
        WHERE config_key LIKE 'curator_type_%' AND config_key NOT LIKE 'curator_type_color_%'
      `).all();
      const defaultTypes = ['curator','label','label-ar','artist-manager','musician','dj','magazine','blog','podcast','venue','radio-station','producer'];
      const customTypes = configs.map(c => c.config_key.replace('curator_type_',''));
      const allowed = new Set([...defaultTypes, ...customTypes]);
      if (finalType && !allowed.has(finalType)) {
        return res.status(400).json({ error: 'Invalid curator type' });
      }
      if (!finalType) {
        finalType = 'curator';
      }
    } catch {
      if (!finalType) finalType = 'curator';
    }

    const rawCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    const code = value.tester ? `TESTER-${rawCode}` : rawCode;
    const queries = getQueries();
    queries.createReferral.run(code, curator_name, finalType, email, null, req.user.curator_id);

    let emailSent = true;
    try {
      await sendReferralSubmissionEmail({
        email,
        referralCode: code,
        inviteeName: curator_name,
        issuerName: req.user?.username || 'Flowerpil Curator'
      });
    } catch (emailError) {
      emailSent = false;
      console.error('[CURATOR_REFERRALS] Failed to send referral email', {
        error: emailError?.message || emailError,
        email,
        code
      });
    }

    res.status(201).json({ success: true, data: { code, curator_name, curator_type: finalType, email, emailSent, tester: !!value.tester } });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create referral' });
  }
});

// FLAGS (curator-owned)
router.get('/flags/summary', async (req, res) => {
  try {
    const { getDatabase } = await import('../../database/db.js');
    const db = getDatabase();
    const curatorId = req.user.curator_id;
    if (!curatorId) return res.status(400).json({ error: 'No curator profile linked' });

    // Count flags by joining through tracks to include legacy flags without playlist_id
    const rows = db.prepare(`
      SELECT p.id AS playlist_id,
             SUM(CASE WHEN f.status = 'unresolved' THEN 1 ELSE 0 END) AS unresolved,
             COUNT(f.id) AS total
      FROM playlists p
      LEFT JOIN tracks t ON t.playlist_id = p.id
      LEFT JOIN user_content_flags f ON f.track_id = t.id
      WHERE p.curator_id = ?
      GROUP BY p.id
      ORDER BY 
        COALESCE(
          p.published_at,
          CASE WHEN p.publish_date IS NOT NULL AND p.publish_date != '' THEN datetime(p.publish_date || ' 00:00:00') END,
          p.created_at
        ) DESC,
        p.id DESC
    `).all(curatorId);

    res.json({ success: true, summary: rows });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get flag summary' });
  }
});

router.get('/flags', async (req, res) => {
  try {
    const { getDatabase } = await import('../../database/db.js');
    const db = getDatabase();
    const curatorId = req.user.curator_id;
    if (!curatorId) return res.status(400).json({ error: 'No curator profile linked' });
    const { status = 'unresolved', playlistId = null } = req.query;

    const params = [curatorId];
    let where = `WHERE p.curator_id = ?`;
    if (status === 'resolved' || status === 'unresolved') {
      where += ` AND f.status = ?`;
      params.push(status);
    }
    if (playlistId) {
      where += ` AND p.id = ?`;
      params.push(parseInt(playlistId, 10));
    }

    const rows = db.prepare(`
      SELECT f.*, t.playlist_id AS playlist_id, t.position AS track_position
      FROM user_content_flags f
      JOIN tracks t ON t.id = f.track_id
      JOIN playlists p ON p.id = t.playlist_id
      ${where}
      ORDER BY f.created_at DESC
    `).all(...params);

    res.json({ success: true, flags: rows, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list flags' });
  }
});

router.put('/flags/:id/resolve', async (req, res) => {
  try {
    const { getDatabase } = await import('../../database/db.js');
    const db = getDatabase();
    const curatorId = req.user.curator_id;
    const id = parseInt(req.params.id, 10);
    if (!curatorId) return res.status(400).json({ error: 'No curator profile linked' });

    const flag = db.prepare(`
      SELECT f.*, p.curator_id
      FROM user_content_flags f
      JOIN tracks t ON t.id = f.track_id
      JOIN playlists p ON p.id = t.playlist_id
      WHERE f.id = ?
    `).get(id);
    if (!flag) return res.status(404).json({ error: 'Flag not found' });
    if (req.user.role !== 'admin' && flag.curator_id !== curatorId) {
      return res.status(403).json({ error: 'Not your playlist' });
    }

    db.prepare(`
      UPDATE user_content_flags SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
      WHERE id = ?
    `).run(req.user.username, id);

    res.json({ success: true, resolved_at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: 'Failed to resolve flag' });
  }
});

// READ-ONLY: Curator-owned playlist detail (allows unpublished)
router.get('/playlists/:id', async (req, res) => {
  try {
    const queries = getQueries();
    const id = parseInt(req.params.id, 10);
    const playlist = queries.getPlaylistById.get(id);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    if (!ensureOwnResource(req, playlist.curator_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const data = {
      id: playlist.id,
      title: playlist.title,
      description: playlist.description || null,
      published: Boolean(playlist.published),
      curator_id: playlist.curator_id || null,
      curator_name: playlist.curator_name || null,
      cover_image: playlist.image || null,
      external_urls: {
        spotify: playlist.spotify_url || null,
        tidal: playlist.tidal_url || null,
        apple: playlist.apple_url || null
      },
      created_at: playlist.created_at,
      updated_at: playlist.updated_at
    };
    return res.json({ success: true, data });
  } catch (e) {
    console.error('[CURATOR_PLAYLIST_GET] Error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// READ-ONLY: Curator-owned playlist tracks with platform links
router.get('/playlists/:id/tracks', async (req, res) => {
  try {
    const queries = getQueries();
    const id = parseInt(req.params.id, 10);
    const playlist = queries.getPlaylistById.get(id);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    if (!ensureOwnResource(req, playlist.curator_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const rows = queries.getTracksByPlaylistId.all(id) || [];
    const data = rows.map((t) => ({
      id: t.id,
      position: t.position,
      title: t.title,
      artist: t.artist,
      duration_sec: null,
      spotify_url: t.spotify_id ? `https://open.spotify.com/track/${t.spotify_id}` : null,
      tidal_url: t.tidal_id ? `https://tidal.com/browse/track/${t.tidal_id}` : null,
      apple_music_url: t.apple_id ? null : null,
      preview_url: t.preview_url || t.deezer_preview_url || null
    }));
    return res.json({ success: true, data });
  } catch (e) {
    console.error('[CURATOR_PLAYLIST_TRACKS_GET] Error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});



// CONTENT TAGS - Curator Self-Assignment

/**
 * GET /api/v1/curator/available-tags
 * Get all tags that curators can self-assign
 */
router.get('/available-tags', async (req, res) => {
  try {
    const { getDatabase } = await import('../../database/db.js');
    const db = getDatabase();

    const tags = db.prepare(`
      SELECT id, text, color, text_color, description, url_slug
      FROM custom_playlist_flags
      WHERE allow_self_assign = 1
      ORDER BY text ASC
    `).all();

    res.json({ success: true, tags });
  } catch (error) {
    console.error('[CURATOR_AVAILABLE_TAGS] Error:', error);
    res.status(500).json({ error: 'Failed to retrieve available tags' });
  }
});

/**
 * POST /api/v1/curator/playlist-tags
 * Curator assigns a tag to their own playlist
 */
router.post('/playlist-tags', async (req, res) => {
  try {
    const { getDatabase } = await import('../../database/db.js');
    const db = getDatabase();
    const { playlist_id, tag_id } = req.body;

    if (!playlist_id || !tag_id) {
      return res.status(400).json({
        error: 'Both playlist_id and tag_id are required'
      });
    }

    // Verify tag exists and allows self-assignment
    const tag = db.prepare(`
      SELECT id, text, allow_self_assign
      FROM custom_playlist_flags
      WHERE id = ?
    `).get(tag_id);

    if (!tag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    if (tag.allow_self_assign !== 1) {
      return res.status(403).json({
        error: 'This tag is not available for self-assignment',
        tag_name: tag.text
      });
    }

    // Verify playlist exists and curator owns it
    const playlist = db.prepare(`
      SELECT id, curator_id, title
      FROM playlists
      WHERE id = ?
    `).get(playlist_id);

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Ownership validation
    if (!ensureOwnResource(req, playlist.curator_id)) {
      return res.status(403).json({
        error: 'You can only assign tags to your own playlists',
        playlist_title: playlist.title
      });
    }

    // Assign tag
    const insertStmt = db.prepare(`
      INSERT INTO playlist_flag_assignments (playlist_id, flag_id, assigned_by, assigned_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(playlist_id, flag_id) DO NOTHING
    `);

    const result = insertStmt.run(playlist_id, tag_id, req.user?.id || null);

    if (result.changes === 0) {
      return res.status(409).json({
        error: 'Tag already assigned to this playlist',
        tag_name: tag.text,
        playlist_title: playlist.title
      });
    }

    res.json({
      success: true,
      message: `Tag "${tag.text}" assigned to playlist "${playlist.title}"`,
      assignment_id: result.lastInsertRowid
    });

  } catch (error) {
    console.error('[CURATOR_ASSIGN_TAG] Error:', error);
    res.status(500).json({ error: 'Failed to assign tag' });
  }
});

/**
 * DELETE /api/v1/curator/playlist-tags/:playlistId/:tagId
 * Curator removes a tag from their own playlist
 */
router.delete('/playlist-tags/:playlistId/:tagId', async (req, res) => {
  try {
    const { getDatabase } = await import('../../database/db.js');
    const db = getDatabase();
    const { playlistId, tagId } = req.params;

    // Verify playlist exists and curator owns it
    const playlist = db.prepare(`
      SELECT id, curator_id, title
      FROM playlists
      WHERE id = ?
    `).get(parseInt(playlistId));

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Ownership validation
    if (!ensureOwnResource(req, playlist.curator_id)) {
      return res.status(403).json({
        error: 'You can only remove tags from your own playlists',
        playlist_title: playlist.title
      });
    }

    // Remove tag assignment
    const result = db.prepare(`
      DELETE FROM playlist_flag_assignments
      WHERE playlist_id = ? AND flag_id = ?
    `).run(playlistId, tagId);

    if (result.changes === 0) {
      return res.status(404).json({
        error: 'Tag assignment not found',
        playlist_title: playlist.title
      });
    }

    res.json({
      success: true,
      message: `Tag removed from playlist "${playlist.title}"`
    });

  } catch (error) {
    console.error('[CURATOR_REMOVE_TAG] Error:', error);
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});
