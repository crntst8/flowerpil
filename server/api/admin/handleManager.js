/**
 * Admin API endpoints for handle management and reservations
 * Route: /api/v1/admin/handle-manager
 */

import express from 'express';
import { getDatabase } from '../../database/db.js';
import { apiLoggingMiddleware } from '../../middleware/logging.js';
import { authMiddleware } from '../../middleware/auth.js';
import { validateHandle, checkHandleAvailability } from '../../utils/bioValidation.js';

const router = express.Router();

// Apply logging and auth middleware to all handle manager routes
router.use(apiLoggingMiddleware);
router.use(authMiddleware); // Admin only

const db = getDatabase();

// Prepared statements for handle management
const queries = {
  // Handle reservations
  getAllReservations: db.prepare(`
    SELECT 
      hr.*,
      au.username as reserved_by_username,
      bp.handle as assigned_handle
    FROM bio_handle_reservations hr
    LEFT JOIN admin_users au ON hr.reserved_by = au.id
    LEFT JOIN bio_profiles bp ON hr.handle = bp.handle
    ORDER BY hr.reserved_at DESC
    LIMIT 500
  `),
  
  getReservationByHandle: db.prepare(`
    SELECT * FROM bio_handle_reservations 
    WHERE handle = ?
  `),
  
  getReservationById: db.prepare(`
    SELECT 
      hr.*,
      au.username as reserved_by_username
    FROM bio_handle_reservations hr
    LEFT JOIN admin_users au ON hr.reserved_by = au.id
    WHERE hr.id = ?
  `),
  
  // Check if handle is in use
  checkHandleInUse: db.prepare(`
    SELECT id, handle, is_published FROM bio_profiles 
    WHERE handle = ?
  `),
  
  // Create handle reservation
  createReservation: db.prepare(`
    INSERT INTO bio_handle_reservations 
    (handle, reserved_by, reserved_for, status, reason, expires_at, notes) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  
  // Update handle reservation
  updateReservation: db.prepare(`
    UPDATE bio_handle_reservations 
    SET 
      reserved_for = ?,
      status = ?,
      reason = ?,
      expires_at = ?,
      notes = ?,
      assigned_at = CASE WHEN ? = 'assigned' THEN datetime('now') ELSE assigned_at END
    WHERE id = ?
  `),
  
  // Release handle reservation
  releaseReservation: db.prepare(`
    UPDATE bio_handle_reservations 
    SET status = 'released' 
    WHERE id = ?
  `),
  
  // Delete handle reservation
  deleteReservation: db.prepare(`
    DELETE FROM bio_handle_reservations 
    WHERE id = ?
  `),
  
  // Get expired reservations
  getExpiredReservations: db.prepare(`
    SELECT * FROM bio_handle_reservations 
    WHERE status = 'reserved' 
    AND expires_at < datetime('now')
  `),
  
  // Get handle usage statistics
  getHandleStats: db.prepare(`
    SELECT 
      COUNT(*) as total_bio_pages,
      COUNT(CASE WHEN is_published = 1 THEN 1 END) as published_bio_pages,
      COUNT(CASE WHEN is_published = 0 THEN 1 END) as draft_bio_pages
    FROM bio_profiles
  `),
  
  getReservationStats: db.prepare(`
    SELECT 
      COUNT(*) as total_reservations,
      COUNT(CASE WHEN status = 'reserved' THEN 1 END) as active_reservations,
      COUNT(CASE WHEN status = 'assigned' THEN 1 END) as assigned_reservations,
      COUNT(CASE WHEN status = 'released' THEN 1 END) as released_reservations,
      COUNT(CASE WHEN expires_at < datetime('now') THEN 1 END) as expired_reservations
    FROM bio_handle_reservations
  `),
  
  // Search bio profiles by handle pattern
  searchBioProfiles: db.prepare(`
    SELECT 
      bp.id,
      bp.handle,
      bp.curator_id,
      c.name as curator_name,
      bp.is_published,
      bp.created_at,
      bp.updated_at
    FROM bio_profiles bp
    LEFT JOIN curators c ON bp.curator_id = c.id
    WHERE bp.handle LIKE ?
    ORDER BY bp.handle
    LIMIT 100
  `),
  
  // Audit log for handle operations
  logHandleOperation: db.prepare(`
    INSERT INTO admin_audit_log 
    (admin_user_id, action_type, resource_type, resource_id, details, ip_address, session_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
};

/**
 * GET /api/v1/admin/handle-manager/reservations
 * Get all handle reservations with optional status filter
 */
router.get('/reservations', (req, res) => {
  try {
    const { status } = req.query;
    
    let reservations = queries.getAllReservations.all();
    
    // Filter by status if provided
    if (status && ['reserved', 'assigned', 'released'].includes(status)) {
      reservations = reservations.filter(r => r.status === status);
    }
    
    const stats = queries.getReservationStats.get();
    
    res.json({
      success: true,
      data: {
        reservations: reservations,
        stats: stats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Handle manager reservations error: ${JSON.stringify({
      query: req.query,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch handle reservations'
    });
  }
});

/**
 * GET /api/v1/admin/handle-manager/stats
 * Get handle usage statistics
 */
router.get('/stats', (req, res) => {
  try {
    const handleStats = queries.getHandleStats.get();
    const reservationStats = queries.getReservationStats.get();
    const expiredReservations = queries.getExpiredReservations.all();
    
    res.json({
      success: true,
      data: {
        handle_usage: handleStats,
        reservations: reservationStats,
        expired_reservations: expiredReservations.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Handle manager stats error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch handle statistics'
    });
  }
});

/**
 * GET /api/v1/admin/handle-manager/check/:handle
 * Check handle availability and usage
 */
router.get('/check/:handle', (req, res) => {
  try {
    const handle = req.params.handle.toLowerCase().trim();
    
    // Validate handle format
    const validation = validateHandle(handle);
    if (!validation.valid) {
      return res.json({
        success: true,
        data: {
          handle: handle,
          available: false,
          valid: false,
          reason: validation.reason,
          errors: validation.errors
        }
      });
    }
    
    // Check if handle is in use
    const bioProfile = queries.checkHandleInUse.get(handle);
    const reservation = queries.getReservationByHandle.get(handle);
    
    let available = true;
    let reason = 'Handle is available';
    
    if (bioProfile) {
      available = false;
      reason = `Handle is in use by ${bioProfile.is_published ? 'published' : 'draft'} bio page (ID: ${bioProfile.id})`;
    } else if (reservation && reservation.status === 'reserved') {
      available = false;
      reason = `Handle is reserved${reservation.expires_at ? ` until ${reservation.expires_at}` : ''}`;
    }
    
    res.json({
      success: true,
      data: {
        handle: handle,
        available: available,
        valid: true,
        reason: reason,
        usage: bioProfile || null,
        reservation: reservation || null,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Handle manager check error: ${JSON.stringify({
      handle: req.params.handle,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to check handle availability'
    });
  }
});

/**
 * POST /api/v1/admin/handle-manager/reserve
 * Create a new handle reservation
 */
router.post('/reserve', (req, res) => {
  try {
    const { handle, reserved_for, reason, expires_in_days = 30, notes } = req.body;
    
    if (!handle || !reserved_for) {
      return res.status(400).json({
        success: false,
        error: 'handle and reserved_for are required'
      });
    }
    
    const normalizedHandle = handle.toLowerCase().trim();
    
    // Validate handle format
    const validation = validateHandle(normalizedHandle);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid handle format',
        details: validation.errors
      });
    }
    
    // Check if handle is already in use or reserved
    const existingBio = queries.checkHandleInUse.get(normalizedHandle);
    const existingReservation = queries.getReservationByHandle.get(normalizedHandle);
    
    if (existingBio) {
      return res.status(400).json({
        success: false,
        error: 'Handle is already in use',
        details: { bio_profile_id: existingBio.id }
      });
    }
    
    if (existingReservation && existingReservation.status === 'reserved') {
      return res.status(400).json({
        success: false,
        error: 'Handle is already reserved',
        details: { reservation_id: existingReservation.id }
      });
    }
    
    // Calculate expiry date
    const expiresAt = expires_in_days > 0 ? 
      new Date(Date.now() + (expires_in_days * 24 * 60 * 60 * 1000)).toISOString() : 
      null;
    
    // Create reservation
    const result = queries.createReservation.run(
      normalizedHandle,
      req.user.id,
      reserved_for,
      'reserved',
      reason || 'Admin reservation',
      expiresAt,
      notes || null
    );
    
    // Log the operation
    queries.logHandleOperation.run(
      req.user.id,
      'create_reservation',
      'handle_reservation',
      result.lastInsertRowid,
      JSON.stringify({
        handle: normalizedHandle,
        reserved_for: reserved_for,
        expires_at: expiresAt
      }),
      req.ip,
      req.sessionID || null
    );
    
    res.json({
      success: true,
      data: {
        reservation_id: result.lastInsertRowid,
        handle: normalizedHandle,
        reserved_for: reserved_for,
        status: 'reserved',
        expires_at: expiresAt,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Handle manager reserve error: ${JSON.stringify({
      body: req.body,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to create handle reservation'
    });
  }
});

/**
 * PUT /api/v1/admin/handle-manager/reservation/:id
 * Update handle reservation
 */
router.put('/reservation/:id', (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    const { reserved_for, status, reason, expires_in_days, notes } = req.body;
    
    if (!reservationId || isNaN(reservationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reservation ID'
      });
    }
    
    // Get existing reservation
    const existingReservation = queries.getReservationById.get(reservationId);
    if (!existingReservation) {
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }
    
    // Validate status if provided
    if (status && !['reserved', 'assigned', 'released'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be reserved, assigned, or released'
      });
    }
    
    // Calculate new expiry date if provided
    let expiresAt = existingReservation.expires_at;
    if (expires_in_days !== undefined) {
      expiresAt = expires_in_days > 0 ? 
        new Date(Date.now() + (expires_in_days * 24 * 60 * 60 * 1000)).toISOString() : 
        null;
    }
    
    // Update reservation
    queries.updateReservation.run(
      reserved_for || existingReservation.reserved_for,
      status || existingReservation.status,
      reason || existingReservation.reason,
      expiresAt,
      notes !== undefined ? notes : existingReservation.notes,
      status || existingReservation.status, // for assigned_at conditional
      reservationId
    );
    
    // Log the operation
    queries.logHandleOperation.run(
      req.user.id,
      'update_reservation',
      'handle_reservation',
      reservationId,
      JSON.stringify({
        handle: existingReservation.handle,
        old_status: existingReservation.status,
        new_status: status || existingReservation.status,
        changes: { reserved_for, status, reason, expires_in_days, notes }
      }),
      req.ip,
      req.sessionID || null
    );
    
    res.json({
      success: true,
      data: {
        reservation_id: reservationId,
        handle: existingReservation.handle,
        updated_fields: { reserved_for, status, reason, expires_at: expiresAt, notes },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Handle manager update reservation error: ${JSON.stringify({
      reservationId: req.params.id,
      body: req.body,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to update handle reservation'
    });
  }
});

/**
 * DELETE /api/v1/admin/handle-manager/reservation/:id
 * Delete handle reservation
 */
router.delete('/reservation/:id', (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    
    if (!reservationId || isNaN(reservationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reservation ID'
      });
    }
    
    // Get existing reservation for logging
    const existingReservation = queries.getReservationById.get(reservationId);
    if (!existingReservation) {
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }
    
    // Delete reservation
    const result = queries.deleteReservation.run(reservationId);
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }
    
    // Log the operation
    queries.logHandleOperation.run(
      req.user.id,
      'delete_reservation',
      'handle_reservation',
      reservationId,
      JSON.stringify({
        handle: existingReservation.handle,
        reserved_for: existingReservation.reserved_for,
        status: existingReservation.status
      }),
      req.ip,
      req.sessionID || null
    );
    
    res.json({
      success: true,
      data: {
        reservation_id: reservationId,
        handle: existingReservation.handle,
        deleted: true,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Handle manager delete reservation error: ${JSON.stringify({
      reservationId: req.params.id,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete handle reservation'
    });
  }
});

/**
 * GET /api/v1/admin/handle-manager/search
 * Search bio profiles by handle pattern
 */
router.get('/search', (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Query must be at least 2 characters'
      });
    }
    
    const searchPattern = `%${query.toLowerCase()}%`;
    const bioProfiles = queries.searchBioProfiles.all(searchPattern);
    
    res.json({
      success: true,
      data: {
        query: query,
        results: bioProfiles,
        count: bioProfiles.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Handle manager search error: ${JSON.stringify({
      query: req.query,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to search bio profiles'
    });
  }
});

/**
 * POST /api/v1/admin/handle-manager/cleanup-expired
 * Clean up expired reservations
 */
router.post('/cleanup-expired', (req, res) => {
  try {
    const expiredReservations = queries.getExpiredReservations.all();
    
    let cleaned = 0;
    for (const reservation of expiredReservations) {
      const result = queries.releaseReservation.run(reservation.id);
      if (result.changes > 0) {
        cleaned++;
        
        // Log the cleanup
        queries.logHandleOperation.run(
          req.user.id,
          'cleanup_expired_reservation',
          'handle_reservation',
          reservation.id,
          JSON.stringify({
            handle: reservation.handle,
            expired_at: reservation.expires_at,
            was_reserved_for: reservation.reserved_for
          }),
          req.ip,
          req.sessionID || null
        );
      }
    }
    
    res.json({
      success: true,
      data: {
        expired_found: expiredReservations.length,
        cleaned_count: cleaned,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Handle manager cleanup expired error: ${JSON.stringify({
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to clean up expired reservations'
    });
  }
});

export default router;