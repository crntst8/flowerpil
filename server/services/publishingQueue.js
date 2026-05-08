/**
 * Publishing Queue and Background Job Processing Service
 * Handles bio page publishing, cache generation, and workflow management
 */

import { getQueries } from '../database/db.js';
import { cacheStaticBioPage, invalidateBioPageCache } from './cacheManager.js';
import logger from '../utils/logger.js';

// In-memory job queue (for production, consider Redis or similar)
const jobQueue = [];
const processingJobs = new Map();
const completedJobs = new Map();

// Job types
const JOB_TYPES = {
  PUBLISH: 'publish',
  UNPUBLISH: 'unpublish', 
  CACHE_WARM: 'cache_warm',
  CACHE_INVALIDATE: 'cache_invalidate',
  VERSION_ROLLBACK: 'version_rollback'
};

// Job statuses
const JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRY: 'retry'
};

/**
 * Create a new job
 */
const createJob = (type, payload, options = {}) => {
  const job = {
    id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    payload,
    status: JOB_STATUS.PENDING,
    attempts: 0,
    maxAttempts: options.maxAttempts || 3,
    priority: options.priority || 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    error: null,
    result: null
  };

  return job;
};

/**
 * Add job to queue
 */
export const queueJob = (type, payload, options = {}) => {
  try {
    const job = createJob(type, payload, options);
    
    // Insert job in priority order
    const insertIndex = jobQueue.findIndex(j => j.priority > job.priority);
    if (insertIndex === -1) {
      jobQueue.push(job);
    } else {
      jobQueue.splice(insertIndex, 0, job);
    }

    logger.info('PUBLISHING_QUEUE', 'Job queued', {
      jobId: job.id,
      type: job.type,
      queueLength: jobQueue.length,
      payload: job.payload
    });

    // Process queue if not already processing
    processQueue();

    return job.id;
  } catch (error) {
    logger.error('PUBLISHING_QUEUE', 'Failed to queue job', {
      error: error.message,
      type,
      payload
    });
    throw error;
  }
};

/**
 * Process next job in queue
 */
const processQueue = async () => {
  // Don't start new processing if we're at capacity
  if (processingJobs.size >= 3) { // Max 3 concurrent jobs
    return;
  }

  const job = jobQueue.shift();
  if (!job) {
    return;
  }

  // Mark job as processing
  job.status = JOB_STATUS.PROCESSING;
  job.attempts++;
  job.updatedAt = new Date().toISOString();
  processingJobs.set(job.id, job);

  logger.info('PUBLISHING_QUEUE', 'Processing job', {
    jobId: job.id,
    type: job.type,
    attempt: job.attempts,
    processingCount: processingJobs.size
  });

  try {
    const result = await executeJob(job);
    
    // Mark job as completed
    job.status = JOB_STATUS.COMPLETED;
    job.result = result;
    job.updatedAt = new Date().toISOString();
    
    processingJobs.delete(job.id);
    completedJobs.set(job.id, job);

    logger.info('PUBLISHING_QUEUE', 'Job completed', {
      jobId: job.id,
      type: job.type,
      processingTime: Date.now() - new Date(job.updatedAt).getTime()
    });

  } catch (error) {
    job.error = error.message;
    job.updatedAt = new Date().toISOString();

    if (job.attempts >= job.maxAttempts) {
      // Mark as failed
      job.status = JOB_STATUS.FAILED;
      processingJobs.delete(job.id);
      completedJobs.set(job.id, job);

      logger.error('PUBLISHING_QUEUE', 'Job failed permanently', {
        jobId: job.id,
        type: job.type,
        attempts: job.attempts,
        error: error.message
      });
    } else {
      // Retry job
      job.status = JOB_STATUS.RETRY;
      processingJobs.delete(job.id);
      
      // Add back to queue with delay
      setTimeout(() => {
        jobQueue.unshift(job); // Add to front for retry
        processQueue();
      }, 5000 * job.attempts); // Exponential backoff

      logger.warn('PUBLISHING_QUEUE', 'Job failed, retrying', {
        jobId: job.id,
        type: job.type,
        attempts: job.attempts,
        error: error.message,
        retryIn: 5000 * job.attempts
      });
    }
  }

  // Continue processing queue
  if (jobQueue.length > 0) {
    setImmediate(() => processQueue());
  }
};

/**
 * Execute job based on type
 */
const executeJob = async (job) => {
  const { type, payload } = job;

  switch (type) {
    case JOB_TYPES.PUBLISH:
      return await executePublishJob(payload);
    
    case JOB_TYPES.UNPUBLISH:
      return await executeUnpublishJob(payload);
    
    case JOB_TYPES.CACHE_WARM:
      return await executeCacheWarmJob(payload);
    
    case JOB_TYPES.CACHE_INVALIDATE:
      return await executeCacheInvalidateJob(payload);
    
    case JOB_TYPES.VERSION_ROLLBACK:
      return await executeVersionRollbackJob(payload);
    
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
};

/**
 * Execute bio profile publish job
 */
const executePublishJob = async (payload) => {
  const { bioProfileId, userId, publishOptions = {} } = payload;
  const queries = getQueries();

  try {
    // Get bio profile
    const bioProfile = queries.getBioProfileById.get(bioProfileId);
    if (!bioProfile) {
      throw new Error(`Bio profile ${bioProfileId} not found`);
    }

    // Validate content before publishing
    if (!bioProfile.draft_content || bioProfile.draft_content === '{}') {
      throw new Error('Cannot publish bio profile with empty content');
    }

    // Create version snapshot before publishing
    const newVersionNumber = (bioProfile.version_number || 1) + 1;
    try {
      queries.insertBioVersion.run(
        bioProfileId,
        newVersionNumber,
        bioProfile.draft_content,
        publishOptions.changeMessage || `Published version ${newVersionNumber}`,
        userId
      );
    } catch (versionError) {
      if (versionError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        console.warn(`Bio version ${newVersionNumber} already exists for profile ${bioProfileId}, skipping version creation`);
      } else {
        console.error('Error creating bio version:', versionError);
        throw versionError;
      }
    }

    // Update version number
    queries.updateBioProfile.run(
      bioProfile.handle,
      bioProfile.display_settings,
      bioProfile.theme_settings,
      bioProfile.seo_metadata,
      bioProfile.draft_content,
      newVersionNumber,
      bioProfile.handle, // existingHandle
      bioProfile.handle, // newHandle
      bioProfileId
    );

    // Publish bio profile
    queries.publishBioProfile.run(bioProfileId);

    // Generate and cache static HTML
    const cacheResult = await cacheStaticBioPage(bioProfileId);

    return {
      success: true,
      bioProfileId,
      handle: bioProfile.handle,
      versionNumber: newVersionNumber,
      publishedAt: new Date().toISOString(),
      cacheGenerated: cacheResult.success,
      cacheSize: cacheResult.size
    };
  } catch (error) {
    logger.error('PUBLISHING_QUEUE', 'Publish job failed', {
      bioProfileId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Execute bio profile unpublish job
 */
const executeUnpublishJob = async (payload) => {
  const { bioProfileId, userId, reason } = payload;
  const queries = getQueries();

  try {
    // Get bio profile
    const bioProfile = queries.getBioProfileById.get(bioProfileId);
    if (!bioProfile) {
      throw new Error(`Bio profile ${bioProfileId} not found`);
    }

    // Unpublish bio profile
    queries.unpublishBioProfile.run(bioProfileId);

    // Invalidate cache
    await invalidateBioPageCache(bioProfileId, bioProfile.handle);

    return {
      success: true,
      bioProfileId,
      handle: bioProfile.handle,
      unpublishedAt: new Date().toISOString(),
      reason: reason || 'Manual unpublish',
      cacheInvalidated: true
    };
  } catch (error) {
    logger.error('PUBLISHING_QUEUE', 'Unpublish job failed', {
      bioProfileId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Execute cache warming job
 */
const executeCacheWarmJob = async (payload) => {
  const { bioProfileIds } = payload;

  try {
    const results = [];
    
    for (const bioProfileId of bioProfileIds) {
      try {
        const result = await cacheStaticBioPage(bioProfileId);
        results.push({ bioProfileId, success: true, ...result });
      } catch (error) {
        results.push({ 
          bioProfileId, 
          success: false, 
          error: error.message 
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;

    return {
      success: true,
      total: results.length,
      successful,
      failed,
      results
    };
  } catch (error) {
    logger.error('PUBLISHING_QUEUE', 'Cache warm job failed', {
      error: error.message,
      bioProfileIds
    });
    throw error;
  }
};

/**
 * Execute cache invalidation job
 */
const executeCacheInvalidateJob = async (payload) => {
  const { bioProfileId, handle } = payload;

  try {
    await invalidateBioPageCache(bioProfileId, handle);

    return {
      success: true,
      bioProfileId,
      handle,
      invalidatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error('PUBLISHING_QUEUE', 'Cache invalidate job failed', {
      bioProfileId,
      handle,
      error: error.message
    });
    throw error;
  }
};

/**
 * Execute version rollback job
 */
const executeVersionRollbackJob = async (payload) => {
  const { bioProfileId, versionId, userId } = payload;
  const queries = getQueries();

  try {
    // Get the version to rollback to
    const version = queries.getBioVersionById.get(versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    if (version.bio_profile_id !== bioProfileId) {
      throw new Error('Version does not belong to bio profile');
    }

    // Get current bio profile
    const bioProfile = queries.getBioProfileById.get(bioProfileId);
    if (!bioProfile) {
      throw new Error(`Bio profile ${bioProfileId} not found`);
    }

    // Create backup version of current state
    const backupVersionNumber = (bioProfile.version_number || 1) + 1;
    try {
      queries.insertBioVersion.run(
        bioProfileId,
        backupVersionNumber,
        bioProfile.draft_content,
        `Backup before rollback to version ${version.version_number}`,
        userId
      );
    } catch (versionError) {
      if (versionError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        console.warn(`Bio backup version ${backupVersionNumber} already exists for profile ${bioProfileId}, skipping backup version creation`);
      } else {
        console.error('Error creating bio backup version:', versionError);
        throw versionError;
      }
    }

    // Rollback to target version
    const rollbackVersionNumber = backupVersionNumber + 1;
    queries.updateBioProfile.run(
      bioProfile.handle,
      bioProfile.display_settings,
      bioProfile.theme_settings,
      bioProfile.seo_metadata,
      version.content_snapshot,
      rollbackVersionNumber,
      bioProfile.handle, // existingHandle
      bioProfile.handle, // newHandle
      bioProfileId
    );

    // Create rollback version entry
    try {
      queries.insertBioVersion.run(
        bioProfileId,
        rollbackVersionNumber,
        version.content_snapshot,
        `Rolled back to version ${version.version_number}`,
        userId
      );
    } catch (versionError) {
      if (versionError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        console.warn(`Bio rollback version ${rollbackVersionNumber} already exists for profile ${bioProfileId}, skipping rollback version creation`);
      } else {
        console.error('Error creating bio rollback version:', versionError);
        throw versionError;
      }
    }

    // If bio profile is published, regenerate cache
    let cacheRegenerated = false;
    if (bioProfile.is_published) {
      await cacheStaticBioPage(bioProfileId);
      cacheRegenerated = true;
    }

    return {
      success: true,
      bioProfileId,
      rolledBackFrom: bioProfile.version_number,
      rolledBackTo: version.version_number,
      newVersionNumber: rollbackVersionNumber,
      backupVersionNumber,
      cacheRegenerated
    };
  } catch (error) {
    logger.error('PUBLISHING_QUEUE', 'Version rollback job failed', {
      bioProfileId,
      versionId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Get job status
 */
export const getJobStatus = (jobId) => {
  // Check processing jobs
  if (processingJobs.has(jobId)) {
    return processingJobs.get(jobId);
  }

  // Check completed jobs
  if (completedJobs.has(jobId)) {
    return completedJobs.get(jobId);
  }

  // Check pending jobs
  const pendingJob = jobQueue.find(job => job.id === jobId);
  if (pendingJob) {
    return pendingJob;
  }

  return null;
};

/**
 * Get queue statistics
 */
export const getQueueStats = () => {
  return {
    pending: jobQueue.length,
    processing: processingJobs.size,
    completed: completedJobs.size,
    totalJobs: jobQueue.length + processingJobs.size + completedJobs.size,
    queueTypes: {
      pending: jobQueue.reduce((acc, job) => {
        acc[job.type] = (acc[job.type] || 0) + 1;
        return acc;
      }, {}),
      processing: Array.from(processingJobs.values()).reduce((acc, job) => {
        acc[job.type] = (acc[job.type] || 0) + 1;
        return acc;
      }, {})
    }
  };
};

/**
 * Clear completed jobs older than specified age
 */
export const cleanupCompletedJobs = (maxAgeMs = 24 * 60 * 60 * 1000) => { // 24 hours
  const cutoff = Date.now() - maxAgeMs;
  let cleaned = 0;

  for (const [jobId, job] of completedJobs.entries()) {
    if (new Date(job.updatedAt).getTime() < cutoff) {
      completedJobs.delete(jobId);
      cleaned++;
    }
  }

  logger.info('PUBLISHING_QUEUE', 'Completed jobs cleanup', {
    jobsCleaned: cleaned,
    remainingCompleted: completedJobs.size
  });

  return cleaned;
};

// Cleanup completed jobs every hour
setInterval(() => {
  cleanupCompletedJobs();
}, 60 * 60 * 1000);

// Export job types and status constants
export { JOB_TYPES, JOB_STATUS };

export default {
  queueJob,
  getJobStatus,
  getQueueStats,
  cleanupCompletedJobs,
  JOB_TYPES,
  JOB_STATUS
};