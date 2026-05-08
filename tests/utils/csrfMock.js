/**
 * CSRF Token Mock Utilities
 *
 * Helpers for mocking CSRF tokens in frontend component tests.
 * The application uses CSRF double-submit cookie pattern where:
 * - Server sets a csrf_token cookie
 * - Frontend reads it and includes in request headers
 *
 * These utilities allow tests to simulate this behavior.
 */

/**
 * Mock a CSRF token in document.cookie
 *
 * @param {string} token - The CSRF token to set (default: 'test-csrf-token')
 * @returns {void}
 *
 * @example
 * import { mockCSRFToken } from '@/tests/utils/csrfMock';
 *
 * beforeEach(() => {
 *   mockCSRFToken('my-test-token');
 * });
 */
export function mockCSRFToken(token = 'test-csrf-token') {
  Object.defineProperty(document, 'cookie', {
    writable: true,
    value: `csrf_token=${token}`,
  });
}

/**
 * Clear all cookies from document.cookie
 *
 * @returns {void}
 *
 * @example
 * import { clearCSRFToken } from '@/tests/utils/csrfMock';
 *
 * afterEach(() => {
 *   clearCSRFToken();
 * });
 */
export function clearCSRFToken() {
  Object.defineProperty(document, 'cookie', {
    writable: true,
    value: '',
  });
}

/**
 * Get the current CSRF token from document.cookie
 *
 * @returns {string|null} The CSRF token or null if not found
 *
 * @example
 * import { getCSRFToken } from '@/tests/utils/csrfMock';
 *
 * const token = getCSRFToken();
 * expect(token).toBe('test-csrf-token');
 */
export function getCSRFToken() {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}
