// API service functions for release operations

const API_BASE = '/api/v1';

class ReleaseServiceError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ReleaseServiceError';
    this.status = status;
    this.details = details;
  }
}

const getCsrfToken = () => {
  try {
    const match = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch (_) {
    return '';
  }
};

const buildHeaders = (method, extra = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...extra
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers['X-CSRF-Token'] = getCsrfToken();
  }

  return headers;
};

const handleResponse = async (response) => {
  const data = await response.json();

  if (!response.ok) {
    throw new ReleaseServiceError(
      data.error || 'Request failed',
      response.status,
      data
    );
  }

  return data;
};

/**
 * Get public release by ID
 * @param {string|number} id - Release ID
 * @param {string} accessToken - Optional access token for password-protected releases
 */
export const getPublicRelease = async (id, accessToken = null) => {
  const headers = buildHeaders('GET');

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE}/releases/${id}/public`, {
    method: 'GET',
    headers,
    credentials: 'include'
  });

  return handleResponse(response);
};

/**
 * Verify password for a release
 * @param {string|number} id - Release ID
 * @param {string} password - Password to verify
 */
export const verifyReleasePassword = async (id, password) => {
  const response = await fetch(`${API_BASE}/releases/${id}/verify-password`, {
    method: 'POST',
    headers: buildHeaders('POST'),
    body: JSON.stringify({ password }),
    credentials: 'include'
  });

  return handleResponse(response);
};

/**
 * Get curator's releases (authenticated)
 * @param {string|number} curatorId - Curator ID
 */
export const getCuratorReleases = async (curatorId) => {
  const response = await fetch(`${API_BASE}/curators/${curatorId}/releases`, {
    method: 'GET',
    headers: buildHeaders('GET'),
    credentials: 'include'
  });

  return handleResponse(response);
};

/**
 * Create a new release
 * @param {string|number} curatorId - Curator ID
 * @param {Object} releaseData - Release data
 */
export const createRelease = async (curatorId, releaseData) => {
  const response = await fetch(`${API_BASE}/curators/${curatorId}/releases`, {
    method: 'POST',
    headers: buildHeaders('POST'),
    body: JSON.stringify(releaseData),
    credentials: 'include'
  });

  return handleResponse(response);
};

/**
 * Update a release
 * @param {string|number} id - Release ID
 * @param {Object} releaseData - Updated release data
 */
export const updateRelease = async (id, releaseData) => {
  const response = await fetch(`${API_BASE}/releases/${id}`, {
    method: 'PUT',
    headers: buildHeaders('PUT'),
    body: JSON.stringify(releaseData),
    credentials: 'include'
  });

  return handleResponse(response);
};

/**
 * Delete a release
 * @param {string|number} id - Release ID
 */
export const deleteRelease = async (id) => {
  const response = await fetch(`${API_BASE}/releases/${id}`, {
    method: 'DELETE',
    headers: buildHeaders('DELETE'),
    credentials: 'include'
  });

  return handleResponse(response);
};

/**
 * Update release password
 * @param {string|number} id - Release ID
 * @param {string|null} password - New password (null to remove)
 */
export const updateReleasePassword = async (id, password) => {
  const response = await fetch(`${API_BASE}/releases/${id}/password`, {
    method: 'PUT',
    headers: buildHeaders('PUT'),
    body: JSON.stringify({ password }),
    credentials: 'include'
  });

  return handleResponse(response);
};

/**
 * Update release action links
 * @param {string|number} id - Release ID
 * @param {Array} actions - Action links array
 */
export const updateReleaseActions = async (id, actions) => {
  const response = await fetch(`${API_BASE}/releases/${id}/actions`, {
    method: 'POST',
    headers: buildHeaders('POST'),
    body: JSON.stringify({ actions }),
    credentials: 'include'
  });

  return handleResponse(response);
};

/**
 * Update release assets
 * @param {string|number} id - Release ID
 * @param {Array} assets - Assets array
 */
export const updateReleaseAssets = async (id, assets) => {
  const response = await fetch(`${API_BASE}/releases/${id}/assets`, {
    method: 'POST',
    headers: buildHeaders('POST'),
    body: JSON.stringify({ assets }),
    credentials: 'include'
  });

  return handleResponse(response);
};

/**
 * Update release shows
 * @param {string|number} id - Release ID
 * @param {Array} shows - Shows array
 */
export const updateReleaseShows = async (id, shows) => {
  const response = await fetch(`${API_BASE}/releases/${id}/shows`, {
    method: 'POST',
    headers: buildHeaders('POST'),
    body: JSON.stringify({ shows }),
    credentials: 'include'
  });

  return handleResponse(response);
};

/**
 * Import release metadata from any supported DSP URL
 * @param {string} url - Album or track URL from Spotify, Apple Music, Tidal, etc.
 */
export const importFromUrl = async (url) => {
  const response = await fetch(`${API_BASE}/releases/import/url`, {
    method: 'POST',
    headers: buildHeaders('POST'),
    body: JSON.stringify({ url }),
    credentials: 'include'
  });

  return handleResponse(response);
};

/**
 * Import release metadata from Spotify (legacy, use importFromUrl instead)
 * @param {string} url - Spotify album or track URL
 */
export const importFromSpotify = async (url) => {
  const response = await fetch(`${API_BASE}/releases/import/spotify`, {
    method: 'POST',
    headers: buildHeaders('POST'),
    body: JSON.stringify({ url }),
    credentials: 'include'
  });

  return handleResponse(response);
};

// Platform icon mappings
export const PLATFORM_ICONS = {
  spotify: { name: 'Spotify', icon: 'spotify', color: '#1DB954' },
  apple_music: { name: 'Apple Music', icon: 'apple-music', color: '#FA2D48' },
  tidal: { name: 'Tidal', icon: 'tidal', color: '#000000' },
  bandcamp: { name: 'Bandcamp', icon: 'bandcamp', color: '#1DA0C3' },
  youtube_music: { name: 'YouTube Music', icon: 'youtube-music', color: '#FF0000' },
  amazon_music: { name: 'Amazon Music', icon: 'amazon-music', color: '#00A8E1' },
  deezer: { name: 'Deezer', icon: 'deezer', color: '#FEAA2D' },
  website: { name: 'Website', icon: 'link', color: '#666666' },
  custom: { name: 'Link', icon: 'link', color: '#666666' }
};

// Release type display names
export const RELEASE_TYPES = {
  single: 'Single',
  'double-single': 'Double Single',
  EP: 'EP',
  album: 'Album',
  'live album': 'Live Album',
  remix: 'Remix',
  remaster: 'Remaster'
};
