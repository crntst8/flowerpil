import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Qobuz Service
 * Handles scraping Qobuz playlists and matching tracks across DSPs
 */

const QOBUZ_URL_REGEX = /^https?:\/\/(?:www\.)?(?:qobuz\.com\/[a-z]{2}-[a-z]{2}\/playlists\/[^\/]+\/|widget\.qobuz\.com\/playlist\/|open\.qobuz\.com\/playlist\/)(\d+)(?:[/?].*)?$/i;
const CACHE_DIR = join(__dirname, '../../data/qobuz');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT_DELAY_MS = 100;

/**
 * Validate Qobuz URL format and extract playlist ID
 */
export function validateQobuzUrl(url) {
  const match = url.match(QOBUZ_URL_REGEX);
  if (!match) {
    return { valid: false, playlistId: null };
  }
  return { valid: true, playlistId: match[1] };
}

/**
 * Extract playlist ID from Qobuz URL
 */
export function extractQobuzPlaylistId(url) {
  const match = url.match(QOBUZ_URL_REGEX);
  return match ? match[1] : null;
}

/**
 * Check if cached playlist data exists and is fresh
 */
async function getCachedPlaylist(playlistId) {
  try {
    const cachePath = join(CACHE_DIR, `${playlistId}.json`);
    const stats = await fs.stat(cachePath);
    const age = Date.now() - stats.mtimeMs;

    if (age < CACHE_TTL_MS) {
      const data = await fs.readFile(cachePath, 'utf-8');
      const tracks = JSON.parse(data);
      console.log(`📦 Using cached Qobuz playlist data (age: ${Math.round(age / 1000 / 60)} minutes)`);
      return tracks;
    }

    console.log(`⏰ Cached data expired (age: ${Math.round(age / 1000 / 60)} minutes)`);
    return null;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`⚠️  Error reading cache: ${error.message}`);
    }
    return null;
  }
}

/**
 * Save playlist data to cache
 */
async function cachePlaylistData(playlistId, tracks) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const cachePath = join(CACHE_DIR, `${playlistId}.json`);
    await fs.writeFile(cachePath, JSON.stringify(tracks, null, 2), 'utf-8');
    console.log(`💾 Cached playlist data: ${cachePath}`);
  } catch (error) {
    console.warn(`⚠️  Failed to cache playlist data: ${error.message}`);
  }
}

/**
 * Execute qobuz.py script to scrape playlist
 */
async function executeQobuzScript(url) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(__dirname, '../python-services/qobuz/qobuz.py');

    console.log(`🐍 Executing Python script: python3 ${scriptPath} ${url}`);

    const child = spawn('python3', [scriptPath, url], {
      cwd: join(__dirname, '../..'),
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ Python script failed with code ${code}`);
        console.error(`stderr: ${stderr}`);
        reject(new Error(`Python script failed: ${stderr || 'Unknown error'}`));
      } else {
        console.log(`✅ Python script completed successfully`);
        resolve({ stdout, stderr });
      }
    });

    child.on('error', (error) => {
      console.error(`❌ Failed to execute Python script: ${error.message}`);
      reject(new Error(`Failed to execute Python script: ${error.message}`));
    });
  });
}

/**
 * Scrape Qobuz playlist and return tracks
 */
export async function scrapeQobuzPlaylist(url) {
  // Validate URL
  const validation = validateQobuzUrl(url);
  if (!validation.valid) {
    throw new Error('Invalid Qobuz URL format');
  }

  const { playlistId } = validation;
  console.log(`🎵 Scraping Qobuz playlist: ${playlistId}`);

  // Check cache
  const cached = await getCachedPlaylist(playlistId);
  if (cached) {
    return cached;
  }

  // Execute Python script
  await executeQobuzScript(url);

  // Read generated JSON file
  try {
    const jsonPath = join(CACHE_DIR, `${playlistId}.json`);
    const data = await fs.readFile(jsonPath, 'utf-8');
    const tracks = JSON.parse(data);

    console.log(`📄 Loaded ${tracks.length} tracks from Qobuz playlist`);
    return tracks;
  } catch (error) {
    throw new Error(`Failed to read scraped playlist data: ${error.message}`);
  }
}

/**
 * Match a single Qobuz track across DSPs
 */
export async function matchQobuzTrack(qobuzTrack, qobuzUrl) {
  console.log(`🔍 Matching track: ${qobuzTrack.artist} - ${qobuzTrack.title}`);

  const result = {
    qobuzTrack,
    matched: false,
    spotifyTrack: null,
    tidalMatch: null,
    appleMatch: null,
    qobuzUrl,
    skipReason: null
  };

  try {
    // Import services dynamically
    const { default: SpotifyService } = await import('./spotifyService.js');

    const spotifyService = new SpotifyService();

    // Primary search: Spotify (required for import)
    console.log(`  🎵 Searching Spotify...`);
    const spotifyResult = await spotifyService.searchByTrack({
      title: qobuzTrack.title,
      artist: qobuzTrack.artist,
      album: qobuzTrack.album,
      duration: qobuzTrack.duration
    });

    if (!spotifyResult) {
      result.skipReason = 'No Spotify match found';
      console.log(`  ❌ No Spotify match found`);
      return result;
    }

    result.spotifyTrack = spotifyResult;
    console.log(`  ✅ Spotify match: ${spotifyResult.id}`);

    // Always import from Spotify if match found - no confidence check required
    // Cross-linking will handle validation later
    result.matched = true; // Always match if Spotify match found
    console.log(`  ✅ Track matched - will be validated during cross-linking`);

    return result;

  } catch (error) {
    console.error(`  ❌ Error matching track: ${error.message}`);
    // If we have a Spotify match but error occurred during search, still import
    if (result.spotifyTrack) {
      result.matched = true;
      result.skipReason = null;
      console.log(`  ⚠️  Track will be imported despite error: ${error.message}`);
    } else {
      result.skipReason = `Matching error: ${error.message}`;
    }
    return result;
  }
}

/**
 * Batch match all tracks from Qobuz playlist
 */
export async function matchQobuzTracks(tracks, qobuzPlaylistUrl) {
  console.log(`🔄 Starting batch matching for ${tracks.length} tracks...`);

  const results = {
    matched: [],
    skipped: []
  };

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    console.log(`\n📊 Processing track ${i + 1}/${tracks.length}`);

    try {
      const matchResult = await matchQobuzTrack(track, qobuzPlaylistUrl);

      if (matchResult.matched) {
        results.matched.push(matchResult);
        // No confidence warnings needed - cross-linking will handle validation
      } else {
        results.skipped.push({
          title: track.title,
          artist: track.artist,
          reason: matchResult.skipReason || 'Unknown'
        });
      }
    } catch (error) {
      console.error(`❌ Failed to process track ${i + 1}: ${error.message}`);
      results.skipped.push({
        title: track.title,
        artist: track.artist,
        reason: `Processing error: ${error.message}`
      });
    }

    // Rate limiting between tracks
    if (i < tracks.length - 1) {
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }

  console.log(`\n✅ Batch matching complete:`);
  console.log(`   Matched: ${results.matched.length}`);
  console.log(`   Skipped: ${results.skipped.length}`);

  return results;
}

/**
 * Utility: Delay execution
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  validateQobuzUrl,
  extractQobuzPlaylistId,
  scrapeQobuzPlaylist,
  matchQobuzTrack,
  matchQobuzTracks
};
