#!/usr/bin/env node

/**
 * DSP Implementation Status Updater
 *
 * Retroactively determines and updates curator DSP implementation status
 * based on OAuth token presence and usage history.
 *
 * This script prevents unnecessary lockout of curators who have already
 * used DSP integrations by detecting:
 * - OAuth tokens (active or historical)
 * - Export requests history
 * - Imported playlists/tracks from DSPs
 *
 * Usage:
 *   node server/scripts/dsp/update-dsp-status.js [--curator-id=123] [--dry-run] [--verbose]
 *
 * Options:
 *   --curator-id=ID   Only check specific curator
 *   --dry-run         Show what would change without making updates
 *   --verbose         Show detailed detection logic
 */

import { getDatabase } from '../../database/db.js';

const args = process.argv.slice(2);
const options = {
  curatorId: null,
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose')
};

// Parse curator ID if provided
const curatorIdArg = args.find(arg => arg.startsWith('--curator-id='));
if (curatorIdArg) {
  options.curatorId = parseInt(curatorIdArg.split('=')[1], 10);
}

/**
 * Detect DSP implementation status for a curator based on multiple signals
 */
const detectDSPStatus = (db, curatorId, verbose = false) => {
  const signals = {
    hasTokens: false,
    hasExports: false,
    hasDSPPlaylists: false,
    hasDSPTracks: false,
    details: {}
  };

  try {
    // Signal 1: OAuth tokens (export_oauth_tokens)
    const tokenCheck = db.prepare(`
      SELECT COUNT(*) as count, GROUP_CONCAT(DISTINCT platform) as platforms
      FROM export_oauth_tokens
      WHERE owner_curator_id = ?
    `).get(curatorId);

    signals.hasTokens = tokenCheck?.count > 0;
    if (signals.hasTokens) {
      signals.details.tokenPlatforms = tokenCheck.platforms;
      if (verbose) console.log(`    → Has OAuth tokens for: ${tokenCheck.platforms}`);
    }

    // Signal 2: Export requests history
    const exportCheck = db.prepare(`
      SELECT COUNT(*) as count,
             GROUP_CONCAT(DISTINCT json_extract(er.destinations, '$[0]')) as platforms
      FROM export_requests er
      JOIN playlists p ON er.playlist_id = p.id
      WHERE p.curator_id = ?
        AND er.status IN ('completed', 'confirmed')
    `).get(curatorId);

    signals.hasExports = exportCheck?.count > 0;
    if (signals.hasExports) {
      signals.details.exportPlatforms = exportCheck.platforms;
      if (verbose) console.log(`    → Has export history for: ${exportCheck.platforms}`);
    }

    // Signal 3: Playlists with DSP URLs
    const playlistCheck = db.prepare(`
      SELECT
        COUNT(*) as count,
        SUM(CASE WHEN spotify_url IS NOT NULL AND spotify_url != '' THEN 1 ELSE 0 END) as spotify_count,
        SUM(CASE WHEN apple_url IS NOT NULL AND apple_url != '' THEN 1 ELSE 0 END) as apple_count,
        SUM(CASE WHEN tidal_url IS NOT NULL AND tidal_url != '' THEN 1 ELSE 0 END) as tidal_count
      FROM playlists
      WHERE curator_id = ?
        AND (
          spotify_url IS NOT NULL AND spotify_url != ''
          OR apple_url IS NOT NULL AND apple_url != ''
          OR tidal_url IS NOT NULL AND tidal_url != ''
        )
    `).get(curatorId);

    signals.hasDSPPlaylists = playlistCheck?.count > 0;
    if (signals.hasDSPPlaylists) {
      const platforms = [];
      if (playlistCheck.spotify_count > 0) platforms.push(`Spotify (${playlistCheck.spotify_count})`);
      if (playlistCheck.apple_count > 0) platforms.push(`Apple (${playlistCheck.apple_count})`);
      if (playlistCheck.tidal_count > 0) platforms.push(`Tidal (${playlistCheck.tidal_count})`);
      signals.details.playlistPlatforms = platforms.join(', ');
      if (verbose) console.log(`    → Has playlists with DSP URLs: ${signals.details.playlistPlatforms}`);
    }

    // Signal 4: Tracks with DSP IDs (evidence of imports)
    const trackCheck = db.prepare(`
      SELECT
        COUNT(DISTINCT t.id) as count,
        SUM(CASE WHEN t.spotify_id IS NOT NULL AND t.spotify_id != '' THEN 1 ELSE 0 END) as spotify_count,
        SUM(CASE WHEN t.apple_id IS NOT NULL AND t.apple_id != '' THEN 1 ELSE 0 END) as apple_count,
        SUM(CASE WHEN t.tidal_id IS NOT NULL AND t.tidal_id != '' THEN 1 ELSE 0 END) as tidal_count
      FROM tracks t
      JOIN playlists p ON t.playlist_id = p.id
      WHERE p.curator_id = ?
        AND (
          t.spotify_id IS NOT NULL AND t.spotify_id != ''
          OR t.apple_id IS NOT NULL AND t.apple_id != ''
          OR t.tidal_id IS NOT NULL AND t.tidal_id != ''
        )
    `).get(curatorId);

    signals.hasDSPTracks = trackCheck?.count > 0;
    if (signals.hasDSPTracks) {
      const platforms = [];
      if (trackCheck.spotify_count > 0) platforms.push(`Spotify (${trackCheck.spotify_count})`);
      if (trackCheck.apple_count > 0) platforms.push(`Apple (${trackCheck.apple_count})`);
      if (trackCheck.tidal_count > 0) platforms.push(`Tidal (${trackCheck.tidal_count})`);
      signals.details.trackPlatforms = platforms.join(', ');
      if (verbose) console.log(`    → Has tracks with DSP IDs: ${signals.details.trackPlatforms}`);
    }

    // Determine final status
    const isImplemented = signals.hasTokens || signals.hasExports ||
                          signals.hasDSPPlaylists || signals.hasDSPTracks;

    return {
      status: isImplemented ? 'implemented' : 'not_yet_implemented',
      signals,
      reason: isImplemented ? getImplementationReason(signals) : 'No DSP usage detected'
    };

  } catch (error) {
    console.error(`  ❌ Error checking curator ${curatorId}: ${error.message}`);
    return {
      status: 'not_yet_implemented',
      signals,
      reason: 'Error during detection',
      error: error.message
    };
  }
};

/**
 * Get human-readable reason for implementation status
 */
const getImplementationReason = (signals) => {
  const reasons = [];
  if (signals.hasTokens) reasons.push('has OAuth tokens');
  if (signals.hasExports) reasons.push('has export history');
  if (signals.hasDSPPlaylists) reasons.push('has DSP playlists');
  if (signals.hasDSPTracks) reasons.push('has DSP tracks');
  return reasons.join(', ');
};

/**
 * Main execution
 */
const main = () => {
  console.log('🔍 DSP Implementation Status Updater\n');

  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  const db = getDatabase();

  try {
    // Get curators to check
    let curators;
    if (options.curatorId) {
      const curator = db.prepare('SELECT id, name, dsp_implementation_status FROM curators WHERE id = ?')
        .get(options.curatorId);
      if (!curator) {
        console.error(`❌ Curator with ID ${options.curatorId} not found`);
        process.exit(1);
      }
      curators = [curator];
      console.log(`Checking single curator: ${curator.name} (ID: ${curator.id})\n`);
    } else {
      curators = db.prepare('SELECT id, name, dsp_implementation_status FROM curators ORDER BY name').all();
      console.log(`Checking ${curators.length} curator(s)...\n`);
    }

    const stats = {
      total: curators.length,
      alreadyImplemented: 0,
      newlyImplemented: 0,
      remainsNotImplemented: 0,
      errors: 0,
      changes: []
    };

    const updateStmt = db.prepare(`
      UPDATE curators
      SET dsp_implementation_status = ?
      WHERE id = ?
    `);

    // Check each curator
    for (const curator of curators) {
      const currentStatus = curator.dsp_implementation_status || 'not_yet_implemented';

      if (options.verbose) {
        console.log(`\n📋 ${curator.name} (ID: ${curator.id})`);
        console.log(`  Current status: ${currentStatus}`);
      }

      const detection = detectDSPStatus(db, curator.id, options.verbose);
      const newStatus = detection.status;

      if (currentStatus === 'implemented') {
        stats.alreadyImplemented++;
        if (options.verbose) {
          console.log(`  ✓ Already marked as implemented`);
        }
      } else if (newStatus === 'implemented') {
        stats.newlyImplemented++;
        stats.changes.push({
          id: curator.id,
          name: curator.name,
          from: currentStatus,
          to: newStatus,
          reason: detection.reason
        });

        console.log(`\n✓ ${curator.name} (ID: ${curator.id})`);
        console.log(`  Status change: ${currentStatus} → ${newStatus}`);
        console.log(`  Reason: ${detection.reason}`);

        if (!options.dryRun) {
          updateStmt.run(newStatus, curator.id);
        }
      } else {
        stats.remainsNotImplemented++;
        if (options.verbose) {
          console.log(`  → Remains as not_yet_implemented (${detection.reason})`);
        }
      }
    }

    // Print summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Summary');
    console.log('═'.repeat(60));
    console.log(`Total curators checked:        ${stats.total}`);
    console.log(`Already implemented:           ${stats.alreadyImplemented}`);
    console.log(`Newly marked as implemented:   ${stats.newlyImplemented} ${stats.newlyImplemented > 0 ? '✓' : ''}`);
    console.log(`Remain not implemented:        ${stats.remainsNotImplemented}`);

    if (stats.errors > 0) {
      console.log(`Errors encountered:            ${stats.errors}`);
    }

    if (options.dryRun && stats.newlyImplemented > 0) {
      console.log('\n⚠️  Dry run - no changes were saved to database');
      console.log('   Run without --dry-run to apply changes');
    } else if (stats.newlyImplemented > 0) {
      console.log('\n✅ Changes saved to database');
    } else {
      console.log('\n✓ No changes needed');
    }

    console.log('');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { detectDSPStatus, getImplementationReason };
