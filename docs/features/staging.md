# Staging Environment

Flowerpil runs a staging environment for testing changes before production deployment. Staging mirrors production infrastructure but uses isolated data and configuration.

For recovery and rebuild steps on the staging server, see [docs/instructions/staging-reset-guide.md](/var/www/flowerpil/docs/instructions/staging-reset-guide.md).

## Architecture Overview

**Staging** runs on the same Ubuntu server as production but with separate processes, database, and domains:
- API: `apistage.flowerpil.io` (port 3001)
- Frontend: `staging.fpil.xyz` (Cloudflare Pages)
- Database: `flowerpil-staging.db`
- Branch: `develop` (vs `master` for production)

## Infrastructure Differences

| Component | Development | Staging | Production |
|-----------|-------------|---------|-----------|
| Database | `flowerpil.db` | `flowerpil-staging.db` | `flowerpil.db` |
| API Port | 3000 | 3001 | 3000 |
| API Domain | localhost:3000 | apistage.flowerpil.io | api.flowerpil.io |
| Frontend Domain | localhost:5173 | staging.fpil.xyz | flowerpil.io |
| Process Manager | Optional | PM2 with `--env staging` | PM2 with `--env production` |
| Frontend Deployment | Dev server | Cloudflare Pages (flowerpil-staging) | Cloudflare Pages (flowerpil) |
| Secrets Source | Local `.env` | `/etc/environment` | `/etc/environment` |
| NODE_ENV | development | production | production |

## PM2 Configuration

Staging processes use the `env_staging` block in `ecosystem.config.cjs:51-107`. Key differences from production:

```javascript
env_staging: {
  NODE_ENV: 'production',          // Security settings like prod
  STAGING: 'true',                 // Feature flag
  PORT: 3001,                      // Avoid conflict with prod
  DATABASE_PATH: './data/flowerpil-staging.db',
  UPLOAD_PATH: './storage/uploads-staging',

  // Staging domains
  FRONTEND_URL: 'https://staging.fpil.xyz',
  CORS_ORIGIN: 'https://staging.fpil.xyz',

  // OAuth redirects point to staging frontend
  SPOTIFY_REDIRECT_URI: 'https://staging.fpil.xyz/auth/spotify/callback',
  TIDAL_EXPORT_REDIRECT_URI: 'https://staging.fpil.xyz/auth/tidal/export/callback',
  PASSWORD_RESET_LINK_BASE: 'https://staging.fpil.xyz/reset-password',

  // Feature flags
  VITE_ENABLE_CONSOLE: 'true',     // Console logs visible (hidden in prod)
  SLACK_NOTIFICATIONS_ENABLED: 'false',  // No staging spam
  ENABLE_AUDIO_FEATURES: 'false',  // Not ready for testing

  ...sharedSecrets  // Inherited from /etc/environment
}
```

### Worker Processes

Four PM2 processes run with staging configuration:
1. **flowerpil-staging-api** - Main API server (ecosystem.config.cjs:39-108)
2. **linking-worker-staging** - DSP linking worker (ecosystem.config.cjs:110-135)
3. **token-refresh-worker-staging** - Token refresh background job (ecosystem.config.cjs:137-153)
4. **dsp-export-worker-staging** - Export processing worker (ecosystem.config.cjs:155-173)

Each worker reads `STAGING: 'true'` and uses staging-specific DATABASE_PATH and API endpoints.

## Deployment Flow

### Automatic Deployment

GitHub Actions auto-deploys staging when code is pushed to `develop` branch (.github/workflows/deploy-staging.yml:3-6):

```yaml
on:
  push:
    branches:
      - develop
```

The workflow SSHs into the staging server and runs both deployment scripts in parallel.

### Manual Deployment Scripts

**Backend** (staging-api.sh:2):
```bash
set -a && source /etc/environment && set +a && pm2 restart ecosystem.config.cjs --env staging
```

Sources `/etc/environment` for secrets (JWT_SECRET, API keys, etc.), then restarts all processes with staging configuration.

**Frontend** (staging-front.sh:2-3):
```bash
export CLOUDFLARE_API_TOKEN="..."
npm run build && npx wrangler pages deploy dist --project-name=flowerpil-staging --branch=staging
```

Builds the Vite bundle and deploys to Cloudflare Pages `flowerpil-staging` project.

## Frontend API Resolution

The frontend dynamically determines which API to call based on the hostname. No hardcoded API URLs exist in the frontend code.

### Cloudflare Pages Function Proxy

All frontend API requests go to relative `/api/*` paths. Cloudflare Pages Functions intercepts these and proxies to the backend (functions/api/[[path]].js:1-200).

The Cloudflare project for staging sets the environment variable:
```
BACKEND_ORIGIN_HOST=apistage.flowerpil.io
```

This tells the proxy function which backend to forward requests to.

### Direct API Calls (Admin Tools)

Some admin tools make direct API calls. These use logic in `src/shared/utils/imageUtils.js:15-25`:

```javascript
export const getApiBaseUrl = () => {
  // 1. Check Vite env variable
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // 2. Local development
  if (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }

  // 3. Production default
  return 'https://api.flowerpil.io';
};
```

**Note**: This logic does not detect staging automatically. Staging frontend uses the Cloudflare proxy exclusively, so direct API calls are not made.

## Database Isolation

Staging uses a completely separate SQLite database file:
- Production: `/var/www/flowerpil/data/flowerpil.db`
- Staging: `/var/www/flowerpil/data/flowerpil-staging.db`

This allows safe testing of migrations, data changes, and imports without affecting production data.

Uploads also use a separate directory:
- Production: `./storage/uploads`
- Staging: `./storage/uploads-staging`

## Feature Flag Differences

Staging enables some flags differently than production:

| Feature | Staging | Production |
|---------|---------|-----------|
| Console Logging | Enabled | Hidden |
| Tester Feedback | Enabled | Enabled |
| Audio Preview | Disabled | Enabled |
| Slack Notifications | Disabled | Enabled |
| Site Protection | Enabled | Enabled |

## Environment Variables

Staging inherits all secrets from `/etc/environment` via the `sharedSecrets` object in ecosystem.config.cjs:10-35. These include:
- JWT_SECRET
- SPOTIFY_CLIENT_SECRET
- TIDAL_CLIENT_SECRET
- APPLE_MUSIC_PRIVATE_KEY
- R2_ACCESS_KEY_ID
- SLACK_ACCESS_TOKEN
- BREVO_PASS (email service)

The staging-api.sh script sources `/etc/environment` before restarting PM2, ensuring all secrets are available.

## Testing Staging Changes

1. **Push to develop branch** - Auto-deploys via GitHub Actions
2. **Manual backend deploy** - Run `bash staging-api.sh` on server
3. **Manual frontend deploy** - Run `bash staging-front.sh` on server
4. **Check logs** - `pm2 logs flowerpil-staging-api --lines 100`
5. **Monitor processes** - `pm2 list` shows all staging processes

## Known Limitations

- Staging shares the same server as production (resource contention possible)
- OAuth apps use the same client IDs as production (callbacks differ by URL)
- Email service points to production Brevo account (staging emails are real)
- No automatic database seeding (manual setup required for testing)
- Cloudflare API token is hardcoded in staging-front.sh (acceptable for staging-only)
