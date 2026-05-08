// Admin API utility functions with authentication support
// This utility handles authentication and provides a consistent API interface for admin operations

class AdminApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.details = details;
    this.authRequired = status === 401;
  }
}

// Helper function to get CSRF token from cookie
const getCSRFToken = () => {
  const name = 'csrf_token=';
  const decodedCookie = decodeURIComponent(document.cookie);
  const ca = decodedCookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) === 0) {
      return c.substring(name.length, c.length);
    }
  }
  return null;
};

// Enhanced fetch function that includes credentials and CSRF token for admin operations
export const adminFetch = async (url, options = {}) => {
  const csrfToken = getCSRFToken();
  
  const config = {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
      ...options.headers
    }
  };
  
  // For FormData requests, don't set Content-Type (let browser handle it)
  if (options.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  
  try {
    const response = await fetch(url, config);
    
    // Handle authentication errors specifically
    if (response.status === 401) {
      const data = await response.json().catch(() => ({ error: 'Authentication required' }));
      throw new AdminApiError(
        'Authentication required',
        401,
        { ...data, authRequired: true }
      );
    }
    
    return response;
  } catch (error) {
    // Re-throw AdminApiError instances
    if (error instanceof AdminApiError) {
      throw error;
    }
    
    // Handle network errors
    throw new AdminApiError(
      error.message || 'Network error',
      0,
      { networkError: true }
    );
  }
};

// Helper to handle JSON responses with error checking
export const handleJsonResponse = async (response) => {
  let data;
  try {
    data = await response.json();
  } catch (parseError) {
    // Non-JSON response (e.g. nginx 413 HTML page, Cloudflare error page)
    throw new AdminApiError(
      response.status === 413
        ? 'File too large for server'
        : `Server returned non-JSON response (status ${response.status})`,
      response.status,
      { parseError: true }
    );
  }

  if (!response.ok) {
    throw new AdminApiError(
      data.error || 'Request failed',
      response.status,
      data
    );
  }

  return data;
};

// Convenience method for GET requests
export const adminGet = async (url) => {
  const response = await adminFetch(url);
  return handleJsonResponse(response);
};

// Convenience method for POST requests
export const adminPost = async (url, data) => {
  const response = await adminFetch(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response);
};

// Convenience method for PUT requests
export const adminPut = async (url, data) => {
  const response = await adminFetch(url, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response);
};

// Convenience method for DELETE requests
export const adminDelete = async (url) => {
  const response = await adminFetch(url, {
    method: 'DELETE'
  });
  return handleJsonResponse(response);
};

// Convenience method for file uploads
export const adminUpload = async (url, formData) => {
  const response = await adminFetch(url, {
    method: 'POST',
    body: formData
  });
  return handleJsonResponse(response);
};

// Convenience method for PATCH requests
export const adminPatch = async (url, data) => {
  const response = await adminFetch(url, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response);
};

// Convenience method for DELETE requests with a body
export const adminDeleteWithBody = async (url, data) => {
  const response = await adminFetch(url, {
    method: 'DELETE',
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response);
};

// Export the error class for type checking
export { AdminApiError };