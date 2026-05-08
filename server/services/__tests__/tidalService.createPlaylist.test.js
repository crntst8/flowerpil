import { afterEach, describe, expect, it, vi } from 'vitest';
import tidalService, {
  buildTidalPlaylistAttributes,
  TIDAL_PLAYLIST_DESCRIPTION_MAX_LENGTH,
  TIDAL_PLAYLIST_EXPORT_SUFFIX
} from '../tidalService.js';

describe('tidalService playlist payload sanitization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bounds long descriptions and preserves export suffix', () => {
    const attributes = buildTidalPlaylistAttributes({
      title: 'Long Description Playlist',
      description: 'A'.repeat(5000),
      isPublic: true
    });

    expect(attributes.description).toBeDefined();
    expect(attributes.description.length).toBeLessThanOrEqual(TIDAL_PLAYLIST_DESCRIPTION_MAX_LENGTH);
    expect(attributes.description.endsWith(TIDAL_PLAYLIST_EXPORT_SUFFIX)).toBe(true);
  });

  it('omits empty descriptions from playlist create attributes', () => {
    const attributes = buildTidalPlaylistAttributes({
      title: 'No Description Playlist',
      description: '   ',
      isPublic: false
    });

    expect(attributes.description).toBeUndefined();
    expect(attributes.accessType).toBe('UNLISTED');
  });

  it('sends sanitized create payload through createPlaylist', async () => {
    const requestSpy = vi.spyOn(tidalService, 'makeUserRequest').mockResolvedValue({
      data: {
        id: '123',
        attributes: { name: 'Sanitized Playlist' }
      }
    });

    await tidalService.createPlaylist('mock-user-token', {
      title: 'Sanitized Playlist',
      description: 'B'.repeat(5000),
      isPublic: true
    });

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const payload = requestSpy.mock.calls[0][3];
    const description = payload?.data?.attributes?.description;
    expect(description).toBeTypeOf('string');
    expect(description.length).toBeLessThanOrEqual(TIDAL_PLAYLIST_DESCRIPTION_MAX_LENGTH);
    expect(description.endsWith(TIDAL_PLAYLIST_EXPORT_SUFFIX)).toBe(true);
  });
});
