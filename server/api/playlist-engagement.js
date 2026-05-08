import express from 'express';
import Joi from 'joi';
import { getQueries, getDatabase } from '../database/db.js';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';

const router = express.Router();
const MAX_COMMENT_LENGTH = 600;
const db = getDatabase();

const resolveAccountRole = (role) => {
  if (role === 'user') return 'user';
  if (role === 'curator') return 'curator';
  return 'admin';
};

const validatePlaylistId = (playlistIdRaw) => {
  const parsed = Number.parseInt(playlistIdRaw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const getPublishedPlaylistOrNull = (queries, playlistId) => {
  const playlist = queries.getPlaylistById.get(playlistId);
  if (!playlist || !playlist.published) return null;
  return playlist;
};

const byCreatedAsc = (a, b) => {
  const aTime = new Date(a.created_at).getTime();
  const bTime = new Date(b.created_at).getTime();
  if (aTime !== bTime) return aTime - bTime;
  return (a.id || 0) - (b.id || 0);
};

const buildCommentTree = (rows = []) => {
  const nodes = (rows || []).map((row) => ({
    id: row.id,
    playlist_id: row.playlist_id,
    account_id: row.account_id,
    account_role: row.account_role,
    parent_comment_id: row.parent_comment_id || null,
    comment_text: row.comment_text || '',
    created_at: row.created_at || null,
    username: row.username || 'User',
    replies: []
  }));

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots = [];

  nodes.forEach((node) => {
    if (!node.parent_comment_id) {
      roots.push(node);
      return;
    }

    const parent = byId.get(node.parent_comment_id);
    if (!parent) {
      roots.push({ ...node, parent_comment_id: null });
      return;
    }

    if (parent.parent_comment_id) {
      const topParent = byId.get(parent.parent_comment_id) || parent;
      topParent.replies.push({ ...node, parent_comment_id: topParent.id, replies: [] });
      return;
    }

    parent.replies.push({ ...node, replies: [] });
  });

  roots.sort(byCreatedAsc);
  roots.forEach((node) => {
    node.replies.sort(byCreatedAsc);
  });

  return roots;
};

const buildEngagementPayload = (queries, playlistId, viewer = null) => {
  const comments = buildCommentTree(queries.listPlaylistCommentsWithAuthors.all(playlistId) || []);
  const loveRow = queries.getPlaylistLoveCount.get(playlistId);
  let viewerHasLoved = false;

  if (viewer?.id && viewer?.accountRole) {
    viewerHasLoved = Boolean(
      queries.checkPlaylistLovedByAccount.get(playlistId, viewer.id, viewer.accountRole)
    );
  }

  return {
    loveCount: Number(loveRow?.count || 0),
    viewerHasLoved,
    comments
  };
};

const readGateEnabled = (configKey, fallback = true) => {
  try {
    const row = db
      .prepare('SELECT config_value FROM admin_system_config WHERE config_key = ? LIMIT 1')
      .get(configKey);
    if (!row?.config_value) return fallback;
    const parsed = JSON.parse(row.config_value);
    if (typeof parsed?.enabled === 'boolean') return parsed.enabled;
    return fallback;
  } catch {
    return fallback;
  }
};

const isLoveEnabled = () => readGateEnabled('playlist_love_enabled', true);
const isCommentsEnabled = () => readGateEnabled('playlist_comments_enabled', true);

// GET /api/v1/playlist-engagement/saved/playlists
router.get('/saved/playlists', authMiddleware, (req, res) => {
  try {
    if (!isLoveEnabled()) {
      return res.json({ success: true, data: [] });
    }

    const queries = getQueries();
    const accountRole = resolveAccountRole(req.user?.role);

    const rows = queries.listLovedPlaylistsByAccount.all(req.user.id, accountRole) || [];
    const data = rows.map((playlist) => ({
      id: playlist.id,
      title: playlist.title,
      image: playlist.image || null,
      curator_name: playlist.curator_name || null,
      curator_type: playlist.curator_type || null,
      publish_date: playlist.publish_date || null,
      published_at: playlist.published_at || null,
      tracks_count: Number(playlist.tracks_count || 0),
      loved_at: playlist.loved_at || null,
      published: Boolean(playlist.published)
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('[PLAYLIST_ENGAGEMENT] Failed to list saved playlists:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load saved playlists'
    });
  }
});

// GET /api/v1/playlist-engagement/:playlistId
router.get('/:playlistId', optionalAuth, (req, res) => {
  try {
    const playlistId = validatePlaylistId(req.params.playlistId);
    if (!playlistId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid playlist id'
      });
    }

    const queries = getQueries();
    const playlist = getPublishedPlaylistOrNull(queries, playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    const viewer = req.user
      ? { id: req.user.id, accountRole: resolveAccountRole(req.user.role) }
      : null;

    const data = buildEngagementPayload(queries, playlistId, viewer);
    if (!isLoveEnabled()) {
      data.loveCount = 0;
      data.viewerHasLoved = false;
    }
    if (!isCommentsEnabled()) {
      data.comments = [];
    }
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[PLAYLIST_ENGAGEMENT] Failed to fetch engagement:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load engagement'
    });
  }
});

// POST /api/v1/playlist-engagement/:playlistId/love
router.post('/:playlistId/love', authMiddleware, (req, res) => {
  try {
    if (!isLoveEnabled()) {
      return res.status(403).json({
        success: false,
        error: 'Playlist love is disabled'
      });
    }

    const playlistId = validatePlaylistId(req.params.playlistId);
    if (!playlistId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid playlist id'
      });
    }

    const queries = getQueries();
    const playlist = getPublishedPlaylistOrNull(queries, playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    const accountRole = resolveAccountRole(req.user.role);
    queries.addPlaylistLove.run(playlistId, req.user.id, accountRole);

    const data = buildEngagementPayload(queries, playlistId, {
      id: req.user.id,
      accountRole
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[PLAYLIST_ENGAGEMENT] Failed to love playlist:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to love playlist'
    });
  }
});

// DELETE /api/v1/playlist-engagement/:playlistId/love
router.delete('/:playlistId/love', authMiddleware, (req, res) => {
  try {
    if (!isLoveEnabled()) {
      return res.status(403).json({
        success: false,
        error: 'Playlist love is disabled'
      });
    }

    const playlistId = validatePlaylistId(req.params.playlistId);
    if (!playlistId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid playlist id'
      });
    }

    const queries = getQueries();
    const playlist = getPublishedPlaylistOrNull(queries, playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    const accountRole = resolveAccountRole(req.user.role);
    queries.removePlaylistLove.run(playlistId, req.user.id, accountRole);

    const data = buildEngagementPayload(queries, playlistId, {
      id: req.user.id,
      accountRole
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[PLAYLIST_ENGAGEMENT] Failed to remove playlist love:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update playlist love'
    });
  }
});

// POST /api/v1/playlist-engagement/:playlistId/comments
router.post('/:playlistId/comments', authMiddleware, (req, res) => {
  try {
    if (!isCommentsEnabled()) {
      return res.status(403).json({
        success: false,
        error: 'Playlist comments are disabled'
      });
    }

    const playlistId = validatePlaylistId(req.params.playlistId);
    if (!playlistId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid playlist id'
      });
    }

    const schema = Joi.object({
      comment: Joi.string().trim().min(1).max(MAX_COMMENT_LENGTH).required()
    });

    const { error, value } = schema.validate(req.body || {});
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details?.[0]?.message || 'Invalid comment'
      });
    }

    const queries = getQueries();
    const playlist = getPublishedPlaylistOrNull(queries, playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    const accountRole = resolveAccountRole(req.user.role);
    queries.insertPlaylistComment.run(
      playlistId,
      req.user.id,
      accountRole,
      null,
      value.comment
    );

    const data = buildEngagementPayload(queries, playlistId, {
      id: req.user.id,
      accountRole
    });

    return res.json({ success: true, data });
  } catch (error) {
    console.error('[PLAYLIST_ENGAGEMENT] Failed to create comment:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to post comment'
    });
  }
});

// POST /api/v1/playlist-engagement/:playlistId/comments/:commentId/replies
router.post('/:playlistId/comments/:commentId/replies', authMiddleware, (req, res) => {
  try {
    if (!isCommentsEnabled()) {
      return res.status(403).json({
        success: false,
        error: 'Playlist comments are disabled'
      });
    }

    const playlistId = validatePlaylistId(req.params.playlistId);
    const parentCommentId = validatePlaylistId(req.params.commentId);
    if (!playlistId || !parentCommentId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid playlist or comment id'
      });
    }

    const schema = Joi.object({
      comment: Joi.string().trim().min(1).max(MAX_COMMENT_LENGTH).required()
    });

    const { error, value } = schema.validate(req.body || {});
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details?.[0]?.message || 'Invalid reply'
      });
    }

    const queries = getQueries();
    const playlist = getPublishedPlaylistOrNull(queries, playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    const parent = queries.getPlaylistCommentById.get(parentCommentId);
    if (!parent || Number(parent.playlist_id) !== playlistId) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found'
      });
    }

    const accountRole = resolveAccountRole(req.user.role);
    // Keep replies single-depth in UI; always attach to top-level parent if nested.
    const targetParentId = parent.parent_comment_id || parent.id;
    queries.insertPlaylistComment.run(
      playlistId,
      req.user.id,
      accountRole,
      targetParentId,
      value.comment
    );

    const data = buildEngagementPayload(queries, playlistId, {
      id: req.user.id,
      accountRole
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[PLAYLIST_ENGAGEMENT] Failed to create reply:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to post reply'
    });
  }
});

export default router;
