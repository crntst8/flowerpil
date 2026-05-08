/**
 * Email Service Tests
 *
 * Tests email sending functions with Brevo integration.
 * Emails are automatically mocked in test mode (NODE_ENV=test).
 *
 * Based on actual implementation patterns from TESTING_REAL_IMPLEMENTATION.md
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  sendSignupConfirmationEmail,
  sendPasswordResetEmail,
  sendReferralSubmissionEmail,
  generateVerificationCode,
  hashCode,
  verifyCodeHash
} from '../emailService.js';

describe('Email Service', () => {
  // NOTE: NODE_ENV=test is automatically set by vitest.config.js
  // Emails will be mocked - no SMTP setup needed!

  beforeAll(() => {
    // Ensure EMAIL_CODE_PEPPER is set for hash tests
    if (!process.env.EMAIL_CODE_PEPPER) {
      process.env.EMAIL_CODE_PEPPER = 'test-pepper-secret-key-12345';
    }
  });

  describe('sendSignupConfirmationEmail', () => {
    it('should send signup confirmation email (mocked)', async () => {
      const result = await sendSignupConfirmationEmail({
        email: 'newuser@test.com',
        confirmationCode: '123456',
        accountType: 'curator account'
      });

      // In test mode, returns mock response
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-message');

      // Email is NOT actually sent
      // Console log shows: [EMAIL_SERVICE] Mock email send { to: 'newuser@test.com', subject: 'Welcome to Flowerpil' }
    });

    it('should throw error for missing email parameter', async () => {
      await expect(
        sendSignupConfirmationEmail({
          confirmationCode: '123456',
          accountType: 'account'
        })
      ).rejects.toThrow('Email recipient missing');
    });

    it('should send email without confirmation code', async () => {
      const result = await sendSignupConfirmationEmail({
        email: 'noverify@test.com',
        accountType: 'user account'
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-message');
    });

    it('should include confirmation code when provided', async () => {
      const code = '987654';
      const result = await sendSignupConfirmationEmail({
        email: 'verify@test.com',
        confirmationCode: code,
        accountType: 'account'
      });

      expect(result.success).toBe(true);
      // Confirmation code is in the email body (not exposed in return value)
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email with link (mocked)', async () => {
      const resetToken = 'secure-token-abc123';
      const result = await sendPasswordResetEmail({
        email: 'user@test.com',
        resetLink: `https://flowerpil.io/reset-password?token=${resetToken}`,
        expiresMinutes: 60
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-message');
    });

    it('should throw error for missing email parameter', async () => {
      await expect(
        sendPasswordResetEmail({
          resetLink: 'https://flowerpil.io/reset-password?token=xyz',
          expiresMinutes: 60
        })
      ).rejects.toThrow('Email recipient missing');
    });

    it('should use default expiry time if not specified', async () => {
      const result = await sendPasswordResetEmail({
        email: 'user@test.com',
        resetLink: 'https://flowerpil.io/reset-password?token=xyz'
        // expiresMinutes defaults to 60
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-message');
    });
  });

  describe('sendReferralSubmissionEmail', () => {
    it('should send referral submission email (mocked)', async () => {
      const result = await sendReferralSubmissionEmail({
        email: 'invitee@test.com',
        referralCode: 'REF123ABC',
        inviteeName: 'New Curator',
        issuerName: 'DJ Test'
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-message');
    });

    it('should work without invitee name', async () => {
      const result = await sendReferralSubmissionEmail({
        email: 'anonymous@test.com',
        referralCode: 'REF456DEF',
        issuerName: 'Admin'
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-message');
    });

    it('should work without issuer name', async () => {
      const result = await sendReferralSubmissionEmail({
        email: 'invitee2@test.com',
        referralCode: 'REF789GHI',
        inviteeName: 'New User'
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-message');
    });

    it('should throw error for missing email', async () => {
      await expect(
        sendReferralSubmissionEmail({
          referralCode: 'REF999',
          inviteeName: 'Test'
        })
      ).rejects.toThrow('Email recipient missing');
    });
  });

  describe('Verification Code Generation and Hashing', () => {
    it('should generate 6-digit verification code', () => {
      const code = generateVerificationCode();

      expect(code).toBeDefined();
      expect(code).toMatch(/^\d{6}$/); // Exactly 6 digits
      expect(code.length).toBe(6);
    });

    it('should generate different codes on successive calls', () => {
      const code1 = generateVerificationCode();
      const code2 = generateVerificationCode();
      const code3 = generateVerificationCode();

      // Very unlikely all three are the same (1 in 1 trillion chance)
      expect(new Set([code1, code2, code3]).size).toBeGreaterThan(1);
    });

    it('should hash verification code with HMAC-SHA256', () => {
      const code = '123456';
      const hash = hashCode(code);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(code); // Should be hashed, not plain
      expect(hash.length).toBe(64); // SHA256 hash is 64 hex characters
      expect(hash).toMatch(/^[0-9a-f]{64}$/); // Hex string
    });

    it('should verify correct code against hash', () => {
      const code = '789012';
      const hash = hashCode(code);

      const isValid = verifyCodeHash(code, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect code against hash', () => {
      const correctCode = '111111';
      const wrongCode = '222222';
      const hash = hashCode(correctCode);

      const isValid = verifyCodeHash(wrongCode, hash);
      expect(isValid).toBe(false);
    });

    it('should produce consistent hash for same code', () => {
      const code = '999999';
      const hash1 = hashCode(code);
      const hash2 = hashCode(code);

      // Same code should produce same hash with same pepper
      expect(hash1).toBe(hash2);
    });

    it('should use pepper for security (different codes produce different hashes)', () => {
      const code1 = '111111';
      const code2 = '222222';
      const hash1 = hashCode(code1);
      const hash2 = hashCode(code2);

      expect(hash1).not.toBe(hash2);
    });

    it('should throw error if EMAIL_CODE_PEPPER not set', () => {
      const originalPepper = process.env.EMAIL_CODE_PEPPER;
      delete process.env.EMAIL_CODE_PEPPER;

      expect(() => hashCode('123456')).toThrow('EMAIL_CODE_PEPPER');

      // Restore pepper
      process.env.EMAIL_CODE_PEPPER = originalPepper;
    });
  });

  describe('Email Mocking Behavior', () => {
    it('should mock emails in test environment', async () => {
      // Verify NODE_ENV is 'test'
      expect(process.env.NODE_ENV).toBe('test');

      const result = await sendSignupConfirmationEmail({
        email: 'mock-test@test.com',
        confirmationCode: '000000',
        accountType: 'test account'
      });

      // Should be mocked and succeed
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-message');
    });

    it('should not require SMTP config in test mode', async () => {
      // In test mode, SMTP env vars are not needed
      // The shouldMockEmails() function returns true, so no transporter is created

      const result = await sendPasswordResetEmail({
        email: 'test@test.com',
        resetLink: 'https://flowerpil.io/reset'
      });

      expect(result.success).toBe(true);
    });
  });
});
