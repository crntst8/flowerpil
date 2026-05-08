import express from 'express';
import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';
import { apiLoggingMiddleware } from '../middleware/logging.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Apply logging middleware to all show routes
router.use(apiLoggingMiddleware);

// GET /api/v1/shows - Get all shows
router.get('/shows', async (req, res) => {
  try {
    const db = getDatabase();
    const shows = db.prepare(`
      SELECT 
        s.id as show_id,
        s.show_date,
        s.city,
        s.country,
        s.venue,
        s.ticket_url,
        s.info_url,
        s.sale_indicator,
        s.sort_order,
        s.created_at as show_created_at,
        c.id as curator_id,
        c.name as curator_name,
        c.profile_type
      FROM upcoming_shows s
      LEFT JOIN curators c ON s.curator_id = c.id
      ORDER BY s.show_date ASC, s.sort_order ASC
    `).all();

    res.json({
      success: true,
      data: shows,
      count: shows.length
    });
  } catch (error) {
    logger.error('Error fetching shows:', error);
    res.status(500).json({ 
      error: 'Failed to fetch shows',
      details: error.message 
    });
  }
});

// Utility functions
const sanitizeShowData = (data) => {
  return {
    curator_id: parseInt(data.curator_id || data.curatorId, 10),
    sort_order: parseInt(data.sort_order || data.sortOrder || 0, 10),
    show_date: String(data.show_date || data.showDate || '').trim(),
    city: String(data.city || '').trim(),
    country: String(data.country || '').trim(),
    venue: String(data.venue || '').trim(),
    ticket_url: data.ticket_url || data.ticketUrl || null,
    info_url: data.info_url || data.infoUrl || null,
    sale_indicator: data.sale_indicator || data.saleIndicator || null
  };
};

const sanitizeGuestData = (guests) => {
  if (!Array.isArray(guests)) return [];
  return guests
    .map(guest => String(guest || '').trim())
    .filter(guest => guest.length > 0)
    .slice(0, 10); // Maximum 10 guests
};

// Database query helpers
const getQueries = () => {
  const db = getDatabase();
  
  return {
    // Show queries
    getAllShowsByCurator: db.prepare(`
      SELECT * FROM upcoming_shows 
      WHERE curator_id = ? 
      ORDER BY sort_order ASC, show_date ASC
    `),
    
    getShowById: db.prepare('SELECT * FROM upcoming_shows WHERE id = ?'),
    
    insertShow: db.prepare(`
      INSERT INTO upcoming_shows (
        curator_id, sort_order, show_date, city, country, venue,
        ticket_url, info_url, sale_indicator
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    
    updateShow: db.prepare(`
      UPDATE upcoming_shows SET 
        show_date = ?, city = ?, country = ?, venue = ?,
        ticket_url = ?, info_url = ?, sale_indicator = ?
      WHERE id = ?
    `),
    
    deleteShow: db.prepare('DELETE FROM upcoming_shows WHERE id = ?'),
    
    updateShowOrder: db.prepare('UPDATE upcoming_shows SET sort_order = ? WHERE id = ?'),
    
    getMaxSortOrder: db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order 
      FROM upcoming_shows WHERE curator_id = ?
    `),
    
    // Guest queries
    getGuestsByShowId: db.prepare(`
      SELECT * FROM show_guests 
      WHERE show_id = ? 
      ORDER BY sort_order ASC
    `),
    
    insertGuest: db.prepare(`
      INSERT INTO show_guests (show_id, sort_order, name) VALUES (?, ?, ?)
    `),
    
    deleteGuestsByShowId: db.prepare('DELETE FROM show_guests WHERE show_id = ?'),
    
    // Curator validation
    getCuratorById: db.prepare('SELECT id, name FROM curators WHERE id = ?'),
    
    // Combined query for show with guests
    getShowWithGuests: db.prepare(`
      SELECT 
        s.*,
        GROUP_CONCAT(g.name, '||' || g.sort_order) as guests_data
      FROM upcoming_shows s
      LEFT JOIN show_guests g ON s.id = g.show_id
      WHERE s.id = ?
      GROUP BY s.id
    `)
  };
};

// Helper to format show with guests
const formatShowWithGuests = (show, guestRows = []) => {
  if (!show) return null;
  
  // Parse guests from GROUP_CONCAT or separate query
  let guests = [];
  if (show.guests_data) {
    guests = show.guests_data
      .split(',')
      .map(guestData => {
        const [name, sortOrder] = guestData.split('||');
        return { name, sortOrder: parseInt(sortOrder, 10) };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(g => g.name);
  } else if (guestRows.length > 0) {
    guests = guestRows
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(g => g.name);
  }
  
  // Remove guests_data field and add formatted guests
  const { guests_data, ...showData } = show;
  return {
    ...showData,
    guests
  };
};

// Routes

// GET /api/v1/curators/:id/shows - Get all shows for a curator
router.get('/curators/:id/shows', async (req, res) => {
  try {
    const curatorId = parseInt(req.params.id, 10);
    
    if (isNaN(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator ID' });
    }
    
    const queries = getQueries();
    
    // Verify curator exists
    const curator = queries.getCuratorById.get(curatorId);
    if (!curator) {
      return res.status(404).json({ error: 'Curator not found' });
    }
    
    const shows = queries.getAllShowsByCurator.all(curatorId);
    
    // Get guests for each show
    const showsWithGuests = shows.map(show => {
      const guests = queries.getGuestsByShowId.all(show.id);
      return formatShowWithGuests(show, guests);
    });
    
    res.json({
      success: true,
      data: showsWithGuests,
      count: showsWithGuests.length
    });
  } catch (error) {
    console.error('Error fetching shows:', error);
    res.status(500).json({ error: 'Failed to fetch shows' });
  }
});

// POST /api/v1/curators/:id/shows - Create new show
router.post('/curators/:id/shows', authMiddleware, async (req, res) => {
  try {
    const curatorId = parseInt(req.params.id, 10);
    
    if (isNaN(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator ID' });
    }
    
    const queries = getQueries();
    const db = getDatabase();
    
    // Verify curator exists
    const curator = queries.getCuratorById.get(curatorId);
    if (!curator) {
      return res.status(404).json({ error: 'Curator not found' });
    }
    
    const showData = sanitizeShowData({ ...req.body, curator_id: curatorId });
    const guests = sanitizeGuestData(req.body.guests || []);
    
    // Validation
    if (!showData.show_date) {
      return res.status(400).json({ error: 'Show date is required' });
    }
    
    if (!showData.city) {
      return res.status(400).json({ error: 'City is required' });
    }
    
    if (!showData.country) {
      return res.status(400).json({ error: 'Country is required' });
    }
    
    if (!showData.venue) {
      return res.status(400).json({ error: 'Venue is required' });
    }
    
    // Get next sort order if not specified
    if (showData.sort_order === 0) {
      const nextOrder = queries.getMaxSortOrder.get(curatorId);
      showData.sort_order = nextOrder.next_order;
    }
    
    // Begin transaction
    const transaction = db.transaction(() => {
      // Insert show
      const result = queries.insertShow.run(
        showData.curator_id,
        showData.sort_order,
        showData.show_date,
        showData.city,
        showData.country,
        showData.venue,
        showData.ticket_url,
        showData.info_url,
        showData.sale_indicator
      );
      
      const showId = result.lastInsertRowid;
      
      // Insert guests
      guests.forEach((guestName, index) => {
        queries.insertGuest.run(showId, index, guestName);
      });
      
      return showId;
    });
    
    const showId = transaction();
    
    // Fetch the created show with guests
    const newShow = queries.getShowWithGuests.get(showId);
    
    res.status(201).json({
      success: true,
      data: formatShowWithGuests(newShow)
    });
  } catch (error) {
    console.error('Error creating show:', error);
    res.status(500).json({ error: 'Failed to create show' });
  }
});

// PUT /api/v1/shows/:sid - Update show
router.put('/shows/:sid', authMiddleware, async (req, res) => {
  try {
    const showId = parseInt(req.params.sid, 10);
    
    if (isNaN(showId)) {
      return res.status(400).json({ error: 'Invalid show ID' });
    }
    
    const queries = getQueries();
    const db = getDatabase();
    
    const existingShow = queries.getShowById.get(showId);
    if (!existingShow) {
      return res.status(404).json({ error: 'Show not found' });
    }
    
    const showData = sanitizeShowData(req.body);
    const guests = sanitizeGuestData(req.body.guests || []);
    
    // Begin transaction
    const transaction = db.transaction(() => {
      // Update show
      queries.updateShow.run(
        showData.show_date || existingShow.show_date,
        showData.city || existingShow.city,
        showData.country || existingShow.country,
        showData.venue || existingShow.venue,
        showData.ticket_url !== undefined ? showData.ticket_url : existingShow.ticket_url,
        showData.info_url !== undefined ? showData.info_url : existingShow.info_url,
        showData.sale_indicator !== undefined ? showData.sale_indicator : existingShow.sale_indicator,
        showId
      );
      
      // Update guests - delete all and re-insert
      queries.deleteGuestsByShowId.run(showId);
      
      guests.forEach((guestName, index) => {
        queries.insertGuest.run(showId, index, guestName);
      });
    });
    
    transaction();
    
    // Fetch updated show with guests
    const updatedShow = queries.getShowWithGuests.get(showId);
    
    res.json({
      success: true,
      data: formatShowWithGuests(updatedShow)
    });
  } catch (error) {
    console.error('Error updating show:', error);
    res.status(500).json({ error: 'Failed to update show' });
  }
});

// DELETE /api/v1/shows/:sid - Delete show
router.delete('/shows/:sid', authMiddleware, async (req, res) => {
  try {
    const showId = parseInt(req.params.sid, 10);
    
    if (isNaN(showId)) {
      return res.status(400).json({ error: 'Invalid show ID' });
    }
    
    const queries = getQueries();
    const db = getDatabase();
    
    const existingShow = queries.getShowById.get(showId);
    if (!existingShow) {
      return res.status(404).json({ error: 'Show not found' });
    }
    
    // Begin transaction - guests will be deleted by CASCADE
    const transaction = db.transaction(() => {
      queries.deleteShow.run(showId);
    });
    
    transaction();
    
    res.json({ 
      success: true,
      message: 'Show deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting show:', error);
    res.status(500).json({ error: 'Failed to delete show' });
  }
});

// PUT /api/v1/shows/:sid/reorder - Update show sort order
router.put('/shows/:sid/reorder', authMiddleware, async (req, res) => {
  try {
    const showId = parseInt(req.params.sid, 10);
    const newOrder = parseInt(req.body.sortOrder, 10);
    
    if (isNaN(showId) || isNaN(newOrder)) {
      return res.status(400).json({ error: 'Invalid show ID or sort order' });
    }
    
    const queries = getQueries();
    
    const existingShow = queries.getShowById.get(showId);
    if (!existingShow) {
      return res.status(404).json({ error: 'Show not found' });
    }
    
    // Update sort order
    queries.updateShowOrder.run(newOrder, showId);
    
    // Fetch updated show with guests
    const updatedShow = queries.getShowWithGuests.get(showId);
    
    res.json({
      success: true,
      data: formatShowWithGuests(updatedShow)
    });
  } catch (error) {
    console.error('Error updating show order:', error);
    res.status(500).json({ error: 'Failed to update show order' });
  }
});

export default router;