import express from 'express';
import { getQueries, getDatabase } from '../database/db.js';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';
import { deleteImageFiles, deleteMultipleImageFiles } from '../utils/fileCleanup.js';
import { queueAutoExportForPlaylist } from '../services/autoExportService.js';
import { ensureExportRequest } from '../services/exportRequestService.js';
import logger from '../utils/logger.js';
import { logPlaylistChange } from '../utils/auditLogger.js';
import { canViewDemoCurator, filterDemoPlaylists, getDemoCuratorIdSet } from '../utils/demoAccountUtils.js';
import { invalidatePlaylist } from '../utils/memoryCache.js';
import { triggerBackup } from '../services/backupService.js';
import archiver from 'archiver';
import fetch from 'node-fetch';

const router = express.Router();

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    const stringValue = String(value);
    return stringValue.trim().length ? stringValue.trim() : null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const determineIconSource = (iconPath, explicitSource) => {
  const normalizedExplicit = normalizeOptionalString(explicitSource);
  if (normalizedExplicit) return normalizedExplicit;

  const normalizedIcon = normalizeOptionalString(iconPath);
  if (!normalizedIcon) return null;

  if (normalizedIcon.startsWith('/assets/')) return 'preset';
  if (normalizedIcon.startsWith('/uploads/')) return 'upload';
  if (normalizedIcon.startsWith('http')) return 'external';
  return 'custom';
};

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
    logger.warn('PLAYLIST_API', 'Failed to load curator meta pixels', {
      error: error?.message || error
    });
    return new Map();
  }
};

const getActiveMetaPixelId = (curatorId) => {
  if (!curatorId) return null;
  try {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT pixel_id
      FROM curator_meta_accounts
      WHERE curator_id = ? AND is_active = 1 AND pixel_id IS NOT NULL
      LIMIT 1
    `).get(curatorId);
    return row?.pixel_id || null;
  } catch (error) {
    logger.warn('PLAYLIST_API', 'Failed to load curator meta pixel', {
      curatorId,
      error: error?.message || error
    });
    return null;
  }
};

const parseFlags = (flagsJson) => {
  if (!flagsJson) return [];

  try {
    const parsed = typeof flagsJson === 'string' ? JSON.parse(flagsJson) : flagsJson;
    if (!Array.isArray(parsed)) return [];

    const uniqueFlags = new Map();
    parsed.forEach((flag) => {
      if (!flag || typeof flag !== 'object' || flag.id === null || flag.id === undefined) return;
      uniqueFlags.set(flag.id, {
        id: flag.id,
        text: flag.text,
        color: flag.color,
        text_color: flag.text_color,
        url_slug: flag.url_slug
      });
    });

    return Array.from(uniqueFlags.values());
  } catch {
    return [];
  }
};

// Get all playlists
router.get('/', optionalAuth, (req, res) => {
  logger.info('API_REQUEST', 'GET /api/v1/playlists', {
    method: 'GET',
    url: req.originalUrl,
    query: req.query,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
  
  try {
    const queries = getQueries();
    const { published, curator_id } = req.query;
    
    let playlists;
    if (published === 'true') {
      playlists = queries.getPublishedPlaylists.all();
    } else {
      playlists = queries.getAllPlaylists.all();
    }
    
    // Convert SQLite integers to booleans for published field and add flags
    // Add transformed image URL fields for responsive image loading
    const metaPixelMap = getActiveMetaPixelMap();
    const processedPlaylists = playlists.map(playlist => {
      const flags = parseFlags(playlist.flags_json);
      const { flags_json, ...rest } = playlist;
      const metaPixelId = metaPixelMap.get(Number(rest.curator_id)) || null;
      return {
        ...rest,
        meta_pixel_id: metaPixelId,
        published: Boolean(rest.published),
        auto_referral_enabled: Boolean(rest.auto_referral_enabled),
        image_url_original: buildImageVariant(rest.image, 'original'),
        image_url_large: buildImageVariant(rest.image, 'large'),
        image_url_medium: buildImageVariant(rest.image, 'medium'),
        image_url_small: buildImageVariant(rest.image, 'small'),
        flags: flags || []
      };
    });
    // Optional filter by curator_id (profile-specific views)
    let filteredPlaylists = processedPlaylists;
    if (curator_id) {
      const cid = parseInt(curator_id, 10);
      if (!isNaN(cid)) {
        filteredPlaylists = processedPlaylists.filter(p => p.curator_id === cid);
      }
    }

    const demoCuratorIds = getDemoCuratorIdSet();
    filteredPlaylists = filterDemoPlaylists(filteredPlaylists, demoCuratorIds, req.user);

    logger.info('API_RESPONSE', 'GET /api/v1/playlists - 200', {
      method: 'GET',
      url: req.originalUrl,
      status: 200,
      count: filteredPlaylists.length,
      published: req.query.published,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      data: filteredPlaylists,
      count: filteredPlaylists.length
    });
  } catch (error) {
    logger.error('API_ERROR', 'GET /api/v1/playlists failed', {
      method: 'GET',
      url: req.originalUrl,
      status: 500,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch playlists'
    });
  }
});

// Get playlist by ID
router.get('/:id', optionalAuth, (req, res) => {
  try {
    logger.info('API_REQUEST', `GET /api/v1/playlists/${req.params.id}`, {
      method: 'GET',
      url: `/api/v1/playlists/${req.params.id}`,
      params: req.params,
      query: req.query,
      body: req.body
    });

    const queries = getQueries();
    const { id } = req.params;
    const { limit, offset } = req.query;

    const playlist = queries.getPlaylistById.get(id);

    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    if (playlist?.curator_id) {
      const curator = queries.getCuratorById.get(playlist.curator_id);
      if (curator?.is_demo && !canViewDemoCurator(req.user, curator.id)) {
        return res.status(404).json({
          success: false,
          error: 'Playlist not found'
        });
      }
    }

    // Get tracks with optional pagination
    let tracks;
    let pagination = null;

    if (limit !== undefined) {
      // Pagination requested
      const parsedLimit = Math.min(parseInt(limit, 10) || 100, 500); // Default 100, max 500
      const parsedOffset = parseInt(offset, 10) || 0;

      // Get paginated tracks
      tracks = queries.getTracksByPlaylistIdPaginated.all(id, parsedLimit, parsedOffset);

      // Get total count for pagination metadata
      const countResult = queries.getTrackCountByPlaylistId.get(id);
      const total = countResult?.count || 0;

      pagination = {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: (parsedOffset + parsedLimit) < total
      };
    } else {
      // No pagination - backward compatible behavior
      tracks = queries.getTracksByPlaylistId.all(id);
    }

    const flags = queries.getPlaylistFlags.all(id);

    // Convert SQLite integers to booleans for published field
    // Add transformed image URL fields for responsive image loading
    const processedPlaylist = {
      ...playlist,
      meta_pixel_id: getActiveMetaPixelId(playlist.curator_id),
      published: Boolean(playlist.published),
      auto_referral_enabled: Boolean(playlist.auto_referral_enabled),
      image_url_original: buildImageVariant(playlist.image, 'original'),
      image_url_large: buildImageVariant(playlist.image, 'large'),
      image_url_medium: buildImageVariant(playlist.image, 'medium'),
      image_url_small: buildImageVariant(playlist.image, 'small'),
      tracks,
      flags: flags || []
    };

    // Add pagination metadata if pagination was used
    if (pagination) {
      processedPlaylist.pagination = pagination;
    }

    logger.info('API_RESPONSE', `GET /api/v1/playlists/${id} - 200`, {
      method: 'GET',
      url: `/api/v1/playlists/${id}`,
      status: 200,
      published: processedPlaylist.published,
      tracksCount: tracks.length,
      paginated: !!pagination,
      total: pagination?.total
    });

    res.json({
      success: true,
      data: processedPlaylist
    });
  } catch (error) {
    logger.error('API_ERROR', 'GET /api/v1/playlists/:id failed', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch playlist'
    });
  }
});

// Create new playlist
router.post('/', authMiddleware, (req, res) => {
  try {
    const queries = getQueries();
    let {
      title,
      publish_date,
      curator_name,
      curator_type = 'artist',
      description = '',
      description_short = '',
      tags = '',
      image = '',
      published = false,
      spotify_url = '',
      apple_url = '',
      tidal_url = '',
      youtube_music_url = '',
      soundcloud_url = '',
      tracks = [],
      custom_action_label,
      custom_action_url,
      custom_action_icon,
      custom_action_icon_source,
      auto_referral_enabled
    } = req.body;
    
    // Validation
    if (!title?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }
    
    if (!curator_name?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Curator name is required'
      });
    }
    
    // For curator role, enforce ownership and override curator fields
    if (req.user && req.user.role === 'curator') {
      try {
        const curator = queries.getCuratorById.get(req.user.curator_id);
        if (curator) {
          curator_name = curator.name;
          curator_type = curator.profile_type || curator.type || curator_type;
        }
      } catch {}
    }

    const normalizedCustomActionLabel = normalizeOptionalString(custom_action_label);
    const normalizedCustomActionUrl = normalizeOptionalString(custom_action_url);
    const normalizedCustomActionIcon = normalizeOptionalString(custom_action_icon);
    const normalizedCustomActionSource = determineIconSource(
      normalizedCustomActionIcon,
      custom_action_icon_source
    );
    const normalizedAutoReferral = auto_referral_enabled ? 1 : 0;

    // Use transaction for data consistency
    const db = getDatabase();
    
    const transaction = db.transaction(() => {
      // Insert or get curator first
      let curatorId = null;
      if (curator_name?.trim()) {
        // Insert curator if it doesn't exist (using simple method for playlist creation)
        queries.insertCuratorSimple.run(curator_name.trim(), curator_type, curator_type);
        
        // Get the curator ID
        const curator = queries.getCuratorByName.get(curator_name.trim());
        curatorId = curator?.id || null;
      }

      // Insert playlist
      const result = queries.insertPlaylist.run(
        title.trim(),
        publish_date || new Date().toISOString().split('T')[0],
        curatorId,
        curator_name.trim(),
        curator_type,
        description,
        description_short,
        tags,
        image,
        published ? 1 : 0,
        spotify_url,
        apple_url,
        tidal_url,
        soundcloud_url,
        youtube_music_url,
        normalizedCustomActionLabel,
        normalizedCustomActionUrl,
        normalizedCustomActionIcon,
        normalizedCustomActionSource,
        normalizedAutoReferral
      );
      
      const playlistId = result.lastInsertRowid;

      if (published) {
        queries.markPublishedTimestamp.run(playlistId);
      }
      
      // Insert tracks if provided
      if (tracks && tracks.length > 0) {
        for (const track of tracks) {
          // Sanitize track data for SQLite
          const sanitizeForSQLite = (value) => {
            if (value === null || value === undefined) return null;
            if (typeof value === 'boolean') return value ? 1 : 0;
            if (typeof value === 'string' || typeof value === 'number') return value;
            return String(value);
          };

          // Determine linking status: skip auto-linking for non-DSP-only tracks
          const hasNoDSPIds = !track.spotify_id && !track.apple_id && !track.tidal_id;
          const hasNonDSPUrls = track.bandcamp_url; // allow SoundCloud tracks to be linked
          const linkingStatus = (hasNoDSPIds && hasNonDSPUrls) ? 'skipped' : 'pending';

          // Serialize custom_sources as JSON
          const customSourcesJson = track.custom_sources && Array.isArray(track.custom_sources)
            ? JSON.stringify(track.custom_sources)
            : null;

          queries.insertTrack.run(
            sanitizeForSQLite(playlistId),                    // playlist_id
            sanitizeForSQLite(track.position || 0),          // position
            sanitizeForSQLite(track.title || ''),            // title
            sanitizeForSQLite(track.artist || ''),           // artist
            sanitizeForSQLite(track.album || ''),            // album
            sanitizeForSQLite(track.year),                   // year
            sanitizeForSQLite(track.duration || ''),         // duration
            sanitizeForSQLite(track.spotify_id),             // spotify_id
            sanitizeForSQLite(track.apple_id),               // apple_id
            sanitizeForSQLite(track.tidal_id),               // tidal_id
            sanitizeForSQLite(track.youtube_music_id),       // youtube_music_id
            sanitizeForSQLite(track.youtube_music_url),      // youtube_music_url
            sanitizeForSQLite(track.bandcamp_url || null),   // bandcamp_url
            sanitizeForSQLite(track.soundcloud_url || null), // soundcloud_url
            sanitizeForSQLite(track.label),                  // label
            sanitizeForSQLite(track.genre),                  // genre
            sanitizeForSQLite(track.artwork_url),            // artwork_url
            sanitizeForSQLite(track.album_artwork_url),      // album_artwork_url
            sanitizeForSQLite(track.isrc),                   // isrc
            sanitizeForSQLite(track.explicit || false),      // explicit
            sanitizeForSQLite(track.popularity),             // popularity
            sanitizeForSQLite(track.preview_url),            // preview_url
            sanitizeForSQLite(linkingStatus),                // linking_status
            customSourcesJson                                 // custom_sources
          );
        }
      }
      
      return playlistId;
    });
    
    const playlistId = transaction();
    invalidatePlaylist(playlistId);
    triggerBackup();

    // Get the created playlist with tracks and flags
    const createdPlaylist = queries.getPlaylistById.get(playlistId);
    const playlistTracks = queries.getTracksByPlaylistId.all(playlistId);
    const playlistFlags = queries.getPlaylistFlags.all(playlistId);
    
    res.status(201).json({
      success: true,
      data: {
        ...createdPlaylist,
        tracks: playlistTracks,
        flags: playlistFlags || []
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'POST /api/v1/playlists failed', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create playlist'
    });
  }
});

// Update playlist
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const queries = getQueries();
    const { id } = req.params;
    // IMPORTANT: Do NOT use default values here - we need to detect which fields
    // were actually provided vs omitted. Default values like '' or false would
    // be indistinguishable from "not provided" and cause data loss on partial updates.
    let {
      title,
      publish_date,
      curator_name,
      curator_type,
      description,
      description_short,
      tags,
      image,
      published,
      spotify_url,
      apple_url,
      tidal_url,
      youtube_music_url,
      soundcloud_url,
      tracks,
      custom_action_label,
      custom_action_url,
      custom_action_icon,
      custom_action_icon_source,
      auto_referral_enabled
    } = req.body;
    
    // Check if playlist exists
    const existingPlaylist = queries.getPlaylistById.get(id);
    if (!existingPlaylist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }
    // Enforce ownership for curator role, but allow admins to modify any playlist
    // Enforce ownership for curator role, but allow admins to modify any playlist
    if (req.user && req.user.role === 'curator') {
      if (!req.user.curator_id || existingPlaylist.curator_id !== req.user.curator_id) {
        return res.status(403).json({ success: false, error: 'Forbidden: cannot modify another curator\'s playlist' });
      }
    }
    // Admins can modify any playlist (no additional checks needed)
    // Admins can modify any playlist (no additional checks needed)

    // Conflict detection - check if updated_at from client matches DB
    const warnings = [];
    if (req.body.updated_at) {
      const currentTimestamp = queries.getPlaylistUpdatedAt.get(id);
      if (currentTimestamp) {
        const clientUpdatedAt = new Date(req.body.updated_at).getTime();
        const dbUpdatedAt = new Date(currentTimestamp.updated_at).getTime();

        if (clientUpdatedAt < dbUpdatedAt) {
          // Conflict detected
          return res.status(409).json({
            conflict: true,
            message: 'Playlist was modified by another user',
            current: queries.getPlaylistById.get(id),
            attempted: req.body
          });
        }
      }
    }

    // Capture before snapshot for audit logging
    const beforeSnapshot = { ...existingPlaylist };

    // Validation - only validate if fields are being updated
    // Use existing values if not provided in request
    if (title !== undefined && !title?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }

    if (curator_name !== undefined && !curator_name?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Curator name is required'
      });
    }

    // Use existing values if not provided
    title = title !== undefined ? title : existingPlaylist.title;
    curator_name = curator_name !== undefined ? curator_name : existingPlaylist.curator_name;
    curator_type = curator_type !== undefined ? curator_type : existingPlaylist.curator_type;
    description = description !== undefined ? description : existingPlaylist.description;
    description_short = description_short !== undefined ? description_short : existingPlaylist.description_short;
    tags = tags !== undefined ? tags : existingPlaylist.tags;
    image = image !== undefined ? image : existingPlaylist.image;
    published = published !== undefined ? published : existingPlaylist.published;
    publish_date = publish_date !== undefined ? publish_date : existingPlaylist.publish_date;
    auto_referral_enabled = auto_referral_enabled !== undefined ? auto_referral_enabled : existingPlaylist.auto_referral_enabled;
    // Track if tracks were provided in the request (to decide if we should reconcile them)
    const shouldReconcileTracks = tracks !== undefined;
    tracks = tracks !== undefined ? tracks : [];

    // Check for duplicate Apple Music URL (non-blocking warning)
    if (apple_url && apple_url.trim()) {
      const duplicate = queries.checkUrlDuplicate.get(apple_url.trim(), id);
      if (duplicate) {
        warnings.push({
          type: 'duplicate_url',
          message: `Apple Music URL is also used by playlist "${duplicate.title}"`,
          data: {
            playlist_id: duplicate.id,
            playlist_title: duplicate.title
          }
        });
      }
    }
    
    // Insert or get curator first (override for curator role)
    let curatorId = existingPlaylist.curator_id;
    if (req.user && req.user.role === 'curator') {
      curatorId = req.user.curator_id;
      const curator = queries.getCuratorById.get(curatorId);
      if (curator) {
        curator_name = curator.name;
        curator_type = curator.profile_type || curator_type;
      }
    } else if (curator_name?.trim()) {
      queries.insertCuratorSimple.run(curator_name.trim(), curator_type, curator_type);
      const curator = queries.getCuratorByName.get(curator_name.trim());
      curatorId = curator?.id || curatorId;
    }
    
    // Preserve existing platform URLs unless explicitly provided in request body
    // Treat undefined or empty string as "no change" to avoid wiping imported source URLs
    const useOrPreserve = (incoming, existing) => (
      typeof incoming !== 'undefined' && String(incoming).trim() !== '' ? incoming : existing
    );
    const finalSpotifyUrl = useOrPreserve(spotify_url, existingPlaylist.spotify_url);
    const finalAppleUrl = useOrPreserve(apple_url, existingPlaylist.apple_url);
    const finalTidalUrl = useOrPreserve(tidal_url, existingPlaylist.tidal_url);
    const finalYouTubeMusicUrl = useOrPreserve(youtube_music_url, existingPlaylist.youtube_music_url);
    const finalSoundcloudUrl = useOrPreserve(soundcloud_url, existingPlaylist.soundcloud_url);

    const previousCustomActionIcon = normalizeOptionalString(existingPlaylist.custom_action_icon);

    const overrideCustomField = (incoming, existing) => {
      if (typeof incoming === 'undefined') {
        return normalizeOptionalString(existing);
      }
      return normalizeOptionalString(incoming);
    };

    const finalCustomActionLabel = overrideCustomField(custom_action_label, existingPlaylist.custom_action_label);
    const finalCustomActionUrl = overrideCustomField(custom_action_url, existingPlaylist.custom_action_url);
    const finalCustomActionIcon = overrideCustomField(custom_action_icon, existingPlaylist.custom_action_icon);

    const normalizedIconSourceIncoming = normalizeOptionalString(custom_action_icon_source);
    const iconSourceHint =
      normalizedIconSourceIncoming !== null && normalizedIconSourceIncoming !== undefined
        ? normalizedIconSourceIncoming
        : (typeof custom_action_icon !== 'undefined'
            ? undefined
            : normalizeOptionalString(existingPlaylist.custom_action_icon_source));

    const finalCustomActionSource = finalCustomActionIcon
      ? determineIconSource(finalCustomActionIcon, iconSourceHint)
      : null;
    const finalAutoReferralEnabled = auto_referral_enabled ? 1 : 0;

    // Update playlist
    queries.updatePlaylist.run(
      title.trim(),
      publish_date || existingPlaylist.publish_date,
      curatorId,
      curator_name.trim(),
      curator_type,
      description,
      description_short,
      tags,
      image,
      published ? 1 : 0,
      finalSpotifyUrl,
      finalAppleUrl,
      finalTidalUrl,
      finalSoundcloudUrl,
      finalYouTubeMusicUrl,
      finalCustomActionLabel,
      finalCustomActionUrl,
      finalCustomActionIcon,
      finalCustomActionSource,
      finalAutoReferralEnabled,
      id
    );

    const wasPublished = Boolean(existingPlaylist.published);
    const willBePublished = Boolean(published);
    if (!wasPublished && willBePublished) {
      queries.markPublishedTimestamp.run(id);
    } else if (wasPublished && !willBePublished) {
      queries.clearPublishedTimestamp.run(id);
    }

    // Reconcile tracks: update existing, insert new, delete removed (preserve linking fields)
    // Only reconcile tracks if they were provided in the request
    if (shouldReconcileTracks) {
      const db = getDatabase();
      const existing = queries.getTracksByPlaylistId.all(id);
      const existingById = new Map(existing.map(t => [String(t.id), t]));
      const seenIds = new Set();

      const sanitize = (v) => (v === undefined ? null : v);
      const coalesce = (a, b) => (a !== undefined && a !== null ? a : b);

      const tx = db.transaction((incomingTracks) => {
        for (const t of (incomingTracks || [])) {
          const numericId = t && t.id && !isNaN(parseInt(t.id, 10)) ? String(parseInt(t.id, 10)) : null;
          if (numericId && existingById.has(numericId)) {
            // Update existing track metadata + position
            const prev = existingById.get(numericId) || {};
            queries.updateTrack.run(
              (coalesce(t.title, prev.title) || '').toString().trim(),
              (coalesce(t.artist, prev.artist) || '').toString().trim(),
              sanitize(coalesce(t.album, prev.album)),
              sanitize(coalesce(t.year, prev.year)),
              sanitize(coalesce(t.duration, prev.duration)),
              sanitize(coalesce(t.spotify_id, prev.spotify_id)),
              sanitize(coalesce(t.apple_id, prev.apple_id)),
              sanitize(coalesce(t.tidal_id, prev.tidal_id)),
              sanitize(coalesce(t.bandcamp_url, prev.bandcamp_url)),
              sanitize(coalesce(t.soundcloud_url, prev.soundcloud_url)),
              sanitize(coalesce(t.label, prev.label)),
              sanitize(coalesce(t.genre, prev.genre)),
              sanitize(coalesce(t.artwork_url, prev.artwork_url)),
              sanitize(coalesce(t.album_artwork_url, prev.album_artwork_url)),
              sanitize(coalesce(t.isrc, prev.isrc)),
              coalesce(t.explicit, prev.explicit) ? 1 : 0,
              sanitize(coalesce(t.popularity, prev.popularity)),
              sanitize(coalesce(t.preview_url, prev.preview_url)),
              sanitize(coalesce(t.quote, prev.quote)),
              sanitize(coalesce(t.apple_music_url, prev.apple_music_url)),
              sanitize(coalesce(t.tidal_url, prev.tidal_url)),
              sanitize(coalesce(t.custom_sources, prev.custom_sources)),
              sanitize(coalesce(t.deezer_preview_url, prev.deezer_preview_url)),
              numericId
            );
            // Position update
            db.prepare('UPDATE tracks SET position = ? WHERE id = ? AND playlist_id = ?').run(t.position || 0, numericId, id);
            seenIds.add(numericId);
          } else {
            // Insert new track
            // Determine linking status: skip auto-linking for non-DSP-only tracks
            const hasNoDSPIds = !t.spotify_id && !t.apple_id && !t.tidal_id;
            const hasNonDSPUrls = t.bandcamp_url; // allow SoundCloud tracks to be linked
            const linkingStatus = (hasNoDSPIds && hasNonDSPUrls) ? 'skipped' : 'pending';

            // Serialize custom_sources as JSON
            const customSourcesJson = t.custom_sources && Array.isArray(t.custom_sources)
              ? JSON.stringify(t.custom_sources)
              : null;

            queries.insertTrack.run(
              id,
              t.position || 0,
              t.title || '',
              t.artist || '',
              t.album || '',
              t.year || null,
              t.duration || '',
              t.spotify_id || null,
              t.apple_id || null,
              t.tidal_id || null,
              t.youtube_music_id || null,
              t.youtube_music_url || null,
              t.bandcamp_url || null,
              t.soundcloud_url || null,
              t.label || null,
              t.genre || null,
              t.artwork_url || null,
              t.album_artwork_url || null,
              t.isrc || null,
              t.explicit ? 1 : 0,
              t.popularity || null,
              t.preview_url || null,
              linkingStatus,
              customSourcesJson
            );
          }
        }
        // Delete tracks not present anymore
        for (const prev of existing) {
          if (!seenIds.has(String(prev.id))) {
            db.prepare('DELETE FROM tracks WHERE id = ? AND playlist_id = ?').run(prev.id, id);
          }
        }
      });
      tx(tracks);
    }
    
    // Update curator
    if (curator_name?.trim()) {
      queries.insertCuratorSimple.run(curator_name.trim(), curator_type, curator_type);
    }
    
    // Get updated playlist with tracks and flags
    const updatedPlaylist = queries.getPlaylistById.get(id);
    const playlistTracks = queries.getTracksByPlaylistId.all(id);
    const playlistFlags = queries.getPlaylistFlags.all(id);

    // Audit logging - capture after snapshot and log changes
    if (req.user) {
      try {
        logPlaylistChange({
          userId: req.user.id,
          username: req.user.username,
          playlistId: parseInt(id),
          action: 'update',
          oldValues: beforeSnapshot,
          newValues: updatedPlaylist,
          req
        });
      } catch (auditError) {
        // Log error but don't block the response
        logger.warn('AUDIT_LOG', 'Failed to log playlist update', { error: auditError.message });
      }
    }

    if (
      previousCustomActionIcon &&
      previousCustomActionIcon.startsWith('/uploads') &&
      previousCustomActionIcon !== finalCustomActionIcon
    ) {
      try {
        await deleteImageFiles(previousCustomActionIcon);
      } catch (cleanupError) {
        logger.warn('FILE_CLEANUP', 'Failed to remove previous custom action icon', cleanupError);
      }
    }

    invalidatePlaylist(id);

    res.json({
      success: true,
      data: {
        ...updatedPlaylist,
        auto_referral_enabled: Boolean(updatedPlaylist.auto_referral_enabled),
        tracks: playlistTracks,
        flags: playlistFlags || []
      },
      warnings: warnings.length > 0 ? warnings : undefined
    });
  } catch (error) {
    logger.error('API_ERROR', 'PUT /api/v1/playlists/:id failed', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update playlist'
    });
  }
});

// Delete playlist
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const queries = getQueries();
    const { id } = req.params;
    
    // Check if playlist exists
    const existingPlaylist = queries.getPlaylistById.get(id);
    if (!existingPlaylist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }
    // Enforce ownership for curator role, but allow admins to delete any playlist
    if (req.user && req.user.role === 'curator') {
      if (!req.user.curator_id || existingPlaylist.curator_id !== req.user.curator_id) {
        return res.status(403).json({ success: false, error: 'Forbidden: cannot delete another curator\'s playlist' });
      }
    }
    // Admins can delete any playlist (no additional checks needed)
    
    // Delete playlist and related records manually (handle foreign key constraints)
    const db = getDatabase();
    const transaction = db.transaction(() => {
      // Get track IDs and track image URLs for this playlist before deletion
      const trackIds = db.prepare('SELECT id FROM tracks WHERE playlist_id = ?').all(id);
      const trackImages = db.prepare('SELECT artwork_url, album_artwork_url FROM tracks WHERE playlist_id = ? AND (artwork_url IS NOT NULL OR album_artwork_url IS NOT NULL)').all(id);

      // Collect track image URLs for cleanup
      const trackImageUrls = [];
      for (const track of trackImages) {
        if (track.artwork_url) trackImageUrls.push(track.artwork_url);
        if (track.album_artwork_url) trackImageUrls.push(track.album_artwork_url);
      }

      // Delete user content flags for tracks in this playlist
      try {
        for (const track of trackIds) {
          db.prepare('DELETE FROM user_content_flags WHERE track_id = ?').run(track.id);
        }
      } catch (e) {
        // Table might not exist in some environments or no flags
      }

      // Delete tracks
      db.prepare('DELETE FROM tracks WHERE playlist_id = ?').run(id);

      // Delete playlist flag assignments if they exist
      try {
        db.prepare('DELETE FROM playlist_flag_assignments WHERE playlist_id = ?').run(id);
      } catch (e) {
        // Table might not exist in some environments
      }

      // Delete playlist import schedules if they exist
      try {
        db.prepare('DELETE FROM playlist_import_schedules WHERE playlist_id = ?').run(id);
      } catch (e) {
        // Table might not exist in some environments
      }

      // Delete playlist import runs if they exist
      try {
        db.prepare('DELETE FROM playlist_import_runs WHERE playlist_id = ?').run(id);
      } catch (e) {
        // Table might not exist in some environments
      }

      // Finally delete the playlist
      queries.deletePlaylist.run(id);

      // Return collected image URLs for cleanup after transaction
      return {
        playlistImage: existingPlaylist.image,
        trackImages: trackImageUrls,
        customActionIcon: existingPlaylist.custom_action_icon
      };
    });

    const imageUrls = transaction();
    invalidatePlaylist(id);

    // Clean up uploaded files after successful database deletion
    const cleanupResults = {
      playlistImage: null,
      trackImages: null,
      customActionIcon: null
    };

    // Delete playlist image
    if (imageUrls.playlistImage) {
      cleanupResults.playlistImage = await deleteImageFiles(imageUrls.playlistImage);
    }

    // Delete track images
    if (imageUrls.trackImages.length > 0) {
      cleanupResults.trackImages = await deleteMultipleImageFiles(imageUrls.trackImages);
    }

    // Delete custom action icon (only if uploaded asset)
    if (imageUrls.customActionIcon && typeof imageUrls.customActionIcon === 'string' && imageUrls.customActionIcon.startsWith('/uploads')) {
      cleanupResults.customActionIcon = await deleteImageFiles(imageUrls.customActionIcon);
    }

    // Log cleanup results for debugging
    const totalFilesDeleted = (cleanupResults.playlistImage?.totalDeleted || 0) +
                             (cleanupResults.trackImages?.totalDeleted || 0) +
                             (cleanupResults.customActionIcon?.totalDeleted || 0);

    if (totalFilesDeleted > 0) {
      logger.info('FILE_CLEANUP', 'Playlist deletion cleanup', {
        filesDeleted: totalFilesDeleted
      });
    }

    // Log any cleanup errors (but don't fail the request)
    const allErrors = [
      ...(cleanupResults.playlistImage?.errors || []),
      ...(cleanupResults.trackImages?.errors || []),
      ...(cleanupResults.customActionIcon?.errors || [])
    ];

    if (allErrors.length > 0) {
      logger.warn('FILE_CLEANUP', 'File cleanup errors during playlist deletion', allErrors);
    }

    res.json({
      success: true,
      message: 'Playlist deleted successfully',
      ...(totalFilesDeleted > 0 && { filesDeleted: totalFilesDeleted })
    });
  } catch (error) {
    logger.error('API_ERROR', 'DELETE /api/v1/playlists/:id failed', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete playlist'
    });
  }
});

// Publish playlist
router.patch('/:id/publish', authMiddleware, (req, res) => {
  try {
    logger.info('API_REQUEST', `PATCH /api/v1/playlists/${req.params.id}/publish`, {
      method: 'PATCH',
      url: `/api/v1/playlists/${req.params.id}/publish`,
      params: req.params,
      user: req.user ? { id: req.user.id, role: req.user.role, curator_id: req.user.curator_id } : null
    });

    const queries = getQueries();
    const { id } = req.params;

    // Check if playlist exists
    const existingPlaylist = queries.getPlaylistById.get(id);
    logger.info('PLAYLIST', 'Existing playlist found', {
      id,
      published: existingPlaylist?.published,
      curator_id: existingPlaylist?.curator_id
    });

    if (!existingPlaylist) {
      logger.error('PLAYLIST', `Playlist ${id} not found`);
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }
    // Enforce ownership for curator role, but allow admins to publish any playlist
    if (req.user && req.user.role === 'curator') {
      if (!req.user.curator_id || existingPlaylist.curator_id !== req.user.curator_id) {
        logger.error('AUTH', 'Authorization failed for curator');
        return res.status(403).json({ success: false, error: 'Forbidden: cannot publish another curator\'s playlist' });
      }
    }
    // Admins can publish any playlist (no additional checks needed)

    // Publish playlist
    logger.info('PLAYLIST', `Executing publish query for playlist ${id}`);
    const result = queries.publishPlaylist.run(id);
    logger.info('PLAYLIST', 'Publish query result', {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid
    });

    // Auto-queue Flowerpil exports whenever a playlist is published
    try {
      const autoResult = queueAutoExportForPlaylist({
        playlistId: Number(id),
        trigger: 'publish',
        resetProgress: true
      });
      if (!autoResult.queued) {
        logger.info('AUTO_EXPORT', 'Publish trigger skipped', {
          playlistId: Number(id),
          reason: autoResult.reason
        });
      }
    } catch (autoErr) {
      logger.error('AUTO_EXPORT', 'Failed to queue request after publish', autoErr);
      // Publishing should still succeed even if auto-export fails
    }

    invalidatePlaylist(id);

    // Get updated playlist with flags
    const updatedPlaylist = queries.getPlaylistById.get(id);
    const playlistFlags = queries.getPlaylistFlags.all(id);

    logger.info('API_RESPONSE', `PATCH /api/v1/playlists/${id}/publish - 200`, {
      method: 'PATCH',
      url: `/api/v1/playlists/${id}/publish`,
      status: 200,
      published: updatedPlaylist.published,
      message: 'Playlist published successfully'
    });

    res.json({
      success: true,
      data: {
        ...updatedPlaylist,
        published: Boolean(updatedPlaylist.published),
        flags: playlistFlags || []
      },
      message: 'Playlist published successfully'
    });
  } catch (error) {
    logger.error('API_ERROR', 'PATCH /api/v1/playlists/:id/publish failed', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: 'Failed to publish playlist'
    });
  }
});

// Schedule a playlist for future publishing
router.patch('/:id/schedule-publish', authMiddleware, (req, res) => {
  try {
    const queries = getQueries();
    const { id } = req.params;
    const { scheduled_publish_at } = req.body;

    const existingPlaylist = queries.getPlaylistById.get(id);
    if (!existingPlaylist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }

    // Enforce ownership for curators
    if (req.user && req.user.role === 'curator') {
      if (!req.user.curator_id || existingPlaylist.curator_id !== req.user.curator_id) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
    }

    if (existingPlaylist.published) {
      return res.status(400).json({ success: false, error: 'Playlist is already published' });
    }

    // Allow null to cancel a scheduled publish
    if (scheduled_publish_at !== null) {
      const scheduledDate = new Date(scheduled_publish_at);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid date format' });
      }
      // Allow a 2-minute grace window for clock skew / UI delay
      if (scheduledDate.getTime() < Date.now() - 120000) {
        return res.status(400).json({ success: false, error: 'Scheduled date must be in the future' });
      }
    }

    queries.schedulePlaylistPublish.run(scheduled_publish_at || null, id);

    const updatedPlaylist = queries.getPlaylistById.get(id);
    logger.info('PLAYLIST', `Schedule-publish ${scheduled_publish_at ? 'set' : 'cleared'} for playlist ${id}`, {
      scheduled_publish_at: scheduled_publish_at || null
    });

    res.json({
      success: true,
      data: { ...updatedPlaylist, published: Boolean(updatedPlaylist.published) },
      message: scheduled_publish_at ? 'Publish scheduled' : 'Scheduled publish cancelled'
    });
  } catch (error) {
    logger.error('API_ERROR', 'PATCH /api/v1/playlists/:id/schedule-publish failed', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ success: false, error: 'Failed to schedule publish' });
  }
});

// Queue manual export for playlist
router.post('/:id/queue-export', authMiddleware, (req, res) => {
  try {
    const queries = getQueries();
    const { id } = req.params;
    const { destinations, trigger = 'manual', resetProgress = true, forceFlowerpil = false } = req.body;

    // Check if playlist exists
    const playlist = queries.getPlaylistById.get(id);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    // Enforce ownership for curator role, but allow admins to export any playlist
    if (req.user && req.user.role === 'curator') {
      if (!req.user.curator_id || playlist.curator_id !== req.user.curator_id) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: cannot export another curator\'s playlist'
        });
      }
    }

    // Validate playlist is published
    if (!playlist.published) {
      return res.status(400).json({
        success: false,
        error: 'Cannot export unpublished playlist'
      });
    }

    // Check track count
    const trackCount = queries.getPlaylistTrackCount.get(id);
    if (!trackCount || trackCount.count === 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot export playlist with no tracks'
      });
    }

    // Queue the export
    try {
      let result;

      // If admin force-flowerpil mode with explicit destinations
      if (forceFlowerpil && destinations && Array.isArray(destinations) && destinations.length > 0) {
        // Force all destinations to use Flowerpil account
        const accountPreferences = {};
        destinations.forEach(dest => {
          accountPreferences[dest] = {
            account_type: 'flowerpil',
            owner_curator_id: null
          };
        });

        const exportRequest = ensureExportRequest({
          playlistId: Number(id),
          destinations,
          requestedBy: 'system',
          resetProgress: Boolean(resetProgress),
          accountPreferences
        });

        logger.info('EXPORT_QUEUE', `Admin force-flowerpil export queued for playlist ${id}`, {
          playlist_id: id,
          trigger,
          destinations,
          user_id: req.user?.id,
          force_flowerpil: true
        });

        return res.json({
          success: true,
          message: 'Export queued successfully (Flowerpil accounts only)',
          data: {
            playlist_id: Number(id),
            destinations,
            request_id: exportRequest.id
          }
        });
      }

      // Default behavior - use auto-export service
      result = queueAutoExportForPlaylist({
        playlistId: Number(id),
        trigger: trigger || 'manual',
        resetProgress: Boolean(resetProgress),
        exclude: []
      });

      if (!result.queued) {
        return res.status(400).json({
          success: false,
          error: result.reason || 'Failed to queue export',
          reason: result.reason
        });
      }

      logger.info('EXPORT_QUEUE', `Export queued for playlist ${id}`, {
        playlist_id: id,
        trigger,
        destinations: result.destinations,
        user_id: req.user?.id
      });

      res.json({
        success: true,
        message: 'Export queued successfully',
        data: {
          playlist_id: Number(id),
          destinations: result.destinations,
          request_id: result.request?.id
        }
      });

    } catch (exportError) {
      logger.error('EXPORT_QUEUE', 'Failed to queue export', exportError, {
        playlist_id: id,
        user_id: req.user?.id
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to queue export: ' + exportError.message
      });
    }

  } catch (error) {
    logger.error('API_ERROR', 'POST /api/v1/playlists/:id/queue-export failed', error);
    res.status(500).json({
      success: false,
      error: 'Failed to queue export'
    });
  }
});

// Reorder only: update track positions without altering metadata
router.patch('/:id/tracks/order', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { order } = req.body || {};
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ success: false, error: 'Order array required' });
    }
    const queries = getQueries();
    const db = getDatabase();
    const existingPlaylist = queries.getPlaylistById.get(id);
    if (!existingPlaylist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }
    // Enforce ownership for curator role, but allow admins to modify any playlist
    if (req.user && req.user.role === 'curator') {
      if (!req.user.curator_id || existingPlaylist.curator_id !== req.user.curator_id) {
        return res.status(403).json({ success: false, error: 'Forbidden: cannot modify another curator\'s playlist' });
      }
    }
    // Admins can modify any playlist (no additional checks needed)
    const tx = db.transaction((rows) => {
      const stmt = db.prepare('UPDATE tracks SET position = ? WHERE id = ? AND playlist_id = ?');
      for (const r of rows) {
        const tid = parseInt(r.id, 10);
        const pos = parseInt(r.position, 10) || 0;
        if (!isNaN(tid)) stmt.run(pos, tid, id);
      }
    });
    tx(order);
    const tracks = queries.getTracksByPlaylistId.all(id);
    invalidatePlaylist(id);
    res.json({ success: true, data: tracks });
  } catch (error) {
    logger.error('API_ERROR', 'PATCH /api/v1/playlists/:id/tracks/order failed', error);
    res.status(500).json({ success: false, error: 'Failed to update track order' });
  }
});

// Batch track update: update multiple tracks' metadata and positions efficiently
router.patch('/:id/tracks/batch', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { tracks } = req.body || {};

    // Validation
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Tracks array required'
      });
    }

    const queries = getQueries();
    const db = getDatabase();

    // Check if playlist exists
    const existingPlaylist = queries.getPlaylistById.get(id);
    if (!existingPlaylist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    // Enforce ownership for curator role, but allow admins to modify any playlist
    if (req.user && req.user.role === 'curator') {
      if (!req.user.curator_id || existingPlaylist.curator_id !== req.user.curator_id) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: cannot modify another curator\'s playlist'
        });
      }
    }

    // Get existing tracks to validate track IDs belong to this playlist
    const existingTracks = queries.getTracksByPlaylistId.all(id);
    const existingTrackIds = new Set(existingTracks.map(t => String(t.id)));

    // Validate all track IDs belong to this playlist
    for (const track of tracks) {
      if (!track.id || !existingTrackIds.has(String(track.id))) {
        return res.status(400).json({
          success: false,
          error: `Track ID ${track.id} does not belong to this playlist`
        });
      }
    }

    // Perform batch update in a transaction
    const transaction = db.transaction((tracksToUpdate, playlistId) => {
      const stmt = db.prepare(`
        UPDATE tracks
        SET title = ?,
            artist = ?,
            album = ?,
            position = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND playlist_id = ?
      `);

      let updated = 0;
      for (const track of tracksToUpdate) {
        const result = stmt.run(
          track.title || '',
          track.artist || '',
          track.album || null,
          track.position !== undefined ? track.position : 0,
          track.id,
          playlistId
        );
        updated += result.changes;
      }

      return updated;
    });

    const updatedCount = transaction(tracks, id);

    logger.info('BATCH_UPDATE', `Batch updated ${updatedCount} tracks for playlist ${id}`, {
      playlist_id: id,
      track_count: tracks.length,
      updated_count: updatedCount,
      user_id: req.user?.id
    });

    invalidatePlaylist(id);

    res.json({
      success: true,
      updated: updatedCount
    });

  } catch (error) {
    logger.error('API_ERROR', 'PATCH /api/v1/playlists/:id/tracks/batch failed', error);
    res.status(500).json({
      success: false,
      error: 'Failed to batch update tracks'
    });
  }
});

// Download playlist artwork as ZIP
router.post('/artwork/download', authMiddleware, async (req, res) => {
  try {
    const { playlistId } = req.body;

    if (!playlistId) {
      return res.status(400).json({
        success: false,
        error: 'playlistId is required'
      });
    }

    const queries = getQueries();

    // Verify playlist exists
    const playlist = queries.getPlaylistById.get(playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    // Enforce ownership for curator role
    if (req.user && req.user.role === 'curator') {
      if (!req.user.curator_id || playlist.curator_id !== req.user.curator_id) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: cannot download artwork from another curator\'s playlist'
        });
      }
    }

    // Get tracks
    const tracks = queries.getTracksByPlaylistId.all(playlistId);

    if (tracks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Playlist has no tracks'
      });
    }

    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Set response headers
    const safeFilename = playlist.title
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename}_artwork.zip"`
    );

    // Handle archive errors
    archive.on('error', (err) => {
      logger.error('ARCHIVE_ERROR', 'Error creating ZIP archive', err);
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
        // Get artwork URL (prefer track-specific, fallback to album)
        let artworkUrl = track.image || track.album_artwork_url || track.artwork_url;

        if (!artworkUrl) {
          errors.push(`No artwork: ${track.artist} - ${track.title}`);
          continue;
        }

        // Convert relative to absolute
        if (artworkUrl.startsWith('/uploads/')) {
          const cdnDomain = process.env.R2_PUBLIC_URL || 'https://images.flowerpil.io';
          artworkUrl = `${cdnDomain}${artworkUrl}`;
        }

        // Prefer large variant for better quality
        artworkUrl = artworkUrl.replace(/_small|_medium/, '_large');

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
        logger.error('ARTWORK_DOWNLOAD', 'Error processing track artwork', {
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

    // Add errors log if any issues occurred
    if (errors.length > 0) {
      const errorText = `Artwork Download Report\n\n` +
        `Successfully downloaded: ${filesAdded} of ${tracks.length} tracks\n\n` +
        `Issues:\n${errors.join('\n')}`;
      archive.append(errorText, { name: '_download_report.txt' });
    }

    // Finalize and send ZIP
    await archive.finalize();

    logger.info('ARTWORK_DOWNLOAD', 'Artwork download completed', {
      playlistId,
      totalTracks: tracks.length,
      filesAdded,
      errors: errors.length
    });

  } catch (error) {
    logger.error('API_ERROR', 'POST /api/v1/playlists/artwork/download failed', error);

    if (res.headersSent) {
      return res.end();
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create artwork archive',
      details: error.message
    });
  }
});

export default router;
