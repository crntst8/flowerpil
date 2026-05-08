import { getDatabase } from '../db.js';

/**
 * Migration 048: Add DSP Implementation Status to Curators
 *
 * Adds a new field to track the implementation status of DSP integrations
 * for curators. This helps site admins track which curators have had their
 * DSP API access (Spotify, Apple Music, TIDAL) fully implemented.
 *
 * IMPORTANT: Includes retroactive detection logic to mark curators as
 * "implemented" if they have historical OAuth token presence or usage.
 * This prevents unnecessary lockout of curators who have already used DSPs.
 */

/**
 * Retroactively determine DSP implementation status based on OAuth token
 * presence and usage history. Marks curator as "implemented" if ANY of:
 * - Has OAuth tokens in export_oauth_tokens table
 * - Has successfully exported playlists to DSPs (export_requests)
 * - Has imported from DSPs (playlist/track data with DSP IDs)
 */
const detectRetroactiveDSPStatus = (db, curatorId) => {
  try {
    // Check 1: OAuth tokens (export_oauth_tokens table)
    // This includes both flowerpil-managed and curator-owned tokens
    const hasTokens = db.prepare(`
      SELECT COUNT(*) as count
      FROM export_oauth_tokens eot
      WHERE eot.owner_curator_id = ?
         OR eot.account_label LIKE '%curator-' || ? || '%'
    `).get(curatorId, curatorId);

    if (hasTokens?.count > 0) {
      return 'implemented';
    }

    // Check 2: Export requests history (export_requests via playlists)
    const hasExports = db.prepare(`
      SELECT COUNT(*) as count
      FROM export_requests er
      JOIN playlists p ON er.playlist_id = p.id
      WHERE p.curator_id = ?
        AND er.status IN ('completed', 'confirmed')
    `).get(curatorId);

    if (hasExports?.count > 0) {
      return 'implemented';
    }

    // Check 3: Has playlists with DSP URLs (evidence of past imports/exports)
    const hasDSPPlaylists = db.prepare(`
      SELECT COUNT(*) as count
      FROM playlists
      WHERE curator_id = ?
        AND (
          spotify_url IS NOT NULL AND spotify_url != ''
          OR apple_url IS NOT NULL AND apple_url != ''
          OR tidal_url IS NOT NULL AND tidal_url != ''
        )
    `).get(curatorId);

    if (hasDSPPlaylists?.count > 0) {
      return 'implemented';
    }

    // Check 4: Has tracks with DSP IDs (evidence of imports from DSPs)
    const hasDSPTracks = db.prepare(`
      SELECT COUNT(*) as count
      FROM tracks t
      JOIN playlists p ON t.playlist_id = p.id
      WHERE p.curator_id = ?
        AND (
          t.spotify_id IS NOT NULL AND t.spotify_id != ''
          OR t.apple_id IS NOT NULL AND t.apple_id != ''
          OR t.tidal_id IS NOT NULL AND t.tidal_id != ''
        )
      LIMIT 1
    `).get(curatorId);

    if (hasDSPTracks?.count > 0) {
      return 'implemented';
    }

    return 'not_yet_implemented';
  } catch (error) {
    console.warn(`⚠️  Error detecting DSP status for curator ${curatorId}:`, error.message);
    return 'not_yet_implemented';
  }
};

export const up = () => {
  const db = getDatabase();

  console.log('🔄 Running migration: Add DSP implementation status to curators');

  try {
    db.exec('BEGIN');

    // Add the column
    try {
      db.exec(`
        ALTER TABLE curators
        ADD COLUMN dsp_implementation_status TEXT
        DEFAULT 'not_yet_implemented'
        CHECK (dsp_implementation_status IN ('not_yet_implemented', 'implemented'))
      `);
      console.log('✅ Added dsp_implementation_status column');
    } catch (error) {
      if (!String(error?.message || '').includes('duplicate column name')) {
        throw error;
      }
      console.log('⚠️  Column dsp_implementation_status already exists');
    }

    // Create index for filtering performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_curators_dsp_status
      ON curators(dsp_implementation_status)
    `);
    console.log('✅ Created index on dsp_implementation_status');

    // Retroactively detect and update DSP status for existing curators
    console.log('🔍 Detecting retroactive DSP implementation status...');

    const curators = db.prepare('SELECT id, name FROM curators').all();
    let implementedCount = 0;
    let notImplementedCount = 0;

    const updateStmt = db.prepare(`
      UPDATE curators
      SET dsp_implementation_status = ?
      WHERE id = ?
    `);

    for (const curator of curators) {
      const status = detectRetroactiveDSPStatus(db, curator.id);
      updateStmt.run(status, curator.id);

      if (status === 'implemented') {
        implementedCount++;
        console.log(`  ✓ Curator "${curator.name}" marked as implemented (has DSP history)`);
      } else {
        notImplementedCount++;
      }
    }

    console.log(`✅ Retroactive detection complete:`);
    console.log(`   - ${implementedCount} curator(s) marked as "implemented"`);
    console.log(`   - ${notImplementedCount} curator(s) remain as "not_yet_implemented"`);

    db.exec('COMMIT');
    console.log('✅ Migration completed: DSP implementation status added with retroactive detection');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

export const down = () => {
  const db = getDatabase();

  console.log('🔄 Rolling back migration: DSP implementation status');

  try {
    db.exec('BEGIN');

    // Drop the index
    db.exec('DROP INDEX IF EXISTS idx_curators_dsp_status');
    console.log('✅ Dropped index idx_curators_dsp_status');

    // Note: SQLite doesn't support DROP COLUMN easily, so we leave the column
    console.log('ℹ️  Note: Column dsp_implementation_status not removed (SQLite limitation)');

    db.exec('COMMIT');
    console.log('✅ Rollback completed');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  }
};
