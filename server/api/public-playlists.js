import crypto from 'crypto';
import express from 'express';
import { getQueries, getDatabase } from '../database/db.js';
import { optionalAuth } from '../middleware/auth.js';
import { canViewDemoCurator, filterDemoPlaylists, getDemoCuratorIdSet } from '../utils/demoAccountUtils.js';
import { cacheAside, feedCache, playlistCache, tracksCache } from '../utils/memoryCache.js';

const router = express.Router();

const isRemoteUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);

const normalizeImagePath = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isRemoteUrl(trimmed)) return trimmed;
  if (trimmed.startsWith('/uploads/')) return trimmed;
  const withoutLeading = trimmed.replace(/^\/+/, '');
  return `/uploads/${withoutLeading}`;
};

const buildImageVariant = (value, size = 'original') => {
  const normalized = normalizeImagePath(value);
  if (!normalized) return null;

  // Handle remote URLs by parsing and transforming the path
  if (isRemoteUrl(normalized)) {
    try {
      const url = new URL(normalized);
      const pathname = url.pathname;
      const extIndex = pathname.lastIndexOf('.');

      if (extIndex === -1) return normalized;

      const base = pathname.slice(0, extIndex).replace(/_(large|medium|small|original)$/i, '');
      const ext = pathname.slice(extIndex);

      const sizeSuffix = (!size || size === 'original') ? '' : `_${size}`;
      return `${url.origin}${base}${sizeSuffix}${ext}`;
    } catch (error) {
      console.warn('[BUILD_IMAGE_VARIANT] Failed to parse URL:', normalized, error);
      return normalized;
    }
  }

  // Handle relative paths
  const extIndex = normalized.lastIndexOf('.');
  if (extIndex === -1) return normalized;

  const base = normalized.slice(0, extIndex).replace(/_(large|medium|small|original)$/i, '');
  const ext = normalized.slice(extIndex);

  if (!size || size === 'original') return `${base}${ext}`;
  return `${base}_${size}${ext}`;
};

const getPerfectSundaysIds = () => {
  try {
    const db = getDatabase();
    const row = db
      .prepare('SELECT config_value FROM admin_system_config WHERE config_key = ?')
      .get('perfect_sundays_page');

    if (!row?.config_value) return [];

    const parsed = JSON.parse(row.config_value);
    if (!Array.isArray(parsed?.playlist_ids)) return [];

    return parsed.playlist_ids
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isFinite(id));
  } catch (error) {
    console.warn('[PUBLIC_FEED] Failed to load Perfect Sundays ids', error?.message || error);
    return [];
  }
};

const getFeedVisibilityConfig = () => {
  try {
    const db = getDatabase();
    const row = db
      .prepare('SELECT config_value FROM admin_system_config WHERE config_key = ?')
      .get('feed_visibility');

    if (!row?.config_value) return { pinned: [], hidden: [] };

    const parsed = JSON.parse(row.config_value);
    return {
      pinned: Array.isArray(parsed?.pinned) ? parsed.pinned.map(id => Number(id)).filter(Number.isFinite) : [],
      hidden: Array.isArray(parsed?.hidden) ? parsed.hidden.map(id => Number(id)).filter(Number.isFinite) : []
    };
  } catch (error) {
    console.warn('[PUBLIC_FEED] Failed to load feed visibility config', error?.message || error);
    return { pinned: [], hidden: [] };
  }
};

const appendVaryHeader = (res, value) => {
  if (!value) return;

  const additions = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (!additions.length) return;

  const existing = res.get('Vary');
  if (!existing) {
    res.set('Vary', additions.join(', '));
    return;
  }

  const current = existing.split(',').map((part) => part.trim()).filter(Boolean);
  const seen = new Set(current.map((item) => item.toLowerCase()));
  const merged = [...current];

  additions.forEach((item) => {
    const lower = item.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      merged.push(item);
    }
  });

  res.set('Vary', merged.join(', '));
};

const applyPublicCache = (res) => {
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
  appendVaryHeader(res, 'Accept, Accept-Encoding');
};

const setJsonEtag = (res, payload) => {
  try {
    const serialized = JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(serialized).digest('base64');
    res.set('ETag', `"${hash}"`);
  } catch (error) {
    console.warn('[PUBLIC_CACHE] Failed to set ETag:', error);
  }
};

const sendCachedJson = (res, payload) => {
  applyPublicCache(res);
  setJsonEtag(res, payload);
  return res.json(payload);
};

const buildExternalUrls = (playlist) => ({
  spotify: playlist?.spotify_url || null,
  tidal: playlist?.tidal_url || null,
  apple: playlist?.apple_url || null
});

const buildCustomAction = (playlist) => {
  const label = typeof playlist?.custom_action_label === 'string'
    ? playlist.custom_action_label.trim()
    : '';
  const url = typeof playlist?.custom_action_url === 'string'
    ? playlist.custom_action_url.trim()
    : '';
  const icon = typeof playlist?.custom_action_icon === 'string'
    ? playlist.custom_action_icon.trim()
    : '';
  const iconSource = typeof playlist?.custom_action_icon_source === 'string'
    ? playlist.custom_action_icon_source.trim()
    : null;

  if (!label && !url && !icon) {
    return null;
  }

  return {
    label: label || null,
    url: url || null,
    icon: icon || null,
    icon_source: iconSource || null
  };
};

const getActiveMetaPixelMap = () => {
  try {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT curator_id, pixel_id
      FROM curator_meta_accounts
      WHERE is_active = 1 AND pixel_id IS NOT NULL
    `).all();

    return new Map(rows.map((row) => [Number(row.curator_id), row.pixel_id]));
  } catch (error) {
    console.warn('[PUBLIC_FEED] Failed to load curator meta pixels', error?.message || error);
    return new Map();
  }
};

const toPublicPlaylistDetail = (playlist, trackCount = 0, flags = []) => {
  if (!playlist) return null;

  return {
    id: playlist.id,
    title: playlist.title,
    meta_pixel_id: playlist.meta_pixel_id || null,
    custom_action_label: playlist.custom_action_label || null,
    description: playlist.description || null,
    description_short: playlist.description_short || null,
    curator_name: playlist.curator_name || null,
    curator_type: playlist.curator_type || null,
    publish_date: playlist.publish_date || null,
    published_at: playlist.published_at || null,
    image_url_original: buildImageVariant(playlist.image, 'original'),
    image_url_large: buildImageVariant(playlist.image, 'large'),
    image_url_medium: buildImageVariant(playlist.image, 'medium'),
    image_url_small: buildImageVariant(playlist.image, 'small'),
    external_urls: buildExternalUrls(playlist),
    custom_action: buildCustomAction(playlist),
    tags: typeof playlist.tags === 'string' ? playlist.tags : '',
    flags: Array.isArray(flags) ? flags.map(toPublicPlaylistFlag) : [],
    track_count: Number.isFinite(trackCount) ? trackCount : 0
  };
};

const toPublicPlaylistFlag = (flag) => ({
  id: flag.id,
  text: flag.text || null,
  color: flag.color || null,
  text_color: flag.text_color || null,
  url_slug: flag.url_slug || null
});

const toPublicPlaylistSummary = (playlist, flags = []) => ({
  id: playlist.id,
  title: playlist.title,
  meta_pixel_id: playlist.meta_pixel_id || null,
  curator_name: playlist.curator_name || null,
  curator_type: playlist.curator_type || null,
  publish_date: playlist.publish_date || null,
  published_at: playlist.published_at || null,
  tags: typeof playlist.tags === 'string' ? playlist.tags : '',
  flags: Array.isArray(flags) ? flags.map(toPublicPlaylistFlag) : [],
  image: playlist.image || null, // Include raw image for fallback
  image_url_large: buildImageVariant(playlist.image, 'large'),
  image_url_medium: buildImageVariant(playlist.image, 'medium'),
  image_url_small: buildImageVariant(playlist.image, 'small')
});

const trackPlatformUrls = (track) => {
  const spotify_url = track.spotify_url || (track.spotify_id ? `https://open.spotify.com/track/${track.spotify_id}` : null);
  const tidal_url = track.tidal_url || (track.tidal_id ? `https://tidal.com/browse/track/${track.tidal_id}` : null);
  const apple_music_url = track.apple_music_url || (track.apple_id ? `https://music.apple.com/song/${track.apple_id}?mt=1&app=music` : null);
  return { spotify_url, tidal_url, apple_music_url };
};

const resolveArtworkUrl = (track) => {
  const val = track.artwork_url || track.album_artwork_url || null;
  if (!val || typeof val !== 'string') return null;
  if (isRemoteUrl(val)) return val;
  if (val.startsWith('/uploads')) return val;
  const withoutLeading = val.replace(/^\/+/, '');
  return `/uploads/${withoutLeading}`;
};

const toPublicTrack = (track) => ({
  id: track.id,
  position: typeof track.position === 'number' ? track.position : null,
  title: track.title,
  artist: track.artist,
  duration_sec: null,
  preview_url: track.preview_url || track.deezer_preview_url || null,
  artwork_url: resolveArtworkUrl(track),
  soundcloud_url: track.soundcloud_url || null,
  bandcamp_url: track.bandcamp_url || null,
  youtube_music_url: track.youtube_music_url || null,
  youtube_music_id: track.youtube_music_id || null,
  custom_sources: track.custom_sources || null,
  quote: track.quote || null,
  genre: track.genre || null,
  qobuz_url: track.qobuz_url || null,
  ...trackPlatformUrls(track)
});

// GET /api/v1/public/feed — lean playlist feed for anonymous users
router.get('/public/feed', optionalAuth, (req, res) => {
  try {
    const queries = getQueries();
    const rawLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;

    const cacheKey = `feed:${limit}`;
    const rawData = cacheAside(feedCache, cacheKey, () => {
      const playlists = queries.getLeanPublishedPlaylists.all(limit) || [];
      const metaPixelMap = getActiveMetaPixelMap();
      return playlists.map((playlist) => {
        const flags = queries.getPlaylistFlags?.all ? queries.getPlaylistFlags.all(playlist.id) : [];
        const metaPixelId = metaPixelMap.get(Number(playlist.curator_id)) || null;
        return {
          ...toPublicPlaylistSummary({ ...playlist, meta_pixel_id: metaPixelId }, flags || []),
          curator_id: playlist.curator_id
        };
      });
    }, 'feed') || [];

    const demoCuratorIds = getDemoCuratorIdSet();
    const visiblePlaylists = filterDemoPlaylists(rawData, demoCuratorIds, req.user);
    const data = visiblePlaylists.map(({ curator_id, ...playlist }) => playlist);

    // Get visibility config (pinned and hidden playlists)
    const visibilityConfig = getFeedVisibilityConfig();
    const pinnedIds = visibilityConfig.pinned;
    const hiddenIds = new Set([
      ...visibilityConfig.hidden,
      ...getPerfectSundaysIds()
    ]);

    // Filter out hidden playlists
    const visibleData = hiddenIds.size > 0
      ? data.filter((item) => !hiddenIds.has(item.id))
      : data;

    // Mark pinned playlists and sort: pinned first (in order), then chronological
    const pinnedSet = new Set(pinnedIds);
    const dataWithPinned = visibleData.map((item) => ({
      ...item,
      pinned: pinnedSet.has(item.id)
    }));

    const sortedData = dataWithPinned.sort((a, b) => {
      const aPin = pinnedIds.indexOf(a.id);
      const bPin = pinnedIds.indexOf(b.id);

      // Both pinned: sort by pin order
      if (aPin !== -1 && bPin !== -1) return aPin - bPin;
      // Only a is pinned: a comes first
      if (aPin !== -1) return -1;
      // Only b is pinned: b comes first
      if (bPin !== -1) return 1;
      // Neither pinned: keep chronological order (already sorted from DB)
      return 0;
    });

    const payload = { success: true, data: sortedData };

    const includesDemo = demoCuratorIds.size > 0
      && visiblePlaylists.some((playlist) => demoCuratorIds.has(Number(playlist.curator_id)));
    if (includesDemo) {
      res.set('Cache-Control', 'private, no-store');
      appendVaryHeader(res, 'Cookie, Authorization');
      return res.json(payload);
    }

    return sendCachedJson(res, payload);
  } catch (error) {
    console.error('[PUBLIC_FEED_GET] Error:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/v1/public/playlists/:id — sanitized published playlist
router.get('/public/playlists/:id', optionalAuth, (req, res) => {
  try {
    const queries = getQueries();
    const id = req.params.id;

    const cacheKey = `playlist:${id}`;
    const cachedResult = cacheAside(playlistCache, cacheKey, () => {
      const playlist = queries.getPlaylistById.get(id);
      if (!playlist || !playlist.published) return null;
      const tracks = queries.getTracksByPlaylistId.all(id) || [];
      const flags = queries.getPlaylistFlags?.all ? queries.getPlaylistFlags.all(id) : [];
      return {
        playlist,
        trackCount: tracks.length,
        flags: flags || [],
        curatorId: playlist.curator_id
      };
    }, 'playlist');

    if (!cachedResult) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    const curator = cachedResult.curatorId ? queries.getCuratorById.get(cachedResult.curatorId) : null;
    if (curator?.is_demo && !canViewDemoCurator(req.user, curator.id)) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    const metaPixelMap = getActiveMetaPixelMap();
    const metaPixelId = metaPixelMap.get(Number(cachedResult.curatorId)) || null;
    const payload = toPublicPlaylistDetail(
      { ...cachedResult.playlist, meta_pixel_id: metaPixelId },
      cachedResult.trackCount,
      cachedResult.flags
    );

    if (curator?.is_demo) {
      res.set('Cache-Control', 'private, no-store');
      appendVaryHeader(res, 'Cookie, Authorization');
      return res.json({ success: true, data: payload });
    }

    return sendCachedJson(res, { success: true, data: payload });
  } catch (error) {
    console.error('[PUBLIC_PLAYLIST_GET] Error:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

const handlePublicPlaylistTracks = (req, res) => {
  try {
    const queries = getQueries();
    const id = req.params.id;

    const playlist = queries.getPlaylistById.get(id);
    if (!playlist || !playlist.published) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    const curator = playlist?.curator_id ? queries.getCuratorById.get(playlist.curator_id) : null;
    if (curator?.is_demo && !canViewDemoCurator(req.user, curator.id)) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    const cacheKey = `tracks:${id}`;
    const data = cacheAside(tracksCache, cacheKey, () => {
      const tracks = queries.getTracksByPlaylistId.all(id) || [];
      return tracks
        .map(toPublicTrack)
        .sort((a, b) => (a.position || 0) - (b.position || 0));
    }, 'tracks') || [];

    if (curator?.is_demo) {
      res.set('Cache-Control', 'private, no-store');
      appendVaryHeader(res, 'Cookie, Authorization');
      return res.json({ success: true, data });
    }

    return sendCachedJson(res, { success: true, data });
  } catch (error) {
    console.error('[PUBLIC_PLAYLIST_TRACKS_GET] Error:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

// GET /api/v1/public/playlists/:id/tracks — sanitized tracks
router.get('/public/playlists/:id/tracks', optionalAuth, handlePublicPlaylistTracks);

// GET /api/v1/public/tracks/playlist/:id — alias for feed consumers
router.get('/public/tracks/playlist/:id', optionalAuth, handlePublicPlaylistTracks);

// GET /api/v1/public/landing-page-links — published landing page link cards
router.get('/public/landing-page-links', (req, res) => {
  try {
    const queries = getQueries();
    const links = queries.getPublishedLandingPageLinks.all();

    // Transform links with image variants
    const transformedLinks = links.map(link => ({
      ...link,
      image: normalizeImagePath(link.image),
      imageVariants: {
        original: buildImageVariant(link.image, 'original'),
        large: buildImageVariant(link.image, 'large'),
        medium: buildImageVariant(link.image, 'medium'),
        small: buildImageVariant(link.image, 'small')
      }
    }));

    res.json({ links: transformedLinks });
  } catch (error) {
    console.error('[PUBLIC_LANDING_PAGE_LINKS_GET] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
