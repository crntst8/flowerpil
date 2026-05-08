// Bio Page API Service Functions
// Provides interface to bio-profiles and bio-handles API endpoints

const API_BASE = '/api/v1';
const BIO_PROFILES_ENDPOINT = `${API_BASE}/bio-profiles`;
const BIO_HANDLES_ENDPOINT = `${API_BASE}/bio-handles`;

// Helper: read CSRF token from cookie (double-submit pattern)
const getCsrfFromCookie = () => {
  try {
    const m = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  } catch (_) { return ''; }
};

// Helper function for API requests
const apiRequest = async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  const shouldSendCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(shouldSendCsrf ? { 'X-CSRF-Token': getCsrfFromCookie() } : {}),
      ...options.headers
    },
    // For personalized endpoints, avoid stale caches on Safari
    ...(options.fresh ? { cache: 'no-store' } : {})
  };

  const response = await fetch(url, { ...defaultOptions, ...options });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed: ${response.status}`);
  }

  return response.json();
};

// Bio Profile Management
export const getBioProfiles = async (params = {}) => {
  const searchParams = new URLSearchParams(params);
  const result = await apiRequest(`${BIO_PROFILES_ENDPOINT}?${searchParams}`);
  return result.data;
};

export const getBioProfileById = async (id) => {
  const result = await apiRequest(`${BIO_PROFILES_ENDPOINT}/${id}`);
  return result.data;
};

export const getBioProfileByHandle = async (handle) => {
  const safeHandle = encodeURIComponent(handle);
  const result = await apiRequest(`${BIO_PROFILES_ENDPOINT}/handle/${safeHandle}`);
  return result.data;
};

export const createBioProfile = async (profileData) => {
  const result = await apiRequest(BIO_PROFILES_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(profileData)
  });
  return result.data;
};

export const updateBioProfile = async (id, profileData) => {
  const result = await apiRequest(`${BIO_PROFILES_ENDPOINT}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(profileData)
  });
  return result.data;
};

export const deleteBioProfile = async (id) => {
  const result = await apiRequest(`${BIO_PROFILES_ENDPOINT}/${id}`, {
    method: 'DELETE'
  });
  return result;
};

export const publishBioProfile = async (id) => {
  const result = await apiRequest(`${BIO_PROFILES_ENDPOINT}/${id}/publish`, {
    method: 'POST'
  });
  return result.data;
};

export const unpublishBioProfile = async (id) => {
  const result = await apiRequest(`${BIO_PROFILES_ENDPOINT}/${id}/unpublish`, {
    method: 'POST'
  });
  return result.data;
};

// Handle Management
export const validateHandle = async (handle, excludeId = null) => {
  try {
    // Call the validation endpoint to check format
    const validateResult = await apiRequest(`${BIO_HANDLES_ENDPOINT}/validate/${encodeURIComponent(handle)}`);
    
    // Build availability check URL with optional excludeId for editing
    const availabilityUrl = excludeId 
      ? `${BIO_HANDLES_ENDPOINT}/check/${encodeURIComponent(handle)}?excludeId=${excludeId}`
      : `${BIO_HANDLES_ENDPOINT}/check/${encodeURIComponent(handle)}`;
    
    // Call the availability endpoint to check availability and get suggestions
    const availabilityResult = await apiRequest(availabilityUrl);
    
    // Combine results into expected format
    return {
      isValid: validateResult.valid || false,
      isAvailable: availabilityResult.available || false,
      errors: [
        ...(validateResult.errors || []),
        ...(availabilityResult.errors || [])
      ],
      suggestions: availabilityResult.suggestions || []
    };
  } catch (error) {
    // Return safe default structure on error
    return {
      isValid: false,
      isAvailable: false,
      errors: [`Failed to validate handle: ${error.message}`],
      suggestions: []
    };
  }
};

export const checkHandleAvailability = async (handle) => {
  const result = await apiRequest(`${BIO_HANDLES_ENDPOINT}/available/${encodeURIComponent(handle)}`);
  return result.data;
};

export const getHandleSuggestions = async (handle) => {
  const result = await apiRequest(`${BIO_HANDLES_ENDPOINT}/suggestions/${encodeURIComponent(handle)}`);
  return result.data;
};

// Featured Links Management
export const updateFeaturedLinks = async (profileId, featuredLinks) => {
  const result = await apiRequest(`${BIO_PROFILES_ENDPOINT}/${profileId}/featured-links`, {
    method: 'PUT',
    body: JSON.stringify({ featured_links: featuredLinks })
  });
  return result.data;
};

// Image Upload - Fixed to use admin API utilities with CSRF token
export const uploadBioImage = async (file, profileId = null) => {
  // Import admin API utilities dynamically to avoid circular dependencies
  const { adminUpload } = await import('../../admin/utils/adminApi.js');
  
  const formData = new FormData();
  formData.append('image', file);
  if (profileId) {
    formData.append('profile_id', profileId);
  }

  // Use adminUpload which automatically includes CSRF token and proper auth headers
  return adminUpload(`${API_BASE}/uploads/image?type=bio-pages`, formData);
};

// Note: Profile links are now handled directly in the store via updateProfileLinks()
// when a curator is selected. No separate API call needed.

// Public API (no auth required)
export const getPublicBioProfile = async (handle) => {
  const response = await fetch(`/api/v1/public/bio/${handle}`);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Profile not found: ${response.status}`);
  }

  return response.json();
};

// Development helper for testing
export const testBioService = async () => {
  try {
    console.log('Testing bio service connection...');
    const profiles = await getBioProfiles({ limit: 1 });
    console.log('Bio service connection successful:', profiles);
    return true;
  } catch (error) {
    console.error('Bio service test failed:', error);
    return false;
  }
};
