const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { existsSync, mkdirSync } = require('fs');

// Simple service implementation for testing
const AudioConversionService = {
  init() {
    this.conversionQueue = new Map();
    this.browserFormatsDir = path.join(__dirname, '../../storage/uploads/audio/browser');
    
    // Create directory synchronously
    try {
      mkdirSync(this.browserFormatsDir, { recursive: true });
      console.log('Browser formats directory created:', this.browserFormatsDir);
    } catch (error) {
      console.error('Failed to create browser formats directory:', error);
    }
    
    return this;
  },

  getBrowserFormatPath(releaseId, originalFormat) {
    const filename = `release-${releaseId}-browser.m4a`;
    return path.join(this.browserFormatsDir, filename);
  },

  async isBrowserFormatCurrent(browserFormatPath, originalPath) {
    try {
      if (!existsSync(browserFormatPath)) {
        return false;
      }

      const [browserStats, originalStats] = await Promise.all([
        fs.stat(browserFormatPath),
        fs.stat(originalPath)
      ]);

      return browserStats.mtime >= originalStats.mtime;
    } catch (error) {
      console.error('Error checking browser format currency:', error);
      return false;
    }
  },

  async convertToM4A(inputPath, outputPath, metadata = {}) {
    return new Promise((resolve, reject) => {
      const conversion = ffmpeg(inputPath)
        .audioCodec('aac')
        .audioBitrate('256k')
        .audioChannels(2)
        .format('mp4')
        .outputOptions([
          '-movflags', 'faststart',
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
  },

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
};

// Initialize and export
module.exports = AudioConversionService.init();