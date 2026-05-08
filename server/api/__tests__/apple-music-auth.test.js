import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../../tests/utils/testApp.js';
import { seedTestCurator } from '../../../tests/utils/seed.js';
import { getDatabase } from '../../database/db.js';
import appleMusicApiService from '../../services/appleMusicApiService.js';

const app = createTestApp();
const db = getDatabase();

const extractCookieHeader = (response) => {
  const rawCookies = response.headers['set-cookie'] || [];
  const cookies = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
};

const loginAsCurator = async () => {
  const curator = await seedTestCurator({
    email: `apple-auth-${Date.now()}@test.com`,
    password: 'Pass123!',
    curatorName: 'Apple Test Curator'
  });

  const loginResponse = await request(app)
    .post('/api/v1/auth/login')
    .send({
      username: curator.email,
      password: curator.password
    });

  return {
    curator,
    cookieHeader: extractCookieHeader(loginResponse),
    csrfToken: loginResponse.body.csrfToken
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  db.prepare('DELETE FROM export_oauth_tokens').run();
});

describe('Apple Music authentication', () => {
  it('stores curator Music User Tokens in export_oauth_tokens', async () => {
    const session = await loginAsCurator();
    vi.spyOn(appleMusicApiService, 'getUserStorefront').mockResolvedValue('gb');

    const res = await request(app)
      .post('/api/v1/apple/auth/token')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', session.csrfToken)
      .send({ musicUserToken: 'mut-curator-test' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.storefront).toBe('gb');

    const row = db.prepare(`
      SELECT * FROM export_oauth_tokens
      WHERE platform = ? AND account_type = ? AND owner_curator_id = ?
    `).get('apple', 'curator', session.curator.curatorId);

    expect(row).toBeTruthy();
    expect(row.access_token).toBe('mut-curator-test');
    expect(row.account_label).toBe(`curator-${session.curator.curatorId}-primary`);
    const parsedInfo = JSON.parse(row.user_info);
    expect(parsedInfo.storefront).toBe('gb');
  });

  it('requires a stored token before listing Apple library playlists', async () => {
    const session = await loginAsCurator();

    const unauthorized = await request(app)
      .get('/api/v1/apple/import/playlists')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', session.csrfToken);

    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.code).toBe('AUTH_REQUIRED');

    db.prepare(`
      INSERT INTO export_oauth_tokens
        (platform, access_token, account_type, account_label, owner_curator_id, user_info, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      'apple',
      'mut-existing-token',
      'curator',
      `curator-${session.curator.curatorId}-primary`,
      session.curator.curatorId,
      JSON.stringify({ storefront: 'us' })
    );

    const apiSpy = vi.spyOn(appleMusicApiService, 'apiRequest').mockResolvedValue({ data: [] });

    const res = await request(app)
      .get('/api/v1/apple/import/playlists')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', session.csrfToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(apiSpy).toHaveBeenCalledTimes(1);
    expect(apiSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        musicUserToken: 'mut-existing-token'
      })
    );
  });
});
