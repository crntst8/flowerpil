import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { getDatabase, getQueries } from '../../database/db.js';
import { seedTestCurator, seedTestPlaylist, seedTrackDspIds } from '../../../tests/utils/seed.js';

// Mock all DSP services so runPlaylistExport never makes real API calls
vi.mock('../spotifyService.js', () => {
  const syncPlaylist = vi.fn(async (token, remoteId, data, tracks) => ({
    platform: 'spotify',
    playlistUrl: `https://open.spotify.com/playlist/${remoteId}`,
    playlistId: remoteId,
    playlistName: data.title,
    tracksAdded: tracks.length,
    totalTracks: tracks.length,
    coverage: 1,
    success: true,
    synced: true,
    coverUploaded: false,
    missingTracks: 0
  }));
  const exportPlaylist = vi.fn(async (token, userId, data, tracks) => ({
    platform: 'spotify',
    playlistUrl: 'https://open.spotify.com/playlist/new-created-id',
    playlistId: 'new-created-id',
    playlistName: data.title,
    tracksAdded: tracks.length,
    totalTracks: tracks.length,
    coverage: 1,
    success: true,
    coverUploaded: false,
    missingTracks: 0
  }));
  return {
    default: class SpotifyService {
      constructor() {
        this.syncPlaylist = syncPlaylist;
        this.exportPlaylist = exportPlaylist;
        this.getAuthURL = vi.fn(() => 'https://accounts.spotify.com/authorize');
      }
    },
    __mocks: { syncPlaylist, exportPlaylist }
  };
});

vi.mock('../tidalService.js', () => ({
  default: {
    syncPlaylist: vi.fn(async () => ({ platform: 'tidal', success: true, playlistUrl: 'https://tidal.com/browse/playlist/tidal-remote', playlistId: 'tidal-remote', tracksAdded: 0, totalTracks: 0 })),
    exportPlaylist: vi.fn(async () => ({ platform: 'tidal', success: true, playlistUrl: 'https://tidal.com/browse/playlist/tidal-new', playlistId: 'tidal-new', tracksAdded: 0, totalTracks: 0 }))
  }
}));

vi.mock('../appleMusicApiService.js', () => ({
  default: {
    exportPlaylist: vi.fn(async () => ({ platform: 'apple', success: true, playlistUrl: 'https://music.apple.com/playlist/p.xxx', playlistId: 'p.xxx', tracksAdded: 0, totalTracks: 0 }))
  }
}));

vi.mock('../youtubeMusicService.js', () => ({
  default: {
    exportPlaylist: vi.fn(async () => ({ platform: 'youtube_music', success: true, playlistUrl: 'https://music.youtube.com/playlist?list=YT123', playlistId: 'YT123', tracksAdded: 0, totalTracks: 0 }))
  }
}));

vi.mock('../SlackNotificationService.js', () => ({
  default: {
    notifyAppleExportSuccess: vi.fn(async () => {})
  }
}));

// Import mocks to inspect calls
const { __mocks: spotifyMocks } = await import('../spotifyService.js');
const tidalService = (await import('../tidalService.js')).default;
const { runPlaylistExport } = await import('../playlistExportRunner.js');

/**
 * Seed a flowerpil oauth token for the given platform so the runner can authenticate.
 */
const seedOAuthToken = (platform, { accountType = 'flowerpil', curatorId = null, userInfo = null } = {}) => {
  const db = getDatabase();
  // Use an ISO timestamp with Z suffix so JavaScript Date parsing treats it as UTC
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  const info = db.prepare(`
    INSERT INTO export_oauth_tokens (
      platform, account_type, owner_curator_id, account_label,
      access_token, refresh_token, expires_at, is_active, user_info
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    platform,
    accountType,
    curatorId,
    `${accountType}-${platform}`,
    `fake-access-token-${platform}`,
    `fake-refresh-token-${platform}`,
    expiresAt,
    userInfo ? JSON.stringify(userInfo) : null
  );
  return Number(info.lastInsertRowid);
};

describe('runPlaylistExport integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls syncPlaylist when managed export exists with matching ownership', async () => {
    const curator = await seedTestCurator({
      email: 'sync-match@test.com',
      curatorName: 'Sync Match Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Sync Match Playlist',
      published: true,
      trackCount: 3
    });
    seedTrackDspIds(playlist.id, { spotify: true, tidal: false });
    seedOAuthToken('spotify', { userInfo: { id: 'spotify-user-1' } });

    const queries = getQueries();

    // Create a managed export owned by flowerpil
    queries.upsertPlaylistDspExport.run(
      playlist.id, 'spotify', 'flowerpil', null,
      'existing-remote', 'https://open.spotify.com/playlist/existing-remote',
      'Sync Match Playlist', 'active', null
    );

    const { ensureExportRequest } = await import('../exportRequestService.js');
    const request = ensureExportRequest({
      playlistId: playlist.id,
      destinations: ['spotify'],
      requestedBy: 'system',
      accountPreferences: { spotify: { account_type: 'flowerpil', mode: 'replace_existing' } }
    });

    await runPlaylistExport({
      playlistId: playlist.id,
      platform: 'spotify',
      exportRequestId: request.id,
      accountPreference: { account_type: 'flowerpil', mode: 'replace_existing' },
      mode: 'replace_existing'
    });

    // syncPlaylist should have been called (not exportPlaylist)
    expect(spotifyMocks.syncPlaylist).toHaveBeenCalledTimes(1);
    expect(spotifyMocks.exportPlaylist).not.toHaveBeenCalled();

    // Verify the sync was called with the existing remote playlist ID
    const syncCall = spotifyMocks.syncPlaylist.mock.calls[0];
    expect(syncCall[1]).toBe('existing-remote'); // remotePlaylistId

    // Verify snapshot was created
    const managedExport = queries.findPlaylistDspExport.get(playlist.id, 'spotify');
    expect(managedExport.last_snapshot_id).toBeGreaterThan(0);

    const snapshot = queries.findLatestSnapshot.get(managedExport.id);
    expect(snapshot).toBeTruthy();
    expect(snapshot.rollback_capability).toBe('full');
    expect(snapshot.status).toBe('applied');
  });

  it('calls exportPlaylist (not syncPlaylist) when ownership mismatches', async () => {
    const curator = await seedTestCurator({
      email: 'sync-mismatch@test.com',
      curatorName: 'Sync Mismatch Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Sync Mismatch Playlist',
      published: true,
      trackCount: 3
    });
    seedTrackDspIds(playlist.id, { spotify: true, tidal: false });
    seedOAuthToken('spotify', { userInfo: { id: 'spotify-user-2' } });

    const queries = getQueries();

    // Managed export belongs to a curator
    queries.upsertPlaylistDspExport.run(
      playlist.id, 'spotify', 'curator', curator.curatorId,
      'curator-remote', 'https://open.spotify.com/playlist/curator-remote',
      'Curator Owned Playlist', 'active', null
    );

    await runPlaylistExport({
      playlistId: playlist.id,
      platform: 'spotify',
      accountPreference: { account_type: 'flowerpil', mode: 'replace_existing' },
      mode: 'replace_existing'
    });

    // exportPlaylist should have been called (ownership mismatch prevents sync)
    expect(spotifyMocks.exportPlaylist).toHaveBeenCalledTimes(1);
    expect(spotifyMocks.syncPlaylist).not.toHaveBeenCalled();

    // No snapshot should have been created (since we didn't sync)
    const managedExport = queries.findPlaylistDspExport.get(playlist.id, 'spotify');
    // The upsert overwrites the old curator row with the new flowerpil export
    expect(managedExport.account_type).toBe('flowerpil');
    expect(managedExport.remote_playlist_id).toBe('new-created-id');
    expect(managedExport.last_snapshot_id).toBeNull();
  });

  it('preserves imported source URL and only writes exported_*_url', async () => {
    const curator = await seedTestCurator({
      email: 'preserve-source@test.com',
      curatorName: 'Preserve Source Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Preserve Source Playlist',
      published: true,
      trackCount: 3
    });
    seedTrackDspIds(playlist.id, { spotify: true, tidal: false });
    seedOAuthToken('spotify', { userInfo: { id: 'spotify-user-3' } });

    const db = getDatabase();
    // Set an imported source URL
    db.prepare('UPDATE playlists SET spotify_url = ? WHERE id = ?')
      .run('https://open.spotify.com/playlist/imported-original', playlist.id);

    await runPlaylistExport({
      playlistId: playlist.id,
      platform: 'spotify',
      accountPreference: { account_type: 'flowerpil', mode: 'replace_existing' }
    });

    const pl = db.prepare('SELECT spotify_url, exported_spotify_url FROM playlists WHERE id = ?').get(playlist.id);

    // Source URL should be preserved (not overwritten)
    expect(pl.spotify_url).toBe('https://open.spotify.com/playlist/imported-original');
    // Exported URL should be the new export
    expect(pl.exported_spotify_url).toBe('https://open.spotify.com/playlist/new-created-id');
  });

  it('calls exportPlaylist when mode is create_new even with existing managed export', async () => {
    const curator = await seedTestCurator({
      email: 'create-new@test.com',
      curatorName: 'Create New Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Create New Playlist',
      published: true,
      trackCount: 3
    });
    seedTrackDspIds(playlist.id, { spotify: true, tidal: false });
    seedOAuthToken('spotify', { userInfo: { id: 'spotify-user-4' } });

    const queries = getQueries();

    // Managed export exists with matching ownership
    queries.upsertPlaylistDspExport.run(
      playlist.id, 'spotify', 'flowerpil', null,
      'existing-for-create-new', 'https://open.spotify.com/playlist/existing-for-create-new',
      'Create New Playlist', 'active', null
    );

    await runPlaylistExport({
      playlistId: playlist.id,
      platform: 'spotify',
      accountPreference: { account_type: 'flowerpil', mode: 'create_new' },
      mode: 'create_new'
    });

    // Should create new, not sync
    expect(spotifyMocks.exportPlaylist).toHaveBeenCalledTimes(1);
    expect(spotifyMocks.syncPlaylist).not.toHaveBeenCalled();
  });
});
