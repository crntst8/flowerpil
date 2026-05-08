import express from 'express';
import { getDatabase } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';
import tidalService from '../services/tidalService.js';
import { calculateHealthStatus, updateTokenHealth, HealthStatus } from '../services/tokenHealthService.js';
import sharp from 'sharp';
import { join } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const router = express.Router();
const db = getDatabase();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper: Resolve TIDAL artwork from various attribute shapes
function buildTidalImageUrl(raw) {
  if (!raw) return null;
  if (typeof raw !== 'string') return null;
  const val = raw.trim();
  if (!val) return null;
  if (val.startsWith('http')) return val;
  if (val.includes('resources.tidal.com/images/')) return val;
  let id = val.replace(/^\/+|\/+$/g, '');
  // Convert UUID with hyphens to path by replacing '-' with '/'
  if (/^[0-9a-fA-F-]{36,}$/.test(id) && id.includes('-')) {
    id = id.replace(/-/g, '/').toUpperCase();
    return `https://resources.tidal.com/images/${id}/640x640.jpg`;
  }
  // If already path-like (contains slashes), assume it's segmented correctly
  if (id.includes('/')) {
    return `https://resources.tidal.com/images/${id.toUpperCase()}/640x640.jpg`;
  }
  // If 32+ hex chars, split into 2-char segments
  const hex = id.replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (hex.length >= 32 && /^[0-9a-f]+$/.test(hex)) {
    const segs = hex.match(/.{1,2}/g).join('/');
    return `https://resources.tidal.com/images/${segs}/640x640.jpg`;
  }
  return null;
}

function resolveTidalArtwork(attr) {
  if (!attr) return null;
  const candidates = [
    attr.imageUrl,
    attr.squareImage,
    attr.image,
    attr.cover,
    attr.coverId,
    attr.imageId,
    attr.picture,
    attr.artwork
  ];
  for (const v of candidates) {
    if (!v) continue;
    if (typeof v === 'string') {
      const url = buildTidalImageUrl(v);
      if (url) return url;
    } else if (Array.isArray(v)) {
      const first = v[0];
      if (first?.url) return first.url;
      if (typeof first === 'string') {
        const url = buildTidalImageUrl(first);
        if (url) return url;
      }
    } else if (v && typeof v === 'object') {
      if (v.url) return v.url;
      if (v.id) {
        const url = buildTidalImageUrl(v.id);
        if (url) return url;
      }
      if (v.uuid) {
        const url = buildTidalImageUrl(v.uuid);
        if (url) return url;
      }
    }
  }
  return null;
}

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const TOKEN_AUTH_ERROR_MESSAGE = 'Tidal authentication expired. Please reconnect via DSP settings.';

const TOKEN_SELECTION_ORDER = `
  ORDER BY
    CASE WHEN last_validated_at IS NULL THEN 1 ELSE 0 END,
    last_validated_at DESC,
    updated_at DESC,
    id DESC
  LIMIT 1
`;

const selectCuratorTidalTokenStmt = db.prepare(`
  SELECT * FROM export_oauth_tokens
  WHERE platform = 'tidal'
    AND account_type = 'curator'
    AND owner_curator_id = ?
    AND is_active = 1
  ${TOKEN_SELECTION_ORDER}
`);

const selectFlowerpilTidalTokenStmt = db.prepare(`
  SELECT * FROM export_oauth_tokens
  WHERE platform = 'tidal'
    AND account_type = 'flowerpil'
    AND owner_curator_id IS NULL
    AND is_active = 1
  ${TOKEN_SELECTION_ORDER}
`);

const updateTidalTokenStmt = db.prepare(`
  UPDATE export_oauth_tokens
  SET access_token = ?,
      refresh_token = ?,
      expires_at = ?,
      refresh_expires_at = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
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

const tokenNeedsRefresh = (tokenRow) => {
  if (!tokenRow?.expires_at) return false;
  const expiryMs = Date.parse(tokenRow.expires_at);
  if (!Number.isFinite(expiryMs)) return false;
  return expiryMs <= Date.now() + TOKEN_REFRESH_BUFFER_MS;
};

const touchTokenHealth = (tokenRow) => {
  const healthStatus = calculateHealthStatus(tokenRow?.expires_at, tokenRow?.refresh_expires_at);
  updateTokenHealth(tokenRow.id, healthStatus, new Date().toISOString());
  tokenRow.health_status = healthStatus;
  return tokenRow;
};

const refreshTidalToken = async (tokenRow) => {
  if (!tokenRow?.refresh_token) {
    updateTokenHealth(tokenRow.id, HealthStatus.EXPIRED, new Date().toISOString());
    throw createAuthError(TOKEN_AUTH_ERROR_MESSAGE);
  }

  try {
    console.log('[TIDAL_TOKEN] Refreshing TIDAL token', {
      tokenId: tokenRow.id,
      accountType: tokenRow.account_type,
      curatorId: tokenRow.owner_curator_id || null
    });

    const refreshed = await tidalService.refreshAccessToken(tokenRow.refresh_token);
    const now = Date.now();
    const expiresAtIso = refreshed.expires_in
      ? new Date(now + refreshed.expires_in * 1000).toISOString()
      : null;
    const refreshExpiresAtIso = refreshed.refresh_expires_in
      ? new Date(now + refreshed.refresh_expires_in * 1000).toISOString()
      : tokenRow.refresh_expires_at || null;
    const nextRefreshToken = refreshed.refresh_token || tokenRow.refresh_token;

    updateTidalTokenStmt.run(
      refreshed.access_token,
      nextRefreshToken,
      expiresAtIso,
      refreshExpiresAtIso,
      tokenRow.id
    );

    const updatedRow = {
      ...tokenRow,
      access_token: refreshed.access_token,
      refresh_token: nextRefreshToken,
      expires_at: expiresAtIso,
      refresh_expires_at: refreshExpiresAtIso
    };

    return touchTokenHealth(updatedRow);
  } catch (error) {
    console.error('[TIDAL_TOKEN] Failed to refresh token', {
      tokenId: tokenRow.id,
      message: error?.message
    });
    const isRevoked = error?.message?.includes('REFRESH_TOKEN_INVALID');
    const nextStatus = isRevoked ? HealthStatus.REVOKED : HealthStatus.EXPIRED;
    updateTokenHealth(tokenRow.id, nextStatus, new Date().toISOString());
    throw createAuthError(TOKEN_AUTH_ERROR_MESSAGE);
  }
};

const ensureTidalAccessToken = async (user) => {
  const curatorId = toNumber(user?.curator_id);
  let tokenRow;

  if (curatorId) {
    tokenRow = selectCuratorTidalTokenStmt.get(curatorId);
    if (!tokenRow) {
      throw createAuthError('Connect your TIDAL account to continue importing playlists.');
    }
  } else {
    tokenRow = selectFlowerpilTidalTokenStmt.get();
    if (!tokenRow) {
      throw createAuthError('Tidal authentication required');
    }
  }

  const status = normalizeHealthStatus(tokenRow.health_status);
  if (status === HealthStatus.REVOKED) {
    throw createAuthError('Tidal authorization revoked. Please reconnect.');
  }

  if (tokenNeedsRefresh(tokenRow) || status === HealthStatus.EXPIRED) {
    tokenRow = await refreshTidalToken(tokenRow);
  } else {
    tokenRow = touchTokenHealth(tokenRow);
  }

  return tokenRow;
};

// List user's TIDAL playlists
router.get('/playlists', authMiddleware, async (req, res) => {
  let tokenRow;
  try {
    tokenRow = await ensureTidalAccessToken(req.user);
    const token = tokenRow.access_token;

    // Resolve current user id
    const me = await tidalService.makeUserRequest(token, '/users/me', 'GET');
    const userId = me?.data?.id;
    if (!userId) {
      return res.status(500).json({ success: false, error: 'Unable to resolve TIDAL user id' });
    }
    // Use /playlists filtered by owner id per API spec (filter[r.owners.id])
    const data = await tidalService.makeUserRequest(token, '/playlists', 'GET', null, {
      'filter[r.owners.id]': userId,
      include: 'owners'
    });
    return res.json({ success: true, data });
  } catch (error) {
    if (error?.code === 'AUTH_REQUIRED') {
      return res.status(401).json({ success: false, error: error.message, code: error.code });
    }
    if (error?.status === 401 && tokenRow?.id) {
      updateTokenHealth(tokenRow.id, HealthStatus.REVOKED, new Date().toISOString());
      return res.status(401).json({ success: false, error: TOKEN_AUTH_ERROR_MESSAGE, code: 'AUTH_REQUIRED' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Import tracks from a TIDAL playlist
router.post('/import/:playlistId', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const { playlistId } = req.params;
  let tokenRow;
  try {
    tokenRow = await ensureTidalAccessToken(req.user);
    const token = tokenRow.access_token;

    console.log('[IMPORT] Starting TIDAL import', {
      playlistId,
      userId: req.user?.id,
      curatorId: req.user?.curator_id
    });

    // Fetch playlist metadata (name, description, image)
    let playlistInfo = null;
    let playlistIncluded = [];
    try {
      const plResp = await tidalService.makeUserRequest(token, `/playlists/${encodeURIComponent(playlistId)}`, 'GET', null, {
        include: 'coverArt',
        'fields[playlists]': 'name,title,description,url'
      });
      playlistInfo = plResp?.data || null;
      playlistIncluded = plResp?.included || [];
    } catch (e) {
      // continue without playlist info
    }

    // Fetch playlist items relationship (IDs of items in playlist)
    const relResp = await tidalService.makeUserRequest(
      token,
      `/playlists/${encodeURIComponent(playlistId)}/relationships/items`,
      'GET',
      null,
      { include: 'items' }
    );
    const relItems = relResp?.data || [];

    // Collect track IDs
    const trackIds = relItems.filter(r => r?.type === 'tracks').map(r => r.id);

    // Fetch track resources by id in one call
    let tracksData = { data: [] };
    if (trackIds.length > 0) {
      tracksData = await tidalService.makeUserRequest(token, '/tracks', 'GET', null, {
        'filter[id]': trackIds.join(','),
        include: 'artists,albums,coverArt',
        'fields[tracks]': 'title,duration,isrc,explicit',
        'fields[albums]': 'title,name,releaseDate',
        'fields[artworks]': 'files,mediaType'
      });
    }

    const byTypeId = new Map();
    const merged = (tracksData?.data || []).concat(tracksData?.included || []);
    merged.forEach((res) => { if (res?.type && res?.id) byTypeId.set(`${res.type}:${res.id}`, res); });

    // Gather album IDs to fetch coverArt via /albums include=coverArt (track include may not include nested album coverArt)
    const albumIds = [];
    const seenAlbum = new Set();
    (tracksData?.data || []).forEach(tr => {
      const albId = tr?.relationships?.albums?.data?.[0]?.id;
      if (albId && !seenAlbum.has(albId)) { seenAlbum.add(albId); albumIds.push(albId); }
    });

    let albumCoverArtByAlbumId = new Map();
    if (albumIds.length > 0) {
      try {
        const albumsResp = await tidalService.makeUserRequest(token, '/albums', 'GET', null, {
          'filter[id]': albumIds.join(','),
          include: 'coverArt',
          'fields[artworks]': 'files,mediaType'
        });
        const artMap = new Map((albumsResp?.included || []).filter(r => r.type === 'artworks').map(r => [r.id, r]));
        const localMap = new Map();
        (albumsResp?.data || []).forEach(alb => {
          const covId = alb?.relationships?.coverArt?.data?.[0]?.id;
          const artRes = covId ? artMap.get(covId) : null;
          const href = artRes ? (function pick(art){
            const files = art?.attributes?.files || [];
            if (!files.length) return null;
            let best = files[0];
            for (const f of files) { if ((f?.meta?.width || 0) > (best?.meta?.width || 0)) best = f; }
            return best?.href || null;
          })(artRes) : null;
          if (href) localMap.set(alb.id, href);
        });
        albumCoverArtByAlbumId = localMap;
      } catch {}
    }

    const artworkById = new Map((tracksData?.included || []).filter(r => r.type === 'artworks').map(r => [r.id, r]));

    const pickArtworkUrl = (artRes) => {
      try {
        const files = artRes?.attributes?.files || [];
        if (!files.length) return null;
        // Pick the largest width available
        let best = files[0];
        for (const f of files) {
          if ((f?.meta?.width || 0) > (best?.meta?.width || 0)) best = f;
        }
        return best?.href || null;
      } catch { return null; }
    };

    const parseIsoDurationToMmSs = (iso) => {
      if (!iso || typeof iso !== 'string') return '';
      // Handles PT#H#M#S, PT#M#S, PT#S
      const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
      if (!m) return '';
      const hours = parseInt(m[1] || '0', 10);
      const mins = parseInt(m[2] || '0', 10);
      const secs = parseInt(m[3] || '0', 10);
      const total = hours * 3600 + mins * 60 + secs;
      const mm = Math.floor(total / 60);
      const ss = String(total % 60).padStart(2, '0');
      return `${mm}:${ss}`;
    };

    const toTrack = (tid, index) => {
      const trackRes = byTypeId.get(`tracks:${tid}`);
      const attr = trackRes?.attributes || {};
      // Artist
      let artistName = '';
      try {
        const artRel = trackRes?.relationships?.artists?.data?.[0]?.id;
        if (artRel) {
          const artRes = byTypeId.get(`artists:${artRel}`);
          artistName = artRes?.attributes?.name || '';
        }
      } catch {}
      // Album
      let albumName = '';
      let albumArtwork = null;
      try {
        const albRel = trackRes?.relationships?.albums?.data?.[0]?.id;
        if (albRel) {
          const albRes = byTypeId.get(`albums:${albRel}`);
          const albAttr = albRes?.attributes || {};
          albumName = albAttr?.title || albAttr?.name || '';
          // Prefer pre-fetched album coverArt href
          albumArtwork = albumCoverArtByAlbumId.get(albRel) || null;
          if (!albumArtwork) {
            // Fallback to any directly included artwork from tracks query
            const albCoverId = albRes?.relationships?.coverArt?.data?.[0]?.id;
            if (albCoverId && artworkById.has(albCoverId)) {
              albumArtwork = pickArtworkUrl(artworkById.get(albCoverId)) || null;
            }
          }
          if (!albumArtwork) {
            // Last resort heuristic
            albumArtwork = resolveTidalArtwork(albAttr);
          }
        }
      } catch {}
      // Duration is ISO8601 string (e.g., PT3M12S)
      const duration = parseIsoDurationToMmSs(attr.duration);

      // Year and genre
      const release = (() => {
        const albRel = trackRes?.relationships?.albums?.data?.[0]?.id;
        const albRes = albRel ? byTypeId.get(`albums:${albRel}`) : null;
        return albRes?.attributes?.releaseDate || null;
      })();
      const year = release ? String(release).slice(0, 4) : null;
      const genre = Array.isArray(attr.genreTags) && attr.genreTags.length ? String(attr.genreTags[0]) : '';
      return {
        position: index + 1,
        title: attr.title || '',
        artist: artistName,
        album: albumName,
        year,
        duration,
        spotify_id: null,
        apple_id: null,
        tidal_id: trackRes?.id || null,
        label: '',
        genre,
        artwork_url: albumArtwork || resolveTidalArtwork(attr) || null,
        isrc: attr.isrc || '',
        explicit: !!attr.explicit,
        preview_url: ''
      };
    };

    const transformed = trackIds.map((tid, idx) => toTrack(tid, idx));

    // Download and cache track artwork locally for consistent UI (like Spotify)
    const processedTracks = await Promise.all(
      transformed.map(async (t) => {
        if (!t.artwork_url) return t;
        try {
          const resp = await fetch(t.artwork_url);
          if (!resp.ok) return t;
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
            const out = join(uploadsDir, `${filename.replace('.jpg', size.suffix + '.jpg')}`);
            await sharp(buffer).resize(size.width, size.height, { fit: 'cover', position: 'center' }).jpeg({ quality: 85 }).toFile(out);
          }
          return { ...t, artwork_url: `/uploads/${filename}` };
        } catch {
          return t;
        }
      })
    );

    const plAttr = playlistInfo?.attributes || {};
    // Process playlist cover via coverArt include, fallback to attributes
    const playlistArtworks = new Map(playlistIncluded.filter(r => r.type === 'artworks').map(r => [r.id, r]));
    let playlistCover = null;
    try {
      const pCoverId = playlistInfo?.relationships?.coverArt?.data?.[0]?.id;
      if (pCoverId && playlistArtworks.has(pCoverId)) {
        playlistCover = pickArtworkUrl(playlistArtworks.get(pCoverId)) || null;
      }
    } catch {}
    if (!playlistCover) {
      playlistCover = resolveTidalArtwork(plAttr) || null;
    }
    let storedCover = null;
    if (playlistCover) {
      try {
        const resp = await fetch(playlistCover);
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
            const out = join(uploadsDir, `${filename.replace('.jpg', size.suffix + '.jpg')}`);
            await sharp(buffer).resize(size.width, size.height, { fit: 'cover', position: 'center' }).jpeg({ quality: 85 }).toFile(out);
          }
          storedCover = `/uploads/${filename}`;
        }
      } catch {}
    }

    const tidalPlaylist = playlistInfo ? {
      name: plAttr.name || plAttr.title || 'TIDAL Playlist',
      description: plAttr.description || plAttr.shortDescription || '',
      image: storedCover || playlistCover,
      tidal_url: plAttr.url || `https://tidal.com/browse/playlist/${playlistInfo.id}`
    } : null;

    const duration = Date.now() - startTime;
    console.log('[IMPORT] TIDAL import completed', {
      playlistId,
      tracksCount: processedTracks?.length || 0,
      durationMs: duration,
      userId: req.user?.id
    });

    return res.json({ success: true, data: { tidalPlaylist, tracks: processedTracks } });
  } catch (error) {
    const duration = Date.now() - startTime;
    if (error?.code === 'AUTH_REQUIRED') {
      console.warn('[IMPORT] TIDAL import failed - auth required', {
        playlistId,
        durationMs: duration,
        userId: req.user?.id
      });
      return res.status(401).json({ success: false, error: error.message, code: error.code });
    }
    if (error?.status === 401 && tokenRow?.id) {
      console.warn('[IMPORT] TIDAL import failed - token expired', {
        playlistId,
        durationMs: duration,
        userId: req.user?.id
      });
      updateTokenHealth(tokenRow.id, HealthStatus.REVOKED, new Date().toISOString());
      return res.status(401).json({ success: false, error: TOKEN_AUTH_ERROR_MESSAGE, code: 'AUTH_REQUIRED' });
    }
    console.error('[IMPORT] TIDAL import failed', {
      playlistId,
      error: error.message,
      stack: error.stack,
      durationMs: duration,
      userId: req.user?.id
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
