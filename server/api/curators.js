import express from 'express';
import { getDatabase, getQueries } from '../database/db.js';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger.js';
import { apiLoggingMiddleware } from '../middleware/logging.js';
import { authMiddleware, optionalAuth, requireAnyRole } from '../middleware/auth.js';
import { validateCSRFToken } from '../middleware/csrfProtection.js';
import { uploadToR2 } from '../utils/r2Storage.js';
import { canViewDemoCurator, filterDemoCurators, getDemoCuratorIdSet } from '../utils/demoAccountUtils.js';
import { invalidateCuratorPlaylists } from '../utils/memoryCache.js';

const router = express.Router();

// Apply logging middleware to all curator routes
router.use(apiLoggingMiddleware);

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Utility functions
const normalizeCuratorType = (value) => {
  if (value === undefined || value === null) return '';
  const normalized = String(value).trim();
  if (!normalized || normalized.toLowerCase() === 'undefined' || normalized.toLowerCase() === 'null') {
    return '';
  }
  return normalized;
};

const MAX_CURATOR_NAME_DECODE_PASSES = 3;
const safeDecodeURIComponent = (value) => {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
};

const normalizeWhitespace = (value) => String(value || '')
  .replace(/\+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeCuratorNameParam = (value, { maxDecodePasses = MAX_CURATOR_NAME_DECODE_PASSES } = {}) => {
  const rawName = String(value || '');
  const rawDecodedName = safeDecodeURIComponent(rawName);
  let decodedName = rawName;
  let decodePasses = 0;

  for (let i = 0; i < maxDecodePasses; i += 1) {
    const nextDecoded = safeDecodeURIComponent(decodedName);
    if (nextDecoded === decodedName) {
      break;
    }
    decodedName = nextDecoded;
    decodePasses += 1;
  }

  return {
    rawName,
    rawDecodedName,
    normalizedName: normalizeWhitespace(decodedName),
    decodePasses
  };
};

const canViewUnpublishedReleases = (user, curatorId) => {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'super_admin') return true;
  return user.role === 'curator' && Number(user.curator_id) === Number(curatorId);
};

const sanitizeCuratorData = (data) => {
  const incomingType = normalizeCuratorType(data.type);
  const incomingProfileType = normalizeCuratorType(data.profile_type);
  const resolvedType = incomingType || incomingProfileType || 'artist';
  const resolvedProfileType = incomingProfileType || incomingType || 'artist';

  // Validate DSP implementation status
  const validStatuses = ['not_yet_implemented', 'implemented'];
  let dspStatus = data.dsp_implementation_status ? String(data.dsp_implementation_status).trim() : 'not_yet_implemented';
  if (!validStatuses.includes(dspStatus)) {
    dspStatus = 'not_yet_implemented';
  }

  return {
    name: String(data.name || '').trim(),
    type: resolvedType,
    profile_type: resolvedProfileType,
    tester: data.tester === true || data.tester === 'true' || data.tester === 1 || data.tester === '1' ? 1 : 0,
    spotify_oauth_approved: data.spotify_oauth_approved === true || data.spotify_oauth_approved === 'true' || data.spotify_oauth_approved === 1 || data.spotify_oauth_approved === '1' ? 1 : 0,
    youtube_oauth_approved: data.youtube_oauth_approved === true || data.youtube_oauth_approved === 'true' || data.youtube_oauth_approved === 1 || data.youtube_oauth_approved === '1' ? 1 : 0,
    bio: data.bio ? String(data.bio).trim() : null,
    bio_short: data.bio_short ? String(data.bio_short).trim() : null,
    profile_image: data.profile_image ? String(data.profile_image).trim() : null,
    location: data.location ? String(data.location).trim() : null,
    website_url: data.website_url ? String(data.website_url).trim() : null,
    contact_email: data.contact_email ? String(data.contact_email).trim() : null,
    spotify_url: data.spotify_url ? String(data.spotify_url).trim() : null,
    apple_url: data.apple_url ? String(data.apple_url).trim() : null,
    tidal_url: data.tidal_url ? String(data.tidal_url).trim() : null,
    bandcamp_url: data.bandcamp_url ? String(data.bandcamp_url).trim() : null,
    social_links: data.social_links ? (typeof data.social_links === 'string' ? data.social_links : JSON.stringify(data.social_links)) : null,
    external_links: data.external_links ? (typeof data.external_links === 'string' ? data.external_links : JSON.stringify(data.external_links)) : null,
    verification_status: String(data.verification_status || 'pending').trim(),
    profile_visibility: String(data.profile_visibility || 'public').trim(),
    upcoming_releases_enabled: data.upcoming_releases_enabled !== false ? 1 : 0,
    upcoming_shows_enabled: data.upcoming_shows_enabled !== false ? 1 : 0,
    dsp_implementation_status: dspStatus,
    custom_fields: data.custom_fields ? JSON.stringify(data.custom_fields) : null
  };
};

const processCuratorResponse = (curator) => {
  if (!curator) return null;
  
  const parseJsonField = (field, defaultValue = []) => {
    // Handle null, undefined, or empty values
    if (!field) return defaultValue;
    
    // Already an object/array - return as is (but validate if expecting array)
    if (typeof field === 'object') {
      if (Array.isArray(defaultValue)) {
        return Array.isArray(field) ? field : defaultValue;
      }
      return field;
    }
    
    // Handle string JSON
    if (typeof field === 'string') {
      try {
        let parsed = JSON.parse(field);
        
        // Check if we need to parse again (double-encoded JSON)
        if (typeof parsed === 'string') {
          logger.debug('CURATOR_API', 'Double-encoded JSON detected, parsing again', {
            originalField: field.substring(0, 50) + '...',
            firstParse: parsed.substring(0, 50) + '...'
          });
          try {
            parsed = JSON.parse(parsed);
          } catch (doubleParseError) {
            logger.warn('CURATOR_API', 'Failed to parse double-encoded JSON, using default', { 
              originalField: field.substring(0, 100),
              firstParse: parsed.substring(0, 100),
              error: doubleParseError.message,
              defaultValue 
            });
            return defaultValue;
          }
        }
        
        // Ensure parsed value matches expected type
        if (Array.isArray(defaultValue)) {
          return Array.isArray(parsed) ? parsed : defaultValue;
        }
        return parsed || defaultValue;
      } catch (error) {
        logger.error('CURATOR_API', `Failed to parse JSON field: ${error.message}`, { 
          fieldValue: field.substring(0, 100),
          fieldLength: field.length,
          fieldType: typeof field,
          defaultValue,
          error: error.message
        });
        return defaultValue;
      }
    }
    
    // Fallback for unexpected types - convert to string safely
    logger.debug('CURATOR_API', `Unexpected field type: ${typeof field}`, { 
      field: field === null ? 'null' : typeof field === 'object' ? '[object]' : String(field), 
      defaultValue 
    });
    return defaultValue;
  };
  
  const customFields = parseJsonField(curator.custom_fields, {});

  const processedCurator = {
    ...curator,
    social_links: parseJsonField(curator.social_links, []),
    external_links: parseJsonField(curator.external_links, []),
    custom_fields: customFields,
    // Extract spotify_api_email for easier frontend access
    spotify_api_email: customFields.spotify_api_email || null
  };
  processedCurator.tester = !!curator.tester;
  processedCurator.spotify_oauth_approved = !!curator.spotify_oauth_approved;
  processedCurator.youtube_oauth_approved = !!curator.youtube_oauth_approved;

  // Debug logging for social_links processing
  logger.debug('CURATOR_API', 'JSON field processing complete', {
    originalSocialLinks: curator.social_links,
    processedSocialLinks: processedCurator.social_links,
    socialLinksType: typeof processedCurator.social_links,
    socialLinksArray: Array.isArray(processedCurator.social_links),
    socialLinksLength: processedCurator.social_links?.length
  });
  
  return processedCurator;
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
    logger.warn('CURATOR_API', 'Failed to load curator meta pixels', {
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
    logger.warn('CURATOR_API', 'Failed to load curator meta pixel', {
      curatorId,
      error: error?.message || error
    });
    return null;
  }
};

// Image processing utility - Now uploads to R2
const processAndSaveImage = async (buffer, filename, type = 'profile') => {
  const sizes = [{ width: 200, height: 200, suffix: '' }];  // Profile image

  const savedImages = [];

  for (const size of sizes) {
    const processedBuffer = await sharp(buffer)
      .resize(size.width, size.height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    // Upload to R2
    const r2Key = `curators/${filename}${size.suffix}.jpg`;
    const imageUrl = await uploadToR2(processedBuffer, r2Key, 'image/jpeg');

    savedImages.push(imageUrl);
  }

  return savedImages[0]; // Return the main image URL
};

// Routes

// GET /api/v1/curators - Get all public curators with efficient database filtering
router.get('/', optionalAuth, async (req, res) => {
  try {
    const queries = getQueries();
    const { search, type, verification_status } = req.query;
    
    let curators;
    
    if (search) {
      // Use optimized search with filters
      const searchTerm = `%${search}%`;
      curators = queries.searchCuratorsFiltered.all(
        searchTerm, searchTerm, searchTerm,  // Search terms for name, bio_short, location
        type || null, type || null,          // Profile type filter (duplicated for SQL condition)
        verification_status || null, verification_status || null  // Verification status filter (duplicated for SQL condition)
      );
    } else {
      // Use optimized query with just type and verification filters
      curators = queries.getCuratorsFiltered.all(
        type || null, type || null,          // Profile type filter (duplicated for SQL condition)
        verification_status || null, verification_status || null  // Verification status filter (duplicated for SQL condition)
      );
    }
    
    const shouldIncludeDemo = req.user?.is_demo || req.user?.role === 'admin' || req.user?.role === 'super_admin';
    if (shouldIncludeDemo) {
      const db = getDatabase();
      const demoRows = db.prepare('SELECT * FROM curators WHERE is_demo = 1').all();
      const existingIds = new Set(curators.map((curator) => curator.id));
      const searchLower = search ? String(search).toLowerCase() : null;

      demoRows.forEach((row) => {
        if (existingIds.has(row.id)) return;
        if (type && row.profile_type !== type) return;
        if (verification_status && row.verification_status !== verification_status) return;
        if (searchLower) {
          const haystack = `${row.name || ''} ${row.bio_short || ''} ${row.location || ''}`.toLowerCase();
          if (!haystack.includes(searchLower)) return;
        }
        curators.push(row);
        existingIds.add(row.id);
      });
    }

    // Process JSON fields
    const metaPixelMap = getActiveMetaPixelMap();
    const processedCurators = curators.map((curator) => {
      const metaPixelId = metaPixelMap.get(Number(curator.id)) || null;
      return processCuratorResponse({ ...curator, meta_pixel_id: metaPixelId });
    });
    const demoCuratorIds = getDemoCuratorIdSet();
    const filteredCurators = filterDemoCurators(processedCurators, demoCuratorIds, req.user);
    
    res.json({
      success: true,
      data: filteredCurators,
      count: filteredCurators.length,
      total: filteredCurators.length
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching curators', error);
    res.status(500).json({ error: 'Failed to fetch curators' });
  }
});

// GET /api/v1/curators/:id - Get curator by ID
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const queries = getQueries();
    const curatorId = parseInt(req.params.id, 10);
    
    if (isNaN(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator ID' });
    }
    
    const curator = queries.getCuratorById.get(curatorId);
    
    if (!curator) {
      return res.status(404).json({ error: 'Curator not found' });
    }
    
    if (curator?.is_demo && !canViewDemoCurator(req.user, curator.id)) {
      return res.status(404).json({ error: 'Curator not found' });
    }

    // Get curator's playlists
    const playlists = queries.getCuratorPlaylists.all(curatorId);
    
    // Get curator's releases and shows
    const releases = queries.getCuratorReleases ? queries.getCuratorReleases.all(curatorId) : [];
    const visibleReleases = canViewUnpublishedReleases(req.user, curatorId)
      ? releases
      : releases.filter(release => release.is_published);
    const showsRaw = queries.getCuratorShows ? queries.getCuratorShows.all(curatorId) : [];
    
    // Process shows to include guests array
    const shows = showsRaw.map(show => ({
      ...show,
      guests: show.guest_names ? show.guest_names.split(',').filter(name => name.trim()) : [],
      guest_names: undefined // Remove the raw field
    }));
    
    const metaPixelId = getActiveMetaPixelId(curator.id);

    res.json({
      success: true,
      data: {
        curator: processCuratorResponse({ ...curator, meta_pixel_id: metaPixelId }),
        playlists: playlists,
        upcomingReleases: visibleReleases,
        upcomingShows: shows
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching curator', error);
    res.status(500).json({ error: 'Failed to fetch curator' });
  }
});

// GET /api/v1/curators/by-name/:name - Get curator by name (for public profile pages)
router.get('/by-name/:name', optionalAuth, async (req, res) => {
  const {
    rawName,
    rawDecodedName,
    normalizedName,
    decodePasses
  } = normalizeCuratorNameParam(req.params.name);
  const logName = normalizedName || rawDecodedName || rawName;
  
  try {
    logger.curatorOperation('FETCH_BY_NAME_START', logName, {
      rawName,
      normalizedName,
      decodePasses
    });
    
    const queries = getQueries();

    const queryCandidates = [normalizedName];
    if (rawDecodedName && rawDecodedName !== normalizedName) {
      queryCandidates.push(rawDecodedName);
    }

    // Query normalized value first, then retry with a single decoded raw value
    let curator = null;
    let matchedName = null;
    const attemptedNames = [];
    for (const candidate of queryCandidates) {
      const trimmed = String(candidate || '').trim();
      if (!trimmed || attemptedNames.includes(trimmed)) {
        continue;
      }
      attemptedNames.push(trimmed);
      logger.debug('CURATOR_API', `Querying database for curator: ${trimmed}`);
      curator = queries.getCuratorByName.get(trimmed);
      if (curator) {
        matchedName = trimmed;
        break;
      }
    }

    logger.curatorOperation('DB_QUERY_RESULT', logName, {
      rawName,
      normalizedName,
      decodePasses,
      attemptedNames,
      matchedName,
      found: !!curator,
      visibility: curator?.profile_visibility,
      id: curator?.id
    });
    
    if (!curator) {
      logger.curatorError('FETCH_BY_NAME', logName, new Error('Curator not found in database'), {
        rawName,
        normalizedName,
        decodePasses,
        attemptedNames
      });
      return res.status(404).json({ error: 'Curator not found' });
    }
    
    const isDemoCurator = !!curator?.is_demo;
    const canViewDemo = isDemoCurator && canViewDemoCurator(req.user, curator.id);

    if (curator.profile_visibility === 'private' && !canViewDemo) {
      logger.curatorError('FETCH_BY_NAME', logName, new Error('Profile is private'));
      return res.status(404).json({ error: 'Curator not found' });
    }

    if (isDemoCurator && !canViewDemo) {
      logger.curatorError('FETCH_BY_NAME', logName, new Error('Profile is demo restricted'));
      return res.status(404).json({ error: 'Curator not found' });
    }
    
    // Get curator's playlists
    logger.debug('CURATOR_API', `Fetching playlists for curator ${logName} (ID: ${curator.id})`);
    const playlists = queries.getCuratorPlaylists.all(curator.id);
    
    logger.curatorOperation('PLAYLISTS_FETCHED', logName, {
      playlistCount: playlists.length,
      playlistIds: playlists.map(p => p.id)
    });
    
    // Get curator's releases and shows
    const releases = queries.getCuratorReleases ? queries.getCuratorReleases.all(curator.id) : [];
    const visibleReleases = canViewUnpublishedReleases(req.user, curator.id)
      ? releases
      : releases.filter(release => release.is_published);
    const showsRaw = queries.getCuratorShows ? queries.getCuratorShows.all(curator.id) : [];
    
    // Process shows to include guests array
    const shows = showsRaw.map(show => ({
      ...show,
      guests: show.guest_names ? show.guest_names.split(',').filter(name => name.trim()) : [],
      guest_names: undefined // Remove the raw field
    }));
    
    logger.debug('CURATOR_API', `Fetched ${visibleReleases.length} releases and ${shows.length} shows`);
    
    // Process curator response
    const metaPixelId = getActiveMetaPixelId(curator.id);
    const processedCurator = processCuratorResponse({ ...curator, meta_pixel_id: metaPixelId });
    
    logger.curatorOperation('PROCESSING_COMPLETE', logName, {
      socialLinksRaw: curator.social_links,
      socialLinksProcessed: processedCurator.social_links,
      hasSocialLinks: !!processedCurator.social_links?.length,
      hasExternalLinks: !!processedCurator.external_links?.length,
      hasProfileImage: !!processedCurator.profile_image
    });
    
    const responseData = {
      success: true,
      data: {
        curator: processedCurator,
        playlists: playlists,
        upcomingReleases: visibleReleases,
        upcomingShows: shows
      }
    };
    
    logger.curatorOperation('FETCH_BY_NAME_SUCCESS', logName, {
      responseSize: JSON.stringify(responseData).length 
    });
    
    res.json(responseData);
    
  } catch (error) {
    logger.curatorError('FETCH_BY_NAME', logName, error, {
      stack: error.stack,
      rawName,
      normalizedName,
      decodePasses,
      params: req.params,
      query: req.query
    });
    res.status(500).json({ error: 'Failed to fetch curator' });
  }
});

// POST /api/v1/curators - Create new curator (admin only)
router.post('/', authMiddleware, validateCSRFToken, requireAnyRole(['admin']), upload.fields([
  { name: 'profile_image', maxCount: 1 }
]), async (req, res) => {
  try {
    const queries = getQueries();
    const curatorData = sanitizeCuratorData(req.body);
    if (req.body.tester === undefined) {
      curatorData.tester = existingCurator.tester ? 1 : 0;
    }
    
    if (!curatorData.name) {
      return res.status(400).json({ error: 'Curator name is required' });
    }
    
    // Check for duplicate name
    const existingCurator = queries.getCuratorByName.get(curatorData.name);
    if (existingCurator) {
      return res.status(409).json({ error: 'Curator with this name already exists' });
    }
    
    // Process uploaded images
    if (req.files?.profile_image?.[0]) {
      const timestamp = Date.now();
      const filename = `profile-${timestamp}`;
      curatorData.profile_image = await processAndSaveImage(
        req.files.profile_image[0].buffer, 
        filename, 
        'profile'
      );
    }
    
    // Insert curator
    const result = queries.insertCurator.run(
      curatorData.name,
      curatorData.type,
      curatorData.profile_type,
      curatorData.tester || 0,
      curatorData.bio,
      curatorData.bio_short,
      curatorData.profile_image,
      curatorData.location,
      curatorData.website_url,
      curatorData.contact_email,
      curatorData.spotify_url,
      curatorData.apple_url,
      curatorData.tidal_url,
      curatorData.bandcamp_url,
      curatorData.social_links,
      curatorData.external_links,
      curatorData.verification_status,
      curatorData.profile_visibility,
      curatorData.upcoming_releases_enabled,
      curatorData.upcoming_shows_enabled,
      curatorData.dsp_implementation_status,
      curatorData.custom_fields
    );
    
    // Fetch the created curator
    const newCurator = queries.getCuratorById.get(result.lastInsertRowid);
    
    res.status(201).json({
      success: true,
      data: {
        curator: processCuratorResponse(newCurator)
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error creating curator', error);
    res.status(500).json({ error: 'Failed to create curator' });
  }
});

// PUT /api/v1/curators/:id - Update curator (admin only)
router.put('/:id', authMiddleware, validateCSRFToken, requireAnyRole(['admin']), upload.fields([
  { name: 'profile_image', maxCount: 1 }
]), async (req, res) => {
  try {
    const queries = getQueries();
    const curatorId = parseInt(req.params.id, 10);
    
    if (isNaN(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator ID' });
    }
    
    const existingCurator = queries.getCuratorById.get(curatorId);
    if (!existingCurator) {
      return res.status(404).json({ error: 'Curator not found' });
    }
    
    const curatorData = sanitizeCuratorData(req.body);
    
    // Keep existing images if no new ones uploaded
    curatorData.profile_image = existingCurator.profile_image;
    
    // Process new uploaded images
    if (req.files?.profile_image?.[0]) {
      const timestamp = Date.now();
      const filename = `profile-${timestamp}`;
      curatorData.profile_image = await processAndSaveImage(
        req.files.profile_image[0].buffer, 
        filename, 
        'profile'
      );
    }
    
    // Update curator
    queries.updateCurator.run(
      curatorData.name,
      curatorData.type,
      curatorData.profile_type,
      curatorData.tester,
      curatorData.spotify_oauth_approved,
      curatorData.youtube_oauth_approved,
      curatorData.bio,
      curatorData.bio_short,
      curatorData.profile_image,
      curatorData.location,
      curatorData.website_url,
      curatorData.contact_email,
      curatorData.spotify_url,
      curatorData.apple_url,
      curatorData.tidal_url,
      curatorData.bandcamp_url,
      curatorData.social_links,
      curatorData.external_links,
      curatorData.verification_status,
      curatorData.profile_visibility,
      curatorData.upcoming_releases_enabled,
      curatorData.upcoming_shows_enabled,
      curatorData.dsp_implementation_status,
      curatorData.custom_fields,
      curatorId
    );
    
    // Fetch updated curator
    const updatedCurator = queries.getCuratorById.get(curatorId);

    // Propagate name/type changes to playlists (keeps public display and URLs in sync)
    try {
      const db = (await import('../database/db.js')).getDatabase();
      if (curatorData.name && curatorData.name !== existingCurator.name) {
        db.prepare('UPDATE playlists SET curator_name = ? WHERE curator_id = ?').run(curatorData.name, curatorId);
      }
      const nextPlaylistType = curatorData.profile_type || curatorData.type;
      const previousPlaylistType = existingCurator.profile_type || existingCurator.type;
      if (nextPlaylistType && nextPlaylistType !== previousPlaylistType) {
        db.prepare('UPDATE playlists SET curator_type = ? WHERE curator_id = ?').run(nextPlaylistType, curatorId);
      }
    } catch (e) {
      logger.warn('CURATOR', 'Failed to propagate curator fields to playlists', { error: e.message });
    }

    const curatorPlaylists = queries.getCuratorPlaylists.all(curatorId);
    invalidateCuratorPlaylists(curatorId, curatorPlaylists.map((playlist) => playlist.id));
    
    res.json({
      success: true,
      data: {
        curator: processCuratorResponse(updatedCurator)
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error updating curator', error);
    res.status(500).json({ error: 'Failed to update curator' });
  }
});

// PATCH /api/v1/curators/:id/oauth-approval - Quick toggle for OAuth approval (admin only)
router.patch('/:id/oauth-approval', authMiddleware, validateCSRFToken, requireAnyRole(['admin']), async (req, res) => {
  try {
    const curatorId = parseInt(req.params.id, 10);
    if (isNaN(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator ID' });
    }

    const { platform, approved } = req.body;
    if (!['spotify', 'youtube'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform. Must be "spotify" or "youtube".' });
    }

    const approvedValue = approved === true || approved === 'true' || approved === 1 || approved === '1' ? 1 : 0;
    const column = platform === 'spotify' ? 'spotify_oauth_approved' : 'youtube_oauth_approved';

    const db = (await import('../database/db.js')).getDatabase();
    const stmt = db.prepare(`UPDATE curators SET ${column} = ? WHERE id = ?`);
    const result = stmt.run(approvedValue, curatorId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Curator not found' });
    }

    logger.info('CURATOR', `Updated ${column} for curator`, { curatorId, approved: approvedValue });

    res.json({
      success: true,
      data: { curatorId, platform, approved: approvedValue === 1 }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error updating OAuth approval', error);
    res.status(500).json({ error: 'Failed to update OAuth approval' });
  }
});

// DELETE /api/v1/curators/:id - Delete curator (also removes linked curator user accounts) (admin only)
router.delete('/:id', authMiddleware, validateCSRFToken, requireAnyRole(['admin']), async (req, res) => {
  try {
    const queries = getQueries();
    const curatorId = parseInt(req.params.id, 10);

    if (isNaN(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator ID' });
    }

    const existingCurator = queries.getCuratorById.get(curatorId);
    if (!existingCurator) {
      return res.status(404).json({ error: 'Curator not found' });
    }

    // Get curator playlists for logging
    const curatorPlaylists = queries.getCuratorPlaylists.all(curatorId);
    const playlistCount = curatorPlaylists.length;

    // Wrap all cascade delete operations in a database transaction for atomicity
    const db = (await import('../database/db.js')).getDatabase();

    try {
      // Begin transaction
      db.prepare('BEGIN TRANSACTION').run();

      // 1. Cascade delete: remove all associated playlists
      if (playlistCount > 0) {
        const deletePlaylistsStmt = db.prepare('DELETE FROM playlists WHERE curator_id = ?');
        deletePlaylistsStmt.run(curatorId);
        logger.info('CURATOR', 'Cascade deleted playlists for curator', { curatorId, playlistCount });
      }

      // 2. Clean up curator_referrals foreign keys before deleting admin_users
      // This prevents FOREIGN KEY constraint failures
      queries.nullifyCuratorReferralsByAdminUserId.run(curatorId);
      queries.nullifyCuratorReferralsUsedByAdminUserId.run(curatorId);
      logger.info('CURATOR', 'Cleaned up curator_referrals for curator', { curatorId });

      // 3. Delete linked admin user accounts for this curator (role: curator)
      // This MUST succeed before curator deletion to prevent orphaned admin_users
      queries.deleteAdminUsersByCuratorId.run(curatorId);
      logger.info('CURATOR', 'Deleted admin user accounts for curator', { curatorId });

      // 4. Delete curator record
      queries.deleteCurator.run(curatorId);

      // Commit transaction - all operations succeeded
      db.prepare('COMMIT').run();

      logger.info('CURATOR', 'Successfully deleted curator and all associated data', { curatorId });
      invalidateCuratorPlaylists(curatorId, curatorPlaylists.map((playlist) => playlist.id));
      res.json({ success: true, message: 'Curator deleted successfully' });

    } catch (deleteError) {
      // Rollback transaction on any error to maintain database consistency
      try {
        db.prepare('ROLLBACK').run();
        logger.warn('CURATOR', 'Transaction rolled back due to error', { curatorId });
      } catch (rollbackError) {
        logger.error('CURATOR', 'Failed to rollback transaction', { curatorId, error: rollbackError.message });
      }

      logger.error('CURATOR', 'Failed to delete curator within transaction', {
        curatorId,
        error: deleteError.message,
        stack: deleteError.stack
      });

      return res.status(500).json({
        error: 'Failed to delete curator',
        message: 'Database transaction failed. No changes were made.',
        details: deleteError.message
      });
    }

  } catch (error) {
    logger.error('API_ERROR', 'Error deleting curator', error);
    res.status(500).json({ error: 'Failed to delete curator' });
  }
});

// PUT /api/v1/curators/:id/section-config - Update section configuration (admin only)
router.put('/:id/section-config', authMiddleware, validateCSRFToken, requireAnyRole(['admin']), async (req, res) => {
  try {
    const curatorId = parseInt(req.params.id, 10);

    if (isNaN(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator ID' });
    }

    const queries = getQueries();

    const existingCurator = queries.getCuratorById.get(curatorId);
    if (!existingCurator) {
      return res.status(404).json({ error: 'Curator not found' });
    }

    const {
      upcomingReleasesEnabled = true,
      upcomingReleasesDisplayOrder = 1,
      upcomingReleasesOpenOnLoad = true,
      upcomingShowsEnabled = true,
      upcomingShowsDisplayOrder = 2,
      upcomingShowsOpenOnLoad = false
    } = req.body;

    // Validate data types
    if (typeof upcomingReleasesEnabled !== 'boolean' ||
        typeof upcomingShowsEnabled !== 'boolean' ||
        typeof upcomingReleasesOpenOnLoad !== 'boolean' ||
        typeof upcomingShowsOpenOnLoad !== 'boolean') {
      return res.status(400).json({ error: 'Boolean fields must be true or false' });
    }

    if (typeof upcomingReleasesDisplayOrder !== 'number' ||
        typeof upcomingShowsDisplayOrder !== 'number' ||
        upcomingReleasesDisplayOrder < 0 ||
        upcomingShowsDisplayOrder < 0) {
      return res.status(400).json({ error: 'Display order must be non-negative numbers' });
    }

    // Update section configuration
    queries.updateCuratorSectionConfig.run(
      upcomingReleasesEnabled ? 1 : 0,
      upcomingReleasesDisplayOrder,
      upcomingReleasesOpenOnLoad ? 1 : 0,
      upcomingShowsEnabled ? 1 : 0,
      upcomingShowsDisplayOrder,
      upcomingShowsOpenOnLoad ? 1 : 0,
      curatorId
    );

    // Fetch updated curator
    const updatedCurator = queries.getCuratorById.get(curatorId);

    res.json({
      success: true,
      data: {
        curator: processCuratorResponse(updatedCurator)
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error updating section configuration', error);
    res.status(500).json({ error: 'Failed to update section configuration' });
  }
});

// GET /api/v1/curators/:id/dsp-accounts - Get curator's DSP account preferences (admin only)
router.get('/:id/dsp-accounts', authMiddleware, requireAnyRole(['admin']), async (req, res) => {
  try {
    const curatorId = parseInt(req.params.id, 10);

    if (isNaN(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator ID' });
    }

    const queries = getQueries();
    const existingCurator = queries.getCuratorById.get(curatorId);

    if (!existingCurator) {
      return res.status(404).json({ error: 'Curator not found' });
    }

    const accounts = queries.getCuratorDSPAccounts.all(curatorId);

    // Transform to object keyed by platform for easier frontend consumption
    const accountsObj = {};
    accounts.forEach(acc => {
      accountsObj[acc.platform] = {
        email: acc.email,
        uses_flowerpil_account: Boolean(acc.uses_flowerpil_account),
        metadata: acc.metadata ? JSON.parse(acc.metadata) : null
      };
    });

    res.json({
      success: true,
      data: accountsObj
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching DSP accounts', error);
    res.status(500).json({ error: 'Failed to fetch DSP accounts' });
  }
});

// PUT /api/v1/curators/:id/dsp-accounts - Update curator's DSP account preferences (admin only)
router.put('/:id/dsp-accounts', authMiddleware, validateCSRFToken, requireAnyRole(['admin']), async (req, res) => {
  try {
    const curatorId = parseInt(req.params.id, 10);

    if (isNaN(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator ID' });
    }

    const queries = getQueries();
    const existingCurator = queries.getCuratorById.get(curatorId);

    if (!existingCurator) {
      return res.status(404).json({ error: 'Curator not found' });
    }

    const { platform, email, uses_flowerpil_account, metadata } = req.body;

    // Validate platform
    const validPlatforms = ['spotify', 'apple', 'tidal'];
    if (!platform || !validPlatforms.includes(platform)) {
      return res.status(400).json({
        error: 'Invalid platform. Must be one of: spotify, apple, tidal'
      });
    }

    // Upsert DSP account
    queries.upsertCuratorDSPAccount.run(
      curatorId,
      platform,
      email || null,
      uses_flowerpil_account ? 1 : 0,
      metadata ? JSON.stringify(metadata) : null
    );

    // Return updated accounts
    const accounts = queries.getCuratorDSPAccounts.all(curatorId);
    const accountsObj = {};
    accounts.forEach(acc => {
      accountsObj[acc.platform] = {
        email: acc.email,
        uses_flowerpil_account: Boolean(acc.uses_flowerpil_account),
        metadata: acc.metadata ? JSON.parse(acc.metadata) : null
      };
    });

    res.json({
      success: true,
      data: accountsObj
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error updating DSP account', error);
    res.status(500).json({ error: 'Failed to update DSP account' });
  }
});

// DELETE /api/v1/curators/:id/dsp-accounts/:platform - Delete DSP account preference (admin only)
router.delete('/:id/dsp-accounts/:platform', authMiddleware, validateCSRFToken, requireAnyRole(['admin']), async (req, res) => {
  try {
    const curatorId = parseInt(req.params.id, 10);
    const platform = req.params.platform;

    if (isNaN(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator ID' });
    }

    const validPlatforms = ['spotify', 'apple', 'tidal'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({
        error: 'Invalid platform. Must be one of: spotify, apple, tidal'
      });
    }

    const queries = getQueries();
    queries.deleteCuratorDSPAccount.run(curatorId, platform);

    res.json({
      success: true,
      message: `DSP account for ${platform} deleted successfully`
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error deleting DSP account', error);
    res.status(500).json({ error: 'Failed to delete DSP account' });
  }
});

export default router;
export { normalizeCuratorNameParam };
