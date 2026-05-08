import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs, { mkdirSync } from 'fs';

class AudioConversionService {
  constructor() {
    this.conversionQueue = new Map();
    this.browserFormatsDir = path.join(process.cwd(), 'storage/uploads/audio/browser');
    this.ensureBrowserFormatsDir();
  }

  ensureBrowserFormatsDir() {
    try {
      mkdirSync(this.browserFormatsDir, { recursive: true });
      console.log('Browser formats directory ensured:', this.browserFormatsDir);
    } catch (error) {
      console.error('Failed to create browser formats directory:', error);
    }
  }

  getBrowserFormatPath(releaseId, originalFormat) {
    const filename = `release-${releaseId}-browser.m4a`;
    return path.join(this.browserFormatsDir, filename);
  }

  getDownloadFormatPath(releaseId, format) {
    const downloadsDir = path.join(process.cwd(), 'storage/uploads/audio/downloads');
    
    // Ensure downloads directory exists
    try {
      mkdirSync(downloadsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create downloads directory:', error);
    }
    
    const filename = `release-${releaseId}-download.${format}`;
    return path.join(downloadsDir, filename);
  }

  async isBrowserFormatCurrent(browserFormatPath, originalPath) {
    try {
      if (!fs.existsSync(browserFormatPath)) {
        return false;
      }

      const [browserStats, originalStats] = await Promise.all([
        fs.promises.stat(browserFormatPath),
        fs.promises.stat(originalPath)
      ]);

      return browserStats.mtime >= originalStats.mtime;
    } catch (error) {
      console.error('Error checking browser format currency:', error);
      return false;
    }
  }

  async convertToM4A(inputPath, outputPath, metadata = {}) {
    return this.convertAudio(inputPath, outputPath, 'm4a', metadata);
  }

  async convertToMP3(inputPath, outputPath, metadata = {}) {
    return this.convertAudio(inputPath, outputPath, 'mp3', metadata);
  }

  async convertAudio(inputPath, outputPath, format, metadata = {}) {
    return new Promise((resolve, reject) => {
      let conversion = ffmpeg(inputPath);

      // Configure based on output format
      if (format === 'm4a') {
        conversion = conversion
          .audioCodec('aac')
          .audioBitrate('256k')
          .audioChannels(2)
          .noVideo()
          .outputOptions([
            '-movflags', 'faststart',
            '-strict', 'experimental'
          ]);
      } else if (format === 'mp3') {
        conversion = conversion
          .audioCodec('libmp3lame')
          .audioBitrate('320k')
          .audioChannels(2)
          .noVideo()
          .outputOptions(['-id3v2_version', '4']);
      }

      // Add metadata if provided
      if (metadata.title) conversion.outputOptions(['-metadata', `title=${metadata.title}`]);
      if (metadata.artist_name) conversion.outputOptions(['-metadata', `artist=${metadata.artist_name}`]);
      if (metadata.album) conversion.outputOptions(['-metadata', `album=${metadata.album}`]);
      if (metadata.genre) conversion.outputOptions(['-metadata', `genre=${metadata.genre}`]);
      if (metadata.year || metadata.release_date) {
        const year = metadata.year || new Date(metadata.release_date).getFullYear();
        conversion.outputOptions(['-metadata', `date=${year}`]);
      }
      if (metadata.track_number) conversion.outputOptions(['-metadata', `track=${metadata.track_number}`]);
      if (metadata.total_tracks) conversion.outputOptions(['-metadata', `tracktotal=${metadata.total_tracks}`]);
      if (metadata.copyright) conversion.outputOptions(['-metadata', `copyright=${metadata.copyright}`]);
      if (metadata.composer) conversion.outputOptions(['-metadata', `composer=${metadata.composer}`]);
      if (metadata.publisher) conversion.outputOptions(['-metadata', `publisher=${metadata.publisher}`]);
      if (metadata.isrc) conversion.outputOptions(['-metadata', `ISRC=${metadata.isrc}`]);

      conversion
        .on('start', (commandLine) => {
          console.log(`Starting ${format.toUpperCase()} conversion:`, commandLine);
        })
        .on('progress', (progress) => {
          console.log(`${format.toUpperCase()} conversion progress: ${Math.round(progress.percent || 0)}%`);
        })
        .on('end', () => {
          console.log(`${format.toUpperCase()} conversion completed:`, outputPath);
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error(`${format.toUpperCase()} conversion failed:`, error);
          reject(error);
        })
        .save(outputPath);
    });
  }

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

  async convertForDownload(releaseId, originalPath, format, metadata = {}) {
    try {
      const originalFormat = path.extname(originalPath).substring(1).toLowerCase();
      
      // If requested format is the same as original, return original path
      if (format === 'original' || format === originalFormat) {
        return {
          success: true,
          path: originalPath,
          cached: true,
          format: originalFormat,
          needsConversion: false
        };
      }

      const downloadFormatPath = this.getDownloadFormatPath(releaseId, format);

      // Check if download format exists and is current
      const isCurrent = await this.isBrowserFormatCurrent(downloadFormatPath, originalPath);
      
      if (isCurrent) {
        console.log('Using cached download format:', downloadFormatPath);
        return {
          success: true,
          path: downloadFormatPath,
          cached: true,
          format,
          needsConversion: false
        };
      }

      // Check if conversion is already in progress
      const queueKey = `download-${releaseId}-${format}`;
      if (this.conversionQueue.has(queueKey)) {
        console.log('Download conversion already in progress:', releaseId, format);
        return {
          success: false,
          reason: 'conversion_in_progress',
          originalPath
        };
      }

      // Start new conversion
      this.conversionQueue.set(queueKey, Date.now());
      
      try {
        let convertedPath;
        if (format === 'mp3') {
          convertedPath = await this.convertToMP3(originalPath, downloadFormatPath, metadata);
        } else if (format === 'm4a') {
          convertedPath = await this.convertToM4A(originalPath, downloadFormatPath, metadata);
        } else {
          throw new Error(`Unsupported conversion format: ${format}`);
        }
        
        return {
          success: true,
          path: convertedPath,
          cached: false,
          format,
          originalFormat,
          needsConversion: true
        };
      } finally {
        this.conversionQueue.delete(queueKey);
      }

    } catch (error) {
      console.error('Error in convertForDownload:', error);
      return {
        success: false,
        error: error.message,
        originalPath
      };
    }
  }

  async scheduleConversion(releaseId, originalPath, metadata = {}, priority = 'normal') {
    const queueKey = `release-${releaseId}`;
    
    if (this.conversionQueue.has(queueKey)) {
      return {
        success: false,
        reason: 'already_queued'
      };
    }

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

  async cleanupOldConversions(maxAge = 30 * 24 * 60 * 60 * 1000) {
    try {
      const files = await fs.promises.readdir(this.browserFormatsDir);
      const now = Date.now();
      let cleanedCount = 0;

      for (const file of files) {
        if (file.endsWith('.m4a')) {
          const filePath = path.join(this.browserFormatsDir, file);
          const stats = await fs.promises.stat(filePath);
          
          if (now - stats.mtime.getTime() > maxAge) {
            await fs.promises.unlink(filePath);
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
export default audioConversionService;