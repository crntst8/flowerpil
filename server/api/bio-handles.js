import express from 'express';
import { getQueries } from '../database/db.js';
import { apiLoggingMiddleware } from '../middleware/logging.js';
import { 
  validateHandle, 
  checkHandleAvailability, 
  suggestHandles 
} from '../utils/bioValidation.js';

const router = express.Router();

// Apply logging middleware
router.use(apiLoggingMiddleware);

// GET /api/v1/bio-handles/check/:handle - Check handle availability
router.get('/check/:handle', async (req, res) => {
  try {
    const queries = getQueries();
    const handle = req.params.handle.toLowerCase();
    const excludeId = req.query.excludeId ? parseInt(req.query.excludeId, 10) : null;
    
    const availability = await checkHandleAvailability(handle, queries, excludeId);
    
    res.json({
      success: true,
      handle: handle,
      available: availability.available,
      reason: availability.reason || null,
      errors: availability.errors || [],
      suggestions: availability.available ? [] : await suggestHandles(handle, queries)
    });
  } catch (error) {
    console.error('Error checking handle availability:', error);
    res.status(500).json({ error: 'Failed to check handle availability' });
  }
});

// GET /api/v1/bio-handles/suggest/:partial - Suggest available handles
router.get('/suggest/:partial', async (req, res) => {
  try {
    const queries = getQueries();
    const partial = req.params.partial.toLowerCase();
    
    if (partial.length < 2) {
      return res.json({
        success: true,
        partial: partial,
        suggestions: [],
        message: 'Partial handle must be at least 2 characters'
      });
    }
    
    const suggestions = await suggestHandles(partial, queries);
    
    res.json({
      success: true,
      partial: partial,
      suggestions
    });
  } catch (error) {
    console.error('Error generating handle suggestions:', error);
    res.status(500).json({ error: 'Failed to generate handle suggestions' });
  }
});

// GET /api/v1/bio-handles/validate/:handle - Validate handle format
router.get('/validate/:handle', async (req, res) => {
  try {
    const handle = req.params.handle.toLowerCase();
    const validation = validateHandle(handle);
    
    res.json({
      success: true,
      handle: handle,
      valid: validation.isValid,
      errors: validation.errors,
      cleaned: validation.handle
    });
  } catch (error) {
    console.error('Error validating handle:', error);
    res.status(500).json({ error: 'Failed to validate handle' });
  }
});

export default router;