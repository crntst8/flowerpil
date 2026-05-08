/**
 * Simple Apple Music Linker
 * 
 * Lightweight solution for generating Apple Music links without scraping
 * Creates predictable URLs based on track metadata for common tracks
 */

import { validateAppleMusicUrl, normalizeAppleMusicUrl } from './url-matcher.js';

/**
 * Simple Apple Music URL generator
 * Creates search URLs that will likely work for most tracks
 */
class SimpleAppleMusicLinker {
  constructor() {
    this.baseSearchUrl = 'https://music.apple.com';
    this.regions = ['us', 'au', 'gb']; // Support multiple regions
  }

  /**
   * Generate Apple Music search URL for a track
   * This creates a direct search link that users can use to find the track
   */
  generateSearchUrl(artist, title, region = 'us') {
    if (!artist?.trim() || !title?.trim()) {
      return null;
    }

    const query = `${artist.trim()} ${title.trim()}`;
    const encodedQuery = encodeURIComponent(query);
    
    return `${this.baseSearchUrl}/${region}/search?term=${encodedQuery}`;
  }

  /**
   * Create Apple Music link result
   * For now, returns a search URL since we can't scrape effectively
   */
  async searchByTrack(track) {
    try {
      if (!track.artist || !track.title) {
        return null;
      }

      // Generate search URL for primary region
      const searchUrl = this.generateSearchUrl(track.artist, track.title, 'us');
      
      if (!searchUrl) {
        return null;
      }

      // Return a result that indicates this is a search link
      return {
        id: null,
        url: searchUrl,
        title: track.title,
        artist: track.artist,
        album: track.album || null,
        confidence: 50, // Lower confidence since this is a search link
        source: 'search_link',
        note: 'Apple Music search link - manual verification required'
      };

    } catch (error) {
      console.error(`❌ Simple Apple Music linking failed:`, error.message);
      return null;
    }
  }

  /**
   * Search by metadata (same as searchByTrack for this implementation)
   */
  async searchByMetadata(artist, title) {
    return this.searchByTrack({ artist, title });
  }

  /**
   * Test connection (always returns true for simple linker)
   */
  async testConnection() {
    return true;
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      type: 'simple_linker',
      available: true,
      note: 'Generates Apple Music search URLs'
    };
  }
}

export default SimpleAppleMusicLinker;