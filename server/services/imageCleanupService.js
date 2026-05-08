/**
 * Image Cleanup Service
 * Phase 3: Automated image cleanup and orphan detection
 *
 * Provides comprehensive image management including:
 * - Database scanning for referenced images
 * - Orphan detection (images not in database)
 * - Cleanup operations with dry-run support
 * - Format variant tracking
 */

import { getDatabase } from '../database/db.js';
import { deleteFromR2, extractR2Key, listR2Objects, batchDeleteFromR2 } from '../utils/r2Storage.js';
import logger from '../utils/logger.js';

export class ImageCleanupService {
  constructor() {
    this.db = getDatabase();

    // All database tables and columns that reference images
    this.imageReferences = {
      playlists: ['image'],
      tracks: ['artwork_url', 'album_artwork_url'],
      curators: ['profile_image'],
      bio_profiles: ['avatar', 'background_image'], // May be in JSON fields
      search_editorials: ['image_url']
    };
  }

  /**
   * Scan database for all referenced images
   * @returns {Promise<Set<string>>} Set of referenced image URLs
   */
  async scanDatabaseReferences() {
    const referencedUrls = new Set();

    for (const [table, columns] of Object.entries(this.imageReferences)) {
      for (const column of columns) {
        try {
          const rows = this.db.prepare(`
            SELECT DISTINCT ${column}
            FROM ${table}
            WHERE ${column} IS NOT NULL
            AND ${column} != ''
          `).all();

          rows.forEach(row => {
            const url = row[column];
            if (url) {
              referencedUrls.add(url);

              // Also add all size/format variants
              const variants = this.getImageVariants(url);
              variants.forEach(variant => referencedUrls.add(variant));
            }
          });
        } catch (error) {
          logger.warn(`Failed to scan ${table}.${column}: ${error.message}`);
        }
      }
    }

    // Handle JSON fields in bio_profiles (published_content, draft_content)
    try {
      const bioProfiles = this.db.prepare(`
        SELECT published_content, draft_content
        FROM bio_profiles
      `).all();

      bioProfiles.forEach(profile => {
        [profile.published_content, profile.draft_content].forEach(content => {
          if (content) {
            try {
              const data = JSON.parse(content);
              this.extractImagesFromJSON(data, referencedUrls);
            } catch (error) {
              // Silently skip invalid JSON
            }
          }
        });
      });
    } catch (error) {
      logger.warn(`Failed to scan bio_profiles JSON: ${error.message}`);
    }

    return referencedUrls;
  }

  /**
   * Extract image URLs from nested JSON structures
   * @param {any} obj - JSON object to scan
   * @param {Set<string>} urlSet - Set to add URLs to
   */
  extractImagesFromJSON(obj, urlSet) {
    if (typeof obj === 'string') {
      // Check if it looks like an image URL
      if (obj.startsWith('http') || obj.startsWith('/uploads')) {
        urlSet.add(obj);

        // Add variants
        const variants = this.getImageVariants(obj);
        variants.forEach(variant => urlSet.add(variant));
      }
    } else if (typeof obj === 'object' && obj !== null) {
      Object.values(obj).forEach(value => {
        this.extractImagesFromJSON(value, urlSet);
      });
    }
  }

  /**
   * Get all size and format variants for an image URL
   * @param {string} baseUrl - Base image URL
   * @returns {Array<string>} All variant URLs
   */
  getImageVariants(baseUrl) {
    const variants = [baseUrl];

    try {
      // Parse URL
      let url = baseUrl;
      if (baseUrl.startsWith('/uploads/')) {
        url = `https://images.flowerpil.io/${baseUrl.replace('/uploads/', '')}`;
      }

      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const lastDot = pathname.lastIndexOf('.');
      if (lastDot === -1) return variants;

      const ext = pathname.substring(lastDot);
      const baseWithoutExt = pathname.substring(0, lastDot);

      // Remove any existing size suffix
      const cleanBase = baseWithoutExt.replace(/_(large|medium|small|original|lg|md|sm)$/, '');

      // Generate all size and format combinations
      const sizes = ['large', 'medium', 'small', 'lg', 'md', 'sm'];
      const formats = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

      // Original + all combinations
      formats.forEach(format => {
        variants.push(`${urlObj.origin}${cleanBase}.${format}`);

        sizes.forEach(size => {
          variants.push(`${urlObj.origin}${cleanBase}_${size}.${format}`);
        });
      });

      return [...new Set(variants)]; // Remove duplicates
    } catch (error) {
      return variants;
    }
  }

  /**
   * Find orphaned images (images that exist in R2 but are not referenced in database)
   * Now with full R2 listing capability!
   *
   * @param {string} prefix - Optional prefix to filter R2 objects (e.g., "playlists/")
   * @returns {Promise<Object>} Report of orphaned images
   */
  async findOrphanedImages(prefix = '') {
    logger.info('Starting orphaned image scan with R2 listing...');

    try {
      // Get all referenced images from database
      const referencedUrls = await this.scanDatabaseReferences();
      const referencedKeys = new Set();

      referencedUrls.forEach(url => {
        const key = extractR2Key(url);
        if (key) referencedKeys.add(key);
      });

      logger.info(`Database references: ${referencedKeys.size} keys`);

      // List all objects in R2
      logger.info('Listing all R2 objects...');
      const allR2Keys = await listR2Objects(prefix);

      logger.info(`R2 objects found: ${allR2Keys.length} keys`);

      // Find orphans: keys in R2 but not in database
      const orphanedKeys = allR2Keys.filter(key => !referencedKeys.has(key));

      logger.info(`Orphaned images found: ${orphanedKeys.length}`);

      return {
        referencedCount: referencedKeys.size,
        r2TotalCount: allR2Keys.length,
        orphanedCount: orphanedKeys.length,
        orphanedKeys: orphanedKeys,
        orphanedSample: orphanedKeys.slice(0, 100), // First 100 for preview
        lastScanDate: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to find orphaned images:', error);
      throw error;
    }
  }

  /**
   * Cleanup orphaned images (batch deletion)
   * @param {boolean} dryRun - If true, only report what would be deleted
   * @param {string} prefix - Optional prefix to filter (e.g., "playlists/")
   * @param {number} limit - Maximum number of files to delete (safety limit)
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupOrphanedImages(dryRun = true, prefix = '', limit = null) {
    logger.info(`Starting orphaned image cleanup (dryRun: ${dryRun})...`);

    try {
      // Find orphans first
      const orphanReport = await this.findOrphanedImages(prefix);

      if (orphanReport.orphanedCount === 0) {
        logger.info('No orphaned images found');
        return {
          dryRun,
          deletedCount: 0,
          errors: [],
          message: 'No orphaned images found'
        };
      }

      let keysToDelete = orphanReport.orphanedKeys;

      // Apply limit if specified
      if (limit && limit > 0) {
        keysToDelete = keysToDelete.slice(0, limit);
        logger.info(`Limiting deletion to ${limit} files (out of ${orphanReport.orphanedCount})`);
      }

      if (dryRun) {
        logger.info(`Dry run: Would delete ${keysToDelete.length} orphaned images`);
        return {
          dryRun: true,
          wouldDelete: keysToDelete.length,
          totalOrphans: orphanReport.orphanedCount,
          sample: keysToDelete.slice(0, 50),
          message: `Dry run: ${keysToDelete.length} images would be deleted`
        };
      }

      // Actually delete (batch operation)
      logger.info(`Deleting ${keysToDelete.length} orphaned images...`);

      const deleteResults = await batchDeleteFromR2(keysToDelete);

      logger.info(`Deletion complete: ${deleteResults.deletedCount} deleted, ${deleteResults.errors.length} errors`);

      return {
        dryRun: false,
        deletedCount: deleteResults.deletedCount,
        errors: deleteResults.errors,
        totalOrphans: orphanReport.orphanedCount,
        message: `Deleted ${deleteResults.deletedCount} orphaned images`
      };
    } catch (error) {
      logger.error('Failed to cleanup orphaned images:', error);
      throw error;
    }
  }

  /**
   * Delete specific image and all its variants
   * @param {string} imageUrl - Image URL to delete
   * @returns {Promise<Object>} Deletion results
   */
  async deleteImageWithVariants(imageUrl) {
    const variants = this.getImageVariants(imageUrl);
    const results = {
      success: true,
      deletedCount: 0,
      deletedKeys: [],
      errors: []
    };

    for (const variantUrl of variants) {
      const key = extractR2Key(variantUrl);
      if (!key) continue;

      try {
        const deleted = await deleteFromR2(key);
        if (deleted) {
          results.deletedCount++;
          results.deletedKeys.push(key);
        }
      } catch (error) {
        results.success = false;
        results.errors.push(`Failed to delete ${key}: ${error.message}`);
      }
    }

    logger.info('Image deletion completed', {
      imageUrl,
      deletedCount: results.deletedCount,
      errors: results.errors.length
    });

    return results;
  }

  /**
   * Get statistics about image usage
   * @returns {Promise<Object>} Statistics
   */
  async getImageStatistics() {
    const stats = {
      totalReferencedImages: 0,
      byTable: {},
      byFormat: {
        jpeg: 0,
        png: 0,
        webp: 0,
        avif: 0,
        other: 0
      },
      timestamp: new Date().toISOString()
    };

    const referencedUrls = await this.scanDatabaseReferences();
    stats.totalReferencedImages = referencedUrls.size;

    // Count by table
    for (const [table, columns] of Object.entries(this.imageReferences)) {
      let tableCount = 0;

      for (const column of columns) {
        try {
          const rows = this.db.prepare(`
            SELECT COUNT(DISTINCT ${column}) as count
            FROM ${table}
            WHERE ${column} IS NOT NULL
            AND ${column} != ''
          `).get();

          tableCount += rows.count || 0;
        } catch (error) {
          // Silently skip errors
        }
      }

      stats.byTable[table] = tableCount;
    }

    // Count by format
    referencedUrls.forEach(url => {
      const ext = url.substring(url.lastIndexOf('.')).toLowerCase();

      if (ext === '.jpg' || ext === '.jpeg') {
        stats.byFormat.jpeg++;
      } else if (ext === '.png') {
        stats.byFormat.png++;
      } else if (ext === '.webp') {
        stats.byFormat.webp++;
      } else if (ext === '.avif') {
        stats.byFormat.avif++;
      } else {
        stats.byFormat.other++;
      }
    });

    return stats;
  }

  /**
   * Validate image references (check for broken URLs)
   * @param {number} limit - Max number of images to check
   * @returns {Promise<Object>} Validation report
   */
  async validateImageReferences(limit = 100) {
    const referencedUrls = await this.scanDatabaseReferences();
    const urlsToCheck = Array.from(referencedUrls).slice(0, limit);

    const report = {
      total: urlsToCheck.length,
      valid: 0,
      invalid: 0,
      invalidUrls: []
    };

    // Note: Actual URL validation would require HTTP requests
    // This is a placeholder for the structure

    for (const url of urlsToCheck) {
      // For now, just check if URL is well-formed
      try {
        if (url.startsWith('http') || url.startsWith('/uploads')) {
          report.valid++;
        } else {
          report.invalid++;
          report.invalidUrls.push(url);
        }
      } catch (error) {
        report.invalid++;
        report.invalidUrls.push(url);
      }
    }

    return report;
  }

  /**
   * Scheduled cleanup task (run daily)
   * @returns {Promise<Object>} Cleanup report
   */
  async scheduledCleanup() {
    try {
      logger.info('Running scheduled image cleanup...');

      const stats = await this.getImageStatistics();
      const orphanedReport = await this.findOrphanedImages();

      logger.info('Cleanup report', { stats, orphanedReport });

      // Only auto-delete if explicitly configured
      if (process.env.AUTO_CLEANUP_IMAGES === 'true') {
        logger.warn('Auto-cleanup is enabled but not implemented for safety');
        // await this.cleanupOrphanedImages(false);
      }

      return { stats, orphanedReport };
    } catch (error) {
      logger.error('Scheduled cleanup failed', error);
      throw error;
    }
  }
}

// Export singleton instance
const imageCleanupService = new ImageCleanupService();
export default imageCleanupService;
