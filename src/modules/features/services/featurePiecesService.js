/**
 * Feature Pieces API Service
 * Handles all API calls for premium editorial content
 */

import { cachedFetch } from '@shared/services/cacheService';

const API_BASE = '/api/v1/feature-pieces';
const R2_PUBLIC_URL = 'https://images.flowerpil.io';

class FeaturePiecesServiceError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'FeaturePiecesServiceError';
    this.status = status;
    this.details = details;
  }
}

const handleResponse = async (response) => {
  const data = await response.json();

  if (!response.ok) {
    throw new FeaturePiecesServiceError(
      data.error || 'Request failed',
      response.status,
      data
    );
  }

  return data;
};

// Get CSRF token from cookie
const getCSRFToken = () => {
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
};

// Authenticated fetch with CSRF token
const authenticatedFetch = async (url, options = {}) => {
  const csrfToken = getCSRFToken();
  const headers = {
    ...options.headers,
  };

  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  // Only add Content-Type for JSON body requests
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });
};

// ============================================
// Public API (no auth required)
// ============================================

/**
 * Fetch all published feature pieces
 */
export const fetchPublished = async () => {
  try {
    const response = await cachedFetch(API_BASE);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching published feature pieces:', error);
    throw error;
  }
};

/**
 * Fetch a single feature piece by slug (public view)
 */
export const fetchBySlug = async (slug) => {
  try {
    const response = await cachedFetch(`${API_BASE}/${slug}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching feature piece by slug:', error);
    throw error;
  }
};

/**
 * Fetch current user writing permissions / rollout access
 */
export const fetchAccess = async () => {
  try {
    const response = await authenticatedFetch(`${API_BASE}/access`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching writing access:', error);
    throw error;
  }
};

/**
 * Fetch scoped feature pieces for current curator/admin account
 */
export const fetchMine = async (options = {}) => {
  try {
    const params = new URLSearchParams();
    if (options.curator_id) {
      params.set('curator_id', String(options.curator_id));
    }
    const query = params.toString();
    const response = await authenticatedFetch(`${API_BASE}/mine${query ? `?${query}` : ''}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching scoped feature pieces:', error);
    throw error;
  }
};

/**
 * Fetch writing analytics for current curator/admin account
 */
export const fetchAnalytics = async (options = {}) => {
  try {
    const params = new URLSearchParams();
    if (options.curator_id) {
      params.set('curator_id', String(options.curator_id));
    }
    const query = params.toString();
    const response = await authenticatedFetch(`${API_BASE}/analytics${query ? `?${query}` : ''}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching feature analytics:', error);
    throw error;
  }
};

/**
 * Fetch feature pieces for landing feed cards
 */
export const fetchFeed = async () => {
  try {
    const response = await cachedFetch(`${API_BASE}/feed`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching feature feed:', error);
    throw error;
  }
};

/**
 * Fetch sidebar navigation items for writing pages
 */
export const fetchSidebarItems = async (limit = 8) => {
  try {
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 8, 1), 24);
    const response = await cachedFetch(`${API_BASE}/sidebar?limit=${safeLimit}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching feature sidebar items:', error);
    throw error;
  }
};

// ============================================
// Admin API (requires authentication)
// ============================================

/**
 * Fetch all feature pieces (including drafts) - admin only
 */
export const fetchAll = async () => {
  try {
    const response = await authenticatedFetch(`${API_BASE}/all`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching all feature pieces:', error);
    throw error;
  }
};

/**
 * Fetch draft feature pieces only - admin only
 */
export const fetchDrafts = async () => {
  try {
    const response = await authenticatedFetch(`${API_BASE}/drafts`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching draft feature pieces:', error);
    throw error;
  }
};

/**
 * Fetch a single feature piece by ID (for editing) - admin only
 */
export const fetchById = async (id) => {
  try {
    const response = await authenticatedFetch(`${API_BASE}/id/${id}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching feature piece by ID:', error);
    throw error;
  }
};

/**
 * Create a new feature piece - admin only
 */
export const create = async (data) => {
  try {
    const response = await authenticatedFetch(API_BASE, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error creating feature piece:', error);
    throw error;
  }
};

/**
 * Update an existing feature piece - admin only
 */
export const update = async (id, data) => {
  try {
    const response = await authenticatedFetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error updating feature piece:', error);
    throw error;
  }
};

/**
 * Delete a feature piece - admin only
 */
export const remove = async (id) => {
  try {
    const response = await authenticatedFetch(`${API_BASE}/${id}`, {
      method: 'DELETE'
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error deleting feature piece:', error);
    throw error;
  }
};

/**
 * Publish a feature piece - admin only
 */
export const publish = async (id) => {
  try {
    const response = await authenticatedFetch(`${API_BASE}/${id}/publish`, {
      method: 'POST'
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error publishing feature piece:', error);
    throw error;
  }
};

/**
 * Unpublish a feature piece - admin only
 */
export const unpublish = async (id) => {
  try {
    const response = await authenticatedFetch(`${API_BASE}/${id}/unpublish`, {
      method: 'POST'
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error unpublishing feature piece:', error);
    throw error;
  }
};

/**
 * Upload an image for a feature piece - admin only
 */
export const uploadImage = async (file) => {
  try {
    const formData = new FormData();
    formData.append('image', file);

    const response = await authenticatedFetch(`${API_BASE}/upload-image`, {
      method: 'POST',
      body: formData
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error uploading feature piece image:', error);
    throw error;
  }
};

// ============================================
// Utility functions
// ============================================

/**
 * Get the full URL for an image with optional size variant
 * @param {string} imagePath - Image path or URL
 * @param {string} size - Size variant: 'original', 'large', 'medium'
 */
export const getImageUrl = (imagePath, size = 'large') => {
  if (!imagePath) return null;

  const applySizeSuffix = (path) => {
    const lastDotIndex = path.lastIndexOf('.');
    if (lastDotIndex === -1) return path;

    const extension = path.substring(lastDotIndex);
    let baseWithoutExt = path.substring(0, lastDotIndex);

    // Remove any existing size suffixes
    baseWithoutExt = baseWithoutExt.replace(/_(large|medium|small|original)$/, '');

    if (size === 'original') {
      return `${baseWithoutExt}${extension}`;
    }

    return `${baseWithoutExt}_${size}${extension}`;
  };

  // Already a full URL
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    if (size === 'original') return imagePath;

    try {
      const url = new URL(imagePath);
      const sizedPath = applySizeSuffix(url.pathname);
      return `${url.origin}${sizedPath}${url.search}`;
    } catch (error) {
      console.warn('Failed to parse image URL:', imagePath, error);
      return imagePath;
    }
  }

  // Relative path - convert to R2 URL
  let basePath = imagePath;
  if (!imagePath.startsWith('/')) {
    basePath = `/uploads/${imagePath}`;
  }

  const sizedPath = applySizeSuffix(basePath);

  if (basePath.startsWith('/uploads/')) {
    const r2Key = sizedPath.replace(/^\/uploads\//, '');
    return `${R2_PUBLIC_URL}/${r2Key}`;
  }

  return sizedPath;
};

/**
 * Format a date string for display
 * @param {string} dateString - ISO date string
 * @param {string} format - 'short' (JAN 2025), 'long' (January 15, 2025)
 */
export const formatDate = (dateString, format = 'short') => {
  if (!dateString) return '';

  try {
    const date = new Date(dateString);

    if (format === 'short') {
      const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const year = date.getFullYear();
      return `${month} ${year}`;
    }

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
};

/**
 * Generate a unique block ID
 */
export const generateBlockId = () => {
  return Math.random().toString(36).substring(2, 9);
};
