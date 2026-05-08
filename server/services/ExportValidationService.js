import { getQueries } from '../database/db.js';

/**
 * Export Validation Service
 * 
 * Handles pre-export validation for playlist export functionality
 * Checks track availability and coverage for different platforms
 */
class ExportValidationService {
  constructor() {
    Object.defineProperty(this, 'queries', {
      configurable: true,
      enumerable: false,
      get() {
        return getQueries();
      }
    });
  }

  /**
   * Validate playlist for export to specific platform
   * @param {number} playlistId - ID of playlist to validate
   * @param {'spotify'|'tidal'|'apple'} platform - Target platform
   * @returns {Object} Validation result with coverage statistics
   */
  async validatePlaylistForExport(playlistId, platform) {
    const tracks = this.queries.getTracksByPlaylistId.all(playlistId);
    const playlistRow = this.queries.getPlaylistById.get(playlistId) || {};
    
    if (tracks.length === 0) {
      return {
        totalTracks: 0,
        readyTracks: 0,
        missingTracks: [],
        coverage: 0,
        exportable: false,
        error: 'No tracks found in playlist'
      };
    }

    let readyTracks;
    
    if (platform === 'spotify') {
      readyTracks = tracks.filter(track => 
        track.spotify_id && track.spotify_id.trim() !== ''
      );
    } else if (platform === 'tidal') {
      readyTracks = tracks.filter(track => {
        // Track is ready if it has tidal_id OR tidal_url with extractable ID
        const hasTidalId = track.tidal_id && String(track.tidal_id).trim() !== '';
        if (hasTidalId) {
          return true;
        }
        const hasTidalUrl = track.tidal_url && String(track.tidal_url).trim() !== '';
        if (hasTidalUrl) {
          // Try to extract tidal_id from tidal_url
          const match = String(track.tidal_url).match(/\/track\/(\d+)/);
          return !!match;
        }
        return false;
      });
    } else if (platform === 'apple') {
      // Track is ready if it has apple_id OR apple_music_url
      readyTracks = tracks.filter(track => {
        const hasAppleId = track.apple_id && String(track.apple_id).trim() !== '';
        if (hasAppleId) {
          return true;
        }
        // Also check for apple_music_url (set by cross-linking)
        const hasAppleUrl = track.apple_music_url && String(track.apple_music_url).trim() !== '';
        return hasAppleUrl;
      });
    } else if (platform === 'youtube_music') {
      // Track is ready if it has youtube_music_id OR youtube_music_url
      readyTracks = tracks.filter(track => {
        const hasYouTubeId = track.youtube_music_id && String(track.youtube_music_id).trim() !== '';
        if (hasYouTubeId) {
          return true;
        }
        const hasYouTubeUrl = track.youtube_music_url && String(track.youtube_music_url).trim() !== '';
        return hasYouTubeUrl;
      });
    }
    
    let missingTracks;
    
    if (platform === 'spotify') {
      missingTracks = tracks.filter(track => 
        !track.spotify_id || track.spotify_id.trim() === ''
      );
    } else if (platform === 'tidal') {
      missingTracks = tracks.filter(track => {
        // Track is missing if it has no tidal_id AND no valid tidal_url
        const hasTidalId = track.tidal_id && String(track.tidal_id).trim() !== '';
        const hasTidalUrl = track.tidal_url && String(track.tidal_url).trim() !== '' && 
          String(track.tidal_url).match(/\/track\/(\d+)/);
        return !hasTidalId && !hasTidalUrl;
      });
    } else if (platform === 'apple') {
      missingTracks = tracks.filter(track => {
        const hasAppleId = track.apple_id && String(track.apple_id).trim() !== '';
        const hasAppleUrl = track.apple_music_url && String(track.apple_music_url).trim() !== '';
        return !hasAppleId && !hasAppleUrl;
      });
    } else if (platform === 'youtube_music') {
      missingTracks = tracks.filter(track => {
        const hasYouTubeId = track.youtube_music_id && String(track.youtube_music_id).trim() !== '';
        const hasYouTubeUrl = track.youtube_music_url && String(track.youtube_music_url).trim() !== '';
        return !hasYouTubeId && !hasYouTubeUrl;
      });
    }

    missingTracks = missingTracks.map(track => ({
      id: track.id,
      artist: track.artist,
      title: track.title,
      position: track.position
    }));

    const coverage = tracks.length > 0 ? readyTracks.length / tracks.length : 0;

    // Determine source URL (from import/paste) and managed export state
    const sourceUrl = platform === 'spotify' ? (playlistRow.spotify_url || null) :
                     platform === 'apple' ? (playlistRow.apple_url || null) :
                     platform === 'youtube_music' ? (playlistRow.youtube_music_url || null) :
                     (playlistRow.tidal_url || null);

    // Check managed export table first, fall back to legacy exported_*_url fields
    let managedExport = null;
    try {
      managedExport = this.queries.findPlaylistDspExport?.get(playlistId, platform) || null;
    } catch (_) {
      // Table may not exist yet
    }

    let exportedUrl;
    let alreadyExported;
    if (managedExport) {
      exportedUrl = managedExport.remote_playlist_url || null;
      alreadyExported = managedExport.status === 'active';
    } else {
      // Legacy fallback
      exportedUrl = platform === 'spotify' ? (playlistRow.exported_spotify_url || null) :
                   platform === 'apple' ? (playlistRow.exported_apple_url || null) :
                   platform === 'youtube_music' ? (playlistRow.exported_youtube_music_url || null) :
                   (playlistRow.exported_tidal_url || null);
      alreadyExported = !!exportedUrl;
    }

    return {
      totalTracks: tracks.length,
      readyTracks: readyTracks.length,
      missingTracks,
      coverage,
      exportable: readyTracks.length > 0,
      platform,
      existingPlaylistUrl: sourceUrl,
      exportedUrl,
      alreadyExported,
      managedExport: managedExport ? {
        id: managedExport.id,
        remote_playlist_id: managedExport.remote_playlist_id,
        status: managedExport.status,
        account_type: managedExport.account_type || null,
        owner_curator_id: managedExport.owner_curator_id || null
      } : null
    };
  }

  /**
   * Get export readiness for all supported platforms
   * @param {number} playlistId - ID of playlist to validate
   * @returns {Object} Validation results for all platforms
   */
  async getExportReadiness(playlistId) {
    const [spotify, tidal, apple, youtube_music] = await Promise.all([
      this.validatePlaylistForExport(playlistId, 'spotify'),
      this.validatePlaylistForExport(playlistId, 'tidal'),
      this.validatePlaylistForExport(playlistId, 'apple'),
      this.validatePlaylistForExport(playlistId, 'youtube_music')
    ]);

    return {
      spotify,
      tidal,
      apple,
      youtube_music,
      summary: {
        totalTracks: spotify.totalTracks,
        bestCoverage: Math.max(spotify.coverage, tidal.coverage, apple.coverage, youtube_music.coverage),
        exportablePlatforms: [
          ...(spotify.exportable ? ['spotify'] : []),
          ...(tidal.exportable ? ['tidal'] : []),
          ...(apple.exportable ? ['apple'] : []),
          ...(youtube_music.exportable ? ['youtube_music'] : [])
        ]
      }
    };
  }

  /**
   * Get tracks that are ready for export to specific platform
   * @param {number} playlistId - ID of playlist
   * @param {'spotify'|'tidal'} platform - Target platform
   * @returns {Array} Array of tracks ready for export
   */
  async getExportReadyTracks(playlistId, platform) {
    const tracks = this.queries.getTracksByPlaylistId.all(playlistId);
    
    if (platform === 'spotify') {
      return tracks.filter(track => 
        track.spotify_id && track.spotify_id.trim() !== ''
      );
    } else if (platform === 'tidal') {
      return tracks.filter(track => {
        // Track is ready if it has tidal_id OR tidal_url with extractable ID
        const hasTidalId = track.tidal_id && String(track.tidal_id).trim() !== '';
        if (hasTidalId) {
          return true;
        }
        const hasTidalUrl = track.tidal_url && String(track.tidal_url).trim() !== '';
        if (hasTidalUrl) {
          // Try to extract tidal_id from tidal_url
          const match = String(track.tidal_url).match(/\/track\/(\d+)/);
          return !!match;
        }
        return false;
      });
    } else if (platform === 'apple') {
      return tracks.filter(track => {
        const hasAppleId = track.apple_id && String(track.apple_id).trim() !== '';
        const hasAppleUrl = track.apple_music_url && String(track.apple_music_url).trim() !== '';
        return hasAppleId || hasAppleUrl;
      });
    } else if (platform === 'youtube_music') {
      return tracks.filter(track => {
        const hasYouTubeId = track.youtube_music_id && String(track.youtube_music_id).trim() !== '';
        const hasYouTubeUrl = track.youtube_music_url && String(track.youtube_music_url).trim() !== '';
        return hasYouTubeId || hasYouTubeUrl;
      });
    }

    return [];
  }

  /**
   * Get detailed export statistics for admin/debugging
   * @param {number} playlistId - ID of playlist
   * @returns {Object} Detailed statistics
   */
  async getExportStatistics(playlistId) {
    const tracks = this.queries.getTracksByPlaylistId.all(playlistId);
    
    const stats = {
      totalTracks: tracks.length,
      spotify: {
        withId: 0,
        withoutId: 0,
        coverage: 0
      },
      tidal: {
        withId: 0,
        withoutId: 0,
        coverage: 0,
        withUrl: 0
      },
      crossPlatform: {
        bothPlatforms: 0,
        spotifyOnly: 0,
        tidalOnly: 0,
        neither: 0
      }
    };

    tracks.forEach(track => {
      const hasSpotify = track.spotify_id && track.spotify_id.trim() !== '';
      const hasTidal = track.tidal_id && track.tidal_id.trim() !== '';
      const hasTidalUrl = track.tidal_url && track.tidal_url.trim() !== '';

      // Spotify stats
      if (hasSpotify) stats.spotify.withId++;
      else stats.spotify.withoutId++;

      // Tidal stats
      if (hasTidal) stats.tidal.withId++;
      else stats.tidal.withoutId++;
      
      if (hasTidalUrl) stats.tidal.withUrl++;

      // Cross-platform stats
      if (hasSpotify && hasTidal) stats.crossPlatform.bothPlatforms++;
      else if (hasSpotify && !hasTidal) stats.crossPlatform.spotifyOnly++;
      else if (!hasSpotify && hasTidal) stats.crossPlatform.tidalOnly++;
      else stats.crossPlatform.neither++;
    });

    // Calculate coverage percentages
    if (tracks.length > 0) {
      stats.spotify.coverage = stats.spotify.withId / tracks.length;
      stats.tidal.coverage = stats.tidal.withId / tracks.length;
    }

    return stats;
  }

  /**
   * Check if playlist exists and get basic info
   * @param {number} playlistId - ID of playlist
   * @returns {Object|null} Playlist info or null if not found
   */
  async getPlaylistInfo(playlistId) {
    const playlist = this.queries.getPlaylistById.get(playlistId);
    
    if (!playlist) {
      return null;
    }

    const baseInfo = {
      id: playlist.id,
      title: playlist.title,
      curator_name: playlist.curator_name,
      curator_type: playlist.curator_type,
      published: !!playlist.published,
      created_at: playlist.created_at
    };

    // Preserve optional metadata used during export flows when available
    if (playlist.description) {
      baseInfo.description = playlist.description;
    }
    if (playlist.description_short) {
      baseInfo.description_short = playlist.description_short;
    }
    if (playlist.image) {
      baseInfo.image = playlist.image;
    }
    if (playlist.tags) {
      baseInfo.tags = playlist.tags;
    }

    return baseInfo;
  }

  /**
   * Validate that playlist can be exported (exists, is published, has tracks)
   * @param {number} playlistId - ID of playlist
   * @returns {Object} Validation result
   */
  async validatePlaylistEligibility(playlistId, options = {}) {
    const allowUnpublishedDrafts = options.allowUnpublishedDrafts === true;
    const playlist = await this.getPlaylistInfo(playlistId);
    
    if (!playlist) {
      return {
        eligible: false,
        error: 'Playlist not found',
        code: 'PLAYLIST_NOT_FOUND'
      };
    }

    const tracks = this.queries.getTracksByPlaylistId.all(playlistId);

    if (!playlist.published && !allowUnpublishedDrafts) {
      return {
        eligible: false,
        error: 'Playlist is not published',
        code: 'PLAYLIST_UNPUBLISHED',
        playlist
      };
    }

    if (tracks.length === 0) {
      return {
        eligible: false,
        error: 'Playlist has no tracks',
        code: 'PLAYLIST_EMPTY',
        playlist
      };
    }

    const response = {
      eligible: true,
      playlist,
      trackCount: tracks.length
    };

    if (!playlist.published && allowUnpublishedDrafts) {
      response.warning = 'PLAYLIST_DRAFT_ALLOWED';
      response.allowUnpublishedDrafts = true;
    }

    return response;
  }
}

export default ExportValidationService;
