#!/usr/bin/env node

/**
 * Image Cleanup CLI Tool
 * Phase 3: Image cleanup utility
 *
 * Provides command-line interface for image management:
 * - Scan database for referenced images
 * - Find orphaned images
 * - Delete specific images with variants
 * - View statistics
 *
 * Usage:
 *   node scripts/image-cleanup-tool.js scan
 *   node scripts/image-cleanup-tool.js stats
 *   node scripts/image-cleanup-tool.js delete <url>
 *   node scripts/image-cleanup-tool.js validate
 */

import imageCleanupService from '../server/services/imageCleanupService.js';

const args = process.argv.slice(2);
const command = args[0];
const value = args[1];

/**
 * Display help information
 */
async function showHelp() {
  console.log(`
🧹 Image Cleanup Utility

COMMANDS:
  scan                          Scan database for referenced images
  find-orphaned [prefix]        Find images in R2 not referenced in database
  cleanup-orphans-dry-run       Preview orphaned images to be deleted (SAFE)
  cleanup-orphans [limit]       Delete orphaned images (DESTRUCTIVE - prompts for confirmation)
  delete <url>                  Delete specific image and all variants
  stats                         Show image storage statistics
  validate [limit]              Validate image references (default: 100)
  help                          Show this help message

EXAMPLES:
  npm run images:scan
  npm run images:stats
  npm run images:find-orphaned
  npm run images:cleanup-orphans-dry-run
  npm run images:cleanup-orphans 1000
  npm run images:delete "https://images.flowerpil.io/playlists/uuid.jpg"
  npm run images:validate 50

NOTES:
  - All operations are safe and logged
  - Deletion includes all format variants (JPEG/WebP/AVIF)
  - cleanup-orphans uses batch deletion (efficient for large volumes)
  - Always run cleanup-orphans-dry-run first to preview
  - Limit parameter prevents accidental mass deletion
  `);
}

/**
 * Scan database and display referenced images
 */
async function runScan() {
  console.log('🔍 Scanning database for image references...\n');

  try {
    const refs = await imageCleanupService.scanDatabaseReferences();

    console.log(`✅ Found ${refs.size} referenced images (including variants)`);
    console.log(`\nSample references (first 10):`);

    Array.from(refs)
      .slice(0, 10)
      .forEach(url => console.log(`  - ${url}`));

    if (refs.size > 10) {
      console.log(`  ... and ${refs.size - 10} more`);
    }

    console.log(`\n💡 Tip: Run 'npm run images:stats' for detailed statistics`);
  } catch (error) {
    console.error('❌ Error during scan:', error.message);
    process.exit(1);
  }
}

/**
 * Find and display orphaned images (now with R2 listing!)
 */
async function findOrphaned(prefix = '') {
  console.log('🔍 Finding orphaned images (scanning R2)...\n');
  console.log('⏳ This may take a minute for large buckets...\n');

  try {
    const report = await imageCleanupService.findOrphanedImages(prefix);

    console.log(`✅ Scan complete`);
    console.log(`\nStatistics:`);
    console.log(`  Database references: ${report.referencedCount}`);
    console.log(`  R2 total files: ${report.r2TotalCount}`);
    console.log(`  Orphaned images: ${report.orphanedCount}`);
    console.log(`  Last scan: ${report.lastScanDate}`);

    if (report.orphanedCount > 0) {
      console.log(`\n🗑️  Orphaned files (first 20):`);
      report.orphanedSample.slice(0, 20).forEach(key => {
        console.log(`  - ${key}`);
      });

      if (report.orphanedCount > 20) {
        console.log(`  ... and ${report.orphanedCount - 20} more`);
      }

      console.log(`\n💡 To delete these files, run:`);
      console.log(`   npm run images:cleanup-orphans-dry-run  (preview first)`);
      console.log(`   npm run images:cleanup-orphans          (actually delete)`);
    } else {
      console.log(`\n✅ No orphaned images found!`);
    }
  } catch (error) {
    console.error('❌ Error finding orphaned images:', error.message);
    console.error('   Make sure R2 credentials are configured correctly');
    process.exit(1);
  }
}

/**
 * Cleanup orphaned images (dry run)
 */
async function cleanupOrphansDryRun() {
  console.log('🧪 Orphaned Image Cleanup - DRY RUN\n');
  console.log('⏳ Scanning R2 and database...\n');

  try {
    const result = await imageCleanupService.cleanupOrphanedImages(true);

    console.log(`✅ Dry run complete`);
    console.log(`\nResults:`);
    console.log(`  Total orphans found: ${result.totalOrphans}`);
    console.log(`  Would delete: ${result.wouldDelete}`);

    if (result.wouldDelete > 0) {
      console.log(`\n🗑️  Files that would be deleted (first 20):`);
      result.sample.slice(0, 20).forEach(key => {
        console.log(`  - ${key}`);
      });

      if (result.wouldDelete > 20) {
        console.log(`  ... and ${result.wouldDelete - 20} more`);
      }

      console.log(`\n⚠️  To actually delete these files, run:`);
      console.log(`   npm run images:cleanup-orphans`);
      console.log(`\n💡 You can limit deletion with:`);
      console.log(`   npm run images:cleanup-orphans 1000  (delete only first 1000)`);
    } else {
      console.log(`\n✅ No orphaned images to delete!`);
    }
  } catch (error) {
    console.error('❌ Error during dry run:', error.message);
    process.exit(1);
  }
}

/**
 * Cleanup orphaned images (actual deletion)
 */
async function cleanupOrphans(limit = null) {
  console.log('🗑️  Orphaned Image Cleanup - LIVE DELETION\n');

  if (limit) {
    console.log(`⚠️  Limiting deletion to ${limit} files\n`);
  }

  console.log('⚠️  WARNING: This will PERMANENTLY delete orphaned files from R2!');
  console.log('⚠️  Make sure you have run the dry-run first.');
  console.log('⚠️  Press Ctrl+C within 10 seconds to cancel...\n');

  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log('⏳ Scanning and deleting...\n');

  try {
    const parsedLimit = limit ? parseInt(limit, 10) : null;
    const result = await imageCleanupService.cleanupOrphanedImages(false, '', parsedLimit);

    console.log(`\n✅ Cleanup complete`);
    console.log(`\nResults:`);
    console.log(`  Total orphans found: ${result.totalOrphans}`);
    console.log(`  Successfully deleted: ${result.deletedCount}`);

    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      console.log(`\n❌ Errors (first 10):`);
      result.errors.slice(0, 10).forEach(error => {
        console.log(`  - ${error}`);
      });
    }

    if (result.deletedCount > 0) {
      console.log(`\n✅ Successfully freed up storage by removing ${result.deletedCount} orphaned files!`);
    }
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

/**
 * Delete specific image and all variants
 */
async function deleteImage(url) {
  if (!url) {
    console.error('❌ Please provide image URL');
    console.log('Usage: npm run images:delete "https://images.flowerpil.io/path/image.jpg"');
    process.exit(1);
  }

  console.log(`🗑️  Deleting image: ${url}\n`);
  console.log('⚠️  This will delete ALL variants (sizes and formats)');
  console.log('⚠️  Press Ctrl+C within 3 seconds to cancel...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    const result = await imageCleanupService.deleteImageWithVariants(url);

    console.log(`\n✅ Deletion complete`);
    console.log(`\nResults:`);
    console.log(`  Deleted: ${result.deletedCount} files`);

    if (result.deletedKeys.length > 0) {
      console.log(`\n  Files deleted:`);
      result.deletedKeys.slice(0, 20).forEach(key => {
        console.log(`    - ${key}`);
      });

      if (result.deletedKeys.length > 20) {
        console.log(`    ... and ${result.deletedKeys.length - 20} more`);
      }
    }

    if (result.errors.length > 0) {
      console.log(`\n  Errors (${result.errors.length}):`);
      result.errors.slice(0, 5).forEach(error => {
        console.log(`    - ${error}`);
      });
    }
  } catch (error) {
    console.error('❌ Error deleting image:', error.message);
    process.exit(1);
  }
}

/**
 * Display image storage statistics
 */
async function showStats() {
  console.log('📊 Image Storage Statistics\n');

  try {
    const stats = await imageCleanupService.getImageStatistics();

    console.log(`Total referenced images: ${stats.totalReferencedImages}`);

    console.log(`\nBy table:`);
    Object.entries(stats.byTable)
      .sort((a, b) => b[1] - a[1])
      .forEach(([table, count]) => {
        console.log(`  ${table.padEnd(20)} ${count}`);
      });

    console.log(`\nBy format:`);
    Object.entries(stats.byFormat)
      .sort((a, b) => b[1] - a[1])
      .forEach(([format, count]) => {
        if (count > 0) {
          console.log(`  ${format.padEnd(10)} ${count}`);
        }
      });

    console.log(`\nLast updated: ${stats.timestamp}`);
  } catch (error) {
    console.error('❌ Error getting statistics:', error.message);
    process.exit(1);
  }
}

/**
 * Validate image references
 */
async function validateReferences(limit = 100) {
  console.log(`🔍 Validating image references (limit: ${limit})...\n`);

  try {
    const report = await imageCleanupService.validateImageReferences(parseInt(limit, 10));

    console.log(`✅ Validation complete`);
    console.log(`\nResults:`);
    console.log(`  Total checked: ${report.total}`);
    console.log(`  Valid: ${report.valid}`);
    console.log(`  Invalid: ${report.invalid}`);

    if (report.invalidUrls.length > 0) {
      console.log(`\n  Invalid URLs:`);
      report.invalidUrls.slice(0, 10).forEach(url => {
        console.log(`    - ${url}`);
      });

      if (report.invalidUrls.length > 10) {
        console.log(`    ... and ${report.invalidUrls.length - 10} more`);
      }
    }
  } catch (error) {
    console.error('❌ Error during validation:', error.message);
    process.exit(1);
  }
}

// Main execution
try {
  switch (command) {
    case 'scan':
      await runScan();
      break;

    case 'find-orphaned':
      await findOrphaned(value);
      break;

    case 'cleanup-orphans-dry-run':
      await cleanupOrphansDryRun();
      break;

    case 'cleanup-orphans':
      await cleanupOrphans(value);
      break;

    case 'delete':
      await deleteImage(value);
      break;

    case 'stats':
      await showStats();
      break;

    case 'validate':
      await validateReferences(value || 100);
      break;

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      await showHelp();
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run "npm run images:help" for usage information');
      process.exit(1);
  }

  process.exit(0);
} catch (error) {
  console.error('❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
