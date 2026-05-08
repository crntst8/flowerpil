import { getCuratorTypeFilterOptions } from '@shared/constants/curatorTypes';

/**
 * Curator Service
 * Frontend service for curator-related API operations
 */

const API_BASE = '/api/v1/curators';

/**
 * Get all public curators
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Response with curators array
 */
export const getCurators = async (filters = {}) => {
  const searchParams = new URLSearchParams();
  
  if (filters.search) searchParams.append('search', filters.search);
  if (filters.type) searchParams.append('type', filters.type);
  if (filters.verification_status) searchParams.append('verification_status', filters.verification_status);
  
  const url = searchParams.toString() ? `${API_BASE}?${searchParams}` : API_BASE;
  
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Failed to fetch curators: ${response.statusText}`);
  }
  
  return response.json();
};

/**
 * Get curator by ID
 * @param {number} curatorId - Curator ID
 * @returns {Promise<Object>} Curator data with playlists
 */
export const getCuratorById = async (curatorId) => {
  const response = await fetch(`${API_BASE}/${curatorId}`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Failed to fetch curator: ${response.statusText}`);
  }
  
  return response.json();
};

/**
 * Get curator by name (for public profile pages)
 * @param {string} curatorName - Curator name
 * @returns {Promise<Object>} Curator data with playlists
 */
export const getCuratorByName = async (curatorName) => {
  const response = await fetch(`${API_BASE}/by-name/${encodeURIComponent(curatorName)}`, { credentials: 'include' });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Curator not found');
    }
    throw new Error(`Failed to fetch curator: ${response.statusText}`);
  }
  
  return response.json();
};

/**
 * Create new curator (admin only)
 * @param {FormData} curatorData - Curator data including images
 * @returns {Promise<Object>} Created curator data
 */
export const createCurator = async (curatorData) => {
  const response = await fetch(API_BASE, {
    method: 'POST',
    body: curatorData // FormData for file uploads
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create curator');
  }
  
  return response.json();
};

/**
 * Update curator (admin only)
 * @param {number} curatorId - Curator ID
 * @param {FormData} curatorData - Updated curator data
 * @returns {Promise<Object>} Updated curator data
 */
export const updateCurator = async (curatorId, curatorData) => {
  const response = await fetch(`${API_BASE}/${curatorId}`, {
    method: 'PUT',
    body: curatorData // FormData for file uploads
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to update curator');
  }
  
  return response.json();
};

/**
 * Delete curator (admin only)
 * @param {number} curatorId - Curator ID
 * @returns {Promise<Object>} Success message
 */
export const deleteCurator = async (curatorId) => {
  const response = await fetch(`${API_BASE}/${curatorId}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to delete curator');
  }
  
  return response.json();
};

/**
 * Search curators
 * @param {string} query - Search query
 * @param {Object} filters - Additional filters
 * @returns {Promise<Object>} Search results
 */
export const searchCurators = async (query, filters = {}) => {
  return getCurators({ search: query, ...filters });
};

/**
 * Get curator types for filtering
 * @returns {Array} Available curator types
 */
export const getCuratorTypes = () => getCuratorTypeFilterOptions();

/**
 * Get verification statuses
 * @returns {Array} Available verification statuses
 */
export const getVerificationStatuses = () => [
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'featured', label: 'Featured' }
];
