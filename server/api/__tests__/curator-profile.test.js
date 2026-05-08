import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../../tests/utils/testApp.js';
import { seedTestCurator } from '../../../tests/utils/seed.js';

const app = createTestApp();

const extractCookieHeader = (response) => {
  const rawCookies = response.headers['set-cookie'] || [];
  const cookies = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
  return cookies.map(cookie => cookie.split(';')[0]).join('; ');
};

const loginAsCurator = async () => {
  const curator = await seedTestCurator({
    email: `curator-profile-${Date.now()}@test.com`,
    password: 'Pass123!',
    curatorName: 'Profile Test Curator'
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

describe('Curator Profile Updates', () => {
  it('updates profile fields and reports changed field names', async () => {
    const session = await loginAsCurator();

    const payload = {
      bio: 'Testing curator profile save flow',
      website_url: 'https://flowerpil.example',
      social_links: [{ platform: 'instagram', url: 'https://instagram.com/flowerpiltest' }]
    };

    const res = await request(app)
      .put('/api/v1/curator/profile')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', session.csrfToken)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.updatedFields).toEqual(
      expect.arrayContaining(['bio', 'website_url', 'social_links'])
    );
    expect(res.body.changesApplied).toBe(true);
    expect(res.body.curator.bio).toBe(payload.bio);
    expect(res.body.curator.website_url).toBe(payload.website_url);
    const storedSocials = JSON.parse(res.body.curator.social_links);
    expect(storedSocials).toEqual(payload.social_links);
  });

  it('allows clearing optional contact data with null or empty values', async () => {
    const session = await loginAsCurator();

    // First set values so we can verify they are cleared
    await request(app)
      .put('/api/v1/curator/profile')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', session.csrfToken)
      .send({
        contact_email: 'curator-clear@test.com',
        website_url: 'https://flowerpil.io'
      });

    const clearRes = await request(app)
      .put('/api/v1/curator/profile')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', session.csrfToken)
      .send({
        contact_email: '',
        website_url: null
      });

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.success).toBe(true);
    expect(clearRes.body.updatedFields).toEqual(
      expect.arrayContaining(['contact_email', 'website_url'])
    );
    expect(clearRes.body.curator.contact_email).toBeNull();
    expect(clearRes.body.curator.website_url).toBeNull();
  });

  it('returns success with no changes when payload is empty', async () => {
    const session = await loginAsCurator();

    const res = await request(app)
      .put('/api/v1/curator/profile')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', session.csrfToken)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.changesApplied).toBe(false);
    expect(res.body.updatedFields).toEqual([]);
    expect(res.body.message).toMatch(/No changes/i);
  });
});
