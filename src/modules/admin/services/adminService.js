// API service functions for admin operations
import { adminGet, adminPost, adminPut, adminPatch, adminDelete, adminDeleteWithBody, adminUpload, AdminApiError } from '../utils/adminApi.js';

const API_BASE = '/api/v1';
const ADMIN_DASHBOARD_BASE = `${API_BASE}/admin/dashboard`;

const buildQueryString = (params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null) {
          searchParams.append(key, String(item));
        }
      });
      return;
    }
    searchParams.set(key, String(value));
  });
  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : '';
};

// Re-export AdminApiError as AdminServiceError for backward compatibility
export const AdminServiceError = AdminApiError;

// Dashboard operations
export const getAdminDashboardStats = async () => {
  try {
    const result = await adminGet(`${ADMIN_DASHBOARD_BASE}/stats`);
    return result.data;
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
};

export const logoutAllAdminAccounts = async () => {
  try {
    const result = await adminPost(`${ADMIN_DASHBOARD_BASE}/logout-all`, {});
    return result.data;
  } catch (error) {
    console.error('Error logging out admin accounts:', error);
    throw error;
  }
};

export const getCuratorSummaries = async (params = {}) => {
  try {
    const query = buildQueryString(params);
    const result = await adminGet(`${ADMIN_DASHBOARD_BASE}/curators${query}`);
    const list = result.data || [];
    return list.map((curator) => ({
      ...curator,
      tester: Boolean(curator?.tester)
    }));
  } catch (error) {
    console.error('Error fetching curator summaries:', error);
    throw error;
  }
};

export const getPlaylistSummaries = async (params = {}) => {
  try {
    const query = buildQueryString(params);
    const result = await adminGet(`${ADMIN_DASHBOARD_BASE}/playlists${query}`);
    return result.data || [];
  } catch (error) {
    console.error('Error fetching playlist summaries:', error);
    throw error;
  }
};

export const getCuratorDetails = async (curatorId) => {
  try {
    const result = await adminGet(`${ADMIN_DASHBOARD_BASE}/curators/${curatorId}`);
    const data = result.data || {};
    if (data.curator) {
      data.curator = {
        ...data.curator,
        tester: Boolean(data.curator.tester)
      };
    }
    if (Array.isArray(data.admin_accounts)) {
      data.admin_accounts = data.admin_accounts.map((account) => ({
        ...account,
        is_active: Boolean(account?.is_active)
      }));
    }
    return data;
  } catch (error) {
    console.error('Error fetching curator details:', error);
    throw error;
  }
};

export const rotateCuratorFallbackFlowerColor = async (curatorId) => {
  try {
    const result = await adminPost(
      `${ADMIN_DASHBOARD_BASE}/curators/${curatorId}/fallback-flower-color/rotate`,
      {}
    );
    return result.data;
  } catch (error) {
    console.error('Error rotating curator fallback flower color:', error);
    throw error;
  }
};

export const forceLogoutCurator = async (curatorId) => {
  try {
    const result = await adminPost(`${ADMIN_DASHBOARD_BASE}/curators/${curatorId}/force-logout`, {});
    return result.data;
  } catch (error) {
    console.error('Error forcing curator logout:', error);
    throw error;
  }
};

export const updateCuratorPassword = async (curatorId, password) => {
  try {
    const result = await adminPost(`${ADMIN_DASHBOARD_BASE}/curators/${curatorId}/password`, { password });
    return result.data;
  } catch (error) {
    console.error('Error resetting curator password:', error);
    throw error;
  }
};

export const deleteCurator = async (curatorId) => {
  try {
    const result = await adminDelete(`${API_BASE}/curators/${curatorId}`);
    return result.data;
  } catch (error) {
    console.error('Error deleting curator:', error);
    throw error;
  }
};

export const requestPasswordResetEmail = async (email) => {
  try {
    const result = await adminPost(`${API_BASE}/auth/password/reset-request`, { email });
    return result;
  } catch (error) {
    console.error('Error requesting password reset email:', error);
    throw error;
  }
};

export const getDashboardBios = async (params = {}) => {
  try {
    const query = buildQueryString(params);
    const result = await adminGet(`${ADMIN_DASHBOARD_BASE}/bios${query}`);
    return result.data || [];
  } catch (error) {
    console.error('Error fetching bios:', error);
    throw error;
  }
};

export const deleteBioProfile = async (bioId) => {
  try {
    const result = await adminDelete(`${ADMIN_DASHBOARD_BASE}/bios/${bioId}`);
    return result.data;
  } catch (error) {
    console.error('Error deleting bio profile:', error);
    throw error;
  }
};

// Playlist operations
export const getPlaylists = async (options = {}) => {
  try {
    const { published } = options;
    const params = new URLSearchParams();
    
    if (published !== undefined) {
      params.set('published', published.toString());
    }
    
    const url = `${API_BASE}/playlists${params.toString() ? '?' + params.toString() : ''}`;
    const result = await adminGet(url);
    
    return result.data || [];
  } catch (error) {
    console.error('Error fetching playlists:', error);
    throw error;
  }
};

export const getPlaylistById = async (id, options = {}) => {
  try {
    const { limit, offset } = options;

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
    const result = await adminGet(url);

    return result.data;
  } catch (error) {
    console.error('Error fetching playlist:', error);
    throw error;
  }
};

/**
 * Load additional tracks for a paginated playlist (admin/curator interface)
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
    const result = await adminGet(url);

    return {
      tracks: result.data.tracks || [],
      pagination: result.data.pagination
    };
  } catch (error) {
    console.error('Error loading more tracks:', error);
    throw error;
  }
};

export const savePlaylist = async (playlistData) => {
  try {
    const isUpdate = playlistData.id;
    const url = isUpdate 
      ? `${API_BASE}/playlists/${playlistData.id}` 
      : `${API_BASE}/playlists`;
    
    // Prepare the data
    const requestData = {
      title: playlistData.title,
      publish_date: playlistData.publish_date,
      curator_name: playlistData.curator_name,
      curator_type: playlistData.curator_type || 'artist',
      description: playlistData.description || '',
      description_short: playlistData.description_short || '',
      tags: playlistData.tags || '',
      image: playlistData.image || '',
      published: !!playlistData.published,
      tracks: playlistData.tracks || [],
      custom_action_label: Object.prototype.hasOwnProperty.call(playlistData, 'custom_action_label')
        ? playlistData.custom_action_label ?? null
        : playlistData.custom_action_label,
      custom_action_url: Object.prototype.hasOwnProperty.call(playlistData, 'custom_action_url')
        ? playlistData.custom_action_url ?? null
        : playlistData.custom_action_url,
      custom_action_icon: Object.prototype.hasOwnProperty.call(playlistData, 'custom_action_icon')
        ? playlistData.custom_action_icon ?? null
        : playlistData.custom_action_icon,
      custom_action_icon_source: Object.prototype.hasOwnProperty.call(playlistData, 'custom_action_icon_source')
        ? playlistData.custom_action_icon_source ?? null
        : playlistData.custom_action_icon_source
    };

    if (Object.prototype.hasOwnProperty.call(playlistData, 'auto_referral_enabled')) {
      requestData.auto_referral_enabled = Boolean(playlistData.auto_referral_enabled);
    }

    // Only include platform URLs if the caller provided them.
    if (Object.prototype.hasOwnProperty.call(playlistData, 'spotify_url')) {
      requestData.spotify_url = playlistData.spotify_url;
    }
    if (Object.prototype.hasOwnProperty.call(playlistData, 'apple_url')) {
      requestData.apple_url = playlistData.apple_url;
    }
    if (Object.prototype.hasOwnProperty.call(playlistData, 'tidal_url')) {
      requestData.tidal_url = playlistData.tidal_url;
    }
    if (Object.prototype.hasOwnProperty.call(playlistData, 'youtube_music_url')) {
      requestData.youtube_music_url = playlistData.youtube_music_url;
    }
    if (Object.prototype.hasOwnProperty.call(playlistData, 'soundcloud_url')) {
      requestData.soundcloud_url = playlistData.soundcloud_url;
    }
    
    const result = isUpdate 
      ? await adminPut(url, requestData)
      : await adminPost(url, requestData);
      
    return result.data;
  } catch (error) {
    console.error('Error saving playlist:', error);
    throw error;
  }
};

export const createExportRequest = async ({
  playlistId,
  destinations,
  requestedBy,
  resetProgress,
  accountPreferences
}) => {
  try {
    const payload = {
      playlist_id: playlistId,
      destinations,
      ...(requestedBy ? { requested_by: requestedBy } : {}),
      ...(typeof resetProgress === 'boolean' ? { reset_progress: resetProgress } : {}),
      ...(accountPreferences ? { account_preferences: accountPreferences } : {})
    };
    const result = await adminPost(`${API_BASE}/export-requests`, payload);
    return result.data;
  } catch (error) {
    console.error('Error creating export request:', error);
    throw error;
  }
};

export const deleteExportRequest = async (requestId) => {
  try {
    const result = await adminDelete(`${API_BASE}/admin/requests/${requestId}`);
    return result.data;
  } catch (error) {
    console.error('Error deleting export request:', error);
    throw error;
  }
};

export const deletePlaylist = async (id) => {
  try {
    const result = await adminDelete(`${API_BASE}/playlists/${id}`);
    return result;
  } catch (error) {
    console.error('Error deleting playlist:', error);
    throw error;
  }
};

export const publishPlaylist = async (id) => {
  try {
    console.log(`[adminService] Publishing playlist ${id}...`);
    const result = await adminPatch(`${API_BASE}/playlists/${id}/publish`, {});
    console.log(`[adminService] Publish response:`, result);
    return result.data;
  } catch (error) {
    console.error('[adminService] Error publishing playlist:', error);
    console.error('[adminService] Error details:', {
      message: error.message,
      status: error.status,
      details: error.details
    });
    throw error;
  }
};

export const schedulePlaylistPublish = async (playlistId, scheduledPublishAt) => {
  try {
    const result = await adminPatch(`${API_BASE}/playlists/${playlistId}/schedule-publish`, {
      scheduled_publish_at: scheduledPublishAt
    });
    return result.data;
  } catch (error) {
    console.error('[adminService] Error scheduling playlist publish:', error);
    throw error;
  }
};

export const updatePlaylistMetadata = async (id, changes, currentUpdatedAt) => {
  try {
    const payload = {
      ...changes,
      updated_at: currentUpdatedAt
    };

    const result = await adminPut(`${API_BASE}/playlists/${id}`, payload);

    // Check for conflict
    if (result.conflict) {
      return {
        success: false,
        conflict: true,
        current: result.current,
        attempted: result.attempted
      };
    }

    // Check for warnings
    const warnings = result.warnings || [];

    return {
      success: true,
      data: result.data,
      warnings
    };
  } catch (error) {
    console.error('[adminService] Error updating playlist metadata:', error);

    // Handle 409 Conflict status
    if (error.status === 409) {
      return {
        success: false,
        conflict: true,
        current: error.details?.current,
        attempted: error.details?.attempted
      };
    }

    throw error;
  }
};

export const queueExportForPlaylist = async (playlistId, options = {}) => {
  try {
    const { trigger = 'manual', resetProgress = true, destinations, forceFlowerpil = false } = options;

    const payload = {
      ...(destinations ? { destinations } : {}),
      trigger,
      resetProgress,
      forceFlowerpil
    };

    const result = await adminPost(`${API_BASE}/playlists/${playlistId}/queue-export`, payload);

    return {
      success: true,
      data: result.data,
      message: result.message
    };
  } catch (error) {
    console.error('[adminService] Error queueing export:', error);
    throw error;
  }
};

// Track operations
export const getPlaylistTracks = async (playlistId) => {
  try {
    const result = await adminGet(`${API_BASE}/tracks/playlist/${playlistId}`);
    
    return result.data || [];
  } catch (error) {
    console.error('Error fetching tracks:', error);
    throw error;
  }
};

export const searchTracks = async (query, service = 'manual') => {
  try {
    const params = new URLSearchParams({
      q: query,
      service
    });
    
    const result = await adminGet(`${API_BASE}/tracks/search?${params}`);
    
    return result.data || [];
  } catch (error) {
    console.error('Error searching tracks:', error);
    throw error;
  }
};

// Import operations
export const importFromText = async (textContent) => {
  try {
    // Parse text content locally (no API call needed for basic text parsing)
    const lines = textContent.trim().split('\n').filter(line => line.trim());
    const tracks = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      let track = null;
      
      // Pattern 1: "Artist - Title"
      if (line.includes(' - ')) {
        const [artist, title] = line.split(' - ', 2);
        if (artist && title) {
          track = {
            id: `import_${Date.now()}_${i}`,
            position: tracks.length + 1,
            title: title.trim(),
            artist: artist.trim(),
            album: '',
            year: null,
            duration: '',
            spotify_id: null,
            apple_id: null,
            tidal_id: null
          };
        }
      }
      
      // Pattern 2: "Title by Artist"
      else if (line.includes(' by ')) {
        const [title, artist] = line.split(' by ', 2);
        if (artist && title) {
          track = {
            id: `import_${Date.now()}_${i}`,
            position: tracks.length + 1,
            title: title.trim(),
            artist: artist.trim(),
            album: '',
            year: null,
            duration: '',
            spotify_id: null,
            apple_id: null,
            tidal_id: null
          };
        }
      }
      
      // Pattern 3: Just the line as title (fallback)
      else {
        track = {
          id: `import_${Date.now()}_${i}`,
          position: tracks.length + 1,
          title: line,
          artist: '',
          album: '',
          year: null,
          duration: '',
          spotify_id: null,
          apple_id: null,
          tidal_id: null
        };
      }
      
      if (track) {
        tracks.push(track);
      }
    }
    
    return tracks;
  } catch (error) {
    console.error('Error importing from text:', error);
    throw error;
  }
};

export const importFromSpotify = async () => {
  // Placeholder for future Spotify API integration
  throw new AdminServiceError('Spotify import not yet implemented', 501);
};

export const importFromApple = async () => {
  // Placeholder for future Apple Music API integration
  throw new AdminServiceError('Apple Music import not yet implemented', 501);
};

export const importFromTidal = async () => {
  // Placeholder for future Tidal API integration
  throw new AdminServiceError('Tidal import not yet implemented', 501);
};

// Image operations
export const uploadImage = async (file) => {
  try {
    const formData = new FormData();
    formData.append('image', file);
    
    const result = await adminUpload(`${API_BASE}/uploads/image`, formData);
    return result.data;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

export const deleteImage = async (filename) => {
  try {
    const result = await adminDelete(`${API_BASE}/uploads/image/${filename}`);
    return result;
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
};

// Utility functions
export const validatePlaylistData = (data) => {
  const errors = [];
  
  if (!data.title?.trim()) {
    errors.push('Title is required');
  }
  
  if (!data.curator_name?.trim()) {
    errors.push('Curator name is required');
  }
  
  if (data.title && data.title.length > 200) {
    errors.push('Title must be 200 characters or less');
  }
  
  if (data.description && data.description.length > 2000) {
    errors.push('Description must be 2000 characters or less');
  }
  
  if (data.description_short && data.description_short.length > 200) {
    errors.push('Short description must be 200 characters or less');
  }
  
  return errors;
};

export const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '';
  
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const parseDuration = (duration) => {
  if (!duration) return 0;

  if (duration.includes(':')) {
    const [minutes, seconds] = duration.split(':').map(Number);
    return (minutes * 60) + seconds;
  }

  return parseInt(duration) || 0;
};

// ==========================================
// Public User Management
// ==========================================

const ADMIN_USERS_BASE = `${API_BASE}/admin/users`;

/**
 * Get paginated list of public users
 * @param {Object} params - { page, limit, search }
 */
export const getPublicUsers = async (params = {}) => {
  try {
    const query = buildQueryString(params);
    const result = await adminGet(`${ADMIN_USERS_BASE}${query}`);
    return result.data;
  } catch (error) {
    console.error('Error fetching public users:', error);
    throw error;
  }
};

/**
 * Get single user details for audit panel
 * @param {number} id - User ID
 */
export const getPublicUser = async (id) => {
  try {
    const result = await adminGet(`${ADMIN_USERS_BASE}/${id}`);
    return result.data;
  } catch (error) {
    console.error('Error fetching public user:', error);
    throw error;
  }
};

/**
 * Get action history for a user
 * @param {number} id - User ID
 * @param {Object} params - { limit, offset }
 */
export const getUserActions = async (id, params = {}) => {
  try {
    const query = buildQueryString(params);
    const result = await adminGet(`${ADMIN_USERS_BASE}/${id}/actions${query}`);
    return result.data;
  } catch (error) {
    console.error('Error fetching user actions:', error);
    throw error;
  }
};

/**
 * Suspend a user account
 * @param {number} id - User ID
 * @param {string} reason - Reason for suspension
 */
export const suspendUser = async (id, reason) => {
  try {
    const result = await adminPost(`${ADMIN_USERS_BASE}/${id}/suspend`, { reason });
    return result;
  } catch (error) {
    console.error('Error suspending user:', error);
    throw error;
  }
};

/**
 * Unsuspend a user account
 * @param {number} id - User ID
 * @param {string} reason - Reason for unsuspension
 */
export const unsuspendUser = async (id, reason) => {
  try {
    const result = await adminPost(`${ADMIN_USERS_BASE}/${id}/unsuspend`, { reason });
    return result;
  } catch (error) {
    console.error('Error unsuspending user:', error);
    throw error;
  }
};

/**
 * Restrict a user account
 * @param {number} id - User ID
 * @param {string} reason - Reason for restriction
 */
export const restrictUser = async (id, reason) => {
  try {
    const result = await adminPost(`${ADMIN_USERS_BASE}/${id}/restrict`, { reason });
    return result;
  } catch (error) {
    console.error('Error restricting user:', error);
    throw error;
  }
};

/**
 * Permanently revoke user access
 * @param {number} id - User ID
 * @param {string} reason - Reason for revocation
 */
export const revokeUser = async (id, reason) => {
  try {
    const result = await adminPost(`${ADMIN_USERS_BASE}/${id}/revoke`, { reason });
    return result;
  } catch (error) {
    console.error('Error revoking user:', error);
    throw error;
  }
};

/**
 * Unlock export access for a user
 * @param {number} id - User ID
 * @param {string} reason - Reason for unlocking
 */
export const unlockUserExports = async (id, reason) => {
  try {
    const result = await adminPost(`${ADMIN_USERS_BASE}/${id}/unlock-exports`, { reason });
    return result;
  } catch (error) {
    console.error('Error unlocking user exports:', error);
    throw error;
  }
};

/**
 * Add or remove a badge from a user
 * @param {number} id - User ID
 * @param {string} badge - Badge name
 * @param {string} action - 'add' or 'remove'
 * @param {string} reason - Reason for badge change
 */
export const updateUserBadge = async (id, badge, action, reason) => {
  try {
    const result = await adminPost(`${ADMIN_USERS_BASE}/${id}/badge`, { badge, action, reason });
    return result;
  } catch (error) {
    console.error('Error updating user badge:', error);
    throw error;
  }
};

/**
 * Get public user analytics summary
 */
export const getPublicUserAnalytics = async () => {
  try {
    const result = await adminGet(`${ADMIN_USERS_BASE}/analytics/summary`);
    return result.data;
  } catch (error) {
    console.error('Error fetching public user analytics:', error);
    throw error;
  }
};

/**
 * Get pending export access requests
 */
export const getExportAccessRequests = async () => {
  try {
    const result = await adminGet(`${ADMIN_USERS_BASE}/export-requests`);
    return result.data;
  } catch (error) {
    console.error('Error fetching export access requests:', error);
    throw error;
  }
};

/**
 * Approve an export access request
 * @param {number} id - Request ID
 * @param {string} reason - Optional approval reason
 */
export const approveExportRequest = async (id, reason = '') => {
  try {
    const result = await adminPost(`${ADMIN_USERS_BASE}/export-requests/${id}/approve`, { reason });
    return result;
  } catch (error) {
    console.error('Error approving export request:', error);
    throw error;
  }
};

/**
 * Deny an export access request
 * @param {number} id - Request ID
 * @param {string} reason - Reason for denial (required)
 */
export const denyExportRequest = async (id, reason) => {
  try {
    const result = await adminPost(`${ADMIN_USERS_BASE}/export-requests/${id}/deny`, { reason });
    return result;
  } catch (error) {
    console.error('Error denying export request:', error);
    throw error;
  }
};

/**
 * Perform a bulk action on multiple users
 * @param {Object} params - Bulk action parameters
 * @param {number[]} params.userIds - Array of user IDs
 * @param {string} params.action - Action to perform (suspend, restore, unlock_exports, etc.)
 * @param {string} params.reason - Reason for action
 */
export const bulkUserAction = async ({ userIds, action, reason }) => {
  try {
    const result = await adminPost(`${ADMIN_USERS_BASE}/bulk-action`, { userIds, action, reason });
    return result;
  } catch (error) {
    console.error('Error performing bulk action:', error);
    throw error;
  }
};

// User Groups API
const USER_GROUPS_BASE = '/api/v1/admin/user-groups';

/**
 * Get all user groups
 */
export const getUserGroups = async () => {
  try {
    const result = await adminGet(USER_GROUPS_BASE);
    return result.data?.groups || [];
  } catch (error) {
    console.error('Error getting user groups:', error);
    throw error;
  }
};

/**
 * Create a new user group
 */
export const createUserGroup = async (name, description = '') => {
  try {
    const result = await adminPost(USER_GROUPS_BASE, { name, description });
    return result;
  } catch (error) {
    console.error('Error creating user group:', error);
    throw error;
  }
};

/**
 * Get user group details with members
 */
export const getUserGroup = async (id) => {
  try {
    const result = await adminGet(`${USER_GROUPS_BASE}/${id}`);
    return result.data;
  } catch (error) {
    console.error('Error getting user group:', error);
    throw error;
  }
};

/**
 * Update a user group
 */
export const updateUserGroup = async (id, name, description = '') => {
  try {
    const result = await adminPut(`${USER_GROUPS_BASE}/${id}`, { name, description });
    return result;
  } catch (error) {
    console.error('Error updating user group:', error);
    throw error;
  }
};

/**
 * Delete a user group
 */
export const deleteUserGroup = async (id) => {
  try {
    const result = await adminDelete(`${USER_GROUPS_BASE}/${id}`);
    return result;
  } catch (error) {
    console.error('Error deleting user group:', error);
    throw error;
  }
};

/**
 * Add users to a group
 */
export const addUsersToGroup = async (groupId, userIds) => {
  try {
    const result = await adminPost(`${USER_GROUPS_BASE}/${groupId}/members`, { userIds });
    return result;
  } catch (error) {
    console.error('Error adding users to group:', error);
    throw error;
  }
};

/**
 * Remove users from a group
 */
export const removeUsersFromGroup = async (groupId, userIds) => {
  try {
    const result = await adminDeleteWithBody(`${USER_GROUPS_BASE}/${groupId}/members`, { userIds });
    return result;
  } catch (error) {
    console.error('Error removing users from group:', error);
    throw error;
  }
};

/**
 * Apply bulk action to all group members
 */
export const groupBulkAction = async (groupId, action, reason) => {
  try {
    const result = await adminPost(`${USER_GROUPS_BASE}/${groupId}/bulk-action`, { action, reason });
    return result;
  } catch (error) {
    console.error('Error performing group bulk action:', error);
    throw error;
  }
};

// Email API

/**
 * Send email to users
 * @param {Object} params - Email parameters
 * @param {number[]} params.userIds - Specific user IDs to email
 * @param {number} params.groupId - Group ID to email all members
 * @param {boolean} params.sendToAll - Send to all public users
 * @param {string} params.subject - Email subject
 * @param {string} params.body - Email body
 */
export const sendEmailToUsers = async ({ userIds, groupId, sendToAll, subject, body }) => {
  try {
    const result = await adminPost(`${ADMIN_USERS_BASE}/send-email`, {
      userIds,
      groupId,
      sendToAll,
      subject,
      body
    });
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

/**
 * Get all email templates
 */
export const getEmailTemplates = async () => {
  try {
    const result = await adminGet(`${ADMIN_USERS_BASE}/email-templates`);
    return result.templates || [];
  } catch (error) {
    console.error('Error getting email templates:', error);
    throw error;
  }
};

/**
 * Create an email template
 */
export const createEmailTemplate = async (name, subject, body) => {
  try {
    const result = await adminPost(`${ADMIN_USERS_BASE}/email-templates`, { name, subject, body });
    return result;
  } catch (error) {
    console.error('Error creating email template:', error);
    throw error;
  }
};

/**
 * Delete an email template
 */
export const deleteEmailTemplate = async (id) => {
  try {
    const result = await adminDelete(`${ADMIN_USERS_BASE}/email-templates/${id}`);
    return result;
  } catch (error) {
    console.error('Error deleting email template:', error);
    throw error;
  }
};

// Dormant Curators API

/**
 * Get dormant curators (have draft playlists but never published)
 */
export const getDormantCurators = async () => {
  try {
    const result = await adminGet(`${ADMIN_DASHBOARD_BASE}/curators/dormant`);
    return result.data?.curators || [];
  } catch (error) {
    console.error('Error fetching dormant curators:', error);
    throw error;
  }
};

/**
 * Send email to dormant curators
 * @param {Object} params - Email parameters
 * @param {number[]} params.curatorIds - Curator IDs to email
 * @param {string} params.subject - Email subject
 * @param {string} params.body - Email body
 */
export const sendEmailToDormantCurators = async ({ curatorIds, subject, body }) => {
  try {
    const result = await adminPost(`${ADMIN_DASHBOARD_BASE}/curators/dormant/send-email`, {
      curatorIds,
      subject,
      body
    });
    return result.data;
  } catch (error) {
    console.error('Error sending email to dormant curators:', error);
    throw error;
  }
};
