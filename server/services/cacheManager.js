/**
 * Cache Management Service for pil.bio
 * Handles multi-layer cache invalidation and static generation
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateBioPageHTML, generateBioPageCSS, generateBioMetaTags, resolveThemeStyles } from '../utils/bioPageRenderer.js';
import { getQueries } from '../database/db.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache directories
const CACHE_DIR = path.join(process.cwd(), '.cache', 'bio-pages');
const STATIC_DIR = path.join(process.cwd(), 'public', 'bio-static');

/**
 * Initialize cache directories
 */
const initializeCacheDirectories = async () => {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.mkdir(STATIC_DIR, { recursive: true });
    logger.info('CACHE', 'Cache directories initialized', {
      cacheDir: CACHE_DIR,
      staticDir: STATIC_DIR
    });
  } catch (error) {
    logger.error('CACHE', 'Failed to initialize cache directories', error);
  }
};

/**
 * Generate cache key for bio page
 */
const generateCacheKey = (handle, version = 'current') => {
  return `bio-page-${handle}-${version}`;
};

/**
 * Generate static HTML file for bio page
 */
const generateStaticBioPage = async (bioProfile, featuredLinks = []) => {
  try {
    // Parse JSON fields
    const parsedProfile = {
      ...bioProfile,
      display_settings: bioProfile.display_settings ? JSON.parse(bioProfile.display_settings) : {},
      theme_settings: bioProfile.theme_settings ? JSON.parse(bioProfile.theme_settings) : {},
      seo_metadata: bioProfile.seo_metadata ? JSON.parse(bioProfile.seo_metadata) : {},
      published_content: bioProfile.published_content ? JSON.parse(bioProfile.published_content) : {},
      social_links: bioProfile.social_links ? JSON.parse(bioProfile.social_links) : [],
      external_links: bioProfile.external_links ? JSON.parse(bioProfile.external_links) : []
    };

    const parsedFeaturedLinks = featuredLinks.map(link => ({
      ...link,
      link_data: link.link_data ? JSON.parse(link.link_data) : {},
      display_settings: link.display_settings ? JSON.parse(link.display_settings) : {}
    }));

    // Generate CSS and meta tags
    const themeStyles = resolveThemeStyles(parsedProfile.theme_settings);
    const themeCSS = generateBioPageCSS(themeStyles);
    const metaTags = generateBioMetaTags(parsedProfile, bioProfile.handle);

    // Generate HTML
    const html = generateBioPageHTML({
      profile: parsedProfile,
      featuredLinks: parsedFeaturedLinks,
      themeCSS,
      metaTags,
      handle: bioProfile.handle
    });

    return html;
  } catch (error) {
    logger.error('CACHE', 'Failed to generate static bio page', {
      error: error.message,
      bioProfileId: bioProfile.id,
      handle: bioProfile.handle
    });
    throw error;
  }
};

/**
 * Cache static HTML for bio page
 */
export const cacheStaticBioPage = async (bioProfileId) => {
  try {
    const queries = getQueries();
    
    // Get bio profile data
    const bioProfile = queries.getPublishedBioProfile.get(bioProfileId);
    if (!bioProfile) {
      throw new Error(`Bio profile ${bioProfileId} not found or not published`);
    }

    // Get featured links
    const featuredLinks = queries.getBioFeaturedLinks.all(bioProfileId);

    // Generate static HTML
    const html = await generateStaticBioPage(bioProfile, featuredLinks);

    // Save to cache directory
    const cacheKey = generateCacheKey(bioProfile.handle);
    const cacheFilePath = path.join(CACHE_DIR, `${cacheKey}.html`);
    await fs.writeFile(cacheFilePath, html, 'utf8');

    // Save to static serve directory
    const staticFilePath = path.join(STATIC_DIR, `${bioProfile.handle}.html`);
    await fs.writeFile(staticFilePath, html, 'utf8');

    logger.info('CACHE', 'Bio page cached successfully', {
      bioProfileId,
      handle: bioProfile.handle,
      cacheKey,
      cacheSize: html.length
    });

    return {
      success: true,
      cacheKey,
      cacheFilePath,
      staticFilePath,
      size: html.length
    };
  } catch (error) {
    logger.error('CACHE', 'Failed to cache bio page', {
      error: error.message,
      bioProfileId
    });
    throw error;
  }
};

/**
 * Invalidate cache for bio page
 */
export const invalidateBioPageCache = async (bioProfileId, handle) => {
  try {
    const cacheKey = generateCacheKey(handle);
    const cacheFilePath = path.join(CACHE_DIR, `${cacheKey}.html`);
    const staticFilePath = path.join(STATIC_DIR, `${handle}.html`);

    // Remove cached files
    const removePromises = [
      fs.unlink(cacheFilePath).catch(() => {}), // Ignore if file doesn't exist
      fs.unlink(staticFilePath).catch(() => {})
    ];

    await Promise.all(removePromises);

    logger.info('CACHE', 'Bio page cache invalidated', {
      bioProfileId,
      handle,
      cacheKey
    });

    return {
      success: true,
      invalidatedFiles: [cacheFilePath, staticFilePath]
    };
  } catch (error) {
    logger.error('CACHE', 'Failed to invalidate bio page cache', {
      error: error.message,
      bioProfileId,
      handle
    });
    throw error;
  }
};

/**
 * Get cached bio page if exists and valid
 */
export const getCachedBioPage = async (handle) => {
  try {
    const cacheKey = generateCacheKey(handle);
    const cacheFilePath = path.join(CACHE_DIR, `${cacheKey}.html`);

    // Check if cached file exists
    try {
      const stats = await fs.stat(cacheFilePath);
      const html = await fs.readFile(cacheFilePath, 'utf8');

      logger.debug('CACHE', 'Bio page served from cache', {
        handle,
        cacheKey,
        cacheAge: Date.now() - stats.mtime.getTime(),
        size: html.length
      });

      return {
        success: true,
        html,
        cached: true,
        cacheAge: Date.now() - stats.mtime.getTime()
      };
    } catch (fileError) {
      // File doesn't exist or is unreadable
      return {
        success: false,
        cached: false,
        reason: 'Cache miss'
      };
    }
  } catch (error) {
    logger.error('CACHE', 'Failed to get cached bio page', {
      error: error.message,
      handle
    });
    return {
      success: false,
      cached: false,
      reason: error.message
    };
  }
};

/**
 * Warm cache for multiple bio pages
 */
export const warmBioPageCache = async (bioProfileIds = []) => {
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

    logger.info('CACHE', 'Cache warming completed', {
      total: results.length,
      successful,
      failed
    });

    return {
      success: true,
      results,
      summary: { total: results.length, successful, failed }
    };
  } catch (error) {
    logger.error('CACHE', 'Failed to warm bio page cache', error);
    throw error;
  }
};

/**
 * Clean up old cache entries
 */
export const cleanupCache = async (maxAgeMs = 7 * 24 * 60 * 60 * 1000) => { // 7 days default
  try {
    const files = await fs.readdir(CACHE_DIR);
    const now = Date.now();
    let cleanedCount = 0;

    for (const file of files) {
      if (!file.endsWith('.html')) continue;

      const filePath = path.join(CACHE_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtime.getTime() > maxAgeMs) {
        await fs.unlink(filePath);
        cleanedCount++;
      }
    }

    logger.info('CACHE', 'Cache cleanup completed', {
      filesChecked: files.length,
      filesRemoved: cleanedCount,
      maxAgeHours: maxAgeMs / (60 * 60 * 1000)
    });

    return {
      success: true,
      filesChecked: files.length,
      filesRemoved: cleanedCount
    };
  } catch (error) {
    logger.error('CACHE', 'Failed to cleanup cache', error);
    throw error;
  }
};

/**
 * Get cache statistics
 */
export const getCacheStats = async () => {
  try {
    await initializeCacheDirectories();
    
    const cacheFiles = await fs.readdir(CACHE_DIR);
    const staticFiles = await fs.readdir(STATIC_DIR);
    
    let totalCacheSize = 0;
    let totalStaticSize = 0;

    // Calculate cache directory size
    for (const file of cacheFiles.filter(f => f.endsWith('.html'))) {
      const stats = await fs.stat(path.join(CACHE_DIR, file));
      totalCacheSize += stats.size;
    }

    // Calculate static directory size
    for (const file of staticFiles.filter(f => f.endsWith('.html'))) {
      const stats = await fs.stat(path.join(STATIC_DIR, file));
      totalStaticSize += stats.size;
    }

    return {
      success: true,
      cache: {
        directory: CACHE_DIR,
        files: cacheFiles.filter(f => f.endsWith('.html')).length,
        totalSize: totalCacheSize
      },
      static: {
        directory: STATIC_DIR,
        files: staticFiles.filter(f => f.endsWith('.html')).length,
        totalSize: totalStaticSize
      },
      totalFiles: cacheFiles.length + staticFiles.length,
      totalSize: totalCacheSize + totalStaticSize
    };
  } catch (error) {
    logger.error('CACHE', 'Failed to get cache stats', error);
    throw error;
  }
};

// Initialize cache directories on module load
initializeCacheDirectories();

export default {
  cacheStaticBioPage,
  invalidateBioPageCache,
  getCachedBioPage,
  warmBioPageCache,
  cleanupCache,
  getCacheStats
};
