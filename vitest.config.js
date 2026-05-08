/**
 * Vitest Configuration - Main
 *
 * The root unit-test command runs backend and frontend tests as separate
 * Vitest projects so each side keeps its own setup, environment, and aliases.
 */
import { defineConfig } from 'vitest/config';
import backendConfig from './vitest.config.backend.js';
import frontendConfig from './vitest.config.frontend.js';

export default defineConfig({
  test: {
    projects: [backendConfig, frontendConfig]
  }
});
