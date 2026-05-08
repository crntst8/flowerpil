import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheService, cachedFetch } from '../cacheService.js';

describe('cacheService fetch cache integration', () => {
  const playlistUrl = '/api/v1/playlists?published=true';
  const responseHeaders = { 'Content-Type': 'application/json' };

  beforeEach(() => {
    cacheService.clearAllCaches();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    cacheService.destroy();
  });

  it('invalidates cached fetch responses when playlist listings are cleared', async () => {
    const responses = [
      new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: responseHeaders }),
      new Response(JSON.stringify({ success: true, data: [{ id: 'fresh' }] }), { status: 200, headers: responseHeaders })
    ];

    const fetchMock = vi.fn(() => Promise.resolve(responses.shift()));
    vi.stubGlobal('fetch', fetchMock);

    const first = await cachedFetch(playlistUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstPayload = await first.clone().json();
    expect(firstPayload.data).toEqual([]);

    const second = await cachedFetch(playlistUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const secondPayload = await second.clone().json();
    expect(secondPayload.data).toEqual([]);

    cacheService.clearPlaylistListings();

    const third = await cachedFetch(playlistUrl);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const thirdPayload = await third.clone().json();
    expect(thirdPayload.data).toEqual([{ id: 'fresh' }]);
  });

  it('clears dependent fetch cache entries for genre catalog', () => {
    const cacheKey = 'fetch:/api/v1/genre-categories:{}';
    cacheService.setCachedFetch(cacheKey, { categories: [{ id: 'house' }] });
    expect(cacheService.getCachedFetch(cacheKey)).toBeTruthy();

    cacheService.clearGenreCache();

    expect(cacheService.getCachedFetch(cacheKey)).toBeNull();
  });
});
