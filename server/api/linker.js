import express from 'express';
import { optionalAuth } from '../middleware/auth.js';
import linkResolverService from '../services/linkResolverService.js';
import { isValidDSPUrl, getSupportedProviders } from '../services/urlParsing.js';

const router = express.Router();

/**
 * DSP Link Resolver API Routes
 * Stateless resolver for .club users to paste one DSP URL and get multi-platform links
 */

// Attach auth middleware
router.use(optionalAuth);

/**
 * Role-based access control middleware
 * Requires .club, curator, or admin role
 */
function requireClubOrAbove(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const allowedRoles = ['club', 'curator', 'admin'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. This feature requires .club membership or higher.'
    });
  }

  return next();
}

/**
 * POST /api/v1/linker/resolve-url
 * Resolve a DSP URL to normalized entity + multi-platform links
 *
 * Body: { url: string }
 * Query: persist=true, trackId=<number>
 */
router.post('/resolve-url', requireClubOrAbove, async (req, res) => {
  try {
    const { url } = req.body;
    const persist = req.query.persist === 'true';
    const trackId = req.query.trackId ? parseInt(req.query.trackId, 10) : null;

    // Validate input
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'URL is required and must be a string'
      });
    }

    // Validate URL format
    if (!isValidDSPUrl(url)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported URL. Supported providers: ${getSupportedProviders().join(', ')}`
      });
    }

    // Validate trackId if persist is requested
    if (persist && !trackId) {
      return res.status(400).json({
        success: false,
        error: 'trackId is required when persist=true'
      });
    }

    // Resolve URL
    console.log(`🔗 Resolving URL for user ${req.user.username} (${req.user.role}): ${url}`);

    const result = await linkResolverService.resolveUrl(url, {
      persist,
      trackId
    });

    return res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Link resolver error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to resolve URL'
    });
  }
});

/**
 * GET /api/v1/linker/supported-providers
 * Get list of supported DSP providers
 */
router.get('/supported-providers', requireClubOrAbove, (req, res) => {
  try {
    const providers = getSupportedProviders();

    return res.json({
      success: true,
      data: {
        providers,
        count: providers.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching supported providers:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch supported providers'
    });
  }
});

/**
 * GET /api/v1/linker/health
 * Health check for link resolver service
 */
router.get('/health', requireClubOrAbove, async (req, res) => {
  try {
    // Check if services are configured
    const health = {
      spotify: !!process.env.SPOTIFY_CLIENT_ID && !!process.env.SPOTIFY_CLIENT_SECRET,
      apple: !!process.env.APPLE_MUSIC_SCRAPER_ENABLED || !!process.env.APPLE_MUSIC_API_SEARCH,
      tidal: !!process.env.TIDAL_CLIENT_ID && !!process.env.TIDAL_CLIENT_SECRET,
      youtube: !!process.env.YOUTUBE_API_KEY,
      deezer: true // Public API, always available
    };

    const allHealthy = Object.values(health).every(v => v === true);

    return res.json({
      success: true,
      data: {
        status: allHealthy ? 'healthy' : 'degraded',
        services: health
      }
    });

  } catch (error) {
    console.error('❌ Health check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Health check failed'
    });
  }
});

export default router;
