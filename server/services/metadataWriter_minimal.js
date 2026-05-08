import path from 'path';
import fs from 'fs';
import NodeID3 from 'node-id3';

/**
 * MetadataWriter service for audio downloads
 * Handles metadata injection and format availability
 */

/**
 * Get available download formats based on original format and conversion status
 * @param {Object} release - Release object from database
 * @returns {Array} - Array of available format objects
 */
function getAvailableFormats(release) {
  const formats = [];
  
  // Original format always available
  formats.push({
    format: 'original',
    label: `Original (${(release.original_format || 'Unknown').toUpperCase()})`,
    description: 'High quality original upload with metadata',
    supportsMetadata: supportsMetadataInjection(release.original_format)
  });
  
  // MP3 format available if original is not MP3
  if (release.original_format !== 'mp3') {
    formats.push({
      format: 'mp3',
      label: 'MP3',
      description: 'Universal compatibility with metadata',
      supportsMetadata: true
    });
  }
  
  return formats;
}

/**
 * Check if format supports metadata injection
 * @param {string} format - Audio format (mp3, flac, etc.)
 * @returns {boolean} - True if format supports metadata injection
 */
function supportsMetadataInjection(format) {
  const supportedFormats = ['mp3', 'flac'];
  return supportedFormats.includes(format?.toLowerCase());
}

/**
 * Create download filename with metadata information
 * @param {Object} release - Release object from database
 * @param {string} format - Download format
 * @returns {string} - Sanitized filename for download
 */
function createDownloadFilename(release, format) {
  let filename = release.title || 'audio';
  
  // Add artist if available
  if (release.artist_name) {
    filename = `${release.artist_name} - ${filename}`;
  }
  
  // Add album if available and different from title
  if (release.album && release.album !== release.title) {
    filename = `${filename} (${release.album})`;
  }
  
  // Sanitize filename (remove invalid characters)
  filename = filename.replace(/[<>:"/\\|?*]/g, '_');
  
  // Add appropriate file extension
  const extension = format === 'original' ? 
    getFileExtension(release.original_format) : 
    `.${format}`;
    
  return `${filename}${extension}`;
}

/**
 * Get file extension for audio format
 * @param {string} format - Audio format
 * @returns {string} - File extension with dot
 */
function getFileExtension(format) {
  const extensions = {
    'mp3': '.mp3',
    'flac': '.flac',
    'm4a': '.m4a',
    'wav': '.wav',
    'ogg': '.ogg',
    'aac': '.aac'
  };
  
  return extensions[format?.toLowerCase()] || '.audio';
}

/**
 * Inject metadata into audio file for download
 * @param {string} audioFilePath - Path to original audio file
 * @param {Object} metadata - Metadata object from database
 * @param {string} format - Target format ('mp3', 'flac', 'original')
 * @returns {Buffer|null} - Buffer with injected metadata or null if failed
 */
async function injectMetadataToBuffer(audioFilePath, metadata, format) {
  try {
    // Read the original file
    const audioBuffer = await fs.promises.readFile(audioFilePath);
    
    // Only inject metadata for MP3 files for now
    if (format === 'mp3' || (format === 'original' && metadata.original_format === 'mp3')) {
      return injectMp3Metadata(audioBuffer, metadata);
    }
    
    // For other formats, return original buffer (no metadata injection yet)
    console.log(`Metadata injection not yet implemented for format: ${format}`);
    return audioBuffer;
    
  } catch (error) {
    console.error('Metadata injection failed:', error);
    return null;
  }
}

/**
 * Inject metadata into MP3 file buffer using ID3v2.4 tags
 * @param {Buffer} audioBuffer - MP3 audio file buffer
 * @param {Object} metadata - Metadata object from database
 * @returns {Buffer} - MP3 buffer with embedded metadata
 */
function injectMp3Metadata(audioBuffer, metadata) {
  try {
    // Convert database metadata to ID3v2.4 format
    const id3Tags = convertToId3Tags(metadata);
    
    // Use node-id3 to write metadata
    const taggedBuffer = NodeID3.update(id3Tags, audioBuffer);
    
    return taggedBuffer || audioBuffer;
    
  } catch (error) {
    console.error('MP3 metadata injection error:', error);
    return audioBuffer;
  }
}

/**
 * Convert database metadata to ID3v2.4 tag format
 * @param {Object} metadata - Database metadata object
 * @returns {Object} - ID3v2.4 formatted tags
 */
function convertToId3Tags(metadata) {
  const id3Tags = {};
  
  // Map database fields to ID3v2.4 tags
  if (metadata.title) id3Tags.title = metadata.title;
  if (metadata.artist_name) id3Tags.artist = metadata.artist_name;
  if (metadata.album) id3Tags.album = metadata.album;
  if (metadata.genre) id3Tags.genre = metadata.genre;
  if (metadata.release_date) {
    // Extract year from release_date if available
    const year = new Date(metadata.release_date).getFullYear();
    if (year && !isNaN(year)) id3Tags.year = year.toString();
  }
  if (metadata.track_number) id3Tags.trackNumber = metadata.track_number.toString();
  if (metadata.total_tracks) id3Tags.partOfSet = metadata.total_tracks.toString();
  if (metadata.copyright) id3Tags.copyright = metadata.copyright;
  if (metadata.composer) id3Tags.composer = metadata.composer;
  if (metadata.publisher) id3Tags.publisher = metadata.publisher;
  if (metadata.isrc) id3Tags.ISRC = metadata.isrc;
  if (metadata.recording_date) id3Tags.date = metadata.recording_date;
  
  return id3Tags;
}

// Export functions as default object
export default {
  getAvailableFormats,
  supportsMetadataInjection,
  createDownloadFilename,
  getFileExtension,
  injectMetadataToBuffer,
  injectMp3Metadata,
  convertToId3Tags
};