import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vitest Configuration - Frontend Tests
 *
 * JSDOM environment with React Testing Library for component tests
 */
export default defineConfig({
  test: {
    name: 'frontend',
    globals: true,
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['./tests/setup.frontend.js'],
    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage/frontend',
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'node_modules',
        'src/dev/**',
        'src/**/*.test.{js,jsx}'
      ],
      thresholds: {
        lines: 65,
        functions: 60,
        branches: 60,
        statements: 65
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@core': resolve(__dirname, './src/core'),
      '@modules': resolve(__dirname, './src/modules'),
      '@shared': resolve(__dirname, './src/shared')
    }
  }
});
