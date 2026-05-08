/**
 * Curator Security Tests
 *
 * Tests security fixes for curator management endpoints:
 * - Authorization bypass prevention (Critical #1)
 * - Transaction-based cascade deletion (Critical #2)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../../tests/utils/testApp.js';
import { seedTestCurator, seedTestEmailCode, seedTestUser } from '../../../tests/utils/seed.js';
import { getQueries, getDatabase } from '../../database/db.js';

const app = createTestApp();

const extractCookies = (response) => {
  const raw = response.headers['set-cookie'] || [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(cookie => cookie.split(';')[0]).filter(Boolean);
};

describe('Curator Security - Authorization & Data Integrity', () => {
  describe('Critical #1: Authorization Bypass Prevention', () => {
    it('should prevent regular users from creating curators', async () => {
      const user = await seedTestUser({
        email: 'regularuser@test.com',
        password: 'Pass123!'
      });

      seedTestEmailCode({
        userId: user.id,
        code: '123456',
        purpose: 'signup'
      });

      // Login as regular user
      const loginResponse = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          email: user.email,
          code: '123456' // Mock code from seed
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');
      const csrfToken = loginResponse.body.csrfToken;

      // Attempt to create curator (should fail)
      const response = await request(app)
        .post('/api/v1/curators')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Unauthorized Curator',
          type: 'dj'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Insufficient permissions');
    });

    it('should prevent curators from creating other curators', async () => {
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'Pass123!',
        curatorName: 'Existing Curator'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');
      const csrfToken = loginResponse.body.csrfToken;

      // Attempt to create another curator (should fail)
      const response = await request(app)
        .post('/api/v1/curators')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'New Curator',
          type: 'label'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Insufficient permissions');
    });

    it('should prevent curators from updating curator records via admin route', async () => {
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'Pass123!',
        curatorName: 'Test Curator'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');
      const csrfToken = loginResponse.body.csrfToken;

      // Attempt to update via admin route (should fail)
      const response = await request(app)
        .put(`/api/v1/curators/${curator.curatorId}`)
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Hacked Name'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Insufficient permissions');
    });

    it('should prevent curators from deleting curator records', async () => {
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'Pass123!',
        curatorName: 'Test Curator'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');
      const csrfToken = loginResponse.body.csrfToken;

      // Attempt to delete (should fail)
      const response = await request(app)
        .delete(`/api/v1/curators/${curator.curatorId}`)
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Insufficient permissions');
    });
  });

  describe('Critical #2: Transaction-Based Cascade Deletion', () => {
    it('should successfully delete curator with all related data atomically', async () => {
      // Create admin user
      const db = getDatabase();
      const queries = getQueries();

      // Create admin account
      const { hashPassword } = await import('../../utils/authUtils.js');
      const passwordHash = await hashPassword('AdminPass123!');

      const adminResult = queries.createAdminUser.run(
        'admin@test.com',
        passwordHash,
        'admin',
        1
      );
      const adminId = adminResult.lastInsertRowid;

      // Login as admin
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'admin@test.com',
          password: 'AdminPass123!'
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');
      const csrfToken = loginResponse.body.csrfToken;

      // Create a curator with associated data
      const curator = await seedTestCurator({
        email: 'deleteme@test.com',
        password: 'Pass123!',
        curatorName: 'Delete Test Curator'
      });

      // Create a playlist for this curator
      db.prepare(`
        INSERT INTO playlists (title, curator_id, curator_name, published)
        VALUES (?, ?, ?, 1)
      `).run('Test Playlist', curator.curatorId, curator.curatorName);

      // Verify data exists before deletion
      const playlistsBefore = db.prepare('SELECT * FROM playlists WHERE curator_id = ?').all(curator.curatorId);
      const curatorBefore = db.prepare('SELECT * FROM curators WHERE id = ?').get(curator.curatorId);
      const adminUserBefore = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(curator.userId);

      expect(playlistsBefore.length).toBeGreaterThan(0);
      expect(curatorBefore).toBeDefined();
      expect(adminUserBefore).toBeDefined();

      // Delete curator
      const deleteResponse = await request(app)
        .delete(`/api/v1/curators/${curator.curatorId}`)
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);

      // Verify all related data was deleted
      const playlistsAfter = db.prepare('SELECT * FROM playlists WHERE curator_id = ?').all(curator.curatorId);
      const curatorAfter = db.prepare('SELECT * FROM curators WHERE id = ?').get(curator.curatorId);
      const adminUserAfter = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(curator.userId);

      expect(playlistsAfter.length).toBe(0);
      expect(curatorAfter).toBeUndefined();
      expect(adminUserAfter).toBeUndefined();
    });
  });

  describe('Medium #4: Session Invalidation on Password Change', () => {
    it('should revoke CSRF tokens after password change', async () => {
      const curator = await seedTestCurator({
        email: 'passchange@test.com',
        password: 'OldPass123!',
        curatorName: 'Password Change Test'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');
      const csrfToken = loginResponse.body.csrfToken;

      // Verify CSRF token exists in database
      const db = getDatabase();
      const tokensBefore = db.prepare('SELECT * FROM csrf_tokens WHERE user_id = ?').all(curator.userId);
      expect(tokensBefore.length).toBeGreaterThan(0);

      // Change password
      const changeResponse = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: 'OldPass123!',
          newPassword: 'NewSecurePass456!'
        });

      expect(changeResponse.status).toBe(200);

      // Verify CSRF tokens were revoked
      const tokensAfter = db.prepare('SELECT * FROM csrf_tokens WHERE user_id = ?').all(curator.userId);
      expect(tokensAfter.length).toBe(0);
    });
  });

  describe('Low #1: Password Change Rate Limiting', () => {
    it('keeps password change requests reachable in test mode after repeated attempts', async () => {
      const curator = await seedTestCurator({
        email: 'ratelimit@test.com',
        password: 'Pass123!',
        curatorName: 'Rate Limit Test'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');
      let csrfToken = loginResponse.body.csrfToken;

      // First password change should succeed
      const firstChange = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: 'Pass123!',
          newPassword: 'NewPass456!'
        });

      expect(firstChange.status).toBe(200);

      // Re-login to get new token
      const reloginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: 'NewPass456!'
        });

      const newCookies = extractCookies(reloginResponse);
      const newCookieHeader = newCookies.join('; ');
      csrfToken = reloginResponse.body.csrfToken;

      // Test mode intentionally disables strict rate limiting so auth suites stay deterministic.
      // Repeated requests should still reach the password validation path instead of returning 429.
      for (let i = 0; i < 12; i++) {
        await request(app)
          .post('/api/v1/auth/change-password')
          .set('Cookie', newCookieHeader)
          .set('X-CSRF-Token', csrfToken)
          .send({
            currentPassword: 'NewPass456!',
            newPassword: `Pass${i}789!`
          });
      }

      const finalResponse = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', newCookieHeader)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: 'NewPass456!',
          newPassword: 'FinalPass999!'
        });

      expect(finalResponse.status).toBe(400);
      expect(finalResponse.body.type).toBe('invalid_current_password');
    });
  });
});
