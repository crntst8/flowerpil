/**
 * Token Health Service
 *
 * Manages health tracking, validation, and status updates for OAuth tokens
 * across DSP platforms (Spotify, Apple Music, TIDAL, YouTube Music).
 *
 * Health Status Values:
 * - 'healthy': Token valid and working, expires > 48h
 * - 'expiring': Token expires within 48h
 * - 'expired': Token past expiration
 * - 'revoked': User revoked authorization
 * - 'unknown': Health not yet determined
 */

import { getDatabase } from '../database/db.js';
import SpotifyService from './spotifyService.js';
import tidalService from './tidalService.js';
import appleMusicApiService from './appleMusicApiService.js';

const db = getDatabase();
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Health status thresholds
const EXPIRING_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;  // 24 hours (when to auto-refresh)

/**
 * Health status definitions
 */
export const HealthStatus = {
  HEALTHY: 'healthy',
  EXPIRING: 'expiring',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  UNKNOWN: 'unknown'
};

/**
 * Calculate health status based on expiration
 */
export const calculateHealthStatus = (expiresAt, refreshExpiresAt = null) => {
  if (!expiresAt) {
    return HealthStatus.UNKNOWN;
  }

  const now = new Date();
  const expiryDate = new Date(expiresAt);
  const timeUntilExpiry = expiryDate.getTime() - now.getTime();

  // Check if already expired
  if (timeUntilExpiry <= 0) {
    return HealthStatus.EXPIRED;
  }

  // Check if expiring soon
  if (timeUntilExpiry < EXPIRING_THRESHOLD_MS) {
    return HealthStatus.EXPIRING;
  }

  // Check refresh token expiration (if applicable)
  if (refreshExpiresAt) {
    const refreshExpiryDate = new Date(refreshExpiresAt);
    const timeUntilRefreshExpiry = refreshExpiryDate.getTime() - now.getTime();

    if (timeUntilRefreshExpiry <= 0) {
      return HealthStatus.EXPIRED; // Can't refresh anymore
    }

    if (timeUntilRefreshExpiry < EXPIRING_THRESHOLD_MS) {
      return HealthStatus.EXPIRING;
    }
  }

  return HealthStatus.HEALTHY;
};

/**
 * Update token health status in database
 */
export const updateTokenHealth = (tokenId, healthStatus, lastValidatedAt = null) => {
  if (!tokenId) {
    throw new Error('Token ID is required');
  }

  const validStatuses = Object.values(HealthStatus);
  if (!validStatuses.includes(healthStatus)) {
    throw new Error(`Invalid health status: ${healthStatus}`);
  }

  const sql = `
    UPDATE export_oauth_tokens
    SET health_status = ?,
        last_validated_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  const stmt = db.prepare(sql);
  const result = stmt.run(
    healthStatus,
    lastValidatedAt || new Date().toISOString(),
    tokenId
  );

  return result.changes > 0;
};

/**
 * Update health status for all tokens based on expiration
 * Optimized to only check tokens that haven't been validated recently (24h)
 */
export const refreshAllTokenHealthStatuses = () => {
  // Only select tokens that need validation:
  // - Not validated in the last 24 hours
  // - Never validated (last_validated_at IS NULL)
  const tokens = db.prepare(`
    SELECT id, platform, expires_at, refresh_expires_at, health_status, last_validated_at
    FROM export_oauth_tokens
    WHERE last_validated_at < datetime('now', '-24 hours')
       OR last_validated_at IS NULL
  `).all();

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const token of tokens) {
    const newStatus = calculateHealthStatus(token.expires_at, token.refresh_expires_at);

    if (newStatus !== token.health_status) {
      // Use optimistic locking: only update if last_validated_at hasn't changed
      // This prevents race conditions when multiple workers run simultaneously
      const result = db.prepare(`
        UPDATE export_oauth_tokens
        SET health_status = ?,
            last_validated_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND (last_validated_at = ? OR (last_validated_at IS NULL AND ? IS NULL))
      `).run(
        newStatus,
        new Date().toISOString(),
        token.id,
        token.last_validated_at,
        token.last_validated_at
      );

      if (result.changes > 0) {
        updated++;
        console.log(`[TOKEN_HEALTH] Updated ${token.platform} token ${token.id}: ${token.health_status} → ${newStatus}`);
      } else {
        // Another process already updated this token
        skipped++;
      }
    } else {
      // Update last_validated_at even if status unchanged to prevent re-checking too soon
      const result = db.prepare(`
        UPDATE export_oauth_tokens
        SET last_validated_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND (last_validated_at = ? OR (last_validated_at IS NULL AND ? IS NULL))
      `).run(
        new Date().toISOString(),
        token.id,
        token.last_validated_at,
        token.last_validated_at
      );

      if (result.changes > 0) {
        unchanged++;
      } else {
        skipped++;
      }
    }
  }

  console.log(`[TOKEN_HEALTH] Refresh complete: ${updated} updated, ${unchanged} unchanged, ${skipped} skipped (concurrent update), ${tokens.length} checked`);

  return { updated, unchanged, skipped, checked: tokens.length };
};

/**
 * Validate token by making a lightweight API call
 *
 * @param {number} tokenId - Token database ID
 * @returns {Promise<{valid: boolean, error?: string, userInfo?: object}>}
 */
export const validateTokenWithAPI = async (tokenId) => {
  const token = db.prepare(`
    SELECT * FROM export_oauth_tokens WHERE id = ?
  `).get(tokenId);

  if (!token) {
    throw new Error(`Token ${tokenId} not found`);
  }

  console.log(`[TOKEN_HEALTH] Validating ${token.platform} token ${token.id} (${token.account_label})`);

  try {
    let result;

    switch (token.platform) {
      case 'spotify':
        result = await validateSpotifyToken(token);
        break;
      case 'tidal':
        result = await validateTidalToken(token);
        break;
      case 'apple':
        result = await validateAppleToken(token);
        break;
      case 'youtube_music':
        result = await validateYouTubeMusicToken(token);
        break;
      default:
        throw new Error(`Unsupported platform: ${token.platform}`);
    }

    if (result.valid) {
      // Update health status and last_validated_at
      updateTokenHealth(tokenId, HealthStatus.HEALTHY, new Date().toISOString());
      console.log(`[TOKEN_HEALTH] ✓ ${token.platform} token ${token.id} is valid`);
    } else {
      // Determine if revoked or expired
      const isRevoked = result.error && (
        result.error.includes('revoked') ||
        result.error.includes('401') ||
        result.error.includes('invalid_grant')
      );

      const newStatus = isRevoked ? HealthStatus.REVOKED : HealthStatus.EXPIRED;
      updateTokenHealth(tokenId, newStatus, new Date().toISOString());
      console.error(`[TOKEN_HEALTH] ✗ ${token.platform} token ${token.id} is invalid: ${result.error}`);
    }

    return result;

  } catch (error) {
    console.error(`[TOKEN_HEALTH] Error validating token ${tokenId}:`, error.message);
    return {
      valid: false,
      error: error.message
    };
  }
};

/**
 * Validate Spotify token by fetching user profile
 */
const validateSpotifyToken = async (token) => {
  try {
    const spotifyService = new SpotifyService();
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${token.access_token}`
      }
    });

    if (response.ok) {
      const userInfo = await response.json();
      return {
        valid: true,
        userInfo: {
          id: userInfo.id,
          display_name: userInfo.display_name,
          email: userInfo.email
        }
      };
    } else {
      const errorText = await response.text();
      return {
        valid: false,
        error: `HTTP ${response.status}: ${errorText}`
      };
    }
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
};

/**
 * Validate YouTube Music token by exercising the refresh token grant.
 * This reliably detects revoked/invalid refresh tokens.
 */
const validateYouTubeMusicToken = async (token) => {
  if (!token.refresh_token) {
    return { valid: false, error: 'No refresh token available' };
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { valid: false, error: 'Missing YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET' };
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token'
    });

    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        valid: false,
        error: data.error_description || data.error || `HTTP ${response.status}: YouTube refresh failed`
      };
    }

    // Persist new access token for operational convenience (best-effort).
    try {
      const expiresAt = new Date(Date.now() + ((data.expires_in || 3600) * 1000)).toISOString();
      db.prepare(`
        UPDATE export_oauth_tokens
        SET access_token = ?,
            expires_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(data.access_token, expiresAt, token.id);
    } catch (_) {
      // ignore persistence failures
    }

    let userInfo = null;
    try {
      userInfo = token.user_info ? JSON.parse(token.user_info) : null;
    } catch (error) {
      userInfo = null;
    }

    return {
      valid: true,
      userInfo
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

/**
 * Validate TIDAL token by fetching user info
 */
const validateTidalToken = async (token) => {
  try {
    const response = await fetch('https://api.tidal.com/v1/users/me', {
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const userInfo = await response.json();
      return {
        valid: true,
        userInfo: {
          userId: userInfo.userId,
          username: userInfo.username
        }
      };
    } else {
      const errorText = await response.text();
      return {
        valid: false,
        error: `HTTP ${response.status}: ${errorText}`
      };
    }
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
};

/**
 * Validate Apple Music token by fetching storefront
 */
const validateAppleToken = async (token) => {
  try {
    // Apple uses JWT-based tokens, not OAuth
    // Validation is primarily expiration-based
    const userInfo = token.user_info ? JSON.parse(token.user_info) : {};
    const storefront = userInfo.storefront || 'us';

    const response = await fetch(`https://api.music.apple.com/v1/me/storefront`, {
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Music-User-Token': token.access_token
      }
    });

    if (response.ok) {
      const data = await response.json();
      return {
        valid: true,
        userInfo: {
          storefront: data.data?.[0]?.id || storefront
        }
      };
    } else {
      const errorText = await response.text();
      return {
        valid: false,
        error: `HTTP ${response.status}: ${errorText}`
      };
    }
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
};

/**
 * Get tokens that need refresh (expiring within 24h and have refresh token)
 * Note: Includes expired tokens to allow recovery via refresh
 */
export const getTokensNeedingRefresh = () => {
  const threshold = new Date(Date.now() + REFRESH_THRESHOLD_MS).toISOString();

  const tokens = db.prepare(`
    SELECT *
    FROM export_oauth_tokens
    WHERE expires_at < ?
      AND refresh_token IS NOT NULL
      AND health_status NOT IN ('revoked')
      AND is_active = 1
    ORDER BY expires_at ASC
  `).all(threshold);

  return tokens;
};

/**
 * Get tokens by health status
 */
export const getTokensByHealthStatus = (healthStatus) => {
  const validStatuses = Object.values(HealthStatus);
  if (!validStatuses.includes(healthStatus)) {
    throw new Error(`Invalid health status: ${healthStatus}`);
  }

  return db.prepare(`
    SELECT *
    FROM export_oauth_tokens
    WHERE health_status = ?
    ORDER BY platform, account_label
  `).all(healthStatus);
};

/**
 * Get comprehensive health report for all tokens
 */
export const getHealthReport = () => {
  const tokens = db.prepare(`
    SELECT
      id,
      platform,
      account_type,
      account_label,
      is_active,
      health_status,
      expires_at,
      refresh_expires_at,
      last_validated_at,
      created_at,
      CASE
        WHEN datetime(expires_at) < datetime('now') THEN 'EXPIRED'
        WHEN datetime(expires_at) < datetime('now', '+1 hour') THEN 'CRITICAL'
        WHEN datetime(expires_at) < datetime('now', '+24 hours') THEN 'WARNING'
        WHEN datetime(expires_at) < datetime('now', '+48 hours') THEN 'EXPIRING'
        ELSE 'OK'
      END as expiry_urgency
    FROM export_oauth_tokens
    ORDER BY
      CASE health_status
        WHEN 'expired' THEN 1
        WHEN 'revoked' THEN 2
        WHEN 'expiring' THEN 3
        WHEN 'healthy' THEN 4
        WHEN 'unknown' THEN 5
      END,
      platform,
      is_active DESC
  `).all();

  // Group by platform
  const byPlatform = tokens.reduce((acc, token) => {
    if (!acc[token.platform]) {
      acc[token.platform] = [];
    }
    acc[token.platform].push(token);
    return acc;
  }, {});

  // Calculate summary statistics
  const summary = {
    total: tokens.length,
    healthy: tokens.filter(t => t.health_status === HealthStatus.HEALTHY).length,
    expiring: tokens.filter(t => t.health_status === HealthStatus.EXPIRING).length,
    expired: tokens.filter(t => t.health_status === HealthStatus.EXPIRED).length,
    revoked: tokens.filter(t => t.health_status === HealthStatus.REVOKED).length,
    unknown: tokens.filter(t => t.health_status === HealthStatus.UNKNOWN).length,
    needsRefresh: tokens.filter(t =>
      t.expiry_urgency === 'WARNING' || t.expiry_urgency === 'CRITICAL'
    ).length,
    platforms: {
      spotify: byPlatform.spotify?.length || 0,
      tidal: byPlatform.tidal?.length || 0,
      apple: byPlatform.apple?.length || 0,
      youtube_music: byPlatform.youtube_music?.length || 0
    }
  };

  return {
    summary,
    tokens,
    byPlatform
  };
};

export default {
  HealthStatus,
  calculateHealthStatus,
  updateTokenHealth,
  refreshAllTokenHealthStatuses,
  validateTokenWithAPI,
  getTokensNeedingRefresh,
  getTokensByHealthStatus,
  getHealthReport
};
