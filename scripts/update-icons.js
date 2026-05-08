#!/usr/bin/env node

/**
 * Icon Update Script for Flowerpil
 * 
 * Automatically updates platform icons across the entire codebase.
 * Place service icons (e.g., spotify.png, tidal.png) in scripts/icons/
 * Script will process, resize, and move them to appropriate directories.
 * 
 * Usage: node scripts/update-icons.js [--dry-run] [--verbose]
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  sourceDir: path.join(__dirname, 'icons'),
  publicDir: path.join(__dirname, '..', 'public', 'icons'),
  storageDir: path.join(__dirname, '..', 'storage', 'icons'),
  iconSizes: [
    { suffix: '', size: 64 },      // Default size for bio pages
    { suffix: '@2x', size: 128 },  // High DPI
    { suffix: '@3x', size: 192 }   // Very high DPI
  ],
  supportedFormats: ['.png', '.jpg', '.jpeg', '.svg', '.webp'],
  platforms: {
    // Music Streaming
    'spotify': { name: 'Spotify', category: 'music' },
    'apple': { name: 'Apple Music', category: 'music' },
    'applemusic': { name: 'Apple Music', category: 'music', alias: 'apple' },
    'tidal': { name: 'Tidal', category: 'music' },
    'bandcamp': { name: 'Bandcamp', category: 'music' },
    'soundcloud': { name: 'SoundCloud', category: 'music' },
    'youtube': { name: 'YouTube', category: 'music' },
    'youtubemusic': { name: 'YouTube Music', category: 'music', alias: 'youtube' },
    
    // Social Media
    'instagram': { name: 'Instagram', category: 'social' },
    'twitter': { name: 'Twitter', category: 'social' },
    'x': { name: 'X (Twitter)', category: 'social', alias: 'twitter' },
    'facebook': { name: 'Facebook', category: 'social' },
    'tiktok': { name: 'TikTok', category: 'social' },
    'linkedin': { name: 'LinkedIn', category: 'social' },
    
    // Other
    'website': { name: 'Website', category: 'other' },
    'email': { name: 'Email', category: 'other' },
    'discord': { name: 'Discord', category: 'social' },
    'twitch': { name: 'Twitch', category: 'social' }
  }
};

// Components that need icon updates
const COMPONENT_PATHS = [
  'src/modules/bio/components/BioPreview.jsx',
  'src/modules/bio/components/BioEditor.jsx', 
  'src/modules/bio/components/ProfileLinksDisplay.jsx',
  'src/modules/bio/components/CuratorSelector.jsx',
  'src/modules/curators/components/CuratorProfile.jsx',
  'src/modules/admin/components/ImportTools.jsx'
];

class IconUpdateManager {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.processed = [];
    this.errors = [];
  }

  log(message, level = 'info') {
    const prefix = this.dryRun ? '[DRY RUN] ' : '';
    const timestamp = new Date().toLocaleTimeString();
    
    if (level === 'verbose' && !this.verbose) return;
    
    const colors = {
      info: '\x1b[36m',      // Cyan
      success: '\x1b[32m',   // Green  
      warning: '\x1b[33m',   // Yellow
      error: '\x1b[31m',     // Red
      verbose: '\x1b[90m'    // Gray
    };
    
    console.log(`${colors[level]}${prefix}[${timestamp}] ${message}\x1b[0m`);
  }

  async init() {
    this.log('🚀 Starting icon update process...', 'info');
    
    // Ensure directories exist
    await this.ensureDirectories();
    
    // Find source icons
    const sourceIcons = await this.findSourceIcons();
    
    if (sourceIcons.length === 0) {
      this.log('❌ No icons found in scripts/icons/ directory', 'warning');
      this.log('📁 Place service icons (e.g., spotify.png, tidal.png) in scripts/icons/', 'info');
      return false;
    }
    
    this.log(`📁 Found ${sourceIcons.length} source icons`, 'info');
    
    // Process each icon
    for (const icon of sourceIcons) {
      try {
        await this.processIcon(icon);
      } catch (error) {
        this.log(`❌ Error processing ${icon.filename}: ${error.message}`, 'error');
        this.errors.push({ icon: icon.filename, error: error.message });
      }
    }
    
    // Update components
    await this.updateComponents();
    
    // Generate summary
    this.generateSummary();
    
    return this.errors.length === 0;
  }

  async ensureDirectories() {
    const dirs = [CONFIG.publicDir, CONFIG.storageDir];
    
    for (const dir of dirs) {
      try {
        await fs.access(dir);
        this.log(`📁 Directory exists: ${dir}`, 'verbose');
      } catch {
        if (!this.dryRun) {
          await fs.mkdir(dir, { recursive: true });
          this.log(`📁 Created directory: ${dir}`, 'success');
        } else {
          this.log(`📁 Would create directory: ${dir}`, 'info');
        }
      }
    }
  }

  async findSourceIcons() {
    try {
      const files = await fs.readdir(CONFIG.sourceDir);
      const icons = [];
      
      for (const file of files) {
        const filePath = path.join(CONFIG.sourceDir, file);
        const stats = await fs.stat(filePath);
        
        if (!stats.isFile()) continue;
        
        const ext = path.extname(file).toLowerCase();
        if (!CONFIG.supportedFormats.includes(ext)) {
          this.log(`⚠️  Skipping unsupported format: ${file}`, 'warning');
          continue;
        }
        
        const basename = path.basename(file, ext);
        const platform = this.resolvePlatform(basename);
        
        if (!platform) {
          this.log(`⚠️  Unknown platform: ${basename}`, 'warning');
          continue;
        }
        
        icons.push({
          filename: file,
          path: filePath,
          platform: platform.key,
          platformName: platform.name,
          category: platform.category,
          extension: ext
        });
        
        this.log(`🔍 Found icon for ${platform.name}: ${file}`, 'verbose');
      }
      
      return icons;
    } catch (error) {
      this.log(`❌ Error reading source directory: ${error.message}`, 'error');
      return [];
    }
  }

  resolvePlatform(basename) {
    const key = basename.toLowerCase();
    
    if (CONFIG.platforms[key]) {
      const platform = CONFIG.platforms[key];
      return {
        key: platform.alias || key,
        name: platform.name,
        category: platform.category
      };
    }
    
    // Check for aliases
    for (const [platformKey, platform] of Object.entries(CONFIG.platforms)) {
      if (platform.alias === key) {
        return {
          key: platformKey,
          name: platform.name,
          category: platform.category
        };
      }
    }
    
    return null;
  }

  async processIcon(icon) {
    this.log(`🔄 Processing ${icon.filename} (${icon.platformName})...`, 'info');
    
    // Process different sizes
    for (const sizeConfig of CONFIG.iconSizes) {
      await this.resizeAndSaveIcon(icon, sizeConfig);
    }
    
    // Move original to storage
    await this.moveToStorage(icon);
    
    this.processed.push(icon);
    this.log(`✅ Processed ${icon.platformName} icon`, 'success');
  }

  async resizeAndSaveIcon(icon, sizeConfig) {
    const { suffix, size } = sizeConfig;
    const filename = `${icon.platform}${suffix}.png`;
    const outputPath = path.join(CONFIG.publicDir, filename);
    
    if (this.dryRun) {
      this.log(`📦 Would create: ${outputPath} (${size}x${size}px)`, 'verbose');
      return;
    }
    
    try {
      // Handle SVG separately
      if (icon.extension === '.svg') {
        const svgContent = await fs.readFile(icon.path);
        await sharp(svgContent)
          .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile(outputPath);
      } else {
        await sharp(icon.path)
          .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile(outputPath);
      }
      
      this.log(`📦 Created: ${filename} (${size}x${size}px)`, 'verbose');
    } catch (error) {
      throw new Error(`Failed to resize icon: ${error.message}`);
    }
  }

  async moveToStorage(icon) {
    const storagePath = path.join(CONFIG.storageDir, icon.filename);
    
    if (this.dryRun) {
      this.log(`📦 Would move: ${icon.path} → ${storagePath}`, 'verbose');
      return;
    }
    
    try {
      await fs.copyFile(icon.path, storagePath);
      await fs.unlink(icon.path);
      this.log(`📦 Moved to storage: ${icon.filename}`, 'verbose');
    } catch (error) {
      throw new Error(`Failed to move to storage: ${error.message}`);
    }
  }

  async updateComponents() {
    this.log('🔄 Updating components...', 'info');
    
    for (const componentPath of COMPONENT_PATHS) {
      try {
        await this.updateComponent(componentPath);
      } catch (error) {
        this.log(`❌ Error updating ${componentPath}: ${error.message}`, 'error');
        this.errors.push({ component: componentPath, error: error.message });
      }
    }
  }

  async updateComponent(componentPath) {
    const fullPath = path.join(__dirname, '..', componentPath);
    
    try {
      await fs.access(fullPath);
    } catch {
      this.log(`⚠️  Component not found: ${componentPath}`, 'warning');
      return;
    }
    
    const content = await fs.readFile(fullPath, 'utf8');
    let updatedContent = content;
    let hasChanges = false;
    
    // Update getPlatformIcon function
    if (content.includes('getPlatformIcon')) {
      updatedContent = this.updateGetPlatformIcon(updatedContent);
      hasChanges = true;
      this.log(`🔧 Updated getPlatformIcon in ${componentPath}`, 'verbose');
    }
    
    // Update direct emoji usage
    const emojiUpdates = this.updateDirectEmojis(updatedContent);
    if (emojiUpdates.updated !== updatedContent) {
      updatedContent = emojiUpdates.updated;
      hasChanges = true;
      this.log(`🔧 Updated ${emojiUpdates.count} emoji references in ${componentPath}`, 'verbose');
    }
    
    if (hasChanges && !this.dryRun) {
      await fs.writeFile(fullPath, updatedContent, 'utf8');
      this.log(`✅ Updated component: ${componentPath}`, 'success');
    } else if (hasChanges) {
      this.log(`📝 Would update component: ${componentPath}`, 'info');
    } else {
      this.log(`⚪ No changes needed: ${componentPath}`, 'verbose');
    }
  }

  updateGetPlatformIcon(content) {
    // Generate new getPlatformIcon function
    const newFunction = this.generateGetPlatformIconFunction();
    
    // Replace existing function
    const functionRegex = /const getPlatformIcon = \(platform\) => \{[^}]*\{[^}]*\}[^}]*\};/gs;
    
    if (functionRegex.test(content)) {
      return content.replace(functionRegex, newFunction);
    }
    
    return content;
  }

  generateGetPlatformIconFunction() {
    const iconEntries = Object.keys(CONFIG.platforms)
      .filter(key => this.processed.some(icon => icon.platform === key))
      .map(platform => `    ${platform}: <img src="/icons/${platform}.png" alt="${CONFIG.platforms[platform].name}" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />`)
      .join(',\n');
    
    const fallbackEntries = Object.keys(CONFIG.platforms)
      .filter(key => !this.processed.some(icon => icon.platform === key))
      .map(platform => {
        // Keep existing emoji fallbacks
        const emoji = this.getEmojiForPlatform(platform);
        return `    ${platform}: '${emoji}'`;
      })
      .join(',\n');
    
    return `const getPlatformIcon = (platform) => {
  const icons = {
${iconEntries}${iconEntries && fallbackEntries ? ',\n' : ''}${fallbackEntries}
  };
  
  return icons[platform.toLowerCase()] || '🔗';
};`;
  }

  getEmojiForPlatform(platform) {
    const emojiMap = {
      spotify: '🎵',
      apple: '🍎',
      tidal: '🌊',
      bandcamp: '🎧',
      website: '🌐',
      instagram: '📷',
      twitter: '🐦',
      facebook: '👥',
      youtube: '📺',
      soundcloud: '☁️'
    };
    
    return emojiMap[platform] || '🔗';
  }

  updateDirectEmojis(content) {
    let updated = content;
    let count = 0;
    
    // Update direct emoji usage in JSX
    const emojiReplacements = [
      { emoji: '🎵', platform: 'spotify' },
      { emoji: '🍎', platform: 'apple' },
      { emoji: '🌊', platform: 'tidal' },
      { emoji: '🎧', platform: 'bandcamp' },
      { emoji: '📷', platform: 'instagram' },
      { emoji: '🐦', platform: 'twitter' },
      { emoji: '👥', platform: 'facebook' },
      { emoji: '📺', platform: 'youtube' },
      { emoji: '☁️', platform: 'soundcloud' }
    ];
    
    for (const { emoji, platform } of emojiReplacements) {
      if (this.processed.some(icon => icon.platform === platform)) {
        // Replace direct emoji usage with icon component
        const iconComponent = `<img src="/icons/${platform}.png" alt="${CONFIG.platforms[platform].name}" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />`;
        
        // Look for various patterns where emojis might be used
        const patterns = [
          new RegExp(`'${emoji}'`, 'g'),
          new RegExp(`"${emoji}"`, 'g'),
          new RegExp(`>${emoji}<`, 'g')
        ];
        
        for (const pattern of patterns) {
          if (pattern.test(updated)) {
            updated = updated.replace(pattern, (match) => {
              count++;
              if (match.includes('>') && match.includes('<')) {
                return `>${iconComponent}<`;
              }
              return iconComponent;
            });
          }
        }
      }
    }
    
    return { updated, count };
  }

  generateSummary() {
    this.log('\n📊 ICON UPDATE SUMMARY', 'info');
    this.log('═'.repeat(50), 'info');
    
    if (this.processed.length > 0) {
      this.log(`✅ Successfully processed ${this.processed.length} icons:`, 'success');
      for (const icon of this.processed) {
        this.log(`   • ${icon.platformName} (${icon.filename})`, 'success');
      }
    }
    
    if (this.errors.length > 0) {
      this.log(`❌ Errors encountered (${this.errors.length}):`, 'error');
      for (const error of this.errors) {
        this.log(`   • ${error.icon || error.component}: ${error.error}`, 'error');
      }
    }
    
    this.log('\n📁 File locations:', 'info');
    this.log(`   • Public icons: ${CONFIG.publicDir}`, 'info');
    this.log(`   • Archived originals: ${CONFIG.storageDir}`, 'info');
    
    if (!this.dryRun && this.processed.length > 0) {
      this.log('\n🚀 Next steps:', 'info');
      this.log('   1. Restart your development server', 'info');
      this.log('   2. Test icon display in bio pages', 'info');
      this.log('   3. Run ./changes.sh to deploy changes', 'info');
    }
    
    this.log('═'.repeat(50), 'info');
    
    if (this.dryRun) {
      this.log('🔍 This was a dry run. Use --execute to apply changes.', 'warning');
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run') || !args.includes('--execute'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🎨 Flowerpil Icon Update Script

Updates platform icons across the entire codebase.

Usage:
  node scripts/update-icons.js [options]

Options:
  --execute     Actually apply changes (default is dry-run)
  --dry-run     Preview changes without applying them
  --verbose     Show detailed output
  --help        Show this help message

Setup:
  1. Place service icons in scripts/icons/
     Example: spotify.png, tidal.png, instagram.png
  
  2. Run the script:
     node scripts/update-icons.js --execute

Supported platforms:
  Music: spotify, apple, tidal, bandcamp, soundcloud, youtube
  Social: instagram, twitter, facebook, tiktok, linkedin
  Other: website, email, discord, twitch

The script will:
  ✅ Resize icons to multiple sizes (64px, 128px, 192px)
  ✅ Move processed icons to public/icons/
  ✅ Archive originals in storage/icons/
  ✅ Update React components to use new icons
  ✅ Maintain emoji fallbacks for missing icons
`);
    process.exit(0);
  }
  
  const manager = new IconUpdateManager(options);
  const success = await manager.init();
  
  process.exit(success ? 0 : 1);
}

// Handle errors gracefully
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Promise Rejection:', reason);
  process.exit(1);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default IconUpdateManager;