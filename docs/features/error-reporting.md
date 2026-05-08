# Error Reporting System

The error reporting system captures uncaught exceptions, unhandled promise rejections, and worker failures. Errors are classified, stored in the database, and high-severity errors trigger Slack alerts. The admin dashboard displays errors with suggested remediation scripts.

## Architecture

Errors flow through three layers: capture, classification, and notification. The PM2 error handler captures process-level errors before the process exits. The error report service classifies errors and stores them in the database. The alert service sends Slack notifications for high-severity errors with cooldown periods to prevent spam.

## Error Capture

The PM2 error handler (`server/utils/pm2ErrorHandler.js`) registers process-level event listeners. It must be imported first in `server/index.js` before other modules load. Uncaught exceptions are captured with CRITICAL severity. Unhandled promise rejections are captured with HIGH severity. Both allow a 1-second grace period for error logging before process exit.

Workers call `captureWorkerError()` from the error handler utility. This function wraps error context with worker name and job details. Workers catch errors in try-catch blocks and call this function before re-throwing.

## Error Classification

The error report service (`server/services/errorReportService.js`) classifies errors using pattern matching on error messages and context. Classification determines the error category and suggests a remediation script.

Pattern matching checks error messages for keywords:
- "import" and "lock" → STALE_IMPORT_LOCK → RELEASE_IMPORT_LOCKS
- "token" and ("expired" or "401") → TOKEN_EXPIRED → REFRESH_TOKENS
- "export" and "stuck" → STALLED_EXPORT → RESET_EXPORTS
- Worker context and "timeout" → WORKER_TIMEOUT → CHECK_WORKER_HEALTH
- "SQLITE" or "database" → DATABASE_ERROR → CHECK_DATABASE
- No match → UNKNOWN → no suggested fix

Classification happens synchronously during error capture. The suggested fix script name is stored with the error report.

## Deduplication

The system deduplicates errors within a 5-minute window. When an error is captured, the service checks for existing reports with the same classification and error message in the last 5 minutes. If found, it increments the occurrence count and updates the last_seen_at timestamp instead of creating a new report.

This prevents database bloat from repeated errors and groups related occurrences. The occurrence count helps identify frequently recurring issues.

## Database Storage

Error reports are stored in the `error_reports` table. The table tracks error type, classification, severity, message, stack trace, context data, suggested fix, fix application status, and resolution status.

Context data is stored as JSON. This includes worker names, playlist IDs, request IDs, and other relevant metadata. The JSON format allows flexible context storage without schema changes.

The table indexes on severity and resolved status for efficient querying. Unresolved errors are sorted by severity priority (CRITICAL, HIGH, MEDIUM, LOW) then by last seen timestamp.

## Slack Alerts

The error alert service (`server/services/errorAlertService.js`) sends Slack notifications for HIGH and CRITICAL severity errors. It uses the existing SlackNotificationService with formatted blocks including error details, severity, occurrence count, and suggested fix.

A 10-minute cooldown prevents duplicate alerts for the same error classification. The cooldown is tracked in memory per classification name. This reduces Slack noise while ensuring new error types are immediately notified.

Alerts include a button linking to the admin dashboard error reports page. The button URL uses the BASE_URL or PUBLIC_URL environment variable.

## Rectification Scripts

Rectification scripts (`server/services/rectificationScripts.js`) are executable functions that fix common error conditions. Each script has a name, risk level, and execute function.

Scripts are defined as objects with:
- `name`: Human-readable name
- `risk`: LOW, MEDIUM, or HIGH
- `execute()`: Async function that performs the fix

Available scripts:
- RELEASE_IMPORT_LOCKS: Releases stale import locks older than expiration time
- RESET_EXPORTS: Resets exports stuck in processing state for over 30 minutes
- CHECK_DATABASE: Runs SQLite integrity checks and reports database health
- REFRESH_TOKENS: Placeholder for token refresh (requires manual intervention)
- CHECK_WORKER_HEALTH: Identifies stale worker heartbeats

Script execution is audit logged via the audit logger. The error report is updated with fix_applied status and fix_result JSON. MEDIUM risk scripts require explicit confirmation from the admin user.

## Admin API

The admin API (`server/api/admin/errorReports.js`) provides endpoints for viewing and managing error reports. All endpoints require admin authentication via the authMiddleware and requireAdmin middleware.

GET `/api/v1/admin/error-reports` returns unresolved errors sorted by severity. GET `/api/v1/admin/error-reports/:id` returns a single error report with parsed context and fix result. POST `/api/v1/admin/error-reports/:id/fix` executes the suggested fix script. POST `/api/v1/admin/error-reports/:id/resolve` marks an error as resolved.

The fix endpoint validates that a suggested fix exists, hasn't been applied, and checks risk level for confirmation requirements. Script execution results are stored in the error report.

## Admin Dashboard

The error report dashboard component (`src/modules/admin/components/ErrorReportDashboard.jsx`) displays unresolved errors in a table. It shows severity, classification, message preview, occurrence count, last seen timestamp, and action buttons.

The component loads errors on mount and refreshes after actions. It uses the authenticated API hook for secure requests. Error messages are truncated to 80 characters with ellipsis.

Actions available:
- Apply Fix: Executes the suggested rectification script
- Details: Links to error detail page (not yet implemented)
- Resolve: Marks error as resolved without applying a fix

The dashboard is lazy-loaded in the Admin tab as a sub-tab. It appears after the Overview sub-tab.

## Worker Integration

Workers integrate error capture by importing `captureWorkerError` from the PM2 error handler utility. Errors are captured in catch blocks with worker-specific context.

The DSP export worker captures errors during export processing with playlist ID and platform context. The linking worker captures errors during track linking with batch size and worker ID context. The token refresh worker captures errors during token refresh cycles.

Error capture is wrapped in try-catch to prevent error reporting failures from breaking worker execution. Workers continue processing after capturing errors.

## Migration

The database migration (`server/database/migrations/054_error_reports.js`) creates the error_reports table with required columns and indexes. The migration follows the standard pattern with up and down functions.

The table schema includes:
- Primary key ID
- Error type and classification
- Severity level
- Error message and stack trace
- Context data as JSON text
- Suggested fix script name
- Fix application status and result
- Resolution status
- Occurrence count
- Timestamps for first seen, last seen, and creation

Indexes are created on severity/resolved for query performance and on classification for deduplication lookups.

## Configuration

Error reporting is configured via environment variables in `ecosystem.config.cjs`:
- ERROR_REPORTING_ENABLED: Enable or disable error reporting (default: true)
- ERROR_ALERT_COOLDOWN_MS: Cooldown period for Slack alerts (default: 600000, 10 minutes)
- ERROR_DEDUPLICATION_WINDOW_MS: Window for deduplication (default: 300000, 5 minutes)
- ERROR_RETENTION_DAYS: Days to retain error reports (default: 90)

The PM2 configuration includes kill_timeout of 5000ms to allow error handlers time to save errors before process exit.

## Testing

The test script (`server/dev/test-error-reporting.js`) triggers various error types to verify the system. It can test individual error types or run all tests sequentially.

Test error types include stale locks, token expiration, stalled exports, worker timeouts, database errors, and uncaught exceptions. The script captures errors via the error report service and verifies classification and storage.

Run tests with `npm run test:errors [error-type]` or `npm run test:errors:all` for all types. After running tests, verify errors appear in the admin dashboard and check Slack for high-severity alerts.







