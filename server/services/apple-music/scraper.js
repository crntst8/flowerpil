import { exec } from 'child_process';
import { promisify } from 'util';
import puppeteer from 'puppeteer';
import RateLimiter from './rate-limiter.js';
import { 
  validateAppleMusicUrl, 
  normalizeAppleMusicUrl, 
  calculateMatchConfidence,
  extractTrackFromApplePage 
} from './url-matcher.js';

const execAsync = promisify(exec);

/**
 * Apple Music Scraper
 * 
 * Primary approach: gamdl command-line tool
 * Fallback approach: Puppeteer web scraping
 * Rate limited and respectful scraping implementation
 */
class AppleMusicScraper {
  constructor() {
    this.rateLimiter = new RateLimiter(
      parseInt(process.env.APPLE_MUSIC_RATE_LIMIT || '10', 10), // 10 requests per minute default
      60000 // 1 minute window
    );
    
    this.cache = new Map(); // Simple in-memory cache
    this.cacheTimeout = parseInt(process.env.APPLE_MUSIC_CACHE_TTL || '3600', 10) * 1000; // 1 hour default
    
    this.retryConfig = {
      maxAttempts: 3,
      backoffMs: 1000,
      maxBackoffMs: 5000
    };
    
    this.browser = null;
    this.gamdlAvailable = null; // Cache gamdl availability check
    
    // Configuration
    // Note: gamdl is a downloader, not a search tool - disable search functionality
    this.enableGamdl = false; // process.env.APPLE_MUSIC_GAMDL_ENABLED !== 'false';
    this.enablePuppeteer = process.env.APPLE_MUSIC_FALLBACK_PUPPETEER !== 'false';
    this.enableISRCSearch = process.env.APPLE_MUSIC_ISRC_ENABLED === 'true'; // Disabled by default
    this.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    // Regional search configuration
    this.searchRegions = ['au', 'us', 'gb']; // Priority order: AU first, then US, then GB
    this.enableRegionalFallback = process.env.APPLE_MUSIC_REGIONAL_FALLBACK !== 'false';
  }

  /**
   * Search Apple Music by ISRC (primary strategy)
   */
  async searchByISRC(isrc) {
    if (!isrc?.trim()) {
      return null;
    }

    const cacheKey = `isrc:${isrc.trim()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log(`💾 Cache hit for ISRC: ${isrc}`);
      return cached;
    }

    await this.rateLimiter.wait();

    try {
      console.log(`🔍 Scraping Apple Music by ISRC: ${isrc}`);
      
      let result = null;
      
      // Try gamdl first if available
      if (this.enableGamdl && await this.isGamdlAvailable()) {
        try {
          result = await this.gamdlSearchByISRC(isrc);
        } catch (error) {
          console.warn(`⚠️  gamdl ISRC search failed, trying Puppeteer: ${error.message}`);
        }
      }
      
      // Fallback to Puppeteer if gamdl failed or unavailable
      if (!result && this.enablePuppeteer) {
        try {
          result = await this.puppeteerSearchByISRC(isrc);
        } catch (error) {
          console.error(`❌ Puppeteer ISRC search failed: ${error.message}`);
        }
      }
      
      if (result) {
        result.confidence = 100; // ISRC match = 100% confidence
        result.source = 'isrc';
        this.setCache(cacheKey, result);
        console.log(`✅ Apple Music ISRC match found: ${result.artist} - ${result.title}`);
      } else {
        console.log(`❌ No Apple Music ISRC match for: ${isrc}`);
      }
      
      return result;
      
    } catch (error) {
      console.error(`❌ Apple Music ISRC scraping failed for ${isrc}:`, error.message);
      throw error;
    }
  }

  /**
   * Search Apple Music by metadata (fallback strategy)
   */
  async searchByMetadata(artist, title) {
    if (!artist?.trim() || !title?.trim()) {
      throw new Error('Artist and title are required for metadata search');
    }

    const query = `${artist.trim()} ${title.trim()}`;
    const cacheKey = `metadata:${query.toLowerCase()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log(`💾 Cache hit for metadata: ${query}`);
      return cached;
    }

    await this.rateLimiter.wait();

    try {
      console.log(`🔍 Scraping Apple Music by metadata: ${query}`);
      
      let results = null;
      
      // Try gamdl first if available
      if (this.enableGamdl && await this.isGamdlAvailable()) {
        try {
          results = await this.gamdlSearchByMetadata(artist, title);
        } catch (error) {
          console.warn(`⚠️  gamdl metadata search failed, trying Puppeteer: ${error.message}`);
        }
      }
      
      // Fallback to Puppeteer if gamdl failed or unavailable
      if (!results && this.enablePuppeteer) {
        try {
          results = await this.puppeteerSearchByMetadata(artist, title);
        } catch (error) {
          console.error(`❌ Puppeteer metadata search failed: ${error.message}`);
        }
      }
      
      if (!results || results.length === 0) {
        console.log(`❌ No Apple Music metadata matches for: ${artist} - ${title}`);
        return null;
      }
      
      // Find best match using confidence scoring
      const originalTrack = { artist: artist.trim(), title: title.trim() };
      let bestMatch = null;
      let highestConfidence = 0;
      
      for (const candidate of results) {
        const confidence = calculateMatchConfidence(originalTrack, candidate);
        
        if (confidence > highestConfidence && confidence >= 70) { // Minimum confidence threshold
          highestConfidence = confidence;
          bestMatch = {
            ...candidate,
            confidence: Math.round(confidence),
            source: 'metadata'
          };
        }
      }  
      
      if (bestMatch) {
        this.setCache(cacheKey, bestMatch);
        console.log(`✅ Apple Music metadata match found: ${bestMatch.artist} - ${bestMatch.title} (confidence: ${bestMatch.confidence})`);
        return bestMatch;
      }
      
      console.log(`❌ No high-confidence Apple Music matches for: ${artist} - ${title}`);
      return null;
      
    } catch (error) {
      console.error(`❌ Apple Music metadata scraping failed for ${artist} - ${title}:`, error.message);
      throw error;
    }
  }

  /**
   * Search Apple Music by track (unified interface)
   */
  async searchByTrack(track) {
    try {
      // Strategy 1: Metadata search (primary - works better for Apple Music)
      if (track.artist && track.title) {
        const metadataResult = await this.searchByMetadata(track.artist, track.title);
        if (metadataResult) {
          return metadataResult;
        }
      }
      
      // Strategy 2: ISRC search (only if enabled and metadata failed)
      if (this.enableISRCSearch && track.isrc) {
        const isrcResult = await this.searchByISRC(track.isrc);
        if (isrcResult) {
          return isrcResult;
        }
      }
      
      // No matches found
      return null;
      
    } catch (error) {
      console.error(`❌ Apple Music track search failed:`, error.message);
      throw error;
    }
  }

  /**
   * Check if gamdl is available on the system
   */
  async isGamdlAvailable() {
    if (this.gamdlAvailable !== null) {
      return this.gamdlAvailable;
    }
    
    try {
      await execAsync('gamdl --version');
      this.gamdlAvailable = true;
      console.log('✅ gamdl detected and available');
    } catch (error) {
      this.gamdlAvailable = false;
      console.warn('⚠️  gamdl not available, will use Puppeteer only');
    }
    
    return this.gamdlAvailable;
  }

  /**
   * Search using gamdl command-line tool by ISRC
   */
  async gamdlSearchByISRC(isrc) {
    try {
      // Use gamdl to search for the track by ISRC
      // Note: This is a placeholder - actual gamdl commands may vary
      const { stdout } = await execAsync(`gamdl --search --isrc "${isrc}" --format json --no-download`, {
        timeout: 30000 // 30 second timeout
      });
      
      const results = JSON.parse(stdout);
      if (results && results.tracks && results.tracks.length > 0) {
        const track = results.tracks[0];
        return this.formatGamdlResult(track);
      }
      
      return null;
      
    } catch (error) {
      console.error('gamdl ISRC search error:', error.message);
      throw new Error(`gamdl search failed: ${error.message}`);
    }
  }

  /**
   * Search using gamdl command-line tool by metadata
   */
  async gamdlSearchByMetadata(artist, title) {
    try {
      const query = `${artist} ${title}`;
      const { stdout } = await execAsync(`gamdl --search "${query}" --format json --no-download --limit 10`, {
        timeout: 30000 // 30 second timeout
      });
      
      const results = JSON.parse(stdout);
      if (results && results.tracks) {
        return results.tracks.map(track => this.formatGamdlResult(track));
      }
      
      return [];
      
    } catch (error) {
      console.error('gamdl metadata search error:', error.message);
      throw new Error(`gamdl search failed: ${error.message}`);
    }
  }

  /**
   * Format gamdl result to standard format
   */
  formatGamdlResult(track) {
    return {
      id: track.id || track.trackId,
      url: track.url || `https://music.apple.com/song/${track.id}`,
      title: track.name || track.title,
      artist: track.artistName || track.artist,
      album: track.albumName || track.album,
      duration: track.durationInMillis,
      releaseDate: track.releaseDate,
      isrc: track.isrc
    };
  }

  /**
   * Get or create Puppeteer browser instance
   */
  async getBrowser() {
    if (!this.browser) {
      const launchOptions = {
        headless: 'new', // Use new headless mode to avoid warnings
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-features=VizDisplayCompositor',
          '--disable-web-security',
          '--disable-features=site-per-process',
          '--window-size=1920x1080'
        ],
        timeout: 60000 // 60 second timeout for browser launch
      };

      // Set executablePath - prioritize env var, then platform defaults
      const customPath = process.env.PUPPETEER_EXECUTABLE_PATH;
      if (customPath && customPath.trim()) {
        launchOptions.executablePath = customPath;
        console.log(`🌐 Using custom Chrome path: ${customPath}`);
      } else {
        // Platform-specific Chrome paths
        const platform = process.platform;
        if (platform === 'darwin') {
          // macOS Chrome path
          launchOptions.executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
          console.log(`🌐 Using macOS Chrome path`);
        } else if (platform === 'linux') {
          // Linux Chrome paths (for production Docker)
          const linuxPaths = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
          for (const path of linuxPaths) {
            try {
              require('fs').accessSync(path);
              launchOptions.executablePath = path;
              console.log(`🌐 Using Linux Chrome path: ${path}`);
              break;
            } catch (e) {
              continue;
            }
          }
        } else {
          console.log(`🌐 Using Puppeteer auto-detected Chrome`);
        }
      }

      try {
        this.browser = await puppeteer.launch(launchOptions);
        console.log(`✅ Puppeteer browser launched successfully`);
      } catch (error) {
        console.error(`❌ Failed to launch browser: ${error.message}`);
        throw new Error(`Browser launch failed: ${error.message}`);
      }
    }
    return this.browser;
  }

  /**
   * Search using Puppeteer web scraping by ISRC
   */
  async puppeteerSearchByISRC(isrc) {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    
    try {
      await page.setUserAgent(this.userAgent);
      
      // Search Apple Music by ISRC via search interface
      const searchUrl = `https://music.apple.com/search?term=${encodeURIComponent(isrc)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Extract track information from page
      const trackData = await page.evaluate(() => {
        // Look for track results in the search page using current Apple Music structure
        const trackElements = document.querySelectorAll('.track-lockup');
        
        for (const element of trackElements) {
          // Find the click action link first
          const linkEl = element.querySelector('[data-testid="click-action"]');
          
          if (linkEl && linkEl.href && linkEl.href.includes('/album/')) {
            // Extract title and artist from track-lockup text content
            const textContent = element.textContent?.trim();
            if (textContent) {
              // Clean up lyrics and extra content
              const cleanText = textContent.replace(/\s*Lyrics:.*$/, '').trim();
              
              // Apple Music format: "Title   Artist" (with multiple spaces)
              const parts = cleanText.split(/\s{2,}/); // Split on 2+ spaces
              if (parts.length >= 2) {
                const title = parts[0]?.trim();
                const artist = parts[1]?.trim();
                
                // Basic validation - both should be reasonable length
                if (title && artist && title.length > 0 && artist.length > 0) {
                  return {
                    title: title,
                    artist: artist,
                    url: linkEl.href
                  };
                }
              }
            }
          }
        }
        
        return null;
      });
      
      if (trackData && trackData.url) {
        return {
          ...trackData,
          id: this.extractIdFromUrl(trackData.url),
          url: normalizeAppleMusicUrl(trackData.url)
        };
      }
      
      return null;
      
    } finally {
      await page.close();
    }
  }

  /**
   * Search using Puppeteer web scraping by metadata with regional fallback
   */
  async puppeteerSearchByMetadata(artist, title) {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    
    try {
      await page.setUserAgent(this.userAgent);
      
      const query = `${artist} ${title}`;
      
      // Try each region in priority order
      for (const region of this.searchRegions) {
        console.log(`🌍 Trying Apple Music search in ${region.toUpperCase()} region for: ${query}`);
        
        const searchUrl = `https://music.apple.com/${region}/search?term=${encodeURIComponent(query)}`;
        
        try {
          await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 40000 });
          
          // Wait for dynamic content to load
          await page.waitForTimeout(3000);
          
          const results = await this.extractTracksFromPage(page, region);
          
          if (results && results.length > 0) {
            console.log(`✅ Found ${results.length} tracks in ${region.toUpperCase()} region`);
            return results;
          } else {
            console.log(`❌ No tracks found in ${region.toUpperCase()} region`);
          }
          
        } catch (error) {
          console.warn(`⚠️ Failed to search ${region.toUpperCase()} region: ${error.message}`);
          continue; // Try next region
        }
        
        if (!this.enableRegionalFallback) {
          break; // Only try first region if fallback disabled
        }
      }
      
      console.log(`❌ No results found in any region for: ${query}`);
      return [];
      
    } finally {
      await page.close();
    }
  }

  /**
   * Extract tracks from Apple Music search page
   */
  async extractTracksFromPage(page, region) {
    const trackResults = await page.evaluate((regionParam) => {
      // Use current Apple Music selectors
      const trackElements = document.querySelectorAll('[data-testid*="track"]');
      const results = [];
      const debug = [];
      
      for (const element of trackElements) {
        // Find click action links within or near this element
        const linkEl = element.querySelector('[data-testid="click-action"]') || 
                      element.parentElement?.querySelector('[data-testid="click-action"]') ||
                      element.querySelector('a[href*="/album/"], a[href*="/song/"]');
        
        if (linkEl && linkEl.href && (linkEl.href.includes('/album/') || linkEl.href.includes('/song/'))) {
          // Extract title and artist from track element text content
          const textContent = element.textContent?.trim();
          debug.push({
            rawText: textContent,
            url: linkEl.href,
            hasText: !!textContent,
            selector: 'track-testid'
          });
          
          if (textContent) {
            // Clean up lyrics and extra content
            const cleanText = textContent.replace(/\s*Lyrics:.*$/, '').replace(/\s*Explicit\s*/, '').trim();
            
            // Apple Music current format: "Title   Artist" or "Title Artist" (with multiple spaces)
            const parts = cleanText.split(/\s{2,}/); // Split on 2+ spaces first
            
            if (parts.length >= 2) {
              const trackTitle = parts[0]?.trim();
              const trackArtist = parts[1]?.trim();
              
              // Basic validation - both should be reasonable length
              if (trackTitle && trackArtist && trackTitle.length > 0 && trackArtist.length > 0) {
                results.push({
                  title: trackTitle,
                  artist: trackArtist,
                  album: parts[2]?.trim() || null,
                  url: linkEl.href,
                  region: regionParam
                });
              }
            } else {
              // Fallback: try single space split if double space didn't work
              const singleParts = cleanText.split(/\s+/);
              if (singleParts.length >= 3) {
                // Try to guess where title ends and artist begins
                const midPoint = Math.floor(singleParts.length / 2);
                const trackTitle = singleParts.slice(0, midPoint).join(' ').trim();
                const trackArtist = singleParts.slice(midPoint).join(' ').trim();
                
                if (trackTitle && trackArtist && trackTitle.length > 0 && trackArtist.length > 0) {
                  results.push({
                    title: trackTitle,
                    artist: trackArtist,
                    album: null,
                    url: linkEl.href,
                    region: regionParam,
                    parseMethod: 'fallback'
                  });
                }
              }
            }
          }
        }
        
        // Limit results to avoid excessive processing
        if (results.length >= 15) break;
      }
      
      return { results, debug };
    }, region);
    
    if (trackResults.debug.length > 0 && trackResults.results.length > 0) {
      console.log(`🐛 Debug - First result from ${region.toUpperCase()}:`, {
        text: trackResults.debug[0].rawText?.substring(0, 100),
        url: trackResults.debug[0].url
      });
    }
    
    return trackResults.results.map(result => ({
      ...result,
      id: this.extractIdFromUrl(result.url),
      url: normalizeAppleMusicUrl(result.url)
    })).filter(result => result.url && result.id);
  }

  /**
   * Extract Apple Music ID from URL (using updated extraction logic)
   */
  extractIdFromUrl(url) {
    // Use the updated extraction logic from url-matcher.js
    if (!url) return null;
    
    // For album URLs with track ID: ?i=123456
    const trackIdMatch = url.match(/[?&]i=(\d+)/);
    if (trackIdMatch) {
      return trackIdMatch[1];
    }
    
    // For direct song URLs: /song/name/123456
    const songMatch = url.match(/\/song\/[^\/]+\/(\d+)/);
    if (songMatch) {
      return songMatch[1];
    }
    
    // For album URLs (singles): /album/name/123456
    const albumMatch = url.match(/\/album\/[^\/]+\/(\d+)(?:\?.*)?$/);
    if (albumMatch) {
      return albumMatch[1];
    }
    
    return null;
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    if (cached) {
      this.cache.delete(key);
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Test scraping connection
   */
  async testConnection() {
    try {
      console.log('🧪 Testing Apple Music scraping connection...');
      
      // Test with a known track
      const testResult = await this.searchByMetadata('The Beatles', 'Hey Jude');
      
      if (testResult) {
        console.log('✅ Apple Music scraping connection successful');
        return true;
      }
      
      throw new Error('No results found for test search');
      
    } catch (error) {
      console.error('❌ Apple Music scraping connection failed:', error.message);
      return false;
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.cache.clear();
  }

  /**
   * Get scraper status
   */
  getStatus() {
    return {
      gamdlAvailable: this.gamdlAvailable,
      puppeteerEnabled: this.enablePuppeteer,
      rateLimiter: this.rateLimiter.getStatus(),
      cacheSize: this.cache.size
    };
  }
}

export default AppleMusicScraper;