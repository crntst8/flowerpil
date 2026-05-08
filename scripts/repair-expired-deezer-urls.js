#!/usr/bin/env node

/**
 * Repair Expired Deezer Preview URLs
 *
 * This script identifies tracks with expired Deezer preview URLs and fetches
 * fresh URLs from the Deezer API. It handles both the hdnea parameter expiration
 * and provides proper retry logic.
 */

import { getQueries, getDatabase } from '../server/database/db.js';
import DeezerPreviewService from '../server/services/deezerPreviewService.js';

// Utility to check if Deezer URL has expired
function isDeezerUrlExpired(deezerUrl) {
  if (!deezerUrl) return true;

  try {
    const url = new URL(deezerUrl);
    const expParam = url.searchParams.get('hdnea');

    if (!expParam) {
      return true;
    }

    let decodedParam = expParam;
    try {
      decodedParam = decodeURIComponent(expParam);
    } catch (e) {
      decodedParam = expParam;
    }

    const expMatch = decodedParam.match(/exp[=:](\d+)/i);
    if (!expMatch) {
      return true;
    }

    const expTimestamp = parseInt(expMatch[1]);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // Consider expired if within 10 minutes of expiration
    const bufferSeconds = 600;
    return currentTimestamp >= (expTimestamp - bufferSeconds);
  } catch (error) {
    console.warn('Error parsing Deezer URL expiration:', error.message);
    return true;
  }
}

// Fetch fresh preview URL directly from Deezer track endpoint
async function getFreshPreviewUrl(deezerId) {
  try {
    const response = await fetch(`https://api.deezer.com/track/${deezerId}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Flowerpil/1.0.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.preview) {
      return {
        url: data.preview,
        deezer_id: data.id.toString(),
        title: data.title,
        artist: data.artist?.name
      };
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch fresh URL for Deezer ID ${deezerId}:`, error.message);
    return null;
  }
}

async function repairExpiredUrls(options = {}) {
  const {
    dryRun = false,
    limit = null,
    verbose = false,
    playlistId = null
  } = options;

  const queries = getQueries();
  const deezerService = new DeezerPreviewService();

  console.log('🔍 Scanning for expired Deezer preview URLs...\n');

  // Get all tracks with Deezer preview URLs
  let tracks;
  if (playlistId) {
    tracks = queries.getTracksByPlaylistId.all(playlistId);
  } else {
    // Get all tracks with preview URLs across all playlists
    const database = getDatabase();
    const allTracks = database.prepare(`
      SELECT * FROM tracks
      WHERE deezer_preview_url IS NOT NULL AND deezer_preview_url != ''
      ORDER BY preview_updated_at ASC
    `).all();
    tracks = allTracks;
  }

  console.log(`Found ${tracks.length} tracks with preview URLs`);

  // Filter to only expired URLs
  const expiredTracks = tracks.filter(track => {
    if (!track.deezer_preview_url) return false;
    const isExpired = isDeezerUrlExpired(track.deezer_preview_url);

    if (isExpired && verbose) {
      console.log(`  ❌ Track ${track.id}: "${track.title}" by ${track.artist} - URL expired`);
    }

    return isExpired;
  });

  console.log(`\n📊 Found ${expiredTracks.length} tracks with expired URLs\n`);

  if (expiredTracks.length === 0) {
    console.log('✅ No expired URLs found!');
    return { updated: 0, failed: 0, total: 0 };
  }

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
    expiredTracks.forEach(track => {
      console.log(`Would update: Track ${track.id} - "${track.title}" by ${track.artist}`);
      if (track.deezer_id) {
        console.log(`  Deezer ID: ${track.deezer_id}`);
      }
    });
    return { updated: 0, failed: 0, total: expiredTracks.length };
  }

  // Process tracks with rate limiting
  const tracksToProcess = limit ? expiredTracks.slice(0, limit) : expiredTracks;
  let updated = 0;
  let failed = 0;
  const batchSize = 5;

  console.log(`🔧 Starting repair process for ${tracksToProcess.length} tracks...\n`);

  for (let i = 0; i < tracksToProcess.length; i += batchSize) {
    const batch = tracksToProcess.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (track) => {
        try {
          let freshUrl = null;

          // Strategy 1: If we have a Deezer ID, fetch fresh URL directly from track endpoint
          if (track.deezer_id) {
            if (verbose) {
              console.log(`  🔄 Fetching fresh URL for track ${track.id} using Deezer ID ${track.deezer_id}...`);
            }

            const freshData = await getFreshPreviewUrl(track.deezer_id);
            if (freshData?.url) {
              freshUrl = freshData.url;

              // Update database with fresh URL
              queries.updateTrackPreview.run(
                track.deezer_id,
                freshUrl,
                track.preview_source || 'deezer-refresh',
                track.preview_confidence || 100,
                track.id
              );

              updated++;
              console.log(`  ✅ Track ${track.id}: Updated URL (via Deezer ID)`);
              return;
            }
          }

          // Strategy 2: Use DeezerPreviewService to search for track
          if (verbose) {
            console.log(`  🔄 Searching for track ${track.id} via Deezer search...`);
          }

          // Clear the cache for this track to force fresh fetch
          const cacheKey = `${track.id}_${track.isrc || 'no-isrc'}`;
          deezerService.cache.delete(cacheKey);

          const previewData = await deezerService.getPreviewForTrack(track);

          if (previewData?.url) {
            queries.updateTrackPreview.run(
              previewData.deezer_id,
              previewData.url,
              previewData.source,
              previewData.confidence,
              track.id
            );

            updated++;
            console.log(`  ✅ Track ${track.id}: "${track.title}" by ${track.artist} - Updated`);
          } else {
            failed++;
            console.log(`  ⚠️  Track ${track.id}: "${track.title}" by ${track.artist} - No preview found`);
          }
        } catch (error) {
          failed++;
          console.error(`  ❌ Track ${track.id}: "${track.title}" by ${track.artist} - Error: ${error.message}`);
        }
      })
    );

    // Rate limiting delay between batches
    if (i + batchSize < tracksToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log('\n📊 Repair Summary:');
  console.log(`  Total processed: ${tracksToProcess.length}`);
  console.log(`  ✅ Successfully updated: ${updated}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  Success rate: ${Math.round((updated / tracksToProcess.length) * 100)}%`);

  return { updated, failed, total: tracksToProcess.length };
}

// CLI interface
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  limit: null,
  playlistId: null
};

// Parse --limit=N
const limitArg = args.find(arg => arg.startsWith('--limit='));
if (limitArg) {
  options.limit = parseInt(limitArg.split('=')[1]);
}

// Parse --playlist=ID
const playlistArg = args.find(arg => arg.startsWith('--playlist='));
if (playlistArg) {
  options.playlistId = parseInt(playlistArg.split('=')[1]);
}

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node repair-expired-deezer-urls.js [options]

Options:
  --dry-run          Show what would be updated without making changes
  --verbose, -v      Show detailed progress information
  --limit=N          Only process first N expired URLs
  --playlist=ID      Only process tracks from specific playlist
  --help, -h         Show this help message

Examples:
  node repair-expired-deezer-urls.js --dry-run
  node repair-expired-deezer-urls.js --verbose --limit=10
  node repair-expired-deezer-urls.js --playlist=42
  `);
  process.exit(0);
}

// Run the repair
repairExpiredUrls(options)
  .then(result => {
    console.log('\n✅ Repair complete!');
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n❌ Repair failed:', error);
    process.exit(1);
  });
