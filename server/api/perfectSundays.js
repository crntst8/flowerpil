import express from 'express';
import { getDatabase } from '../database/db.js';

const router = express.Router();

const DEFAULT_CONFIG = {
  title: 'Perfect Sundays',
  description: '',
  playlist_ids: [],
  mega_playlist_links: {
    spotify: '',
    apple: '',
    tidal: ''
  },
  megaplaylist_title: 'megaplaylist',
  megaplaylist_image: '',
  default_curator_name: 'Perfect Sundays'
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
      console.warn('[PERFECT_SUNDAYS] Failed to parse image URL:', normalized, error);
      return normalized;
    }
  }

  const extIndex = normalized.lastIndexOf('.');
  if (extIndex === -1) return normalized;

  const base = normalized.slice(0, extIndex).replace(/_(large|medium|small|original)$/i, '');
  const ext = normalized.slice(extIndex);

  if (!size || size === 'original') return `${base}${ext}`;
  return `${base}_${size}${ext}`;
};

const parseConfig = (row) => {
  if (!row?.config_value) return { ...DEFAULT_CONFIG };

  try {
    const parsed = JSON.parse(row.config_value);
    const playlistIds = Array.isArray(parsed.playlist_ids)
      ? parsed.playlist_ids
          .map((id) => Number.parseInt(id, 10))
          .filter((id) => Number.isFinite(id))
      : [];

    const megaplaylistTitle = typeof parsed?.megaplaylist_title === 'string'
      ? parsed.megaplaylist_title.trim() || DEFAULT_CONFIG.megaplaylist_title
      : DEFAULT_CONFIG.megaplaylist_title;
    const megaplaylistImage = typeof parsed?.megaplaylist_image === 'string'
      ? parsed.megaplaylist_image.trim()
      : DEFAULT_CONFIG.megaplaylist_image;

    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      megaplaylist_title: megaplaylistTitle,
      megaplaylist_image: megaplaylistImage,
      playlist_ids: playlistIds,
      mega_playlist_links: {
        ...DEFAULT_CONFIG.mega_playlist_links,
        ...(parsed?.mega_playlist_links || {})
      }
    };
  } catch (error) {
    console.warn('[PERFECT_SUNDAYS] Failed to parse config, using defaults', error);
    return { ...DEFAULT_CONFIG };
  }
};

const mapPlaylist = (playlist) => {
  if (!playlist) return null;

  return {
    id: playlist.id,
    title: playlist.title,
    display_title: playlist.custom_action_label || playlist.title,
    curator_name: playlist.curator_name,
    publish_date: playlist.publish_date,
    published_at: playlist.published_at,
    image: playlist.image || null,
    image_url_large: buildImageVariant(playlist.image, 'large'),
    image_url_medium: buildImageVariant(playlist.image, 'medium'),
    image_url_small: buildImageVariant(playlist.image, 'small'),
    spotify_url: playlist.spotify_url,
    apple_url: playlist.apple_url,
    tidal_url: playlist.tidal_url,
    description_short: playlist.description_short || ''
  };
};

router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const configRow = db
      .prepare('SELECT config_value FROM admin_system_config WHERE config_key = ?')
      .get('perfect_sundays_page');

    const config = parseConfig(configRow);

    let playlists = [];
    if (config.playlist_ids.length > 0) {
      const placeholders = config.playlist_ids.map(() => '?').join(',');
      const rows = db
        .prepare(`SELECT * FROM playlists WHERE id IN (${placeholders})`)
        .all(...config.playlist_ids);
      const byId = new Map(rows.map((row) => [row.id, row]));
      playlists = config.playlist_ids
        .map((id) => mapPlaylist(byId.get(id)))
        .filter(Boolean);
    }

    res.json({
      success: true,
      data: {
        config,
        playlists
      }
    });
  } catch (error) {
    console.error('[PERFECT_SUNDAYS] Failed to fetch page data', error);
    res.status(500).json({ success: false, error: 'Failed to load Perfect Sundays' });
  }
});

export default router;
