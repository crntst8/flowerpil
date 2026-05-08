// Save as: src/core/api/ApiClient.js
// MODULE: ApiClient | DEPS: [] | PURPOSE: Centralised API communication

class ApiClient {
  constructor() {
    this.baseURL = '/api/v1';
    this.headers = {
      'Content-Type': 'application/json',
    };
  }

  async request(method, endpoint, data = null, options = {}) {
    const { signal, headers: extraHeaders, skipCredentials = false } = options || {};

    // Get CSRF token from cookie for non-GET requests (double-submit pattern)
    const getCsrfFromCookie = () => {
      try {
        const match = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
      } catch (_) {
        return '';
      }
    };

    const shouldSendCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const csrfHeader = shouldSendCsrf ? { 'X-CSRF-Token': getCsrfFromCookie() } : {};

    const config = {
      method,
      headers: {
        ...this.headers,
        ...csrfHeader,
        ...(extraHeaders || {})
      },
      // Include credentials (cookies) for authentication
      credentials: skipCredentials ? 'same-origin' : 'include',
      // Prevent mobile browser caching issues
      cache: options.cache ?? 'no-store',
      signal
    };

    if (data && method !== 'GET') {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, config);

      // Handle 401 Unauthorized
      if (response.status === 401) {
        // Check if this is a DSP-specific auth failure (not a session auth failure)
        // DSP endpoints return specific error codes like AUTH_REQUIRED, AUTH_EXPIRED, etc.
        const isDspEndpoint = endpoint.includes('/dsp/');

        if (isDspEndpoint) {
          // For DSP endpoints, don't trigger global logout - just return the error
          // The calling code should handle reconnection prompts
          console.warn(`ApiClient: DSP auth required for ${endpoint} - NOT triggering logout`);
          const errorData = await response.json().catch(() => ({}));
          const error = new Error(errorData.message || 'DSP authentication required');
          error.code = errorData.code || 'DSP_AUTH_REQUIRED';
          error.status = 401;
          error.isDspAuth = true;
          throw error;
        }

        console.warn('ApiClient: Unauthorized (401) - dispatching auth-expired event');
        // Dispatch custom event for AuthContext to handle
        window.dispatchEvent(new CustomEvent('auth-expired', {
          detail: { endpoint, status: 401 }
        }));
        throw new Error('Unauthorized - authentication required');
      }

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  }

  get(endpoint, options = {}) {
    return this.request('GET', endpoint, null, options);
  }

  post(endpoint, data, options = {}) {
    return this.request('POST', endpoint, data, options);
  }

  put(endpoint, data, options = {}) {
    return this.request('PUT', endpoint, data, options);
  }

  delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, null, options);
  }

  // File upload
  async upload(endpoint, file, additionalData = {}) {
    const formData = new FormData();
    formData.append('file', file);

    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, value);
    });

    // Get CSRF token for upload
    const getCsrfFromCookie = () => {
      try {
        const match = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
      } catch (_) {
        return '';
      }
    };

    const csrfToken = getCsrfFromCookie();

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      body: formData,
      credentials: 'include', // Include auth cookies
      cache: 'no-store',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {}
    });

    // Handle 401 Unauthorized
    if (response.status === 401) {
      console.warn('ApiClient: Unauthorized (401) during upload - dispatching auth-expired event');
      window.dispatchEvent(new CustomEvent('auth-expired', {
        detail: { endpoint, status: 401 }
      }));
      throw new Error('Unauthorized - authentication required');
    }

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  search(query, { mode, limit, offset, ...options } = {}) {
    const params = new URLSearchParams({ q: query });
    if (mode) params.set('mode', mode);
    if (limit != null) params.set('limit', String(limit));
    if (offset != null) params.set('offset', String(offset));
    const endpoint = `/search?${params.toString()}`;
    return this.get(endpoint, options);
  }

  searchSuggestions(limit = 4, options = {}) {
    const params = new URLSearchParams();
    if (limit) {
      params.set('limit', String(limit));
    }
    const endpoint = params.toString()
      ? `/search/suggestions?${params.toString()}`
      : '/search/suggestions';
    return this.get(endpoint, options);
  }
}

export default new ApiClient();
