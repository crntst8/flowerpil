#!/usr/bin/env npx ts-node

/**
 * setup-token.ts - Interactive OAuth Setup for DSP Platforms
 *
 * Purpose:
 *   Guide operators through setting up OAuth tokens for Spotify, Apple Music, and TIDAL
 *   with clear instructions, validation, and proper storage in the database.
 *
 * Usage:
 *   npx ts-node scripts/dsp/setup-token.ts
 *
 * Features:
 *   - Interactive prompts for platform/account selection
 *   - OAuth flow handling (device code, browser redirect, etc.)
 *   - Scope validation via test API calls
 *   - Stores token with v2 schema (account_type, account_label, etc.)
 *
 * Phase: 1 (Token Management Overhaul)
 * Status: SCAFFOLD - Requires implementation
 *
 * Dependencies:
 *   - inquirer: Interactive CLI prompts
 *   - chalk: Terminal colors
 *   - open: Browser launching for OAuth
 *
 * See: llm/features/wip/dsp-automate/IMPLEMENT.json → phase-1 → cli_tools
 */

import * as fs from 'fs';
import * as path from 'path';

// TODO: Import dependencies once installed
// import inquirer from 'inquirer';
// import chalk from 'chalk';
// import open from 'open';

// TODO: Import database helpers
// import { getDatabase } from '../../server/database/db.js';

// TODO: Import DSP service clients
// import SpotifyService from '../../server/services/spotifyService.js';
// import tidalService from '../../server/services/tidalService.js';
// import appleMusicApiService from '../../server/services/appleMusicApiService.js';

interface TokenSetupOptions {
  platform: 'spotify' | 'apple' | 'tidal';
  accountType: 'flowerpil' | 'curator';
  accountLabel: string;
  curatorId?: number;
}

interface OAuthResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  refreshExpiresAt?: Date;
  userInfo: Record<string, any>;
}

/**
 * Main entry point - displays welcome and launches interactive wizard
 */
async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🔐 Flowerpil DSP OAuth Token Setup Wizard');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('This tool will guide you through setting up OAuth authentication');
  console.log('for Spotify, Apple Music, or TIDAL export functionality.');
  console.log('');
  console.log('You will need:');
  console.log('  • Client ID and Secret for the chosen platform');
  console.log('  • Browser access for OAuth authorization');
  console.log('  • Admin privileges to store tokens in the database');
  console.log('');

  // TODO: Implement interactive wizard
  // const options = await promptForOptions();
  // const credentials = await getRequiredCredentials(options.platform);
  // const oauthResult = await performOAuthFlow(options.platform, credentials);
  // await validateScopes(options.platform, oauthResult.accessToken);
  // await storeToken(options, oauthResult);
  // displaySuccessSummary(options, oauthResult);

  console.log('⚠️  SCAFFOLD ONLY - Implementation pending');
  console.log('');
  console.log('Next steps to complete this tool:');
  console.log('  1. Implement promptForOptions() - interactive platform/account selection');
  console.log('  2. Implement platform-specific OAuth flows:');
  console.log('     - Spotify: Device Code Flow');
  console.log('     - Apple: Developer Token generation');
  console.log('     - TIDAL: Authorization Code Flow');
  console.log('  3. Add scope validation via test API calls');
  console.log('  4. Implement database storage with v2 schema');
  console.log('  5. Add health check after token storage');
  console.log('');
  console.log('See: llm/features/wip/dsp-automate/IMPLEMENT.json → phase-1');
  console.log('');

  process.exit(0);
}

/**
 * Prompt user for setup options
 * TODO: Implement with inquirer
 */
async function promptForOptions(): Promise<TokenSetupOptions> {
  // TODO: Use inquirer to prompt for:
  // - Platform (Spotify, Apple Music, TIDAL)
  // - Account type (flowerpil, curator)
  // - Account label (e.g., "flowerpil-primary", "flowerpil-backup")
  // - Curator ID if account type is 'curator'
  throw new Error('Not implemented');
}

/**
 * Get required credentials for platform from environment
 * TODO: Load from /etc/environment or ecosystem.config.cjs
 */
async function getRequiredCredentials(platform: string): Promise<Record<string, string>> {
  // TODO: Load platform-specific credentials
  // Spotify: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
  // Apple: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_PATH
  // TIDAL: TIDAL_CLIENT_ID, TIDAL_CLIENT_SECRET
  throw new Error('Not implemented');
}

/**
 * Perform OAuth flow for platform
 * TODO: Implement platform-specific flows
 */
async function performOAuthFlow(platform: string, credentials: Record<string, string>): Promise<OAuthResult> {
  // TODO: Implement OAuth flows:
  //
  // Spotify Device Code Flow:
  //   1. POST to /api/token (device authorization)
  //   2. Display user_code and verification_uri
  //   3. Poll for token completion
  //   4. Return access_token, refresh_token, expires_in
  //
  // Apple Developer Token:
  //   1. Load private key from APPLE_PRIVATE_KEY_PATH
  //   2. Generate JWT with appropriate claims
  //   3. No refresh token (tokens valid for 6 months)
  //
  // TIDAL Authorization Code Flow:
  //   1. Generate authorization URL
  //   2. Launch browser to URL
  //   3. Start local callback server
  //   4. Exchange code for tokens
  throw new Error('Not implemented');
}

/**
 * Validate token scopes by making test API calls
 * TODO: Implement platform-specific validation
 */
async function validateScopes(platform: string, accessToken: string): Promise<void> {
  // TODO: Make test API calls to verify scopes:
  //
  // Spotify:
  //   GET /v1/me (requires user-read-private)
  //   GET /v1/me/playlists (requires playlist-read-private)
  //
  // Apple:
  //   GET /v1/catalog/{storefront}/songs (requires catalog access)
  //
  // TIDAL:
  //   GET /v1/users/{userId} (requires user info access)
  //   GET /v1/playlists (requires playlist access)
  throw new Error('Not implemented');
}

/**
 * Store token in database with v2 schema
 * TODO: Implement database insertion
 */
async function storeToken(options: TokenSetupOptions, oauthResult: OAuthResult): Promise<void> {
  // TODO: Insert into export_oauth_tokens with v2 schema:
  // INSERT INTO export_oauth_tokens (
  //   platform, access_token, refresh_token, expires_at, refresh_expires_at,
  //   account_type, account_label, owner_curator_id,
  //   health_status, last_validated_at, is_active, user_info
  // ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'healthy', CURRENT_TIMESTAMP, 1, ?)
  throw new Error('Not implemented');
}

/**
 * Display success summary and next steps
 */
function displaySuccessSummary(options: TokenSetupOptions, oauthResult: OAuthResult): void {
  console.log('');
  console.log('✅ Token setup completed successfully!');
  console.log('');
  console.log('Token details:');
  console.log(`  Platform:      ${options.platform}`);
  console.log(`  Account Type:  ${options.accountType}`);
  console.log(`  Account Label: ${options.accountLabel}`);
  console.log(`  Expires:       ${oauthResult.expiresAt.toISOString()}`);
  console.log(`  User:          ${JSON.stringify(oauthResult.userInfo)}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  • Verify token: node scripts/dsp/token-check.js --platform ${options.platform}`);
  console.log('  • Test export: Create test export request from admin dashboard');
  console.log('  • Monitor logs: pm2 logs export-worker');
  console.log('');
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('');
    console.error('❌ Error during token setup:');
    console.error(error.message);
    console.error('');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

export { main, TokenSetupOptions, OAuthResult };
