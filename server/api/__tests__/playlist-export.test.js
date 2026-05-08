import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { getDatabase, getQueries } from '../../database/db.js';
import { seedTestCurator, seedTestPlaylist } from '../../../tests/utils/seed.js';

vi.mock('../../services/playlistExportRunner.js', () => ({
  runPlaylistExport: vi.fn(async ({ exportRequestId, platform }) => ({
    result: {
      success: true,
      playlistUrl: `https://example.com/${platform}/${exportRequestId}`
    }
  }))
}));

const { runPlaylistExport } = await import('../../services/playlistExportRunner.js');
let app;

const extractCookies = (response) => {
  const raw = response.headers['set-cookie'] || [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((cookie) => cookie.split(';')[0]).filter(Boolean);
};

const loginCurator = async (curator) => {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({
      username: curator.email,
      password: curator.password
    });

  return {
    cookieHeader: extractCookies(response).join('; '),
    csrfToken: response.body.csrfToken
  };
};

describe('playlist export routes', () => {
  beforeAll(async () => {
    const { createTestApp } = await import('../../../tests/utils/testApp.js');
    app = createTestApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues curator exports through ensureExportRequest and reuses the same pending request', async () => {
    const curator = await seedTestCurator({
      email: 'queue-export@test.com',
      curatorName: 'Queue Export Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Queued Export Playlist',
      published: true
    });
    const auth = await loginCurator(curator);

    const firstResponse = await request(app)
      .post(`/api/v1/export/playlists/${playlist.id}/queue-export/spotify`)
      .set('Cookie', auth.cookieHeader)
      .send({});

    const secondResponse = await request(app)
      .post(`/api/v1/export/playlists/${playlist.id}/queue-export/spotify`)
      .set('Cookie', auth.cookieHeader)
      .send({});

    expect(firstResponse.status).toBe(202);
    expect(secondResponse.status).toBe(202);
    expect(firstResponse.body.success).toBe(true);
    expect(secondResponse.body.success).toBe(true);
    expect(secondResponse.body.data.request_id).toBe(firstResponse.body.data.request_id);

    const queries = getQueries();
    const row = queries.findExportRequestById.get(firstResponse.body.data.request_id);
    const count = getDatabase().prepare(`
      SELECT COUNT(*) AS count
      FROM export_requests
      WHERE playlist_id = ?
    `).get(playlist.id);

    expect(row.execution_mode).toBe('inline');
    expect(JSON.parse(row.account_preferences)).toMatchObject({
      spotify: {
        account_type: 'curator',
        owner_curator_id: curator.curatorId,
        mode: 'replace_existing'
      }
    });
    expect(count.count).toBe(1);
  });

  it('creates an export request before running the blocking export path', async () => {
    const curator = await seedTestCurator({
      email: 'blocking-export@test.com',
      curatorName: 'Blocking Export Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Blocking Export Playlist',
      published: true
    });
    const auth = await loginCurator(curator);

    const response = await request(app)
      .post(`/api/v1/export/playlists/${playlist.id}/export/spotify`)
      .set('Cookie', auth.cookieHeader)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(runPlaylistExport).toHaveBeenCalledTimes(1);

    const firstCall = runPlaylistExport.mock.calls[0][0];
    expect(firstCall.exportRequestId).toBeTypeOf('number');

    const stored = getQueries().findExportRequestById.get(firstCall.exportRequestId);
    expect(stored).toBeTruthy();
    expect(stored.execution_mode).toBe('inline');
  });
});
