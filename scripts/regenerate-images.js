#!/usr/bin/env node

/**
 * Regenerate Existing Images with WebP/AVIF
 *
 * This script downloads existing images from R2, processes them to generate
 * size variants and modern formats (WebP, AVIF), then uploads them back to R2.
 *
 * IMPORTANT: Must be run with --env-file flag to load environment variables:
 *   node --env-file=.env scripts/regenerate-images.js [options]
 *
 * Or pass environment variables inline:
 *   R2_ACCOUNT_ID="..." R2_BUCKET_NAME="..." node scripts/regenerate-images.js
 *
 * Options:
 *   --dry-run          Preview what would be processed without making changes
 *   --limit <number>   Limit number of images to process (for testing)
 *   --prefix <path>    Only process images with this prefix (e.g., "playlists/")
 *   --batch <number>   Process in batches of N images (default: 10)
 *
 * Environment Variables (required):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
 *
 * Examples:
 *   node --env-file=.env scripts/regenerate-images.js --dry-run --limit 5
 *   node --env-file=.env scripts/regenerate-images.js --prefix playlists/ --batch 3
 */

import { getDatabase } from '../server/database/db.js';
import { uploadToR2 } from '../server/utils/r2Storage.js';
import sharp from 'sharp';
import axios from 'axios';

// Validate required environment variables
const requiredEnvVars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nMake sure to run with --env-file flag:');
  console.error('  node --env-file=.env scripts/regenerate-images.js\n');
  console.error('Or create .env file first:');
  console.error('  cp .env.example .env\n');
  process.exit(1);
}

const args = process.argv.slice(2);

// Parse arguments
const dryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : null;
const prefixIndex = args.indexOf('--prefix');
const prefix = prefixIndex !== -1 ? args[prefixIndex + 1] : null;
const batchIndex = args.indexOf('--batch');
const batchSize = batchIndex !== -1 ? parseInt(args[batchIndex + 1], 10) : 10;

const db = getDatabase();

// Image tables and columns
const imageTables = {
  playlists: { column: 'image', idColumn: 'id' },
  tracks: { column: 'artwork_url', idColumn: 'id' },
  curators: { column: 'profile_image', idColumn: 'id' }
};

/**
 * Process image buffer to generate all size variants and formats
 */
async function processImageFormats(buffer, width, height, quality = 85) {
  const results = {};

  try {
    // Generate JPEG
    results.jpeg = await sharp(buffer)
      .resize(width, height, { fit: 'cover', position: 'center' })
      .jpeg({
        quality,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();

    // Generate WebP
    results.webp = await sharp(buffer)
      .resize(width, height, { fit: 'cover', position: 'center' })
      .webp({
        quality,
        alphaQuality: quality,
        effort: 4
      })
      .toBuffer();

    // Generate AVIF
    const avifQuality = Math.max(60, quality - 20);
    results.avif = await sharp(buffer)
      .resize(width, height, { fit: 'cover', position: 'center' })
      .avif({
        quality: avifQuality,
        effort: 4,
        chromaSubsampling: '4:2:0'
      })
      .toBuffer();

    return results;
  } catch (error) {
    console.error(`  ❌ Error processing image:`, error.message);
    return null;
  }
}

/**
 * Extract R2 key from URL
 */
function extractR2Key(url) {
  if (!url) return null;

  // Remove domain and get path
  if (url.includes('images.flowerpil.io/')) {
    return url.split('images.flowerpil.io/')[1];
  }

  if (url.startsWith('/uploads/')) {
    return url.replace('/uploads/', '');
  }

  return null;
}

/**
 * Download image from R2
 */
async function downloadImage(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`  ❌ Failed to download ${url}:`, error.message);
    return null;
  }
}

/**
 * Get all size configurations to generate
 */
function getAllSizes() {
  return [
    { name: 'original', width: 1200, height: 1200, quality: 95 },
    { name: 'large', width: 800, height: 800, quality: 85 },
    { name: 'medium', width: 400, height: 400, quality: 85 },
    { name: 'small', width: 200, height: 200, quality: 85 }
  ];
}

/**
 * Get base filename without size suffix or extension
 */
function getBaseFilename(key) {
  // Remove extension
  const withoutExt = key.replace(/\.(jpg|jpeg|png|webp|avif)$/i, '');
  // Remove size suffix if present
  return withoutExt.replace(/_(large|medium|small|original)$/i, '');
}

/**
 * Collect all unique image URLs from database
 */
function collectImageUrls() {
  const imageUrls = new Set();

  for (const [table, config] of Object.entries(imageTables)) {
    try {
      const rows = db.prepare(`
        SELECT DISTINCT ${config.column} as url
        FROM ${table}
        WHERE ${config.column} IS NOT NULL
        AND ${config.column} != ''
      `).all();

      rows.forEach(row => {
        if (row.url && row.url.includes('images.flowerpil.io')) {
          imageUrls.add(row.url);
        }
      });
    } catch (error) {
      console.error(`⚠️  Error scanning ${table}:`, error.message);
    }
  }

  return Array.from(imageUrls);
}

/**
 * Main regeneration function
 */
async function regenerateImages() {
  console.log('🎨 Image Regeneration Script\n');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will upload files)'}`);
  if (limit) console.log(`Limit: ${limit} images`);
  if (prefix) console.log(`Prefix filter: ${prefix}`);
  console.log(`Batch size: ${batchSize}\n`);

  // Collect all image URLs
  console.log('📊 Collecting image URLs from database...');
  let imageUrls = collectImageUrls();

  console.log(`✅ Found ${imageUrls.length} unique image URLs\n`);

  // Filter by prefix if specified
  if (prefix) {
    imageUrls = imageUrls.filter(url => {
      const key = extractR2Key(url);
      return key && key.startsWith(prefix);
    });
    console.log(`📎 Filtered to ${imageUrls.length} images with prefix "${prefix}"\n`);
  }

  // Apply limit if specified
  if (limit) {
    imageUrls = imageUrls.slice(0, limit);
    console.log(`🔢 Limited to ${imageUrls.length} images\n`);
  }

  if (imageUrls.length === 0) {
    console.log('⚠️  No images to process');
    return;
  }

  // Process in batches
  const stats = {
    total: imageUrls.length,
    processed: 0,
    jpegGenerated: 0,
    webpGenerated: 0,
    avifGenerated: 0,
    errors: 0,
    skipped: 0
  };

  for (let i = 0; i < imageUrls.length; i += batchSize) {
    const batch = imageUrls.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(imageUrls.length / batchSize);

    // Track processed base filenames to avoid duplicates
    const processedBases = new Set();

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} images)`);
    console.log('─'.repeat(60));

    for (const imageUrl of batch) {
      const r2Key = extractR2Key(imageUrl);
      if (!r2Key) {
        console.log(`⏭️  Skipping invalid URL: ${imageUrl}`);
        stats.skipped++;
        continue;
      }

<<<<<<< Updated upstream
      // Check if this is already a format variant (WebP/AVIF)
=======
      // Check if this is already a size variant or format variant
>>>>>>> Stashed changes
      const ext = r2Key.substring(r2Key.lastIndexOf('.')).toLowerCase();
      if (ext === '.webp' || ext === '.avif') {
        // Skip WebP/AVIF - we'll regenerate them
        stats.skipped++;
        continue;
      }

      // Skip if already a size variant (we want to process base images only)
      if (/_(?:large|medium|small)\.(jpg|jpeg|png)$/i.test(r2Key)) {
        stats.skipped++;
        continue;
      }

      // Only process JPEG and PNG base images
      if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') {
        console.log(`⏭️  Skipping unsupported format: ${r2Key}`);
        stats.skipped++;
        continue;
      }

<<<<<<< Updated upstream
      // Get base filename (removes size suffix if present)
      const baseFilename = getBaseFilename(r2Key);

      // Check if we already processed this base image
      // (avoid processing same image multiple times if DB has multiple size refs)
      if (processedBases.has(baseFilename)) {
        stats.skipped++;
        continue;
      }
      processedBases.add(baseFilename);

      console.log(`\n🖼️  Processing: ${r2Key}`);
      if (r2Key !== `${baseFilename}.jpg`) {
        console.log(`   ℹ️  Base filename: ${baseFilename}`);
      }
=======
      console.log(`\n🖼️  Processing base image: ${r2Key}`);
>>>>>>> Stashed changes

      if (dryRun) {
        console.log(`   [DRY RUN] Would generate all size variants and formats`);
        const sizes = getAllSizes();
        sizes.forEach(size => {
          const suffix = size.name === 'original' ? '' : `_${size.name}`;
          console.log(`   [DRY RUN]   - ${size.name}: JPEG, WebP, AVIF`);
        });
        stats.processed++;
        continue;
      }

      // Download original image
      console.log(`   ⬇️  Downloading original...`);
      const buffer = await downloadImage(imageUrl);
      if (!buffer) {
        stats.errors++;
        continue;
      }

      // Get base filename
      const baseFilename = getBaseFilename(r2Key);
      const sizes = getAllSizes();

      // Process each size variant
      for (const sizeConfig of sizes) {
        console.log(`\n   📐 Generating ${sizeConfig.name} (${sizeConfig.width}x${sizeConfig.height})...`);

        // Generate all formats for this size
        const formats = await processImageFormats(
          buffer,
          sizeConfig.width,
          sizeConfig.height,
          sizeConfig.quality
        );

        if (!formats) {
          console.log(`   ❌ Failed to process ${sizeConfig.name}`);
          stats.errors++;
          continue;
        }

        // Build filename suffix
        const sizeSuffix = sizeConfig.name === 'original' ? '' : `_${sizeConfig.name}`;

        // Upload JPEG
        const jpegKey = `${baseFilename}${sizeSuffix}.jpg`;
        try {
          await uploadToR2(formats.jpeg, jpegKey, 'image/jpeg');
          stats.jpegGenerated++;
          console.log(`      ✅ JPEG: ${jpegKey}`);
        } catch (error) {
          console.log(`      ❌ JPEG failed: ${error.message}`);
          stats.errors++;
        }

        // Upload WebP
        const webpKey = `${baseFilename}${sizeSuffix}.webp`;
        try {
          await uploadToR2(formats.webp, webpKey, 'image/webp');
          stats.webpGenerated++;
          console.log(`      ✅ WebP: ${webpKey}`);
        } catch (error) {
          console.log(`      ❌ WebP failed: ${error.message}`);
          stats.errors++;
        }

        // Upload AVIF
        const avifKey = `${baseFilename}${sizeSuffix}.avif`;
        try {
          await uploadToR2(formats.avif, avifKey, 'image/avif');
          stats.avifGenerated++;
          console.log(`      ✅ AVIF: ${avifKey}`);
        } catch (error) {
          console.log(`      ❌ AVIF failed: ${error.message}`);
          stats.errors++;
        }
      }

      stats.processed++;
      console.log(`   ✨ Completed ${r2Key} - generated ${sizes.length} sizes × 3 formats = ${sizes.length * 3} files`);
    }

    // Progress update
    const progress = Math.round((stats.processed / stats.total) * 100);
    console.log(`\n📈 Progress: ${stats.processed}/${stats.total} (${progress}%)`);
  }

  // Final summary
  console.log('\n' + '═'.repeat(60));
  console.log('🎉 Regeneration Complete!\n');
  console.log('📊 Summary:');
  console.log(`   Base images processed: ${stats.processed}`);
  console.log(`   JPEG variants generated: ${stats.jpegGenerated}`);
  console.log(`   WebP variants generated: ${stats.webpGenerated}`);
  console.log(`   AVIF variants generated: ${stats.avifGenerated}`);
  console.log(`   Total files created: ${stats.jpegGenerated + stats.webpGenerated + stats.avifGenerated}`);
  console.log(`   Skipped: ${stats.skipped}`);
  console.log(`   Errors: ${stats.errors}`);
  console.log('═'.repeat(60) + '\n');

  if (dryRun) {
    console.log('💡 This was a dry run. Run without --dry-run to actually process images.');
  }
}

// Run the script
try {
  await regenerateImages();
  process.exit(0);
} catch (error) {
  console.error('❌ Fatal error:', error);
  console.error(error.stack);
  process.exit(1);
}
