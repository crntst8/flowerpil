import express from 'express';
import { getDatabase } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';
import youtubeMusicService from '../services/youtubeMusicService.js';
import { HealthStatus } from '../services/tokenHealthService.js';
import sharp from 'sharp';
import { join } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const router = express.Router();
const db = getDatabase();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TOKEN_SELECTION_ORDER = `
  ORDER BY
    CASE WHEN last_validated_at IS NULL THEN 1 ELSE 0 END,
    last_validated_at DESC,
    updated_at DESC,
    id DESC
  LIMIT 1
`;

const selectCuratorTokenStmt = db.prepare(`
  SELECT * FROM export_oauth_tokens
  WHERE platform = 'youtube_music'
    AND account_type = 'curator'
    AND owner_curator_id = ?
    AND is_active = 1
  ${TOKEN_SELECTION_ORDER}
`);

const selectFlowerpilTokenStmt = db.prepare(`
  SELECT * FROM export_oauth_tokens
  WHERE platform = 'youtube_music'
    AND account_type = 'flowerpil'
    AND owner_curator_id IS NULL
    AND is_active = 1
  ${TOKEN_SELECTION_ORDER}
`);

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const createAuthError = (message, code = 'AUTH_REQUIRED') => {
  const err = new Error(message);
  err.code = code;
  err.status = 401;
  return err;
};

const normalizeHealthStatus = (status) => (status || '').toLowerCase();

const buildYouTubeMusicOAuthJson = (tokenRow) => {
  const defaultScope = 'https://www.googleapis.com/auth/youtube';
  const nowSeconds = Math.floor(Date.now() / 1000);

  const expiresAtEpoch = tokenRow?.expires_at
    ? Math.floor(new Date(tokenRow.expires_at).getTime() / 1000)
    : null;
  const expiresIn = expiresAtEpoch ? Math.max(0, expiresAtEpoch - nowSeconds) : 3600;

  const rawAccess = tokenRow?.access_token ? String(tokenRow.access_token) : '';
  const rawRefresh = tokenRow?.refresh_token ? String(tokenRow.refresh_token) : '';

  // Legacy support: previously stored full oauth_data JSON blob in access_token
  if (rawAccess.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawAccess);
      return {
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token || rawRefresh || null,
        token_type: parsed.token_type || 'Bearer',
        expires_in: parsed.expires_in || expiresIn,
        expires_at: parsed.expires_at || expiresAtEpoch,
        scope: parsed.scope || defaultScope
      };
    } catch (_) {
      // Fall through to standard token fields
    }
  }

  return {
    access_token: rawAccess || null,
    refresh_token: rawRefresh || null,
    token_type: 'Bearer',
    expires_in: expiresIn,
    expires_at: expiresAtEpoch,
    scope: defaultScope
  };
};

/**
 * Get OAuth token for the current user
 */
const ensureYouTubeMusicAccessToken = async (user) => {
  const curatorId = toNumber(user?.curator_id);
  let tokenRow;

  if (curatorId) {
    tokenRow = selectCuratorTokenStmt.get(curatorId);
    if (!tokenRow) {
      throw createAuthError('Connect your YouTube Music account to continue importing playlists.');
    }
  } else {
    tokenRow = selectFlowerpilTokenStmt.get();
    if (!tokenRow) {
      throw createAuthError('YouTube Music authentication required');
    }
  }

  const status = normalizeHealthStatus(tokenRow.health_status);
  if (status === HealthStatus.REVOKED) {
    throw createAuthError('YouTube Music authorization revoked. Please reconnect.');
  }

  const oauthJson = buildYouTubeMusicOAuthJson(tokenRow);
  if (!oauthJson.access_token || !oauthJson.refresh_token) {
    throw createAuthError('YouTube Music authentication required');
  }

  return { tokenRow, oauthJson };
};

// ============================================
// PLAYLIST ROUTES
// ============================================

/**
 * List user's playlists
 * GET /api/v1/youtube-music/playlists
 */
router.get('/playlists', authMiddleware, async (req, res) => {
  try {
    const { oauthJson } = await ensureYouTubeMusicAccessToken(req.user);
    const playlists = await youtubeMusicService.getUserPlaylists(oauthJson);

    res.json({ success: true, data: { playlists } });
  } catch (error) {
    if (error?.code === 'AUTH_REQUIRED') {
      return res.status(401).json({ success: false, error: error.message, code: error.code });
    }
    console.error('[YOUTUBE_MUSIC] Get playlists failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Import playlist from URL (no auth required for public playlists)
 * POST /api/v1/youtube-music/import-url
 */
router.post('/import-url', authMiddleware, async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'URL required' });
  }

  if (!youtubeMusicService.isPlaylistUrl(url)) {
    return res.status(400).json({ success: false, error: 'Invalid YouTube Music playlist URL' });
  }

  const startTime = Date.now();

  try {
    console.log('[YOUTUBE_MUSIC] Starting URL import:', url);

    const result = await youtubeMusicService.importPlaylistByUrl(url);

    // Process and store artwork locally
    const processedTracks = await Promise.all(
      (result.tracks || []).map(async (track, index) => {
        let artworkUrl = track.artwork_url || track.thumbnail;

        if (artworkUrl) {
          try {
            const resp = await fetch(artworkUrl);
            if (resp.ok) {
              const buffer = Buffer.from(await resp.arrayBuffer());
              const uploadsDir = join(__dirname, '../../storage/uploads');
              if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

              const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
              const sizes = [
                { suffix: '', width: 800, height: 800 },
                { suffix: '_md', width: 400, height: 400 },
                { suffix: '_sm', width: 200, height: 200 }
              ];

              for (const size of sizes) {
                const out = join(uploadsDir, filename.replace('.jpg', size.suffix + '.jpg'));
                await sharp(buffer)
                  .resize(size.width, size.height, { fit: 'cover', position: 'center' })
                  .jpeg({ quality: 85 })
                  .toFile(out);
              }
              artworkUrl = `/uploads/${filename}`;
            }
          } catch {
            // Keep original URL on failure
          }
        }

        return {
          position: index + 1,
          title: track.title || '',
          artist: track.artist || '',
          album: track.album || '',
          duration: track.duration || '',
          artwork_url: artworkUrl,
          youtube_music_id: track.youtube_music_id || track.videoId || track.video_id || null,
          isrc: track.isrc || '',
          explicit: track.explicit || false,
          spotify_id: null,
          apple_id: null,
          tidal_id: null
        };
      })
    );

    const duration = Date.now() - startTime;
    console.log('[YOUTUBE_MUSIC] URL import completed', {
      url,
      tracksCount: processedTracks.length,
      durationMs: duration
    });

    res.json({
      success: true,
      data: {
        playlist: {
          name: result.title || 'YouTube Music Playlist',
          description: result.description || '',
          youtube_music_url: url
        },
        tracks: processedTracks
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[YOUTUBE_MUSIC] URL import failed', {
      url,
      error: error.message,
      durationMs: duration
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Import playlist from user's library
 * POST /api/v1/youtube-music/import/:playlistId
 */
router.post('/import/:playlistId', authMiddleware, async (req, res) => {
  const { playlistId } = req.params;
  const startTime = Date.now();

  try {
    const { oauthJson, tokenRow } = await ensureYouTubeMusicAccessToken(req.user);

    console.log('[YOUTUBE_MUSIC] Starting library import:', playlistId);

    const result = await youtubeMusicService.getPlaylistTracks(playlistId, oauthJson);

    // Process tracks with artwork
    const processedTracks = await Promise.all(
      (result.tracks || []).map(async (track, index) => {
        let artworkUrl = track.artwork_url || track.thumbnail;

        if (artworkUrl) {
          try {
            const resp = await fetch(artworkUrl);
            if (resp.ok) {
              const buffer = Buffer.from(await resp.arrayBuffer());
              const uploadsDir = join(__dirname, '../../storage/uploads');
              if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

              const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
              const sizes = [
                { suffix: '', width: 800, height: 800 },
                { suffix: '_md', width: 400, height: 400 },
                { suffix: '_sm', width: 200, height: 200 }
              ];

              for (const size of sizes) {
                const out = join(uploadsDir, filename.replace('.jpg', size.suffix + '.jpg'));
                await sharp(buffer)
                  .resize(size.width, size.height, { fit: 'cover', position: 'center' })
                  .jpeg({ quality: 85 })
                  .toFile(out);
              }
              artworkUrl = `/uploads/${filename}`;
            }
          } catch {
            // Keep original URL on failure
          }
        }

        return {
          position: index + 1,
          title: track.title || '',
          artist: track.artist || '',
          album: track.album || '',
          duration: track.duration || '',
          artwork_url: artworkUrl,
          youtube_music_id: track.youtube_music_id || track.videoId || track.video_id || null,
          isrc: track.isrc || '',
          explicit: track.explicit || false,
          spotify_id: null,
          apple_id: null,
          tidal_id: null
        };
      })
    );

    const duration = Date.now() - startTime;
    console.log('[YOUTUBE_MUSIC] Library import completed', {
      playlistId,
      tracksCount: processedTracks.length,
      durationMs: duration
    });

    res.json({
      success: true,
      data: {
        playlist: {
          name: result.title || 'YouTube Music Playlist',
          description: result.description || '',
          youtube_music_url: `https://music.youtube.com/playlist?list=${playlistId}`
        },
        tracks: processedTracks
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error?.code === 'AUTH_REQUIRED') {
      console.warn('[YOUTUBE_MUSIC] Library import failed - auth required', {
        playlistId,
        durationMs: duration
      });
      return res.status(401).json({ success: false, error: error.message, code: error.code });
    }

    console.error('[YOUTUBE_MUSIC] Library import failed', {
      playlistId,
      error: error.message,
      durationMs: duration
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Health check for the YouTube Music service
 * GET /api/v1/youtube-music/health
 */
router.get('/health', async (req, res) => {
  try {
    const healthy = await youtubeMusicService.healthCheck();
    res.json({
      success: true,
      healthy,
      service: 'youtube-music-python',
      baseUrl: process.env.YTMUSIC_API_BASE || 'http://127.0.0.1:3001'
    });
  } catch (error) {
    res.json({
      success: false,
      healthy: false,
      error: error.message
    });
  }
});

export default router;
