import { parseFile } from 'music-metadata';
import fs from 'fs';
import path from 'path';

class MetadataService {
  constructor() {
    this.supportedFormats = ['.mp3', '.flac', '.m4a', '.wav', '.ogg', '.aac'];
  }

  // Extract metadata from audio file
  async extractMetadata(audioFilePath) {
    try {
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      // Check if file format is supported
      const ext = path.extname(audioFilePath).toLowerCase();
      if (!this.supportedFormats.includes(ext)) {
        console.warn(`Unsupported audio format: ${ext}`);
        return this.createEmptyMetadata(audioFilePath);
      }

      // Parse metadata using music-metadata
      const metadata = await parseFile(audioFilePath, {
        duration: true,
        skipCovers: false,
        includeChapters: false
      });

      return this.processMetadata(metadata, audioFilePath);
    } catch (error) {
      console.error('Metadata extraction error:', error.message);
      return this.createEmptyMetadata(audioFilePath, error.message);
    }
  }

  // Process and standardize extracted metadata
  processMetadata(rawMetadata, filePath) {
    const { common, format } = rawMetadata;
    
    // Extract file format information
    const originalFormat = format.container || path.extname(filePath).replace('.', '').toUpperCase();
    
    // Process standard metadata fields
    const processed = {
      // Core fields
      title: this.sanitizeString(common.title),
      artist_name: this.sanitizeString(common.artist || common.albumartist),
      album: this.sanitizeString(common.album),
      
      // Track information
      track_number: this.extractTrackNumber(common.track),
      total_tracks: this.extractTotalTracks(common.track),
      
      // Additional metadata
      genre: this.sanitizeString(common.genre?.[0]),
      year: this.extractYear(common.year || common.date),
      copyright: this.sanitizeString(common.copyright),
      composer: this.sanitizeString(common.composer?.[0]),
      publisher: this.sanitizeString(common.publisher),
      
      // Technical information
      original_format: originalFormat,
      duration: format.duration ? Math.round(format.duration) : null,
      bitrate: format.bitrate,
      sampleRate: format.sampleRate,
      
      // Date information
      recording_date: this.extractRecordingDate(common.date),
      
      // ISRC code (if available)
      isrc: this.sanitizeString(common.isrc?.[0]),
      
      // Processing metadata
      extracted_at: new Date().toISOString(),
      extraction_success: true,
      extraction_error: null
    };

    return this.validateMetadata(processed);
  }

  // Create empty metadata object for failed extractions
  createEmptyMetadata(filePath, error = null) {
    const originalFormat = path.extname(filePath).replace('.', '').toUpperCase();
    
    return {
      title: null,
      artist_name: null,
      album: null,
      track_number: null,
      total_tracks: null,
      genre: null,
      year: null,
      copyright: null,
      composer: null,
      publisher: null,
      original_format: originalFormat,
      duration: null,
      bitrate: null,
      sampleRate: null,
      recording_date: null,
      isrc: null,
      extracted_at: new Date().toISOString(),
      extraction_success: false,
      extraction_error: error
    };
  }

  // Validate and clean metadata
  validateMetadata(metadata) {
    const validated = { ...metadata };
    
    // Ensure required fields are not empty strings
    const requiredFields = ['title', 'artist_name', 'album'];
    requiredFields.forEach(field => {
      if (validated[field] === '') {
        validated[field] = null;
      }
    });

    // Validate numeric fields
    if (validated.track_number && (validated.track_number < 1 || validated.track_number > 999)) {
      validated.track_number = null;
    }
    
    if (validated.total_tracks && (validated.total_tracks < 1 || validated.total_tracks > 999)) {
      validated.total_tracks = null;
    }

    if (validated.year && (validated.year < 1900 || validated.year > new Date().getFullYear() + 10)) {
      validated.year = null;
    }

    // Validate ISRC format (12 characters: CC-XXX-YY-NNNNN)
    if (validated.isrc && !this.isValidISRC(validated.isrc)) {
      validated.isrc = null;
    }

    return validated;
  }

  // Sanitize string fields
  sanitizeString(value) {
    if (!value || typeof value !== 'string') {
      return null;
    }
    
    return value.trim().substring(0, 255) || null;
  }

  // Extract track number from track metadata
  extractTrackNumber(trackInfo) {
    if (!trackInfo) return null;
    
    if (typeof trackInfo === 'number') {
      return trackInfo;
    }
    
    if (trackInfo.no) {
      return trackInfo.no;
    }
    
    return null;
  }

  // Extract total tracks from track metadata
  extractTotalTracks(trackInfo) {
    if (!trackInfo) return null;
    
    if (trackInfo.of) {
      return trackInfo.of;
    }
    
    return null;
  }

  // Extract year from various date formats
  extractYear(dateValue) {
    if (!dateValue) return null;
    
    if (typeof dateValue === 'number') {
      return dateValue;
    }
    
    if (typeof dateValue === 'string') {
      // Try to extract 4-digit year from string
      const yearMatch = dateValue.match(/(\d{4})/);
      if (yearMatch) {
        return parseInt(yearMatch[1]);
      }
    }
    
    return null;
  }

  // Extract recording date in ISO format
  extractRecordingDate(dateValue) {
    if (!dateValue) return null;
    
    if (typeof dateValue === 'string') {
      // Try to parse as ISO date
      try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
      } catch (error) {
        // Ignore parsing errors
      }
    }
    
    return null;
  }

  // Validate ISRC format
  isValidISRC(isrc) {
    if (!isrc || typeof isrc !== 'string') return false;
    
    // Remove hyphens and check length
    const cleanISRC = isrc.replace(/-/g, '');
    if (cleanISRC.length !== 12) return false;
    
    // Check format: 2 letters + 3 alphanumeric + 2 digits + 5 digits
    const isrcPattern = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i;
    return isrcPattern.test(cleanISRC);
  }

  // Update release record with extracted metadata
  async updateReleaseWithMetadata(db, releaseId, metadata) {
    try {
      const updateFields = [
        'album', 'genre', 'track_number', 'total_tracks', 
        'copyright', 'composer', 'publisher', 'recording_date', 'original_format'
      ];
      
      const updateValues = [];
      const placeholders = [];
      
      updateFields.forEach(field => {
        if (metadata[field] !== null && metadata[field] !== undefined) {
          updateValues.push(metadata[field]);
          placeholders.push(`${field} = ?`);
        }
      });
      
      if (updateValues.length === 0) {
        console.log('No metadata fields to update');
        return { success: true, updated: false };
      }
      
      // Add releaseId to end of values array
      updateValues.push(releaseId);
      
      const query = `
        UPDATE releases 
        SET ${placeholders.join(', ')} 
        WHERE id = ?
      `;
      
      const stmt = db.prepare(query);
      const result = stmt.run(...updateValues);
      
      console.log(`Updated release ${releaseId} with metadata: ${placeholders.join(', ')}`);
      
      return {
        success: true,
        updated: true,
        changes: result.changes,
        fields: updateFields.filter((field, index) => placeholders[index])
      };
    } catch (error) {
      console.error('Error updating release with metadata:', error.message);
      throw new Error(`Failed to update release metadata: ${error.message}`);
    }
  }

  // Batch extract metadata from multiple files
  async batchExtractMetadata(filePaths) {
    const results = [];
    
    for (const filePath of filePaths) {
      try {
        // Add small delay to prevent overwhelming the system
        await this.delay(100);
        
        const metadata = await this.extractMetadata(filePath);
        results.push({
          filePath: filePath,
          metadata: metadata,
          success: metadata.extraction_success
        });
      } catch (error) {
        console.error(`Error extracting metadata from ${filePath}:`, error.message);
        results.push({
          filePath: filePath,
          metadata: null,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Utility delay function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get supported audio formats
  getSupportedFormats() {
    return [...this.supportedFormats];
  }

  // Check if file format is supported
  isFormatSupported(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedFormats.includes(ext);
  }
}

export default MetadataService;