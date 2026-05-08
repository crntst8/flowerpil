#!/usr/bin/env node

/**
 * Enhanced Deezer Previews Backfill Script
 *
 * This script fills in missing Deezer audio previews for existing playlist tracks.
 * Enhanced to also lookup and store ISRC codes via Spotify API when missing.
 *
 * Process:
 * 1. For tracks without Deezer previews
 * 2. If track has no ISRC, lookup via Spotify API and store it
 * 3. Use ISRC (existing or newly fetched) to get Deezer preview
 * 4. Fall back to metadata search if ISRC lookup fails
 *
 * Usage:
 *   node scripts/backfill-deezer-previews-v2.js [options]
 *
 * Options:
 *   --playlist-id=<id>   Process only a specific playlist
 *   --limit=<n>          Limit number of tracks to process (default: no limit)
 *   --dry-run            Show what would be done without making changes
 *   --force              Refresh all previews, even if they exist
 *   --skip-isrc-lookup   Skip ISRC lookup via Spotify (use existing ISRC only)
 *
 * Examples:
 *   node scripts/backfill-deezer-previews-v2.js
 *   node scripts/backfill-deezer-previews-v2.js --playlist-id=123
 *   node scripts/backfill-deezer-previews-v2.js --limit=100 --dry-run
 */

import { getDatabase, getQueries } from '../server/database/db.js';
import DeezerPreviewService from '../server/services/deezerPreviewService.js';
import SpotifyService from '../server/services/spotifyService.js';

const args = process.argv.slice(2);
const options = {
  playlistId: null,
  limit: null,
  dryRun: false,
  force: false,
  skipIsrcLookup: false
};

// Parse command line arguments
for (const arg of args) {
  if (arg.startsWith('--playlist-id=')) {
    options.playlistId = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--limit=')) {
    options.limit = parseInt(arg.split('=')[1], 10);
  } else if (arg === '--dry-run') {
    options.dryRun = true;
  } else if (arg === '--force') {
    options.force = true;
  } else if (arg === '--skip-isrc-lookup') {
    options.skipIsrcLookup = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Enhanced Deezer Previews Backfill Script

This script fills in missing Deezer audio previews and ISRCs for existing playlist tracks.

Usage:
  node scripts/backfill-deezer-previews-v2.js [options]

Options:
  --playlist-id=<id>   Process only a specific playlist
  --limit=<n>          Limit number of tracks to process (default: no limit)
  --dry-run            Show what would be done without making changes
  --force              Refresh all previews, even if they exist
  --skip-isrc-lookup   Skip ISRC lookup via Spotify (use existing ISRC only)
  --help, -h           Show this help message

Examples:
  node scripts/backfill-deezer-previews-v2.js
  node scripts/backfill-deezer-previews-v2.js --playlist-id=123
  node scripts/backfill-deezer-previews-v2.js --limit=100 --dry-run
  node scripts/backfill-deezer-previews-v2.js --force
    `);
    process.exit(0);
  }
}

async function backfillDeezerPreviews() {
  const db = getDatabase();
  const queries = getQueries();
  const deezerService = new DeezerPreviewService();
  const spotifyService = new SpotifyService();

  console.log('========================================');
  console.log('Enhanced Deezer Preview Backfill Script');
  console.log('========================================');
  console.log();

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log();
  }

  if (options.skipIsrcLookup) {
    console.log('⏭️  ISRC lookup disabled - will use existing ISRCs only');
    console.log();
  }

  // Get tracks that need previews
  let tracksToProcess = [];

  if (options.playlistId) {
    console.log(`📋 Processing playlist: ${options.playlistId}`);
    const playlist = queries.getPlaylistById.get(options.playlistId);
    if (!playlist) {
      console.error(`❌ Playlist ${options.playlistId} not found`);
      process.exit(1);
    }
    console.log(`   Playlist: "${playlist.title}"`);

    if (options.force) {
      tracksToProcess = queries.getTracksByPlaylistId.all(options.playlistId);
    } else {
      tracksToProcess = queries.getTracksWithoutPreviews.all(options.playlistId);
    }
  } else {
    console.log('📋 Processing all playlists (including /perf)');

    if (options.force) {
      // Get all tracks from all playlists
      const allPlaylists = db.prepare('SELECT id FROM playlists WHERE published = 1').all();
      for (const playlist of allPlaylists) {
        const tracks = queries.getTracksByPlaylistId.all(playlist.id);
        tracksToProcess.push(...tracks);
      }
    } else {
      // Get all tracks without previews
      tracksToProcess = db.prepare(`
        SELECT * FROM tracks
        WHERE (deezer_preview_url IS NULL OR deezer_preview_url = '')
        ORDER BY playlist_id, position ASC
      `).all();
    }
  }

  if (options.limit && tracksToProcess.length > options.limit) {
    console.log(`⚠️  Limiting to ${options.limit} tracks (found ${tracksToProcess.length})`);
    tracksToProcess = tracksToProcess.slice(0, options.limit);
  }

  console.log();
  console.log(`📊 Total tracks to process: ${tracksToProcess.length}`);
  console.log();

  if (tracksToProcess.length === 0) {
    console.log('✅ No tracks need preview updates');
    return;
  }

  // Group tracks by playlist for better logging
  const tracksByPlaylist = new Map();
  for (const track of tracksToProcess) {
    if (!tracksByPlaylist.has(track.playlist_id)) {
      tracksByPlaylist.set(track.playlist_id, []);
    }
    tracksByPlaylist.get(track.playlist_id).push(track);
  }

  console.log(`📂 Playlists affected: ${tracksByPlaylist.size}`);
  console.log();

  // Statistics
  let processed = 0;
  let isrcLookups = 0;
  let isrcFound = 0;
  let previewsFound = 0;
  let previewsNotFound = 0;
  let errors = 0;
  let skipped = 0;

  // Process in batches to be respectful to APIs
  const batchSize = 5;
  const totalTracks = tracksToProcess.length;

  for (let i = 0; i < tracksToProcess.length; i += batchSize) {
    const batch = tracksToProcess.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(tracksToProcess.length / batchSize);

    console.log(`\n🔄 Processing batch ${batchNum}/${totalBatches} (tracks ${i + 1}-${Math.min(i + batchSize, totalTracks)})`);

    await Promise.all(
      batch.map(async (track) => {
        try {
          // Skip if preview already exists and is fresh (unless force mode)
          if (!options.force && track.deezer_preview_url && track.preview_updated_at) {
            const updatedAt = new Date(track.preview_updated_at);
            const hoursAgo = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);

            if (hoursAgo < 24) {
              console.log(`   ⏭️  Track ${track.id}: "${track.artist} - ${track.title}" (fresh preview, skipped)`);
              skipped++;
              return;
            }
          }

          let updatedTrack = { ...track };

          // Step 1: Fetch ISRC from Spotify if missing
          if (!track.isrc && !options.skipIsrcLookup) {
            isrcLookups++;
            try {
              console.log(`   🔍 Track ${track.id}: Looking up ISRC via Spotify...`);

              // Search for the track on Spotify
              const spotifyResult = await spotifyService.searchByMetadata(track.artist, track.title);

              if (spotifyResult && spotifyResult.id) {
                // Fetch full track details to get ISRC
                const token = await spotifyService.getClientCredentialsToken();
                const trackDetailsResponse = await spotifyService.makeRateLimitedRequest({
                  method: 'get',
                  url: `${spotifyService.baseURL}/tracks/${spotifyResult.id}`,
                  headers: { 'Authorization': `Bearer ${token}` }
                });

                const trackDetails = trackDetailsResponse.data;
                const isrc = trackDetails?.external_ids?.isrc;

                if (isrc) {
                  console.log(`   ✅ Track ${track.id}: ISRC found: ${isrc}`);
                  updatedTrack.isrc = isrc;
                  isrcFound++;

                  // Update ISRC in database
                  if (!options.dryRun) {
                    db.prepare('UPDATE tracks SET isrc = ? WHERE id = ?').run(isrc, track.id);
                  }
                } else {
                  console.log(`   ⚠️  Track ${track.id}: No ISRC in Spotify data`);
                }
              } else {
                console.log(`   ⚠️  Track ${track.id}: Not found on Spotify`);
              }
            } catch (isrcError) {
              console.log(`   ⚠️  Track ${track.id}: ISRC lookup failed - ${isrcError.message}`);
            }
          }

          // Step 2: Fetch Deezer preview (now with potentially updated ISRC)
          const previewData = await deezerService.getPreviewForTrack(updatedTrack);

          if (previewData) {
            if (options.dryRun) {
              console.log(`   ✅ Track ${track.id}: "${track.artist} - ${track.title}" (preview found - would update)`);
              console.log(`      Source: ${previewData.source}, Confidence: ${previewData.confidence}%`);
            } else {
              queries.updateTrackPreview.run(
                previewData.deezer_id,
                previewData.url,
                previewData.source,
                previewData.confidence,
                track.id
              );
              console.log(`   ✅ Track ${track.id}: "${track.artist} - ${track.title}"`);
              console.log(`      Source: ${previewData.source}, Confidence: ${previewData.confidence}%`);
            }
            previewsFound++;
          } else {
            console.log(`   ❌ Track ${track.id}: "${track.artist} - ${track.title}" (no preview found)`);
            previewsNotFound++;

            // Still update the timestamp to avoid repeated checks
            if (!options.dryRun) {
              queries.updateTrackPreview.run(null, null, null, null, track.id);
            }
          }

          processed++;
        } catch (error) {
          console.error(`   ⚠️  Track ${track.id}: Error - ${error.message}`);
          errors++;
        }
      })
    );

    // Small delay between batches to be respectful to APIs
    if (i + batchSize < tracksToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Show progress
    const progress = Math.min(i + batchSize, totalTracks);
    const percentage = Math.round((progress / totalTracks) * 100);
    console.log(`   Progress: ${progress}/${totalTracks} (${percentage}%)`);
  }

  // Final summary
  console.log();
  console.log('========================================');
  console.log('Summary');
  console.log('========================================');
  console.log(`Total tracks processed: ${processed}`);
  console.log();
  console.log('ISRC Lookups:');
  console.log(`  Attempted: ${isrcLookups}`);
  console.log(`  Found: ${isrcFound}`);
  console.log();
  console.log('Deezer Previews:');
  console.log(`  Found: ${previewsFound} (${Math.round((previewsFound / processed) * 100)}%)`);
  console.log(`  Not found: ${previewsNotFound}`);
  console.log(`  Skipped (fresh): ${skipped}`);
  console.log();
  console.log(`Errors: ${errors}`);
  console.log();

  if (options.dryRun) {
    console.log('🔍 DRY RUN COMPLETE - No changes were made');
  } else {
    console.log('✅ Backfill complete!');
  }

  // Show playlist statistics
  if (tracksByPlaylist.size > 0 && !options.dryRun) {
    console.log();
    console.log('Playlist Statistics:');
    for (const [playlistId, tracks] of tracksByPlaylist) {
      const playlist = queries.getPlaylistById.get(playlistId);
      if (!playlist) {
        console.log(`  Playlist ID ${playlistId} (deleted/not found)`);
        continue;
      }
      const stats = queries.getTrackPreviewStats.get(playlistId);
      const coverage = stats.total_tracks > 0
        ? Math.round((stats.with_previews / stats.total_tracks) * 100)
        : 0;

      console.log(`  ${playlist.title} (ID: ${playlistId})`);
      console.log(`    Coverage: ${coverage}% (${stats.with_previews}/${stats.total_tracks} tracks)`);
    }
  }
}

// Run the script
backfillDeezerPreviews()
  .then(() => {
    console.log();
    process.exit(0);
  })
  .catch((error) => {
    console.error();
    console.error('❌ Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  });
