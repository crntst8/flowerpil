# Slack Bot System

## Purpose

Routes different notification types to dedicated Slack bots based on category. Provides modular bot configuration for local development and production deployment. Handles error reporting with specific formatting and exclusion logic for domain-specific notifications.

## How It Works

The Slack bot system loads bot configurations from `.env.slack` (local development) or environment variables (production). The `slackBotLoader` (`server/utils/slackBotLoader.js`) reads the configuration file if present, parsing lines in `KEY=VALUE` format and returning bot configuration objects with AppId, ClientId, ClientSecret, AccessToken, RefreshToken, and ChannelId for each bot type.

Five bot types are supported: ERROR_REPORTING for user and system errors, SPOTIFY for curator onboarding requests, APPLE_EXPORT for Apple Music notifications, DEPLOYMENT for CI/CD updates, and SYSTEM_ALERTS for health monitoring. Each bot type uses standardized environment variable naming: `{BOT_NAME}_APP_ID`, `{BOT_NAME}_CLIENT_ID`, `{BOT_NAME}_CLIENT_SECRET`, `{BOT_NAME}_ACCESS_TOKEN`, `{BOT_NAME}_REFRESH_TOKEN`, and `{BOT_NAME}_CHANNEL_ID`.

`SlackNotificationService` (`server/services/SlackNotificationService.js`) loads bot configurations in the constructor via `getBotConfig()` and stores them as instance properties: `this.errorReportingBot`, `this.spotifyBot`, `this.appleExportBot`, `this.deploymentBot`, and `this.systemAlertsBot`. The service also loads legacy Slack configuration via `getLegacyConfig()` for backward compatibility with existing notification methods.

The `sendBotMessage()` method handles message dispatch for any bot. It checks bot configuration status and channel availability, then calls `_sendMessageWithToken()` with the bot's access token. If a token error occurs (expired or invalid token), it calls `refreshBotAccessToken()` to attempt automatic token refresh, then retries the message send.

Error reporting flows through a dedicated pathway. When `errorReportService.captureError()` captures a HIGH or CRITICAL severity error, it calls `errorAlertService.sendAlert()` with the error report object. The error alert service evaluates the error against `shouldExcludeFromErrorReporting()` to filter out DEPLOYMENT, APPLE_EXPORT, and SPOTIFY_AUTH errors which use their own notification methods.

For non-excluded errors, `errorAlertService` calls `getErrorLocation()` to extract the error origin from context fields (route, endpoint, url, workerName) or falls back to error_type. `getCuratorInfo()` parses context_data JSON to extract curator name, email, and ID fields. `interpretCause()` maps error classifications and HTTP status codes to human-readable explanations specific to each error type.

The error data is assembled into notificationData with fields: curatorName, curatorEmail, curatorId, errorLocation, errorMessage, cause, and timestamp. This calls `slackService.notifyErrorReport()` which formats the error in the required structure: Slack block format with header section, fields section containing curator info and date/time, error message wrapped in a code block, and cause explanation. Timestamp is formatted as `[xx:xxAM/PM - DD/MM]` with proper 12-hour time formatting and zero-padded date components.

If the ERROR_REPORTING bot is not configured, `notifyErrorReport()` returns null and `sendAlert()` falls back to `sendLegacyAlert()` which calls `notifySystemAlert()` to send the alert through the legacy general Slack channel.

A 10-minute cooldown per error classification prevents duplicate notifications. The cooldowns Map tracks classification names as keys and last alert timestamp as values. When `sendAlert()` is called, it checks if the classification exists in cooldowns and if the elapsed time is less than the cooldownMs duration, returning `{ skipped: true, reason: 'cooldown' }` without sending.

Existing notification methods maintain backward compatibility. `notifySpotifyAccessRequest()`, `notifyAppleExportSuccess()`, `notifyAppleResolutionFailed()`, and `notifySystemAlert()` all check for their respective bot configuration first, and if not found, fall back to legacy configuration paths. This allows gradual migration from legacy to modular bot system without disrupting existing notifications.

## Configuration

### Environment Variables

Bot credentials are configured with standardized naming for each bot type:

```
ERROR_REPORTING_APP_ID
ERROR_REPORTING_CLIENT_ID
ERROR_REPORTING_CLIENT_SECRET
ERROR_REPORTING_ACCESS_TOKEN
ERROR_REPORTING_REFRESH_TOKEN (optional)
ERROR_REPORTING_CHANNEL_ID

SPOTIFY_APP_ID
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
SPOTIFY_ACCESS_TOKEN
SPOTIFY_REFRESH_TOKEN (optional)
SPOTIFY_CHANNEL_ID

APPLE_EXPORT_APP_ID
APPLE_EXPORT_CLIENT_ID
APPLE_EXPORT_CLIENT_SECRET
APPLE_EXPORT_ACCESS_TOKEN
APPLE_EXPORT_REFRESH_TOKEN (optional)
APPLE_EXPORT_CHANNEL_ID

DEPLOYMENT_APP_ID
DEPLOYMENT_CLIENT_ID
DEPLOYMENT_CLIENT_SECRET
DEPLOYMENT_ACCESS_TOKEN
DEPLOYMENT_REFRESH_TOKEN (optional)
DEPLOYMENT_CHANNEL_ID

SYSTEM_ALERTS_APP_ID
SYSTEM_ALERTS_CLIENT_ID
SYSTEM_ALERTS_CLIENT_SECRET
SYSTEM_ALERTS_ACCESS_TOKEN
SYSTEM_ALERTS_REFRESH_TOKEN (optional)
SYSTEM_ALERTS_CHANNEL_ID
```

Legacy configuration variables are still supported for backward compatibility:

```
SLACK_ACCESS_TOKEN
SLACK_REFRESH_TOKEN
SLACK_CLIENT_ID
SLACK_CLIENT_SECRET
SLACK_CHANNEL_ID
SLACK_ALERT_CHANNEL_ID (overrides default channel for system alerts)
SLACK_CURATOR_ACTIONS_CHANNEL_ID (overrides default channel for curator actions)
SLACK_NOTIFICATIONS_ENABLED (default: true)
```

### .env.slack File

Local development uses `.env.slack` file in the project root. The file structure mirrors environment variable naming with comments describing each bot's purpose:

```
# ERROR_REPORTING BOT
# Used for: User errors, increased latency, server errors
ERROR_REPORTING_APP_ID=APPID_REDACTED
ERROR_REPORTING_CLIENT_ID=CLIENTID_REDACTED
ERROR_REPORTING_CLIENT_SECRET=CLIENTSECRET_REDACTED
ERROR_REPORTING_ACCESS_TOKEN=xoxb-***redacted***
ERROR_REPORTING_CHANNEL_ID=YOUR_CHANNEL_ID

# SPOTIFY BOT
# Used for: Spotify access requests during curator onboarding
SPOTIFY_APP_ID=
SPOTIFY_CLIENT_ID=
...
```

The `.env.slack` file is gitignored to prevent credential leakage while allowing local development configuration. Production uses environment variables set via `/etc/environment` or deployment configuration management.

## API/Interface

### Error Reporting

Error notifications are triggered automatically when `errorReportService.captureError()` is called with severity HIGH or CRITICAL. No explicit API call is required.

### Admin Testing Endpoint

```
POST /api/v1/admin/site-admin/test-slack-notification
```

Tests individual Slack notification types from the admin panel.

**Request:**
```json
{
  "notificationType": "error_report"
}
```

Valid notificationTypes: `error_report`, `spotify_access_request`, `apple_export_success`, `apple_resolution_failed`, `system_alert`

**Response:**
```json
{
  "success": true,
  "notificationType": "error_report",
  "testData": {
    "curatorName": "Test Curator",
    "curatorEmail": "test@example.com",
    "curatorId": 999,
    "errorLocation": "/api/v1/playlists",
    "errorMessage": "Test error occurred during playlist export",
    "cause": "External API timeout - Spotify API took longer than 30 seconds to respond",
    "timestamp": "2025-01-15T10:30:00.000Z"
  },
  "result": {
    "ok": true,
    "ts": "1234567890.000100",
    "channel": "YOUR_CHANNEL_ID",
    "message": {}
  },
  "message": "Test notification sent successfully"
}
```

If bot is not configured:
```json
{
  "success": true,
  "notificationType": "error_report",
  "result": null,
  "message": "Notification method returned null (may not be configured)"
}
```

### SlackNotificationService Methods

**notifyErrorReport:**
```javascript
notifyErrorReport({
  curatorName,      // string or null - extracted from context
  curatorEmail,     // string or null - extracted from context
  curatorId,        // number or null - extracted from context
  errorLocation,    // string - route, endpoint, or error type
  errorMessage,     // string - actual error message
  cause,            // string - human-readable cause interpretation
  timestamp         // Date or ISO string - when error occurred
})
// Returns: Promise<Object|null> - Slack API response or null if bot not configured
```

**notifySpotifyAccessRequest:**
```javascript
notifySpotifyAccessRequest({
  curatorName,      // string
  curatorEmail,     // string
  spotifyEmail,     // string
  curatorId         // number
})
// Returns: Promise<Object|null> - uses SPOTIFY bot or legacy config
```

**notifyAppleExportSuccess:**
```javascript
notifyAppleExportSuccess({
  playlistId,       // string
  playlistTitle,    // string
  curatorName,      // string
  appleLibraryId,   // string
  storefront        // string (default 'us')
})
// Returns: Promise<Object|null> - uses APPLE_EXPORT bot or legacy config
```

**notifyAppleResolutionFailed:**
```javascript
notifyAppleResolutionFailed({
  playlistId,       // string
  playlistTitle,    // string
  attempts,         // number
  error             // string
})
// Returns: Promise<Object|null> - uses APPLE_EXPORT bot or legacy config
```

**notifySystemAlert:**
```javascript
notifySystemAlert({
  severity,         // 'critical' | 'warning' | 'info'
  text,             // string - alert message
  blocks            // Slack block format (optional)
})
// Returns: Promise<Object|null> - uses SYSTEM_ALERTS bot or legacy config
```

**sendBotMessage:**
```javascript
sendBotMessage(
  bot,              // bot config object from getBotConfig()
  botName,          // string - name for logging
  text,             // string - message text
  blocks,           // Slack block array (optional)
  options           // { channelId: string } (optional)
)
// Returns: Promise<Object|null> - Slack API response
```

**refreshBotAccessToken:**
```javascript
refreshBotAccessToken(
  bot,              // bot config object
  botName           // string - name for logging
)
// Returns: Promise<string> - new access token
// Throws: Error if refresh fails
```

### slackBotLoader Functions

**getBotConfig:**
```javascript
getBotConfig(botName)
// Returns: Object | null
// {
//   appId: string,
//   clientId: string,
//   clientSecret: string,
//   accessToken: string,
//   refreshToken: string | null,
//   channelId: string,
//   isConfigured: boolean
// }
```

**getLegacyConfig:**
```javascript
getLegacyConfig()
// Returns: Object | null
// {
//   appId: string,
//   clientId: string,
//   clientSecret: string,
//   accessToken: string,
//   refreshToken: string | null,
//   channelId: string,
//   alertChannelId: string | null,
//   curatorActionsChannelId: string | null,
//   spotifyBot: { ... }
// }
```

**getAllBots:**
```javascript
getAllBots()
// Returns: Object - { ERROR_REPORTING: {...}, SPOTIFY: {...}, ... }
```

**isBotConfigured:**
```javascript
isBotConfigured(botName)
// Returns: boolean
```

### errorAlertService Methods

**sendAlert:**
```javascript
sendAlert(errorReport)
// errorReport: { id, error_type, classification, severity, error_message,
//                error_stack, context_data, last_seen_at, ... }
// Returns: Promise<Object>
// { sent: true } | { sent: false, error } | { skipped: true, reason: 'cooldown'|'uses_dedicated_bot' }
```

**getErrorLocation:**
```javascript
getErrorLocation(errorReport)
// Returns: string - extracted from context or falls back to error_type
```

**getCuratorInfo:**
```javascript
getCuratorInfo(errorReport)
// Returns: { curatorName, curatorEmail, curatorId }
```

**interpretCause:**
```javascript
interpretCause(errorReport)
// Returns: string - human-readable explanation based on classification
```

**shouldExcludeFromErrorReporting:**
```javascript
shouldExcludeFromErrorReporting(errorReport)
// Returns: boolean - true if error uses dedicated bot
```

## Database

No new database tables are created for the Slack bot system. Bot configuration and error alerts use existing tables.

### Referenced Tables

**error_reports** - Stores captured errors with severity levels

Schema: `server/database/migrations/` (error_reports table)

**Columns used:**
- classification (error type like STALE_IMPORT_LOCK, TOKEN_EXPIRED)
- severity (CRITICAL, HIGH, MEDIUM, LOW)
- error_message (the error message text)
- error_stack (stack trace)
- error_type (UNCAUGHT_EXCEPTION, WORKER_FAILURE, etc.)
- context_data (JSON string with additional context)
- last_seen_at (timestamp of most recent occurrence)

## Integration Points

### Internal Dependencies

- **errorReportService** (`server/services/errorReportService.js`) - Triggers error alert flow via `errorAlertService.sendAlert()`
- **systemHealthMonitor** (`server/services/systemHealthMonitor.js`) - Calls `notifySystemAlert()` for health alerts
- **slackBotLoader** (`server/utils/slackBotLoader.js`) - Provides bot configuration loading
- **logger** (`server/utils/logger.js`) - Logs bot operations and errors
- **getDatabase** (`server/database/db.js`) - Database access for error reporting

### External Dependencies

- **axios** - HTTP client for Slack API calls
- **Slack Web API** - OAuth endpoints and chat.postMessage

### Service Registration

SlackNotificationService is imported and used in:
- `server/services/errorAlertService.js` - Error notification routing
- `server/services/systemHealthMonitor.js` - System alert notifications
- `server/api/admin/siteAdmin.js` - Admin testing endpoint
- Various DSP and export services for status notifications

### Admin UI Integration

Slack notification tester appears in `src/modules/admin/components/SlackNotificationTester.jsx` with buttons for each notification type. Test results display success/error status and Slack response details (channel, timestamp).

## Usage Examples

### Testing Error Report Notification

From admin panel at `/admin`:

1. Navigate to System Settings > Slack Notifications
2. Click "Error Report" button to test ERROR_REPORTING bot configuration
3. Verify message appears in configured Slack channel with proper formatting

### Capturing an Error with Context

From `server/utils/pm2ErrorHandler.js`:

```javascript
import { errorReportService } from '../services/errorReportService.js';

process.on('uncaughtException', async (error, origin) => {
  await errorReportService.captureError({
    type: 'UNCAUGHT_EXCEPTION',
    error,
    severity: 'CRITICAL',
    context: { origin, pid: process.pid }
  });
});
```

### Error Reporting with Curator Context

From export workflow:

```javascript
await errorReportService.captureError({
  type: 'WORKER_FAILURE',
  error: new Error('Export timed out'),
  severity: 'HIGH',
  context: {
    workerName: 'apple-export-worker',
    curatorId: 123,
    curatorName: 'Jane Doe',
    curatorEmail: 'jane@example.com',
    playlistId: 'playlist-456'
  }
});
```

The error alert service extracts curator info and formats the notification automatically.

### Loading Bot Configuration

From `server/services/SlackNotificationService.js`:

```javascript
import { getBotConfig } from '../utils/slackBotLoader.js';

class SlackNotificationService {
  constructor() {
    this.errorReportingBot = getBotConfig('ERROR_REPORTING');
    this.spotifyBot = getBotConfig('SPOTIFY');
    // ... load other bots
  }
}
```

### Token Refresh

When a token expires, automatic refresh occurs in `sendBotMessage()`:

```javascript
async sendBotMessage(bot, botName, text, blocks) {
  try {
    return await this._sendMessageWithToken(bot.accessToken, text, blocks, channel);
  } catch (error) {
    if (this._isTokenError(error)) {
      const newToken = await this.refreshBotAccessToken(bot, botName);
      return await this._sendMessageWithToken(newToken, text, blocks, channel);
    }
    throw error;
  }
}
```

Logs contain instructions for manually updating environment variables with the new token.

### Excluding Domain-Specific Errors

From `errorAlertService.js`:

```javascript
if (this.shouldExcludeFromErrorReporting(errorReport)) {
  return { skipped: true, reason: 'uses_dedicated_bot' };
}
```

Errors with classification APPLE_EXPORT or SPOTIFY_AUTH are skipped, allowing their dedicated bots to handle them via `notifyAppleExportSuccess()` or `notifySpotifyAccessRequest()`.

### Cooldown Prevention

From `errorAlertService.js`:

```javascript
const key = errorReport.classification;
if (this.cooldowns.has(key)) {
  const lastAlert = this.cooldowns.get(key);
  if (Date.now() - lastAlert < this.cooldownMs) {
    return { skipped: true, reason: 'cooldown' };
  }
}

// ... send alert ...

this.cooldowns.set(key, Date.now());
```

A 10-minute cooldown prevents repeated notifications for the same error classification.
