import express from 'express';
import { getQueries } from '../database/db.js';
import { optionalAuth } from '../middleware/auth.js';
import { filterDemoPlaylists, getDemoCuratorIdSet } from '../utils/demoAccountUtils.js';

const router = express.Router();

/**
 * GET /s/:slug - Public song page
 * Returns track data and DSP links for a shared song
 */
router.get('/s/:slug', (req, res) => {
  const { slug } = req.params;
  const queries = getQueries();

  try {
    // Get share page record
    const sharePage = queries.getSharePageBySlug.get(slug);

    if (!sharePage || sharePage.entity_type !== 'song' || sharePage.is_active !== 1) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Get track data
    const track = queries.getTrackById.get(sharePage.entity_id);
    if (!track) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Get DSP links for this track
    const trackLinks = queries.getLinksForTrack.all(track.id);

    res.json({
      track,
      links: trackLinks,
    });
  } catch (error) {
    console.error('Error fetching public song:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /track/:trackId - Public static track payload
 * Returns single track metadata with playlist attribution and streaming links
 */
router.get('/api/public/tracks/:trackId', (req, res) => {
  const { trackId } = req.params;
  const queries = getQueries();

  try {
    const numericId = Number.parseInt(trackId, 10);
    if (!Number.isFinite(numericId)) {
      return res.status(400).json({ error: 'Invalid track id' });
    }

    const track = queries.getTrackById.get(numericId);
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    const playlist = track.playlist_id
      ? queries.getPlaylistById.get(track.playlist_id)
      : null;
    const links = queries.getLinksForTrack.all(track.id);

    res.json({
      track,
      playlist: playlist
        ? {
            id: playlist.id,
            title: playlist.title,
            curator_name: playlist.curator_name,
            curator_type: playlist.curator_type,
            curator_id: playlist.curator_id,
            description_short: playlist.description_short,
            spotify_url: playlist.spotify_url,
            apple_url: playlist.apple_url,
            tidal_url: playlist.tidal_url,
            image: playlist.image,
            publish_date: playlist.publish_date,
          }
        : null,
      links,
    });
  } catch (error) {
    console.error('Error fetching public track:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /l/:slug - Public list page
 * Returns list metadata and tracks (if list is public)
 */
router.get('/l/:slug', (req, res) => {
  const { slug } = req.params;
  const queries = getQueries();

  try {
    // Get share page record
    const sharePage = queries.getSharePageBySlug.get(slug);

    if (!sharePage || sharePage.entity_type !== 'list' || sharePage.is_active !== 1) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Get list data
    const list = queries.getListById.get(sharePage.entity_id);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Check privacy flag
    if (list.is_private === 1) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Get list items (tracks)
    const tracks = queries.getListItems.all(list.id);
    const trackCount = queries.getListItemCount.get(list.id);

    // Get owner information (username, display_name)
    const owner = queries.getUserById.get(list.user_id);
    const ownerInfo = owner ? {
      username: owner.username,
      display_name: owner.display_name,
      avatar_url: owner.avatar_url,
    } : null;

    res.json({
      list: {
        id: list.id,
        title: list.title,
        description: list.description,
        cover_art_url: list.cover_art_url,
        created_at: list.created_at,
        updated_at: list.updated_at,
        track_count: trackCount.count,
      },
      tracks,
      owner: ownerInfo,
    });
  } catch (error) {
    console.error('Error fetching public list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /p/:slug - Public saved tracks page
 * Returns user metadata and saved tracks (if not private)
 */
router.get('/p/:slug', (req, res) => {
  const { slug } = req.params;
  const { offset = 0, limit = 50 } = req.query;
  const queries = getQueries();

  try {
    // Get share page record
    const sharePage = queries.getSharePageBySlug.get(slug);

    if (!sharePage || sharePage.entity_type !== 'saved' || sharePage.is_active !== 1) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Get user data
    const user = queries.getUserById.get(sharePage.owner_user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check privacy flag
    if (user.is_private_saved === 1) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Get saved tracks with pagination
    const tracks = queries.listSavedTracks.all(user.id, parseInt(limit), parseInt(offset));
    const totalCount = queries.getSavedTrackCount.get(user.id);

    res.json({
      user: {
        username: user.username,
        display_name: user.display_name,
        bio: user.bio,
        avatar_url: user.avatar_url,
      },
      tracks,
      pagination: {
        offset: parseInt(offset),
        limit: parseInt(limit),
        total: totalCount.count,
      },
    });
  } catch (error) {
    console.error('Error fetching public saved tracks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/content-tag/:slug - Public content tag page
 * Returns tag metadata and all published playlists with that tag
 *
 * CONTENT TAGS vs CONTENT FLAGS:
 * - Content Tags: Playlist categorization (custom_playlist_flags table)
 * - Content Flags: User-reported track issues (user_content_flags table)
 */
router.get('/api/v1/content-tag/:slug', optionalAuth, async (req, res) => {
  try {
    const { getDatabase } = await import('../database/db.js');
    const db = getDatabase();
    const { slug } = req.params;

    // Get tag metadata with playlist and post counts
    const tag = db.prepare(`
      SELECT
        cpf.id, cpf.text, cpf.color, cpf.text_color,
        cpf.description, cpf.url_slug,
        COUNT(DISTINCT CASE WHEN p.published = 1 THEN pfa.playlist_id END) as playlist_count,
        COUNT(DISTINCT CASE WHEN bp.published = 1 THEN bpfa.post_id END) as post_count,
        COUNT(DISTINCT CASE WHEN fp.status = 'published' THEN fpfa.feature_piece_id END) as feature_count
      FROM custom_playlist_flags cpf
      LEFT JOIN playlist_flag_assignments pfa ON cpf.id = pfa.flag_id
      LEFT JOIN playlists p ON pfa.playlist_id = p.id
      LEFT JOIN blog_post_flag_assignments bpfa ON cpf.id = bpfa.flag_id
      LEFT JOIN blog_posts bp ON bpfa.post_id = bp.id
      LEFT JOIN feature_piece_flag_assignments fpfa ON cpf.id = fpfa.flag_id
      LEFT JOIN feature_pieces fp ON fpfa.feature_piece_id = fp.id
      WHERE cpf.url_slug = ?
      GROUP BY cpf.id
    `).get(slug);

    if (!tag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    // Get all published playlists with this tag
    const playlists = db.prepare(`
      SELECT DISTINCT
        p.id, p.title, p.curator_id, p.curator_name, p.curator_type,
        p.publish_date, p.published_at, p.image, p.description_short
      FROM playlists p
      JOIN playlist_flag_assignments pfa ON p.id = pfa.playlist_id
      WHERE pfa.flag_id = ? AND p.published = 1
      ORDER BY
        COALESCE(
          p.published_at,
          CASE WHEN p.publish_date IS NOT NULL AND p.publish_date != '' THEN datetime(p.publish_date || ' 00:00:00') END,
          p.created_at
        ) DESC,
        p.id DESC
    `).all(tag.id);

    // Attach flags to each playlist
    const demoCuratorIds = getDemoCuratorIdSet();
    const visiblePlaylists = filterDemoPlaylists(playlists, demoCuratorIds, req.user);

    const playlistsWithFlags = visiblePlaylists.map(playlist => {
      const flags = db.prepare(`
        SELECT cpf.id, cpf.text, cpf.color, cpf.text_color, cpf.url_slug
        FROM playlist_flag_assignments pfa
        JOIN custom_playlist_flags cpf ON pfa.flag_id = cpf.id
        WHERE pfa.playlist_id = ?
        ORDER BY cpf.text ASC
      `).all(playlist.id);

      const { curator_id, ...rest } = playlist;
      return { ...rest, flags };
    });

    // Get all published blog posts with this tag
    const posts = db.prepare(`
      SELECT DISTINCT
        bp.id, bp.slug, bp.title, bp.excerpt, bp.featured_image,
        bp.published_at, bp.created_at,
        c.name as author_name, c.profile_image as author_image
      FROM blog_posts bp
      LEFT JOIN curators c ON bp.author_id = c.id
      JOIN blog_post_flag_assignments bpfa ON bp.id = bpfa.post_id
      WHERE bpfa.flag_id = ? AND bp.published = 1
      ORDER BY bp.published_at DESC, bp.id DESC
    `).all(tag.id);

    // Attach flags to each post
    const postsWithFlags = posts.map(post => {
      const flags = db.prepare(`
        SELECT cpf.id, cpf.text, cpf.color, cpf.text_color, cpf.url_slug
        FROM blog_post_flag_assignments bpfa
        JOIN custom_playlist_flags cpf ON bpfa.flag_id = cpf.id
        WHERE bpfa.post_id = ?
        ORDER BY cpf.text ASC
      `).all(post.id);

      return { ...post, flags };
    });

    // Get all published feature pieces with this tag
    const features = db.prepare(`
      SELECT DISTINCT
        fp.id, fp.slug, fp.title, fp.subtitle, fp.excerpt, fp.hero_image,
        fp.published_at, fp.created_at, fp.author_name,
        c.name as curator_name
      FROM feature_pieces fp
      LEFT JOIN curators c ON fp.curator_id = c.id
      JOIN feature_piece_flag_assignments fpfa ON fp.id = fpfa.feature_piece_id
      WHERE fpfa.flag_id = ? AND fp.status = 'published'
      ORDER BY fp.published_at DESC, fp.id DESC
    `).all(tag.id);

    const featuresWithFlags = features.map(feature => {
      const flags = db.prepare(`
        SELECT cpf.id, cpf.text, cpf.color, cpf.text_color, cpf.url_slug
        FROM feature_piece_flag_assignments fpfa
        JOIN custom_playlist_flags cpf ON fpfa.flag_id = cpf.id
        WHERE fpfa.feature_piece_id = ?
        ORDER BY cpf.text ASC
      `).all(feature.id);

      return { ...feature, flags };
    });

    res.json({
      tag,
      playlists: playlistsWithFlags,
      posts: postsWithFlags,
      features: featuresWithFlags
    });

  } catch (error) {
    console.error('[PUBLIC_TAG_PAGE] Error:', error);
    res.status(500).json({ error: 'Failed to load tag page' });
  }
});

export default router;
