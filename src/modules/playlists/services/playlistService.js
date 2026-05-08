// API service functions for public playlist operations
import { cacheService, cachedFetch } from '@shared/services/cacheService';

const API_BASE = '/api/v1';

class PlaylistServiceError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'PlaylistServiceError';
    this.status = status;
    this.details = details;
  }
}

const handleResponse = async (response) => {
  const data = await response.json();
  
  if (!response.ok) {
    throw new PlaylistServiceError(
      data.error || 'Request failed',
      response.status,
      data
    );
  }
  
  return data;
};

// Public playlist operations - only published playlists
export const getPublishedPlaylists = async () => {
  try {
    const filters = { published: 'true' };
    
    // Check cache first
    const cached = cacheService.getCachedPlaylists(filters);
    if (cached) {
      return cached;
    }
    
    const params = new URLSearchParams(filters);
    const url = `${API_BASE}/playlists?${params.toString()}`;
    const response = await cachedFetch(url);
    const result = await handleResponse(response);
    
    // Cache the result
    const data = result.data || [];
    cacheService.setCachedPlaylists(filters, data);
    
    return data;
  } catch (error) {
    console.error('Error fetching published playlists:', error);
    throw error;
  }
};

export const getPublicFeedPlaylists = async (limit = 50) => {
  try {
    const params = new URLSearchParams();
    const parsedLimit = Number.parseInt(limit, 10);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      params.set('limit', Math.min(parsedLimit, 100).toString());
    }

    const query = params.toString();
    const url = `/api/v1/public/feed${query ? `?${query}` : ''}`;
    const response = await cachedFetch(url);
    const result = await handleResponse(response);

    return Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    console.error('Error fetching public feed playlists:', error);
    throw error;
  }
};

export const getPlaylistById = async (id, options = {}) => {
  try {
    const { limit, offset, skipCache = false } = options;

    // Check cache first (only if not paginating and cache not explicitly skipped)
    if (!limit && !skipCache) {
      const cached = cacheService.getCachedPlaylist(id);
      if (cached && cached.published) {
        return cached;
      }
    }

    // Build URL with optional pagination parameters
    const params = new URLSearchParams();
    if (limit !== undefined) {
      params.set('limit', String(limit));
    }
    if (offset !== undefined) {
      params.set('offset', String(offset));
    }

    const query = params.toString();
    const url = `${API_BASE}/playlists/${id}${query ? `?${query}` : ''}`;
    const response = await cachedFetch(url);
    const result = await handleResponse(response);

    // Only return if published (or handle appropriately)
    if (!result.data?.published) {
      throw new PlaylistServiceError('Playlist not found', 404);
    }

    // Cache the result only if we're not paginating (full playlist load)
    if (!limit) {
      cacheService.setCachedPlaylist(id, result.data);
    }

    return result.data;
  } catch (error) {
    console.error('Error fetching playlist:', error);
    throw error;
  }
};

/**
 * Load additional tracks for a paginated playlist
 * @param {string|number} playlistId - The playlist ID
 * @param {number} limit - Number of tracks to load
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Object>} Object with tracks and pagination metadata
 */
export const loadMorePlaylistTracks = async (playlistId, limit = 100, offset = 0) => {
  try {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset)
    });

    const url = `${API_BASE}/playlists/${playlistId}?${params.toString()}`;
    const response = await cachedFetch(url);
    const result = await handleResponse(response);

    if (!result.data?.published) {
      throw new PlaylistServiceError('Playlist not found', 404);
    }

    return {
      tracks: result.data.tracks || [],
      pagination: result.data.pagination
    };
  } catch (error) {
    console.error('Error loading more tracks:', error);
    throw error;
  }
};

export const getPlaylistTracks = async (playlistId) => {
  try {
    // Check cache first
    const cached = cacheService.getCachedTracks(playlistId);
    if (cached) {
      return cached;
    }
    
    const response = await cachedFetch(`${API_BASE}/tracks/playlist/${playlistId}`);
    const result = await handleResponse(response);
    
    // Cache the result
    const data = result.data || [];
    cacheService.setCachedTracks(playlistId, data);
    
    return data;
  } catch (error) {
    console.error('Error fetching tracks:', error);
    throw error;
  }
};

export const getPlaylistEngagement = async (playlistId) => {
  try {
    const response = await fetch(`/api/v1/playlist-engagement/${playlistId}`, {
      credentials: 'include',
      cache: 'no-store'
    });
    const result = await handleResponse(response);
    return result?.data || { loveCount: 0, viewerHasLoved: false, comments: [] };
  } catch (error) {
    console.error('Error fetching playlist engagement:', error);
    throw error;
  }
};

export const lovePlaylist = async (playlistId, authenticatedFetch) => {
  const response = await authenticatedFetch(`/api/v1/playlist-engagement/${playlistId}/love`, {
    method: 'POST'
  });
  const result = await handleResponse(response);
  return result?.data || null;
};

export const unlovePlaylist = async (playlistId, authenticatedFetch) => {
  const response = await authenticatedFetch(`/api/v1/playlist-engagement/${playlistId}/love`, {
    method: 'DELETE'
  });
  const result = await handleResponse(response);
  return result?.data || null;
};

export const createPlaylistComment = async (playlistId, comment, authenticatedFetch) => {
  const response = await authenticatedFetch(`/api/v1/playlist-engagement/${playlistId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ comment })
  });
  const result = await handleResponse(response);
  return result?.data || null;
};

export const createPlaylistReply = async (playlistId, commentId, comment, authenticatedFetch) => {
  const response = await authenticatedFetch(
    `/api/v1/playlist-engagement/${playlistId}/comments/${commentId}/replies`,
    {
      method: 'POST',
      body: JSON.stringify({ comment })
    }
  );
  const result = await handleResponse(response);
  return result?.data || null;
};

export const getPerfectSundaysPage = async () => {
  try {
    const response = await cachedFetch('/api/v1/perfect-sundays');
    const result = await handleResponse(response);
    return result.data || result;
  } catch (error) {
    console.error('Error fetching Perfect Sundays page data:', error);
    throw error;
  }
};

// R2 image URL configuration
// For production, images are served from R2 CDN
// For development, falls back to local proxy
const R2_PUBLIC_URL = 'https://images.flowerpil.io';

// Utility functions for display
/**
 * Get image URL with size and format options
 * Enhanced in Phase 2 to support format conversion
 *
 * @param {string} imagePath - Image path or URL
 * @param {string} size - Size variant (original, large, medium, small)
 * @param {string} format - Format (jpeg, webp, avif) - optional, defaults to original format
 * @returns {string|null} Image URL
 */
export const getImageUrl = (imagePath, size = 'original', format = null) => {
  if (!imagePath) return null;

  // If it's already a full URL and no format conversion requested, return as-is
  if ((imagePath.startsWith('http://') || imagePath.startsWith('https://')) && !format) {
    return imagePath;
  }

  // For full URLs with format conversion
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    try {
      const url = new URL(imagePath);
      const pathname = url.pathname;
      const lastDotIndex = pathname.lastIndexOf('.');

      if (lastDotIndex === -1) return imagePath;

      const ext = pathname.substring(lastDotIndex);
      let baseWithoutExt = pathname.substring(0, lastDotIndex);

      // Strip any existing size suffix
      baseWithoutExt = baseWithoutExt.replace(/_(large|medium|small|original|lg|md|sm)$/, '');

      // Apply size suffix
      const sizeSuffix = size === 'original' ? '' : `_${size}`;

      // Apply format extension
      const formatExt = format
        ? (format === 'jpeg' ? '.jpg' : `.${format}`)
        : ext;

      return `${url.origin}${baseWithoutExt}${sizeSuffix}${formatExt}`;
    } catch (error) {
      console.warn('Failed to parse image URL:', imagePath);
      return imagePath;
    }
  }

  // Build the base path
  let basePath = imagePath;
  if (!imagePath.startsWith('/')) {
    // If it's a relative path, assume it's in uploads
    basePath = `/uploads/${imagePath}`;
  }

  // Extract extension and base path
  const lastDotIndex = basePath.lastIndexOf('.');
  if (lastDotIndex === -1) {
    // No extension found, return as-is
    return basePath;
  }

  let baseWithoutExt = basePath.substring(0, lastDotIndex);
  const extension = basePath.substring(lastDotIndex);

  // Strip any existing size suffix (_large, _medium, _small, _original)
  // This handles cases where DB stores primary_url with suffix already applied
  baseWithoutExt = baseWithoutExt.replace(/_(large|medium|small|original|lg|md|sm)$/, '');

  // Determine format extension
  const formatExt = format
    ? (format === 'jpeg' ? '.jpg' : `.${format}`)
    : extension;

  // If requesting original size, construct path without size suffix
  let finalPath;
  if (size === 'original') {
    finalPath = `${baseWithoutExt}${formatExt}`;
  } else {
    // For other sizes, add the requested size suffix
    finalPath = `${baseWithoutExt}_${size}${formatExt}`;
  }

  // Convert legacy /uploads/ paths to R2 URLs
  // This ensures images work with CORS for canvas operations (Instagram sharing)
  if (finalPath.startsWith('/uploads/')) {
    const r2Key = finalPath.replace(/^\/uploads\//, '');
    return `${R2_PUBLIC_URL}/${r2Key}`;
  }

  return finalPath;
};

export const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '';
  
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const formatDate = (dateString) => {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric'
    }).toUpperCase();
  } catch (error) {
    return dateString;
  }
};
