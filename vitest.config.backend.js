import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vitest Configuration - Backend Tests
 *
 * Node environment with database setup for API and service tests
 */
export default defineConfig({
  test: {
    name: 'backend',
    globals: true,
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    environment: 'node',
    include: ['server/**/*.test.js'],
    setupFiles: ['./tests/setup.backend.js'],
    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage/backend',
      include: ['server/**/*.js'],
      exclude: [
        'node_modules',
        'server/dev/**',
        'server/scripts/**',
        'server/**/*.test.js',
        'server/database/migrations/**'
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70
      }
    }
  },
  resolve: {
    alias: {
      'supertest': resolve(__dirname, './tests/utils/inMemoryRequest.js'),
      '@': resolve(__dirname, './src'),
      '@server': resolve(__dirname, './server')
    }
  }
});
