import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import React from 'react';

// Mock document.cookie for CSRF token
let mockCookie = '';
Object.defineProperty(document, 'cookie', {
  get: () => mockCookie,
  set: (value) => {
    mockCookie = value;
  },
  configurable: true
});

const createMockResponse = ({ ok = true, status = 200, body = {}, headers = {} } = {}) => {
  const normalizedHeaders = Object.keys(headers).reduce((acc, key) => {
    acc[key.toLowerCase()] = headers[key];
    return acc;
  }, {});

  const response = {
    ok,
    status,
    headers: {
      get(name) {
        if (!name) return null;
        return normalizedHeaders[name.toLowerCase()] ?? null;
      }
    },
    json: vi.fn(async () => body)
  };

  response.clone = () => createMockResponse({
    ok,
    status,
    body,
    headers: normalizedHeaders
  });

  return response;
};

const mockFetchRouter = (routes = {}) => {
  global.fetch = vi.fn(async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    const key = `${method} ${url}`;
    const handler = routes[key] ?? routes[url] ?? routes['*'];
    if (!handler) {
      throw new Error(`Unhandled fetch call for ${key}`);
    }
    return typeof handler === 'function' ? handler({ url, options }) : handler;
  });
};

const installIdleCallbackPolyfill = () => {
  if (typeof window === 'undefined') return;
  window.requestIdleCallback = (cb) => {
    if (typeof cb === 'function') {
      cb({ didTimeout: false, timeRemaining: () => 1 });
    }
    return 1;
  };
  window.cancelIdleCallback = () => {};
};

describe('AuthContext', () => {
  beforeAll(() => {
    installIdleCallbackPolyfill();
  });

  afterAll(() => {
    if (typeof window !== 'undefined') {
      delete window.requestIdleCallback;
      delete window.cancelIdleCallback;
    }
  });
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockCookie = '';
    global.fetch = vi.fn();
  });

  describe('AuthProvider initialization', () => {
    it('should initialize with loading state before auth status resolves', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBe(null);
    });

    it('should check auth status on mount', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(createMockResponse({
        body: {
          authenticated: true,
          user: { id: 1, username: 'testuser', role: 'curator' },
          tokenExpiry: Date.now() + 3600000
        }
      }));

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/v1/auth/status', {
        cache: 'no-store',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual({ id: 1, username: 'testuser', role: 'curator' });
    });

    it('should logout if auth status check fails', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(createMockResponse({
        ok: false,
        status: 401,
        body: { authenticated: false }
      }));

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBe(null);
    });
  });

  describe('login', () => {
    it('should transition to LOGIN_START when login begins', async () => {
      global.fetch = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({
            success: true,
            user: { id: 1, username: 'testuser' },
            tokenExpiry: Date.now() + 3600000
          })
        }), 100))
      );

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      // Wait for initial auth check to complete
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Start login
      act(() => {
        result.current.login('testuser', 'password123');
      });

      // Should immediately set loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBe(null);
    });

    it('should login successfully with valid credentials', async () => {
      const mockUser = { id: 1, username: 'testuser', email: 'test@example.com', role: 'curator' };
      const mockTokenExpiry = Date.now() + 3600000;

      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          ok: false,
          status: 401,
          body: { authenticated: false }
        }),
        'POST /api/v1/auth/login': createMockResponse({
          body: {
            success: true,
            user: mockUser,
            tokenExpiry: mockTokenExpiry
          }
        })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let loginResult;
      await act(async () => {
        loginResult = await result.current.login('testuser', 'password123');
      });

      expect(loginResult.success).toBe(true);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.tokenExpiry).toBe(mockTokenExpiry);
      expect(result.current.error).toBe(null);
      expect(result.current.isLoading).toBe(false);

      // Verify API was called correctly
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: 'testuser', password: 'password123' })
      });
    });

    it('should dispatch LOGIN_FAILURE on invalid credentials', async () => {
      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          ok: false,
          status: 401,
          body: { authenticated: false }
        }),
        'POST /api/v1/auth/login': createMockResponse({
          ok: false,
          status: 401,
          body: {
            success: false,
            message: 'Invalid username or password',
            type: 'invalid_credentials'
          }
        })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let loginResult;
      await act(async () => {
        loginResult = await result.current.login('testuser', 'wrongpassword');
      });

      expect(loginResult.success).toBe(false);
      expect(loginResult.error).toBe('Incorrect email or password. Please try again.');
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBe(null);
      expect(result.current.error).toBe('Incorrect email or password. Please try again.');
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle network errors during login', async () => {
      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          ok: false,
          status: 401,
          body: { authenticated: false }
        }),
        'POST /api/v1/auth/login': () => { throw new Error('Network error'); }
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let loginResult;
      await act(async () => {
        loginResult = await result.current.login('testuser', 'password123');
      });

      expect(loginResult.success).toBe(false);
      expect(loginResult.error).toBe('Network error during login. Please check your connection and try again.');
      expect(result.current.error).toBe('Network error during login. Please check your connection and try again.');
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('logout', () => {
    it('should call logout API and clear user state', async () => {
      mockCookie = 'csrf_token=test-csrf-token';

      // Setup authenticated state
      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          body: {
            authenticated: true,
            user: { id: 1, username: 'testuser' },
            tokenExpiry: Date.now() + 3600000
          }
        }),
        'POST /api/v1/auth/logout': createMockResponse({
          body: { success: true }
        })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        await result.current.logout();
      });

      // Verify logout API was called with CSRF token
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/auth/logout', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'test-csrf-token'
        }
      });

      // Verify state is cleared
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBe(null);
      expect(result.current.error).toBe(null);
      expect(result.current.awaitingVerification).toBe(false);
      expect(result.current.verificationEmail).toBe(null);
    });

    it('should clear state even if logout API fails', async () => {
      mockCookie = 'csrf_token=test-csrf-token';

      // Setup authenticated state
      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          body: {
            authenticated: true,
            user: { id: 1, username: 'testuser' }
          }
        }),
        'POST /api/v1/auth/logout': () => { throw new Error('Network error'); }
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        await result.current.logout();
      });

      // State should still be cleared
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBe(null);
    });
  });

  describe('signup', () => {
    it('should create user and transition to SIGNUP_AWAITING_VERIFY', async () => {
      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          ok: false,
          status: 401,
          body: { authenticated: false }
        }),
        'POST /api/v1/auth/signup': createMockResponse({
          body: {
            ok: true,
            message: 'Verification email sent'
          }
        })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let signupResult;
      await act(async () => {
        signupResult = await result.current.signup('test@example.com', 'SecurePass123!', 'testuser');
      });

      expect(signupResult.success).toBe(true);
      expect(signupResult.requiresVerification).toBe(true);
      expect(result.current.awaitingVerification).toBe(true);
      expect(result.current.verificationEmail).toBe('test@example.com');
      expect(result.current.isAuthenticated).toBe(false);

      expect(global.fetch).toHaveBeenCalledWith('/api/v1/auth/signup', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePass123!',
          username: 'testuser'
        })
      });
    });

    it('should handle validation errors during signup', async () => {
      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          ok: false,
          status: 401,
          body: { authenticated: false }
        }),
        'POST /api/v1/auth/signup': createMockResponse({
          ok: false,
          status: 400,
          body: {
            ok: false,
            message: 'Email already exists'
          }
        })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let signupResult;
      await act(async () => {
        signupResult = await result.current.signup('existing@example.com', 'SecurePass123!');
      });

      expect(signupResult.success).toBe(false);
      expect(signupResult.error).toBe('Email already exists');
      expect(result.current.error).toBe('Email already exists');
      expect(result.current.awaitingVerification).toBe(false);
    });

    it('should handle network errors during signup', async () => {
      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          ok: false,
          status: 401,
          body: { authenticated: false }
        }),
        'POST /api/v1/auth/signup': () => { throw new Error('Network error'); }
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let signupResult;
      await act(async () => {
        signupResult = await result.current.signup('test@example.com', 'SecurePass123!');
      });

      expect(signupResult.success).toBe(false);
      expect(signupResult.error).toBe('Network error during signup');
      expect(result.current.error).toBe('Network error during signup');
    });
  });

  describe('verifyEmail', () => {
    it('should verify code and transition to LOGIN_SUCCESS', async () => {
      const mockUser = { id: 1, username: 'testuser', email: 'test@example.com' };

      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          ok: false,
          status: 401,
          body: { authenticated: false }
        }),
        'POST /api/v1/auth/verify': createMockResponse({
          body: {
            ok: true,
            user: mockUser,
            tokenExpiry: Date.now() + 3600000
          }
        })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let verifyResult;
      await act(async () => {
        verifyResult = await result.current.verifyEmail('test@example.com', '123456');
      });

      expect(verifyResult.success).toBe(true);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);

      expect(global.fetch).toHaveBeenCalledWith('/api/v1/auth/verify', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: 'test@example.com', code: '123456' })
      });
    });

    it('should handle incorrect verification code', async () => {
      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          ok: false,
          status: 401,
          body: { authenticated: false }
        }),
        'POST /api/v1/auth/verify': createMockResponse({
          ok: false,
          status: 400,
          body: {
            ok: false,
            message: 'Invalid verification code'
          }
        })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let verifyResult;
      await act(async () => {
        verifyResult = await result.current.verifyEmail('test@example.com', 'wrong');
      });

      expect(verifyResult.success).toBe(false);
      expect(verifyResult.error).toBe('Invalid verification code');
      expect(result.current.error).toBe('Invalid verification code');
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('authenticatedFetch', () => {
    it('should include credentials in all requests', async () => {
      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          body: {
            authenticated: true,
            user: { id: 1, username: 'testuser' }
          }
        }),
        'POST /api/v1/auth/csrf-validate': createMockResponse({ body: { valid: true } }),
        'GET /api/v1/test': createMockResponse({ body: { data: 'test' } })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        await result.current.authenticatedFetch('/api/v1/test');
      });

      // Find the test API call (not the auth status call)
      const testApiCall = global.fetch.mock.calls.find(call => call[0] === '/api/v1/test');
      expect(testApiCall).toBeDefined();
      expect(testApiCall[1].credentials).toBe('include');
    });

    it('should add CSRF token for POST, PUT, DELETE requests', async () => {
      mockCookie = 'csrf_token=test-csrf-token';

      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          body: {
            authenticated: true,
            user: { id: 1, username: 'testuser' }
          }
        }),
        'POST /api/v1/auth/csrf-validate': createMockResponse({ body: { valid: true } }),
        'POST /api/v1/test': createMockResponse({ body: { success: true } })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        await result.current.authenticatedFetch('/api/v1/test', {
          method: 'POST',
          body: JSON.stringify({ data: 'test' })
        });
      });

      const postCall = global.fetch.mock.calls.find(call => call[0] === '/api/v1/test');
      expect(postCall[1].headers['X-CSRF-Token']).toBe('test-csrf-token');
    });

    it('should not add CSRF token for GET requests', async () => {
      mockCookie = 'csrf_token=test-csrf-token';

      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          body: {
            authenticated: true,
            user: { id: 1, username: 'testuser' }
          }
        }),
        'POST /api/v1/auth/csrf-validate': createMockResponse({ body: { valid: true } }),
        'GET /api/v1/test': createMockResponse({ body: { data: 'test' } })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        await result.current.authenticatedFetch('/api/v1/test', { method: 'GET' });
      });

      const getCall = global.fetch.mock.calls.find(call => call[0] === '/api/v1/test');
      expect(getCall[1].headers['X-CSRF-Token']).toBeUndefined();
    });

    it('should auto-logout on 401 responses', async () => {
      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          body: {
            authenticated: true,
            user: { id: 1, username: 'testuser' }
          }
        }),
        'POST /api/v1/auth/csrf-validate': createMockResponse({ body: { valid: true } }),
        'GET /api/v1/protected': createMockResponse({
          ok: false,
          status: 401,
          body: {}
        })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        try {
          await result.current.authenticatedFetch('/api/v1/protected');
        } catch (error) {
          expect(error.message).toBe('Unauthorized');
        }
      });

      // Should have logged out
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBe(null);
    });

    it('should not auto-logout on network errors', async () => {
      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          body: {
            authenticated: true,
            user: { id: 1, username: 'testuser' }
          }
        }),
        'POST /api/v1/auth/csrf-validate': createMockResponse({ body: { valid: true } }),
        'GET /api/v1/test': () => { throw new Error('Network error'); }
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        try {
          await result.current.authenticatedFetch('/api/v1/test');
        } catch (error) {
          expect(error.message).toBe('Network error');
        }
      });

      // Should still be authenticated
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).not.toBe(null);
    });

    it('should auto-logout on CSRF validation failures', async () => {
      mockCookie = 'csrf_token=test-csrf-token';
      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          body: {
            authenticated: true,
            user: { id: 1, username: 'testuser' }
          }
        }),
        'POST /api/v1/protected': createMockResponse({
          ok: false,
          status: 403,
          headers: { 'content-type': 'application/json' },
          body: {
            error: 'CSRF token validation failed',
            code: 'CSRF_TOKEN_EXPIRED'
          }
        })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        await expect(result.current.authenticatedFetch('/api/v1/protected', { method: 'POST' })).rejects.toThrow('CSRF token invalid');
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBe(null);
    });

    it('should read CSRF token from cookie', async () => {
      mockCookie = 'other=value; csrf_token=my-csrf-token; another=value';

      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          body: {
            authenticated: true,
            user: { id: 1, username: 'testuser' }
          }
        }),
        'POST /api/v1/auth/csrf-validate': createMockResponse({ body: { valid: true } }),
        'POST /api/v1/test': createMockResponse({ body: { success: true } })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        await result.current.authenticatedFetch('/api/v1/test', {
          method: 'POST'
        });
      });

      const postCall = global.fetch.mock.calls.find(call => call[0] === '/api/v1/test');
      expect(postCall[1].headers['X-CSRF-Token']).toBe('my-csrf-token');
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      mockFetchRouter({
        'GET /api/v1/auth/status': createMockResponse({
          ok: false,
          status: 401,
          body: { authenticated: false }
        }),
        'POST /api/v1/auth/login': createMockResponse({
          ok: false,
          status: 400,
          body: {
            success: false,
            message: 'Invalid credentials'
          }
        })
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Trigger an error
      await act(async () => {
        await result.current.login('testuser', 'wrongpassword');
      });

      expect(result.current.error).toBe('Invalid credentials');

      // Clear the error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
    });
  });

  describe('useAuth hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      // Suppress console.error for this test
      const consoleError = console.error;
      console.error = vi.fn();

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');

      console.error = consoleError;
    });
  });
});
