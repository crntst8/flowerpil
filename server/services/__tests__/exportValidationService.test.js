import { describe, it, expect } from 'vitest';
import { getDatabase, getQueries } from '../../database/db.js';
import { seedTestCurator, seedTestPlaylist, seedTrackDspIds } from '../../../tests/utils/seed.js';
import ExportValidationService from '../ExportValidationService.js';

const validationService = new ExportValidationService();

describe('ExportValidationService managed export awareness', () => {
  it('treats imported spotify_url without managed export as source-only', async () => {
    const curator = await seedTestCurator({
      email: 'source-only@test.com',
      curatorName: 'Source Only Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Source Only Playlist',
      published: true,
      trackCount: 3
    });

    seedTrackDspIds(playlist.id, { spotify: true, tidal: false });

    const db = getDatabase();
    // Set source URL only (from import), no exported_spotify_url
    db.prepare('UPDATE playlists SET spotify_url = ? WHERE id = ?')
      .run('https://open.spotify.com/playlist/imported-id', playlist.id);

    const result = await validationService.validatePlaylistForExport(playlist.id, 'spotify');

    expect(result.existingPlaylistUrl).toBe('https://open.spotify.com/playlist/imported-id');
    expect(result.alreadyExported).toBe(false);
    expect(result.managedExport).toBeNull();
  });

  it('uses playlist_dsp_exports for managed export detection when available', async () => {
    const curator = await seedTestCurator({
      email: 'managed-detect@test.com',
      curatorName: 'Managed Detect Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Managed Detect Playlist',
      published: true,
      trackCount: 3
    });

    seedTrackDspIds(playlist.id, { spotify: true, tidal: false });

    const queries = getQueries();
    // Create a managed export record
    queries.upsertPlaylistDspExport.run(
      playlist.id, 'spotify', 'flowerpil', null,
      'managed-remote-id',
      'https://open.spotify.com/playlist/managed-remote-id',
      'Managed Detect Playlist', 'active', null
    );

    const result = await validationService.validatePlaylistForExport(playlist.id, 'spotify');

    expect(result.alreadyExported).toBe(true);
    expect(result.exportedUrl).toBe('https://open.spotify.com/playlist/managed-remote-id');
    expect(result.managedExport).toMatchObject({
      remote_playlist_id: 'managed-remote-id',
      status: 'active',
      account_type: 'flowerpil',
      owner_curator_id: null
    });
  });

  it('exposes account_type and owner_curator_id on managed export for UI ownership checks', async () => {
    const curator = await seedTestCurator({
      email: 'ownership-check@test.com',
      curatorName: 'Ownership Check Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Ownership Check Playlist',
      published: true,
      trackCount: 3
    });

    seedTrackDspIds(playlist.id, { spotify: true, tidal: false });

    const queries = getQueries();
    queries.upsertPlaylistDspExport.run(
      playlist.id, 'spotify', 'curator', curator.curatorId,
      'curator-remote-id',
      'https://open.spotify.com/playlist/curator-remote-id',
      'Ownership Check Playlist', 'active', null
    );

    const result = await validationService.validatePlaylistForExport(playlist.id, 'spotify');

    expect(result.managedExport.account_type).toBe('curator');
    expect(result.managedExport.owner_curator_id).toBe(curator.curatorId);
  });

  it('falls back to legacy exported_*_url when no managed export row exists', async () => {
    const curator = await seedTestCurator({
      email: 'legacy-fallback@test.com',
      curatorName: 'Legacy Fallback Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Legacy Fallback Playlist',
      published: true,
      trackCount: 3
    });

    seedTrackDspIds(playlist.id, { spotify: true, tidal: false });

    const db = getDatabase();
    // Set legacy exported URL without managed export row
    db.prepare('UPDATE playlists SET exported_spotify_url = ?, spotify_url = ? WHERE id = ?')
      .run('https://open.spotify.com/playlist/legacy-id', 'https://open.spotify.com/playlist/legacy-id', playlist.id);

    const result = await validationService.validatePlaylistForExport(playlist.id, 'spotify');

    expect(result.alreadyExported).toBe(true);
    expect(result.exportedUrl).toBe('https://open.spotify.com/playlist/legacy-id');
    expect(result.managedExport).toBeNull();
  });
});
