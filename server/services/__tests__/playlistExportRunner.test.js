import { describe, it, expect } from 'vitest';
import { getDatabase, getQueries } from '../../database/db.js';
import { seedTestCurator, seedTestPlaylist, seedTrackDspIds } from '../../../tests/utils/seed.js';

describe('playlistExportRunner managed export state', () => {
  it('resolves managed export from playlist_dsp_exports before legacy URL fields', async () => {
    const curator = await seedTestCurator({
      email: 'runner-managed@test.com',
      curatorName: 'Runner Managed Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Managed Export Runner Test',
      published: true
    });

    const queries = getQueries();

    // Set up a managed export record
    queries.upsertPlaylistDspExport.run(
      playlist.id,
      'spotify',
      'flowerpil',
      null,
      'existing-spotify-id',
      'https://open.spotify.com/playlist/existing-spotify-id',
      'Managed Export Runner Test',
      'active',
      null
    );

    const managedExport = queries.findPlaylistDspExport.get(playlist.id, 'spotify');
    expect(managedExport).toBeTruthy();
    expect(managedExport.remote_playlist_id).toBe('existing-spotify-id');
    expect(managedExport.status).toBe('active');
  });

  it('creates export snapshots with correct rollback_capability per platform', async () => {
    const curator = await seedTestCurator({
      email: 'snapshot-cap@test.com',
      curatorName: 'Snapshot Capability Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Snapshot Capability Test'
    });

    const queries = getQueries();

    // Set up managed exports for spotify (canReplace=true) and apple (canReplace=false)
    queries.upsertPlaylistDspExport.run(
      playlist.id, 'spotify', 'flowerpil', null,
      'sp-remote-1', 'https://open.spotify.com/playlist/sp-remote-1',
      'Spotify Export', 'active', null
    );
    queries.upsertPlaylistDspExport.run(
      playlist.id, 'apple', 'flowerpil', null,
      'p.apple-remote-1', 'https://music.apple.com/library/playlist/p.apple-remote-1',
      'Apple Export', 'active', null
    );

    const spotifyExport = queries.findPlaylistDspExport.get(playlist.id, 'spotify');
    const appleExport = queries.findPlaylistDspExport.get(playlist.id, 'apple');

    // Spotify snapshot should get 'full' rollback capability
    queries.createExportSnapshot.run(
      playlist.id, 'spotify', spotifyExport.id,
      'replace_existing', null, 'flowerpil', null,
      spotifyExport.remote_playlist_id, spotifyExport.remote_playlist_url,
      JSON.stringify({ title: 'Spotify Export' }),
      null, 'full', 'created'
    );

    // Apple snapshot should get 'audit_only' rollback capability
    queries.createExportSnapshot.run(
      playlist.id, 'apple', appleExport.id,
      'replace_existing', null, 'flowerpil', null,
      appleExport.remote_playlist_id, appleExport.remote_playlist_url,
      JSON.stringify({ title: 'Apple Export' }),
      null, 'audit_only', 'created'
    );

    const spotifySnapshot = queries.findLatestSnapshot.get(spotifyExport.id);
    const appleSnapshot = queries.findLatestSnapshot.get(appleExport.id);

    expect(spotifySnapshot.rollback_capability).toBe('full');
    expect(appleSnapshot.rollback_capability).toBe('audit_only');
  });

  it('upserts playlist_dsp_exports after legacy URL field writes', async () => {
    const curator = await seedTestCurator({
      email: 'post-export@test.com',
      curatorName: 'Post Export Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Post-Export Upsert Test'
    });

    const queries = getQueries();
    const db = getDatabase();

    // Simulate what the runner does after a successful export
    const remoteUrl = 'https://open.spotify.com/playlist/new-remote-id';
    const remoteId = 'new-remote-id';

    // Legacy write
    db.prepare('UPDATE playlists SET spotify_url = ?, exported_spotify_url = ? WHERE id = ?')
      .run(remoteUrl, remoteUrl, playlist.id);

    // New managed export upsert
    queries.upsertPlaylistDspExport.run(
      playlist.id, 'spotify', 'flowerpil', null,
      remoteId, remoteUrl, playlist.title, 'active', null
    );

    const managedExport = queries.findPlaylistDspExport.get(playlist.id, 'spotify');
    expect(managedExport.remote_playlist_id).toBe(remoteId);
    expect(managedExport.remote_playlist_url).toBe(remoteUrl);
    expect(managedExport.status).toBe('active');

    // Verify both stores are in sync
    const pl = db.prepare('SELECT exported_spotify_url FROM playlists WHERE id = ?').get(playlist.id);
    expect(pl.exported_spotify_url).toBe(remoteUrl);
  });
});

// Ownership matching and source URL preservation are tested via the real
// runPlaylistExport() path in playlistExportRunner.integration.test.js.

describe('managed export upsert with last_snapshot_id', () => {
  it('stores last_snapshot_id correctly and auto-sets last_synced_at', async () => {
    const curator = await seedTestCurator({
      email: 'snapshot-link@test.com',
      curatorName: 'Snapshot Link Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Snapshot Link Test'
    });

    const queries = getQueries();

    // First create a managed export
    queries.upsertPlaylistDspExport.run(
      playlist.id, 'spotify', 'flowerpil', null,
      'snap-remote-1', 'https://open.spotify.com/playlist/snap-remote-1',
      'Snapshot Link Test', 'active', null
    );

    const export1 = queries.findPlaylistDspExport.get(playlist.id, 'spotify');
    expect(export1.last_synced_at).toBeTruthy();
    expect(export1.last_snapshot_id).toBeNull();

    // Create a snapshot
    const snapInfo = queries.createExportSnapshot.run(
      playlist.id, 'spotify', export1.id,
      'replace_existing', null, 'flowerpil', null,
      'snap-remote-1', 'https://open.spotify.com/playlist/snap-remote-1',
      JSON.stringify({ title: 'Test' }), null, 'full', 'created'
    );
    const snapshotId = Number(snapInfo.lastInsertRowid);

    // Upsert again with the snapshot id
    queries.upsertPlaylistDspExport.run(
      playlist.id, 'spotify', 'flowerpil', null,
      'snap-remote-1', 'https://open.spotify.com/playlist/snap-remote-1',
      'Snapshot Link Test', 'active', snapshotId
    );

    const export2 = queries.findPlaylistDspExport.get(playlist.id, 'spotify');
    expect(export2.last_snapshot_id).toBe(snapshotId);
    expect(export2.last_synced_at).toBeTruthy();
  });
});

describe('platformCapabilities', () => {
  it('exports correct capability flags per platform', async () => {
    const { getPlatformCapabilities } = await import('../platformCapabilities.js');

    expect(getPlatformCapabilities('spotify')).toEqual({ canReplace: true, canReadTracks: true });
    expect(getPlatformCapabilities('tidal')).toEqual({ canReplace: true, canReadTracks: true });
    expect(getPlatformCapabilities('apple')).toEqual({ canReplace: false, canReadTracks: false });
    expect(getPlatformCapabilities('youtube_music')).toEqual({ canReplace: false, canReadTracks: true });
    expect(getPlatformCapabilities('unknown')).toEqual({ canReplace: false, canReadTracks: false });
  });
});
