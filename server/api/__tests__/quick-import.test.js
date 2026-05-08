import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Mock urlImportService
vi.mock('../../services/urlImportService.js', () => ({
  detectUrlTarget: vi.fn((url) => {
    if (url.includes('spotify.com/track')) {
      return { platform: 'spotify', kind: 'track', normalizedUrl: url };
    }
    if (url.includes('spotify.com/playlist')) {
      return { platform: 'spotify', kind: 'playlist', normalizedUrl: url };
    }
    if (url.includes('music.apple.com') && url.includes('playlist')) {
      return { platform: 'apple_music', kind: 'playlist', normalizedUrl: url };
    }
    if (url.includes('tidal.com/track')) {
      return { platform: 'tidal', kind: 'track', normalizedUrl: url };
    }
    return null;
  }),
  resolveTrackFromUrl: vi.fn(async () => ({
    title: 'Test Track',
    artist: 'Test Artist',
    album: 'Test Album',
    isrc: 'USRC12345678',
    spotify_url: 'https://open.spotify.com/track/abc',
    apple_music_url: 'https://music.apple.com/track/123',
    tidal_url: 'https://tidal.com/track/456'
  })),
  resolvePlaylistFromUrl: vi.fn(async () => ({
    platform: 'spotify',
    playlist: {
      title: 'Test Playlist',
      description: 'A test playlist',
      image: 'https://example.com/image.jpg'
    },
    tracks: [
      { title: 'Track 1', artist: 'Artist 1', album: 'Album 1', duration: '3:30', isrc: 'ISRC1' },
      { title: 'Track 2', artist: 'Artist 2', album: 'Album 2', duration: '4:00', isrc: 'ISRC2' }
    ]
  }))
}));

// Mock SpotifyService for cross-linking
vi.mock('../../services/spotifyService.js', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      searchByISRC: vi.fn(async (isrc) => isrc ? {
        id: 'sp_' + isrc,
        url: 'https://open.spotify.com/track/sp_' + isrc,
      } : null),
      searchByMetadata: vi.fn(async () => null)
    }))
  };
});

// Mock TIDAL search
vi.mock('../../services/tidalService.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    searchTidalByTrack: vi.fn(async ({ isrc }) => isrc ? {
      id: 'td_' + isrc,
      url: 'https://tidal.com/browse/track/td_' + isrc,
    } : null)
  };
});

// Mock Apple Music search
vi.mock('../../services/appleMusicService.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    searchAppleMusicByTrack: vi.fn(async ({ isrc }) => isrc ? {
      id: 'ap_' + isrc,
      url: 'https://music.apple.com/track/ap_' + isrc,
    } : null)
  };
});

let app;

describe('quick-import /resolve', () => {
  beforeAll(async () => {
    const { createTestApp } = await import('../../../tests/utils/testApp.js');
    const quickImportRoutes = (await import('../quick-import.js')).default;
    app = createTestApp();
    app.use('/api/v1/quick-import', quickImportRoutes);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Validation ---

  it('returns 400 for missing url', async () => {
    const res = await request(app)
      .post('/api/v1/quick-import/resolve')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 400 for url shorter than 5 chars', async () => {
    const res = await request(app)
      .post('/api/v1/quick-import/resolve')
      .send({ url: 'ab' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for unsupported URL format', async () => {
    const res = await request(app)
      .post('/api/v1/quick-import/resolve')
      .send({ url: 'https://example.com/not-a-platform' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Unsupported URL format');
  });

  // --- Track resolution ---

  it('resolves a single track URL', async () => {
    const { resolveTrackFromUrl } = await import('../../services/urlImportService.js');

    const res = await request(app)
      .post('/api/v1/quick-import/resolve')
      .send({ url: 'https://open.spotify.com/track/abc123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.kind).toBe('track');
    expect(res.body.data.platform).toBe('spotify');
    expect(res.body.data.track).toBeDefined();
    expect(res.body.data.track.title).toBe('Test Track');
    expect(res.body.data.track.artist).toBe('Test Artist');
    expect(res.body.data.stats.totalTimeMs).toBeGreaterThanOrEqual(0);
    expect(resolveTrackFromUrl).toHaveBeenCalledWith(
      'https://open.spotify.com/track/abc123',
      { match: true }
    );
  });

  it('resolves a TIDAL track URL', async () => {
    const res = await request(app)
      .post('/api/v1/quick-import/resolve')
      .send({ url: 'https://tidal.com/track/789' });

    expect(res.status).toBe(200);
    expect(res.body.data.kind).toBe('track');
    expect(res.body.data.platform).toBe('tidal');
  });

  // --- Playlist resolution ---

  it('resolves a Spotify playlist URL', async () => {
    const { resolvePlaylistFromUrl } = await import('../../services/urlImportService.js');

    const res = await request(app)
      .post('/api/v1/quick-import/resolve')
      .send({ url: 'https://open.spotify.com/playlist/xyz789' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.kind).toBe('playlist');
    expect(res.body.data.platform).toBe('spotify');
    expect(res.body.data.playlist.title).toBe('Test Playlist');
    expect(res.body.data.playlist.trackCount).toBe(2);
    expect(res.body.data.tracks).toHaveLength(2);
    expect(res.body.data.tracks[0].position).toBe(1);
    expect(res.body.data.tracks[0].title).toBe('Track 1');
    expect(res.body.data.tracks[1].position).toBe(2);
    expect(res.body.data.stats).toBeDefined();
    expect(resolvePlaylistFromUrl).toHaveBeenCalledWith(
      'https://open.spotify.com/playlist/xyz789',
      { match: false }
    );
    // Cross-linking should have filled in TIDAL + Apple for tracks with ISRCs
    const t1 = res.body.data.tracks[0];
    expect(t1.tidal_id).toBe('td_ISRC1');
    expect(t1.apple_id).toBe('ap_ISRC1');
  });

  it('cross-links Apple Music playlist tracks to Spotify and TIDAL', async () => {
    const { resolvePlaylistFromUrl } = await import('../../services/urlImportService.js');
    resolvePlaylistFromUrl.mockResolvedValueOnce({
      platform: 'apple_music',
      playlist: { title: 'Apple Playlist', description: '', image: null },
      tracks: [
        { title: 'AM Track', artist: 'AM Artist', album: 'AM Album', isrc: 'AMRC1',
          apple_id: 'ap1', artwork_url: 'https://example.com/art.jpg' }
      ]
    });

    const res = await request(app)
      .post('/api/v1/quick-import/resolve')
      .send({ url: 'https://music.apple.com/us/playlist/test/pl.123' });

    expect(res.status).toBe(200);
    expect(res.body.data.platform).toBe('apple_music');
    const track = res.body.data.tracks[0];
    // Already had apple_id, should keep it
    expect(track.apple_id).toBe('ap1');
    // Cross-linked via ISRC
    expect(track.spotify_id).toBe('sp_AMRC1');
    expect(track.tidal_id).toBe('td_AMRC1');
    expect(track.artwork_url).toBe('https://example.com/art.jpg');
  });

  // --- Response shape ---

  it('returns position and core fields in playlist response', async () => {
    const res = await request(app)
      .post('/api/v1/quick-import/resolve')
      .send({ url: 'https://open.spotify.com/playlist/shape-test' });

    expect(res.status).toBe(200);
    const track = res.body.data.tracks[0];
    expect(track.position).toBe(1);
    expect(track).toHaveProperty('title');
    expect(track).toHaveProperty('artist');
    expect(track).toHaveProperty('album');
  });

  // --- Error handling ---

  it('returns 500 when resolve service throws', async () => {
    const { resolvePlaylistFromUrl } = await import('../../services/urlImportService.js');
    resolvePlaylistFromUrl.mockRejectedValueOnce(new Error('Service unavailable'));

    const res = await request(app)
      .post('/api/v1/quick-import/resolve')
      .send({ url: 'https://open.spotify.com/playlist/fail' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Service unavailable');
    expect(res.body.platform).toBe('spotify');
  });

  it('returns 500 when track resolve throws', async () => {
    const { resolveTrackFromUrl } = await import('../../services/urlImportService.js');
    resolveTrackFromUrl.mockRejectedValueOnce(new Error('Track not found'));

    const res = await request(app)
      .post('/api/v1/quick-import/resolve')
      .send({ url: 'https://open.spotify.com/track/missing' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Track not found');
  });

  // --- Anonymous access (no auth required) ---

  it('works without authentication headers', async () => {
    const res = await request(app)
      .post('/api/v1/quick-import/resolve')
      .send({ url: 'https://open.spotify.com/track/anon' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
