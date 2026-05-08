# OAuth Token Auto-Refresh System

**Status:** ✅ Implemented (Issue #7 Resolution)
**Version:** 1.0
**Last Updated:** 2025-10-28

## Problem Statement

DSP OAuth tokens expire frequently:
- **Spotify:** Access tokens expire after 1 hour
- **TIDAL:** Access tokens expire after 12 hours
- **Apple Music:** Uses JWT tokens (no expiration/refresh needed)

Without automatic refresh, this requires manual re-authentication multiple times per day, disrupting export operations and causing authentication failures.

## Solution Overview

Implemented a **background token refresh worker** that:
1. Monitors token expiration times
2. Automatically refreshes tokens 24 hours before expiration
3. Updates the database with new tokens
4. Marks revoked tokens appropriately
5. Runs continuously via PM2

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                   Token Refresh System                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  tokenRefreshWorker.js (Background Process)         │   │
│  │  • Runs every 30 minutes via PM2                    │   │
│  │  • Checks for tokens expiring within 24h            │   │
│  │  • Triggers refresh cycle                           │   │
│  └──────────────┬──────────────────────────────────────┘   │
│                 │                                            │
│                 ▼                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  tokenRefreshService.js (Orchestration)             │   │
│  │  • refreshAllTokens() - Batch refresh               │   │
│  │  • refreshToken(token) - Single token refresh       │   │
│  │  • getRefreshStatus() - Status reporting            │   │
│  └──────────────┬──────────────────────────────────────┘   │
│                 │                                            │
│        ┌────────┴────────┐                                  │
│        ▼                 ▼                                  │
│  ┌─────────────┐   ┌─────────────┐                         │
│  │ Spotify     │   │ TIDAL       │                         │
│  │ Service     │   │ Service     │                         │
│  │             │   │             │                         │
│  │ • refresh   │   │ • refresh   │                         │
│  │   Access    │   │   Access    │                         │
│  │   Token()   │   │   Token()   │                         │
│  └──────┬──────┘   └──────┬──────┘                         │
│         │                 │                                  │
│         └────────┬────────┘                                  │
│                  ▼                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  export_oauth_tokens (Database)                     │   │
│  │  • access_token (updated)                           │   │
│  │  • refresh_token (updated if rotated)               │   │
│  │  • expires_at (recalculated)                        │   │
│  │  • health_status = 'healthy'                        │   │
│  │  • last_validated_at = NOW()                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Files Created/Modified

**New Files:**
- `server/services/tokenRefreshService.js` - Core refresh logic
- `server/worker/tokenRefreshWorker.js` - Background worker
- `scripts/dsp/manual-token-refresh.js` - Manual testing script
- `docs/features/token-refresh.md` - This documentation

**Modified Files:**
- `server/services/spotifyService.js` - Added `refreshAccessToken()` method
- `server/services/tidalService.js` - Added `refreshAccessToken()` method
- `ecosystem.config.cjs` - Added PM2 worker configuration
- `package.json` - Added npm scripts for worker management

## How It Works

### 1. Token Monitoring

The system uses `tokenHealthService.js` to identify tokens needing refresh:

```javascript
// Tokens expiring within 24 hours with valid refresh tokens
const tokensNeedingRefresh = getTokensNeedingRefresh();
```

**Criteria:**
- `expires_at < NOW() + 24 hours`
- `refresh_token IS NOT NULL`
- `health_status NOT IN ('revoked', 'expired')`
- `is_active = 1`

### 2. Refresh Process

For each eligible token:

**Spotify:**
```javascript
POST https://accounts.spotify.com/api/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic {base64(clientId:clientSecret)}

grant_type=refresh_token&refresh_token={refreshToken}
```

**TIDAL:**
```javascript
POST https://auth.tidal.com/v1/oauth2/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic {base64(clientId:clientSecret)}

grant_type=refresh_token&refresh_token={refreshToken}
```

**Response (both platforms):**
```json
{
  "access_token": "new_access_token",
  "refresh_token": "new_refresh_token_or_same",
  "expires_in": 3600,
  "scope": "..."
}
```

### 3. Database Update

After successful refresh:

```sql
UPDATE export_oauth_tokens
SET access_token = ?,
    refresh_token = ?,
    expires_at = ?,
    health_status = 'healthy',
    last_validated_at = NOW(),
    updated_at = NOW()
WHERE id = ?
```

### 4. Error Handling

**Revoked Tokens:**
```javascript
if (error.response?.status === 400 && error.data?.error === 'invalid_grant') {
  // Mark token as revoked
  updateTokenHealth(tokenId, 'revoked');
}
```

**Network Errors:**
- Logged but don't stop worker
- Will retry on next cycle (30 minutes)

## Usage

### Development

**Start the worker:**
```bash
npm run worker:token-refresh
```

**View logs:**
```bash
npm run worker:token-refresh:logs
```

**Stop the worker:**
```bash
npm run worker:token-refresh:stop
```

### Production

The worker is automatically started with PM2:

```bash
# On production server
cd /var/www/flowerpil
source /etc/environment
pm2 start ecosystem.config.cjs --env production --only token-refresh-worker
```

**Monitor in production:**
```bash
pm2 logs token-refresh-worker
pm2 status token-refresh-worker
```

### Manual Testing

**Show token status:**
```bash
node scripts/dsp/manual-token-refresh.js --status-only
```

**Manually trigger refresh:**
```bash
node scripts/dsp/manual-token-refresh.js
```

**Force refresh (testing):**
```bash
node scripts/dsp/manual-token-refresh.js --force
```

## Configuration

### Worker Settings

Edit `server/worker/tokenRefreshWorker.js`:

```javascript
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // How often to check (30 min)
const INITIAL_DELAY_MS = 5 * 1000;          // Delay before first run (5 sec)
```

### Refresh Threshold

Edit `server/services/tokenHealthService.js`:

```javascript
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // When to refresh (24h before expiry)
```

## Monitoring

### Worker Logs

The worker provides detailed logging:

```
═══════════════════════════════════════════════════════════
[TOKEN_REFRESH_WORKER] Starting refresh cycle at 2025-10-28T10:30:00.000Z
═══════════════════════════════════════════════════════════
[TOKEN_REFRESH_WORKER] Step 1: Updating token health statuses...
[TOKEN_REFRESH_WORKER] Health status update: 2 updated, 3 unchanged
[TOKEN_REFRESH_WORKER] Step 2: Refreshing tokens...
[TOKEN_REFRESH_WORKER] Found 2 token(s) eligible for refresh

[TOKEN_REFRESH] Attempting refresh for spotify token (ID: 5, Label: flowerpil-primary)
🎵 SPOTIFY: Refreshing access token...
🎵 SPOTIFY: Token refresh successful
[TOKEN_REFRESH] ✓ Spotify token 5 refreshed successfully (expires: 2025-10-28T14:30:00.000Z)

───────────────────────────────────────────────────────────
[TOKEN_REFRESH_WORKER] Refresh cycle complete
  Duration: 2341ms
  Total tokens checked: 2
  Successfully refreshed: 2
  Failed: 0
  Skipped: 0
───────────────────────────────────────────────────────────
```

### Status Report

Use the manual script to get a detailed status report:

```bash
node scripts/dsp/manual-token-refresh.js --status-only
```

Output:
```
═══════════════════════════════════════════════════════════════════════════
                            TOKEN STATUS REPORT
═══════════════════════════════════════════════════════════════════════════

  SPOTIFY:
  ─────────────────────────────────────────────────────────────────────────
     ✓ [flowerpil ] flowerpil-primary          expires: 23h 45m     | refresh: ✓
  ⚠️  NEEDS REFRESH ⚠ [curator  ] curator-jdoe-primary       expires: 0h 15m      | refresh: ✓

  TIDAL:
  ─────────────────────────────────────────────────────────────────────────
     ✓ [flowerpil ] flowerpil-primary          expires: 11h 30m     | refresh: ✓

  Summary:
  ─────────────────────────────────────────────────────────────────────────
    Total active tokens: 3
    Healthy: 2
    Expiring: 1
    Expired: 0
    Revoked: 0
    Needs refresh: 1
```

## Troubleshooting

### Token Marked as Revoked

**Symptoms:**
- Token shows `health_status = 'revoked'` in database
- Exports fail with authentication errors

**Causes:**
- User revoked access via DSP platform
- Invalid refresh token
- App credentials changed

**Resolution:**
1. Re-authenticate the DSP account (admin or curator)
2. New token will replace revoked one
3. Worker will maintain new token automatically

### Worker Not Running

**Check status:**
```bash
pm2 status token-refresh-worker-dev
```

**Restart worker:**
```bash
npm run worker:token-refresh:stop
npm run worker:token-refresh
```

**Check logs for errors:**
```bash
npm run worker:token-refresh:logs
```

### Refresh Failing

**Check database credentials:**
```sql
SELECT platform, account_label,
       expires_at, refresh_token IS NOT NULL as has_refresh
FROM export_oauth_tokens
WHERE is_active = 1;
```

**Verify DSP credentials in environment:**
```bash
echo $SPOTIFY_CLIENT_ID
echo $SPOTIFY_CLIENT_SECRET
echo $TIDAL_CLIENT_ID
echo $TIDAL_CLIENT_SECRET
```

**Test manually:**
```bash
node scripts/dsp/manual-token-refresh.js
```

## Security Considerations

### Refresh Token Storage

- Refresh tokens stored in `export_oauth_tokens.refresh_token`
- Database should be encrypted at rest
- Access restricted to application processes only

### Token Rotation

- Some platforms rotate refresh tokens on each use
- System handles both scenarios:
  - **New refresh token returned:** Updates database
  - **No refresh token returned:** Keeps existing one

### Rate Limiting

- 1-second delay between token refreshes
- Prevents DSP API rate limiting
- Configurable in `tokenRefreshService.js`

## Future Enhancements

### Phase 1 (Current)
- ✅ Automatic token refresh for Spotify & TIDAL
- ✅ Background worker with PM2
- ✅ Health status tracking
- ✅ Manual testing tools

### Phase 2 (Planned)
- [ ] Slack notifications for refresh failures
- [ ] Admin dashboard widget showing token health
- [ ] Metrics/statistics collection
- [ ] Multiple backup tokens per platform

### Phase 3 (Future)
- [ ] Predictive refresh based on usage patterns
- [ ] Token refresh API endpoint for manual triggering
- [ ] Integration with monitoring systems (Datadog, etc.)

## Related Documentation

- [Export Request System](./export.md) - Uses these tokens for playlist exports
- [OAuth Tokens v2 Migration](../server/database/migrations/042_oauth_tokens_v2.js)
- [Token Health Service](../server/services/tokenHealthService.js)
- [DSP Services](../server/services/) - Spotify, TIDAL services

## Support

For issues or questions:
1. Check worker logs: `npm run worker:token-refresh:logs`
2. Run manual test: `node scripts/dsp/manual-token-refresh.js --status-only`
3. Check database: Query `export_oauth_tokens` table
4. Verify environment variables are set
5. Report issue on GitHub with logs

---

**Implemented:** 2025-10-28
**Issue:** #7 - DSP-Auth Automation: autofill creds for token extension?
**Author:** Claude Code
**Status:** ✅ Production Ready
