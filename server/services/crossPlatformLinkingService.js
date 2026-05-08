import { getQueries, getDatabase } from '../database/db.js';
import { EventEmitter } from 'events';
import { recordLinkingJob } from '../utils/metrics.js';

const STOREFRONT_REGEX = /^[a-z]{2}$/i;
const parsePositiveNumber = (value, fallback) => {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
};

const normalizeStorefront = (value, fallback = null) => {
  if (!value) return fallback;
  const trimmed = String(value).trim().toLowerCase();
  return STOREFRONT_REGEX.test(trimmed) ? trimmed : fallback;
};

const applyStorefrontSuffix = (source, storefront) => {
  if (!storefront) return source || 'metadata';
  const base = source || 'metadata';
  return base.includes('|storefront:') ? base : `${base}|storefront:${storefront}`;
};

const splitMatchSource = (value) => {
  if (!value || typeof value !== 'string') {
    return { base: value || null, storefront: null };
  }
  const segments = value
    .split('|')
    .map(segment => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    return { base: null, storefront: null };
  }
  const [base, ...rest] = segments;
  let storefront = null;
  for (const segment of rest) {
    const [key, raw] = segment.split(':', 2).map(part => part?.trim());
    if (key === 'storefront' && raw) {
      storefront = normalizeStorefront(raw, storefront);
    }
  }
  return { base: base || null, storefront };
};

const safeParseJson = (payload) => {
  if (!payload || typeof payload !== 'string') {
    return null;
  }
  try {
    return JSON.parse(payload);
  } catch (error) {
    return null;
  }
};

class TokenBucket {
  constructor({ capacity = 5, refillRate = 5, minIntervalMs = 0 } = {}) {
    this.capacity = Math.max(1, parsePositiveNumber(capacity, 1));
    this.refillRate = Math.max(0.001, parsePositiveNumber(refillRate, 1));
    this.minIntervalMs = Math.max(0, parsePositiveNumber(minIntervalMs, 0));
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;
    if (elapsedMs <= 0) return;
    const tokensToAdd = (elapsedMs / 1000) * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  async acquire(tokens = 1) {
    if (!Number.isFinite(tokens) || tokens <= 0) return 0;
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return 0;
    }

    const deficit = tokens - this.tokens;
    const waitMs = Math.max(this.minIntervalMs, Math.ceil((deficit / this.refillRate) * 1000));
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens = Math.max(0, this.tokens - tokens);
    return waitMs;
  }

  snapshot() {
    this.refill();
    return {
      capacity: this.capacity,
      refillRate: this.refillRate,
      tokens: Number(this.tokens.toFixed(3)),
      lastRefill: this.lastRefill
    };
  }
}

/**
 * Cross-Platform DSP Linking Service
 * 
 * Core orchestrator for linking tracks across Apple Music and Tidal
 * using ISRC-first strategy with metadata fallback and confidence scoring.
 */
class CrossPlatformLinkingService extends EventEmitter {
  constructor() {
    super();
    this.jobQueue = new Map(); // jobId -> job data
    this.processingJobs = new Set(); // currently processing job IDs
    this.maxConcurrentJobs = this.resolveMaxConcurrentJobs(); // Respect API rate limits
    this.rateLimitDelay = 150; // Base delay between API calls (ms)
    this.cachedAppleStorefront = null;
    this.cachedAppleStorefrontExpires = 0;
    this.rateLimiters = this.createRateLimiters();
    this.rateLimitMetrics = this.createRateLimitMetrics();
  }

  normalizeAppleResultPayload(result, fallbackStorefront) {
    if (!result) return null;

    const defaultStorefront = normalizeStorefront(fallbackStorefront, null);
    const normalizedStorefront = normalizeStorefront(result.storefront, defaultStorefront);
    const providedMatchSource = typeof result.matchSource === 'string' ? result.matchSource.trim() : null;
    const sourceBase = typeof result.source === 'string' && result.source.trim().length
      ? result.source.trim()
      : null;

    const matchSource = providedMatchSource && providedMatchSource.includes('|storefront:')
      ? providedMatchSource
      : applyStorefrontSuffix(providedMatchSource || sourceBase || 'metadata', normalizedStorefront);

    return {
      ...result,
      storefront: normalizedStorefront,
      matchSource,
      scoreBreakdown: result.scoreBreakdown || null,
      matchFactors: result.matchFactors || null,
      matchedPreferredAlbum: result.matchedPreferredAlbum ?? null,
      viaGuidance: result.viaGuidance ?? false,
      rescueReason: result.rescueReason || null
    };
  }

  /**
   * Start batch linking process for a playlist
   * Returns job ID for tracking progress
   */
  async startPlaylistLinking(playlistId, options = {}) {
    const jobId = `playlist_${playlistId}_${Date.now()}`;
    
    // Get tracks that need linking
    const queries = getQueries();
    const tracks = queries.getTracksByPlaylistId.all(playlistId);
    
    if (tracks.length === 0) {
      throw new Error('No tracks found in playlist');
    }

    const distributedMode = String(process.env.LINKING_DISTRIBUTED || '').toLowerCase() === 'on';
    if (distributedMode) {
      const db = getDatabase();
      const forceRefresh = Boolean(options.forceRefresh);
      let updated = 0;

      if (forceRefresh) {
        const info = db.prepare(`
          UPDATE tracks
          SET apple_music_url = NULL,
              match_confidence_apple = NULL,
              match_source_apple = NULL,
              tidal_url = NULL,
              match_confidence_tidal = NULL,
              match_source_tidal = NULL,
              youtube_music_id = NULL,
              youtube_music_url = NULL,
              match_confidence_youtube = NULL,
              match_source_youtube = NULL,
              linking_status = 'pending',
              linking_error = NULL,
              linking_max_age_exceeded = 0,
              linking_updated_at = CURRENT_TIMESTAMP,
              linking_lease_owner = NULL,
              linking_lease_expires = NULL
          WHERE playlist_id = ?
        `).run(playlistId);
        updated = info.changes || 0;
      } else {
        const info = db.prepare(`
          UPDATE tracks
          SET linking_status = 'pending',
              linking_error = NULL,
              linking_max_age_exceeded = 0,
              linking_updated_at = CURRENT_TIMESTAMP,
              linking_lease_owner = NULL,
              linking_lease_expires = NULL
          WHERE playlist_id = ?
            AND linking_status != 'completed'
        `).run(playlistId);
        updated = info.changes || 0;
      }

      return {
        jobId,
        status: 'queued',
        mode: 'distributed',
        updated,
        tracksToProcess: updated,
        estimatedTimeSeconds: Math.ceil(updated * 0.2)
      };
    }
    
    // Filter tracks that need linking (not already completed)
    const tracksToProcess = tracks.filter(track => 
      track.linking_status !== 'completed' || options.forceRefresh
    );
    
    if (tracksToProcess.length === 0 && !options.forceRefresh) {
      return {
        jobId,
        message: 'All tracks already have cross-platform links',
        status: 'completed',
        stats: this.getPlaylistLinkingStats(playlistId)
      };
    }
    
    // Create job
    const job = {
      id: jobId,
      type: 'playlist_linking',
      playlistId: parseInt(playlistId, 10),
      tracks: tracksToProcess,
      status: 'pending',
      progress: {
        total: tracksToProcess.length,
        processed: 0,
        found: 0,
        errors: []
      },
      options,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null
    };
    
    this.jobQueue.set(jobId, job);
    
    // Start processing if we have capacity
    this.processNextJob();
    
    console.log(`📋 Created linking job ${jobId} for playlist ${playlistId} (${tracksToProcess.length} tracks)`);
    
    return {
      jobId,
      status: 'queued',
      tracksToProcess: tracksToProcess.length,
      estimatedTimeSeconds: Math.ceil(tracksToProcess.length * 2) // ~2 seconds per track
    };
  }

  /**
   * Process individual track linking
   */
  async linkTrack(trackId, options = {}) {
    const startTime = Date.now();
    const queries = getQueries();
    const track = queries.getTrackById.get(trackId);

    if (!track) {
      console.warn(`⚠️ Track ${trackId} not found (likely deleted), skipping linking.`);
      return null;
    }

    console.log(`🔗 Starting cross-platform linking for: ${track.artist} - ${track.title}`);

    // Update track status to processing
    this.updateTrackLinkingStatus(trackId, 'processing');

    try {
      const results = {
        trackId: parseInt(trackId, 10),
        apple: null,
        tidal: null,
        spotify: null,
        youtube: null,
        errors: []
      };
      
      // Import services dynamically to avoid circular dependencies
      const { searchAppleMusicByTrack } = await import('./appleMusicService.js');
      const { searchTidalByTrack } = await import('./tidalService.js');
      const { searchYouTubeMusicByTrack } = await import('./youtubeMusicService.js');
      const { default: SpotifyService } = await import('./spotifyService.js');
      const spotifyService = new SpotifyService();

      // Track object for searches - we'll update it with ISRC from Spotify
      let trackForSearch = { ...track };

      // SPOTIFY FIRST - to get ISRC for Tidal search
      try {
        await this.throttlePlatform('spotify');
        this.markPlatformRequest('spotify');
        console.log(`🎵 Searching Spotify for: ${track.artist} - ${track.title}`);
        const spotifyResult = await spotifyService.searchByTrack(track);
        if (spotifyResult && spotifyResult.id) {
          results.spotify = spotifyResult;
          this.updateTrackSpotifyId(trackId, spotifyResult);
          // If we got an ISRC from Spotify, add it to trackForSearch for Tidal
          if (spotifyResult.isrc && !trackForSearch.isrc) {
            trackForSearch.isrc = spotifyResult.isrc;
            console.log(`📝 Got ISRC from Spotify: ${spotifyResult.isrc}`);
          }
        }
      } catch (error) {
        if (this.isRateLimitError(error)) {
          this.recordRateLimitHit('spotify', error);
        }
        console.error(`❌ Spotify search failed for track ${trackId}:`, error.message);
        results.errors.push(`Spotify: ${error.message}`);
      }

      // Rate limiting delay
      await this.delay(this.rateLimitDelay);

      // Apple Music linking
      const appleStorefront = this.getAppleStorefront();

      try {
        await this.throttlePlatform('apple');
        this.markPlatformRequest('apple');
        console.log(`🍎 Searching Apple Music for: ${track.artist} - ${track.title}`);
        const appleResult = await searchAppleMusicByTrack(trackForSearch, { storefront: appleStorefront });
        if (appleResult && appleResult.url) {
          const normalizedApple = this.normalizeAppleResultPayload(appleResult, appleStorefront);
          results.apple = normalizedApple;
          this.updateTrackAppleLink(trackId, normalizedApple);
        }
      } catch (error) {
        if (this.isRateLimitError(error)) {
          this.recordRateLimitHit('apple', error);
        }
        console.error(`❌ Apple Music search failed for track ${trackId}:`, error.message);
        results.errors.push(`Apple Music: ${error.message}`);
      }

      // Rate limiting delay
      await this.delay(this.rateLimitDelay);

      // Tidal linking with retry/backoff for transient errors (uses ISRC from Spotify if available)
      const tidalRetries = options.tidalRetryAttempts ?? 3;
      let tidalAttempt = 0;
      let tidalError = null;
      while (tidalAttempt < tidalRetries && !results.tidal) {
        tidalAttempt += 1;
        try {
          await this.throttlePlatform('tidal');
          this.markPlatformRequest('tidal');
          console.log(`🌊 Searching Tidal for: ${track.artist} - ${track.title} (attempt ${tidalAttempt}/${tidalRetries})${trackForSearch.isrc ? ` [ISRC: ${trackForSearch.isrc}]` : ''}`);
          const tidalResult = await searchTidalByTrack(trackForSearch);
          if (tidalResult && tidalResult.url) {
            results.tidal = tidalResult;
            this.updateTrackTidalLink(trackId, tidalResult);
            tidalError = null;
            break;
          }
          if (!tidalResult) {
            // No match returned; stop retrying because additional attempts won't change outcome
            break;
          }
        } catch (error) {
          tidalError = error;
          const isRateLimit = this.isRateLimitError(error);
          const backoffMs = isRateLimit
            ? Math.max(error.retryAfter ?? 1500, this.rateLimitDelay * Math.pow(2, tidalAttempt))
            : this.rateLimitDelay * Math.pow(2, tidalAttempt - 1);
          if (isRateLimit) {
            this.recordRateLimitHit('tidal', error);
          }
          console.warn(`⚠️  Tidal search attempt ${tidalAttempt} failed for track ${trackId}: ${error.message}`);
          if (tidalAttempt >= tidalRetries) {
            break;
          }
          const sleepFor = Math.min(backoffMs, 8000);
          console.log(`⏳ Waiting ${sleepFor}ms before retrying Tidal search…`);
          await this.delay(sleepFor);
        }
      }

      if (results.tidal) {
        tidalError = null;
      }

      if (tidalError) {
        console.error(`❌ Tidal search failed for track ${trackId} after ${tidalAttempt} attempts: ${tidalError.message}`);
        results.errors.push(`Tidal: ${tidalError.message}`);
      }

      // Rate limiting delay
      await this.delay(this.rateLimitDelay);

      // YouTube Music linking
      try {
        console.log(`Searching YouTube Music for: ${track.artist} - ${track.title}`);
        const youtubeResult = await searchYouTubeMusicByTrack(trackForSearch);
        if (youtubeResult && (youtubeResult.url || youtubeResult.videoId || youtubeResult.id)) {
          const videoId = youtubeResult.videoId || youtubeResult.id;
          const normalizedYouTube = {
            ...youtubeResult,
            url: youtubeResult.url || (videoId ? `https://music.youtube.com/watch?v=${videoId}` : null)
          };
          if (normalizedYouTube.url) {
            results.youtube = normalizedYouTube;
            this.updateTrackYouTubeLink(trackId, normalizedYouTube);
          }
        }
      } catch (error) {
        console.error(`YouTube Music search failed for track ${trackId}:`, error.message);
        results.errors.push(`YouTube Music: ${error.message}`);
      }

      // Determine overall success
      const hasLinks = results.apple || results.tidal || results.spotify || results.youtube;
      const status = hasLinks ? 'completed' : 'failed';
      const errorMessage = results.errors.length > 0 ? results.errors.join('; ') : null;
      
      this.updateTrackLinkingStatus(trackId, status, errorMessage);

      console.log(`✅ Completed linking for track ${trackId}: Apple=${!!results.apple}, Tidal=${!!results.tidal}, Spotify=${!!results.spotify}, YouTube=${!!results.youtube}`);

      // Record metrics for successful linking jobs (per platform)
      const duration = Date.now() - startTime;
      if (results.apple) recordLinkingJob('apple', duration);
      if (results.tidal) recordLinkingJob('tidal', duration);
      if (results.spotify) recordLinkingJob('spotify', duration);
      if (results.youtube) recordLinkingJob('youtube', duration);

      return results;

    } catch (error) {
      console.error(`❌ Track linking failed for ${trackId}:`, error);
      this.updateTrackLinkingStatus(trackId, 'failed', error.message);

      // Record metrics for failed linking job
      const duration = Date.now() - startTime;
      recordLinkingJob('failed', duration);

      throw error;
    }
  }

  /**
   * Dry-run linking for a track payload (no DB writes).
   */
  async dryRunLinkTrack(trackInput = {}) {
    const startTime = Date.now();
    const durationValue = Number.parseInt(trackInput.duration_ms, 10);
    const track = {
      artist: typeof trackInput.artist === 'string' ? trackInput.artist.trim() : '',
      title: typeof trackInput.title === 'string' ? trackInput.title.trim() : '',
      album: typeof trackInput.album === 'string' ? trackInput.album.trim() : null,
      isrc: typeof trackInput.isrc === 'string' ? trackInput.isrc.trim() : null,
      duration_ms: Number.isFinite(durationValue) && durationValue > 0 ? durationValue : null
    };

    if (!track.isrc && !(track.artist && track.title)) {
      throw new Error('Provide artist + title or ISRC for dry run');
    }

    const results = {
      apple: null,
      tidal: null,
      spotify: null,
      youtube: null,
      errors: []
    };

    const { default: appleMusicService, searchAppleMusicByTrack } = await import('./appleMusicService.js');
    const { default: appleMusicApiService } = await import('./appleMusicApiService.js');
    const { searchTidalByTrack, testTidalConnection } = await import('./tidalService.js');
    const { searchYouTubeMusicByTrack, testYouTubeMusicConnection } = await import('./youtubeMusicService.js');
    const { default: SpotifyService } = await import('./spotifyService.js');
    const spotifyService = new SpotifyService();

    let trackForSearch = { ...track };
    const platformStatus = {
      spotify: { ok: true, error: null },
      apple: { ok: true, error: null },
      tidal: { ok: true, error: null },
      youtube: { ok: true, error: null }
    };

    try {
      await spotifyService.getClientCredentialsToken();
    } catch (error) {
      const message = error.message || 'Spotify credentials unavailable';
      platformStatus.spotify = { ok: false, error: message };
      results.errors.push(`Spotify: ${message}`);
    }

    try {
      if (platformStatus.spotify.ok) {
        await this.throttlePlatform('spotify');
        this.markPlatformRequest('spotify');
        const spotifyResult = await spotifyService.searchByTrack(trackForSearch);
        if (spotifyResult && spotifyResult.id) {
          results.spotify = spotifyResult;
          if (spotifyResult.isrc && !trackForSearch.isrc) {
            trackForSearch.isrc = spotifyResult.isrc;
          }
        }
      }
    } catch (error) {
      if (this.isRateLimitError(error)) {
        this.recordRateLimitHit('spotify', error);
      }
      results.errors.push(`Spotify: ${error.message}`);
    }

    await this.delay(this.rateLimitDelay);

    try {
      if (!appleMusicService.useApiSearch) {
        const message = 'Apple Music API search disabled';
        platformStatus.apple = { ok: false, error: message };
        results.errors.push(`Apple Music: ${message}`);
      } else {
        try {
          appleMusicApiService.getDeveloperToken();
        } catch (error) {
          const message = error.message || 'Apple Music developer token unavailable';
          platformStatus.apple = { ok: false, error: message };
          results.errors.push(`Apple Music: ${message}`);
        }
      }

      if (platformStatus.apple.ok) {
        await this.throttlePlatform('apple');
        this.markPlatformRequest('apple');
        const appleStorefront = this.getAppleStorefront();
        const appleResult = await searchAppleMusicByTrack(trackForSearch, { storefront: appleStorefront });
        if (appleResult && appleResult.url) {
          results.apple = this.normalizeAppleResultPayload(appleResult, appleStorefront);
        }
      }
    } catch (error) {
      if (this.isRateLimitError(error)) {
        this.recordRateLimitHit('apple', error);
      }
      results.errors.push(`Apple Music: ${error.message}`);
    }

    await this.delay(this.rateLimitDelay);

    try {
      const tidalHealthy = await testTidalConnection();
      if (!tidalHealthy) {
        const message = 'Tidal connection failed';
        platformStatus.tidal = { ok: false, error: message };
        results.errors.push(`Tidal: ${message}`);
      }

      if (platformStatus.tidal.ok) {
        await this.throttlePlatform('tidal');
        this.markPlatformRequest('tidal');
        const tidalResult = await searchTidalByTrack(trackForSearch);
        if (tidalResult && tidalResult.url) {
          results.tidal = tidalResult;
        }
      }
    } catch (error) {
      if (this.isRateLimitError(error)) {
        this.recordRateLimitHit('tidal', error);
      }
      results.errors.push(`Tidal: ${error.message}`);
    }

    await this.delay(this.rateLimitDelay);

    try {
      const youtubeHealthy = await testYouTubeMusicConnection();
      if (!youtubeHealthy) {
        const message = 'YouTube Music service unavailable';
        platformStatus.youtube = { ok: false, error: message };
        results.errors.push(`YouTube Music: ${message}`);
      }

      if (platformStatus.youtube.ok) {
        const youtubeResult = await searchYouTubeMusicByTrack(trackForSearch);
        if (youtubeResult && (youtubeResult.url || youtubeResult.videoId || youtubeResult.id)) {
          const videoId = youtubeResult.videoId || youtubeResult.id;
          results.youtube = {
            ...youtubeResult,
            url: youtubeResult.url || (videoId ? `https://music.youtube.com/watch?v=${videoId}` : null)
          };
        }
      }
    } catch (error) {
      results.errors.push(`YouTube Music: ${error.message}`);
    }

    const durationMs = Date.now() - startTime;

    return {
      query: track,
      results,
      platformStatus,
      errors: results.errors,
      hasLinks: Boolean(results.apple || results.tidal || results.spotify || results.youtube),
      durationMs
    };
  }

  /**
   * Process jobs from queue with concurrency control
   */
  async processNextJob() {
    // Check if we have capacity for more jobs
    if (this.processingJobs.size >= this.maxConcurrentJobs) {
      return;
    }
    
    // Find next pending job
    const pendingJob = Array.from(this.jobQueue.values())
      .find(job => job.status === 'pending');
    
    if (!pendingJob) {
      return;
    }
    
    // Start processing
    pendingJob.status = 'processing';
    pendingJob.startedAt = new Date();
    this.processingJobs.add(pendingJob.id);
    
    console.log(`🚀 Starting job ${pendingJob.id}`);
    this.emit('jobStarted', { jobId: pendingJob.id, job: pendingJob });
    
    try {
      await this.processPlaylistLinkingJob(pendingJob);
      
      // Job completed successfully
      pendingJob.status = 'completed';
      pendingJob.completedAt = new Date();
      
      console.log(`✅ Job ${pendingJob.id} completed successfully`);
      this.emit('jobCompleted', { jobId: pendingJob.id, job: pendingJob });
      
    } catch (error) {
      // Job failed
      pendingJob.status = 'failed';
      pendingJob.error = error.message;
      pendingJob.completedAt = new Date();
      
      console.error(`❌ Job ${pendingJob.id} failed:`, error);
      this.emit('jobFailed', { jobId: pendingJob.id, job: pendingJob, error });
      
    } finally {
      this.processingJobs.delete(pendingJob.id);
      
      // Process next job if any
      setTimeout(() => this.processNextJob(), 100);
    }
  }

  /**
   * Process individual playlist linking job
   */
  async processPlaylistLinkingJob(job) {
    const { tracks } = job;
    
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      
      try {
        console.log(`🔄 Processing track ${i + 1}/${tracks.length}: ${track.artist} - ${track.title}`);
        
        const result = await this.linkTrack(track.id);

        if (!result) {
          // Track was not found (deleted during processing)
          // Increment processed count but don't count as found or error
          job.progress.processed++;
          continue;
        }
        
        // Update job progress
        job.progress.processed++;
        if (result.apple || result.tidal || result.spotify || result.youtube) {
          job.progress.found++;
        }
        
        this.emit('jobProgress', { 
          jobId: job.id, 
          progress: job.progress,
          currentTrack: track
        });
        
      } catch (error) {
        job.progress.processed++;
        job.progress.errors.push({
          trackId: track.id,
          error: error.message
        });
        
        console.error(`❌ Failed to process track ${track.id}:`, error);
      }
      
      // Rate limiting between tracks
      if (i < tracks.length - 1) {
        await this.delay(this.rateLimitDelay);
      }
    }
    
    console.log(`📊 Job ${job.id} final stats:`, {
      processed: job.progress.processed,
      found: job.progress.found,
      errors: job.progress.errors.length
    });
  }

  /**
   * Get job status and progress
   */
  getJobStatus(jobId) {
    const job = this.jobQueue.get(jobId);
    if (!job) {
      return { error: 'Job not found' };
    }
    
    const result = {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error || null
    };

    // Calculate ETA for active jobs
    if (job.status === 'processing' && job.startedAt && job.progress) {
      const processed = job.progress.processed || 0;
      const total = job.progress.total || 0;
      const remaining = total - processed;
      
      if (processed > 0 && remaining > 0) {
        const elapsed = Date.now() - job.startedAt;
        const rate = processed / elapsed; // tracks per millisecond
        const estimatedRemaining = remaining / rate; // milliseconds
        result.eta = Math.round(estimatedRemaining);
        result.eta_seconds = Math.round(estimatedRemaining / 1000);
      }
    } else if (job.status === 'pending') {
      // Estimate based on queue position and average processing time
      const queuePosition = Array.from(this.jobQueue.values())
        .filter(j => j.status === 'pending' && j.createdAt < job.createdAt).length;
      const avgProcessingTime = 2000; // 2 seconds per track (conservative estimate)
      const estimatedTracks = job.progress?.total || 100;
      const estimatedWait = queuePosition * estimatedTracks * avgProcessingTime;
      result.eta = estimatedWait;
      result.eta_seconds = Math.round(estimatedWait / 1000);
    }

    return result;
  }

  /**
   * Get backfill preview - counts of tracks with partial coverage
   * Returns breakdown of missing links per platform
   */
  getBackfillPreview(playlistId) {
    const db = getDatabase();

    const preview = db.prepare(`
      SELECT
        COUNT(CASE WHEN apple_music_url IS NULL THEN 1 END) as missing_apple,
        COUNT(CASE WHEN tidal_url IS NULL THEN 1 END) as missing_tidal,
        COUNT(CASE WHEN spotify_id IS NULL OR TRIM(spotify_id) = '' THEN 1 END) as missing_spotify,
        COUNT(CASE WHEN
          (youtube_music_id IS NULL OR TRIM(youtube_music_id) = '')
          AND (youtube_music_url IS NULL OR TRIM(youtube_music_url) = '')
        THEN 1 END) as missing_youtube,
        COUNT(*) as total_partial
      FROM tracks
      WHERE playlist_id = ?
        AND linking_status = 'completed'
        AND (
          apple_music_url IS NULL OR
          tidal_url IS NULL OR
          spotify_id IS NULL OR TRIM(spotify_id) = '' OR
          (
            (youtube_music_id IS NULL OR TRIM(youtube_music_id) = '')
            AND (youtube_music_url IS NULL OR TRIM(youtube_music_url) = '')
          )
        )
    `).get(playlistId);

    return {
      missingApple: preview.missing_apple || 0,
      missingTidal: preview.missing_tidal || 0,
      missingSpotify: preview.missing_spotify || 0,
      missingYouTube: preview.missing_youtube || 0,
      totalPartial: preview.total_partial || 0
    };
  }

  /**
   * Backfill missing links for tracks with partial coverage
   * Only processes platforms that are missing for each track
   */
  async startBackfillMissingLinks(playlistId, options = {}) {
    const jobId = `backfill_${playlistId}_${Date.now()}`;
    const db = getDatabase();

    // Get tracks that are completed but missing at least one platform
    const partialTracks = db.prepare(`
      SELECT * FROM tracks
      WHERE playlist_id = ?
        AND linking_status = 'completed'
        AND (
          apple_music_url IS NULL OR
          tidal_url IS NULL OR
          spotify_id IS NULL OR TRIM(spotify_id) = '' OR
          (
            (youtube_music_id IS NULL OR TRIM(youtube_music_id) = '')
            AND (youtube_music_url IS NULL OR TRIM(youtube_music_url) = '')
          )
        )
      ORDER BY position
    `).all(playlistId);

    if (partialTracks.length === 0) {
      return {
        jobId,
        message: 'No tracks with partial coverage found',
        status: 'completed',
        tracksToProcess: 0
      };
    }

    // Create job
    const job = {
      id: jobId,
      type: 'backfill_linking',
      playlistId: parseInt(playlistId, 10),
      tracks: partialTracks,
      status: 'pending',
      progress: {
        total: partialTracks.length,
        processed: 0,
        found: 0,
        errors: []
      },
      options,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null
    };

    this.jobQueue.set(jobId, job);

    // Start processing
    this.processNextBackfillJob();

    console.log(`[BACKFILL] Created backfill job ${jobId} for playlist ${playlistId} (${partialTracks.length} tracks with partial coverage)`);

    return {
      jobId,
      status: 'queued',
      tracksToProcess: partialTracks.length,
      estimatedTimeSeconds: Math.ceil(partialTracks.length * 1.5)
    };
  }

  /**
   * Process backfill jobs from queue
   */
  async processNextBackfillJob() {
    if (this.processingJobs.size >= this.maxConcurrentJobs) {
      return;
    }

    const pendingJob = Array.from(this.jobQueue.values())
      .find(job => job.status === 'pending' && job.type === 'backfill_linking');

    if (!pendingJob) {
      return;
    }

    pendingJob.status = 'processing';
    pendingJob.startedAt = new Date();
    this.processingJobs.add(pendingJob.id);

    console.log(`[BACKFILL] Starting backfill job ${pendingJob.id}`);
    this.emit('jobStarted', { jobId: pendingJob.id, job: pendingJob });

    try {
      await this.processBackfillJob(pendingJob);
      pendingJob.status = 'completed';
      pendingJob.completedAt = new Date();
      console.log(`[BACKFILL] Job ${pendingJob.id} completed successfully`);
      this.emit('jobCompleted', { jobId: pendingJob.id, job: pendingJob });
    } catch (error) {
      pendingJob.status = 'failed';
      pendingJob.error = error.message;
      pendingJob.completedAt = new Date();
      console.error(`[BACKFILL] Job ${pendingJob.id} failed:`, error);
      this.emit('jobFailed', { jobId: pendingJob.id, job: pendingJob, error });
    } finally {
      this.processingJobs.delete(pendingJob.id);
      setTimeout(() => this.processNextBackfillJob(), 100);
    }
  }

  /**
   * Process individual backfill job - only fills missing platforms
   */
  async processBackfillJob(job) {
    const { tracks } = job;

    // Import services dynamically
    const { searchAppleMusicByTrack } = await import('./appleMusicService.js');
    const { searchTidalByTrack } = await import('./tidalService.js');
    const { searchYouTubeMusicByTrack } = await import('./youtubeMusicService.js');
    const { default: SpotifyService } = await import('./spotifyService.js');
    const spotifyService = new SpotifyService();

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];

      try {
        console.log(`[BACKFILL] Processing track ${i + 1}/${tracks.length}: ${track.artist} - ${track.title}`);

        const needsApple = !track.apple_music_url;
        const needsTidal = !track.tidal_url;
        const needsSpotify = !track.spotify_id || track.spotify_id.trim() === '';
        const needsYouTube = (!track.youtube_music_id || track.youtube_music_id.trim() === '')
          && (!track.youtube_music_url || track.youtube_music_url.trim() === '');

        let trackForSearch = { ...track };
        let foundAny = false;

        // Spotify first (to get ISRC for Tidal)
        if (needsSpotify) {
          try {
            await this.throttlePlatform('spotify');
            this.markPlatformRequest('spotify');
            console.log(`[BACKFILL] Searching Spotify for: ${track.artist} - ${track.title}`);
            const spotifyResult = await spotifyService.searchByTrack(track);
            if (spotifyResult && spotifyResult.id) {
              this.updateTrackSpotifyId(track.id, spotifyResult);
              foundAny = true;
              if (spotifyResult.isrc && !trackForSearch.isrc) {
                trackForSearch.isrc = spotifyResult.isrc;
                console.log(`[BACKFILL] Got ISRC from Spotify: ${spotifyResult.isrc}`);
              }
            }
          } catch (error) {
            if (this.isRateLimitError(error)) {
              this.recordRateLimitHit('spotify', error);
            }
            console.error(`[BACKFILL] Spotify search failed for track ${track.id}:`, error.message);
          }
          await this.delay(this.rateLimitDelay);
        }

        // Apple Music
        if (needsApple) {
          try {
            await this.throttlePlatform('apple');
            this.markPlatformRequest('apple');
            const appleStorefront = this.getAppleStorefront();
            console.log(`[BACKFILL] Searching Apple Music for: ${track.artist} - ${track.title}`);
            const appleResult = await searchAppleMusicByTrack(trackForSearch, { storefront: appleStorefront });
            if (appleResult && appleResult.url) {
              const normalizedApple = this.normalizeAppleResultPayload(appleResult, appleStorefront);
              this.updateTrackAppleLink(track.id, normalizedApple);
              foundAny = true;
            }
          } catch (error) {
            if (this.isRateLimitError(error)) {
              this.recordRateLimitHit('apple', error);
            }
            console.error(`[BACKFILL] Apple Music search failed for track ${track.id}:`, error.message);
          }
          await this.delay(this.rateLimitDelay);
        }

        // Tidal
        if (needsTidal) {
          try {
            await this.throttlePlatform('tidal');
            this.markPlatformRequest('tidal');
            console.log(`[BACKFILL] Searching Tidal for: ${track.artist} - ${track.title}${trackForSearch.isrc ? ` [ISRC: ${trackForSearch.isrc}]` : ''}`);
            const tidalResult = await searchTidalByTrack(trackForSearch);
            if (tidalResult && tidalResult.url) {
              this.updateTrackTidalLink(track.id, tidalResult);
              foundAny = true;
            }
          } catch (error) {
            if (this.isRateLimitError(error)) {
              this.recordRateLimitHit('tidal', error);
            }
            console.error(`[BACKFILL] Tidal search failed for track ${track.id}:`, error.message);
          }
        }

        // YouTube Music
        if (needsYouTube) {
          await this.delay(this.rateLimitDelay);
          try {
            console.log(`[BACKFILL] Searching YouTube Music for: ${track.artist} - ${track.title}`);
            const youtubeResult = await searchYouTubeMusicByTrack(trackForSearch);
            if (youtubeResult && (youtubeResult.url || youtubeResult.videoId || youtubeResult.id)) {
              const videoId = youtubeResult.videoId || youtubeResult.id;
              const normalizedYouTube = {
                ...youtubeResult,
                url: youtubeResult.url || (videoId ? `https://music.youtube.com/watch?v=${videoId}` : null)
              };
              if (normalizedYouTube.url) {
                this.updateTrackYouTubeLink(track.id, normalizedYouTube);
                foundAny = true;
              }
            }
          } catch (error) {
            console.error(`[BACKFILL] YouTube Music search failed for track ${track.id}:`, error.message);
          }
        }

        job.progress.processed++;
        if (foundAny) {
          job.progress.found++;
        }

        this.emit('jobProgress', {
          jobId: job.id,
          progress: job.progress,
          currentTrack: track
        });

      } catch (error) {
        job.progress.processed++;
        job.progress.errors.push({
          trackId: track.id,
          error: error.message
        });
        console.error(`[BACKFILL] Failed to process track ${track.id}:`, error);
      }

      // Rate limiting between tracks
      if (i < tracks.length - 1) {
        await this.delay(this.rateLimitDelay);
      }
    }

    console.log(`[BACKFILL] Job ${job.id} final stats:`, {
      processed: job.progress.processed,
      found: job.progress.found,
      errors: job.progress.errors.length
    });
  }

  /**
   * Get playlist linking statistics
   */
  getPlaylistLinkingStats(playlistId) {
    const db = getDatabase();
    
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_tracks,
        COUNT(CASE WHEN apple_music_url IS NOT NULL THEN 1 END) as apple_links,
        COUNT(CASE WHEN tidal_url IS NOT NULL THEN 1 END) as tidal_links,
        COUNT(CASE WHEN spotify_id IS NOT NULL AND TRIM(spotify_id) != '' THEN 1 END) as spotify_links,
        COUNT(CASE WHEN
          (youtube_music_id IS NOT NULL AND TRIM(youtube_music_id) != '')
          OR (youtube_music_url IS NOT NULL AND TRIM(youtube_music_url) != '')
        THEN 1 END) as youtube_links,
        COUNT(CASE WHEN isrc IS NOT NULL AND TRIM(isrc) != '' THEN 1 END) as isrc_count,
        COUNT(CASE WHEN apple_music_url IS NOT NULL OR tidal_url IS NOT NULL THEN 1 END) as with_links,
        COUNT(CASE WHEN linking_status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN linking_status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN flagged_for_review = 1 THEN 1 END) as flagged,
        AVG(match_confidence_apple) as avg_apple_confidence,
        AVG(match_confidence_tidal) as avg_tidal_confidence
      FROM tracks
      WHERE playlist_id = ?
    `).get(playlistId);

    // Count pending and processing jobs for this playlist
    let pendingCount = 0;
    let processingCount = 0;
    for (const [jobId, job] of this.jobQueue.entries()) {
      if (job.playlistId === Number(playlistId)) {
        if (job.status === 'pending') {
          pendingCount++;
        } else if (job.status === 'processing') {
          processingCount++;
        }
      }
    }

    const trackRows = db.prepare(`
      SELECT id, apple_music_url, match_source_apple, match_confidence_apple, apple_id, isrc
      FROM tracks
      WHERE playlist_id = ?
    `).all(playlistId);
    const enrichedTracks = this.hydrateTracksWithLinkMetadata(trackRows);
    const appleStorefrontCounts = {};
    const appleRescueCounts = {};
    let appleGuidanceMatches = 0;
    let appleAlbumAlignedMatches = 0;
    let appleMetadataMatches = 0;

    for (const track of enrichedTracks) {
      const details = track.apple_link_details;
      if (!details) continue;
      appleMetadataMatches += 1;
      if (details.storefront) {
        appleStorefrontCounts[details.storefront] = (appleStorefrontCounts[details.storefront] || 0) + 1;
      }
      if (details.rescueReason) {
        appleRescueCounts[details.rescueReason] = (appleRescueCounts[details.rescueReason] || 0) + 1;
      }
      if (details.viaGuidance) {
        appleGuidanceMatches += 1;
      }
      if (details.matchedPreferredAlbum) {
        appleAlbumAlignedMatches += 1;
      }
    }
    
    return {
      ...stats,
      coverage: stats.total_tracks > 0 ? stats.with_links / stats.total_tracks : 0,
      apple_coverage: stats.total_tracks > 0 ? stats.apple_links / stats.total_tracks : 0,
      tidal_coverage: stats.total_tracks > 0 ? stats.tidal_links / stats.total_tracks : 0,
      spotify_coverage: stats.total_tracks > 0 ? stats.spotify_links / stats.total_tracks : 0,
      youtube_coverage: stats.total_tracks > 0 ? stats.youtube_links / stats.total_tracks : 0,
      isrc_coverage: stats.total_tracks > 0 ? stats.isrc_count / stats.total_tracks : 0,
      apple_metadata_matches: appleMetadataMatches,
      apple_storefront_counts: appleStorefrontCounts,
      apple_rescue_counts: appleRescueCounts,
      apple_guidance_matches: appleGuidanceMatches,
      apple_album_alignment_matches: appleAlbumAlignedMatches,
      pending_count: pendingCount,
      processing_count: processingCount
    };
  }

  /**
   * Update track Apple Music link
   */
  updateTrackAppleLink(trackId, result) {
    const db = getDatabase();

    const providedMatchSource = typeof result.matchSource === 'string' ? result.matchSource.trim() : null;
    const providedMatchBreakdown = splitMatchSource(providedMatchSource);
    const normalizedStorefront = normalizeStorefront(result.storefront, providedMatchBreakdown.storefront);

    let matchSource = providedMatchSource || null;
    if (matchSource) {
      matchSource = normalizedStorefront && !matchSource.includes('|storefront:')
        ? applyStorefrontSuffix(matchSource, normalizedStorefront)
        : matchSource;
    } else {
      const baseCandidate = result.source || providedMatchBreakdown.base || 'metadata';
      matchSource = applyStorefrontSuffix(baseCandidate, normalizedStorefront);
    }

    const sourceBase = splitMatchSource(matchSource).base || result.source || providedMatchBreakdown.base || 'metadata';

    // Extract apple_id from URL if not provided directly
    let appleId = result.id || null;
    if (!appleId && result.url) {
      // Try to extract track ID from Apple Music URL
      // For album URLs with track ID: ?i=123456
      const trackIdMatch = result.url.match(/[?&]i=(\d+)/);
      if (trackIdMatch) {
        appleId = trackIdMatch[1];
      } else {
        // For direct song URLs: /song/name/123456
        const songMatch = result.url.match(/\/song\/[^\/]+\/(\d+)/);
        if (songMatch) {
          appleId = songMatch[1];
        } else {
          // For album URLs (singles): /album/name/123456
          const albumMatch = result.url.match(/\/album\/[^\/]+\/(\d+)(?:\?.*)?$/);
          if (albumMatch) {
            appleId = albumMatch[1];
          }
        }
      }
    }

    db.prepare(`
      UPDATE tracks SET
        apple_id = COALESCE(?, apple_id),
        apple_music_url = ?,
        match_confidence_apple = ?,
        match_source_apple = ?,
        linking_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      appleId,
      result.url,
      result.confidence ?? null,
      matchSource,
      trackId
    );

    if (result.url) {
      try {
        const now = new Date().toISOString();
        const metadataPayload = {
          id: result.id || null,
          url: result.url,
          confidence: result.confidence ?? null,
          source: sourceBase,
          matchSource,
          matchStrategy: result.matchStrategy || null,
          scoreBreakdown: result.scoreBreakdown || null,
          matchFactors: result.matchFactors || null,
          matchedPreferredAlbum: result.matchedPreferredAlbum ?? null,
          viaGuidance: result.viaGuidance || false,
          rescueReason: result.rescueReason || null,
          storefront: normalizedStorefront,
          durationMs: result.durationMs ?? null,
          isrc: result.isrc || null,
          timestamp: now
        };

        db.prepare(`
          INSERT INTO cross_links (track_id, platform, url, confidence, metadata, created_at, updated_at)
          VALUES (?, 'apple', ?, ?, ?, ?, ?)
          ON CONFLICT(track_id, platform) DO UPDATE SET
            url = excluded.url,
            confidence = excluded.confidence,
            metadata = excluded.metadata,
            updated_at = excluded.updated_at
        `).run(
          trackId,
          result.url,
          result.confidence ?? null,
          JSON.stringify(metadataPayload),
          now,
          now
        );
      } catch (error) {
        console.warn('⚠️  Failed to upsert Apple cross-link metadata', { trackId, error: error.message });
      }
    }
  }

  /**
   * Update track Tidal link
   */
  updateTrackTidalLink(trackId, result) {
    const db = getDatabase();

    // Extract tidal_id from URL if not provided directly
    let tidalId = result.id || null;
    if (!tidalId && result.url) {
      const match = result.url.match(/\/track\/(\d+)/);
      if (match) {
        tidalId = match[1];
      }
    }

    db.prepare(`
      UPDATE tracks SET
        tidal_id = COALESCE(?, tidal_id),
        tidal_url = ?,
        match_confidence_tidal = ?,
        match_source_tidal = ?,
        linking_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      tidalId,
      result.url,
      result.confidence || null,
      result.source || 'metadata',
      trackId
    );
  }

  /**
   * Update track YouTube Music link
   */
  updateTrackYouTubeLink(trackId, result) {
    const db = getDatabase();

    // Extract video ID from URL if not provided directly
    let videoId = result.id || result.videoId || null;
    if (!videoId && result.url) {
      const match = result.url.match(/[?&]v=([^&]+)/);
      if (match) {
        videoId = match[1];
      }
    }

    db.prepare(`
      UPDATE tracks SET
        youtube_music_id = COALESCE(?, youtube_music_id),
        youtube_music_url = ?,
        match_confidence_youtube = ?,
        match_source_youtube = ?,
        linking_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      videoId,
      result.url,
      result.confidence || null,
      result.source || 'metadata',
      trackId
    );
  }

  /**
   * Update track Spotify ID, ISRC, and artwork (if missing)
   */
  updateTrackSpotifyId(trackId, result) {
    const db = getDatabase();
    // Save spotify_id, isrc, and artwork_url (only if track doesn't have artwork already)
    // This ensures manually added tracks get artwork from Spotify during cross-linking
    db.prepare(`
      UPDATE tracks SET
        spotify_id = ?,
        isrc = COALESCE(isrc, ?),
        artwork_url = COALESCE(NULLIF(artwork_url, ''), ?),
        album_artwork_url = COALESCE(NULLIF(album_artwork_url, ''), ?),
        linking_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      result.id,
      result.isrc || null,
      result.artwork_url || null,
      result.artwork_url || null,
      trackId
    );
  }

  getLinkMetadataMap(trackIds = []) {
    const numericIds = [];
    for (const id of trackIds) {
      const numeric = typeof id === 'string' ? Number.parseInt(id, 10) : id;
      if (Number.isFinite(numeric)) {
        numericIds.push(numeric);
      }
    }

    if (!numericIds.length) {
      return new Map();
    }

    const db = getDatabase();
    const placeholders = numericIds.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT track_id, platform, url, confidence, metadata, created_at, updated_at
      FROM cross_links
      WHERE track_id IN (${placeholders})
    `);

    const rows = stmt.all(...numericIds);
    const metadataMap = new Map();

    for (const row of rows) {
      if (!metadataMap.has(row.track_id)) {
        metadataMap.set(row.track_id, {});
      }
      const perTrack = metadataMap.get(row.track_id);
      perTrack[row.platform] = {
        url: row.url,
        confidence: row.confidence,
        metadata: safeParseJson(row.metadata),
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    }

    return metadataMap;
  }

  buildAppleLinkDetails(track, appleEntry) {
    const metadata = appleEntry?.metadata || null;
    const url = track?.apple_music_url || metadata?.url || appleEntry?.url || null;
    const confidence = typeof track?.match_confidence_apple === 'number'
      ? track.match_confidence_apple
      : typeof metadata?.confidence === 'number'
        ? metadata.confidence
        : typeof appleEntry?.confidence === 'number'
          ? appleEntry.confidence
          : null;

    const providedMatchSource = metadata?.matchSource || track?.match_source_apple || null;
    const providedBreakdown = splitMatchSource(providedMatchSource);
    const storefront = normalizeStorefront(
      metadata?.storefront,
      providedBreakdown.storefront
    );

    let matchSource = providedMatchSource || null;
    if (matchSource) {
      matchSource = storefront && !matchSource.includes('|storefront:')
        ? applyStorefrontSuffix(matchSource, storefront)
        : matchSource;
    } else if (url || metadata) {
      const baseCandidate = metadata?.source || providedBreakdown.base || 'metadata';
      matchSource = applyStorefrontSuffix(baseCandidate, storefront);
    }

    const sourceBase = splitMatchSource(matchSource).base || metadata?.source || providedBreakdown.base || null;

    if (!url && !metadata) {
      return null;
    }

    return {
      id: metadata?.id || track?.apple_id || null,
      url,
      confidence,
      source: sourceBase,
      matchSource,
      storefront,
      matchStrategy: metadata?.matchStrategy || null,
      scoreBreakdown: metadata?.scoreBreakdown || null,
      matchFactors: metadata?.matchFactors || null,
      matchedPreferredAlbum: metadata?.matchedPreferredAlbum ?? null,
      viaGuidance: metadata?.viaGuidance ?? false,
      rescueReason: metadata?.rescueReason || null,
      durationMs: metadata?.durationMs ?? null,
      isrc: metadata?.isrc || track?.isrc || null,
      observedAt: metadata?.timestamp || appleEntry?.updated_at || appleEntry?.created_at || null,
      metadata: metadata || null
    };
  }

  decorateTrackWithMetadata(track, metadataMap) {
    if (!track) return track;
    const numericId = typeof track.id === 'string' ? Number.parseInt(track.id, 10) : track.id;
    const perTrack = Number.isFinite(numericId) ? metadataMap.get(numericId) : undefined;
    const appleEntry = perTrack?.apple || null;
    const appleDetails = this.buildAppleLinkDetails(track, appleEntry);
    const matchSourceReference = appleDetails?.matchSource || track?.match_source_apple || null;
    const matchBreakdown = splitMatchSource(matchSourceReference);

    return {
      ...track,
      apple_storefront: appleDetails?.storefront || matchBreakdown.storefront || null,
      match_source_apple_base: matchBreakdown.base || null,
      apple_link_details: appleDetails
    };
  }

  hydrateTracksWithLinkMetadata(tracks = []) {
    if (!Array.isArray(tracks)) {
      return tracks;
    }
    if (tracks.length === 0) {
      return [];
    }

    const ids = [];
    for (const track of tracks) {
      const numericId = typeof track?.id === 'string' ? Number.parseInt(track.id, 10) : track?.id;
      if (Number.isFinite(numericId)) {
        ids.push(numericId);
      }
    }

    const metadataMap = this.getLinkMetadataMap(ids);
    return tracks.map(track => this.decorateTrackWithMetadata(track, metadataMap));
  }

  hydrateTrackWithLinkMetadata(track) {
    if (!track) {
      return track;
    }
    const [decorated] = this.hydrateTracksWithLinkMetadata([track]);
    return decorated;
  }

  /**
   * Update track linking status
   */
  updateTrackLinkingStatus(trackId, status, error = null) {
    const db = getDatabase();
    
    db.prepare(`
      UPDATE tracks SET
        linking_status = ?,
        linking_error = ?,
        linking_max_age_exceeded = 0,
        linking_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, error, trackId);
  }

  /**
   * Manual override for disputed matches
   */
  setManualOverride(trackId, platform, url) {
    const db = getDatabase();
    const validPlatforms = ['apple', 'tidal'];
    
    if (!validPlatforms.includes(platform)) {
      throw new Error('Invalid platform. Must be "apple" or "tidal"');
    }
    
    const urlColumn = platform === 'apple' ? 'apple_music_url' : 'tidal_url';
    const overrideColumn = platform === 'apple' ? 'manual_override_apple' : 'manual_override_tidal';
    const sourceColumn = platform === 'apple' ? 'match_source_apple' : 'match_source_tidal';
    const confidenceColumn = platform === 'apple' ? 'match_confidence_apple' : 'match_confidence_tidal';
    
    db.prepare(`
      UPDATE tracks SET
        ${urlColumn} = ?,
        ${overrideColumn} = ?,
        ${sourceColumn} = 'manual',
        ${confidenceColumn} = 100,
        flagged_for_review = FALSE,
        linking_status = 'completed',
        linking_max_age_exceeded = 0,
        linking_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(url, url, trackId);
    
    console.log(`🔧 Manual override set for track ${trackId}: ${platform} = ${url}`);
  }

  /**
   * Flag track for manual review
   */
  flagTrackForReview(trackId, reason) {
    const db = getDatabase();

    db.prepare(`
      UPDATE tracks SET
        flagged_for_review = TRUE,
        flagged_reason = ?,
        linking_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason, trackId);
  }

  // ============================================
  // YOUTUBE DRY RUN SYSTEM
  // ============================================

  /**
   * Start YouTube-specific dry run for batch tracks
   * Stores results in staging table for review before applying
   */
  async startYouTubeDryRun(options = {}) {
    const { playlistId, siteWide = false, batchSize = 10 } = options;
    const jobId = `youtube_dryrun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const db = getDatabase();

    // Get tracks to process
    let tracks;
    if (siteWide) {
      tracks = db.prepare(`
        SELECT t.id, t.playlist_id, t.artist, t.title, t.album, t.isrc, t.duration as duration_ms,
               p.title as playlist_title
        FROM tracks t
        JOIN playlists p ON t.playlist_id = p.id
        WHERE (t.youtube_music_id IS NULL OR t.youtube_music_id = '')
          AND (t.youtube_music_url IS NULL OR t.youtube_music_url = '')
        ORDER BY p.id, t.position
      `).all();
    } else if (playlistId) {
      tracks = db.prepare(`
        SELECT t.id, t.playlist_id, t.artist, t.title, t.album, t.isrc, t.duration as duration_ms,
               p.title as playlist_title
        FROM tracks t
        JOIN playlists p ON t.playlist_id = p.id
        WHERE t.playlist_id = ?
          AND (t.youtube_music_id IS NULL OR t.youtube_music_id = '')
          AND (t.youtube_music_url IS NULL OR t.youtube_music_url = '')
        ORDER BY t.position
      `).all(playlistId);
    } else {
      throw new Error('Must specify playlistId or siteWide=true');
    }

    if (tracks.length === 0) {
      return { jobId, status: 'completed', totalTracks: 0, message: 'No tracks need YouTube linking' };
    }

    // Create job entry
    const job = {
      id: jobId,
      type: 'youtube_dry_run',
      playlistId: playlistId || null,
      siteWide,
      tracks,
      status: 'pending',
      progress: {
        total: tracks.length,
        processed: 0,
        found: 0,
        errors: []
      },
      createdAt: new Date(),
      startedAt: null,
      completedAt: null
    };

    this.jobQueue.set(jobId, job);

    // Start processing in background
    this.processYouTubeDryRunJob(jobId, batchSize).catch(error => {
      console.error(`YouTube dry run job ${jobId} failed:`, error);
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = new Date();
    });

    return {
      jobId,
      status: 'queued',
      totalTracks: tracks.length
    };
  }

  /**
   * Process YouTube dry run job
   */
  async processYouTubeDryRunJob(jobId, batchSize = 10) {
    const job = this.jobQueue.get(jobId);
    if (!job) return;

    job.status = 'processing';
    job.startedAt = new Date();
    this.emit('youtubeJobStarted', { jobId, job });

    const db = getDatabase();
    const { searchYouTubeMusicByTrack } = await import('./youtubeMusicService.js');

    // Rate limiter for YouTube
    const youtubeRps = parsePositiveNumber(process.env.LINKING_YOUTUBE_RPS, 2);
    const rateLimiter = new TokenBucket({ capacity: youtubeRps, refillRate: youtubeRps });

    const insertStaging = db.prepare(`
      INSERT INTO youtube_crosslink_staging (
        track_id, playlist_id, artist, title, album, isrc, duration_ms,
        youtube_video_id, youtube_url, youtube_title, youtube_artist, youtube_duration_ms,
        match_confidence, match_source, status, job_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `);

    for (const track of job.tracks) {
      try {
        // Rate limiting
        await rateLimiter.acquire(1);

        const result = await searchYouTubeMusicByTrack({
          artist: track.artist,
          title: track.title,
          album: track.album,
          isrc: track.isrc,
          duration_ms: track.duration_ms
        });

        // Insert into staging table
        insertStaging.run(
          track.id,
          track.playlist_id,
          track.artist,
          track.title,
          track.album,
          track.isrc,
          track.duration_ms,
          result?.videoId || null,
          result?.url || null,
          result?.title || null,
          result?.artist || null,
          result?.duration || null,
          result?.confidence || null,
          result?.source || null,
          jobId
        );

        job.progress.processed++;
        if (result) {
          job.progress.found++;
        }

        this.emit('youtubeJobProgress', {
          jobId,
          progress: job.progress,
          currentTrack: track
        });

      } catch (error) {
        job.progress.processed++;
        job.progress.errors.push({
          trackId: track.id,
          error: error.message
        });
        console.error(`YouTube dry run error for track ${track.id}:`, error.message);
      }

      // Small delay between requests
      await this.delay(100);
    }

    job.status = 'completed';
    job.completedAt = new Date();
    this.emit('youtubeJobCompleted', { jobId, job });
  }

  /**
   * Get YouTube dry run job progress
   */
  getYouTubeDryRunProgress(jobId) {
    const job = this.jobQueue.get(jobId);
    if (!job) {
      return null;
    }

    const result = {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      playlistId: job.playlistId,
      siteWide: job.siteWide,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error || null
    };

    // Calculate ETA for active jobs
    if (job.status === 'processing' && job.startedAt && job.progress) {
      const processed = job.progress.processed || 0;
      const total = job.progress.total || 0;
      const remaining = total - processed;

      if (processed > 0 && remaining > 0) {
        const elapsed = Date.now() - job.startedAt.getTime();
        const rate = processed / elapsed;
        const estimatedRemaining = remaining / rate;
        result.eta_seconds = Math.round(estimatedRemaining / 1000);
      }
    }

    return result;
  }

  /**
   * Get staging statistics
   */
  getYouTubeStagingStats() {
    const db = getDatabase();

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN status = 'overridden' THEN 1 END) as overridden,
        COUNT(CASE WHEN applied_at IS NOT NULL THEN 1 END) as applied,
        COUNT(CASE WHEN youtube_video_id IS NOT NULL THEN 1 END) as matched,
        COUNT(CASE WHEN youtube_video_id IS NULL THEN 1 END) as no_match,
        COUNT(CASE WHEN status = 'pending' AND youtube_video_id IS NOT NULL AND applied_at IS NULL THEN 1 END) as pending_matched,
        COUNT(CASE WHEN status IN ('approved', 'overridden') AND applied_at IS NULL THEN 1 END) as ready_to_apply
      FROM youtube_crosslink_staging
    `).get();

    return stats;
  }

  /**
   * Apply staging entries to tracks table
   * Also applies to duplicate tracks (same artist+title) across all playlists
   */
  async applyYouTubeStagingEntries(stagingIds = [], applyAll = false, statusFilter = null) {
    const db = getDatabase();
    let entries;

    if (applyAll) {
      let sql = `
        SELECT * FROM youtube_crosslink_staging
        WHERE applied_at IS NULL
      `;
      if (statusFilter) {
        sql += ` AND status = ?`;
        entries = db.prepare(sql).all(statusFilter);
      } else {
        sql += ` AND status IN ('approved', 'overridden')`;
        entries = db.prepare(sql).all();
      }
    } else if (stagingIds.length > 0) {
      const placeholders = stagingIds.map(() => '?').join(',');
      entries = db.prepare(`
        SELECT * FROM youtube_crosslink_staging
        WHERE id IN (${placeholders}) AND applied_at IS NULL
      `).all(...stagingIds);
    } else {
      return { applied: 0, failed: 0, errors: [], duplicatesLinked: 0 };
    }

    let applied = 0;
    let failed = 0;
    let duplicatesLinked = 0;
    const errors = [];

    const updateTrack = db.prepare(`
      UPDATE tracks SET
        youtube_music_id = ?,
        youtube_music_url = ?,
        match_confidence_youtube = ?,
        match_source_youtube = ?,
        manual_override_youtube = ?,
        linking_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    // Update all duplicate tracks (same artist+title, case-insensitive)
    const updateDuplicates = db.prepare(`
      UPDATE tracks SET
        youtube_music_id = ?,
        youtube_music_url = ?,
        match_confidence_youtube = ?,
        match_source_youtube = ?,
        linking_updated_at = CURRENT_TIMESTAMP
      WHERE LOWER(TRIM(artist)) = LOWER(TRIM(?))
        AND LOWER(TRIM(title)) = LOWER(TRIM(?))
        AND id != ?
        AND (youtube_music_id IS NULL OR youtube_music_id = '')
        AND (youtube_music_url IS NULL OR youtube_music_url = '')
    `);

    const markApplied = db.prepare(`
      UPDATE youtube_crosslink_staging SET applied_at = CURRENT_TIMESTAMP WHERE id = ?
    `);

    // Also mark staging entries for duplicates as applied
    const markDuplicateStagingApplied = db.prepare(`
      UPDATE youtube_crosslink_staging SET
        applied_at = CURRENT_TIMESTAMP,
        status = CASE WHEN status = 'pending' THEN 'approved' ELSE status END
      WHERE LOWER(TRIM(artist)) = LOWER(TRIM(?))
        AND LOWER(TRIM(title)) = LOWER(TRIM(?))
        AND applied_at IS NULL
        AND id != ?
    `);

    for (const entry of entries) {
      try {
        // Use override values if status is 'overridden', otherwise use matched values
        const videoId = entry.status === 'overridden' ? entry.override_video_id : entry.youtube_video_id;
        const url = entry.status === 'overridden' ? entry.override_url : entry.youtube_url;
        const confidence = entry.status === 'overridden' ? 100 : entry.match_confidence;
        const source = entry.status === 'overridden' ? 'manual' : entry.match_source;
        const manualOverride = entry.status === 'overridden' ? url : null;

        if (!videoId && !url) {
          errors.push({ stagingId: entry.id, error: 'No video ID or URL to apply' });
          failed++;
          continue;
        }

        // Update the primary track
        updateTrack.run(videoId, url, confidence, source, manualOverride, entry.track_id);
        markApplied.run(entry.id);
        applied++;

        // Update duplicate tracks across all playlists
        const dupeResult = updateDuplicates.run(
          videoId, url, confidence, `${source}|via_duplicate`,
          entry.artist, entry.title, entry.track_id
        );
        duplicatesLinked += dupeResult.changes;

        // Mark duplicate staging entries as applied
        markDuplicateStagingApplied.run(entry.artist, entry.title, entry.id);

      } catch (error) {
        errors.push({ stagingId: entry.id, trackId: entry.track_id, error: error.message });
        failed++;
      }
    }

    return { applied, failed, errors, duplicatesLinked };
  }

  /**
   * Set manual YouTube override for a staging entry
   */
  setYouTubeStagingOverride(stagingId, videoId, url, reason = null) {
    const db = getDatabase();

    // Extract video ID from URL if not provided
    let extractedVideoId = videoId;
    if (!extractedVideoId && url) {
      const match = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/);
      if (match) {
        extractedVideoId = match[1];
      }
    }

    // Build URL from video ID if not provided
    let finalUrl = url;
    if (!finalUrl && extractedVideoId) {
      finalUrl = `https://music.youtube.com/watch?v=${extractedVideoId}`;
    }

    db.prepare(`
      UPDATE youtube_crosslink_staging SET
        status = 'overridden',
        override_video_id = ?,
        override_url = ?,
        override_reason = ?,
        reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(extractedVideoId, finalUrl, reason, stagingId);
  }

  /**
   * Update staging entry status
   */
  updateYouTubeStagingStatus(stagingId, status) {
    const db = getDatabase();
    const validStatuses = ['pending', 'approved', 'rejected'];

    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    db.prepare(`
      UPDATE youtube_crosslink_staging SET
        status = ?,
        reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, stagingId);
  }

  /**
   * Bulk approve staging entries
   */
  bulkApproveYouTubeStaging(stagingIds) {
    const db = getDatabase();
    if (!stagingIds.length) return 0;

    const placeholders = stagingIds.map(() => '?').join(',');
    const result = db.prepare(`
      UPDATE youtube_crosslink_staging SET
        status = 'approved',
        reviewed_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
        AND status = 'pending'
        AND youtube_video_id IS NOT NULL
    `).run(...stagingIds);

    return result.changes;
  }

  /**
   * Bulk approve ALL pending staging entries that have a match
   */
  bulkApproveAllYouTubeStaging() {
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE youtube_crosslink_staging SET
        status = 'approved',
        reviewed_at = CURRENT_TIMESTAMP
      WHERE status = 'pending'
        AND youtube_video_id IS NOT NULL
        AND applied_at IS NULL
    `).run();

    return result.changes;
  }

  /**
   * Set manual YouTube override directly on track
   */
  setManualYouTubeOverride(trackId, url) {
    const db = getDatabase();

    // Extract video ID from URL
    let videoId = null;
    if (url) {
      const match = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/);
      if (match) {
        videoId = match[1];
      }
    }

    // Build canonical URL
    let finalUrl = url;
    if (videoId && !url.includes('music.youtube.com')) {
      finalUrl = `https://music.youtube.com/watch?v=${videoId}`;
    }

    db.prepare(`
      UPDATE tracks SET
        youtube_music_id = ?,
        youtube_music_url = ?,
        manual_override_youtube = ?,
        match_source_youtube = 'manual',
        match_confidence_youtube = 100,
        linking_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(videoId, finalUrl, finalUrl, trackId);

    console.log(`Manual YouTube override set for track ${trackId}: ${finalUrl}`);
  }

  /**
   * Check if YouTube auto-linking is enabled
   */
  isYouTubeAutoLinkEnabled() {
    const db = getDatabase();
    try {
      const row = db.prepare(
        'SELECT config_value FROM admin_system_config WHERE config_key = ?'
      ).get('youtube_auto_link_enabled');
      return row?.config_value === 'true';
    } catch (error) {
      return false;
    }
  }

  /**
   * Set YouTube auto-link enabled setting
   */
  setYouTubeAutoLinkEnabled(enabled) {
    const db = getDatabase();
    db.prepare(`
      INSERT OR REPLACE INTO admin_system_config (config_key, config_value, config_type, description)
      VALUES (?, ?, 'system', 'Enable automatic YouTube Music linking for new playlists')
    `).run('youtube_auto_link_enabled', enabled ? 'true' : 'false');
  }

  /**
   * Delete staging entry
   */
  deleteYouTubeStagingEntry(stagingId) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM youtube_crosslink_staging WHERE id = ?').run(stagingId);
    return result.changes > 0;
  }

  /**
   * Clear old staging entries
   */
  clearAppliedYouTubeStaging(olderThanDays = 30) {
    const db = getDatabase();
    const result = db.prepare(`
      DELETE FROM youtube_crosslink_staging
      WHERE applied_at IS NOT NULL
        AND applied_at < datetime('now', '-' || ? || ' days')
    `).run(olderThanDays);
    return result.changes;
  }

  /**
   * Utility: Delay execution
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up old completed jobs
   */
  cleanupOldJobs(maxAgeHours = 24) {
    const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    let removed = 0;
    
    for (const [jobId, job] of this.jobQueue.entries()) {
      if (job.completedAt && job.completedAt.getTime() < cutoff) {
        this.jobQueue.delete(jobId);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.log(`🧹 Cleaned up ${removed} old linking jobs`);
    }
  }

  getAppleStorefront() {
    if (this.cachedAppleStorefront && this.cachedAppleStorefrontExpires && this.cachedAppleStorefrontExpires > Date.now()) {
      return this.cachedAppleStorefront;
    }

    const db = getDatabase();
    let storefront = process.env.APPLE_MUSIC_STOREFRONT || 'us';
    try {
      const row = db.prepare('SELECT user_info FROM oauth_tokens WHERE platform = ? ORDER BY id DESC LIMIT 1').get('apple');
      if (row?.user_info) {
        try {
          const info = JSON.parse(row.user_info);
          if (info?.storefront && typeof info.storefront === 'string') {
            storefront = info.storefront.trim().toLowerCase() || storefront;
          }
        } catch (error) {
          console.warn('⚠️  Unable to parse Apple user info for storefront', error.message);
        }
      }
    } catch (error) {
      console.warn('⚠️  Unable to retrieve Apple storefront from oauth_tokens', error.message);
    }

    storefront = typeof storefront === 'string' ? storefront.trim().toLowerCase() : 'us';
    if (!/^[a-z]{2}$/i.test(storefront)) {
      storefront = 'us';
    }

    this.cachedAppleStorefront = storefront;
    this.cachedAppleStorefrontExpires = Date.now() + 5 * 60 * 1000; // cache for 5 minutes
    return storefront;
  }

  resolveMaxConcurrentJobs() {
    const envValue = parsePositiveNumber(process.env.LINKING_MAX_CONCURRENT_JOBS, 10);
    return Math.max(1, Math.min(100, Math.floor(envValue)));
  }

  createRateLimiters() {
    const appleRps = parsePositiveNumber(process.env.LINKING_APPLE_RPS || process.env.LINKING_APPLE_RATE_PER_SEC, 5);
    // TIDAL is very aggressive with 429s - keep rate low to avoid cascading retries
    // Default to 2 req/sec which matches tidalService.js rate limiter
    const tidalRps = parsePositiveNumber(process.env.LINKING_TIDAL_RPS || process.env.LINKING_TIDAL_RATE_PER_SEC, 2);
    const spotifyRps = parsePositiveNumber(process.env.LINKING_SPOTIFY_RPS || process.env.LINKING_SPOTIFY_RATE_PER_SEC, 8);

    return {
      apple: new TokenBucket({ capacity: appleRps, refillRate: appleRps }),
      // Lower capacity for TIDAL to prevent burst requests that trigger 429s
      tidal: new TokenBucket({ capacity: Math.min(tidalRps, 2), refillRate: tidalRps, minIntervalMs: 500 }),
      spotify: new TokenBucket({ capacity: spotifyRps, refillRate: spotifyRps })
    };
  }

  createRateLimitMetrics() {
    const seed = () => ({
      requests: 0,
      rateLimited: 0,
      waits: 0,
      waitMsTotal: 0,
      lastWaitMs: 0,
      last429At: null,
      last429Message: null,
      lastRetryAfterMs: null
    });

    return {
      apple: seed(),
      tidal: seed(),
      spotify: seed()
    };
  }

  markPlatformRequest(platform) {
    const metrics = this.rateLimitMetrics[platform];
    if (!metrics) return;
    metrics.requests += 1;
  }

  async throttlePlatform(platform) {
    const limiter = this.rateLimiters[platform];
    if (!limiter) return 0;
    const waited = await limiter.acquire(1);
    if (waited > 0) {
      const metrics = this.rateLimitMetrics[platform];
      if (metrics) {
        metrics.waits += 1;
        metrics.waitMsTotal += waited;
        metrics.lastWaitMs = waited;
      }
    }
    return waited;
  }

  parseRetryAfterMs(error) {
    const retryAfter = error?.retryAfter ?? error?.response?.headers?.['retry-after'] ?? null;
    if (retryAfter === null || retryAfter === undefined) return null;
    const raw = typeof retryAfter === 'string' ? retryAfter.trim() : retryAfter;
    const numeric = Number.parseFloat(raw);
    if (!Number.isFinite(numeric)) return null;
    if (typeof raw === 'string' && raw.toLowerCase().includes('ms')) {
      return Math.max(0, numeric);
    }
    return Math.max(0, numeric * 1000);
  }

  recordRateLimitHit(platform, error) {
    const metrics = this.rateLimitMetrics[platform];
    if (!metrics) return;
    metrics.rateLimited += 1;
    metrics.last429At = new Date();
    metrics.last429Message = error?.message || null;
    metrics.lastRetryAfterMs = this.parseRetryAfterMs(error);

    console.warn(`⚠️  ${platform.toUpperCase()} rate limit detected`, {
      last429Message: metrics.last429Message,
      retryAfterMs: metrics.lastRetryAfterMs
    });
  }

  isRateLimitError(error) {
    const status = error?.status ?? error?.response?.status;
    if (status === 429) return true;
    const message = error?.message;
    return typeof message === 'string' && message.includes('429');
  }

  getRateLimitMetrics() {
    const snapshot = {};
    for (const [platform, metrics] of Object.entries(this.rateLimitMetrics)) {
      snapshot[platform] = {
        ...metrics,
        limiter: this.rateLimiters[platform]?.snapshot?.() || null
      };
    }
    return snapshot;
  }
}

// Export singleton instance
export const crossPlatformLinkingService = new CrossPlatformLinkingService();
export default crossPlatformLinkingService;
