#!/usr/bin/env node

/**
 * Pre-Deployment DSP Status Check
 *
 * Run this before deploying to production to verify that curator DSP
 * implementation status is correctly set based on historical usage.
 *
 * This prevents curator lockout by ensuring:
 * 1. Migration 048 has been applied
 * 2. All curators with DSP history are marked as "implemented"
 * 3. No curators will be incorrectly locked out
 *
 * Usage:
 *   node server/scripts/dsp/pre-deploy-check.js
 *
 * Exit codes:
 *   0 - All checks passed, safe to deploy
 *   1 - Issues found, review before deploying
 */

import { getDatabase } from '../../database/db.js';

const checkMigrationApplied = (db) => {
  console.log('1️⃣  Checking migration 048 status...');

  try {
    const migration = db.prepare(`
      SELECT * FROM migrations
      WHERE filename = '048_add_dsp_implementation_status.js'
    `).get();

    if (!migration) {
      console.log('   ❌ Migration 048 has NOT been applied');
      console.log('   → Run: node server/database/migrate.js up');
      return false;
    }

    console.log('   ✓ Migration 048 applied');
    return true;
  } catch (error) {
    console.log('   ❌ Error checking migration:', error.message);
    return false;
  }
};

const checkColumnExists = (db) => {
  console.log('\n2️⃣  Checking dsp_implementation_status column...');

  try {
    const result = db.prepare(`
      SELECT dsp_implementation_status FROM curators LIMIT 1
    `).get();

    console.log('   ✓ Column exists');
    return true;
  } catch (error) {
    console.log('   ❌ Column does not exist');
    console.log('   → Run: node server/database/migrate.js up');
    return false;
  }
};

const checkCuratorStatus = (db) => {
  console.log('\n3️⃣  Checking curator DSP status assignments...');

  try {
    // Get all curators
    const curators = db.prepare('SELECT id, name, dsp_implementation_status FROM curators').all();

    if (curators.length === 0) {
      console.log('   ℹ️  No curators found in database');
      return true;
    }

    let potentialIssues = [];

    for (const curator of curators) {
      const status = curator.dsp_implementation_status || 'not_yet_implemented';

      // Check if curator has DSP history but is marked as not implemented
      if (status === 'not_yet_implemented') {
        const hasHistory = checkDSPHistory(db, curator.id);

        if (hasHistory) {
          potentialIssues.push({
            id: curator.id,
            name: curator.name,
            issue: 'Has DSP history but marked as not_yet_implemented'
          });
        }
      }
    }

    const implementedCount = curators.filter(c =>
      c.dsp_implementation_status === 'implemented'
    ).length;

    console.log(`   Total curators: ${curators.length}`);
    console.log(`   Marked as implemented: ${implementedCount}`);
    console.log(`   Marked as not implemented: ${curators.length - implementedCount}`);

    if (potentialIssues.length > 0) {
      console.log(`\n   ⚠️  Found ${potentialIssues.length} potential issue(s):`);
      potentialIssues.forEach(issue => {
        console.log(`      - ${issue.name} (ID: ${issue.id}): ${issue.issue}`);
      });
      console.log('\n   → Run: node server/scripts/dsp/update-dsp-status.js');
      return false;
    }

    console.log('   ✓ All curator statuses appear correct');
    return true;
  } catch (error) {
    console.log('   ❌ Error checking curator status:', error.message);
    return false;
  }
};

const checkDSPHistory = (db, curatorId) => {
  try {
    // Quick check for any DSP usage signals
    const hasTokens = db.prepare(`
      SELECT 1 FROM export_oauth_tokens
      WHERE owner_curator_id = ?
      LIMIT 1
    `).get(curatorId);

    if (hasTokens) return true;

    const hasExports = db.prepare(`
      SELECT 1 FROM export_requests er
      JOIN playlists p ON er.playlist_id = p.id
      WHERE p.curator_id = ?
        AND er.status IN ('completed', 'confirmed')
      LIMIT 1
    `).get(curatorId);

    if (hasExports) return true;

    const hasDSPPlaylists = db.prepare(`
      SELECT 1 FROM playlists
      WHERE curator_id = ?
        AND (
          spotify_url IS NOT NULL AND spotify_url != ''
          OR apple_url IS NOT NULL AND apple_url != ''
          OR tidal_url IS NOT NULL AND tidal_url != ''
        )
      LIMIT 1
    `).get(curatorId);

    if (hasDSPPlaylists) return true;

    const hasDSPTracks = db.prepare(`
      SELECT 1 FROM tracks t
      JOIN playlists p ON t.playlist_id = p.id
      WHERE p.curator_id = ?
        AND (
          t.spotify_id IS NOT NULL AND t.spotify_id != ''
          OR t.apple_id IS NOT NULL AND t.apple_id != ''
          OR t.tidal_id IS NOT NULL AND t.tidal_id != ''
        )
      LIMIT 1
    `).get(curatorId);

    return !!hasDSPTracks;
  } catch (error) {
    return false;
  }
};

const main = () => {
  console.log('🔍 Pre-Deployment DSP Status Check\n');
  console.log('═'.repeat(60));

  const db = getDatabase();
  const checks = [];

  // Run all checks
  checks.push(checkMigrationApplied(db));
  checks.push(checkColumnExists(db));
  checks.push(checkCuratorStatus(db));

  // Print summary
  console.log('\n' + '═'.repeat(60));
  const allPassed = checks.every(check => check === true);

  if (allPassed) {
    console.log('✅ All checks passed - SAFE TO DEPLOY');
    console.log('\nNo curator lockout issues detected.');
    console.log('Curators with DSP history are correctly marked as implemented.\n');
    process.exit(0);
  } else {
    console.log('❌ Issues detected - REVIEW BEFORE DEPLOYING');
    console.log('\nPlease resolve the issues above before deploying to production.');
    console.log('This prevents curator lockout and maintains access for users');
    console.log('who have historically used DSP integrations.\n');
    process.exit(1);
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
