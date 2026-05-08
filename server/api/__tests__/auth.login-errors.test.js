/**
 * Auth Login Error Tests - Good Faith Failures
 *
 * Tests covering real-world user mistakes like typos in email addresses
 * and passwords, along with account locking behavior after multiple failures.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../../tests/utils/testApp.js';
import { seedTestCurator, getUserFromDb } from '../../../tests/utils/seed.js';

const app = createTestApp();

describe('Auth Login - Good Faith Failures', () => {
  describe('Email typos and mistakes', () => {
    it('should reject login with typo in email domain', async () => {
      // Arrange
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!'
      });

      // Act - Common typo: missing 't' in 'test'
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'curator@tes.com', // typo
          password: curator.password
        });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
      expect(response.body.message).toMatch(/Username or password is incorrect/i);
      expect(response.body.type).toBe('invalid_credentials');
    });

    it('should reject login with typo in email username part', async () => {
      // Arrange
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!'
      });

      // Act - Typo in username
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'cuartor@test.com', // letters swapped
          password: curator.password
        });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.type).toBe('invalid_credentials');
    });

    it('should reject login with extra spaces in email', async () => {
      // Arrange
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!'
      });

      // Act - Extra leading/trailing spaces
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: ' curator@test.com ', // spaces
          password: curator.password
        });

      // Assert - Backend rejects with validation error for invalid email format
      expect(response.status).toBe(400);
      expect(response.body.type).toBe('validation_error');
    });

    it('should reject login with missing @ symbol', async () => {
      // Arrange
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!'
      });

      // Act
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'curatortest.com', // missing @
          password: curator.password
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.type).toBe('validation_error');
    });
  });

  describe('Password typos and mistakes', () => {
    it('should reject login with incorrect password (missing character)', async () => {
      // Arrange
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!'
      });

      // Act - Password with missing character
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: 'SecurePass123' // missing ! at end
        });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
      expect(response.body.type).toBe('invalid_credentials');
    });

    it('should reject login with wrong case sensitivity in password', async () => {
      // Arrange
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!'
      });

      // Act - Wrong case
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: 'securepass123!' // all lowercase
        });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.type).toBe('invalid_credentials');
    });

    it('should reject login with password having typo (swapped characters)', async () => {
      // Arrange
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!'
      });

      // Act - Characters swapped
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: 'SecuerPass123!' // 'cu' swapped to 'uc'
        });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.type).toBe('invalid_credentials');
    });

    it('should reject login with caps lock password', async () => {
      // Arrange
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!'
      });

      // Act - Caps lock on
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: 'sECUREpASS123!' // inverted case
        });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.type).toBe('invalid_credentials');
    });
  });

  describe('Failed login attempts tracking', () => {
    it('should increment failed login attempts on wrong password', async () => {
      // Arrange
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!'
      });

      // Act - First failed attempt
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: 'WrongPassword123!'
        });

      // Assert - Check failed attempts in database
      const updatedUser = getUserFromDb(curator.userId);
      expect(updatedUser.failed_login_attempts).toBe(1);
    });

    it('should reset failed login attempts on successful login', async () => {
      // Arrange - User with 3 failed attempts
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!',
        failedLoginAttempts: 3
      });

      // Act - Successful login
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify failed attempts were reset
      const updatedUser = getUserFromDb(curator.userId);
      expect(updatedUser.failed_login_attempts).toBe(0);
    });

    it('should accumulate failed attempts across multiple login tries', async () => {
      // Arrange
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!'
      });

      // Act - 3 failed attempts with different typos
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: 'SecurePass123' // missing !
        });

      await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: 'SecurePass12!' // wrong number
        });

      await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: 'securepass123!' // wrong case
        });

      // Assert
      const updatedUser = getUserFromDb(curator.userId);
      expect(updatedUser.failed_login_attempts).toBe(3);
    });
  });

  describe('Account locking after failed attempts', () => {
    it('should lock account after 5 failed login attempts', async () => {
      // Arrange
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!'
      });

      // Act - 5 failed attempts
      for (let i = 0; i < 5; i++) {
        const failResponse = await request(app)
          .post('/api/v1/auth/login')
          .send({
            username: curator.email,
            password: 'WrongPassword123!'
          });

        // Verify each failure is recorded
        expect(failResponse.status).toBe(401);
      }

      // Verify account has 5 failed attempts in database
      const userAfterFails = getUserFromDb(curator.userId);
      expect(userAfterFails.failed_login_attempts).toBe(5);
      expect(userAfterFails.locked_until).not.toBeNull();

      // Try to login with correct password (should be locked)
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      // Assert - After 5 failed attempts, account should be locked
      expect(response.status).toBe(423);
      expect(response.body.error).toBe('Account locked');
      expect(response.body.type).toBe('account_locked');
      expect(response.body.minutesRemaining).toBeGreaterThan(0);
      expect(response.body.lockedUntil).toBeDefined();
    });

    it('should display time remaining when attempting to login to locked account', async () => {
      // Arrange - Locked account
      const futureTime = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!',
        failedLoginAttempts: 5,
        lockedUntil: futureTime
      });

      // Act
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      // Assert
      expect(response.status).toBe(423);
      expect(response.body.error).toBe('Account locked');
      expect(response.body.minutesRemaining).toBeGreaterThan(0);
      expect(response.body.minutesRemaining).toBeLessThanOrEqual(15);
    });

    it('should prevent login even with correct password when account is locked', async () => {
      // Arrange
      const futureTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!',
        failedLoginAttempts: 5,
        lockedUntil: futureTime
      });

      // Act - Correct password
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password // correct!
        });

      // Assert - Still locked
      expect(response.status).toBe(423);
      expect(response.body.type).toBe('account_locked');
    });
  });

  describe('Inactive account handling', () => {
    it('should reject login for inactive account', async () => {
      // Arrange
      const curator = await seedTestCurator({
        email: 'inactive@test.com',
        password: 'SecurePass123!',
        isActive: false
      });

      // Act
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: curator.password
        });

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Account disabled');
      expect(response.body.type).toBe('account_disabled');
    });
  });

  describe('Validation errors', () => {
    it('should reject login with missing username', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          password: 'SecurePass123!'
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.type).toBe('validation_error');
      expect(response.body.message).toMatch(/username/i);
    });

    it('should reject login with missing password', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'curator@test.com'
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.type).toBe('validation_error');
      expect(response.body.message).toMatch(/password/i);
    });

    it('should reject login with empty username string', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: '',
          password: 'SecurePass123!'
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.type).toBe('validation_error');
    });
  });

  describe('Timing attack protection', () => {
    it('should take consistent time for invalid user vs invalid password', async () => {
      // Arrange
      const curator = await seedTestCurator({
        email: 'curator@test.com',
        password: 'SecurePass123!'
      });

      // Act - Invalid user
      const start1 = Date.now();
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'nonexistent@test.com',
          password: 'SecurePass123!'
        });
      const time1 = Date.now() - start1;

      // Act - Invalid password
      const start2 = Date.now();
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: curator.email,
          password: 'WrongPassword123!'
        });
      const time2 = Date.now() - start2;

      // Assert - Times should be similar (both should have minimum delay of 200ms)
      expect(time1).toBeGreaterThan(190); // Minimum delay
      expect(time2).toBeGreaterThan(190);
      expect(Math.abs(time1 - time2)).toBeLessThan(100); // Within 100ms of each other
    });
  });
});
