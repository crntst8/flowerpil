#!/usr/bin/env node

/**
 * Diagnostic script to debug Deezer preview playback issues
 * This script tests the entire preview flow from database to actual playback
 */

import { getDb, getQueries } from '../server/database/db.js';
import DeezerPreviewService from '../server/services/deezerPreviewService.js';

const deezerService = new DeezerPreviewService();

// Test if a Deezer URL actually works
async function testDeezerUrl(url, label = 'URL') {
  console.log(`\n🔍 Testing ${label}...`);
  console.log(`   URL: ${url}`);

  if (!url) {
    console.log('   ❌ URL is null/undefined');
    return false;
  }

  try {
    // Check expiration
    const isExpired = deezerService.isDeezerUrlExpired(url);
    console.log(`   Expired: ${isExpired ? '❌ YES' : '✅ NO'}`);

    // Try to fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'HEAD', // Just check headers, don't download the whole file
      headers: {
        'User-Agent': 'Flowerpil/1.0.0',
        'Accept': 'audio/*'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`   HTTP Status: ${response.status} ${response.statusText}`);
    console.log(`   Content-Type: ${response.headers.get('content-type')}`);
    console.log(`   Content-Length: ${response.headers.get('content-length')} bytes`);

    if (response.ok) {
      console.log('   ✅ URL is valid and accessible');
      return true;
    } else {
      console.log('   ❌ URL returned error status');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Fetch failed: ${error.message}`);
    return false;
  }
}

// Test fetching fresh URL from Deezer
async function testFreshFetch(track) {
  console.log(`\n🔄 Testing fresh fetch from Deezer...`);
  console.log(`   Track: ${track.artist} - ${track.title}`);
  console.log(`   ISRC: ${track.isrc || 'none'}`);
  console.log(`   Deezer ID: ${track.deezer_id || 'none'}`);

  try {
    const previewData = await deezerService.getPreviewForTrack(track);

    if (!previewData) {
      console.log('   ❌ No preview data returned');
      return null;
    }

    console.log(`   ✅ Got preview data:`);
    console.log(`      Source: ${previewData.source}`);
    console.log(`      Confidence: ${previewData.confidence}%`);
    console.log(`      Deezer ID: ${previewData.deezer_id}`);

    // Test the URL
    await testDeezerUrl(previewData.url, 'Fresh URL');

    return previewData;
  } catch (error) {
    console.log(`   ❌ Fresh fetch failed: ${error.message}`);
    return null;
  }
}

// Main diagnostic function
async function diagnose() {
  console.log('🔧 DEEZER PREVIEW PLAYBACK DIAGNOSTIC\n');
  console.log('=' .repeat(60));

  const db = getDb();
  const queries = getQueries();

  // 1. Check database for tracks with previews
  console.log('\n📊 DATABASE CHECK');
  console.log('-'.repeat(60));

  const tracksWithPreviews = db.prepare(`
    SELECT
      id, artist, title, isrc, deezer_id,
      deezer_preview_url, preview_source, preview_confidence,
      preview_updated_at,
      CAST((julianday('now') - julianday(preview_updated_at)) * 24 AS INTEGER) as hours_old
    FROM tracks
    WHERE deezer_preview_url IS NOT NULL
    LIMIT 5
  `).all();

  console.log(`\nFound ${tracksWithPreviews.length} tracks with preview URLs (showing first 5)`);

  if (tracksWithPreviews.length === 0) {
    console.log('\n⚠️  WARNING: No tracks have preview URLs in the database!');
    console.log('   This could be why playback is failing.');

    // Get a sample track without preview
    const sampleTrack = db.prepare(`
      SELECT id, artist, title, isrc, deezer_id
      FROM tracks
      WHERE deezer_preview_url IS NULL
      LIMIT 1
    `).get();

    if (sampleTrack) {
      console.log('\n   Let me try to fetch a preview for a sample track...');
      await testFreshFetch(sampleTrack);
    }

    return;
  }

  // 2. Test each preview URL
  console.log('\n🧪 TESTING STORED PREVIEW URLS');
  console.log('-'.repeat(60));

  let validCount = 0;
  let expiredCount = 0;
  let failedCount = 0;

  for (const track of tracksWithPreviews) {
    console.log(`\n${track.artist} - ${track.title}`);
    console.log(`   Database age: ${track.hours_old} hours old`);
    console.log(`   Source: ${track.preview_source}`);
    console.log(`   Confidence: ${track.preview_confidence}%`);

    const isValid = await testDeezerUrl(track.deezer_preview_url, 'Stored URL');

    if (isValid) {
      validCount++;
    } else {
      const isExpired = deezerService.isDeezerUrlExpired(track.deezer_preview_url);
      if (isExpired) {
        expiredCount++;
      } else {
        failedCount++;
      }
    }
  }

  // 3. Summary
  console.log('\n📈 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total tracks tested: ${tracksWithPreviews.length}`);
  console.log(`✅ Valid URLs: ${validCount}`);
  console.log(`⏰ Expired URLs: ${expiredCount}`);
  console.log(`❌ Failed URLs: ${failedCount}`);

  if (expiredCount > 0 || failedCount > 0) {
    console.log('\n⚠️  ISSUES DETECTED');

    if (expiredCount > 0) {
      console.log(`\n   ${expiredCount} URL(s) have expired.`);
      console.log('   Testing fresh fetch for first expired track...');

      const expiredTrack = tracksWithPreviews.find(t =>
        deezerService.isDeezerUrlExpired(t.deezer_preview_url)
      );

      if (expiredTrack) {
        await testFreshFetch(expiredTrack);
      }
    }

    if (failedCount > 0) {
      console.log(`\n   ${failedCount} URL(s) failed for non-expiration reasons.`);
      console.log('   This could indicate network issues or Deezer API changes.');
    }
  }

  // 4. Test the DeezerPreviewService cache
  console.log('\n💾 CACHE STATUS');
  console.log('-'.repeat(60));
  const stats = deezerService.getCacheStats();
  console.log(`Cache size: ${stats.size} entries`);
  console.log(`Cache TTL: ${stats.ttl / (60 * 1000)} minutes`);

  // 5. Test API endpoint simulation
  console.log('\n🌐 API ENDPOINT SIMULATION');
  console.log('-'.repeat(60));

  if (tracksWithPreviews.length > 0) {
    const testTrack = tracksWithPreviews[0];
    console.log(`\nSimulating GET /api/v1/preview/${testTrack.id}`);

    // Check cache age
    const updatedAt = new Date(testTrack.preview_updated_at);
    const hoursAgo = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);

    if (hoursAgo < 24) {
      console.log(`✅ Would return cached data (${hoursAgo.toFixed(1)} hours old)`);
      console.log(`   Response: {`);
      console.log(`     url: "/api/v1/preview/stream/${testTrack.id}",`);
      console.log(`     source: "${testTrack.preview_source}",`);
      console.log(`     confidence: ${testTrack.preview_confidence}`);
      console.log(`   }`);
    } else {
      console.log(`⏰ Cache expired, would fetch fresh data`);
      await testFreshFetch(testTrack);
    }

    console.log(`\nSimulating GET /api/v1/preview/stream/${testTrack.id}`);
    console.log(`   Would proxy request to: ${testTrack.deezer_preview_url}`);
    await testDeezerUrl(testTrack.deezer_preview_url, 'Stream proxy target');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ DIAGNOSTIC COMPLETE\n');
}

// Run diagnostic
diagnose().catch(error => {
  console.error('\n❌ Diagnostic failed:', error);
  process.exit(1);
});
