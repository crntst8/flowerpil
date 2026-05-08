/**
 * Token Refresh Service
 *
 * Handles automatic refresh of OAuth tokens before they expire.
 * Works with Spotify, YouTube Music, and TIDAL OAuth refresh tokens to maintain
 * continuous access without manual re-authentication.
 *
 * Refresh Strategy:
 * - Tokens expiring within 24h are eligible for refresh
 * - Refresh tokens must be present and not expired
 * - Failed refreshes mark token as revoked
 * - Successful refreshes update token and health status
 */

import { getDatabase } from '../database/db.js';
import SpotifyService from './spotifyService.js';
import tidalService from './tidalService.js';
import { getTokensNeedingRefresh, updateTokenHealth, HealthStatus } from './tokenHealthService.js';

const db = getDatabase();

/**
 * Refresh a single OAuth token
 * @param {Object} tokenRecord - Token record from database
 * @returns {Promise<Object>} Refresh result
 */
export async function refreshToken(tokenRecord) {
  const { id, platform, refresh_token, account_label } = tokenRecord;

  console.log(`[TOKEN_REFRESH] Attempting refresh for ${platform} token (ID: ${id}, Label: ${account_label})`);

  if (!refresh_token) {
    console.warn(`[TOKEN_REFRESH] No refresh token available for ${platform} token ${id}`);
    return {
      success: false,
      tokenId: id,
      platform,
      error: 'NO_REFRESH_TOKEN'
    };
  }

  try {
    let refreshResult;

    switch (platform) {
      case 'spotify':
        refreshResult = await refreshSpotifyToken(tokenRecord);
        break;

      case 'youtube_music':
        refreshResult = await refreshYouTubeMusicToken(tokenRecord);
        break;

      case 'tidal':
        refreshResult = await refreshTidalToken(tokenRecord);
        break;

      case 'apple':
        // Apple Music uses JWT tokens that don't expire in the traditional sense
        // They're recreated each time, so no refresh needed
        console.log(`[TOKEN_REFRESH] Skipping Apple Music token ${id} (JWT-based)`);
        return {
          success: true,
          tokenId: id,
          platform,
          skipped: true,
          reason: 'Apple Music uses JWT tokens'
        };

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    return refreshResult;

  } catch (error) {
    console.error(`[TOKEN_REFRESH] Failed to refresh ${platform} token ${id}:`, error.message);

    // Check if refresh token is revoked/invalid
    if (error.message.includes('REFRESH_TOKEN_INVALID')) {
      updateTokenHealth(id, HealthStatus.REVOKED);
      console.error(`[TOKEN_REFRESH] Token ${id} marked as REVOKED`);
    }

    return {
      success: false,
      tokenId: id,
      platform,
      error: error.message
    };
  }
}

/**
 * Refresh Spotify token
 */
async function refreshSpotifyToken(tokenRecord) {
  const spotifyService = new SpotifyService();
  const { id, refresh_token } = tokenRecord;

  const refreshData = await spotifyService.refreshAccessToken(refresh_token);

  // Calculate new expiration time
  const expiresAt = new Date(Date.now() + (refreshData.expires_in * 1000)).toISOString();

  // Update database with new token
  const updateStmt = db.prepare(`
    UPDATE export_oauth_tokens
    SET access_token = ?,
        refresh_token = ?,
        expires_at = ?,
        health_status = ?,
        last_validated_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  updateStmt.run(
    refreshData.access_token,
    refreshData.refresh_token,
    expiresAt,
    HealthStatus.HEALTHY,
    new Date().toISOString(),
    id
  );

  console.log(`[TOKEN_REFRESH] ✓ Spotify token ${id} refreshed successfully (expires: ${expiresAt})`);

  return {
    success: true,
    tokenId: id,
    platform: 'spotify',
    expiresAt
  };
}

/**
 * Refresh YouTube Music token (Google OAuth refresh_token grant)
 */
async function refreshYouTubeMusicToken(tokenRecord) {
  const { id, refresh_token } = tokenRecord;

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token,
    grant_type: 'refresh_token'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const normalizedError = String(data.error || '').toLowerCase();
    if (normalizedError.includes('invalid_grant')) {
      throw new Error('REFRESH_TOKEN_INVALID');
    }
    throw new Error(data.error_description || data.error || 'Failed to refresh YouTube Music token');
  }

  const expiresAt = new Date(Date.now() + ((data.expires_in || 3600) * 1000)).toISOString();

  const updateStmt = db.prepare(`
    UPDATE export_oauth_tokens
    SET access_token = ?,
        refresh_token = ?,
        expires_at = ?,
        health_status = ?,
        last_validated_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  updateStmt.run(
    data.access_token,
    tokenRecord.refresh_token,
    expiresAt,
    HealthStatus.HEALTHY,
    new Date().toISOString(),
    id
  );

  console.log(`[TOKEN_REFRESH] ✓ YouTube Music token ${id} refreshed successfully (expires: ${expiresAt})`);

  return {
    success: true,
    tokenId: id,
    platform: 'youtube_music',
    expiresAt
  };
}

/**
 * Refresh TIDAL token
 */
async function refreshTidalToken(tokenRecord) {
  const { id, refresh_token } = tokenRecord;

  const refreshData = await tidalService.refreshAccessToken(refresh_token);

  // Calculate new expiration time
  const expiresAt = new Date(Date.now() + (refreshData.expires_in * 1000)).toISOString();

  // Update database with new token
  const updateStmt = db.prepare(`
    UPDATE export_oauth_tokens
    SET access_token = ?,
        refresh_token = ?,
        expires_at = ?,
        health_status = ?,
        last_validated_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  updateStmt.run(
    refreshData.access_token,
    refreshData.refresh_token,
    expiresAt,
    HealthStatus.HEALTHY,
    new Date().toISOString(),
    id
  );

  console.log(`[TOKEN_REFRESH] ✓ TIDAL token ${id} refreshed successfully (expires: ${expiresAt})`);

  return {
    success: true,
    tokenId: id,
    platform: 'tidal',
    expiresAt
  };
}

/**
 * Refresh all tokens that need refreshing
 * @returns {Promise<Object>} Summary of refresh operation
 */
export async function refreshAllTokens() {
  console.log('[TOKEN_REFRESH] Starting token refresh cycle...');

  const tokensNeedingRefresh = getTokensNeedingRefresh();

  if (tokensNeedingRefresh.length === 0) {
    console.log('[TOKEN_REFRESH] No tokens need refresh at this time');
    return {
      total: 0,
      refreshed: 0,
      failed: 0,
      skipped: 0,
      results: []
    };
  }

  console.log(`[TOKEN_REFRESH] Found ${tokensNeedingRefresh.length} token(s) needing refresh`);

  const results = [];
  let refreshed = 0;
  let failed = 0;
  let skipped = 0;

  for (const token of tokensNeedingRefresh) {
    const result = await refreshToken(token);
    results.push(result);

    if (result.success) {
      if (result.skipped) {
        skipped++;
      } else {
        refreshed++;
      }
    } else {
      failed++;
    }

    // Small delay between refreshes to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const summary = {
    total: tokensNeedingRefresh.length,
    refreshed,
    failed,
    skipped,
    results
  };

  console.log('[TOKEN_REFRESH] Refresh cycle complete:', {
    total: summary.total,
    refreshed: summary.refreshed,
    failed: summary.failed,
    skipped: summary.skipped
  });

  return summary;
}

/**
 * Get summary of tokens and their refresh status
 */
export function getRefreshStatus() {
  const allTokens = db.prepare(`
    SELECT
      id,
      platform,
      account_type,
      account_label,
      expires_at,
      refresh_expires_at,
      health_status,
      last_validated_at,
      is_active,
      CASE
        WHEN refresh_token IS NOT NULL THEN 1
        ELSE 0
      END as has_refresh_token
    FROM export_oauth_tokens
    WHERE is_active = 1
    ORDER BY platform, account_type, account_label
  `).all();

  const tokensNeedingRefresh = getTokensNeedingRefresh();
  const needsRefreshIds = new Set(tokensNeedingRefresh.map(t => t.id));

  return allTokens.map(token => ({
    ...token,
    needs_refresh: needsRefreshIds.has(token.id),
    time_until_expiry: token.expires_at
      ? Math.floor((new Date(token.expires_at) - new Date()) / 1000 / 60) // minutes
      : null
  }));
}

export default {
  refreshToken,
  refreshAllTokens,
  getRefreshStatus
};
