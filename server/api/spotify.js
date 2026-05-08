import express from 'express';
import SpotifyService from '../services/spotifyService.js';
import logger from '../utils/logger.js';
import sharp from 'sharp';
import { join } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { authMiddleware } from '../middleware/auth.js';
import {
  resolveAccountContext,
  getExportToken,
  saveExportToken,
  isTokenExpired
} from '../services/exportTokenStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
const spotifyService = new SpotifyService();

const parseTokenUserInfo = (tokenRow) => {
  try {
    return tokenRow?.user_info ? JSON.parse(tokenRow.user_info) : {};
  } catch {
    return {};
  }
};

const refreshSpotifyTokenForContext = async (tokenRow, context) => {
  if (!tokenRow?.refresh_token) return null;
  const refreshed = await spotifyService.refreshAccessToken(tokenRow.refresh_token);
  const tokenData = {
    ...refreshed,
    refresh_token: refreshed.refresh_token || tokenRow.refresh_token
  };
  saveExportToken({
    platform: 'spotify',
    tokenData,
    userInfo: parseTokenUserInfo(tokenRow),
    accountType: context.accountType,
    ownerCuratorId: context.ownerCuratorId,
    accountLabel: tokenRow.account_label
  });
  return getExportToken('spotify', {
    accountType: context.accountType,
    ownerCuratorId: context.ownerCuratorId
  });
};

const resolveSpotifyAccessTokenForUser = async (user) => {
  try {
    const context = resolveAccountContext(user);
    let tokenRow = getExportToken('spotify', {
      accountType: context.accountType,
      ownerCuratorId: context.ownerCuratorId
    });

    if (!tokenRow) {
      return { tokenRow: null, context };
    }

    if (isTokenExpired(tokenRow)) {
      tokenRow = await refreshSpotifyTokenForContext(tokenRow, context);
    }

    return { tokenRow, context };
  } catch (error) {
    logger.error('SPOTIFY_LIBRARY', 'Failed to resolve Spotify token for user', error);
    return { tokenRow: null, context: null, error };
  }
};

const aggregateSpotifyLibrary = async ({ token, limit, offset, maxItems }) => {
  let collected = [];
  let nextOffset = offset;
  let total = null;
  let hasMore = true;
  let hitCap = false;

  while (hasMore) {
    const page = await spotifyService.getUserPlaylists(token, limit, nextOffset);
    const items = Array.isArray(page?.items) ? page.items : [];
    collected = collected.concat(items);
    total = total ?? page?.total ?? null;
    const pageLimit = page?.limit || limit;
    if (collected.length >= maxItems) {
      hitCap = true;
      break;
    }
    const pageHasMore = !!page?.next && items.length > 0;
    hasMore = pageHasMore;
    if (hasMore) {
      nextOffset += pageLimit;
    }
  }

  const capped = hitCap;

  return {
    items: collected,
    total: total ?? collected.length,
    fetched: collected.length,
    capped,
    limit,
    offset
  };
};

// Get Spotify authorization URL
router.get('/auth/url', (req, res) => {
  try {
    const state = req.query.state || Math.random().toString(36).substring(7);
    const authURL = spotifyService.getAuthURL(state);
    
    res.json({
      success: true,
      data: {
        authURL,
        state
      }
    });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate authorization URL'
    });
  }
});

// Handle OAuth callback
router.post('/auth/callback', async (req, res) => {
  try {
    const { code, state } = req.body;
    
    if (!code) {
      console.error('🚨 SPOTIFY: No authorization code received');
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required'
      });
    }

    logger.info('SpotifyAPI', 'Processing OAuth callback', { hasCode: !!code });
    const tokenData = await spotifyService.getAccessToken(code);
    
    res.json({
      success: true,
      data: {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        scope: tokenData.scope
      }
    });
  } catch (error) {
    console.error('🚨 SPOTIFY: Callback failed -', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to exchange authorization code',
      details: error.message
    });
  }
});

// Get user's playlists
router.get('/playlists', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
    }

    const accessToken = authHeader.substring(7);
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const playlists = await spotifyService.getUserPlaylists(accessToken, limit, offset);
    
    res.json({
      success: true,
      data: playlists
    });
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch playlists'
    });
  }
});

// Import tracks from Spotify playlist URL (no auth required, uses client credentials)
router.post('/import-url', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Spotify playlist URL is required'
    });
  }

  logger.info('SPOTIFY_URL_IMPORT', `Starting import from URL: ${url}`);

  try {
    // Extract playlist ID from URL
    const playlistId = spotifyService.extractPlaylistId(url);

    if (!playlistId) {
      logger.warn('SPOTIFY_URL_IMPORT', 'Invalid Spotify URL format', { url });
      return res.status(400).json({
        success: false,
        error: 'Invalid Spotify playlist URL. Please use a valid URL like: https://open.spotify.com/playlist/...'
      });
    }

    logger.info('SPOTIFY_URL_IMPORT', `Extracted playlist ID: ${playlistId}`);

    // Fetch playlist details using client credentials (public playlists only)
    const spotifyPlaylist = await spotifyService.getPublicPlaylistDetails(playlistId);

    // Transform tracks only (not playlist metadata)
    const tracks = spotifyService.transformTracksForFlowerpil(spotifyPlaylist.tracks);

    const processedTracks = await processSpotifyTracks(tracks);

    const duration = Date.now() - startTime;

    logger.success('SPOTIFY_URL_IMPORT', `Successfully processed tracks from Spotify playlist "${spotifyPlaylist.name}"`, {
      trackCount: processedTracks.length,
      spotifyPlaylistName: spotifyPlaylist.name,
      duration: `${duration}ms`
    });

    // Return processed tracks and playlist info for playlist creation
    res.json({
      success: true,
      data: {
        spotifyPlaylist: {
          name: spotifyPlaylist.name,
          description: spotifyPlaylist.description || '',
          image: spotifyPlaylist.images?.[0]?.url || '',
          spotify_url: spotifyPlaylist.external_urls?.spotify || ''
        },
        tracks: processedTracks
      },
      message: `Successfully processed ${processedTracks.length} tracks from "${spotifyPlaylist.name}"`
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    // Handle specific error cases
    if (error.message.includes('private')) {
      logger.warn('SPOTIFY_URL_IMPORT', 'Private playlist access attempted', { url, duration: `${duration}ms` });
      return res.status(403).json({
        success: false,
        error: 'This playlist is private and cannot be imported. Only public Spotify playlists can be imported via URL.',
        details: error.message
      });
    }

    if (error.response?.status === 404) {
      logger.warn('SPOTIFY_URL_IMPORT', 'Playlist not found', { url, duration: `${duration}ms` });
      return res.status(404).json({
        success: false,
        error: 'Spotify playlist not found. Please check the URL and try again.',
        details: error.message
      });
    }

    logger.error('SPOTIFY_URL_IMPORT', 'Failed to process tracks from URL', error, {
      url, duration: `${duration}ms`
    });

    res.status(500).json({
      success: false,
      error: 'Failed to import playlist from URL',
      details: error.message
    });
  }
});

// Import tracks from Spotify playlist (returns processed tracks for playlist creation)
router.post('/import/:playlistId', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const { playlistId } = req.params;
  
  logger.info('SPOTIFY_IMPORT', `Starting track import from Spotify playlist ${playlistId}`, {
    spotifyPlaylistId: playlistId
  });
  
  try {
    const accessToken = req.headers['x-spotify-token'];
    if (!accessToken) {
      logger.warn('SPOTIFY_IMPORT', 'Missing Spotify access token', { playlistId });
      return res.status(401).json({
        success: false,
        error: 'Spotify access token is required'
      });
    }

    // Fetch playlist details from Spotify
    const spotifyPlaylist = await spotifyService.getPlaylistDetails(accessToken, playlistId);
    
    // Transform tracks only (not playlist metadata)
    const tracks = spotifyService.transformTracksForFlowerpil(spotifyPlaylist.tracks);

    const processedTracks = await processSpotifyTracks(tracks);

    const duration = Date.now() - startTime;

    logger.success('SPOTIFY_IMPORT', `Successfully processed tracks from Spotify playlist "${spotifyPlaylist.name}"`, {
      trackCount: processedTracks.length,
      spotifyPlaylistName: spotifyPlaylist.name,
      duration: `${duration}ms`
    });

    // Return processed tracks and playlist info for playlist creation
    res.json({
      success: true,
      data: {
        spotifyPlaylist: {
          name: spotifyPlaylist.name,
          description: spotifyPlaylist.description || '',
          image: spotifyPlaylist.images?.[0]?.url || '',
          spotify_url: spotifyPlaylist.external_urls?.spotify || ''
        },
        tracks: processedTracks
      },
      message: `Successfully processed ${processedTracks.length} tracks from "${spotifyPlaylist.name}"`
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('SPOTIFY_IMPORT', 'Failed to process tracks', error, {
      spotifyPlaylistId: playlistId, duration: `${duration}ms`
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to process tracks',
      details: error.message
    });
  }
});

// Use stored admin/curator Spotify token to list library playlists
router.get('/library/playlists', authMiddleware, async (req, res) => {
  const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 50);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
  const requestedMax = Number.parseInt(req.query.max, 10);
  const maxItems = Math.min(Math.max(Number.isFinite(requestedMax) ? requestedMax : 2000, limit), 5000);

  const { tokenRow, context } = await resolveSpotifyAccessTokenForUser(req.user);
  const authCode = tokenRow ? 'AUTH_EXPIRED' : 'AUTH_REQUIRED';
  if (!tokenRow?.access_token) {
    return res.status(401).json({
      success: false,
      error: 'Spotify authentication required',
      code: authCode
    });
  }

  const fetchPlaylists = async (token, pageLimit = limit, pageOffset = offset) =>
    spotifyService.getUserPlaylists(token, pageLimit, pageOffset);

  try {
    if (!fetchAll) {
      const playlists = await fetchPlaylists(tokenRow.access_token);
      return res.json({
        success: true,
        data: playlists
      });
    }

    const playlists = await aggregateSpotifyLibrary({
      token: tokenRow.access_token,
      limit,
      offset,
      maxItems
    });
    return res.json({
      success: true,
      data: playlists
    });
  } catch (error) {
    if (error.response?.status === 401 && tokenRow.refresh_token && context) {
      try {
        const refreshed = await refreshSpotifyTokenForContext(tokenRow, context);
        const refreshedToken = refreshed?.access_token;
        if (refreshedToken) {
          const playlists = fetchAll
            ? await aggregateSpotifyLibrary({
                token: refreshedToken,
                limit,
                offset,
                maxItems
              })
            : await fetchPlaylists(refreshedToken);
          return res.json({
            success: true,
            data: playlists,
            refreshed: true
          });
        }
      } catch (refreshError) {
        logger.warn('SPOTIFY_LIBRARY', 'Token refresh failed while fetching library playlists', refreshError);
      }
    }

    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        error: 'Spotify authentication expired',
        code: 'AUTH_EXPIRED'
      });
    }

    logger.error('SPOTIFY_LIBRARY', 'Failed to load Spotify library playlists', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load Spotify library playlists',
      details: error.message
    });
  }
});

// Import a Spotify playlist using the stored admin/curator token
router.post('/library/import/:playlistId', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const { playlistId } = req.params;
  const { tokenRow, context } = await resolveSpotifyAccessTokenForUser(req.user);

  const authCode = tokenRow ? 'AUTH_EXPIRED' : 'AUTH_REQUIRED';
  if (!tokenRow?.access_token) {
    return res.status(401).json({
      success: false,
      error: 'Spotify authentication required',
      code: authCode
    });
  }

  const runImport = async (token) => {
    const spotifyPlaylist = await spotifyService.getPlaylistDetails(token, playlistId);
    const tracks = spotifyService.transformTracksForFlowerpil(spotifyPlaylist.tracks);
    const processedTracks = await processSpotifyTracks(tracks);
    return { spotifyPlaylist, processedTracks };
  };

  const respondWithPayload = (spotifyPlaylist, processedTracks) => res.json({
    success: true,
    data: {
      spotifyPlaylist: {
        name: spotifyPlaylist.name,
        description: spotifyPlaylist.description || '',
        image: spotifyPlaylist.images?.[0]?.url || '',
        spotify_url: spotifyPlaylist.external_urls?.spotify || ''
      },
      tracks: processedTracks
    },
    message: `Successfully processed ${processedTracks.length} tracks from "${spotifyPlaylist.name}"`
  });

  try {
    const { spotifyPlaylist, processedTracks } = await runImport(tokenRow.access_token);
    return respondWithPayload(spotifyPlaylist, processedTracks);
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error.response?.status === 401 && tokenRow.refresh_token && context) {
      try {
        const refreshed = await refreshSpotifyTokenForContext(tokenRow, context);
        const refreshedToken = refreshed?.access_token;
        if (refreshedToken) {
          const { spotifyPlaylist, processedTracks } = await runImport(refreshedToken);
          return respondWithPayload(spotifyPlaylist, processedTracks);
        }
      } catch (refreshError) {
        logger.warn('SPOTIFY_LIBRARY_IMPORT', 'Token refresh failed during library import', refreshError);
      }
    }

    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        error: 'Spotify authentication expired',
        code: 'AUTH_EXPIRED'
      });
    }

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        error: 'Spotify playlist not found',
        details: error.message
      });
    }

    logger.error('SPOTIFY_LIBRARY_IMPORT', 'Failed to import playlist from Spotify library', error, {
      playlistId,
      duration: `${duration}ms`
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to import playlist from Spotify library',
      details: error.message
    });
  }
});

// Analyze Spotify playlist (read-only, no database writes)
router.post('/analyze/:playlistId', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const { playlistId } = req.params;

  try {
    const accessToken = req.headers['x-spotify-token'];
    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: 'Spotify access token is required'
      });
    }

    logger.info('SPOTIFY_ANALYSIS', `Analyzing playlist ${playlistId}`);

    // 1. Fetch playlist details with all tracks
    const playlist = await spotifyService.getPlaylistDetails(accessToken, playlistId);

    // 2. Extract track IDs and artist IDs
    const trackIds = playlist.tracks
      .filter(item => item?.track?.id)
      .map(item => item.track.id);

    const uniqueArtistIds = [...new Set(
      playlist.tracks
        .filter(item => item?.track?.artists)
        .flatMap(item => item.track.artists.map(a => a.id))
        .filter(Boolean)
    )];

    logger.info('SPOTIFY_ANALYSIS', `Fetching data for ${trackIds.length} tracks and ${uniqueArtistIds.length} artists`);

    // 3. Batch fetch audio features and artist data in parallel
    const [audioFeatures, artistsData] = await Promise.all([
      spotifyService.fetchAudioFeaturesInBatches(accessToken, trackIds),
      spotifyService.fetchArtistsInBatches(accessToken, uniqueArtistIds)
    ]);

    // 4. Build track ID to audio features map
    const audioFeaturesMap = {};
    audioFeatures.forEach(feature => {
      if (feature && feature.id) {
        audioFeaturesMap[feature.id] = feature;
      }
    });

    // 5. Enrich tracks with audio features and artist genres
    const enrichedTracks = playlist.tracks
      .filter(item => item?.track)
      .map(item => {
        const track = item.track;
        const audioFeature = audioFeaturesMap[track.id] || {};

        // Get genres from all artists on track
        const genres = track.artists
          .map(artist => artistsData[artist.id]?.genres || [])
          .flat();

        return {
          id: track.id,
          title: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          artistIds: track.artists.map(a => a.id),
          album: track.album?.name || '',
          year: track.album?.release_date
            ? new Date(track.album.release_date).getFullYear()
            : null,
          releaseDate: track.album?.release_date || null,
          duration_ms: track.duration_ms,
          popularity: track.popularity || 0,
          explicit: track.explicit || false,

          // Audio features
          danceability: audioFeature.danceability,
          energy: audioFeature.energy,
          valence: audioFeature.valence,
          tempo: audioFeature.tempo,
          acousticness: audioFeature.acousticness,
          instrumentalness: audioFeature.instrumentalness,
          liveness: audioFeature.liveness,
          speechiness: audioFeature.speechiness,
          key: audioFeature.key,
          mode: audioFeature.mode,
          time_signature: audioFeature.time_signature,
          loudness: audioFeature.loudness,

          // Artist genres
          genres: genres
        };
      });

    const duration = Date.now() - startTime;

    logger.success('SPOTIFY_ANALYSIS', `Analysis complete for "${playlist.name}"`, {
      trackCount: enrichedTracks.length,
      artistCount: uniqueArtistIds.length,
      duration: `${duration}ms`
    });

    res.json({
      success: true,
      data: {
        playlist: {
          id: playlist.id,
          name: playlist.name,
          description: playlist.description || '',
          owner: playlist.owner?.display_name || '',
          image: playlist.images?.[0]?.url || '',
          url: playlist.external_urls?.spotify || '',
          total_tracks: playlist.tracks.length
        },
        tracks: enrichedTracks,
        artistsData: artistsData
      },
      duration: `${duration}ms`
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('SPOTIFY_ANALYSIS', 'Playlist analysis failed', error, {
      playlistId,
      duration: `${duration}ms`
    });

    res.status(500).json({
      success: false,
      error: 'Failed to analyze playlist',
      details: error.message,
      duration: `${duration}ms`
    });
  }
});

async function processSpotifyTracks(tracks = []) {
  return Promise.all(
    tracks.map(async (track, index) => {
      if (track.album_artwork_url) {
        try {
          const artwork = await spotifyService.downloadArtwork(
            track.album_artwork_url,
            `track-${track.spotify_id}-${Date.now()}.jpg`
          );

          if (artwork) {
            const processedImageFilename = await processAndSaveImage(artwork);
            return {
              ...track,
              position: index + 1,
              artwork_url: `/uploads/${processedImageFilename}`
            };
          }
        } catch (artworkError) {
          console.warn(`Failed to process artwork for ${track.title}:`, artworkError.message);
        }
      }
      return {
        ...track,
        position: index + 1
      };
    })
  );
}

// Helper function to process and save images
async function processAndSaveImage(artwork) {
  const uploadsDir = join(__dirname, '../../storage/uploads');

  // Ensure uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
  const sizes = [
    { suffix: '', width: 800, height: 800 },
    { suffix: '_md', width: 400, height: 400 },
    { suffix: '_sm', width: 200, height: 200 }
  ];

  // Process and save different sizes
  for (const size of sizes) {
    const outputPath = join(uploadsDir, `${filename.replace('.jpg', size.suffix + '.jpg')}`);

    await sharp(artwork.buffer)
      .resize(size.width, size.height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 })
      .toFile(outputPath);
  }

  return filename;
}

export default router;
