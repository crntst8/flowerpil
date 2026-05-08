import express from 'express';
import { getQueries, getDatabase } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireExportEligibility } from '../services/exportEligibilityService.js';
import SpotifyService from '../services/spotifyService.js';
import tidalService from '../services/tidalService.js';
import appleMusicApiService from '../services/appleMusicApiService.js';
import ExportValidationService from '../services/ExportValidationService.js';
import { runPlaylistExport } from '../services/playlistExportRunner.js';
import { ensureExportRequest, parseAccountPreferencesField } from '../services/exportRequestService.js';
import { updateTokenHealth, calculateHealthStatus } from '../services/tokenHealthService.js';
import {
  resolveAccountContext,
  getExportToken,
  saveExportToken,
  buildTokenStatus,
  isTokenExpired
} from '../services/exportTokenStore.js';
import logger from '../utils/logger.js';
import { getRedisClient } from '../utils/redisClient.js';

const GOOGLE_OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const YOUTUBE_MUSIC_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'openid',
  'email',
  'profile'
];

const getYouTubeOAuthConfig = () => {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set');
  }

  const base = (process.env.FRONTEND_URL || 'https://flowerpil.io').replace(/\/$/, '');
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || `${base}/auth/youtube-music/callback`;

  return { clientId, clientSecret, redirectUri };
};

// Temporary in-memory store for PKCE verifiers (in production, use Redis or database)
const pkceStore = new Map();
const PKCE_TTL_MS = 10 * 60 * 1000;
const PKCE_TTL_SECONDS = Math.floor(PKCE_TTL_MS / 1000);
const PKCE_REDIS_PREFIX = 'fp:oauth:pkce';

const buildPkceRedisKey = (platform, state, suffix) => (
  `${PKCE_REDIS_PREFIX}:${platform}:${state}:${suffix}`
);

const getPkceRedisClient = () => {
  const { client, available } = getRedisClient();
  if (!client || !available) {
    return null;
  }
  return client;
};

const setPkceState = async (platform, state, codeVerifier = null) => {
  if (!state) {
    return;
  }

  const sessionKey = `${platform}_${state}`;
  pkceStore.set(`${sessionKey}_state`, state);

  if (platform === 'tidal' && codeVerifier) {
    pkceStore.set(`${sessionKey}_verifier`, codeVerifier);
    // Set expiration (clean up after 10 minutes)
    setTimeout(() => {
      pkceStore.delete(`${sessionKey}_state`);
      pkceStore.delete(`${sessionKey}_verifier`);
    }, PKCE_TTL_MS);
  }

  const redis = getPkceRedisClient();
  if (!redis) {
    return;
  }

  try {
    const multi = redis.multi();
    multi.set(buildPkceRedisKey(platform, state, 'state'), state, 'EX', PKCE_TTL_SECONDS);
    if (codeVerifier) {
      multi.set(buildPkceRedisKey(platform, state, 'verifier'), codeVerifier, 'EX', PKCE_TTL_SECONDS);
    }
    await multi.exec();
  } catch (error) {
    // Best-effort: fall back to in-memory store only.
  }
};

const getPkceState = async (platform, state) => {
  if (!state) {
    return null;
  }

  const redis = getPkceRedisClient();
  if (redis) {
    try {
      const storedState = await redis.get(buildPkceRedisKey(platform, state, 'state'));
      if (storedState !== null && storedState !== undefined) {
        return storedState;
      }
    } catch (error) {
      // Ignore and fall back to in-memory state.
    }
  }

  const sessionKey = `${platform}_${state}`;
  return pkceStore.get(`${sessionKey}_state`) || null;
};

const consumePkceVerifier = async (platform, state) => {
  if (!state) {
    return null;
  }

  const sessionKey = `${platform}_${state}`;
  let codeVerifier = null;
  const redis = getPkceRedisClient();

  if (redis) {
    try {
      const verifierKey = buildPkceRedisKey(platform, state, 'verifier');
      const stateKey = buildPkceRedisKey(platform, state, 'state');
      const luaScript = `
        local verifier = redis.call('GET', KEYS[1])
        if verifier then
          redis.call('DEL', KEYS[1])
          redis.call('DEL', KEYS[2])
        end
        return verifier
      `;
      const result = await redis.eval(luaScript, 2, verifierKey, stateKey);
      if (result) {
        codeVerifier = result;
      }
    } catch (error) {
      // Ignore and fall back to in-memory verifier.
    }
  }

  if (!codeVerifier) {
    codeVerifier = pkceStore.get(`${sessionKey}_verifier`) || null;
  }

  if (codeVerifier) {
    pkceStore.delete(`${sessionKey}_state`);
    pkceStore.delete(`${sessionKey}_verifier`);
  }

  return codeVerifier;
};

const clearPkceState = async (platform, state) => {
  if (!state) {
    return;
  }

  const sessionKey = `${platform}_${state}`;
  pkceStore.delete(`${sessionKey}_state`);
  pkceStore.delete(`${sessionKey}_verifier`);

  const redis = getPkceRedisClient();
  if (!redis) {
    return;
  }

  try {
    await redis.del(
      buildPkceRedisKey(platform, state, 'state'),
      buildPkceRedisKey(platform, state, 'verifier')
    );
  } catch (error) {
    // Best-effort cleanup only.
  }
};

const router = express.Router();
const queries = new Proxy({}, {
  get(_target, property) {
    return getQueries()[property];
  }
});
const db = getDatabase();
const exportValidationService = new ExportValidationService();
const spotifyService = new SpotifyService();

// OAuth Management Routes

/**
 * Generate OAuth URL for platform authentication
 */
router.get('/auth/:platform/url', authMiddleware, async (req, res) => {
  const { platform } = req.params;
  
  try {
    let authData;
    const state = Math.random().toString(36).substring(7);
    
    switch (platform) {
      case 'spotify':
        authData = { authUrl: spotifyService.getAuthURL(state, true) }; // includeExportScopes = true
        logger.info('EXPORT_AUTH', 'Spotify auth URL generated', {
          hasExportScopes: true,
          authUrl: authData.authUrl.substring(0, 100) + '...'
        });
        break;
      case 'tidal':
        authData = tidalService.getAuthURL(state, false); // use standard redirect URI to match dashboard config
        break;
      case 'youtube_music': {
        const { clientId, redirectUri } = getYouTubeOAuthConfig();
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: YOUTUBE_MUSIC_OAUTH_SCOPES.join(' '),
          access_type: 'offline',
          prompt: 'consent',
          include_granted_scopes: 'true',
          state
        });

        authData = { authUrl: `${GOOGLE_OAUTH_AUTHORIZE_URL}?${params.toString()}` };
        break;
      }
      default:
        return res.status(400).json({
          success: false,
          error: 'Unsupported platform. Use "spotify", "tidal", or "youtube_music".'
        });
    }
    
    // Store auth data for validation (Redis if available, with Map fallback)
    const effectiveState = authData.state || state;
    await setPkceState(platform, effectiveState, authData.codeVerifier);
    
    res.json({
      success: true,
      data: {
        authUrl: authData.authUrl,
        platform,
        state: effectiveState
      }
    });

  } catch (error) {
    logger.error('EXPORT_AUTH', `Failed to generate ${platform} auth URL`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Handle OAuth callback and store tokens
 */
router.post('/auth/:platform(spotify|tidal|youtube_music)/callback', authMiddleware, async (req, res) => {
  const { platform } = req.params;
  const { code, state } = req.body;

  if (!code) {
    return res.status(400).json({
      success: false,
      error: 'Authorization code is required'
    });
  }
  
  // Validate state parameter (basic CSRF protection)
  const sessionKey = `${platform}_${state}`;
  const storedState = await getPkceState(platform, state);
  if (state && storedState && state !== storedState) {
    return res.status(400).json({
      success: false,
      error: 'Invalid state parameter'
    });
  }
  
  try {
    let tokenData, userInfo;
    
    switch (platform) {
      case 'spotify':
        logger.info('EXPORT_AUTH', 'Spotify callback received', {
          hasCode: !!code,
          hasState: !!state,
          userId: req.user?.id,
          curatorId: req.user?.curator_id,
          accountType: req.user?.role
        });
        tokenData = await spotifyService.getAccessToken(code, true); // useExportRedirect = true
        userInfo = await spotifyService.getUserProfile(tokenData.access_token);
        logger.info('EXPORT_AUTH', 'Spotify token exchange successful', {
          hasAccessToken: !!tokenData.access_token,
          hasRefreshToken: !!tokenData.refresh_token
        });
        break;
      case 'tidal':
        // Get the stored code verifier for PKCE
        const codeVerifier = await consumePkceVerifier(platform, state);
        if (!codeVerifier) {
          logger.error('EXPORT_AUTH', 'TIDAL: Missing code verifier', {
            sessionKey
          });
          return res.status(400).json({
            success: false,
            error: 'PKCE code verifier missing. Please restart the authentication flow.'
          });
        }

        logger.info('EXPORT_AUTH', `TIDAL: Found code verifier for session key: ${sessionKey}`);

        tokenData = await tidalService.getUserAccessToken(code, codeVerifier, false); // use standard redirect URI to match dashboard config
        // Tidal doesn't have a simple user profile endpoint, store basic info
        userInfo = { id: 'tidal_user', display_name: 'Tidal User' };
        break;
      case 'youtube_music': {
        const { clientId, clientSecret, redirectUri } = getYouTubeOAuthConfig();
        const tokenParams = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        });

        const tokenResp = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: tokenParams.toString()
        });
        const tokenJson = await tokenResp.json().catch(() => ({}));

        if (!tokenResp.ok) {
          const message = tokenJson.error_description || tokenJson.error || 'YouTube Music token exchange failed';
          throw new Error(message);
        }

        const { accountType, ownerCuratorId } = resolveAccountContext(req.user);
        const existingToken = getExportToken('youtube_music', { accountType, ownerCuratorId });
        const legacyRefreshToken = (() => {
          if (!existingToken?.access_token) return null;
          const raw = String(existingToken.access_token).trim();
          if (!raw.startsWith('{')) return null;
          try {
            const parsed = JSON.parse(raw);
            return parsed?.refresh_token || null;
          } catch (_) {
            return null;
          }
        })();

        const refreshToken = tokenJson.refresh_token || existingToken?.refresh_token || legacyRefreshToken || null;

        if (!refreshToken) {
          throw new Error('YouTube Music did not return a refresh token. Revoke access in Google and reconnect.');
        }

        tokenData = {
          access_token: tokenJson.access_token,
          refresh_token: refreshToken,
          expires_in: tokenJson.expires_in || 3600,
          refresh_expires_in: null
        };

        userInfo = { id: tokenJson?.id_token ? 'google_user' : 'youtube_music_user' };
        try {
          const profileResp = await fetch(GOOGLE_USERINFO_URL, {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`
            }
          });
          if (profileResp.ok) {
            const profile = await profileResp.json().catch(() => null);
            if (profile) {
              userInfo = {
                id: profile.sub || userInfo.id,
                email: profile.email || null,
                display_name: profile.name || profile.email || null,
                picture: profile.picture || null
              };
            }
          }
        } catch (_) {
          // Best-effort only
        }
        break;
      }
      default:
        return res.status(400).json({
          success: false,
          error: 'Unsupported platform'
        });
    }
    const { accountType, ownerCuratorId, accountLabel } = resolveAccountContext(req.user);
    logger.info('EXPORT_AUTH', 'Saving token', {
      platform,
      accountType,
      ownerCuratorId,
      userId: req.user?.id
    });
    const { tokenId } = saveExportToken({
      platform,
      tokenData,
      userInfo,
      accountType,
      ownerCuratorId,
      accountLabel
    });
    logger.info('EXPORT_AUTH', 'Token saved', { tokenId, platform, accountType, ownerCuratorId });

    if (tokenId) {
      try {
        const expiresAt = tokenData.expires_in
          ? new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
          : null;
        const refreshExpiresAt = tokenData.refresh_expires_in
          ? new Date(Date.now() + (tokenData.refresh_expires_in * 1000)).toISOString()
          : null;
        const healthStatus = calculateHealthStatus(expiresAt, refreshExpiresAt);
        updateTokenHealth(tokenId, healthStatus, new Date().toISOString());
        logger.info('TOKEN_HEALTH', `${platform} token health updated`, { healthStatus });
      } catch (healthError) {
        logger.warn('TOKEN_HEALTH', `Failed to update ${platform} token health`, healthError);
      }
    }

    // Clean-up: already performed above for tidal; delete state for spotify now
    if (platform === 'spotify' || platform === 'youtube_music') {
      await clearPkceState(platform, state);
    }
    res.json({
      success: true,
      data: {
        platform,
        user: userInfo,
        connected: true
      }
    });

  } catch (error) {
    logger.error('EXPORT_AUTH', `${platform} OAuth callback failed`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Handle Apple Music OAuth callback (Music User Token)
 */
router.post('/auth/apple/callback', authMiddleware, async (req, res) => {
  const { musicUserToken, storefront } = req.body;

  if (!musicUserToken) {
    return res.status(400).json({
      success: false,
      error: 'musicUserToken is required'
    });
  }

  try {
    // Resolve storefront if not provided
    let resolvedStorefront = storefront;
    if (!resolvedStorefront) {
      try {
        resolvedStorefront = await appleMusicApiService.getUserStorefront(musicUserToken);
      } catch (storefrontError) {
        logger.warn('EXPORT_AUTH', 'Failed to resolve Apple storefront', storefrontError);
        resolvedStorefront = 'us'; // Default fallback
      }
    }

    const userInfo = { storefront: resolvedStorefront };

    // Apple Music User Tokens are long-lived (6 months) and don't have refresh tokens
    // We set expires_at to 6 months from now as per Apple's documentation
    const tokenData = {
      access_token: musicUserToken,
      refresh_token: null,
      expires_in: 15552000, // 180 days in seconds (6 months)
      refresh_expires_in: null
    };

    const { accountType, ownerCuratorId, accountLabel } = resolveAccountContext(req.user);
    const { tokenId } = saveExportToken({
      platform: 'apple',
      tokenData,
      userInfo,
      accountType,
      ownerCuratorId,
      accountLabel
    });
    if (tokenId) {
      try {
        const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();
        const healthStatus = calculateHealthStatus(expiresAt, null);
        updateTokenHealth(tokenId, healthStatus, new Date().toISOString());
        logger.info('TOKEN_HEALTH', 'Apple Music token health updated', { healthStatus });
      } catch (healthError) {
        logger.warn('TOKEN_HEALTH', 'Failed to update Apple Music token health', healthError);
      }
    }

    res.json({
      success: true,
      data: {
        platform: 'apple',
        user: userInfo,
        connected: true
      }
    });

  } catch (error) {
    logger.error('EXPORT_AUTH', 'Apple Music OAuth callback failed', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Revoke authorization for platform
 */
router.delete('/auth/:platform', authMiddleware, async (req, res) => {
  const { platform } = req.params;
  const { accountType, ownerCuratorId } = resolveAccountContext(req.user);

  try {
    let sql = `
      DELETE FROM export_oauth_tokens
      WHERE platform = ?
        AND account_type = ?
    `;
    const params = [platform, accountType];

    if (accountType === 'curator') {
      sql += ' AND owner_curator_id = ?';
      params.push(ownerCuratorId);
    } else {
      sql += ' AND owner_curator_id IS NULL';
    }

    const stmt = db.prepare(sql);
    const result = stmt.run(...params);

    res.json({
      success: true,
      data: {
        platform,
        revoked: result.changes > 0
      }
    });

  } catch (error) {
    logger.error('EXPORT_AUTH', `Failed to revoke ${platform} authorization`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/auth/status', authMiddleware, async (req, res) => {
  try {
    const viewerContext = resolveAccountContext(req.user);
    const userCuratorId = req.user?.role === 'curator' ? Number(req.user.curator_id) : null;

    const platforms = ['spotify', 'tidal', 'apple', 'youtube_music'];
    const status = {};

    for (const platform of platforms) {
      const flowerpilToken = getExportToken(platform, { accountType: 'flowerpil' });
      const curatorToken = userCuratorId
        ? getExportToken(platform, {
            accountType: 'curator',
            ownerCuratorId: userCuratorId
          })
        : null;

      const primaryToken = viewerContext.accountType === 'curator' ? curatorToken : flowerpilToken;
      const primaryStatus = buildTokenStatus(primaryToken, platform);

      status[platform] = {
        ...primaryStatus,
        contexts: {
          flowerpil: buildTokenStatus(flowerpilToken, platform),
          curator: buildTokenStatus(curatorToken, platform)
        }
      };
    }

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('EXPORT_AUTH', 'Failed to get auth status', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Export Operation Routes

/**
 * Validate playlist for export to specific platform
 */
router.get('/playlists/:id/export/validate/:platform', authMiddleware, async (req, res) => {
  const { id: playlistId, platform } = req.params;
  
  if (!['spotify', 'tidal', 'apple', 'youtube_music'].includes(platform)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid platform. Use "spotify", "tidal", "apple", or "youtube_music".'
    });
  }
  
  try {
    // Allow unpublished drafts for curators
    const allowUnpublishedDrafts = req.user?.role === 'curator';
    
    // Check if playlist exists and is eligible
    const eligibility = await exportValidationService.validatePlaylistEligibility(playlistId, {
      allowUnpublishedDrafts
    });
    if (!eligibility.eligible) {
      return res.status(400).json({
        success: false,
        error: eligibility.error,
        code: eligibility.code
      });
    }
    
    // Validate tracks for the specific platform
    const validation = await exportValidationService.validatePlaylistForExport(playlistId, platform);
    
    res.json({
      success: true,
      data: {
        ...validation,
        playlist: eligibility.playlist
      }
    });

  } catch (error) {
    logger.error('EXPORT_VALIDATION', `Export validation failed for ${platform}`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get export readiness for all platforms
 */
router.get('/playlists/:id/export/validate', authMiddleware, async (req, res) => {
  const { id: playlistId } = req.params;
  
  try {
    // Allow unpublished drafts for curators
    const allowUnpublishedDrafts = req.user?.role === 'curator';
    
    // Check if playlist exists and is eligible
    const eligibility = await exportValidationService.validatePlaylistEligibility(playlistId, {
      allowUnpublishedDrafts
    });
    if (!eligibility.eligible) {
      return res.status(400).json({
        success: false,
        error: eligibility.error,
        code: eligibility.code
      });
    }
    
    // Get readiness for all platforms
    const readiness = await exportValidationService.getExportReadiness(playlistId);
    
    res.json({
      success: true,
      data: {
        ...readiness,
        playlist: eligibility.playlist
      }
    });

  } catch (error) {
    logger.error('EXPORT_VALIDATION', 'Multi-platform export validation failed', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Execute playlist export to specific platform
 */
// Non-blocking export - queues the job and returns immediately
router.post('/playlists/:id/queue-export/:platform', authMiddleware, requireExportEligibility, async (req, res) => {
  const { id: playlistId, platform } = req.params;
  const {
    isPublic = true,
    export_request_id: exportRequestIdRaw,
    account_type: accountTypeOverride,
    owner_curator_id: ownerCuratorOverride
  } = req.body;
  const exportRequestId = exportRequestIdRaw ? Number.parseInt(exportRequestIdRaw, 10) : null;

  if (!['spotify', 'tidal', 'apple', 'youtube_music'].includes(platform)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid platform. Use "spotify", "tidal", "apple", or "youtube_music".'
    });
  }

  try {
    // Get account preference
    const accountPreference = (() => {
      const mode = typeof req.body?.mode === 'string' ? req.body.mode : undefined;
      if (accountTypeOverride) {
        const normalized = String(accountTypeOverride).toLowerCase();
        if (normalized === 'curator') {
          const ownerId = ownerCuratorOverride
            ? Number(ownerCuratorOverride)
            : req.user?.curator_id
              ? Number(req.user.curator_id)
              : null;
          return { account_type: 'curator', owner_curator_id: ownerId, mode };
        }
        if (normalized === 'flowerpil') {
          return { account_type: 'flowerpil', owner_curator_id: null, mode };
        }
      }
      if (req.user?.role === 'curator') {
        return { account_type: 'curator', owner_curator_id: req.user.curator_id || null, mode };
      }
      return { account_type: 'flowerpil', owner_curator_id: null, mode };
    })();

    const request = ensureExportRequest({
      playlistId: Number(playlistId),
      destinations: [platform],
      requestedBy: req.user?.role === 'admin' ? 'system' : 'curator',
      resetProgress: true,
      existingRequestId: exportRequestId,
      accountPreferences: { [platform]: accountPreference },
      curatorId: req.user?.curator_id || null
    });

    // Return immediately - worker will process this
    res.status(202).json({
      success: true,
      message: 'Export queued successfully',
      data: {
        request_id: request.id,
        playlist_id: Number(playlistId),
        platform,
        status: request.status,
        created_at: request.created_at
      }
    });

  } catch (error) {
    logger.error('EXPORT', `Failed to queue export for ${platform}`, error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
});

// Legacy blocking export endpoint (kept for backwards compatibility)
router.post('/playlists/:id/export/:platform', authMiddleware, requireExportEligibility, async (req, res) => {
  const { id: playlistId, platform } = req.params;
  const {
    isPublic = true,
    export_request_id: exportRequestIdRaw,
    account_type: accountTypeOverride,
    owner_curator_id: ownerCuratorOverride
  } = req.body;
  const exportRequestId = exportRequestIdRaw ? Number.parseInt(exportRequestIdRaw, 10) : null;

  if (!['spotify', 'tidal', 'apple', 'youtube_music'].includes(platform)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid platform. Use "spotify", "tidal", "apple", or "youtube_music".'
    });
  }

  try {
    const allowDraftExport = req.user?.role === 'curator';

    const accountPreference = (() => {
      const mode = typeof req.body?.mode === 'string' ? req.body.mode : undefined;
      if (accountTypeOverride) {
        const normalized = String(accountTypeOverride).toLowerCase();
        if (normalized === 'curator') {
          const ownerId = ownerCuratorOverride
            ? Number(ownerCuratorOverride)
            : req.user?.curator_id
              ? Number(req.user.curator_id)
              : null;
          return { account_type: 'curator', owner_curator_id: ownerId, mode };
        }
        if (normalized === 'flowerpil') {
          return { account_type: 'flowerpil', owner_curator_id: null, mode };
        }
      }
      return req.user?.role === 'curator'
        ? { account_type: 'curator', owner_curator_id: req.user.curator_id || null, mode }
        : { account_type: 'flowerpil', owner_curator_id: null, mode };
    })();

    const request = ensureExportRequest({
      playlistId: Number(playlistId),
      destinations: [platform],
      requestedBy: req.user?.role === 'admin' ? 'system' : 'curator',
      resetProgress: true,
      existingRequestId: exportRequestId,
      accountPreferences: { [platform]: accountPreference },
      curatorId: req.user?.curator_id || null
    });

    const { result } = await runPlaylistExport({
      playlistId,
      platform,
      isPublic,
      allowDraftExport,
      exportRequestId: request.id,
      accountPreference
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('EXPORT', `Export failed for ${platform}`, error);
    const statusCode = error.statusCode || (error.code === 'AUTH_REQUIRED' ? 401 : 500);
    const payload = {
      success: false,
      error: error.message
    };
    if (error.code) payload.code = error.code;
    if (error.authUrl) payload.authUrl = error.authUrl;
    res.status(statusCode).json(payload);
  }
});

export default router;
