# Logging

## Architecture

The logging system combines a custom logger (`server/utils/logger.js`) with pino for structured JSON output. All logs write to both files and stdout/stderr, with different formatting for development and production.

### Core Components

**Logger Singleton** (`server/utils/logger.js`)
- Hybrid logger wrapping pino with custom file-based logging
- Five specialized log files: `api.log`, `database.log`, `curator.log`, `error.log`, `debug.log`
- In-memory pino instance for structured console output
- Log level filtering based on `LOG_LEVEL` environment variable

**Request Tracing** (`server/middleware/pinoHttp.js`, `server/utils/requestContext.js`)
- pino-http middleware generates unique request IDs via UUID
- AsyncLocalStorage maintains request context across async operations
- Request IDs propagate through all logs within a request lifecycle

**Log Buffer** (`server/utils/logBuffer.js`)
- In-memory circular buffer holding last 5000 log entries (configurable via `LOG_BUFFER_SIZE`)
- Enables runtime log querying via `getLogEntries()` and `getLatestLogEntries()`
- Queryable by request ID, timestamp range

## Log Levels

The logger uses a custom hierarchy alongside pino's standard levels:

```
ERROR (0) > WARN (1) > INFO/SUCCESS (2) > DEBUG (3)
```

Environment-based defaults:
- Production: `ERROR` (only errors logged)
- Development: `DEBUG` (all logs)

Override via `LOG_LEVEL` environment variable with values: `ERROR`, `WARN`, `INFO`, `SUCCESS`, `DEBUG`.

## Request Context

`requestContextMiddleware` (server/utils/requestContext.js:47) runs on every request and:
1. Extracts or generates request ID from `X-Request-ID` header
2. Stores context in AsyncLocalStorage: `requestId`, `method`, `route`, `user`, `metadata`
3. Sets `X-Request-ID` response header
4. Injects `request_id` into all JSON responses

Access context anywhere in request lifecycle:

```javascript
import { getRequestContext, setRequestUser, appendRequestMetadata } from './utils/requestContext.js';

const context = getRequestContext();
// { requestId, method, route, user, metadata, startTime }

setRequestUser({ id: 123, username: 'curator' });
appendRequestMetadata({ action: 'playlist_create' });
```

## Pino Integration

`pinoHttpMiddleware` (server/middleware/pinoHttp.js:6) logs all HTTP requests with structured data:

- Request method, URL, query params, headers
- Response status code, duration
- Custom log levels: 5xx → error, 4xx → warn, 3xx/2xx → info
- Auto-suppression of high-frequency endpoints: `/api/v1/cross-platform/lease`, `/api/v1/cross-platform/heartbeat`, `/api/v1/cross-platform/stats`

Production logs output as JSON. Development uses pino-pretty for human-readable formatting.

## Logger Methods

### General Logging

```javascript
import logger from './utils/logger.js';

logger.info('COMPONENT_NAME', 'Message', { optional: 'data' });
logger.warn('COMPONENT_NAME', 'Warning message', { details });
logger.error('COMPONENT_NAME', 'Error message', errorObject, { context });
logger.debug('COMPONENT_NAME', 'Debug info', { verbose: true });
logger.success('COMPONENT_NAME', 'Success message', { result });
```

All methods accept:
1. Component name (uppercase with underscores, e.g., `SPOTIFY_AUTH`, `DB_QUERY`)
2. Message string
3. Error object (error method only, third parameter)
4. Data object with contextual information

### API Logging

```javascript
logger.apiRequest(method, url, params, body);
logger.apiResponse(method, url, statusCode, responseData, durationMs);
```

`apiRequest` and `apiResponse` write to `api.log`. Response logging auto-determines level:
- 5xx → ERROR
- 4xx → ERROR
- 3xx → WARN
- 2xx → SUCCESS

### Database Logging

```javascript
logger.dbQuery(sql, params, durationMs);
logger.dbError(sql, error, params);
```

Writes to `database.log`. All errors also duplicate to `error.log`.

### Curator Operations

```javascript
logger.curatorOperation(operation, curatorName, data);
logger.curatorError(operation, curatorName, error, data);
```

Writes to `curator.log` for curator-specific actions.

### Child Loggers

Create contextual child loggers with persistent bindings:

```javascript
const childLogger = logger.child({ playlistId: 123, platform: 'spotify' });
childLogger.info('EXPORT', 'Starting export');
// Automatically includes playlistId and platform in all logs
```

## Log Entry Structure

Every log entry contains:

```json
{
  "timestamp": "2025-01-15T10:30:45.123+11:00 AEDT",
  "iso_timestamp": "2025-01-15T10:30:45.123Z",
  "ts": 1736901045123,
  "level": "INFO",
  "component": "SPOTIFY_AUTH",
  "message": "Token exchange successful",
  "msg": "Token exchange successful",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "route": "/api/v1/auth/spotify/callback",
  "method": "POST",
  "user_id": 42,
  "tester": false,
  "service": "flowerpil-api",
  "env": "production",
  "pid": 12345,
  "data": { "additional": "context" }
}
```

Fields automatically populated from request context when available.

## Specialized Logging

### Audit Logging

`auditLogger` (server/utils/auditLogger.js) tracks administrative actions to the `audit_logs` database table.

```javascript
import { logPlaylistChange } from './utils/auditLogger.js';

logPlaylistChange({
  userId: 42,
  username: 'curator',
  playlistId: 100,
  action: 'update',
  oldValues: { title: 'Old Title', published: false },
  newValues: { title: 'New Title', published: true },
  req
});
```

Stores full before/after snapshots plus field-level diffs. Captures IP, user agent, endpoint, session ID, request ID from request object.

### Security Logging

`securityLogger` (server/utils/securityLogger.js) logs authentication and security events to `security_events` table.

```javascript
import { logSecurityEvent, SECURITY_EVENTS } from './utils/securityLogger.js';

await logSecurityEvent(SECURITY_EVENTS.LOGIN_SUCCESS, {
  ip: req.ip,
  userId: user.id,
  username: user.username,
  userAgent: req.get('user-agent'),
  endpoint: req.originalUrl,
  details: { twoFactorUsed: false }
});
```

Available events: `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOGOUT`, `PASSWORD_CHANGE`, `RATE_LIMIT_EXCEEDED`, `CSRF_TOKEN_MISMATCH`, `SUSPICIOUS_ACTIVITY`, `ADMIN_ACTION`, etc.

## Log Files

All log files write to `logs/` directory with append-only streams:

- **api.log**: All HTTP requests/responses
- **database.log**: SQL queries, DB errors
- **curator.log**: Curator-specific operations
- **error.log**: All errors from any component
- **debug.log**: Info, warn, debug, success messages

Errors always write to both their specific log file and `error.log`.

## Development vs Production

### Development
- Pino outputs via pino-pretty with color, timestamps, formatted JSON
- Console logs show colored output with Melbourne timezone
- Log level defaults to DEBUG (all logs visible)
- Cross-platform stats endpoints still suppressed to reduce noise

### Production
- Pino outputs raw JSON to stdout (PM2/systemd capture)
- File logs continue writing to `logs/` directory
- Log level defaults to ERROR (only errors)
- Set `LEGACY_CONSOLE_LOGS=true` to enable old-style colored console output
- All logs include `service`, `env`, `pid` fields for aggregation

## Environment Variables

- `LOG_LEVEL`: Override log level (ERROR, WARN, INFO, DEBUG)
- `LOG_BUFFER_SIZE`: In-memory buffer size (default: 5000)
- `NODE_ENV`: Determines pretty-printing (development) vs JSON (production)
- `LEGACY_CONSOLE_LOGS`: Enable colored console output in production (default: false)
- `SERVICE_NAME`: Service identifier in logs (default: flowerpil-api)

## Circuit Breaker Logging

Circuit breakers for external APIs (Spotify, TIDAL, Apple Music) log state transitions via callbacks:

```javascript
import CircuitBreaker from './utils/CircuitBreaker.js';

const breaker = CircuitBreaker.getOrCreate('spotify-api', {
  threshold: 10,
  timeout: 300000,
  onStateChange: (state, meta) => {
    if (state === 'open') {
      logger.error('CIRCUIT_SPOTIFY', 'Circuit opened', { ...meta, state });
    } else if (state === 'half_open') {
      logger.warn('CIRCUIT_SPOTIFY', 'Circuit half-open', { ...meta, state });
    } else {
      logger.info('CIRCUIT_SPOTIFY', 'Circuit closed', { ...meta, state });
    }
  }
});
```

State transitions (CLOSED → OPEN → HALF_OPEN → CLOSED) logged with failure counts and reset timestamps.

## Querying Logs at Runtime

```javascript
import { getLogEntries, getLatestLogEntries } from './utils/logBuffer.js';

// Get last 100 logs
const recent = getLatestLogEntries(100);

// Get logs by request ID
const requestLogs = getLogEntries({
  requestId: '550e8400-e29b-41d4-a716-446655440000'
});

// Get logs in time range
const rangeLogs = getLogEntries({
  startMs: Date.now() - 60000,
  endMs: Date.now()
});
```

Useful for debugging active requests or exposing recent logs via admin API.

## Data Sanitization

Logger automatically redacts sensitive fields in request/response bodies:

`sanitizeBody()` (server/utils/logger.js:275) removes: `password`, `token`, `secret`, `key`

`sanitizeResponse()` (server/utils/logger.js:289) truncates responses over 1000 characters to prevent log bloat.

## Graceful Shutdown

Logger flushes all streams and pino logs on SIGINT/SIGTERM:

```javascript
process.on('SIGTERM', () => {
  logger.info('logger', 'Shutting down logger');
  logger.close(); // Flushes file streams and pino
  process.exit(0);
});
```

## Integration Points

**Express Middleware Stack** (server/index.js:132-136):
```javascript
app.use(requestContextMiddleware);  // Request context + ID generation
app.use(pinoHttpMiddleware);        // Structured HTTP logging
app.use(requestIdMiddleware);       // Request ID header injection
```

**Manual Request Logging** (server/index.js:157-199):
Custom middleware supplements pino-http with file-based logging and systemHealthMonitor integration.

**Error Handling** (server/middleware/logging.js:37):
`errorLoggingMiddleware` catches unhandled Express errors, logs to error component, returns sanitized error response.
