/**
 * Test script for Apple Music search improvements
 * Tests the two specific tracks that were failing:
 * - Horsegirl - Switch Over
 * - Water From Your Eyes - Nights in Armor
 */

import appleMusicApiService from '../services/appleMusicApiService.js';

const testTracks = [
  {
    artist: 'Horsegirl',
    title: 'Switch Over',
    album: 'Versions of Modern Performance',
    description: 'Indie rock track from Chicago band'
  },
  {
    artist: 'Water From Your Eyes',
    title: 'Nights in Armor',
    album: 'Everyone\'s Crushed',
    description: 'Experimental pop track'
  }
];

async function testSearch(track) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${track.artist} - ${track.title}`);
  console.log(`Album: ${track.album}`);
  console.log(`Description: ${track.description}`);
  console.log('='.repeat(80));

  try {
    // Test with multi-storefront enabled (new behavior)
    console.log('\n🔍 Searching with multi-storefront fallback enabled...');
    const resultWithFallback = await appleMusicApiService.searchCatalogTrack({
      track: {
        artist: track.artist,
        title: track.title,
        album: track.album
      },
      storefront: 'us',
      tryMultipleStorefronts: true
    });

    if (resultWithFallback) {
      console.log('✅ FOUND with multi-storefront!');
      console.log(`   URL: ${resultWithFallback.url}`);
      console.log(`   Confidence: ${resultWithFallback.confidence}%`);
      console.log(`   Storefront: ${resultWithFallback.storefront}`);
      console.log(`   Match Strategy: ${resultWithFallback.matchStrategy}`);
      console.log(`   Source: ${resultWithFallback.source}`);
      if (resultWithFallback.scoreBreakdown) {
        console.log(`   Score Breakdown:`, resultWithFallback.scoreBreakdown);
      }
    } else {
      console.log('❌ NOT FOUND with multi-storefront');
    }

    // Test without multi-storefront (old behavior for comparison)
    console.log('\n🔍 Searching WITHOUT multi-storefront fallback (US only)...');
    const resultWithoutFallback = await appleMusicApiService.searchCatalogTrack({
      track: {
        artist: track.artist,
        title: track.title,
        album: track.album
      },
      storefront: 'us',
      tryMultipleStorefronts: false
    });

    if (resultWithoutFallback) {
      console.log('✅ FOUND in US storefront only');
      console.log(`   Confidence: ${resultWithoutFallback.confidence}%`);
    } else {
      console.log('❌ NOT FOUND in US storefront only');
    }

    return {
      track: `${track.artist} - ${track.title}`,
      foundWithFallback: !!resultWithFallback,
      foundWithoutFallback: !!resultWithoutFallback,
      improved: !!resultWithFallback && !resultWithoutFallback,
      confidence: resultWithFallback?.confidence || null,
      storefront: resultWithFallback?.storefront || null
    };

  } catch (error) {
    console.error(`❌ Error testing track: ${error.message}`);
    console.error(error.stack);
    return {
      track: `${track.artist} - ${track.title}`,
      error: error.message
    };
  }
}

async function runTests() {
  console.log('\n🧪 Testing Apple Music Search Improvements');
  console.log('Testing enhanced search with:');
  console.log('  - MAX_METADATA_RESULTS increased from 15 to 30');
  console.log('  - MAX_ALBUM_LOOKUPS increased from 3 to 7');
  console.log('  - SECONDARY_THRESHOLD reduced from 62 to 60');
  console.log('  - Multi-storefront fallback (AU, US, GB, CA)');
  console.log('');

  const results = [];

  for (const track of testTracks) {
    const result = await testSearch(track);
    results.push(result);

    // Wait a bit between searches to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  const foundWithFallback = results.filter(r => r.foundWithFallback).length;
  const foundWithoutFallback = results.filter(r => r.foundWithoutFallback).length;
  const improved = results.filter(r => r.improved).length;

  console.log(`\nTotal tracks tested: ${results.length}`);
  console.log(`Found with multi-storefront: ${foundWithFallback}/${results.length}`);
  console.log(`Found without multi-storefront (US only): ${foundWithoutFallback}/${results.length}`);
  console.log(`Improvement (found with fallback but not without): ${improved}/${results.length}`);

  results.forEach(result => {
    if (!result.error) {
      const status = result.foundWithFallback
        ? result.improved
          ? '✅ IMPROVED (now found!)'
          : '✅ FOUND'
        : '❌ NOT FOUND';
      console.log(`\n  ${result.track}: ${status}`);
      if (result.confidence) {
        console.log(`    Confidence: ${result.confidence}% | Storefront: ${result.storefront}`);
      }
    } else {
      console.log(`\n  ${result.track}: ❌ ERROR - ${result.error}`);
    }
  });

  console.log('\n');
}

// Run the tests
runTests().catch(error => {
  console.error('Test script failed:', error);
  process.exit(1);
});
