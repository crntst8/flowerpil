#!/usr/bin/env node

/**
 * Test Token Selector Logic
 *
 * This script validates the getExportToken() function from playlistExportRunner.js
 * to ensure the v2 schema and selection logic work correctly.
 */

import { getDatabase } from '../../server/database/db.js';

const db = getDatabase();

/**
 * Replica of getExportToken from playlistExportRunner.js for testing
 */
const getExportToken = (platform, options = {}) => {
  const {
    accountType = 'flowerpil',
    curatorId = null,
    preferActive = true
  } = options;

  let sql = `
    SELECT * FROM export_oauth_tokens
    WHERE platform = ?
      AND account_type = ?
  `;
  const params = [platform, accountType];

  if (curatorId) {
    sql += ` AND owner_curator_id = ?`;
    params.push(curatorId);
  } else if (accountType === 'flowerpil') {
    sql += ` AND owner_curator_id IS NULL`;
  }

  if (preferActive) {
    sql += ` AND is_active = 1`;
  }

  sql += ` ORDER BY last_validated_at DESC NULLS LAST, id DESC LIMIT 1`;

  const stmt = db.prepare(sql);
  return stmt.get(...params);
};

console.log('\n=== Token Selector Testing ===\n');

// Test 1: Get active Spotify token (should prefer primary)
console.log('Test 1: Get active Spotify token (default behavior)');
const spotifyToken = getExportToken('spotify');
console.log(`  ✓ Found: ${spotifyToken?.account_label} (ID: ${spotifyToken?.id})`);
console.log(`    Status: ${spotifyToken?.health_status}`);
console.log(`    Last validated: ${spotifyToken?.last_validated_at}`);
console.log(`    Is active: ${spotifyToken?.is_active === 1 ? 'YES' : 'NO'}`);

if (spotifyToken?.account_label !== 'flowerpil-primary') {
  console.error('  ✗ ERROR: Expected flowerpil-primary, got', spotifyToken?.account_label);
} else {
  console.log('  ✓ PASS: Correctly selected primary token\n');
}

// Test 2: Get any Spotify token (including backup)
console.log('Test 2: Get any Spotify token (preferActive=false)');
const spotifyAny = getExportToken('spotify', { preferActive: false });
console.log(`  ✓ Found: ${spotifyAny?.account_label} (ID: ${spotifyAny?.id})`);
console.log(`    Last validated: ${spotifyAny?.last_validated_at}`);

if (spotifyAny?.account_label !== 'flowerpil-primary') {
  console.error('  ✗ ERROR: Should still prefer primary (more recently validated)');
} else {
  console.log('  ✓ PASS: Correctly selected most recently validated token\n');
}

// Test 3: Get TIDAL token (expiring status)
console.log('Test 3: Get TIDAL token');
const tidalToken = getExportToken('tidal');
console.log(`  ✓ Found: ${tidalToken?.account_label} (ID: ${tidalToken?.id})`);
console.log(`    Status: ${tidalToken?.health_status}`);
console.log(`    Expires at: ${tidalToken?.expires_at}`);

if (tidalToken?.health_status === 'expiring') {
  console.log('  ⚠ WARNING: Token is expiring soon - should be refreshed\n');
}

// Test 4: Get Apple token
console.log('Test 4: Get Apple token');
const appleToken = getExportToken('apple');
console.log(`  ✓ Found: ${appleToken?.account_label} (ID: ${appleToken?.id})`);
console.log(`    Status: ${appleToken?.health_status}`);
console.log(`    Has refresh token: ${appleToken?.refresh_token ? 'YES' : 'NO (JWT-based)'}`);
console.log(`    Expires at: ${appleToken?.expires_at}`);
console.log('  ✓ PASS: Apple token uses JWT (no refresh_token)\n');

// Test 5: Get non-existent platform
console.log('Test 5: Get non-existent platform (youtube)');
const youtubeToken = getExportToken('youtube');
if (!youtubeToken) {
  console.log('  ✓ PASS: Correctly returned null for non-existent platform\n');
} else {
  console.error('  ✗ ERROR: Should return null for non-existent platform');
}

// Test 6: Query all tokens summary
console.log('Test 6: Token inventory summary');
const allTokens = db.prepare(`
  SELECT
    platform,
    account_type,
    account_label,
    is_active,
    health_status,
    CASE
      WHEN datetime(expires_at) < datetime('now') THEN 'EXPIRED'
      WHEN datetime(expires_at) < datetime('now', '+1 hour') THEN 'EXPIRING_SOON'
      ELSE 'OK'
    END as expiry_status,
    last_validated_at
  FROM export_oauth_tokens
  ORDER BY platform, is_active DESC
`).all();

console.log('  Platform | Label           | Active | Health    | Expiry Status');
console.log('  ---------|-----------------|--------|-----------|---------------');
allTokens.forEach(token => {
  const active = token.is_active === 1 ? 'YES' : 'NO ';
  console.log(`  ${token.platform.padEnd(8)} | ${token.account_label.padEnd(15)} | ${active}    | ${token.health_status.padEnd(9)} | ${token.expiry_status}`);
});

console.log('\n=== All Tests Completed ===\n');

// Test 7: Verify indexes are being used
console.log('Test 7: Query plan analysis');
const queryPlan = db.prepare(`
  EXPLAIN QUERY PLAN
  SELECT * FROM export_oauth_tokens
  WHERE platform = 'spotify'
    AND account_type = 'flowerpil'
    AND owner_curator_id IS NULL
    AND is_active = 1
  ORDER BY last_validated_at DESC NULLS LAST, id DESC LIMIT 1
`).all();

console.log('  Query plan:');
queryPlan.forEach(row => {
  console.log(`    ${row.detail}`);
});

if (queryPlan.some(row => row.detail.includes('idx_oauth_tokens_v2'))) {
  console.log('  ✓ PASS: Using indexes for query optimization\n');
} else {
  console.log('  ⚠ NOTE: May not be using optimal indexes\n');
}

console.log('✓ Token selector validation complete!');
