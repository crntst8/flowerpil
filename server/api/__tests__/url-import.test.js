import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { getDatabase, getQueries } from '../../database/db.js';
import { seedTestCurator, seedTestPlaylist } from '../../../tests/utils/seed.js';

// Mock the import runner so jobs don't actually execute
vi.mock('../../services/urlImportRunner.js', () => ({
  startUrlImportJob: vi.fn()
}));

// Mock urlImportService to return controlled detect results
vi.mock('../../services/urlImportService.js', () => ({
  detectUrlTarget: vi.fn((url) => {
    if (url.includes('spotify.com/playlist')) {
      return { platform: 'spotify', kind: 'playlist', normalizedUrl: url };
    }
    if (url.includes('tidal.com/playlist')) {
      return { platform: 'tidal', kind: 'playlist', normalizedUrl: url };
    }
    return null;
  }),
  resolveTrackFromUrl: vi.fn()
}));

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

describe('url-import dedupe', () => {
  beforeAll(async () => {
    const { createTestApp } = await import('../../../tests/utils/testApp.js');
    app = createTestApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses a recent import job with identical params within 30s window', async () => {
    const curator = await seedTestCurator({
      email: 'import-dedupe@test.com',
      curatorName: 'Import Dedupe Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Import Target'
    });
    const auth = await loginCurator(curator);

    const payload = {
      url: 'https://open.spotify.com/playlist/abc123',
      playlist_id: playlist.id,
      mode: 'append',
      append_position: 'bottom',
      update_metadata: true
    };

    const first = await request(app)
      .post('/api/v1/url-import/jobs')
      .set('Cookie', auth.cookieHeader)
      .send(payload);

    const second = await request(app)
      .post('/api/v1/url-import/jobs')
      .set('Cookie', auth.cookieHeader)
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(second.body.success).toBe(true);
    // Should return the same job id - dedupe in action
    expect(second.body.data.jobId).toBe(first.body.data.jobId);

    // Only one job row should exist
    const count = getDatabase().prepare(`
      SELECT COUNT(*) AS count FROM url_import_jobs
      WHERE owner_curator_id = ? AND source_url = ?
    `).get(curator.curatorId, payload.url);
    expect(count.count).toBe(1);
  });

  it('creates a new job when params differ', async () => {
    const curator = await seedTestCurator({
      email: 'import-diff@test.com',
      curatorName: 'Import Diff Curator'
    });
    const playlist = seedTestPlaylist({
      curatorId: curator.curatorId,
      curatorName: curator.curatorName,
      title: 'Diff Target'
    });
    const auth = await loginCurator(curator);

    const first = await request(app)
      .post('/api/v1/url-import/jobs')
      .set('Cookie', auth.cookieHeader)
      .send({
        url: 'https://open.spotify.com/playlist/xyz789',
        playlist_id: playlist.id,
        mode: 'append',
        append_position: 'bottom',
        update_metadata: true
      });

    const second = await request(app)
      .post('/api/v1/url-import/jobs')
      .set('Cookie', auth.cookieHeader)
      .send({
        url: 'https://open.spotify.com/playlist/xyz789',
        playlist_id: playlist.id,
        mode: 'replace', // different mode
        append_position: 'bottom',
        update_metadata: true
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // Different job ids - different params
    expect(second.body.data.jobId).not.toBe(first.body.data.jobId);
  });

  it('creates a new job when no target playlist (null vs null but different URL)', async () => {
    const curator = await seedTestCurator({
      email: 'import-null@test.com',
      curatorName: 'Import Null Curator'
    });
    const auth = await loginCurator(curator);

    const first = await request(app)
      .post('/api/v1/url-import/jobs')
      .set('Cookie', auth.cookieHeader)
      .send({
        url: 'https://open.spotify.com/playlist/aaa111',
        mode: 'append'
      });

    const second = await request(app)
      .post('/api/v1/url-import/jobs')
      .set('Cookie', auth.cookieHeader)
      .send({
        url: 'https://open.spotify.com/playlist/bbb222',
        mode: 'append'
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.jobId).not.toBe(first.body.data.jobId);
  });

  it('passes draft_session_id through to the job row', async () => {
    const curator = await seedTestCurator({
      email: 'import-draft@test.com',
      curatorName: 'Import Draft Curator'
    });
    const auth = await loginCurator(curator);

    const response = await request(app)
      .post('/api/v1/url-import/jobs')
      .set('Cookie', auth.cookieHeader)
      .send({
        url: 'https://open.spotify.com/playlist/draft123',
        mode: 'append',
        draft_session_id: 'test-session-uuid-1234'
      });

    expect(response.status).toBe(200);
    const job = getQueries().getUrlImportJobById.get(response.body.data.jobId);
    expect(job.draft_session_id).toBe('test-session-uuid-1234');
  });
});
