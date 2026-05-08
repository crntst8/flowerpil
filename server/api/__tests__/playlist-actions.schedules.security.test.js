/**
 * Playlist Schedules Authorization Tests
 *
 * Ensures curator-facing schedule endpoints enforce tenant isolation and that
 * admin users retain full control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../../tests/utils/testApp.js';
import { seedTestCurator, seedTestPlaylist } from '../../../tests/utils/seed.js';
import { getDatabase, getQueries } from '../../database/db.js';

vi.mock('../../services/autoExportService.js', () => ({
  queueAutoExportForPlaylist: vi.fn(() => ({ queued: false, reason: 'test_environment_stub' }))
}));

vi.mock('../../services/dspTelemetryService.js', () => ({
  logAutoExportEvent: vi.fn()
}));

const app = createTestApp();

const extractSession = (response) => {
  const raw = response.headers['set-cookie'] || [];
  const cookies = (Array.isArray(raw) ? raw : [raw])
    .map((cookie) => cookie.split(';')[0])
    .filter(Boolean);

  return {
    cookie: cookies.join('; '),
    csrfToken: response.body?.csrfToken || null
  };
};

const authHeaders = ({ cookie, csrfToken }) => {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  return headers;
};

describe('Playlist Actions - Scheduled Imports security', () => {
  let curatorOne;
  let curatorTwo;
  let playlistOne;
  let playlistTwo;
  let scheduleOne;
  let scheduleTwo;
  let sessionOne;
  let sessionTwo;
  let adminSession;

  beforeEach(async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    curatorOne = await seedTestCurator({
      email: `curator-one+${unique}@test.com`,
      password: 'CuratorPass1!',
      curatorName: `Curator One ${unique}`
    });
    curatorTwo = await seedTestCurator({
      email: `curator-two+${unique}@test.com`,
      password: 'CuratorPass2!',
      curatorName: `Curator Two ${unique}`
    });

    playlistOne = seedTestPlaylist({
      curatorId: curatorOne.curatorId,
      curatorName: curatorOne.curatorName,
      title: `Playlist One ${unique}`,
      published: true,
      trackCount: 0
    });

    playlistTwo = seedTestPlaylist({
      curatorId: curatorTwo.curatorId,
      curatorName: curatorTwo.curatorName,
      title: `Playlist Two ${unique}`,
      published: true,
      trackCount: 0
    });

    const loginOne = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: curatorOne.email, password: curatorOne.password });
    sessionOne = extractSession(loginOne);

    const loginTwo = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: curatorTwo.email, password: curatorTwo.password });
    sessionTwo = extractSession(loginTwo);

    const createOne = await request(app)
      .post('/api/v1/playlist-actions/schedules')
      .set(authHeaders(sessionOne))
      .send({
        playlist_id: playlistOne.id,
        frequency: 'daily',
        time_utc: '09:00',
        mode: 'replace'
      });
    expect(createOne.status).toBe(201);
    scheduleOne = createOne.body?.data;

    const createTwo = await request(app)
      .post('/api/v1/playlist-actions/schedules')
      .set(authHeaders(sessionTwo))
      .send({
        playlist_id: playlistTwo.id,
        frequency: 'daily',
        time_utc: '10:00',
        mode: 'replace'
      });
    expect(createTwo.status).toBe(201);
    scheduleTwo = createTwo.body?.data;

    const queries = getQueries();
    const { hashPassword } = await import('../../utils/authUtils.js');
    const adminEmail = `admin+${unique}@test.com`;
    const adminPassword = 'AdminPass123!';
    queries.createAdminUser.run(
      adminEmail,
      await hashPassword(adminPassword),
      'admin',
      1
    );

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminEmail, password: adminPassword });
    adminSession = extractSession(adminLogin);
  });

  it('only returns schedules owned by the curator', async () => {
    const response = await request(app)
      .get('/api/v1/playlist-actions/schedules')
      .set(authHeaders(sessionOne));

    expect(response.status).toBe(200);
    const data = Array.isArray(response.body?.data) ? response.body.data : [];
    expect(data).toHaveLength(1);
    expect(data[0]?.id).toBe(scheduleOne?.id);
    expect(data[0]?.playlist_id).toBe(playlistOne.id);
  });

  it('does not expose another curator’s playlist schedules', async () => {
    const response = await request(app)
      .get(`/api/v1/playlist-actions/schedules?playlistId=${playlistTwo.id}`)
      .set(authHeaders(sessionOne));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);
  });

  it('blocks creation of a schedule for a playlist the curator does not own', async () => {
    const response = await request(app)
      .post('/api/v1/playlist-actions/schedules')
      .set(authHeaders(sessionOne))
      .send({
        playlist_id: playlistTwo.id,
        frequency: 'daily',
        time_utc: '12:00',
        mode: 'append'
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it('prevents updates to schedules owned by other curators', async () => {
    const response = await request(app)
      .put(`/api/v1/playlist-actions/schedules/${scheduleTwo.id}`)
      .set(authHeaders(sessionOne))
      .send({ status: 'paused' });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it('prevents deletion of schedules owned by other curators', async () => {
    const response = await request(app)
      .delete(`/api/v1/playlist-actions/schedules/${scheduleTwo.id}`)
      .set(authHeaders(sessionOne));

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    const db = getDatabase();
    const existing = db
      .prepare('SELECT COUNT(*) AS count FROM playlist_import_schedules WHERE id = ?')
      .get(scheduleTwo.id);
    expect(existing.count).toBe(1);
  });

  it('prevents running schedules belonging to other curators', async () => {
    const response = await request(app)
      .post(`/api/v1/playlist-actions/schedules/${scheduleTwo.id}/run-now`)
      .set(authHeaders(sessionOne));

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it('allows admins to manage schedules across curators', async () => {
    const list = await request(app)
      .get('/api/v1/playlist-actions/schedules')
      .set(authHeaders(adminSession));

    expect(list.status).toBe(200);
    const items = Array.isArray(list.body?.data) ? list.body.data : [];
    expect(items.length).toBe(2);

    const update = await request(app)
      .put(`/api/v1/playlist-actions/schedules/${scheduleTwo.id}`)
      .set(authHeaders(adminSession))
      .send({ status: 'paused' });

    expect(update.status).toBe(200);
    expect(update.body?.data?.status).toBe('paused');
  });
});
