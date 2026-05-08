import express from 'express';
import { getDatabase } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';
import appleMusicApiService from '../services/appleMusicApiService.js';
import sharp from 'sharp';
import { join } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from '../utils/logger.js';
import {
  resolveAccountContext,
  getExportToken,
  saveExportToken
} from '../services/exportTokenStore.js';
import { updateTokenHealth, calculateHealthStatus } from '../services/tokenHealthService.js';
import {
  resolveStorefront,
  resolveStorefrontWithFallbacks
} from '../utils/appleStorefront.js';

const router = express.Router();
const db = getDatabase();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APPLE_MUT_TTL_SECONDS = 60 * 60 * 24 * 180; // 6 months

// Helper: resolve Apple artwork template to a concrete URL
function resolveAppleArtworkUrl(artwork, size = 640) {
  try {
    if (!artwork || !artwork.url) return null;
    let url = String(artwork.url);
    url = url.replace('{w}', String(size)).replace('{h}', String(size));
    if (url.includes('{f}')) url = url.replace('{f}', 'jpg');
    return url;
  } catch {
    return null;
  }
}

// Helper: process and save remote image to /storage/uploads like Spotify route
async function processAndSaveImageFromUrl(imageUrl) {
  if (!imageUrl) return null;
  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) return null;
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
      const outputPath = join(uploadsDir, `${filename.replace('.jpg', size.suffix + '.jpg')}`);
      await sharp(buffer)
        .resize(size.width, size.height, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 85 })
        .toFile(outputPath);
    }
    return filename;
  } catch {
    return null;
  }
}

// GET /api/v1/apple/developer-token
router.get('/developer-token', authMiddleware, async (req, res) => {
  console.error('🍎🍎🍎 DEVELOPER TOKEN ENDPOINT HIT 🍎🍎🍎');
  try {
    console.error('🍎 Calling getDeveloperToken...');
    logger.info('APPLE_AUTH', 'Developer token requested', { userId: req.user?.id, username: req.user?.username });
    const { token, expiresAt } = appleMusicApiService.getDeveloperToken();
    console.error('🍎 Developer token generated:', token ? 'YES' : 'NO');
    logger.info('APPLE_AUTH', 'Developer token generated successfully', { expiresAt });
    res.json({ success: true, data: { token, expiresAt } });
  } catch (error) {
    console.error('🍎 ERROR in getDeveloperToken:', error.message, error.stack);
    logger.error('APPLE_AUTH', 'Developer token generation failed', error);
    console.error('APPLE DEV TOKEN ERROR:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/apple/auth/token { musicUserToken }
router.post('/auth/token', authMiddleware, async (req, res) => {
  const { musicUserToken } = req.body || {};
  if (!musicUserToken) {
    return res.status(400).json({ success: false, error: 'musicUserToken is required' });
  }

  try {
    let storefront = resolveStorefront();
    try {
      storefront = await appleMusicApiService.getUserStorefront(musicUserToken) || storefront;
    } catch (storefrontError) {
      logger.warn('APPLE_AUTH', 'Failed to resolve Apple storefront', storefrontError);
    }
    const userInfo = { storefront: resolveStorefrontWithFallbacks(storefront) };

    const tokenData = {
      access_token: musicUserToken,
      refresh_token: null,
      expires_in: APPLE_MUT_TTL_SECONDS,
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
      } catch (healthError) {
        logger.warn('TOKEN_HEALTH', 'Failed to update Apple Music token health', healthError);
      }
    }

    res.json({ success: true, data: { connected: true, user: userInfo } });
  } catch (error) {
    logger.error('APPLE_AUTH', 'Failed to save Apple Music token', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

// ===== Import endpoints (library playlists) =====

const getStorefrontFromToken = (tokenRow) => {
  if (!tokenRow?.user_info) return resolveStorefront();
  try {
    const info = JSON.parse(tokenRow.user_info);
    return resolveStorefrontWithFallbacks(info?.storefront);
  } catch {
    return resolveStorefront();
  }
};

const getAppleTokenForUser = (user) => {
  const { accountType, ownerCuratorId } = resolveAccountContext(user);
  return getExportToken('apple', {
    accountType,
    ownerCuratorId
  });
};

// List user library playlists (first page)
router.get('/import/playlists', authMiddleware, async (req, res) => {
  try {
    let tokenRow;
    try {
      tokenRow = getAppleTokenForUser(req.user);
    } catch (contextError) {
      return res.status(400).json({ success: false, error: contextError.message });
    }
    const mut = tokenRow?.access_token;
    if (!mut) {
      return res.status(401).json({ success: false, error: 'Apple authentication required', code: 'AUTH_REQUIRED' });
    }
    const data = await appleMusicApiService.apiRequest({ method: 'get', url: '/v1/me/library/playlists', musicUserToken: mut, params: { limit: 50 } });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Import tracks from a specific library playlist
router.post('/import/:playlistId', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const { playlistId } = req.params;
  try {
    let tokenRow;
    try {
      tokenRow = getAppleTokenForUser(req.user);
    } catch (contextError) {
      console.error('[IMPORT] Apple Music import failed - auth error', {
        playlistId,
        userId: req.user?.id,
        error: contextError.message
      });
      return res.status(400).json({ success: false, error: contextError.message });
    }
    const mut = tokenRow?.access_token;
    if (!mut) {
      console.warn('[IMPORT] Apple Music import failed - no token', {
        playlistId,
        userId: req.user?.id
      });
      return res.status(401).json({ success: false, error: 'Apple authentication required', code: 'AUTH_REQUIRED' });
    }
    const storefront = getStorefrontFromToken(tokenRow);

    console.log('[IMPORT] Starting Apple Music import', {
      playlistId,
      storefront,
      userId: req.user?.id,
      curatorId: req.user?.curator_id
    });

    // Fetch playlist details with track relationships to get correct ordering
    // The tracks endpoint doesn't guarantee playlist order, but relationships.tracks.data does
    let playlistInfo = null;
    let trackOrderIds = []; // Track IDs in correct playlist order
    try {
      const pl = await appleMusicApiService.apiRequest({
        method: 'get',
        url: `/v1/me/library/playlists/${encodeURIComponent(playlistId)}?include=tracks`,
        musicUserToken: mut
      });
      playlistInfo = pl?.data?.[0] || null;
      // Extract track IDs from relationships in playlist order
      const relTracks = playlistInfo?.relationships?.tracks?.data || [];
      trackOrderIds = relTracks.map(t => t.id);
    } catch (e) {
      console.warn('[IMPORT] Failed to fetch playlist with track relationships:', e.message);
    }

    // Fetch tracks with simple pagination for full metadata
    let tracks = [];
    // Include catalog mapping to aid enrichment; request sparse fields
    let next = `/v1/me/library/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100&include=catalog` +
      `&fields[library-songs]=name,artistName,albumName,durationInMillis,contentRating,playParams,relationships` +
      `&fields[songs]=isrc,genreNames,releaseDate,relationships`;
    while (next) {
      // next is relative or absolute; ensure we pass only the path
      const urlPath = next.startsWith('http') ? new URL(next).pathname + new URL(next).search : next;
      const page = await appleMusicApiService.apiRequest({ method: 'get', url: urlPath, musicUserToken: mut });
      const items = page?.data || [];
      tracks = tracks.concat(items);
      next = page?.next || null;
    }

    // Reorder tracks to match playlist order if we have the ordering info
    if (trackOrderIds.length > 0 && tracks.length > 0) {
      const trackById = new Map(tracks.map(t => [t.id, t]));
      const orderedTracks = [];
      for (const id of trackOrderIds) {
        const track = trackById.get(id);
        if (track) {
          orderedTracks.push(track);
          trackById.delete(id); // Remove to track any extras
        }
      }
      // Append any tracks that weren't in the relationship order (shouldn't happen, but safe)
      for (const track of trackById.values()) {
        orderedTracks.push(track);
      }
      tracks = orderedTracks;
    }

    // Collect catalog IDs to enrich metadata via catalog songs + albums
    const catalogIds = [];
    const seen = new Set();
    for (const item of tracks) {
      const attr = item?.attributes || {};
      const rel = item?.relationships || {};
      const viaParams = attr?.playParams?.catalogId;
      const viaRel = rel?.catalog?.data?.[0]?.id;
      const catId = viaParams || viaRel || null;
      if (catId && !seen.has(catId)) { seen.add(catId); catalogIds.push(catId); }
    }

    // Batch fetch catalog songs (with albums) to extract ISRC, year, label, genre
    const catalogSongById = new Map();
    const albumById = new Map();
    const batchSize = 100;
    for (let i = 0; i < catalogIds.length; i += batchSize) {
      const batch = catalogIds.slice(i, i + batchSize);
      try {
        const params = {
          ids: batch.join(','),
          include: 'albums',
          'fields[songs]': 'isrc,genreNames,releaseDate,relationships,artistName,albumName,artwork,previews',
          'fields[albums]': 'recordLabel,releaseDate,genreNames,name,artwork'
        };
        const resp = await appleMusicApiService.apiRequest({ method: 'get', url: `/v1/catalog/${encodeURIComponent(storefront)}/songs`, params });
        const data = resp?.data || [];
        const included = resp?.included || [];
        for (const s of data) catalogSongById.set(s.id, s);
        for (const inc of included) { if (inc.type === 'albums') albumById.set(inc.id, inc); }
      } catch (e) {
        // Continue on batch failure to avoid total failure
      }
    }

    // Transform to Flowerpil track model with enrichment where available
    const transformed = tracks.map((item, idx) => {
      const attr = item?.attributes || {};
      const rel = item?.relationships || {};
      const viaParams = attr?.playParams?.catalogId;
      const viaRel = rel?.catalog?.data?.[0]?.id;
      const catId = viaParams || viaRel || null;
      const cat = catId ? catalogSongById.get(catId) : null;
      const songAttr = cat?.attributes || {};
      const albumRelId = cat?.relationships?.albums?.data?.[0]?.id || null;
      const album = albumRelId ? albumById.get(albumRelId) : null;
      const albumAttr = album?.attributes || {};

      const millis = attr.durationInMillis || songAttr.durationInMillis || 0;
      const mins = Math.floor((millis || 0) / 1000 / 60);
      const secs = Math.floor(((millis || 0) / 1000) % 60);
      const duration = millis ? `${mins}:${String(secs).padStart(2, '0')}` : '';

      const release = songAttr.releaseDate || albumAttr.releaseDate || '';
      const year = release ? String(release).slice(0, 4) : null;
      const genres = songAttr.genreNames || albumAttr.genreNames || [];
      const genre = Array.isArray(genres) && genres.length ? genres[0] : '';

      // Prefer song artwork then album artwork
      const artworkUrl = resolveAppleArtworkUrl(songAttr.artwork) || resolveAppleArtworkUrl(albumAttr.artwork) || null;

      return {
        position: idx + 1,
        title: attr.name || attr.title || songAttr.name || '',
        artist: attr.artistName || songAttr.artistName || '',
        album: attr.albumName || songAttr.albumName || albumAttr.name || '',
        year,
        duration,
        spotify_id: null,
        apple_id: null,
        tidal_id: null,
        label: albumAttr.recordLabel || '',
        genre,
        artwork_url: artworkUrl,
        isrc: songAttr.isrc || '',
        explicit: !!(attr.contentRating || songAttr.contentRating) && String((attr.contentRating || songAttr.contentRating)).toLowerCase() === 'explicit',
        preview_url: songAttr.previews?.[0]?.url || ''
      };
    });

    // Derive playlist image from playlist artwork or first track artwork as fallback
    const playlistImageUrl = (playlistInfo && resolveAppleArtworkUrl(playlistInfo.attributes?.artwork))
      || transformed?.[0]?.artwork_url
      || null;
    let storedCover = null;
    if (playlistImageUrl) {
      const saved = await processAndSaveImageFromUrl(playlistImageUrl);
      if (saved) storedCover = `/uploads/${saved}`;
    }

    const duration = Date.now() - startTime;
    console.log('[IMPORT] Apple Music import completed', {
      playlistId,
      tracksCount: transformed?.length || 0,
      durationMs: duration,
      userId: req.user?.id
    });

    return res.json({
      success: true,
      data: {
        applePlaylist: playlistInfo ? {
          name: playlistInfo.attributes?.name || 'Apple Music Playlist',
          description: playlistInfo.attributes?.description?.standard || '',
          image: storedCover || playlistImageUrl,
          apple_url: playlistInfo.attributes?.url || null
        } : null,
        tracks: transformed
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[IMPORT] Apple Music import failed', {
      playlistId,
      error: error.message,
      stack: error.stack,
      durationMs: duration,
      userId: req.user?.id
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Catalog playlist import by playlist ID (does not require MUT)
router.get('/catalog/playlists/:playlistId', authMiddleware, async (req, res) => {
  try {
    const { playlistId } = req.params;
    // Prefer storefront from saved Apple token if present
    let storefront = req.query.storefront;
    if (!storefront) {
      try {
        const tokenRow = getAppleTokenForUser(req.user);
        storefront = getStorefrontFromToken(tokenRow);
      } catch (contextError) {
        return res.status(400).json({ success: false, error: contextError.message });
      }
    }
    if (!storefront) storefront = resolveStorefront();

    const params = {
      include: 'tracks,tracks.albums',
      'fields[songs]': 'name,artistName,albumName,genreNames,isrc,releaseDate,durationInMillis,contentRating,playParams,artwork,previews,relationships',
      'fields[albums]': 'recordLabel,releaseDate,genreNames,name,artwork',
      'fields[playlists]': 'name,description,artwork,url'
    };
    const data = await appleMusicApiService.apiRequest({ method: 'get', url: `/v1/catalog/${encodeURIComponent(storefront)}/playlists/${encodeURIComponent(playlistId)}`, params });
    const pl = data?.data?.[0];
    const relationships = pl?.relationships || {};
    const relTracks = relationships.tracks?.data || [];
    const included = data?.included || [];
    const songMap = new Map(included.filter(r => r.type === 'songs').map(r => [r.id, r]));
    const albumMap = new Map(included.filter(r => r.type === 'albums').map(r => [r.id, r]));

    // Normalize to full song resources when possible
    const trackItems = relTracks.map(it => songMap.get(it.id) || it);

    const transformed = trackItems.map((item, idx) => {
      const attr = item?.attributes || {};
      const albumRelId = item?.relationships?.albums?.data?.[0]?.id || null;
      const album = albumRelId ? albumMap.get(albumRelId) : null;
      const albumAttr = album?.attributes || {};
      const millis = attr.durationInMillis || 0;
      const mins = Math.floor((millis || 0) / 1000 / 60);
      const secs = Math.floor(((millis || 0) / 1000) % 60);
      const duration = millis ? `${mins}:${String(secs).padStart(2, '0')}` : '';
      const release = attr.releaseDate || albumAttr.releaseDate || '';
      const year = release ? String(release).slice(0, 4) : null;
      const genres = attr.genreNames || albumAttr.genreNames || [];
      const genre = Array.isArray(genres) && genres.length ? genres[0] : '';

      const artworkUrl = resolveAppleArtworkUrl(attr.artwork) || resolveAppleArtworkUrl(albumAttr.artwork) || null;

      return {
        position: idx + 1,
        title: attr.name || attr.title || '',
        artist: attr.artistName || '',
        album: attr.albumName || albumAttr.name || '',
        year,
        duration,
        spotify_id: null,
        apple_id: attr.playParams?.catalogId || item?.id || null,
        tidal_id: null,
        label: albumAttr.recordLabel || '',
        genre,
        artwork_url: artworkUrl,
        isrc: attr.isrc || '',
        explicit: !!attr.contentRating && String(attr.contentRating).toLowerCase() === 'explicit',
        preview_url: attr.previews?.[0]?.url || ''
      };
    });

    const catalogPlaylistImageUrl = (pl && resolveAppleArtworkUrl(pl.attributes?.artwork))
      || transformed?.[0]?.artwork_url
      || null;
    let storedCatalogCover = null;
    if (catalogPlaylistImageUrl) {
      const saved = await processAndSaveImageFromUrl(catalogPlaylistImageUrl);
      if (saved) storedCatalogCover = `/uploads/${saved}`;
    }

    return res.json({
      success: true,
      data: {
        applePlaylist: pl ? {
          name: pl.attributes?.name || 'Apple Music Playlist',
          description: pl.attributes?.description?.standard || '',
          image: storedCatalogCover || catalogPlaylistImageUrl,
          apple_url: pl.attributes?.url || null
        } : null,
        tracks: transformed
      }
    });
  } catch (error) {
    console.error('APPLE CATALOG IMPORT ERROR:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
