import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { cacheService } from '@shared/services/cacheService';
import { scheduleIdleTask, cancelIdleTask } from '@shared/utils/scheduler';

// Auth action types
const AUTH_ACTIONS = {
  LOGIN_START: 'LOGIN_START',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  SET_USER: 'SET_USER',
  SET_LOADING: 'SET_LOADING',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SIGNUP_START: 'SIGNUP_START',
  SIGNUP_AWAITING_VERIFY: 'SIGNUP_AWAITING_VERIFY',
  SIGNUP_FAILURE: 'SIGNUP_FAILURE',
  VERIFY_START: 'VERIFY_START'
};

const AUTH_STATUS_CACHE_KEY = 'flowerpil:auth-status-cache';
const AUTH_STATUS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const hasWindow = typeof window !== 'undefined';

const readAuthCache = () => {
  if (!hasWindow) return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_STATUS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Date.now() - parsed.timestamp > AUTH_STATUS_CACHE_TTL) {
      window.sessionStorage.removeItem(AUTH_STATUS_CACHE_KEY);
      return null;
    }
    return parsed.data || null;
  } catch {
    return null;
  }
};

const writeAuthCache = (data) => {
  if (!hasWindow) return;
  try {
    window.sessionStorage.setItem(
      AUTH_STATUS_CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        data,
      })
    );
  } catch {
    // no-op on quota errors
  }
};

const clearAuthCache = () => {
  if (!hasWindow) return;
  try {
    window.sessionStorage.removeItem(AUTH_STATUS_CACHE_KEY);
  } catch {
    // ignore
  }
};

// Initial auth state
const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true, // Start with loading true to check auth status
  error: null,
  errorType: null, // Store error type for specific handling
  errorData: null, // Store additional error data (e.g., minutesRemaining for locked accounts)
  tokenExpiry: null,
  awaitingVerification: false, // Track if user needs to verify email
  verificationEmail: null // Store email for verification step
};

// Auth reducer
function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.LOGIN_START:
      return {
        ...state,
        isLoading: true,
        error: null
      };

    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        tokenExpiry: action.payload.tokenExpiry
      };

    case AUTH_ACTIONS.LOGIN_FAILURE:
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload.error,
        errorType: action.payload.errorType || null,
        errorData: action.payload.errorData || null,
        tokenExpiry: null
      };

    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        tokenExpiry: null,
        awaitingVerification: false,
        verificationEmail: null
      };

    case AUTH_ACTIONS.SET_USER:
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        tokenExpiry: action.payload.tokenExpiry
      };

    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload
      };

    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null,
        errorType: null,
        errorData: null
      };

    case AUTH_ACTIONS.SIGNUP_START:
      return {
        ...state,
        isLoading: true,
        error: null
      };

    case AUTH_ACTIONS.SIGNUP_AWAITING_VERIFY:
      return {
        ...state,
        isLoading: false,
        awaitingVerification: true,
        verificationEmail: action.payload.email,
        error: null
      };

    case AUTH_ACTIONS.SIGNUP_FAILURE:
      return {
        ...state,
        isLoading: false,
        error: action.payload.error,
        awaitingVerification: false,
        verificationEmail: null
      };

    case AUTH_ACTIONS.VERIFY_START:
      return {
        ...state,
        isLoading: true,
        error: null
      };

    default:
      return state;
  }
}

// Create context
const AuthContext = createContext();

// AuthProvider component
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const csrfCheckAttemptedRef = useRef(false);

  // Check authentication status on mount
  const checkAuthStatus = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      }

      const response = await fetch('/api/v1/auth/status', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        cache: 'no-store'
      });

      const data = await response.json();

      if (response.ok && data.authenticated) {
        const payload = {
          user: data.user,
          tokenExpiry: data.tokenExpiry
        };
        writeAuthCache({ authenticated: true, ...payload });
        dispatch({ 
          type: AUTH_ACTIONS.SET_USER, 
          payload
        });
      } else {
        writeAuthCache({ authenticated: false });
        dispatch({ type: AUTH_ACTIONS.LOGOUT });
      }
    } catch (error) {
      console.error('Auth status check failed:', error);
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    }
  }, []);

  // Login function
  const login = useCallback(async (username, password) => {
    try {
      dispatch({ type: AUTH_ACTIONS.LOGIN_START });

      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        writeAuthCache({
          authenticated: true,
          user: data.user,
          tokenExpiry: data.tokenExpiry
        });
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: {
            user: data.user,
            tokenExpiry: data.tokenExpiry
          }
        });
        return { success: true };
      } else {
        writeAuthCache({ authenticated: false });
        // Parse specific error types for better user feedback
        let errorMessage = data.message || 'Login failed';
        const errorType = data.type;

        // Provide more specific error messages based on error type
        if (errorType === 'invalid_credentials') {
          errorMessage = 'Incorrect email or password. Please try again.';
        } else if (errorType === 'account_locked') {
          const minutesRemaining = data.minutesRemaining || 0;
          errorMessage = `Account temporarily locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`;
        } else if (errorType === 'account_disabled') {
          errorMessage = 'Your account has been disabled. Please contact support.';
        } else if (errorType === 'rate_limit_exceeded') {
          errorMessage = data.message || 'Too many login attempts. Please try again in 15 minutes.';
        } else if (errorType === 'validation_error') {
          errorMessage = data.message || 'Please check your input and try again.';
        }

        dispatch({
          type: AUTH_ACTIONS.LOGIN_FAILURE,
          payload: {
            error: errorMessage,
            errorType: errorType,
            errorData: data
          }
        });
        return {
          success: false,
          error: errorMessage,
          errorType: errorType,
          errorData: data
        };
      }
    } catch (error) {
      const errorMessage = 'Network error during login. Please check your connection and try again.';
      console.error('Login error:', error);
      writeAuthCache({ authenticated: false });
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: { error: errorMessage }
      });
      return { success: false, error: errorMessage };
    }
  }, []);

  // Signup function (new user accounts)
  const signup = useCallback(async (email, password, username = null) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SIGNUP_START });

      const response = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password, username })
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        dispatch({
          type: AUTH_ACTIONS.SIGNUP_AWAITING_VERIFY,
          payload: { email }
        });
        return { success: true, requiresVerification: true };
      } else {
        const error = data.message || 'Signup failed';
        dispatch({
          type: AUTH_ACTIONS.SIGNUP_FAILURE,
          payload: { error }
        });
        return { success: false, error };
      }
    } catch (error) {
      const errorMessage = 'Network error during signup';
      console.error('Signup error:', error);
      dispatch({
        type: AUTH_ACTIONS.SIGNUP_FAILURE,
        payload: { error: errorMessage }
      });
      return { success: false, error: errorMessage };
    }
  }, []);

  // Request password reset link
  const requestPasswordReset = useCallback(async (email) => {
    const trimmedEmail = (email || '').trim();
    if (!trimmedEmail) {
      return { success: false, error: 'Email is required' };
    }

    try {
      const response = await fetch('/api/v1/auth/password/reset-request', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: trimmedEmail })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data.message || data.error || 'Unable to request password reset';
        return { success: false, error: message };
      }

      return {
        success: true,
        message: data.message || 'If the email exists, a reset link will arrive shortly.'
      };
    } catch (error) {
      console.error('Password reset request failed:', error);
      return {
        success: false,
        error: 'Network error while requesting password reset'
      };
    }
  }, []);

  // Confirm password reset with token
  const resetPassword = useCallback(async (token, newPassword) => {
    if (!token) {
      return { success: false, error: 'Reset token is required' };
    }

    const trimmedPassword = (newPassword || '').trim();
    if (!trimmedPassword) {
      return { success: false, error: 'New password is required' };
    }

    try {
      const response = await fetch('/api/v1/auth/password/reset', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token, newPassword: trimmedPassword })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data.message || data.error || 'Unable to reset password';
        const requirements = Array.isArray(data.requirements) ? data.requirements : null;
        return {
          success: false,
          error: message,
          requirements
        };
      }

      return {
        success: true,
        message: data.message || 'Password updated successfully'
      };
    } catch (error) {
      console.error('Password reset failed:', error);
      return {
        success: false,
        error: 'Network error while resetting password'
      };
    }
  }, []);

  // Verify email function
  const verifyEmail = useCallback(async (email, code) => {
    try {
      dispatch({ type: AUTH_ACTIONS.VERIFY_START });

      const response = await fetch('/api/v1/auth/verify', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, code })
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: {
            user: data.user,
            tokenExpiry: data.tokenExpiry
          }
        });
        return { success: true };
      } else {
        const error = data.message || 'Verification failed';
        dispatch({
          type: AUTH_ACTIONS.LOGIN_FAILURE,
          payload: { error }
        });
        return { success: false, error };
      }
    } catch (error) {
      const errorMessage = 'Network error during verification';
      console.error('Verify error:', error);
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: { error: errorMessage }
      });
      return { success: false, error: errorMessage };
    }
  }, []);

  // Auto-logout on 401 responses (for API calls)
  const handleUnauthorized = useCallback(async () => {
    console.warn('Unauthorized access detected, logging out');

    // Call server logout endpoint to clear httpOnly cookies
    // Use fetch directly (not authenticatedFetch) to avoid recursion
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store'
      });
    } catch (error) {
      // Ignore errors - we're logging out anyway
      console.warn('Logout request failed during unauthorized handler:', error);
    }

    // Clear frontend state
    cacheService.clearAllCaches();
    clearAuthCache();
    dispatch({ type: AUTH_ACTIONS.LOGOUT });
  }, []);

  const detectCsrfFailure = async (response) => {
    if (!response || response.status !== 403) return false;
    const contentType = response.headers?.get?.('content-type') || '';
    if (!contentType.includes('application/json')) return false;
    try {
      const payload = await response.clone().json();
      const code = String(payload?.code || payload?.error_code || '').toUpperCase();
      const errorMessage = String(payload?.error || payload?.message || '').toUpperCase();
      if (code.startsWith('CSRF_')) return true;
      if (errorMessage.includes('CSRF')) return true;
    } catch (_) {
      // Ignore parse errors - fallback to treating as non-CSRF failure
    }
    return false;
  };

  // Enhanced fetch function that includes credentials and handles 401s/CSRF expiry
  const authenticatedFetch = useCallback(async (url, options = {}) => {
    // Read CSRF token from cookie (double-submit pattern)
    const getCsrfFromCookie = () => {
      try {
        const m = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : '';
      } catch (_) { return ''; }
    };

    const method = (options.method || 'GET').toUpperCase();
    const shouldSendCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const csrfHeader = shouldSendCsrf ? { 'X-CSRF-Token': getCsrfFromCookie() } : {};

    const isFormData = options.body instanceof FormData;

    const config = {
      ...options,
      // Default to fresh data to avoid sticky mobile caches
      cache: options.cache ?? 'no-store',
      credentials: 'include',
      headers: {
        ...csrfHeader,
        ...options.headers
      }
    };

    // Avoid forcing content-type when sending FormData (browser sets boundary)
    if (!isFormData) {
      config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json';
    } else if (config.headers['Content-Type']) {
      delete config.headers['Content-Type'];
    }

    try {
      const response = await fetch(url, config);

      // Handle 401 responses by logging out
      if (response.status === 401) {
        handleUnauthorized();
        throw new Error('Unauthorized');
      }

      if (await detectCsrfFailure(response)) {
        console.warn('CSRF token invalid or expired, forcing logout to refresh session.');
        window.dispatchEvent?.(new CustomEvent('auth-expired', { detail: { reason: 'csrf' } }));
        handleUnauthorized();
        throw new Error('CSRF token invalid');
      }

      return response;
    } catch (error) {
      // If it's a network error, don't auto-logout
      if (error.message === 'Unauthorized') {
        throw error;
      }
      // Re-throw other errors
      throw error;
    }
  }, [handleUnauthorized]);

  const verifyCsrfToken = useCallback(async () => {
    try {
      await authenticatedFetch('/api/v1/auth/csrf-validate', { method: 'POST' });
    } catch (error) {
      console.warn('CSRF validation failed during session check:', error);
    }
  }, [authenticatedFetch]);

  // Logout function
  const logout = useCallback(async () => {
    try {
      await authenticatedFetch('/api/v1/auth/logout', {
        method: 'POST'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear all cached data on logout
      cacheService.clearAllCaches();
      clearAuthCache();
      csrfCheckAttemptedRef.current = false;
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    }
  }, [authenticatedFetch]);

  // Clear error function
  const clearError = useCallback(() => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
  }, []);

  // Check auth status on mount
  useEffect(() => {
    let cancelled = false;
    const cached = readAuthCache();

    if (cached) {
      if (cached.authenticated && cached.user) {
        dispatch({
          type: AUTH_ACTIONS.SET_USER,
          payload: {
            user: cached.user,
            tokenExpiry: cached.tokenExpiry
          }
        });
      } else if (cached.authenticated === false) {
        dispatch({ type: AUTH_ACTIONS.LOGOUT });
      } else {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      }
    } else {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
    }

    const handle = scheduleIdleTask(() => {
      if (!cancelled) {
        checkAuthStatus({ silent: Boolean(cached) });
      }
    }, { timeout: cached ? 600 : 0 });

    return () => {
      cancelled = true;
      cancelIdleTask(handle);
    };
  }, [checkAuthStatus]);

  // Listen for auth-expired events from ApiClient
  useEffect(() => {
    const handleAuthExpired = (event) => {
      console.warn('Auth expired event received:', event.detail);
      // Clear cache and logout
      cacheService.clearAllCaches();
      handleUnauthorized();
    };

    window.addEventListener('auth-expired', handleAuthExpired);

    return () => {
      window.removeEventListener('auth-expired', handleAuthExpired);
    };
  }, [handleUnauthorized]);

  // Validate CSRF token once per session after authentication
  useEffect(() => {
    if (state.isAuthenticated && !csrfCheckAttemptedRef.current) {
      csrfCheckAttemptedRef.current = true;
      verifyCsrfToken();
    }
  }, [state.isAuthenticated, verifyCsrfToken]);

  // Re-check auth when tab becomes visible (user returns to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && state.isAuthenticated) {
        console.log('Tab became visible, checking auth status...');
        checkAuthStatus({ silent: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkAuthStatus, state.isAuthenticated]);

  // Re-check auth on pageshow (browser back/forward navigation)
  useEffect(() => {
    const handlePageShow = (event) => {
      // Check auth on any pageshow, not just bfcache restoration
      console.log('Page show event, checking auth status...');
      checkAuthStatus({ silent: true });
    };

    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [checkAuthStatus]);

  // Context value
  const value = {
    ...state,
    login,
    signup,
    verifyEmail,
    logout,
    clearError,
    checkAuthStatus,
    authenticatedFetch,
    requestPasswordReset,
    resetPassword
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}

export default AuthContext;
