/**
 * Auth Persistence E2E Tests
 *
 * Tests authentication persistence across page navigations,
 * refreshes, and sessions. Verifies:
 * - Auth state persists across page navigation
 * - Auth survives page refresh
 * - CSRF tokens regenerate properly
 * - Logout clears auth state completely
 */

import { test, expect } from '@playwright/test';
import {
  seedTestCurator,
  loginAsCurator,
  logoutCurator,
  cleanupTestData
} from './utils.js';

test.describe('Auth Persistence', () => {
  const testEmail = `auth-persist-${Date.now()}@test.com`;
  const testUsername = `authtest${Date.now()}@test.com`;
  const testPassword = 'SecurePass123!';

  let curatorCredentials;

  test.beforeAll(async () => {
    // Seed a test curator
    curatorCredentials = await seedTestCurator({
      email: testEmail,
      username: testUsername,
      password: testPassword,
      curatorName: 'Auth Test Curator',
      curatorType: 'dj'
    });
  });

  test.afterAll(async () => {
    // Cleanup test data
    await cleanupTestData({ usernames: [testUsername], emails: [testEmail] });
  });

  test('should persist authentication across page navigation', async ({ page }) => {
    // Login
    await loginAsCurator(page, {
      username: curatorCredentials.username,
      password: curatorCredentials.password
    });

    // Verify we're on dashboard
    await expect(page).toHaveURL(/.*curator-admin/);

    // Navigate to different pages
    const pages = [
      '/curator-admin/playlists',
      '/curator-admin/profile',
      '/curator-admin'
    ];

    for (const path of pages) {
      await page.goto(path);

      // Should not redirect to login
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(new RegExp(path));

      // Should still see user menu or dev switcher (indicating logged in)
      const userMenu = page.locator('button:has-text("👤"), [data-testid="user-menu"], .user-menu').first();
      await expect(userMenu).toBeVisible({ timeout: 5000 });
    }
  });

  test('should persist authentication after page refresh', async ({ page }) => {
    // Login
    await loginAsCurator(page, {
      username: curatorCredentials.username,
      password: curatorCredentials.password
    });

    // Get current URL
    const currentUrl = page.url();

    // Refresh page
    await page.reload();

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Should still be on same page (not redirected to login)
    await expect(page).toHaveURL(currentUrl);

    // Should still see user menu or dev switcher
    const userMenu = page.locator('button:has-text("👤"), [data-testid="user-menu"], .user-menu').first();
    await expect(userMenu).toBeVisible({ timeout: 5000 });
  });

  test('should regenerate CSRF token on auth status check', async ({ page, context }) => {
    // Login
    await loginAsCurator(page, {
      username: curatorCredentials.username,
      password: curatorCredentials.password
    });

    // Get initial cookies
    const initialCookies = await context.cookies();
    const initialCsrfCookie = initialCookies.find(c => c.name === 'csrf_token');

    // Verify CSRF cookie exists
    expect(initialCsrfCookie).toBeDefined();
    const initialCsrfValue = initialCsrfCookie?.value;

    // Clear the CSRF cookie (simulating expiration)
    await context.clearCookies();

    // Navigate to trigger auth status check
    await page.goto('/curator-admin');
    await page.waitForLoadState('networkidle');

    // Get new cookies
    const newCookies = await context.cookies();
    const newCsrfCookie = newCookies.find(c => c.name === 'csrf_token');

    // CSRF token should be regenerated
    expect(newCsrfCookie).toBeDefined();
    expect(newCsrfCookie?.value).not.toBe(initialCsrfValue);
  });

  test('should clear auth state after logout', async ({ page, context }) => {
    // Login
    await loginAsCurator(page, {
      username: curatorCredentials.username,
      password: curatorCredentials.password
    });

    // Verify authenticated
    await expect(page).toHaveURL(/.*curator-admin/);

    // Logout
    await logoutCurator(page);

    // Should redirect to login page
    await expect(page).toHaveURL(/.*curator-admin\/login/);

    // Check cookies are cleared
    const cookies = await context.cookies();
    const authCookie = cookies.find(c => c.name === 'auth_token');
    const csrfCookie = cookies.find(c => c.name === 'csrf_token');

    // Auth token should be cleared
    expect(authCookie?.value).toBeFalsy();

    // Try to access protected page
    await page.goto('/curator-admin');

    // Should redirect to login
    await page.waitForURL(/.*curator-admin\/login/, { timeout: 5000 });
  });

  test('should prevent access to protected routes without auth', async ({ page }) => {
    // Try to access curator dashboard without logging in
    await page.goto('/curator-admin');

    // Should redirect to login page
    await expect(page).toHaveURL(/.*curator-admin\/login/, { timeout: 10000 });
  });

  test('should handle authentication across multiple tabs', async ({ browser }) => {
    // Create two tabs
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Login in first tab
    await loginAsCurator(page1, {
      username: curatorCredentials.username,
      password: curatorCredentials.password
    });

    // Second tab should also be authenticated (shared cookies)
    await page2.goto('/curator-admin');
    await page2.waitForLoadState('networkidle');

    // Should be on dashboard (not redirected to login)
    await expect(page2).toHaveURL(/.*curator-admin/);

    // Should see user menu or dev switcher in both tabs
    const userMenu1 = page1.locator('button:has-text("👤"), [data-testid="user-menu"], .user-menu').first();
    const userMenu2 = page2.locator('button:has-text("👤"), [data-testid="user-menu"], .user-menu').first();

    await expect(userMenu1).toBeVisible({ timeout: 5000 });
    await expect(userMenu2).toBeVisible({ timeout: 5000 });

    // Logout in first tab
    await logoutCurator(page1);

    // Refresh second tab
    await page2.reload();
    await page2.waitForLoadState('networkidle');

    // Second tab should also be logged out
    await expect(page2).toHaveURL(/.*curator-admin\/login/, { timeout: 10000 });

    await context.close();
  });

  test('should maintain auth state with expired CSRF but valid auth token', async ({ page, context }) => {
    // Login
    await loginAsCurator(page, {
      username: curatorCredentials.username,
      password: curatorCredentials.password
    });

    // Get auth cookie
    const cookies = await context.cookies();
    const authCookie = cookies.find(c => c.name === 'auth_token');
    expect(authCookie).toBeDefined();

    // Clear CSRF cookie only
    await context.clearCookies({ name: 'csrf_token' });

    // Navigate - should regenerate CSRF and stay authenticated
    await page.goto('/curator-admin/playlists');
    await page.waitForLoadState('networkidle');

    // Should not redirect to login
    await expect(page).toHaveURL(/.*curator-admin\/playlists/);

    // User menu or dev switcher should be visible
    const userMenu = page.locator('button:has-text("👤"), [data-testid="user-menu"], .user-menu').first();
    await expect(userMenu).toBeVisible({ timeout: 5000 });

    // CSRF should be regenerated
    const newCookies = await context.cookies();
    const newCsrfCookie = newCookies.find(c => c.name === 'csrf_token');
    expect(newCsrfCookie).toBeDefined();
  });
});
