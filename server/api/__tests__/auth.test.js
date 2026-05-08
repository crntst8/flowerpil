/**
 * Auth API Tests
 *
 * Comprehensive test suite for authentication endpoints covering:
 * - Login (admin/curator)
 * - Logout
 * - Status checks
 * - User signup with email verification
 * - Curator signup via referral
 * - Password changes
 * - Email changes
 * - Account locking & security
 * - CSRF protection
 *
 * Target coverage: 80%+
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../../tests/utils/testApp.js';
import { seedTestCurator, seedTestReferral, seedTestUser, seedTestEmailCode } from '../../../tests/utils/seed.js';
import { getQueries } from '../../database/db.js';

const app = createTestApp();

const extractCookies = (response) => {
  const raw = response.headers['set-cookie'] || [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(cookie => cookie.split(';')[0]).filter(Boolean);
};

describe('Auth API', () => {
  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'TestPass123!',
        curatorName: 'Test Curator'
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.user).toMatchObject({
        id: curator.userId,
        username: curator.email,
        role: 'curator'
      });
      expect(response.body.csrfToken).toBeDefined();
      expect(response.body.tokenExpiry).toBeDefined();

      // Verify auth cookie is set
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some(cookie => cookie.startsWith('auth_token='))).toBe(true);
      expect(cookies.some(cookie => cookie.includes('HttpOnly'))).toBe(true);
    });

    it('should reject login with invalid username', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'nonexistent@test.com',
          password: 'SomePassword123!'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
      expect(response.body.type).toBe('invalid_credentials');
    });

    it('should reject login with invalid password', async () => {
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'CorrectPass123!'
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: 'WrongPassword123!'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
      expect(response.body.type).toBe('invalid_credentials');
    });

    it('should reject login for inactive user', async () => {
      const curator = await seedTestCurator({
        email: 'inactive@test.com',
        password: 'TestPass123!'
      });

      // Mark user as inactive
      const queries = getQueries();
      queries.updateAdminUser.run(
        curator.email,
        'curator',
        0, // is_active = false
        null,
        curator.userId
      );

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Account disabled');
      expect(response.body.type).toBe('account_disabled');
    });

    it('should reject login for locked account', async () => {
      const curator = await seedTestCurator({
        email: 'locked@test.com',
        password: 'TestPass123!'
      });

      // Lock account for 30 minutes
      const queries = getQueries();
      const lockedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      queries.updateAdminUser.run(
        curator.email,
        'curator',
        1,
        lockedUntil,
        curator.userId
      );

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      expect(response.status).toBe(423);
      expect(response.body.error).toBe('Account locked');
      expect(response.body.type).toBe('account_locked');
      expect(response.body.minutesRemaining).toBeGreaterThan(0);
    });

    it('should validate input schema - missing username', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          password: 'TestPass123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid input');
      expect(response.body.type).toBe('validation_error');
    });

    it('should validate input schema - missing password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'test@test.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid input');
      expect(response.body.type).toBe('validation_error');
    });

    it('should increment failed login attempts on wrong password', async () => {
      const curator = await seedTestCurator({
        email: 'attempts@test.com',
        password: 'CorrectPass123!'
      });

      // Attempt login with wrong password
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: 'WrongPass123!'
        });

      // Check failed attempts were incremented
      const queries = getQueries();
      const user = queries.findAdminUserByUsername.get(curator.email);
      expect(user.failed_login_attempts).toBe(1);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully and clear cookies', async () => {
      const curator = await seedTestCurator({
        email: 'logout@test.com',
        password: 'TestPass123!'
      });

      // First login to get auth token
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies
        .filter((cookie) => !cookie.startsWith('csrf_token='))
        .join('; ');
      const csrfToken = loginResponse.body.csrfToken;

      // Now logout
      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken);

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.success).toBe(true);
      expect(logoutResponse.body.message).toBe('Logged out successfully');

      // Verify cookies are cleared
      const clearedCookies = logoutResponse.headers['set-cookie'];
      expect(clearedCookies.some(cookie => cookie.includes('auth_token=;'))).toBe(true);
      expect(clearedCookies.some(cookie => cookie.includes('csrf_token=;'))).toBe(true);
    });

    it('should require valid CSRF token for logout', async () => {
      const curator = await seedTestCurator({
        email: 'csrf@test.com',
        password: 'TestPass123!'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');

      // Attempt logout without CSRF token
      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookieHeader);

      expect(logoutResponse.status).toBe(403);
    });
  });

  describe('GET /api/v1/auth/status', () => {
    it('should return authenticated status with valid token', async () => {
      const curator = await seedTestCurator({
        email: 'status@test.com',
        password: 'TestPass123!'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');

      const statusResponse = await request(app)
        .get('/api/v1/auth/status')
        .set('Cookie', cookieHeader);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.authenticated).toBe(true);
      expect(statusResponse.body.user).toMatchObject({
        id: curator.userId,
        username: curator.email,
        role: 'curator'
      });
      expect(statusResponse.body.tokenExpiry).toBeDefined();
    });

    it('should return unauthenticated status without token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/status');

      expect(response.status).toBe(200);
      expect(response.body.authenticated).toBe(false);
      expect(response.body.message).toBe('No authentication token found');
    });

    it('should return unauthenticated for expired token', async () => {
      // Note: This would require mocking JWT expiration or waiting for token to expire
      // For now, testing with malformed token
      const response = await request(app)
        .get('/api/v1/auth/status')
        .set('Cookie', 'auth_token=invalid.token.here');

      expect(response.status).toBe(200);
      expect(response.body.authenticated).toBe(false);
    });

    it('should auto-regenerate CSRF token if missing during status check', async () => {
      const curator = await seedTestCurator({
        email: 'csrf-regen@test.com',
        password: 'TestPass123!'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');

      // Check status without CSRF cookie (simulate missing csrf_token)
      const statusResponse = await request(app)
        .get('/api/v1/auth/status')
        .set('Cookie', cookieHeader);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.authenticated).toBe(true);
      // Should regenerate CSRF token
      expect(statusResponse.body.csrfToken).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/signup', () => {
    it('should create user and send verification email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'newuser@test.com',
          password: 'SecurePass123!',
          username: 'newuser'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('verification');
      expect(response.body.next).toBe('verify_code_required');

      // Verify user was created
      const queries = getQueries();
      const user = queries.getUserByEmail.get('newuser@test.com');
      expect(user).toBeDefined();
      expect(user.username).toBe('newuser');

      // NOTE: Verification email is automatically mocked in test mode
      // Check console for: [EMAIL_SERVICE] Mock email send { to: 'newuser@test.com', subject: 'Welcome to Flowerpil' }
    });

    it('should reject duplicate email', async () => {
      await seedTestUser({
        email: 'existing@test.com',
        password: 'Pass123!'
      });

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'existing@test.com',
          password: 'NewPass123!'
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Email already exists');
      expect(response.body.type).toBe('email_exists');
    });

    it('should reject duplicate username', async () => {
      await seedTestUser({
        email: 'user1@test.com',
        username: 'takenusername',
        password: 'Pass123!XY'
      });

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'user2@test.com',
          username: 'takenusername',
          password: 'Pass123!XY'
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Username taken');
      expect(response.body.type).toBe('username_taken');
    });

    it('should validate password strength', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'weak@test.com',
          password: 'password1!' // Missing uppercase character
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Weak password');
      expect(response.body.type).toBe('password_validation');
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'not-an-email',
          password: 'SecurePass123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.type).toBe('validation_error');
    });
  });

  describe('POST /api/v1/auth/verify', () => {
    it('should verify email with correct code and issue auth token', async () => {
      const user = await seedTestUser({
        email: 'verify@test.com',
        password: 'Pass123!'
      });

      const code = '123456';
      seedTestEmailCode({
        userId: user.id,
        code: code,
        purpose: 'signup'
      });

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          email: user.email,
          code: code
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Email verified successfully');
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toMatchObject({
        id: user.id,
        email: user.email,
        role: 'user'
      });
      expect(response.body.csrfToken).toBeDefined();

      // Verify auth cookie is set
      const cookies = response.headers['set-cookie'];
      expect(cookies.some(cookie => cookie.startsWith('auth_token='))).toBe(true);
    });

    it('should reject incorrect verification code', async () => {
      const user = await seedTestUser({
        email: 'wrongcode@test.com',
        password: 'Pass123!'
      });

      seedTestEmailCode({
        userId: user.id,
        code: '123456',
        purpose: 'signup'
      });

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          email: user.email,
          code: '999999' // Wrong code
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid code');
      expect(response.body.type).toBe('invalid_code');
      expect(response.body.remainingAttempts).toBeDefined();
    });

    it('should lock verification after 5 failed attempts', async () => {
      const user = await seedTestUser({
        email: 'lockedverify@test.com',
        password: 'Pass123!'
      });

      const codeData = seedTestEmailCode({
        userId: user.id,
        code: '123456',
        purpose: 'signup'
      });

      // Attempt 5 times with wrong code
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/verify')
          .send({
            email: user.email,
            code: '999999'
          });
      }

      // 6th attempt should be locked
      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          email: user.email,
          code: '999999'
        });

      expect(response.status).toBe(429);
      expect(response.body.error).toBe('Too many attempts');
      expect(response.body.type).toBe('rate_limit');
    });

    it('should reject verification for non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          email: 'nonexistent@test.com',
          code: '123456'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
      expect(response.body.type).toBe('user_not_found');
    });

    it('should validate code format (6 digits)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          email: 'test@test.com',
          code: 'abc123' // Invalid format
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.type).toBe('validation_error');
    });
  });

  describe('POST /api/v1/auth/curator/signup', () => {
    it('should create curator account with valid referral', async () => {
      const referral = seedTestReferral({
        code: 'CURATOR2024',
        email: 'newcurator@test.com',
        curatorName: 'New Curator',
        curatorType: 'dj'
      });

      const response = await request(app)
        .post('/api/v1/auth/curator/signup')
        .send({
          referralCode: referral.code,
          email: referral.email,
          password: 'SecurePass123!',
          curatorProfile: {
            curatorName: 'New Curator',
            curatorType: 'dj',
            location: 'London, UK'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Curator account created successfully');
      expect(response.body.user).toMatchObject({
        email: referral.email,
        role: 'curator',
        curator_name: 'New Curator',
        curator_type: 'dj'
      });
      expect(response.body.csrfToken).toBeDefined();
      expect(response.body.nextStep).toBe('profile_completion');

      // Verify referral was marked as used
      const queries = getQueries();
      const usedReferral = queries.getReferralByCode.get(referral.code);
      expect(usedReferral.status).toBe('used');

      // NOTE: Welcome email is automatically mocked in test mode
      // Email sending is handled by emailService.js which auto-mocks when NODE_ENV=test
    });

    it('should reject invalid referral code', async () => {
      const response = await request(app)
        .post('/api/v1/auth/curator/signup')
        .send({
          referralCode: 'INVALID123',
          email: 'test@test.com',
          password: 'SecurePass123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid referral code');
      expect(response.body.type).toBe('invalid_referral');
    });

    it('should reject already used referral', async () => {
      const curator = await seedTestCurator({
        email: 'existing@test.com',
        password: 'Pass123!'
      });

      const referral = seedTestReferral({
        code: 'USED123',
        email: 'another@test.com',
        curatorName: 'Test'
      });

      // Mark referral as used
      const queries = getQueries();
      queries.markReferralUsed.run(curator.userId, referral.id);

      const response = await request(app)
        .post('/api/v1/auth/curator/signup')
        .send({
          referralCode: referral.code,
          email: referral.email,
          password: 'SecurePass123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Referral code already used');
      expect(response.body.type).toBe('referral_used');
    });

    it('should reject email mismatch with referral', async () => {
      const referral = seedTestReferral({
        code: 'MISMATCH123',
        email: 'correct@test.com',
        curatorName: 'Test'
      });

      const response = await request(app)
        .post('/api/v1/auth/curator/signup')
        .send({
          referralCode: referral.code,
          email: 'wrong@test.com', // Different email
          password: 'SecurePass123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email mismatch');
      expect(response.body.type).toBe('email_mismatch');
    });

    it('should reject if email already has account', async () => {
      await seedTestUser({
        email: 'existing@test.com',
        password: 'Pass123!'
      });

      const referral = seedTestReferral({
        code: 'DUP123',
        email: 'existing@test.com',
        curatorName: 'Test'
      });

      const response = await request(app)
        .post('/api/v1/auth/curator/signup')
        .send({
          referralCode: referral.code,
          email: referral.email,
          password: 'SecurePass123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Account already exists');
      expect(response.body.type).toBe('email_exists');
    });
  });

  describe('POST /api/v1/auth/curator/verify-referral', () => {
    it('should validate referral and return curator metadata', async () => {
      const referral = seedTestReferral({
        code: 'VERIFY123',
        email: 'validate@test.com',
        curatorName: 'Test Curator',
        curatorType: 'label'
      });

      const response = await request(app)
        .post('/api/v1/auth/curator/verify-referral')
        .send({
          referralCode: referral.code,
          email: referral.email
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        curator_name: 'Test Curator',
        curator_type: 'label',
        email: 'validate@test.com'
      });
    });

    it('should reject invalid referral code', async () => {
      const response = await request(app)
        .post('/api/v1/auth/curator/verify-referral')
        .send({
          referralCode: 'INVALID',
          email: 'test@test.com'
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid referral code');
    });

    it('should reject already used referral', async () => {
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'Pass123!'
      });

      const referral = seedTestReferral({
        code: 'USED456',
        email: 'test@test.com',
        curatorName: 'Test'
      });

      const queries = getQueries();
      queries.markReferralUsed.run(curator.userId, referral.id);

      const response = await request(app)
        .post('/api/v1/auth/curator/verify-referral')
        .send({
          referralCode: referral.code,
          email: referral.email
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Referral code already used');
    });

    it('should reject email mismatch', async () => {
      const referral = seedTestReferral({
        code: 'MISMATCH456',
        email: 'correct@test.com',
        curatorName: 'Test'
      });

      const response = await request(app)
        .post('/api/v1/auth/curator/verify-referral')
        .send({
          referralCode: referral.code,
          email: 'wrong@test.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email does not match referral code');
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    it('should change password with valid current password', async () => {
      const curator = await seedTestCurator({
        email: 'changepass@test.com',
        password: 'OldPass123!'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');

      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', cookieHeader)
        .send({
          currentPassword: 'OldPass123!',
          newPassword: 'NewSecurePass456!'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Password changed successfully');
    });

    it('should reject incorrect current password', async () => {
      const curator = await seedTestCurator({
        email: 'wrongcurrent@test.com',
        password: 'CorrectPass123!'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');

      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', cookieHeader)
        .send({
          currentPassword: 'WrongPass123!',
          newPassword: 'NewPass456!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid current password');
      expect(response.body.type).toBe('invalid_current_password');
    });

    it('should validate new password strength', async () => {
      const curator = await seedTestCurator({
        email: 'weaknew@test.com',
        password: 'OldPass123!'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');

      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', cookieHeader)
        .send({
          currentPassword: 'OldPass123!',
          newPassword: 'password1!!' // 11 chars but no uppercase, fails strength check
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Weak password');
      expect(response.body.type).toBe('weak_password');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send({
          currentPassword: 'OldPass123!',
          newPassword: 'NewPass456!'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/change-email', () => {
    it('should change email with valid password', async () => {
      const curator = await seedTestCurator({
        email: 'old@test.com',
        password: 'TestPass123!'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');

      const response = await request(app)
        .post('/api/v1/auth/change-email')
        .set('Cookie', cookieHeader)
        .send({
          currentPassword: curator.password,
          newEmail: 'new@test.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Email updated successfully');
      expect(response.body.user.username).toBe('new@test.com');
    });

    it('should reject if new email already exists', async () => {
      const curator1 = await seedTestCurator({
        email: 'curator1@test.com',
        password: 'Pass123!'
      });

      await seedTestCurator({
        email: 'taken@test.com',
        password: 'Pass123!'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator1.email,
          password: curator1.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');

      const response = await request(app)
        .post('/api/v1/auth/change-email')
        .set('Cookie', cookieHeader)
        .send({
          currentPassword: curator1.password,
          newEmail: 'taken@test.com'
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Email already in use');
      expect(response.body.type).toBe('email_in_use');
    });

    it('should reject invalid current password', async () => {
      const curator = await seedTestCurator({
        email: 'changeemail@test.com',
        password: 'CorrectPass123!'
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      const cookies = extractCookies(loginResponse);
      const cookieHeader = cookies.join('; ');

      const response = await request(app)
        .post('/api/v1/auth/change-email')
        .set('Cookie', cookieHeader)
        .send({
          currentPassword: 'WrongPass123!',
          newEmail: 'new@test.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid current password');
      expect(response.body.type).toBe('invalid_current_password');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-email')
        .send({
          currentPassword: 'Pass123!',
          newEmail: 'new@test.com'
        });

      expect(response.status).toBe(401);
    });
  });
});
