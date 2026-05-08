/**
 * Test App Factory
 *
 * Creates a minimal Express app instance for API testing.
 * This is a lightweight version of server/index.js configured for tests.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from '../../server/api/auth.js';
import appleMusicRoutes from '../../server/api/apple-music.js';
import curatorsRoutes from '../../server/api/curators.js';
import exportRequestsRoutes from '../../server/api/export-requests.js';
import playlistExportRoutes from '../../server/api/playlist-export.js';
import urlImportRoutes from '../../server/api/url-import.js';
import { initializeDatabase } from '../../server/database/db.js';

initializeDatabase();
const { default: curatorRoutes } = await import('../../server/api/curator/index.js');
const { default: playlistActionsRoutes } = await import('../../server/api/playlist-actions.js');

/**
 * Create an Express app configured for testing
 * @returns {express.Application} Express app instance
 */
export function createTestApp() {
  const app = express();

  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Initialize database (will use :memory: from test environment)
  initializeDatabase();

  // Mount routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/apple', appleMusicRoutes);
  app.use('/api/v1/curator', curatorRoutes);
  app.use('/api/v1/curators', curatorsRoutes);
  app.use('/api/v1/playlist-actions', playlistActionsRoutes);
  app.use('/api/v1/export-requests', exportRequestsRoutes);
  app.use('/api/v1/export', playlistExportRoutes);
  app.use('/api/v1/url-import', urlImportRoutes);

  // Basic error handler
  app.use((err, req, res, next) => {
    console.error('Test app error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  });

  // Ensure supertest binds to localhost to avoid sandbox restrictions
  const originalListen = app.listen.bind(app);
  app.listen = (port, hostname, backlog, callback) => {
    if (port && typeof port === 'object') {
      const options = { ...port };
      if (!options.port && options.port !== 0) {
        options.port = 0;
      }
      if (!options.host || options.host === '0.0.0.0') {
        options.host = '127.0.0.1';
      }
      return originalListen(options, hostname);
    }

    let actualPort = port;
    let actualHost = hostname;
    let actualBacklog = backlog;
    let actualCallback = callback;

    if (typeof actualPort === 'function') {
      actualCallback = actualPort;
      actualPort = 0;
      actualHost = '127.0.0.1';
      actualBacklog = undefined;
    } else if (typeof actualHost === 'function') {
      actualCallback = actualHost;
      actualHost = '127.0.0.1';
      actualBacklog = undefined;
    } else if (typeof actualBacklog === 'function') {
      actualCallback = actualBacklog;
      actualBacklog = undefined;
    }

    if (actualPort === undefined || actualPort === null) {
      actualPort = 0;
    }

    if (!actualHost || actualHost === '0.0.0.0') {
      actualHost = '127.0.0.1';
    }

    const args = [actualPort];

    if (actualHost !== undefined) {
      args.push(actualHost);
    }

    if (actualBacklog !== undefined) {
      args.push(actualBacklog);
    }

    if (actualCallback) {
      args.push(actualCallback);
    }

    return originalListen(...args);
  };

  return app;
}
