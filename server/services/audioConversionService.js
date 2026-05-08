const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { existsSync } = require('fs');

class AudioConversionService {
  constructor() {
    this.conversionQueue = new Map();
    this.browserFormatsDir = path.join(__dirname, '../../storage/uploads/audio/browser');
    this.ensureBrowserFormatsDir();
  }

  ensureBrowserFormatsDir() {
    try {
      const { mkdirSync } = require('fs');
      mkdirSync(this.browserFormatsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create browser formats directory:', error);
    }
  }

  /**
   * Generate browser-optimized M4A file path
   */
  getBrowserFormatPath(releaseId, originalFormat) {
    const filename = `release-${releaseId}-browser.m4a`;
    return path.join(this.browserFormatsDir, filename);
  }

  /**
   * Check if browser format exists and is newer than original
   */
  async isBrowserFormatCurrent(browserFormatPath, originalPath) {
    try {
      if (!existsSync(browserFormatPath)) {
        return false;
      }

      const [browserStats, originalStats] = await Promise.all([
        fs.stat(browserFormatPath),
        fs.stat(originalPath)
      ]);

      // Browser format is current if it's newer than original
      return browserStats.mtime >= originalStats.mtime;
    } catch (error) {
      console.error('Error checking browser format currency:', error);
      return false;
    }
  }

  /**
   * Convert audio file to M4A format optimized for browser playback
   */
  async convertToM4A(inputPath, outputPath, metadata = {}) {
    return new Promise((resolve, reject) => {
      const conversion = ffmpeg(inputPath)
        .audioCodec('aac')
        .audioBitrate('256k')
        .audioChannels(2)
        .format('mp4')
        .outputOptions([
          '-movflags', 'faststart', // Enable fast start for web streaming
          '-strict', 'experimental'
        ]);

      // Add metadata if provided
      if (metadata.title) conversion.outputOptions(['-metadata', `title=${metadata.title}`]);
      if (metadata.artist_name) conversion.outputOptions(['-metadata', `artist=${metadata.artist_name}`]);
      if (metadata.album) conversion.outputOptions(['-metadata', `album=${metadata.album}`]);
      if (metadata.genre) conversion.outputOptions(['-metadata', `genre=${metadata.genre}`]);
      if (metadata.year || metadata.release_date) {
        const year = metadata.year || new Date(metadata.release_date).getFullYear();
        conversion.outputOptions(['-metadata', `date=${year}`]);
      }

      conversion
        .on('start', (commandLine) => {
          console.log('Starting M4A conversion:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`M4A conversion progress: ${Math.round(progress.percent || 0)}%`);
        })
        .on('end', () => {
          console.log('M4A conversion completed:', outputPath);
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error('M4A conversion failed:', error);
          reject(error);
        })
        .save(outputPath);
    });
  }

  /**
   * Get cached browser format or convert on-demand
   */
  async getCachedConversion(releaseId, originalPath, metadata = {}) {
    try {
      const originalFormat = path.extname(originalPath).substring(1).toLowerCase();
      const browserFormatPath = this.getBrowserFormatPath(releaseId, originalFormat);

      // Check if browser format exists and is current
      const isCurrent = await this.isBrowserFormatCurrent(browserFormatPath, originalPath);
      
      if (isCurrent) {
        console.log('Using cached browser format:', browserFormatPath);
        return {
          success: true,
          path: browserFormatPath,
          cached: true,
          format: 'm4a'
        };
      }

      // Check if conversion is already in progress
      const queueKey = `release-${releaseId}`;
      if (this.conversionQueue.has(queueKey)) {
        console.log('Conversion already in progress for release:', releaseId);
        return {
          success: false,
          reason: 'conversion_in_progress',
          originalPath
        };
      }

      // Start new conversion
      this.conversionQueue.set(queueKey, Date.now());
      
      try {
        const convertedPath = await this.convertToM4A(originalPath, browserFormatPath, metadata);
        
        return {
          success: true,
          path: convertedPath,
          cached: false,
          format: 'm4a',
          originalFormat
        };
      } finally {
        this.conversionQueue.delete(queueKey);
      }

    } catch (error) {
      console.error('Error in getCachedConversion:', error);
      return {
        success: false,
        error: error.message,
        originalPath
      };
    }
  }

  /**
   * Schedule background conversion for a release
   */
  async scheduleConversion(releaseId, originalPath, metadata = {}, priority = 'normal') {
    const queueKey = `release-${releaseId}`;
    
    // Don't schedule if already in progress
    if (this.conversionQueue.has(queueKey)) {
      return {
        success: false,
        reason: 'already_queued'
      };
    }

    // Run conversion in background
    setImmediate(async () => {
      try {
        const result = await this.getCachedConversion(releaseId, originalPath, metadata);
        console.log(`Background conversion ${result.success ? 'completed' : 'failed'} for release ${releaseId}`);
      } catch (error) {
        console.error(`Background conversion error for release ${releaseId}:`, error);
      }
    });

    return {
      success: true,
      scheduled: true,
      releaseId,
      priority
    };
  }

  /**
   * Get conversion status for a release
   */
  getConversionStatus(releaseId) {
    const queueKey = `release-${releaseId}`;
    const inProgress = this.conversionQueue.has(queueKey);
    const startTime = this.conversionQueue.get(queueKey);

    return {
      releaseId,
      inProgress,
      startTime: startTime ? new Date(startTime) : null,
      duration: startTime ? Date.now() - startTime : null
    };
  }

  /**
   * Clean up old browser format files
   */
  async cleanupOldConversions(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days default
    try {
      const files = await fs.readdir(this.browserFormatsDir);
      const now = Date.now();
      let cleanedCount = 0;

      for (const file of files) {
        if (file.endsWith('.m4a')) {
          const filePath = path.join(this.browserFormatsDir, file);
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtime.getTime() > maxAge) {
            await fs.unlink(filePath);
            cleanedCount++;
            console.log('Cleaned up old conversion:', file);
          }
        }
      }

      return {
        success: true,
        cleanedCount,
        directory: this.browserFormatsDir
      };
    } catch (error) {
      console.error('Error during cleanup:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Create and export singleton instance
const audioConversionService = new AudioConversionService();

module.exports = {
  getCachedConversion: (...args) => audioConversionService.getCachedConversion(...args),
  scheduleConversion: (...args) => audioConversionService.scheduleConversion(...args),
  getConversionStatus: (...args) => audioConversionService.getConversionStatus(...args),
  cleanupOldConversions: (...args) => audioConversionService.cleanupOldConversions(...args),
  isBrowserFormatCurrent: (...args) => audioConversionService.isBrowserFormatCurrent(...args),
  getBrowserFormatPath: (...args) => audioConversionService.getBrowserFormatPath(...args),
  convertToM4A: (...args) => audioConversionService.convertToM4A(...args)
};