import express from 'express';
import { getQueries } from '../database/db.js';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { apiLoggingMiddleware } from '../middleware/logging.js';
import { authMiddleware } from '../middleware/auth.js';
import { uploadToR2 } from '../utils/r2Storage.js';
import {
  validateHandle,
  checkHandleAvailability,
  suggestHandles,
  sanitizeBioProfileData
} from '../utils/bioValidation.js';
import {
  deriveProfileLinks,
  getProfileLinksForDisplay,
  validateCuratorForProfileLinks
} from '../utils/profileLinksDerived.js';
import { queueJob, getJobStatus, getQueueStats, JOB_TYPES } from '../services/publishingQueue.js';
import { getCachedBioPage, getCacheStats } from '../services/cacheManager.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Apply logging middleware to all bio profile routes
router.use(apiLoggingMiddleware);

// Configure multer for image uploads (following curator pattern)
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

// Utility function to parse JSON fields (following curator pattern)
const parseJsonField = (field, defaultValue = []) => {
  if (!field) return defaultValue;
  if (typeof field === 'object') return field;
  if (typeof field === 'string') {
    try {
      let parsed = JSON.parse(field);
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      return parsed || defaultValue;
    } catch (error) {
      return defaultValue;
    }
  }
  return defaultValue;
};

// Process bio profile response for API output
const processBioProfileResponse = (bioProfile) => {
  if (!bioProfile) return null;
  
  return {
    ...bioProfile,
    display_settings: parseJsonField(bioProfile.display_settings, {}),
    theme_settings: parseJsonField(bioProfile.theme_settings, {}),
    seo_metadata: parseJsonField(bioProfile.seo_metadata, {}),
    draft_content: parseJsonField(bioProfile.draft_content, {}),
    published_content: parseJsonField(bioProfile.published_content, {}),
    is_published: Boolean(bioProfile.is_published),
    created_at: bioProfile.created_at,
    updated_at: bioProfile.updated_at,
    published_at: bioProfile.published_at
  };
};

// Image processing utility (following curator pattern) - Now uploads to R2
const processAndSaveBioImage = async (buffer, filename, type = 'content') => {
  const sizes = type === 'banner'
    ? [{ width: 1200, height: 400, suffix: '' }]  // Banner image
    : [{ width: 800, height: 600, suffix: '' }];  // Content image

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
    const r2Key = `bio-pages/${filename}${size.suffix}.jpg`;
    const imageUrl = await uploadToR2(processedBuffer, r2Key, 'image/jpeg');

    savedImages.push(imageUrl);
  }

  return savedImages[0]; // Return the main image URL
};

// ADMIN ENDPOINTS (JWT Protected)

// GET /api/v1/bio-profiles - Get all bio profiles for admin
router.get('/', authMiddleware, async (req, res) => {
  try {
    const queries = getQueries();
    const { published, curator_id } = req.query;
    
    let bioProfiles = queries.getAllBioProfiles.all();
    
    // Apply filters
    if (published !== undefined) {
      const isPublished = published === 'true' ? 1 : 0;
      bioProfiles = bioProfiles.filter(bp => bp.is_published === isPublished);
    }
    
    if (curator_id) {
      const curatorIdInt = parseInt(curator_id, 10);
      if (!isNaN(curatorIdInt)) {
        bioProfiles = bioProfiles.filter(bp => bp.curator_id === curatorIdInt);
      }
    }

    // If authenticated user is a curator, restrict to their own profiles regardless of query
    if (req.user?.curator_id) {
      const me = Number(req.user.curator_id);
      bioProfiles = bioProfiles.filter(bp => Number(bp.curator_id) === me);
    }
    
    // Process JSON fields
    const processedProfiles = bioProfiles.map(processBioProfileResponse);
    
    res.json({
      success: true,
      data: processedProfiles,
      count: processedProfiles.length
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching bio profiles', error);
    res.status(500).json({ error: 'Failed to fetch bio profiles' });
  }
});

// GET /api/v1/bio-profiles/handle/:handle - Get bio profile by handle for admin
router.get('/handle/:handle', authMiddleware, async (req, res) => {
  try {
    const queries = getQueries();
    const handle = (req.params.handle || '').toLowerCase().trim();

    if (!handle) {
      return res.status(400).json({ error: 'Handle is required' });
    }

    const handleValidation = validateHandle(handle);
    if (!handleValidation.isValid) {
      return res.status(400).json({ error: 'Invalid handle format' });
    }

    const bioProfile = queries.getBioProfileByHandleAdmin.get(handle);
    if (!bioProfile) {
      return res.status(404).json({ error: 'Bio profile not found' });
    }

    const access = ensureCuratorAccess(req, bioProfile.curator_id);
    if (!access.allowed) {
      return res.status(access.status).json(access.body);
    }

    const featuredLinks = queries.getBioFeaturedLinksAll.all(bioProfile.id);
    const versions = queries.getBioVersions.all(bioProfile.id);
    const analytics = queries.getBioViewStats.get(bioProfile.id);
    const curator = queries.getCuratorById.get(bioProfile.curator_id);
    const profileLinks = curator ? getProfileLinksForDisplay(curator) : [];

    res.json({
      success: true,
      data: {
        profile: processBioProfileResponse(bioProfile),
        featuredLinks: featuredLinks.map(link => ({
          ...link,
          link_data: parseJsonField(link.link_data, {}),
          display_settings: parseJsonField(link.display_settings, {}),
          is_enabled: Boolean(link.is_enabled)
        })),
        profileLinks,
        versions,
        analytics,
        curator
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching bio profile by handle', error);
    res.status(500).json({ error: 'Failed to fetch bio profile' });
  }
});

// GET /api/v1/bio-profiles/:id - Get bio profile by ID for admin
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const queries = getQueries();
    const bioProfileId = parseInt(req.params.id, 10);
    
    if (isNaN(bioProfileId)) {
      return res.status(400).json({ error: 'Invalid bio profile ID' });
    }
    
    const bioProfile = queries.getBioProfileById.get(bioProfileId);
    
    if (!bioProfile) {
      return res.status(404).json({ error: 'Bio profile not found' });
    }

    // Enforce curator ownership if applicable
    const access = ensureCuratorAccess(req, bioProfile.curator_id);
    if (!access.allowed) {
      return res.status(access.status).json(access.body);
    }
    
    // Get related data
    const featuredLinks = queries.getBioFeaturedLinksAll.all(bioProfileId);
    const versions = queries.getBioVersions.all(bioProfileId);
    const analytics = queries.getBioViewStats.get(bioProfileId);
    
    // Get curator data for profile links derivation
    const curator = queries.getCuratorById.get(bioProfile.curator_id);
    const profileLinks = curator ? getProfileLinksForDisplay(curator) : [];
    
    res.json({
      success: true,
      data: {
        profile: processBioProfileResponse(bioProfile),
        featuredLinks: featuredLinks.map(link => ({
          ...link,
          link_data: parseJsonField(link.link_data, {}),
          display_settings: parseJsonField(link.display_settings, {}),
          is_enabled: Boolean(link.is_enabled)
        })),
        profileLinks,
        versions,
        analytics,
        curator
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching bio profile', error);
    res.status(500).json({ error: 'Failed to fetch bio profile' });
  }
});

// POST /api/v1/bio-profiles - Create new bio profile
router.post('/', authMiddleware, upload.single('content_image'), async (req, res) => {
  try {
    const queries = getQueries();
    const bioProfileData = sanitizeBioProfileData(req.body);
    
    // Validate handle
    const handleCheck = await checkHandleAvailability(bioProfileData.handle, queries);
    if (!handleCheck.available) {
      return res.status(400).json({ 
        error: 'Handle not available',
        reason: handleCheck.reason,
        errors: handleCheck.errors || []
      });
    }
    
    bioProfileData.handle = handleCheck.handle;
    
    // Validate curator exists
    if (!bioProfileData.curator_id) {
      return res.status(400).json({ error: 'Curator ID is required' });
    }
    
    const curator = queries.getCuratorById.get(bioProfileData.curator_id);
    if (!curator) {
      return res.status(400).json({ error: 'Curator not found' });
    }

    // Enforce curator ownership if applicable
    const access = ensureCuratorAccess(req, bioProfileData.curator_id);
    if (!access.allowed) {
      return res.status(access.status).json(access.body);
    }
    
    // Process uploaded image
    let contentImagePath = null;
    if (req.file) {
      const timestamp = Date.now();
      const filename = `content-${timestamp}`;
      contentImagePath = await processAndSaveBioImage(
        req.file.buffer, 
        filename, 
        'content'
      );
    }
    
    // Add image to content data if uploaded
    if (contentImagePath && bioProfileData.draft_content) {
      const draftContent = parseJsonField(bioProfileData.draft_content, {});
      draftContent.contentImage = contentImagePath;
      bioProfileData.draft_content = JSON.stringify(draftContent);
    }
    
    // Insert bio profile
    const result = queries.insertBioProfile.run(
      bioProfileData.handle,
      bioProfileData.curator_id,
      bioProfileData.display_settings,
      bioProfileData.theme_settings,
      bioProfileData.seo_metadata,
      bioProfileData.draft_content,
      bioProfileData.is_published,
      bioProfileData.version_number
    );

    try {
      queries.assignHandleReservation.run(bioProfileData.handle);
    } catch (assignError) {
      logger.warn('HANDLE_RESERVATION', 'Failed to update handle reservation status', { error: assignError.message });
    }
    
    // Create initial version
    queries.insertBioVersion.run(
      result.lastInsertRowid,
      1,
      bioProfileData.draft_content || '{}',
      'Initial version',
      req.user.id
    );
    
    // Fetch the created bio profile
    const newBioProfile = queries.getBioProfileById.get(result.lastInsertRowid);
    
    res.status(201).json({
      success: true,
      data: {
        profile: processBioProfileResponse(newBioProfile)
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error creating bio profile', error);
    res.status(500).json({ error: 'Failed to create bio profile' });
  }
});

// PUT /api/v1/bio-profiles/:id - Update bio profile
router.put('/:id', authMiddleware, upload.single('content_image'), async (req, res) => {
  try {
    const queries = getQueries();
    const bioProfileId = parseInt(req.params.id, 10);
    
    if (isNaN(bioProfileId)) {
      return res.status(400).json({ error: 'Invalid bio profile ID' });
    }
    
    const existingBioProfile = queries.getBioProfileById.get(bioProfileId);
    if (!existingBioProfile) {
      return res.status(404).json({ error: 'Bio profile not found' });
    }

    // Enforce curator ownership if applicable
    const access = ensureCuratorAccess(req, existingBioProfile.curator_id);
    if (!access.allowed) {
      return res.status(access.status).json(access.body);
    }
    
    const bioProfileData = sanitizeBioProfileData(req.body);

    // Validate handle (excluding current profile)
    const handleCheck = await checkHandleAvailability(bioProfileData.handle, queries, bioProfileId);
    if (!handleCheck.available) {
      return res.status(400).json({ 
        error: 'Handle not available',
        reason: handleCheck.reason,
        errors: handleCheck.errors || []
      });
    }
    
    bioProfileData.handle = handleCheck.handle;

    const handleChanged = existingBioProfile.handle !== bioProfileData.handle;
    if (handleChanged) {
      const lastChangeRow = queries.getLastHandleChange.get(bioProfileId);
      const lastChangeAt = lastChangeRow?.last_handle_change_at ? new Date(lastChangeRow.last_handle_change_at) : null;

      if (lastChangeAt && !Number.isNaN(lastChangeAt.getTime())) {
        const nextAllowed = new Date(lastChangeAt.getTime() + 24 * 60 * 60 * 1000);
        if (Date.now() < nextAllowed.getTime()) {
          return res.status(429).json({
            error: 'Handle can only be updated once every 24 hours',
            nextAllowedAt: nextAllowed.toISOString()
          });
        }
      }
    }
    
    // Process uploaded image
    if (req.file) {
      const timestamp = Date.now();
      const filename = `content-${timestamp}`;
      const contentImagePath = await processAndSaveBioImage(
        req.file.buffer, 
        filename, 
        'content'
      );
      
      // Add image to content data
      const draftContent = parseJsonField(bioProfileData.draft_content, {});
      draftContent.contentImage = contentImagePath;
      bioProfileData.draft_content = JSON.stringify(draftContent);
    }
    
    // Increment version number
    const newVersionNumber = (existingBioProfile.version_number || 1) + 1;
    bioProfileData.version_number = newVersionNumber;
    
    // Update bio profile (curator_id is immutable via this route for curators)
    // Ensure all parameters are defined to prevent "Too few parameter values" error
    const updateParams = [
      bioProfileData.handle || '',
      bioProfileData.display_settings || '{}',
      bioProfileData.theme_settings || '{}',
      bioProfileData.seo_metadata || '{}',
      bioProfileData.draft_content || '{}',
      bioProfileData.version_number || 1,
      existingBioProfile.handle || '',
      bioProfileData.handle || '',
      bioProfileId
    ];

    // Validate we have exactly 9 parameters
    if (updateParams.length !== 9) {
      throw new Error(`Expected 9 parameters for updateBioProfile, got ${updateParams.length}`);
    }

    queries.updateBioProfile.run(...updateParams);

    if (handleChanged) {
      try {
        queries.assignHandleReservation.run(bioProfileData.handle);
      } catch (assignError) {
        logger.warn('HANDLE_RESERVATION', 'Failed to update handle reservation status', { error: assignError.message });
      }
    }
    
    // Create version snapshot (with error handling for duplicates)
    try {
      queries.insertBioVersion.run(
        bioProfileId,
        newVersionNumber,
        bioProfileData.draft_content || '{}',
        req.body.change_summary || `Updated to version ${newVersionNumber}`,
        req.user.id
      );
    } catch (versionError) {
      if (versionError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        logger.warn('BIO_VERSION', 'Bio version already exists, skipping version creation', { versionNumber: newVersionNumber, bioProfileId });
      } else {
        logger.error('BIO_VERSION', 'Error creating bio version', versionError);
        throw versionError;
      }
    }
    
    // Fetch updated bio profile
    const updatedBioProfile = queries.getBioProfileById.get(bioProfileId);
    
    res.json({
      success: true,
      data: {
        profile: processBioProfileResponse(updatedBioProfile)
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error updating bio profile', error);
    res.status(500).json({ error: 'Failed to update bio profile' });
  }
});

// POST /api/v1/bio-profiles/:id/publish - Publish bio profile
router.post('/:id/publish', authMiddleware, async (req, res) => {
  try {
    const bioProfileId = parseInt(req.params.id, 10);
    
    if (isNaN(bioProfileId)) {
      return res.status(400).json({ error: 'Invalid bio profile ID' });
    }
    
    const queries = getQueries();
    const existingBioProfile = queries.getBioProfileById.get(bioProfileId);
    if (!existingBioProfile) {
      return res.status(404).json({ error: 'Bio profile not found' });
    }

    // Enforce curator ownership if applicable
    const access = ensureCuratorAccess(req, existingBioProfile.curator_id);
    if (!access.allowed) {
      return res.status(access.status).json(access.body);
    }

    // Validate content before publishing
    if (!existingBioProfile.draft_content || existingBioProfile.draft_content === '{}') {
      return res.status(400).json({ 
        error: 'Cannot publish bio profile with empty content',
        validation: 'Bio profile must have content before publishing'
      });
    }

    // Extract publishing options from request body
    const { 
      changeMessage = 'Published via admin interface',
      scheduledPublishAt = null,
      priority = 5 
    } = req.body;

    // Queue publishing job
    const jobId = queueJob(JOB_TYPES.PUBLISH, {
      bioProfileId,
      userId: req.user.id,
      publishOptions: {
        changeMessage,
        scheduledPublishAt
      }
    }, {
      priority,
      maxAttempts: 3
    });
    
    res.json({
      success: true,
      message: 'Bio profile publishing job queued',
      data: {
        jobId,
        bioProfileId,
        handle: existingBioProfile.handle,
        status: 'queued',
        estimatedProcessingTime: '30-60 seconds'
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error queuing bio profile publishing', error);
    res.status(500).json({ error: 'Failed to queue bio profile publishing' });
  }
});

// POST /api/v1/bio-profiles/:id/unpublish - Unpublish bio profile
router.post('/:id/unpublish', authMiddleware, async (req, res) => {
  try {
    const bioProfileId = parseInt(req.params.id, 10);
    
    if (isNaN(bioProfileId)) {
      return res.status(400).json({ error: 'Invalid bio profile ID' });
    }
    
    const queries = getQueries();
    const existingBioProfile = queries.getBioProfileById.get(bioProfileId);
    if (!existingBioProfile) {
      return res.status(404).json({ error: 'Bio profile not found' });
    }

    // Enforce curator ownership if applicable
    const access = ensureCuratorAccess(req, existingBioProfile.curator_id);
    if (!access.allowed) {
      return res.status(access.status).json(access.body);
    }

    if (!existingBioProfile.is_published) {
      return res.status(400).json({ 
        error: 'Bio profile is not currently published',
        currentStatus: 'unpublished'
      });
    }

    // Extract unpublishing options
    const { reason = 'Manual unpublish via admin interface' } = req.body;

    // Queue unpublishing job
    const jobId = queueJob(JOB_TYPES.UNPUBLISH, {
      bioProfileId,
      userId: req.user.id,
      reason
    }, {
      priority: 8, // Higher priority for unpublishing
      maxAttempts: 2
    });
    
    res.json({
      success: true,
      message: 'Bio profile unpublishing job queued',
      data: {
        jobId,
        bioProfileId,
        handle: existingBioProfile.handle,
        status: 'queued',
        reason,
        estimatedProcessingTime: '10-30 seconds'
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error queuing bio profile unpublishing', error);
    res.status(500).json({ error: 'Failed to queue bio profile unpublishing' });
  }
});

// DELETE /api/v1/bio-profiles/:id - Delete bio profile
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const queries = getQueries();
    const bioProfileId = parseInt(req.params.id, 10);
    
    if (isNaN(bioProfileId)) {
      return res.status(400).json({ error: 'Invalid bio profile ID' });
    }
    
    const existingBioProfile = queries.getBioProfileById.get(bioProfileId);
    if (!existingBioProfile) {
      return res.status(404).json({ error: 'Bio profile not found' });
    }
    // Enforce curator ownership if applicable
    const access = ensureCuratorAccess(req, existingBioProfile.curator_id);
    if (!access.allowed) {
      return res.status(access.status).json(access.body);
    }
    
    // Delete bio profile (cascades to related tables)
    queries.deleteBioProfile.run(bioProfileId);
    
    res.json({ 
      success: true,
      message: 'Bio profile deleted successfully'
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error deleting bio profile', error);
    res.status(500).json({ error: 'Failed to delete bio profile' });
  }
});

// VERSION MANAGEMENT ENDPOINTS

// GET /api/v1/bio-profiles/:id/versions - Get version history
router.get('/:id/versions', authMiddleware, async (req, res) => {
  try {
    const queries = getQueries();
    const bioProfileId = parseInt(req.params.id, 10);
    
    if (isNaN(bioProfileId)) {
      return res.status(400).json({ error: 'Invalid bio profile ID' });
    }
    
    const bioProfile = queries.getBioProfileById.get(bioProfileId);
    if (!bioProfile) {
      return res.status(404).json({ error: 'Bio profile not found' });
    }
    
    const versions = queries.getBioVersions.all(bioProfileId);
    
    res.json({
      success: true,
      data: {
        bioProfileId,
        currentVersion: bioProfile.version_number,
        versions: versions.map(v => ({
          ...v,
          content_snapshot: v.content_snapshot ? JSON.parse(v.content_snapshot) : {}
        }))
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching bio profile versions', error);
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

// POST /api/v1/bio-profiles/:id/rollback/:versionId - Rollback to version
router.post('/:id/rollback/:versionId', authMiddleware, async (req, res) => {
  try {
    const bioProfileId = parseInt(req.params.id, 10);
    const versionId = parseInt(req.params.versionId, 10);
    
    if (isNaN(bioProfileId) || isNaN(versionId)) {
      return res.status(400).json({ error: 'Invalid bio profile ID or version ID' });
    }
    
    const queries = getQueries();
    const bioProfile = queries.getBioProfileById.get(bioProfileId);
    if (!bioProfile) {
      return res.status(404).json({ error: 'Bio profile not found' });
    }

    const version = queries.getBioVersionById.get(versionId);
    if (!version || version.bio_profile_id !== bioProfileId) {
      return res.status(404).json({ error: 'Version not found for this bio profile' });
    }

    // Queue rollback job
    const jobId = queueJob(JOB_TYPES.VERSION_ROLLBACK, {
      bioProfileId,
      versionId,
      userId: req.user.id
    }, {
      priority: 7,
      maxAttempts: 2
    });
    
    res.json({
      success: true,
      message: 'Version rollback job queued',
      data: {
        jobId,
        bioProfileId,
        rollbackToVersion: version.version_number,
        currentVersion: bioProfile.version_number,
        status: 'queued',
        estimatedProcessingTime: '15-45 seconds'
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error queuing version rollback', error);
    res.status(500).json({ error: 'Failed to queue version rollback' });
  }
});

// JOB STATUS AND QUEUE MANAGEMENT ENDPOINTS

// GET /api/v1/bio-profiles/jobs/:jobId - Get job status
router.get('/jobs/:jobId', authMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = getJobStatus(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      success: true,
      data: {
        job: {
          id: job.id,
          type: job.type,
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          result: job.result,
          error: job.error
        }
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching job status', error);
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

// GET /api/v1/bio-profiles/queue/stats - Get queue statistics
router.get('/queue/stats', authMiddleware, async (req, res) => {
  try {
    const queueStats = getQueueStats();
    const cacheStats = await getCacheStats();
    
    res.json({
      success: true,
      data: {
        queue: queueStats,
        cache: cacheStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching queue stats', error);
    res.status(500).json({ error: 'Failed to fetch queue statistics' });
  }
});

// POST /api/v1/bio-profiles/:id/preview - Get authenticated preview
router.get('/:id/preview', authMiddleware, async (req, res) => {
  try {
    const queries = getQueries();
    const bioProfileId = parseInt(req.params.id, 10);
    
    if (isNaN(bioProfileId)) {
      return res.status(400).json({ error: 'Invalid bio profile ID' });
    }
    
    const bioProfile = queries.getBioProfileById.get(bioProfileId);
    if (!bioProfile) {
      return res.status(404).json({ error: 'Bio profile not found' });
    }
    // Enforce curator ownership if applicable
    const access = ensureCuratorAccess(req, bioProfile.curator_id);
    if (!access.allowed) {
      return res.status(access.status).json(access.body);
    }

    // Get related data for preview
    const featuredLinks = queries.getBioFeaturedLinksAll.all(bioProfileId);
    const curator = queries.getCuratorById.get(bioProfile.curator_id);
    const profileLinks = curator ? getProfileLinksForDisplay(curator) : [];
    
    res.json({
      success: true,
      data: {
        profile: processBioProfileResponse(bioProfile),
        featuredLinks: featuredLinks.map(link => ({
          ...link,
          link_data: parseJsonField(link.link_data, {}),
          display_settings: parseJsonField(link.display_settings, {}),
          is_enabled: Boolean(link.is_enabled)
        })),
        profileLinks,
        curator: curator ? {
          id: curator.id,
          name: curator.name,
          profile_type: curator.profile_type,
          bio: curator.bio,
          bio_short: curator.bio_short,
          profile_image: curator.profile_image,
          location: curator.location
        } : null,
        previewUrl: `https://localhost:3000/bio-preview/${bioProfile.handle}?auth=${req.user.id}`,
        isPreview: true
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error generating bio profile preview', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// PUBLIC ENDPOINTS

// GET /api/v1/bio-profiles/public/:handle - Get published bio profile
router.get('/public/:handle', async (req, res) => {
  try {
    const queries = getQueries();
    const handle = req.params.handle.toLowerCase();
    
    // Validate handle format
    const handleValidation = validateHandle(handle);
    if (!handleValidation.isValid) {
      return res.status(400).json({ error: 'Invalid handle format' });
    }
    
    const bioProfile = queries.getBioProfileByHandle.get(handle);
    
    if (!bioProfile) {
      return res.status(404).json({ error: 'Bio profile not found' });
    }
    
    // Get related data
    const featuredLinks = queries.getBioFeaturedLinks.all(bioProfile.id);
    
    // Get curator data for profile links derivation
    const curator = queries.getCuratorById.get(bioProfile.curator_id);
    const profileLinks = curator ? getProfileLinksForDisplay(curator) : [];
    
    res.json({
      success: true,
      data: {
        profile: processBioProfileResponse(bioProfile),
        featuredLinks: featuredLinks.map(link => ({
          ...link,
          link_data: parseJsonField(link.link_data, {}),
          display_settings: parseJsonField(link.display_settings, {}),
          is_enabled: Boolean(link.is_enabled)
        })),
        profileLinks,
        curator: curator ? {
          id: curator.id,
          name: curator.name,
          profile_type: curator.profile_type,
          bio: curator.bio,
          bio_short: curator.bio_short,
          profile_image: curator.profile_image,
          location: curator.location
        } : null
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching public bio profile', error);
    res.status(500).json({ error: 'Failed to fetch bio profile' });
  }
});

// HANDLE MANAGEMENT ENDPOINTS

// GET /api/v1/bio-handles/check/:handle - Check handle availability
router.get('/check/:handle', async (req, res) => {
  try {
    const queries = getQueries();
    const handle = req.params.handle.toLowerCase();
    
    const availability = await checkHandleAvailability(handle, queries);
    
    res.json({
      success: true,
      handle: handle,
      available: availability.available,
      reason: availability.reason || null,
      errors: availability.errors || []
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error checking handle availability', error);
    res.status(500).json({ error: 'Failed to check handle availability' });
  }
});

// GET /api/v1/bio-handles/suggest/:partial - Suggest available handles
router.get('/suggest/:partial', async (req, res) => {
  try {
    const queries = getQueries();
    const partial = req.params.partial.toLowerCase();
    
    const suggestions = await suggestHandles(partial, queries);
    
    res.json({
      success: true,
      partial: partial,
      suggestions
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error generating handle suggestions', error);
    res.status(500).json({ error: 'Failed to generate handle suggestions' });
  }
});

export default router;
// Helper: ensure the authenticated curator can access/modify a given curator-owned resource
const ensureCuratorAccess = (req, resourceCuratorId) => {
  const userCuratorId = req.user?.curator_id || null;
  // If the authenticated user is bound to a curator, enforce ownership
  if (userCuratorId && Number(userCuratorId) !== Number(resourceCuratorId)) {
    return {
      allowed: false,
      status: 403,
      body: { error: 'Forbidden', message: 'You can only modify your own bio profile' }
    };
  }
  return { allowed: true };
};
