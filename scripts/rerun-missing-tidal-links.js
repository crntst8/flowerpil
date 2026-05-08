#!/usr/bin/env node

/**
 * Re-run linking for tracks missing TIDAL URLs
 *
 * Usage:
 *   node scripts/rerun-missing-tidal-links.js [playlistId]
 *
 * If no playlistId provided, will process all tracks with missing TIDAL URLs
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = process.env.DATABASE_PATH || join(__dirname, '../data/flowerpil.db');
const PLAYLIST_ID = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const MAX_RETRIES = 3;

console.log('🔄 Re-run Missing TIDAL Links');
console.log('═'.repeat(60));

if (PLAYLIST_ID) {
  console.log(`📋 Target: Playlist ID ${PLAYLIST_ID}`);
} else {
  console.log(`📋 Target: All playlists`);
}

const db = new Database(DB_PATH);

// Get tracks missing TIDAL URLs
const query = PLAYLIST_ID
  ? `
    SELECT
      id,
      playlist_id,
      title,
      artist,
      tidal_url,
      tidal_id,
      linking_status,
      linking_retry_count,
      linking_error
    FROM tracks
    WHERE playlist_id = ?
      AND (tidal_url IS NULL OR tidal_url = '')
      AND linking_status = 'completed'
    ORDER BY position ASC
  `
  : `
    SELECT
      id,
      playlist_id,
      title,
      artist,
      tidal_url,
      tidal_id,
      linking_status,
      linking_retry_count,
      linking_error
    FROM tracks
    WHERE (tidal_url IS NULL OR tidal_url = '')
      AND linking_status = 'completed'
    ORDER BY playlist_id ASC, position ASC
  `;

const tracks = PLAYLIST_ID
  ? db.prepare(query).all(PLAYLIST_ID)
  : db.prepare(query).all();

if (tracks.length === 0) {
  console.log('✅ No tracks found with missing TIDAL URLs');
  process.exit(0);
}

console.log(`\n📊 Found ${tracks.length} tracks missing TIDAL URLs\n`);

// Show sample of tracks to be re-queued
console.log('Sample tracks to re-queue:');
tracks.slice(0, 5).forEach((track, i) => {
  console.log(`  ${i + 1}. ${track.artist} - ${track.title}`);
  if (track.linking_error) {
    console.log(`     Error: ${track.linking_error.substring(0, 60)}...`);
  }
});

if (tracks.length > 5) {
  console.log(`  ... and ${tracks.length - 5} more\n`);
} else {
  console.log('');
}

// Confirm before proceeding
console.log(`⚠️  This will reset ${tracks.length} tracks to 'pending' status for re-linking`);
console.log(`⚠️  Retry counter will be reset to 0 (max ${MAX_RETRIES} retries allowed)\n`);

// Reset tracks to pending status
const updateStmt = db.prepare(`
  UPDATE tracks
  SET linking_status = 'pending',
      linking_retry_count = 0,
      linking_error = NULL,
      linking_lease_owner = NULL,
      linking_lease_expires = NULL,
      linking_updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const resetTxn = db.transaction((trackIds) => {
  let updated = 0;
  for (const id of trackIds) {
    const result = updateStmt.run(id);
    updated += result.changes || 0;
  }
  return updated;
});

try {
  const trackIds = tracks.map(t => t.id);
  const updated = resetTxn(trackIds);

  console.log(`✅ Successfully reset ${updated} tracks to pending status`);
  console.log(`✅ Linking worker will automatically process these tracks`);

  if (PLAYLIST_ID) {
    // Get playlist info
    const playlist = db.prepare('SELECT id, title, curator_id FROM playlists WHERE id = ?').get(PLAYLIST_ID);
    const curator = playlist ? db.prepare('SELECT name FROM curators WHERE id = ?').get(playlist.curator_id) : null;

    if (playlist && curator) {
      console.log(`\n📋 Playlist: "${playlist.title}" by ${curator.name}`);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`  - Tracks reset: ${updated}`);
  console.log(`  - Max retries per track: ${MAX_RETRIES}`);
  console.log(`  - Status: pending → will be picked up by linking-worker`);
  console.log('\n✅ Re-run initiated. Monitor PM2 logs: pm2 logs linking-worker');

} catch (error) {
  console.error('❌ Error resetting tracks:', error);
  process.exit(1);
} finally {
  db.close();
}
