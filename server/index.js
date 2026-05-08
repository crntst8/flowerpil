import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import https from 'https';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
// 2Git Test Server
// Import routes
import authRoutes from './api/auth.js';
import profileRoutes from './api/profile.js';
import savedRoutes from './api/saved.js';
import playlistEngagementRoutes from './api/playlist-engagement.js';
import listsRoutes from './api/lists.js';
import sharesRoutes from './api/shares.js';
import publicRoutes from './api/public.js';
import aboutRoutes from './api/about.js';
import perfectSundaysRoutes from './api/perfectSundays.js';
import siteAccessRoutes from './api/site-access.js';
import playlistRoutes from './api/playlists.js';
import trackRoutes from './api/tracks.js';
import uploadRoutes from './api/uploads.js';
import spotifyRoutes from './api/spotify.js';
import artworkRoutes from './api/artwork.js';
import previewRoutes from './api/preview.js';
import crossPlatformRoutes from './api/crossPlatform.js';
import linkerRoutes from './api/linker.js';
import curatorRoutes from './api/curators.js';
import releasesV2Routes from './api/releases-v2.js';
import blogPostRoutes from './api/blog-posts.js';
import featurePiecesRoutes from './api/feature-pieces.js';
import audioRoutes from './api/audio.js';
import top10Routes from './api/top10.js';
import usersRoutes from './api/users.js';
import showRoutes from './api/shows.js';
import logRoutes from './api/logs.js';
import siteProtectionRoutes from './api/admin/siteProtection.js';
// import handleManagerRoutes from './api/admin/handleManager.js';
// import securityMonitorRoutes from './api/admin/securityMonitor.js';
import systemConfigRoutes from './api/admin/systemConfig.js';
// import bioPagesAdminRoutes from './api/admin/bioPagesAdmin.js';
import siteAdminRoutes from './api/admin/siteAdmin.js';
import adminDashboardRoutes from './api/admin/dashboard.js';
import adminReferralRoutes from './api/admin/referrals.js';
import adminRequestsRoutes from './api/admin/requests.js';
import adminDeadLetterRoutes from './api/admin/dead-letter-tracks.js';
import adminScheduledImportsRoutes from './api/admin/scheduled-imports.js';
import adminDspTokensRoutes from './api/admin/dsp-tokens.js';
import adminAppleShareRoutes from './api/admin/apple-share.js';
import adminLinkoutRoutes from './api/admin/linkout.js';
import adminEndScrollRoutes from './api/admin/endScroll.js';
import adminTransfersRoutes from './api/admin/transfers.js';
import errorReportsRoutes from './api/admin/errorReports.js';
import adminCircuitBreakersRoutes from './api/admin/circuit-breakers.js';
import adminWorkerHealthRoutes from './api/admin/worker-health.js';
import adminStateRecoveryRoutes from './api/admin/state-recovery.js';
import adminMetricsRoutes from './api/admin/metrics.js';
import adminAnalyticsRoutes from './api/admin/analytics.js';
import adminDemoAccountsRoutes from './api/admin/demo-accounts.js';
import adminYouTubeCrossLinkRoutes from './api/admin/youtube-crosslink.js';
import adminQRCodeCTAsRoutes from './api/admin/qrCodeCtas.js';
import adminAnnouncementsRoutes from './api/admin/announcements.js';
import adminFeedVisibilityRoutes from './api/admin/feedVisibility.js';
import analyticsRoutes from './api/analytics.js';
import bioProfileRoutes from './api/bio-profiles.js';
import bioHandleRoutes from './api/bio-handles.js';
import bioThemeRoutes from './api/bio-themes.js';
import bioPageHandler from './api/bio-page-handler.js';
// Legacy new-music removed - see migration 071
import playlistExportRoutes from './api/playlist-export.js';
import appleMusicRoutes from './api/apple-music.js';
import tidalRoutes from './api/tidal.js';
import qobuzRoutes from './api/qobuz.js';
import soundcloudRoutes from './api/soundcloud.js';
import bandcampRoutes from './api/bandcamp.js';
import youtubeMusicRoutes from './api/youtube-music.js';
import urlImportRoutes from './api/url-import.js';
import quickImportRoutes from './api/quick-import.js';
import flagRoutes from './api/flags.js';
import curatorApiRoutes from './api/curator/index.js';
import exportRequestRoutes from './api/export-requests.js';
import devRoutes from './api/dev.js';
import playlistActionsRoutes from './api/playlist-actions.js';
import publicPlaylistsRoutes from './api/public-playlists.js';
import demoAccountsRoutes from './api/demo-accounts.js';
import embedRoutes from './api/embed.js';
import iconRoutes from './api/icons.js';
import testerFeedbackRoutes from './api/tester-feedback.js';
import userFeedbackRoutes from './api/user-feedback.js';
import configRoutes from './api/config.js';
import consentRoutes from './api/consent.js';
import metaRoutes from './api/meta.js';
import linkoutRoutes from './api/linkout.js';
import endScrollRoutes from './api/endScroll.js';
import testerFeedbackLogsRoutes from './api/internal/tester-feedback-logs.js';
import bootstrapRoutes from './api/bootstrap.js';
import sseRoutes from './api/sse.js';
import qrCodeCtasRoutes from './api/qrCodeCtas.js';
import announcementsRoutes from './api/announcements.js';
import publicUserRoutes from './api/public-user.js';
import adminUsersRoutes from './api/admin-users.js';
import adminUserGroupsRoutes from './api/admin-user-groups.js';
import backfillRoutes from './api/backfill.js';
import { start as startPlaylistScheduler } from './services/playlistSchedulerService.js';
import { startScheduledPublishService } from './services/scheduledPublishService.js';
import backfillSchedulerService from './services/backfillSchedulerService.js';
import { startFeedbackSync } from './services/testerFeedbackSyncService.js';
import { recoverStuckTransfers } from './services/transferRecoveryService.js';
import systemHealthMonitor from './services/systemHealthMonitor.js';
import { startTrackCleanup } from './services/trackCleanupService.js';
import { startStateRecovery } from './services/stateRecoveryService.js';
import { startAnalyticsService } from './services/analyticsService.js';
import './utils/pm2ErrorHandler.js'; // Must be first to capture uncaught errors
// Apple share URL resolver removed - URL resolution is not possible via API
// import { startAppleShareUrlResolver } from './services/appleShareUrlResolver.js';
import genreCategoryRoutes from './api/genreCategories.js';
import searchRoutes from './routes/search.js';
import sitemapRoutes from './api/sitemap.js';
import qobizHelpRoutes from './api/qobiz-help.js';
import appleFlowRoutes from './api/apple-flow.js';
import { webSocketServer } from './websocket/index.js';

// Import database and logging
import { initializeDatabase, getQueries } from './database/db.js';
import logger from './utils/logger.js';
import { getCacheStats } from './utils/memoryCache.js';
import { requestContextMiddleware } from './utils/requestContext.js';
import { errorLoggingMiddleware } from './middleware/logging.js';
import { pinoHttpMiddleware, requestIdMiddleware } from './middleware/pinoHttp.js';
import { generateBioPageCSS, generateBioMetaTags, generateBioPageHTML, resolveThemeStyles } from './utils/bioPageRenderer.js';
import { logFeatureStatus } from './config/imageFeatures.js';

// Import security middleware
import {
  loginLimiter,
  passwordChangeLimiter,
  adminApiLimiter,
  uploadLimiter,
  publicApiLimiter,
  siteAccessLimiter,
  quickImportLimiter
} from './middleware/rateLimiting.js';
import { 
  adminSecurityHeaders, 
  publicSecurityHeaders, 
  corsConfig,
  apiCacheHeaders
} from './middleware/securityHeaders.js';
import { validateCSRFToken, csrfDebugHeaders } from './middleware/csrfProtection.js';
import { bioHostRouting, devBioRouting } from './middleware/bioHostRouting.js';
import { mockAuthMiddleware, handleMockLogin } from './middleware/mockAuth.js';
import metricsMiddleware from './middleware/metricsMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure dotenv to load from project root
dotenv.config({ path: join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(requestContextMiddleware);

// Add pino-http for structured request logging and tracing
app.use(pinoHttpMiddleware);
app.use(requestIdMiddleware);

// Metrics collection middleware (captures all HTTP requests)
app.use(metricsMiddleware);

// Apply public security headers (basic helmet configuration)
app.use(publicSecurityHeaders);

// Compression middleware
app.use(compression());

// CORS configuration with enhanced security (reverted to normal)
app.use(cors(corsConfig));

// Apply public API rate limiting to all routes (disabled temporarily due to IPv6 issues)
// app.use(publicApiLimiter);

// CSRF debug headers (development only)
if (process.env.NODE_ENV !== 'production') {
  app.use(csrfDebugHeaders);
}

// Bio page development routing (query parameter support)
app.use(devBioRouting);

// Bio page host-based routing
app.use(bioHostRouting);

// Request logging middleware: verbose to files via logger, concise on console
app.use((req, res, next) => {
  // Suppress high-frequency worker lease/heartbeat logs entirely
  const urlPath = (req.originalUrl || '').split('?')[0] || '';
  if (urlPath === '/api/v1/cross-platform/lease' || urlPath === '/api/v1/cross-platform/heartbeat') {
    return next();
  }

  const start = Date.now();
  // File-based request log
  try { logger.apiRequest(req.method, req.originalUrl, req.query, req.body); } catch {}

  // Use res.on('finish') instead of patching res.send to avoid memory leaks
  res.on('finish', () => {
    const duration = Date.now() - start;
    try { logger.apiResponse(req.method, req.originalUrl, res.statusCode, undefined, duration); } catch {}
    try {
      systemHealthMonitor.recordRequest({
        method: req.method,
        route: (req.originalUrl || '').split('?')[0] || '',
        duration,
        statusCode: res.statusCode
      });
    } catch (error) {
      logger.debug?.('SYSTEM_HEALTH', 'Unable to record request metric', { error: error?.message });
    }

    // Console output only for errors (to keep PM2 logs meaningful)
    if (res.statusCode >= 400) {
      // Suppress console error for cross-platform stats endpoint to reduce spam
      const pathOnly = (req.originalUrl || '').split('?')[0] || '';
      if (!pathOnly.startsWith('/api/v1/cross-platform/stats')) {
        const responseLog = {
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          duration: `${duration}ms`
        };
        console.error(`[API_ERROR] ${JSON.stringify(responseLog)}`);
      }
    }
  });

  next();
});

// Trust proxy for Cloudflare -> NGINX -> Node chain
// Use explicit, non-permissive settings to satisfy express-rate-limit v7
const isDev = process.env.NODE_ENV !== 'production';
if (isDev) {
  // Development: trust localhost/loopback only
  app.set('trust proxy', 'loopback');
} else {
  // Production: trust two proxy hops (Cloudflare + local NGINX)
  // Numeric value keeps express-rate-limit happy while surfacing the real client IP
  app.set('trust proxy', 2);
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware (needed for httpOnly auth cookies)
import cookieParser from 'cookie-parser';
app.use(cookieParser());

// Mock authentication middleware for development
app.use(mockAuthMiddleware);

// Apply API cache-safety headers for all API routes
app.use('/api/v1', apiCacheHeaders);

// Dynamic sitemap generation (must be before static file serving)
app.use('/', sitemapRoutes);

// Static file serving with CORS headers
app.use('/uploads', (req, res, next) => {
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Access-Control-Allow-Origin', '*');
  // Images are immutable (content-addressed filenames)
  res.header('Cache-Control', 'public, max-age=31536000, immutable');
  res.header('Vary', 'Accept');
  next();
}, express.static(join(__dirname, '../storage/uploads')));

// Curator images serving
app.use('/uploads/curators', (req, res, next) => {
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Cache-Control', 'public, max-age=31536000, immutable');
  res.header('Vary', 'Accept');
  next();
}, express.static(join(__dirname, '../public/uploads/curators')));

// Release images serving
app.use('/uploads/releases', (req, res, next) => {
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Cache-Control', 'public, max-age=31536000, immutable');
  res.header('Vary', 'Accept');
  next();
}, express.static(join(__dirname, '../public/uploads/releases')));

// Icons serving for bio pages
app.use('/icons', (req, res, next) => {
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Cache-Control', 'public, max-age=31536000, immutable');
  next();
}, express.static(join(__dirname, '../public/icons')));

// Public assets (playlist action icons) for embeds
app.use('/assets', (req, res, next) => {
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Cache-Control', 'public, max-age=31536000, immutable');
  next();
}, express.static(join(__dirname, '../public/assets')));

// Public assets serving (logo, text, etc.)
app.use('/', (req, res, next) => {
  // Only serve specific files to avoid security issues
  const allowedFiles = ['logo.png', 'text.png', 'l.png', 'tel.png'];
  const fileName = req.path.substring(1); // Remove leading slash
  if (allowedFiles.includes(fileName)) {
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cache-Control', 'public, max-age=31536000, immutable');
    next();
  } else {
    next('route'); // Skip this middleware
  }
}, express.static(join(__dirname, '../public')));

// API routes with security middleware applied (rate limiting temporarily disabled)
// Auth routes with login rate limiting
app.use('/api/v1/auth', /* loginLimiter, */ authRoutes);

// Profile routes
app.use('/api/v1/profile', profileRoutes);

// Saved tracks routes
app.use('/api/v1/saved', savedRoutes);

// Lists routes
app.use('/api/v1/lists', listsRoutes);

// Shares management routes (authenticated)
app.use('/api/v1/shares', sharesRoutes);

// Top10 routes (authenticated)
app.use('/api/v1/top10', top10Routes);
app.use('/api/v1/users', usersRoutes);

// Public user management routes (authenticated)
app.use('/api/v1/user', validateCSRFToken, publicUserRoutes);

// About page content (public)
app.use('/api/v1/about-content', aboutRoutes);
app.use('/api/v1/perfect-sundays', perfectSundaysRoutes);

// Public share pages (no auth required)
app.use('/', publicRoutes);

// Dev-only mock auth routes
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/v1/auth/mock-login', handleMockLogin);

  app.get('/api/v1/auth/mock-status', (req, res) => {
    if (process.env.MOCK_AUTH_ENABLED !== 'true') {
      return res.status(404).json({ error: 'Mock auth disabled' });
    }

    res.json({
      enabled: true,
      availableUsers: ['admin', 'curator'],
      usage: {
        queryParameter: '?auth=admin|curator',
        header: 'X-Mock-Auth: admin|curator',
        endpoint: 'POST /api/v1/auth/mock-login { "authType": "admin" }'
      }
    });
  });
}

// Admin routes with strict security
app.use('/api/v1/admin/site-protection', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, siteProtectionRoutes);
// app.use('/api/v1/admin/handle-manager', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, handleManagerRoutes);
// app.use('/api/v1/admin/security-monitor', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, securityMonitorRoutes);
app.use('/api/v1/admin/system-config', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, systemConfigRoutes);
// app.use('/api/v1/admin/bio-pages', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, bioPagesAdminRoutes);
app.use('/api/v1/admin/dashboard', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminDashboardRoutes);
app.use('/api/v1/admin/site-admin', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, siteAdminRoutes);
// Top10 admin routes live in server/api/top10.js under the /admin/* prefix.
// This adapter mounts them at /api/v1/admin/top10/* so the site admin UI can call them consistently.
app.use('/api/v1/admin/top10', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, (req, res, next) => {
  const originalUrl = req.url;
  if (!req.url.startsWith('/admin')) {
    req.url = `/admin${req.url}`;
  }

  const restoreUrl = () => {
    req.url = originalUrl;
  };

  res.once('finish', restoreUrl);
  res.once('close', restoreUrl);

  top10Routes(req, res, (err) => {
    restoreUrl();
    next(err);
  });
});
app.use('/api/v1/admin/scheduled-imports', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminScheduledImportsRoutes);
app.use('/api/v1/admin/referrals', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminReferralRoutes);
app.use('/api/v1/admin/requests', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminRequestsRoutes);
app.use('/api/v1/admin/dead-letter-tracks', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminDeadLetterRoutes);
app.use('/api/v1/admin/dsp', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminDspTokensRoutes);
app.use('/api/v1/admin/apple-share', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminAppleShareRoutes);
app.use('/api/v1/admin/linkout', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminLinkoutRoutes);
app.use('/api/v1/admin/end-scroll', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminEndScrollRoutes);
app.use('/api/v1/admin/transfers', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminTransfersRoutes);
app.use('/api/v1/admin/error-reports', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, errorReportsRoutes);
app.use('/api/v1/admin/circuit-breakers', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminCircuitBreakersRoutes);
app.use('/api/v1/admin/worker-health', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminWorkerHealthRoutes);
app.use('/api/v1/admin/state-recovery', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminStateRecoveryRoutes);
app.use('/api/v1/admin/metrics', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminMetricsRoutes);
app.use('/api/v1/admin/analytics', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminAnalyticsRoutes);
app.use('/api/v1/admin/demo-accounts', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminDemoAccountsRoutes);
app.use('/api/v1/admin/youtube-crosslink', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminYouTubeCrossLinkRoutes);
app.use('/api/v1/admin/qr-ctas', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminQRCodeCTAsRoutes);
app.use('/api/v1/admin/users', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminUsersRoutes);
app.use('/api/v1/admin/user-groups', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminUserGroupsRoutes);
app.use('/api/v1/admin/announcements', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminAnnouncementsRoutes);
app.use('/api/v1/admin/feed-visibility', adminSecurityHeaders, /* adminApiLimiter, */ validateCSRFToken, adminFeedVisibilityRoutes);

// Curator API routes (authenticated)
app.use('/api/v1/curator', /* adminApiLimiter, */ validateCSRFToken, curatorApiRoutes);
app.use('/api/v1/demo-accounts', /* adminApiLimiter, */ validateCSRFToken, demoAccountsRoutes);

// Dev-only test routes (referral issuance, etc.)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/v1/dev', devRoutes);
}

// Upload routes with upload rate limiting
app.use('/api/v1/uploads', /* uploadLimiter, */ validateCSRFToken, uploadRoutes);

// Icon management routes (authenticated, CSRF protected)
app.use('/api/v1/icons', /* uploadLimiter, */ validateCSRFToken, iconRoutes);

// Admin-only routes that modify data (require CSRF protection)
app.use('/api/v1/tracks', /* adminApiLimiter, */ validateCSRFToken, trackRoutes);
app.use('/api/v1/artwork', /* adminApiLimiter, */ validateCSRFToken, artworkRoutes);
app.use('/api/v1/preview', /* adminApiLimiter, */ validateCSRFToken, previewRoutes);
app.use('/api/v1/cross-platform', /* adminApiLimiter, */ validateCSRFToken, crossPlatformRoutes);
// Quick import: public endpoint, no auth required, rate limited by IP
app.use('/api/v1/quick-import', quickImportLimiter, quickImportRoutes);
// URL import routes: only job creation mutates data, so keep CSRF focused.
const urlImportCSRFMiddleware = (req, res, next) => {
  if (req.path === '/jobs' && req.method === 'POST') {
    return validateCSRFToken(req, res, next);
  }
  return next();
};
app.use('/api/v1/url-import', /* adminApiLimiter, */ urlImportCSRFMiddleware, urlImportRoutes);
app.use('/api/v1/linker', /* adminApiLimiter, */ validateCSRFToken, linkerRoutes);
app.use('/api/v1/playlist-actions', /* adminApiLimiter, */ validateCSRFToken, playlistActionsRoutes);
app.use('/api/v1/export-requests', /* adminApiLimiter, */ validateCSRFToken, exportRequestRoutes);
app.use('/api/v1/sse', sseRoutes); // SSE doesn't use CSRF tokens

const playlistEngagementCSRFMiddleware = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return validateCSRFToken(req, res, next);
  }
  return next();
};
app.use('/api/v1/playlist-engagement', /* adminApiLimiter, */ playlistEngagementCSRFMiddleware, playlistEngagementRoutes);

// Spotify routes with selective CSRF protection (OAuth endpoints need to be public)
const spotifyCSRFMiddleware = (req, res, next) => {
  // Skip CSRF for OAuth endpoints and playlist fetching
  if (req.path.startsWith('/auth/') || (req.path.startsWith('/playlists') && req.method === 'GET')) {
    return next();
  }
  // Apply CSRF for admin operations like import (POST /import/:id)
  return validateCSRFToken(req, res, next);
};
app.use('/api/v1/spotify', /* adminApiLimiter, */ spotifyCSRFMiddleware, spotifyRoutes);

// Site access endpoint (no CSRF needed for password verification)
app.use('/api/site-access', siteAccessLimiter, siteAccessRoutes);

// Public read-only routes (no CSRF needed, lighter rate limiting via publicApiLimiter)
app.use('/api/v1/playlists', playlistRoutes);
app.use('/api/v1/config', configRoutes);
app.use('/api/v1/consent', consentRoutes);
app.use('/api/v1/meta', metaRoutes);
app.use('/api/v1/qr-ctas', qrCodeCtasRoutes);
app.use('/api/v1/linkout', linkoutRoutes);
app.use('/api/v1/end-scroll', endScrollRoutes);
// Announcements: GET is public, POST view/dismiss needs CSRF
const announcementsCSRFMiddleware = (req, res, next) => {
  if (req.method === 'POST') {
    return validateCSRFToken(req, res, next);
  }
  return next();
};
app.use('/api/v1/announcements', announcementsCSRFMiddleware, announcementsRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/bootstrap', bootstrapRoutes);
// Sanitized public endpoints for embeds + external consumers
// Loosen CORS for /api/v1/public when EMBED_PERMISSIVE is enabled
if (process.env.EMBED_PERMISSIVE === 'true') {
  app.use('/api/v1/public', cors({ origin: '*', methods: ['GET'], allowedHeaders: ['Content-Type'] }));
}
app.use('/api/v1', publicPlaylistsRoutes);
app.use('/api/v1/curators', curatorRoutes);
// Legacy new-music route removed - see migration 071
app.use('/api/v1/export', playlistExportRoutes);
app.use('/api/v1/apple', appleMusicRoutes);
app.use('/api/v1/tidal', tidalRoutes);
app.use('/api/v1/qobuz', qobuzRoutes);
app.use('/api/v1/soundcloud', soundcloudRoutes);
app.use('/api/v1/bandcamp', bandcampRoutes);
app.use('/api/v1/youtube-music', youtubeMusicRoutes);
app.use('/api/v1/genre-categories', genreCategoryRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/bio-profiles', bioProfileRoutes);
app.use('/api/v1/bio-handles', bioHandleRoutes);
app.use('/api/v1/bio-themes', bioThemeRoutes);
app.use('/api/v1/logs', logRoutes); // Frontend error logging - public endpoint
app.use('/api/v1', flagRoutes); // Flag submission and management
app.use('/api/v1', releasesV2Routes); // Releases MVP
app.use('/api/v1', blogPostRoutes); // Blog posts feature
app.use('/api/v1/feature-pieces', featurePiecesRoutes); // Premium editorial feature pieces
app.use('/api/v1/tester-feedback', testerFeedbackRoutes);
app.use('/api/v1/user-feedback', userFeedbackRoutes);
app.use('/api/v1/internal/tester-feedback', testerFeedbackLogsRoutes);
app.use('/api/v1/backfill', backfillRoutes);

// Conditionally register audio routes based on environment variable
if (process.env.ENABLE_AUDIO_FEATURES === 'true') {
  app.use('/api/v1', audioRoutes);
  console.log('✅ Audio routes enabled');
} else {
  console.log('🚫 Audio routes disabled');
}

app.use('/api/v1', showRoutes);
app.use('/api/v1/bio', bioPageHandler);

// Qobiz help page (must be before embed routes)
app.use('/qobiz-help', qobizHelpRoutes);

// Apple flow help page (must be before embed routes)
app.use('/apple-flow', appleFlowRoutes);

// Embed HTML routes (must be before wildcard handlers)
app.use('/api/v1', embedRoutes); // For dev proxy support
app.use('/', embedRoutes); // For clean public URLs



// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

app.get('/api/health/cache', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cache: getCacheStats()
  });
});

// Bio page rendering route (handles bio subdomain requests)
app.get('*', async (req, res, next) => {
  // Check if this is a bio page request (from NGINX X-Bio-Handle header)
  const bioHandle = req.headers['x-bio-handle'];
  
  if (bioHandle) {
    // Use the working bio page renderer service directly
    if (process.env.NODE_ENV === 'development') {
      logger.debug('BioPageHandler', 'Bio page request', { bioHandle });
    }
    
    try {
      const { getDatabase } = await import('./database/db.js');
      const bioPageRendererService = await import('./services/bioPageRenderer.js');
      
      // Get bio profile by handle using same query as bio-page-handler
      const db = getDatabase();
      const bioProfile = db.prepare(`
        SELECT 
          bp.id as bio_profile_id,
          bp.handle,
          bp.curator_id,
          bp.display_settings,
          bp.theme_settings,
          bp.seo_metadata,
          bp.published_content,
          bp.is_published,
          bp.published_at,
          bp.created_at as bio_created_at,
          bp.updated_at as bio_updated_at,
          c.id as curator_id,
          c.name as curator_name,
          c.profile_type,
          c.bio,
          c.bio_short,
          c.profile_image,
          c.location,
          c.website_url,
          c.contact_email,
          c.social_links as social_links,
          c.external_links as external_links,
          c.verification_status,
          c.profile_visibility,
          c.spotify_url,
          c.apple_url,
          c.tidal_url,
          c.bandcamp_url
        FROM bio_profiles bp 
        JOIN curators c ON bp.curator_id = c.id 
        WHERE bp.handle = ? AND bp.is_published = 1
      `).get(bioHandle);

      if (!bioProfile) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Bio Not Found - pil.bio</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body {
                  font-family: 'Paper Mono', monospace;
                  background: #000;
                  color: #fff;
                  text-align: center;
                  padding: 2rem;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                }
                .container {
                  border: 1px dashed rgba(255,255,255,0.3);
                  padding: 2rem;
                  max-width: 500px;
                }
                h1 { margin-bottom: 1rem; text-transform: uppercase; }
                p { margin-bottom: 1rem; opacity: 0.8; }
                a { color: #fff; text-decoration: none; border: 1px dashed rgba(255,255,255,0.3); padding: 0.5rem 1rem; }
                a:hover { background: rgba(255,255,255,0.1); }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Bio page not found</h1>
                <p>The handle "${bioHandle}" doesn't exist or hasn't been published.</p>
                <a href="https://flowerpil.io">← Back to Flowerpil</a>
              </div>
            </body>
          </html>
        `);
      }

      // Generate bio page using the working service
      const htmlOutput = await bioPageRendererService.generateBioPage(bioProfile);
      
      res.set({
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=300' // 5 minute cache
      });
      
      return res.send(htmlOutput);
      
    } catch (error) {
      console.error('Bio page render error:', error);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Error - pil.bio</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { 
                font-family: 'Paper Mono', monospace; 
                background: #000; 
                color: #fff; 
                text-align: center; 
                padding: 2rem;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
              }
              .container {
                border: 1px dashed rgba(255,255,255,0.3);
                padding: 2rem;
                max-width: 500px;
              }
              h1 { margin-bottom: 1rem; text-transform: uppercase; }
              p { margin-bottom: 1rem; opacity: 0.8; }
              a { color: #fff; text-decoration: none; border: 1px dashed rgba(255,255,255,0.3); padding: 0.5rem 1rem; }
              a:hover { background: rgba(255,255,255,0.1); }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Something went wrong</h1>
              <p>Unable to load bio page "${bioHandle}". Please try again later.</p>
              <a href="https://flowerpil.io">← Back to Flowerpil</a>
            </div>
          </body>
        </html>
      `);
    }
  }
  
  // Only handle bio page requests through middleware (fallback)
  if (!req.isBioPageRequest || !req.bioProfile) {
    return next();
  }

  try {
    const queries = getQueries();
    
    // Get complete bio profile data
    const bioProfile = queries.getPublishedBioProfile.get(req.bioHandle);
    if (!bioProfile) {
      return next(); // Let 404 handler take over
    }
    
    // Get featured links
    const featuredLinks = queries.getBioFeaturedLinks.all(bioProfile.id);
    
    // Parse JSON fields
    const parsedProfile = {
      ...bioProfile,
      display_settings: bioProfile.display_settings ? JSON.parse(bioProfile.display_settings) : {},
      theme_settings: bioProfile.theme_settings ? JSON.parse(bioProfile.theme_settings) : {},
      seo_metadata: bioProfile.seo_metadata ? JSON.parse(bioProfile.seo_metadata) : {},
      published_content: bioProfile.published_content ? JSON.parse(bioProfile.published_content) : {},
      social_links: bioProfile.social_links ? JSON.parse(bioProfile.social_links) : [],
      external_links: bioProfile.external_links ? JSON.parse(bioProfile.external_links) : []
    };
    
    const parsedFeaturedLinks = featuredLinks.map(link => ({
      ...link,
      link_data: link.link_data ? JSON.parse(link.link_data) : {},
      display_settings: link.display_settings ? JSON.parse(link.display_settings) : {}
    }));

    // Generate dynamic CSS from theme settings
    const themeStyles = resolveThemeStyles(parsedProfile.theme_settings);
    const themeCSS = generateBioPageCSS(themeStyles);

    // Generate meta tags
    const metaTags = generateBioMetaTags(parsedProfile, req.bioHandle);

    // Render bio page HTML
    const bioPageHTML = generateBioPageHTML({
      profile: parsedProfile,
      publishedContent: parsedProfile.published_content,
      featuredLinks: parsedFeaturedLinks,
      themeCSS,
      metaTags,
      handle: req.bioHandle
    });
    
    res.setHeader('Content-Type', 'text/html');
    res.send(bioPageHTML);
    
  } catch (error) {
    const errorLog = {
      level: 'ERROR',
      type: 'BIO_PAGE_RENDER_ERROR',
      error: error.message,
      stack: error.stack,
      bioHandle: req.bioHandle,
      profileId: req.bioProfile?.id,
      timestamp: new Date().toISOString()
    };
    console.error(`[PM2_ERROR] ${JSON.stringify(errorLog)}`);
    
    // Return error page
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Error Loading Bio Page</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: 'Paper Mono', monospace; 
              background: #000; 
              color: #fff; 
              margin: 0; 
              padding: 2rem;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
            }
            .container {
              text-align: center;
              border: 1px dashed rgba(255,255,255,0.3);
              padding: 2rem;
              max-width: 500px;
            }
            h1 { margin-bottom: 1rem; text-transform: uppercase; }
            p { margin-bottom: 1rem; opacity: 0.8; }
            a { color: #fff; text-decoration: none; border: 1px dashed rgba(255,255,255,0.3); padding: 0.5rem 1rem; }
            a:hover { background: rgba(255,255,255,0.1); }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Error Loading Bio Page</h1>
            <p>Sorry, there was an error loading "${req.bioHandle}" bio page.</p>
            <a href="https://flowerpil.io">← Back to Flowerpil</a>
          </div>
        </body>
      </html>
    `);
  }
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../dist')));

  // Resolve a playlist image value to an absolute URL for og:image
  const resolveOgImage = (imageValue) => {
    const siteUrl = 'https://flowerpil.io';
    const fallback = `${siteUrl}/og-image.png`;
    if (!imageValue || typeof imageValue !== 'string') return fallback;
    const trimmed = imageValue.trim();
    if (!trimmed) return fallback;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    // Relative path — build absolute URL using the large variant
    const withUploads = trimmed.startsWith('/uploads/') ? trimmed : `/uploads/${trimmed.replace(/^\/+/, '')}`;
    const extIdx = withUploads.lastIndexOf('.');
    if (extIdx === -1) return `${siteUrl}${withUploads}`;
    const base = withUploads.slice(0, extIdx).replace(/_(large|medium|small|original)$/i, '');
    const ext = withUploads.slice(extIdx);
    return `${siteUrl}${base}_large${ext}`;
  };

  const escHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Inject og meta tags for playlist pages so social crawlers see cover art
  app.get('/playlists/:id', (req, res) => {
    const indexPath = join(__dirname, '../dist/index.html');
    try {
      const queries = getQueries();
      const playlist = queries.getPlaylistById.get(req.params.id);
      if (!playlist || !playlist.published) {
        return res.sendFile(indexPath);
      }

      const ogImage = escHtml(resolveOgImage(playlist.image));
      const ogTitle = escHtml(
        playlist.curator_name
          ? `${playlist.title} by ${playlist.curator_name}`
          : playlist.title
      );
      const ogDescription = escHtml(
        playlist.description_short || playlist.description || 'A curated playlist on Flowerpil'
      );
      const ogUrl = `https://flowerpil.io/playlists/${playlist.id}`;

      let html = fs.readFileSync(indexPath, 'utf-8');

      const metaTags = [
        `<meta property="og:title" content="${ogTitle}" />`,
        `<meta property="og:description" content="${ogDescription}" />`,
        `<meta property="og:image" content="${ogImage}" />`,
        `<meta property="og:url" content="${ogUrl}" />`,
        `<meta property="og:type" content="music.playlist" />`,
        `<meta property="og:site_name" content="Flowerpil" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${ogTitle}" />`,
        `<meta name="twitter:description" content="${ogDescription}" />`,
        `<meta name="twitter:image" content="${ogImage}" />`,
      ].join('\n    ');

      html = html.replace('</head>', `    ${metaTags}\n  </head>`);
      res.send(html);
    } catch (err) {
      console.error('[OG_META] Failed to inject playlist meta:', err.message);
      res.sendFile(indexPath);
    }
  });

  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../dist/index.html'));
  });
}

// Error handling middleware
app.use(errorLoggingMiddleware);

app.use((err, req, res, next) => {
  // PM2-compatible error logging
  const errorLog = {
    level: 'ERROR',
    type: 'UNHANDLED_ERROR',
    method: req.method,
    url: req.originalUrl,
    error: err.message,
    stack: err.stack,
    type_specific: err.type,
    status: err.status || 500,
    timestamp: new Date().toISOString()
  };
  console.error(`[PM2_ERROR] ${JSON.stringify(errorLog)}`);
  
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'File too large',
      message: 'Upload size exceeds limit'
    });
  }
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  // PM2-compatible 404 logging
  const notFoundLog = {
    level: 'WARN',
    type: 'API_NOT_FOUND',
    method: req.method,
    url: req.originalUrl,
    path: req.originalUrl,
    status: 404,
    timestamp: new Date().toISOString()
  };
  console.error(`[PM2_ERROR] ${JSON.stringify(notFoundLog)}`);
  
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // PM2-compatible startup logging
    const startupLog = {
      level: 'INFO',
      type: 'SERVER_STARTUP',
      nodeEnv: process.env.NODE_ENV,
      port: PORT,
      host: process.env.HOST,
      frontendUrl: process.env.FRONTEND_URL,
      databaseUrl: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
      timestamp: new Date().toISOString()
    };
    console.log(`[PM2] ${JSON.stringify(startupLog)}`);

    logger.info('SERVER', 'Initializing database...');
    await initializeDatabase();
    logger.success('SERVER', 'Database initialized');

    // Log server startup timestamp for JWT invalidation tracking
    const { getServerStartupTime } = await import('./utils/authUtils.js');
    logger.info('SERVER', `Server startup timestamp: ${getServerStartupTime()} - All previous JWTs will be invalidated`);

    // Log image optimization feature status
    logFeatureStatus();

    try {
      startFeedbackSync();
    } catch (syncError) {
      logger.warn('SERVER', 'Tester feedback sync scheduler failed to start', { error: syncError?.message });
    }
    // Start background playlist import scheduler (lightweight)
    try { startPlaylistScheduler({ tickMs: 60000, maxConcurrent: 5 }); console.log('✅ Playlist scheduler started'); } catch {}
    // Start scheduled publish service (publishes drafts at their scheduled time)
    try { startScheduledPublishService(); console.log('✅ Scheduled publish service started'); } catch {}
    // Recover stuck transfer jobs from previous server instance
    try { recoverStuckTransfers(); console.log('✅ Transfer recovery checked'); } catch (recoveryError) {
      logger.warn('SERVER', 'Transfer recovery failed', { error: recoveryError?.message });
    }
    // Dead-letter cleanup for stalled linking jobs
    try { startTrackCleanup(); console.log('✅ Track cleanup service started'); } catch (cleanupError) {
      logger.warn('SERVER', 'Track cleanup service failed to start', { error: cleanupError?.message });
    }
    // Auto-recovery for stale state (expired leases, stuck exports, stale heartbeats)
    try { startStateRecovery(); console.log('✅ State recovery service started'); } catch (recoveryError) {
      logger.warn('SERVER', 'State recovery service failed to start', { error: recoveryError?.message });
    }
    // Site analytics service (realtime cleanup, data retention)
    try { startAnalyticsService(); console.log('✅ Analytics service started'); } catch (analyticsError) {
      logger.warn('SERVER', 'Analytics service failed to start', { error: analyticsError?.message });
    }
    // Backfill scheduler service (cross-links and previews)
    try { backfillSchedulerService.start(); console.log('✅ Backfill scheduler started'); } catch (backfillError) {
      logger.warn('SERVER', 'Backfill scheduler failed to start', { error: backfillError?.message });
    }
    // Apple share URL resolver disabled - URL resolution not possible via API
    // Manual sharing required in Apple Music app, Slack notification sent instead
    // try { startAppleShareUrlResolver(); console.log('✅ Apple share resolver started'); } catch (error) {
    //   console.warn('⚠️ Failed to start Apple share resolver', error?.message);
    // }
    
    if (process.env.NODE_ENV === 'production') {
      // Production: HTTP server (NGINX handles SSL termination)
      const server = app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
        logger.success('SERVER', `Flowerpil production server running on http://${process.env.HOST || '0.0.0.0'}:${PORT}`, {
          port: PORT,
          environment: process.env.NODE_ENV,
          healthCheck: `${process.env.FRONTEND_URL}/api/health`,
          frontend: process.env.FRONTEND_URL
        });
      });

      // Initialize WebSocket server
      webSocketServer.initialize(server);
      console.log('WebSocket server initialized on /ws');

      return server;
    } else {
      // Development: Check if HTTPS should be used
      const useHttps = process.env.USE_HTTPS === 'true';

      if (useHttps) {
        // Development HTTPS with configurable certificate paths
        const sslKeyPath = process.env.SSL_KEY_PATH || './certs/dev-key.pem';
        const sslCertPath = process.env.SSL_CERT_PATH || './certs/dev-cert.pem';

        try {
          const httpsOptions = {
            key: fs.readFileSync(sslKeyPath),
            cert: fs.readFileSync(sslCertPath)
          };

          const server = https.createServer(httpsOptions, app);

          server.listen(PORT, () => {
            logger.success('SERVER', `Flowerpil development server running on https://localhost:${PORT}`, {
              port: PORT,
              environment: process.env.NODE_ENV || 'development',
              healthCheck: `https://localhost:${PORT}/api/health`,
              frontend: process.env.FRONTEND_URL || 'https://localhost:5173',
              ssl: { keyPath: sslKeyPath, certPath: sslCertPath }
            });
          });

          // Initialize WebSocket server
          webSocketServer.initialize(server);
          console.log('WebSocket server initialized on /ws');

          return server;
        } catch (error) {
          logger.warn('SERVER', `Failed to load SSL certificates from ${sslKeyPath} and ${sslCertPath}. Falling back to HTTP.`, error);
          // Fall through to HTTP server
        }
      }

      // Development HTTP server (default for development)
      const server = app.listen(PORT, () => {
        logger.success('SERVER', `Flowerpil development server running on http://localhost:${PORT}`, {
          port: PORT,
          environment: process.env.NODE_ENV || 'development',
          healthCheck: `http://localhost:${PORT}/api/health`,
          frontend: process.env.FRONTEND_URL || 'http://localhost:5173'
        });
      });

      // Initialize WebSocket server
      webSocketServer.initialize(server);
      console.log('WebSocket server initialized on /ws');

      return server;
    }
  } catch (error) {
    logger.error('SERVER', 'Failed to start server', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

startServer();
