/**
 * Frontend Test Setup - React Testing Library + JSDOM
 *
 * This setup file configures the test environment for React component tests.
 * It provides:
 * - @testing-library/jest-dom matchers
 * - JSDOM environment mocks (window.matchMedia, IntersectionObserver, etc.)
 * - Global fetch mock
 * - Automatic mock cleanup between tests
 */

import { beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom';

/**
 * Mock window.matchMedia
 * Required for components that use media queries
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated but still used by some libraries
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

/**
 * Mock IntersectionObserver
 * Required for components that use lazy loading or visibility detection
 */
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
};

/**
 * Mock global fetch
 * Tests should explicitly mock fetch responses using vi.mocked(global.fetch)
 */
global.fetch = vi.fn();

/**
 * Clear all mocks before each test
 * Ensures no test pollution from previous tests
 */
beforeEach(() => {
  vi.clearAllMocks();
});

console.log('🧪 Frontend test environment initialized (JSDOM)');
