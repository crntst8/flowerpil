/**
 * Security Fixes Verification Tests
 *
 * Simple tests to verify the critical security fixes are in place:
 * 1. Authorization checks exist on curator admin routes
 * 2. Password change revokes CSRF tokens
 * 3. Password reset revokes CSRF tokens
 * 4. Password change rate limiter is active
 */

import { describe, it, expect } from 'vitest';
import { getDatabase } from '../../database/db.js';
import fs from 'fs';
import path from 'path';

describe('Security Fixes Verification', () => {
  describe('Critical #1: Authorization Bypass Prevention', () => {
    it('should have requireAnyRole middleware on POST /api/v1/curators', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Check POST route has authMiddleware, validateCSRFToken, and requireAnyRole(['admin'])
      const postRoute = curatorsFile.match(/router\.post\(['"]\/['"],\s*authMiddleware,\s*validateCSRFToken,\s*requireAnyRole\(\['admin'\]\)/);
      expect(postRoute).toBeTruthy();
    });

    it('should have requireAnyRole middleware on PUT /api/v1/curators/:id', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Check PUT route has authMiddleware, validateCSRFToken, and requireAnyRole(['admin'])
      const putRoute = curatorsFile.match(/router\.put\(['"]\/:id['"],\s*authMiddleware,\s*validateCSRFToken,\s*requireAnyRole\(\['admin'\]\)/);
      expect(putRoute).toBeTruthy();
    });

    it('should have requireAnyRole middleware on DELETE /api/v1/curators/:id', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Check DELETE route has authMiddleware, validateCSRFToken, and requireAnyRole(['admin'])
      const deleteRoute = curatorsFile.match(/router\.delete\(['"]\/:id['"],\s*authMiddleware,\s*validateCSRFToken,\s*requireAnyRole\(\['admin'\]\)/);
      expect(deleteRoute).toBeTruthy();
    });

    it('should import requireAnyRole from auth middleware', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Check import includes requireAnyRole
      const importStatement = curatorsFile.match(/import.*requireAnyRole.*from.*middleware\/auth/);
      expect(importStatement).toBeTruthy();
    });
  });

  describe('Critical #2: Transaction-Based Cascade Deletion', () => {
    it('should wrap deletion in BEGIN TRANSACTION', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Check for BEGIN TRANSACTION
      expect(curatorsFile).toContain("db.prepare('BEGIN TRANSACTION').run()");
    });

    it('should commit transaction on success', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Check for COMMIT
      expect(curatorsFile).toContain("db.prepare('COMMIT').run()");
    });

    it('should rollback transaction on error', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Check for ROLLBACK
      expect(curatorsFile).toContain("db.prepare('ROLLBACK').run()");
    });
  });

  describe('Medium #4: Session Invalidation on Password Change', () => {
    it('should call revokeCSRFTokenForUser in change-password endpoint', () => {
      const authFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/auth.js'),
        'utf-8'
      );

      // Find the change-password endpoint
      const changePasswordSection = authFile.substring(
        authFile.indexOf('POST /api/v1/auth/change-password'),
        authFile.indexOf('POST /api/v1/auth/change-email') || authFile.length
      );

      // Check it calls revokeCSRFTokenForUser
      expect(changePasswordSection).toContain('revokeCSRFTokenForUser');
    });

    it('should call revokeCSRFTokenForUser in password-reset endpoint', () => {
      const authFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/auth.js'),
        'utf-8'
      );

      // Find the password reset endpoint
      const resetSection = authFile.substring(
        authFile.indexOf('POST /api/v1/auth/password/reset '),
        authFile.indexOf('POST /api/v1/auth/change-password') || authFile.length
      );

      // Check it calls revokeCSRFTokenForUser
      expect(resetSection).toContain('revokeCSRFTokenForUser');
    });

    it('should import revokeCSRFTokenForUser', () => {
      const authFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/auth.js'),
        'utf-8'
      );

      // Check import includes revokeCSRFTokenForUser
      const importStatement = authFile.match(/import.*revokeCSRFTokenForUser.*from/);
      expect(importStatement).toBeTruthy();
    });
  });

  describe('Low #1: Password Change Rate Limiter', () => {
    it('should have passwordChangeLimiter uncommented and applied', () => {
      const authFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/auth.js'),
        'utf-8'
      );

      // Check it's not commented out
      expect(authFile).not.toContain('/* passwordChangeLimiter,');

      // Check it's imported
      expect(authFile).toContain('passwordChangeLimiter');

      // Find the change-password route and verify middleware is applied
      const changePasswordRoute = authFile.match(/router\.post\('\/change-password',\s*passwordChangeLimiter/);
      expect(changePasswordRoute).toBeTruthy();
    });

    it('should import passwordChangeLimiter from rateLimiting middleware', () => {
      const authFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/auth.js'),
        'utf-8'
      );

      // Check import statement
      const importStatement = authFile.match(/import.*passwordChangeLimiter.*from.*rateLimiting/);
      expect(importStatement).toBeTruthy();
    });
  });

  describe('NEW FIX #1: SQL Injection Prevention - Prepared Statements', () => {
    it('should have updateAdminUserPassword prepared statement in db.js', () => {
      const dbFile = fs.readFileSync(
        path.join(process.cwd(), 'server/database/db.js'),
        'utf-8'
      );

      // Check for updateAdminUserPassword prepared statement
      expect(dbFile).toContain('updateAdminUserPassword');
      expect(dbFile).toContain('UPDATE admin_users');
      expect(dbFile).toContain('SET password_hash = ?');
    });

    it('should have updateUserPassword prepared statement in db.js', () => {
      const dbFile = fs.readFileSync(
        path.join(process.cwd(), 'server/database/db.js'),
        'utf-8'
      );

      // Check for updateUserPassword prepared statement
      expect(dbFile).toContain('updateUserPassword');
      expect(dbFile).toContain('UPDATE users');
      expect(dbFile).toContain('SET password_hash = ?');
    });

    it('should NOT use inline db.prepare() for password updates in auth.js', () => {
      const authFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/auth.js'),
        'utf-8'
      );

      // Should NOT have inline password update queries after reset
      const inlinePasswordUpdates = authFile.match(/db\.prepare\([`'"].*UPDATE.*password_hash.*[`'"]\)\.run/);
      expect(inlinePasswordUpdates).toBeNull();
    });

    it('should use queries.updateAdminUserPassword in password reset', () => {
      const authFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/auth.js'),
        'utf-8'
      );

      // Should use prepared statement
      expect(authFile).toContain('queries.updateAdminUserPassword.run');
    });

    it('should use queries.updateUserPassword in password reset', () => {
      const authFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/auth.js'),
        'utf-8'
      );

      // Should use prepared statement
      expect(authFile).toContain('queries.updateUserPassword.run');
    });
  });

  describe('NEW FIX #2: Stricter Password Reset Rate Limiting', () => {
    it('should have passwordResetLimiter in rateLimiting.js', () => {
      const rateLimitFile = fs.readFileSync(
        path.join(process.cwd(), 'server/middleware/rateLimiting.js'),
        'utf-8'
      );

      // Check passwordResetLimiter exists
      expect(rateLimitFile).toContain('passwordResetLimiter');
    });

    it('should export passwordResetLimiter from rateLimiting.js', () => {
      const rateLimitFile = fs.readFileSync(
        path.join(process.cwd(), 'server/middleware/rateLimiting.js'),
        'utf-8'
      );

      // Check it's exported
      expect(rateLimitFile).toMatch(/export\s*{[^}]*passwordResetLimiter[^}]*}/);
    });

    it('should limit password reset to 3 requests per hour in production', () => {
      const rateLimitFile = fs.readFileSync(
        path.join(process.cwd(), 'server/middleware/rateLimiting.js'),
        'utf-8'
      );

      // Extract passwordResetLimiter configuration
      const limiterMatch = rateLimitFile.match(/passwordResetLimiter[\s\S]*?}\);/);
      expect(limiterMatch).toBeTruthy();

      const limiterConfig = limiterMatch[0];

      // Should have 1 hour window (60 * 60 * 1000)
      expect(limiterConfig).toMatch(/windowMs:.*60.*60.*1000/);

      // Should limit to 3 requests in production
      expect(limiterConfig).toMatch(/max:.*3/);
    });

    it('should apply passwordResetLimiter to password reset-request endpoint', () => {
      const authFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/auth.js'),
        'utf-8'
      );

      // Should use passwordResetLimiter instead of authRateLimit
      expect(authFile).toMatch(/router\.post\(['"]\/password\/reset-request['"],\s*passwordResetLimiter/);
    });

    it('should apply passwordResetLimiter to password reset endpoint', () => {
      const authFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/auth.js'),
        'utf-8'
      );

      // Should use passwordResetLimiter instead of authRateLimit
      expect(authFile).toMatch(/router\.post\(['"]\/password\/reset['"],\s*passwordResetLimiter/);
    });

    it('should import passwordResetLimiter in auth.js', () => {
      const authFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/auth.js'),
        'utf-8'
      );

      // Check import statement
      expect(authFile).toMatch(/import.*passwordResetLimiter.*from.*rateLimiting/);
    });
  });

  describe('NEW FIX #3: CSRF Protection on Curator Routes', () => {
    it('should import validateCSRFToken in curators.js', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Check import
      expect(curatorsFile).toMatch(/import.*validateCSRFToken.*from.*csrfProtection/);
    });

    it('should apply validateCSRFToken to POST /curators', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Should have validateCSRFToken middleware
      expect(curatorsFile).toMatch(/router\.post\(['"]\/['"],\s*authMiddleware,\s*validateCSRFToken/);
    });

    it('should apply validateCSRFToken to PUT /curators/:id', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Should have validateCSRFToken middleware
      expect(curatorsFile).toMatch(/router\.put\(['"]\/:id['"],\s*authMiddleware,\s*validateCSRFToken/);
    });

    it('should apply validateCSRFToken to DELETE /curators/:id', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Should have validateCSRFToken middleware
      expect(curatorsFile).toMatch(/router\.delete\(['"]\/:id['"],\s*authMiddleware,\s*validateCSRFToken/);
    });

    it('should apply validateCSRFToken to PUT /curators/:id/section-config', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Should have validateCSRFToken middleware
      expect(curatorsFile).toMatch(/router\.put\(['"]\/:id\/section-config['"],\s*authMiddleware,\s*validateCSRFToken/);
    });

    it('should apply validateCSRFToken to PUT /curators/:id/dsp-accounts', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Should have validateCSRFToken middleware
      expect(curatorsFile).toMatch(/router\.put\(['"]\/:id\/dsp-accounts['"],\s*authMiddleware,\s*validateCSRFToken/);
    });

    it('should apply validateCSRFToken to DELETE /curators/:id/dsp-accounts/:platform', () => {
      const curatorsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curators.js'),
        'utf-8'
      );

      // Should have validateCSRFToken middleware
      expect(curatorsFile).toMatch(/router\.delete\(['"]\/:id\/dsp-accounts\/:platform['"],\s*authMiddleware,\s*validateCSRFToken/);
    });

    it('should apply CSRF protection to curator/index.js state-changing routes', () => {
      const curatorIndexFile = fs.readFileSync(
        path.join(process.cwd(), 'server/api/curator/index.js'),
        'utf-8'
      );

      // Should import validateCSRFToken
      expect(curatorIndexFile).toMatch(/import.*validateCSRFToken.*from.*csrfProtection/);

      // Should apply it as router-level middleware for POST/PUT/PATCH/DELETE
      expect(curatorIndexFile).toContain('validateCSRFToken');
      expect(curatorIndexFile).toMatch(/POST.*PUT.*PATCH.*DELETE/);
    });
  });
});
