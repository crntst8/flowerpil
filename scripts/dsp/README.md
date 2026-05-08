# DSP Automation CLI Tools

Command-line utilities for managing DSP integrations, OAuth tokens, and export automation.

## Overview

These scripts support the Flowerpil DSP Automation system (Phase 1: Token Management Overhaul).

**Purpose**: Provide human-friendly tooling for:
- Setting up and rotating OAuth tokens
- Checking token health and expiration
- Troubleshooting export failures
- Generating system health reports

## Available Commands

### Token Management

#### `setup-token.ts`
Interactive OAuth setup wizard for DSP platforms.

```bash
npx ts-node scripts/dsp/setup-token.ts
```

**Features**:
- Prompts for platform selection (Spotify, Apple Music, TIDAL)
- Explains required credentials and how to obtain them
- Handles OAuth flow (device code for Spotify, etc.)
- Validates scopes by hitting platform APIs
- Stores token with proper account classification

**Account types**:
- `flowerpil`: Site-wide Flowerpil-managed accounts (admin use)
- `curator`: Individual curator accounts (future feature)

---

#### `token-check.js`
Verify token health and expiration status (active + backups).

```bash
node scripts/dsp/token-check.js --platform spotify
node scripts/dsp/token-check.js --all
node scripts/dsp/token-check.js --label flowerpil-primary
node scripts/dsp/token-check.js --json --platform tidal
```

**Key options**:
- `--platform/-p <name>`: Limit to one DSP (defaults to all active tokens)
- `--label <account_label>`: Inspect a specific entry
- `--account-type <flowerpil|curator>`: Filter by owner
- `--include-inactive` or `--all`: Include backup tokens
- `--warn-hours <hours>`: Override expiry warning threshold (default 48h)
- `--json`: Emit machine-readable report for CI/observability

**Output**:
- Color-coded summary for each token (platform, label, status, expiry countdown)
- Flags for missing `expires_at`, inactive backups, refresh windows, and revoked tokens
- Exit code `0` when every inspected token is healthy, `1` when any token is missing/expiring/expired

---

#### `token-rotate.js`
Rotate primary/backup tokens for a platform.

```bash
node scripts/dsp/token-rotate.js --platform spotify --promote-backup
node scripts/dsp/token-rotate.js --platform tidal --demote-token 42
```

**Features**:
- Promotes backup token to primary
- Demotes current primary to backup
- Validates new primary before switching
- Dry-run mode available (`--dry-run`)

---

### Health & Monitoring

#### `scheduled-health-check.js`
Automated token health monitoring for production deployment.

```bash
node scripts/dsp/scheduled-health-check.js
```

**Features**:
- Validates all active tokens via API calls
- Updates health_status and last_validated_at in database
- Logs warnings for expiring tokens (< 48h)
- Logs errors for expired or revoked tokens
- Exit code 1 for critical issues, 0 otherwise

**Deployment Options**:

Option 1 - PM2 with cron pattern (recommended):
```bash
pm2 start scripts/dsp/scheduled-health-check.js \
  --name "dsp-health-check" \
  --cron "0 */6 * * *"
```

Option 2 - System cron:
```bash
# Add to crontab:
0 */6 * * * cd /var/www/flowerpil && node scripts/dsp/scheduled-health-check.js
```

**Recommended frequency**: Every 6 hours

**Output**:
- Health summary (total, healthy, expiring, expired counts)
- Per-platform status breakdown
- Critical alerts for expired/revoked tokens
- Warnings for tokens expiring within 72h
- Detailed token information with timestamps

**Status**: ✅ **Production Ready**

---

#### `health-report.js`
Generate comprehensive DSP system health report.

```bash
node scripts/dsp/health-report.js
node scripts/dsp/health-report.js --format json > health.json
node scripts/dsp/health-report.js --format markdown > health.md
```

**Includes**:
- Token status for all platforms
- Export queue depth and recent failures
- Cross-link coverage statistics
- Recommendations for action items

---

### Queue Management (Phase 2)

#### `queue-health.js`
Display export queue statistics and worker status.

```bash
node scripts/dsp/queue-health.js
```

**Output**:
- Queue depth by status (pending, in_progress, completed, failed)
- Active worker information
- Recent failures summary
- Health warnings and recommendations

**Status**: ✅ **Production Ready**

---

#### `queue-tail.js`
Display recent export request logs with detailed status information.

```bash
node scripts/dsp/queue-tail.js                    # Last 20 requests
node scripts/dsp/queue-tail.js --limit 50         # Last 50 requests
node scripts/dsp/queue-tail.js --status failed    # Only failed
node scripts/dsp/queue-tail.js --playlist 42      # Specific playlist
node scripts/dsp/queue-tail.js --since 2h         # Last 2 hours
```

**Features**:
- Human-readable status icons (⏳ pending, ⚙ in progress, ✓ completed, ✗ failed)
- Retry count and next retry time
- Platform-specific success/failure details
- Execution time and error messages
- Remediation hints for repeated failures

**Status**: ✅ **Production Ready**

---

#### `queue-replay.js`
Requeue failed or completed export requests for retry.

```bash
node scripts/dsp/queue-replay.js --request 123        # Replay specific request
node scripts/dsp/queue-replay.js --failed             # Replay all failed
node scripts/dsp/queue-replay.js --failed --dry-run  # Preview changes
```

**Features**:
- Resets request status to pending
- Preserves retry count for failed requests
- Confirmation prompt before applying changes
- Dry-run mode for preview
- Prevents replaying in-progress requests

**Status**: ✅ **Production Ready**

---

### Cross-Linking

#### `link-scan.js`
Audit cross-platform linking status for playlists/tracks.

```bash
node scripts/dsp/link-scan.js --playlist 42
node scripts/dsp/link-scan.js --playlist 42 --provider apple
node scripts/dsp/link-scan.js --missing-only
```

**Output**:
```
Playlist #42: Summer Vibes (23 tracks)

Track #101: Artist - Song Title
  ✅ Spotify: spotify:track:abc123
  ⚠️  Apple:   (low confidence match)
  ❌ TIDAL:   missing

Track #102: Artist 2 - Song 2
  ✅ Spotify: spotify:track:def456
  ✅ Apple:   https://music.apple.com/...
  ✅ TIDAL:   https://tidal.com/...

Summary:
  23 tracks total
  21 with Spotify links (91%)
  18 with Apple links (78%)
  20 with TIDAL links (87%)

Recommendations:
  💡 Rerun link resolver for Track #101 Apple link
  💡 Check TIDAL availability for Track #101
```

---

## Installation

These scripts require Node.js 18+ and access to the Flowerpil database.

**Dependencies** (already in package.json):
- `better-sqlite3` - Database access
- `chalk` - Terminal colors
- `inquirer` - Interactive prompts (for setup-token.ts)
- `@anthropic/sdk` - (if using AI-assisted diagnostics)

**No additional installation required** - scripts use existing project dependencies.

## Environment Variables

Some scripts require environment variables for OAuth operations:

```bash
# Spotify
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret

# Apple Music
APPLE_TEAM_ID=your_team_id
APPLE_KEY_ID=your_key_id
APPLE_PRIVATE_KEY_PATH=/path/to/AuthKey_KEYID.p8

# TIDAL
TIDAL_CLIENT_ID=your_client_id
TIDAL_CLIENT_SECRET=your_client_secret
```

These are loaded from `/etc/environment` in production or `ecosystem.config.cjs` in dev.

## Usage Patterns

### First-time OAuth setup

```bash
# Interactive wizard
npx ts-node scripts/dsp/setup-token.ts

# Follow prompts:
# 1. Select platform (Spotify, Apple, TIDAL)
# 2. Choose account type (flowerpil/curator)
# 3. Enter account label (e.g., "flowerpil-primary")
# 4. Complete OAuth flow in browser
# 5. Verify token works via test API call
```

### Token rotation workflow

```bash
# Check current token health
node scripts/dsp/token-check.js --platform spotify

# If expiring, set up new token as backup
npx ts-node scripts/dsp/setup-token.ts
# Choose: flowerpil account, label "flowerpil-backup"

# Promote backup to primary
node scripts/dsp/token-rotate.js --platform spotify --promote-backup

# Verify new token is active
node scripts/dsp/token-check.js --platform spotify
```

### Troubleshooting failed export

```bash
# Check queue health
node scripts/dsp/queue-health.js

# View recent failures
node scripts/dsp/queue-tail.js --status failed --since 7d

# Check specific request
node scripts/dsp/queue-tail.js --limit 100 | grep "Request #123"

# If token issue, rotate token
node scripts/dsp/token-check.js --platform spotify
npx ts-node scripts/dsp/setup-token.ts

# Replay failed request
node scripts/dsp/queue-replay.js --request 123

# Or replay all failed requests
node scripts/dsp/queue-replay.js --failed --dry-run  # Preview first
node scripts/dsp/queue-replay.js --failed            # Execute
```

### Weekly health audit

```bash
# Generate report
node scripts/dsp/health-report.js --format markdown > weekly_health.md

# Review token expiration
node scripts/dsp/token-check.js --all

# Check cross-link coverage
node scripts/dsp/link-scan.js --missing-only
```

## Development Status

| Script | Status | Phase | Notes |
|--------|--------|-------|-------|
| `scheduled-health-check.js` | ✅ Production Ready | Phase 1 | Automated token monitoring + health refresh |
| `queue-health.js` | ✅ Production Ready | Phase 2 | Queue statistics and worker status |
| `queue-tail.js` | ✅ Production Ready | Phase 2 | Export request log viewer |
| `queue-replay.js` | ✅ Production Ready | Phase 2 | Requeue failed exports |
| `setup-token.ts` | 🔄 Scaffold | Phase 1 | OAuth setup wizard |
| `token-check.js` | ✅ Production Ready | Phase 1 | Token health checker (CLI + JSON) |
| `token-rotate.js` | 🚫 Not Started | Phase 1 | Planned token rotation tool (file missing) |
| `health-report.js` | 🔄 Scaffold | Phase 1 | System health report |
| `link-scan.js` | 📋 Planned | Phase 4 | Cross-link auditing |

Legend:
- ✅ Complete and tested
- 🔄 Scaffold created, needs implementation
- 🚫 Not started
- 📋 Planned for future phase

## Testing

Each script should support `--dry-run` mode where applicable:

```bash
node scripts/dsp/token-rotate.js --platform spotify --dry-run
# Output: Would promote token #43 to primary (dry run, no changes made)
```

## Error Handling

Scripts follow these conventions:
- Exit code 0: Success
- Exit code 1: Expected failure (e.g., token expired)
- Exit code 2: Invalid arguments or usage
- Exit code 3: Database or system error

All errors print to stderr with actionable guidance:

```bash
❌ Error: Token expired 3 days ago
💡 Run: npx ts-node scripts/dsp/setup-token.ts --platform spotify
```

## Logging

Scripts log to:
- **Console**: Human-readable output with colors/emojis
- **File**: `logs/dsp-cli.log` (structured JSON for audit trail)

Example log entry:
```json
{
  "timestamp": "2025-10-22T14:32:15.123Z",
  "script": "token-check.js",
  "action": "check_token",
  "platform": "spotify",
  "token_id": 42,
  "health_status": "healthy",
  "expires_in_hours": 168
}
```

## Related Documentation

- **Implementation plan**: `llm/features/wip/dsp-automate/IMPLEMENT.json`
- **Migration guide**: `llm/features/wip/dsp-automate/MIGRATION_PLAN.md`
- **Schema reference**: `docs/features/export-request-overview.md#schema-updates-2025-10-22`
- **Operational playbooks**: `IMPLEMENT.json` → `operational_playbooks`

## Support

For issues or questions:
1. Check script's `--help` output
2. Review `IMPLEMENT.json` operational playbooks
3. Inspect `logs/dsp-cli.log` for detailed error context
4. Check token health: `node scripts/dsp/token-check.js --all`

---

**Last updated**: 2025-10-22
**Current Phase**: 2 (Export Job Automation)
**Phase 1 Status**: 90% complete (CLI OAuth flows remaining)
**Phase 2 Status**: 75% complete (Worker + CLI tools ready, monitoring in progress)
