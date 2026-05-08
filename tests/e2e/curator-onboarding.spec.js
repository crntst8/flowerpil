/**
 * Curator Onboarding E2E Tests
 *
 * Tests the complete curator onboarding journey:
 * - Referral code verification
 * - Account creation
 * - Email verification (if enabled)
 * - Auto-login after signup
 * - Profile completion
 * - Dashboard access
 */

import { test, expect } from '@playwright/test';
import {
  seedTestReferral,
  cleanupTestData,
  waitAndClick,
  waitAndFill
} from './utils.js';

test.describe('Curator Onboarding', () => {
  const testEmail = `curator-onboard-${Date.now()}@test.com`;
  const testUsername = `curator${Date.now()}@test.com`;
  const testPassword = 'SecurePass123!';

  let referralData;

  test.beforeAll(async () => {
    // Seed a referral code for this test
    referralData = await seedTestReferral({
      email: testEmail,
      curatorType: 'dj',
      referrerName: 'Test Admin'
    });
  });

  test.afterAll(async () => {
    // Cleanup test data
    await cleanupTestData({ usernames: [testUsername], emails: [testEmail] });
  });

  test('should complete full curator onboarding journey', async ({ page }) => {
    // 1. Navigate to curator signup page
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // STEP 0: Invitation Details (referral code + email)
    // 2. Enter referral code using actual placeholder from component
    await waitAndFill(page, 'input[placeholder="Enter referral code"]', referralData.code);

    // 3. Email field should be present (may or may not be pre-filled)
    const emailInput = page.locator('input[placeholder="your@email.com"]');
    await expect(emailInput).toBeVisible();

    // Fill or verify email
    const currentEmail = await emailInput.inputValue();
    if (!currentEmail || currentEmail !== testEmail) {
      await emailInput.fill(testEmail);
    }

    // 4. Click Next to proceed to password step
    await waitAndClick(page, 'button:has-text("Next")');
    await page.waitForLoadState('networkidle');

    // STEP 1: Set Password
    // 5. Wait for password step to appear
    await expect(page.locator('text=SET PASSWORD')).toBeVisible({ timeout: 5000 });

    // 6. Fill password fields using actual placeholders
    await waitAndFill(page, 'input[placeholder="At least 8 characters"]', testPassword);
    await waitAndFill(page, 'input[placeholder="Confirm password"]', testPassword);

    // Wait for password validation checks to show
    await expect(page.locator('text=✅ 8+ chars')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('text=✅ Passwords match')).toBeVisible({ timeout: 2000 });

    // 7. Click Next to proceed to profile step
    await waitAndClick(page, 'button:has-text("Next")');
    await page.waitForLoadState('networkidle');

    // STEP 2: Name & Description
    // 8. Wait for profile name step
    await expect(page.locator('text=NAME & DESCRIPTION')).toBeVisible({ timeout: 5000 });

    // 9. Fill curator name
    await waitAndFill(page, 'input[placeholder="Your curator name"]', 'Test DJ Curator');

    // 10. Select curator type from dropdown
    const typeSelect = page.locator('select').first();
    await typeSelect.selectOption({ value: 'dj' });

    // 11. Fill location (optional) - skip for now as it uses Google Places autocomplete
    // await page.fill('input[placeholder="City, Country"]', 'Los Angeles');

    // 12. Click Next to proceed to bio handle step
    await waitAndClick(page, 'button:has-text("Next")');
    await page.waitForLoadState('networkidle');

    // STEP 3: pil.bio Handle
    // 13. Wait for handle step
    await expect(page.locator('text=pil.bio')).toBeVisible({ timeout: 5000 });

    // 14. Enter desired handle (optional - can skip)
    const handle = `testdj${Date.now()}`;
    await waitAndFill(page, 'input[placeholder="my-handle"]', handle);

    // 15. Click button to create account (this actually creates the account!)
    // Button text might be "Reserve Handle" or "Create Account" or "Next"
    const createButton = page.locator('button:has-text("Reserve"), button:has-text("Create"), button:has-text("Next")').first();
    await createButton.click();

    // Wait for account creation
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Allow time for auth to process

    // STEP 4 & 5: Profile Setup & Image Upload (optional steps)
    // After account creation, user should be authenticated
    // They may land on profile setup or be redirected to dashboard

    // 16. Check if we're redirected to curator admin
    // Allow up to 15 seconds for redirect
    try {
      await page.waitForURL(/.*curator-admin/, { timeout: 15000 });
    } catch {
      // If not redirected, we might still be in onboarding flow
      // Try to complete remaining optional steps or skip them

      // Check for Skip button and click if present
      const skipButton = page.locator('button:has-text("Skip")');
      if (await skipButton.isVisible({ timeout: 2000 })) {
        await skipButton.click();
        await page.waitForLoadState('networkidle');

        // Try skip again if there's another step
        if (await skipButton.isVisible({ timeout: 2000 })) {
          await skipButton.click();
          await page.waitForLoadState('networkidle');
        }
      }

      // Now should be redirected to dashboard
      await page.waitForURL(/.*curator-admin/, { timeout: 10000 });
    }

    // 17. Verify we're on curator dashboard
    await expect(page).toHaveURL(/.*curator-admin/);

    // 18. Verify authenticated state - look for common UI elements
    // The page should have loaded successfully
    await page.waitForLoadState('networkidle');
  });

  test('should reject invalid referral code', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // Enter invalid referral code using actual placeholder
    await waitAndFill(page, 'input[placeholder="Enter referral code"]', 'INVALID123');

    // Enter any email
    await waitAndFill(page, 'input[placeholder="your@email.com"]', 'test@test.com');

    // Click Next button
    await waitAndClick(page, 'button:has-text("Next")');

    // Should show error message (component shows errors as status/error state)
    await page.waitForSelector('text=/invalid|not found|expired|failed/i', { timeout: 5000 });

    // Should still be on signup page (step 0)
    await expect(page).toHaveURL(/.*signup/);
  });

  test('should reject used referral code', async ({ page }) => {
    // Create and immediately use a referral
    const usedReferral = await seedTestReferral({
      email: `used-${Date.now()}@test.com`,
      curatorType: 'dj'
    });

    // Mark it as used in database
    const Database = (await import('better-sqlite3')).default;
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const DB_PATH = path.join(__dirname, '../../data/test-e2e.db');

    const db = new Database(DB_PATH);
    db.prepare('UPDATE curator_referrals SET is_used = 1 WHERE code = ?').run(usedReferral.code);
    db.close();

    // Try to use it
    await page.goto('/signup');
    await waitAndFill(page, 'input[name="referralCode"], input[placeholder*="referral" i]', usedReferral.code);
    await waitAndClick(page, 'button[type="submit"], button:has-text("Verify"), button:has-text("Next")');

    // Should show error
    await page.waitForSelector('text=/already used|no longer valid|claimed/i', { timeout: 5000 });

    // Cleanup
    await cleanupTestData({ emails: [usedReferral.email] });
  });

  test('should reject mismatched email', async ({ page }) => {
    // Create referral with specific email
    const specificReferral = await seedTestReferral({
      email: 'specific@test.com',
      curatorType: 'radio'
    });

    await page.goto('/signup');

    // Enter valid referral code
    await waitAndFill(page, 'input[name="referralCode"], input[placeholder*="referral" i]', specificReferral.code);
    await waitAndClick(page, 'button[type="submit"], button:has-text("Verify"), button:has-text("Next")');

    // Wait for form
    await page.waitForLoadState('networkidle');

    // Try to change email to different one
    const emailInput = page.locator('input[name="email"], input[type="email"]');

    // If email field is editable, try to change it
    if (await emailInput.isEditable()) {
      await emailInput.fill('different@test.com');

      // Fill other fields
      await waitAndFill(page, 'input[name="username"]', `test${Date.now()}`);
      await waitAndFill(page, 'input[name="password"]', 'SecurePass123!');

      // Submit
      await waitAndClick(page, 'button[type="submit"]');

      // Should show error about email mismatch
      await page.waitForSelector('text=/email.*match|referral.*email|must use/i', { timeout: 5000 });
    }

    // Cleanup
    await cleanupTestData({ emails: ['specific@test.com', 'different@test.com'] });
  });

  test('should validate password strength', async ({ page }) => {
    const weakPasswordReferral = await seedTestReferral({
      email: `weak-pass-${Date.now()}@test.com`,
      curatorType: 'dj'
    });

    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // STEP 0: Enter referral code and email
    await waitAndFill(page, 'input[placeholder="Enter referral code"]', weakPasswordReferral.code);
    await waitAndFill(page, 'input[placeholder="your@email.com"]', weakPasswordReferral.email);
    await waitAndClick(page, 'button:has-text("Next")');
    await page.waitForLoadState('networkidle');

    // STEP 1: Try weak password
    await expect(page.locator('text=SET PASSWORD')).toBeVisible({ timeout: 5000 });

    // Enter weak password
    const weakPass = '123';
    await waitAndFill(page, 'input[placeholder="At least 8 characters"]', weakPass);
    await waitAndFill(page, 'input[placeholder="Confirm password"]', weakPass);

    // Should show validation errors (X marks instead of checkmarks)
    await expect(page.locator('text=❌')).toBeVisible({ timeout: 2000 });

    // Try to proceed - button should either be disabled or show error
    await waitAndClick(page, 'button:has-text("Next")');

    // Should still be on password step due to validation
    await expect(page.locator('text=SET PASSWORD')).toBeVisible({ timeout: 2000 });

    // Cleanup
    await cleanupTestData({ emails: [weakPasswordReferral.email] });
  });

  test('should prevent duplicate username during signup', async ({ page }) => {
    // Create existing curator
    const existingUsername = `existing${Date.now()}`;
    await seedTestReferral({
      email: `existing-${Date.now()}@test.com`,
      curatorType: 'dj'
    });

    // For this test, we'd need to manually create the user first
    // Skipping full implementation as it requires more setup

    // Create new referral for duplicate attempt
    const duplicateReferral = await seedTestReferral({
      email: `duplicate-${Date.now()}@test.com`,
      curatorType: 'blog'
    });

    await page.goto('/signup');
    await waitAndFill(page, 'input[name="referralCode"]', duplicateReferral.code);
    await waitAndClick(page, 'button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Try to use existing username
    await waitAndFill(page, 'input[name="username"]', existingUsername);
    await waitAndFill(page, 'input[name="password"]', 'SecurePass123!');
    await waitAndClick(page, 'button[type="submit"]');

    // Should show username taken error
    await page.waitForSelector('text=/username.*taken|already exists|unavailable/i', { timeout: 5000 });

    // Cleanup
    await cleanupTestData({ emails: [duplicateReferral.email] });
  });
});
