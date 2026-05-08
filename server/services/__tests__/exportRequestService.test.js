import { describe, it, expect } from 'vitest';
import { getDatabase, getQueries } from '../../database/db.js';
import { seedTestCurator, seedTestPlaylist } from '../../../tests/utils/seed.js';
import {
  ensureExportRequest,
  normalizeDestinationsForStorage,
  getDestinationsFromStoredValue
} from '../exportRequestService.js';

describe('exportRequestService helpers', () => {
  it('normalizes and sorts destinations with duplicates and casing', () => {
    const result = normalizeDestinationsForStorage(['Spotify', 'tidal', 'APPLE', 'spotify']);
    expect(result).toEqual(['spotify', 'apple', 'tidal']);
  });

  it('parses destinations stored as JSON string', () => {
    const stored = JSON.stringify(['tidal', 'spotify']);
    const parsed = getDestinationsFromStoredValue(stored);
    expect(parsed).toEqual(['spotify', 'tidal']);
  });

  it('parses destinations stored as CSV fallback', () => {
    const parsed = getDestinationsFromStoredValue('spotify, apple , unknown , tidal');
    expect(parsed).toEqual(['spotify', 'apple', 'tidal']);
  });
});

describe('managed export schema', () => {
  it('adds execution_mode to export requests and draft_session_id to url import jobs', () => {
    const database = getDatabase();

    const exportRequestColumns = database.prepare("PRAGMA table_info(export_requests)").all();
    const urlImportColumns = database.prepare("PRAGMA table_info(url_import_jobs)").all();

    expect(exportRequestColumns.some((column) => column.name === 'execution_mode')).toBe(true);
    expect(urlImportColumns.some((column) => column.name === 'draft_session_id')).toBe(true);
  });

  it('upserts managed export rows uniquely per playlist and platform', async () => {
    const curator = await seedTestCurator({
      email: 'exports-schema@test.com',
      curatorName: 'Schema Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Managed Export Test'
    });

    const queries = getQueries();

    expect(typeof queries.upsertPlaylistDspExport?.run).toBe('function');
    expect(typeof queries.findPlaylistDspExport?.get).toBe('function');
    expect(typeof queries.findPlaylistDspExports?.all).toBe('function');

    queries.upsertPlaylistDspExport.run(
      playlist.id,
      'spotify',
      'flowerpil',
      null,
      'remote-playlist-1',
      'https://open.spotify.com/playlist/remote-playlist-1',
      'First Export',
      'active',
      null
    );

    queries.upsertPlaylistDspExport.run(
      playlist.id,
      'spotify',
      'flowerpil',
      null,
      'remote-playlist-2',
      'https://open.spotify.com/playlist/remote-playlist-2',
      'Updated Export',
      'active',
      null
    );

    const row = queries.findPlaylistDspExport.get(playlist.id, 'spotify');
    const rows = queries.findPlaylistDspExports.all(playlist.id);

    expect(rows).toHaveLength(1);
    expect(row).toMatchObject({
      playlist_id: playlist.id,
      platform: 'spotify',
      remote_playlist_id: 'remote-playlist-2',
      remote_playlist_url: 'https://open.spotify.com/playlist/remote-playlist-2',
      remote_playlist_name: 'Updated Export',
      status: 'active'
    });
  });

  it('stores immutable export snapshots linked to managed exports', async () => {
    const curator = await seedTestCurator({
      email: 'snapshots@test.com',
      curatorName: 'Snapshot Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Snapshot Playlist'
    });

    const queries = getQueries();

    queries.upsertPlaylistDspExport.run(
      playlist.id,
      'tidal',
      'flowerpil',
      null,
      'b77f3d19-remote',
      'https://tidal.com/browse/playlist/b77f3d19-remote',
      'TIDAL Export',
      'active',
      null
    );

    const managedExport = queries.findPlaylistDspExport.get(playlist.id, 'tidal');

    expect(typeof queries.createExportSnapshot?.run).toBe('function');
    expect(typeof queries.findLatestSnapshot?.get).toBe('function');

    const insertInfo = queries.createExportSnapshot.run(
      playlist.id,
      'tidal',
      managedExport.id,
      'replace_existing',
      null,
      'flowerpil',
      null,
      managedExport.remote_playlist_id,
      managedExport.remote_playlist_url,
      JSON.stringify({ title: 'Snapshot Playlist', track_count: playlist.trackCount }),
      JSON.stringify({ etag: 'etag-1', tracks: ['track-1', 'track-2'] }),
      'full',
      'created'
    );

    const snapshot = queries.findLatestSnapshot.get(managedExport.id);

    expect(Number(insertInfo.lastInsertRowid)).toBeGreaterThan(0);
    expect(snapshot).toMatchObject({
      playlist_id: playlist.id,
      platform: 'tidal',
      playlist_dsp_export_id: managedExport.id,
      mode: 'replace_existing',
      request_id: null,
      remote_playlist_id: 'b77f3d19-remote',
      rollback_capability: 'full',
      status: 'created'
    });
  });
});

describe('ensureExportRequest', () => {
  it('defaults export mode and uses inline execution for curator-owned exports', async () => {
    const curator = await seedTestCurator({
      email: 'curator-inline@test.com',
      curatorName: 'Inline Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Inline Export Playlist'
    });

    const record = ensureExportRequest({
      playlistId: playlist.id,
      destinations: ['Spotify'],
      requestedBy: 'curator',
      accountPreferences: {
        spotify: {
          account_type: 'curator',
          owner_curator_id: curator.curatorId
        }
      },
      curatorId: curator.curatorId
    });

    expect(record.execution_mode).toBe('inline');
    expect(record.account_preferences.spotify).toMatchObject({
      account_type: 'curator',
      owner_curator_id: curator.curatorId,
      mode: 'replace_existing'
    });

    const stored = getQueries().findExportRequestById.get(record.id);
    expect(stored.execution_mode).toBe('inline');
  });

  it('reuses a matching recent completed request instead of creating a duplicate', async () => {
    const curator = await seedTestCurator({
      email: 'recent-request@test.com',
      curatorName: 'Recent Request Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Recent Request Playlist'
    });

    const database = getDatabase();
    const accountPreferences = JSON.stringify({
      spotify: {
        account_type: 'flowerpil',
        owner_curator_id: null,
        mode: 'replace_existing'
      }
    });
    const insertInfo = database.prepare(`
      INSERT INTO export_requests (
        playlist_id,
        requested_by,
        destinations,
        status,
        results,
        last_error,
        account_preferences,
        execution_mode,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-10 seconds'), datetime('now', '-10 seconds'))
    `).run(
      playlist.id,
      'curator',
      JSON.stringify(['spotify']),
      'completed',
      JSON.stringify({
        spotify: {
          status: 'success',
          playlistUrl: 'https://open.spotify.com/playlist/existing'
        }
      }),
      null,
      accountPreferences,
      'worker'
    );

    const record = ensureExportRequest({
      playlistId: playlist.id,
      destinations: ['spotify'],
      requestedBy: 'curator',
      accountPreferences: {
        spotify: {
          account_type: 'flowerpil'
        }
      }
    });

    expect(record.id).toBe(Number(insertInfo.lastInsertRowid));
    expect(record.status).toBe('completed');

    const count = database.prepare(`
      SELECT COUNT(*) AS count
      FROM export_requests
      WHERE playlist_id = ?
    `).get(playlist.id);

    expect(count.count).toBe(1);
  });
});
