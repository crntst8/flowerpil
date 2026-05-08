import express from 'express';
import { getQueries } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// POST /api/v1/flags - Submit a new flag (public endpoint)
router.post('/flags', async (req, res) => {
  try {
    const { track_id, playlist_id, issue_type, track_title, track_artist } = req.body;

    // Validate required fields
    if (!track_id || !issue_type) {
      return res.status(400).json({ 
        error: 'Missing required fields: track_id and issue_type' 
      });
    }

    // Validate issue_type
    const validIssueTypes = ['wrong_dsp_url', 'wrong_preview', 'broken_link', 'other'];
    if (!validIssueTypes.includes(issue_type)) {
      return res.status(400).json({ 
        error: 'Invalid issue_type. Must be one of: ' + validIssueTypes.join(', ') 
      });
    }

    const queries = getQueries();
    
    // Insert flag into database
    const result = queries.insertUserContentFlag.run(
      track_id, 
      playlist_id || null, 
      issue_type, 
      track_title || null, 
      track_artist || null
    );

    console.log(`[FLAG_SUBMITTED] Flag created with ID: ${result.lastInsertRowid}`, {
      track_id,
      playlist_id,
      issue_type,
      track_title,
      track_artist,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      flag_id: result.lastInsertRowid,
      message: 'Flag submitted successfully'
    });

  } catch (error) {
    console.error('[FLAG_SUBMIT_ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to submit flag',
      details: error.message 
    });
  }
});

// GET /api/v1/admin/flags - Get all flags (admin only)
router.get('/admin/flags', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    const queries = getQueries();
    
    let flags;
    if (status && ['resolved', 'unresolved'].includes(status)) {
      flags = queries.getUserContentFlagsByStatus.all(status);
    } else {
      flags = queries.getAllUserContentFlags.all();
    }

    console.log(`[ADMIN_FLAGS_RETRIEVED] Retrieved ${flags.length} flags`, {
      status_filter: status,
      admin_user: req.user?.username,
      timestamp: new Date().toISOString()
    });

    res.json({
      flags,
      total: flags.length,
      filter: status || 'all'
    });

  } catch (error) {
    console.error('[ADMIN_FLAGS_ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to retrieve flags',
      details: error.message 
    });
  }
});

// GET /api/v1/admin/flags/:id - Get single flag (admin only)
router.get('/admin/flags/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const queries = getQueries();
    
    const flag = queries.getUserContentFlagById.get(id);
    
    if (!flag) {
      return res.status(404).json({ error: 'Flag not found' });
    }

    res.json(flag);

  } catch (error) {
    console.error('[ADMIN_FLAG_GET_ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to retrieve flag',
      details: error.message 
    });
  }
});

// PUT /api/v1/admin/flags/:id/resolve - Resolve a flag (admin only)
router.put('/admin/flags/:id/resolve', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const queries = getQueries();
    
    // Check if flag exists
    const existingFlag = queries.getUserContentFlagById.get(id);
    if (!existingFlag) {
      return res.status(404).json({ error: 'Flag not found' });
    }

    if (existingFlag.status === 'resolved') {
      return res.status(400).json({ error: 'Flag is already resolved' });
    }

    // Resolve the flag
    const result = queries.resolveUserContentFlag.run(req.user.username, id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Flag not found' });
    }

    console.log(`[FLAG_RESOLVED] Flag ${id} resolved by admin ${req.user.username}`, {
      flag_id: id,
      resolved_by: req.user.username,
      original_issue: existingFlag.issue_type,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Flag resolved successfully',
      resolved_by: req.user.username,
      resolved_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[FLAG_RESOLVE_ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to resolve flag',
      details: error.message 
    });
  }
});

// DELETE /api/v1/admin/flags/:id - Delete a flag (admin only)
router.delete('/admin/flags/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const queries = getQueries();
    
    // Check if flag exists first
    const existingFlag = queries.getUserContentFlagById.get(id);
    if (!existingFlag) {
      return res.status(404).json({ error: 'Flag not found' });
    }

    // Delete the flag
    const result = queries.deleteUserContentFlag.run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Flag not found' });
    }

    console.log(`[FLAG_DELETED] Flag ${id} deleted by admin ${req.user.username}`, {
      flag_id: id,
      deleted_by: req.user.username,
      original_issue: existingFlag.issue_type,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Flag deleted successfully'
    });

  } catch (error) {
    console.error('[FLAG_DELETE_ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to delete flag',
      details: error.message 
    });
  }
});

export default router;