module.exports = {
    apps: [{
      name: 'portable-linking-worker',
      script: 'portable-link-worker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        // Core connection
        LINKING_API_BASE: 'https://api.flowerpil.io',
        LINKING_WORKER_KEY: '', // Must be set in /etc/environment
        LINKING_WORKER_ID: 'analytics-1',

        // DSP credentials (set in /etc/environment)
        SPOTIFY_CLIENT_ID: '',
        SPOTIFY_CLIENT_SECRET: '',
        TIDAL_CLIENT_ID: '',
        TIDAL_CLIENT_SECRET: '',
        APPLE_MUSIC_TEAM_ID: '',
        APPLE_MUSIC_KEY_ID: '',
        APPLE_MUSIC_PRIVATE_KEY_PATH: '',

        // Optional config
        APPLE_MUSIC_STOREFRONT: 'us',
        NODE_TLS_REJECT_UNAUTHORIZED: '1'
      }
    }]
  };

  2. Set Up Analytics Machine Environment

  On the analytics machine, add to /etc/environment:

  # Linking Worker Authentication
  LINKING_WORKER_KEY=<shared-secret-matching-api>

  # DSP Credentials (same as production API)
  SPOTIFY_CLIENT_ID=<value>
  SPOTIFY_CLIENT_SECRET=<value>
  TIDAL_CLIENT_ID=<value>
  TIDAL_CLIENT_SECRET=<value>
  APPLE_MUSIC_TEAM_ID=<value>
  APPLE_MUSIC_KEY_ID=<value>
  APPLE_MUSIC_PRIVATE_KEY_PATH=/path/to/key.p8

  3. Coordinate LINKING_WORKER_KEYS on API

  On the production API machine (/etc/environment):

  LINKING_WORKER_KEYS=secret1,secret2,secret3

  One of these secrets must match the LINKING_WORKER_KEY set on the analytics machine.

  4. Deployment Steps

  On the analytics machine:

  # 1. Clone/sync the repo
  cd /path/to/repo
  git pull

  # 2. Install dependencies
  cd worker/portable
  npm ci --omit=dev

  # 3. Source environment variables
  source /etc/environment

  # 4. Start with PM2
  pm2 start ecosystem.config.cjs
  pm2 save
  pm2 startup  # Run once to enable auto-start on boot

  5. Required API Endpoints (Already exist based on code)

  The portable worker requires these endpoints on your API:
  - GET /api/v1/cross-platform/worker-config - Get configuration
  - POST /api/v1/cross-platform/lease - Lease tracks to process
  - POST /api/v1/cross-platform/heartbeat - Renew lease TTL
  - POST /api/v1/cross-platform/report - Report results back

  All authenticated via X-Worker-Key header.

  6. Monitoring

  # Check worker status
  pm2 status

  # View logs
  pm2 logs portable-linking-worker

  # Monitor in real-time
  pm2 monit

  Summary

  To make it "that simple":

  1. Create ecosystem config in worker/portable/
  2. Set environment variables in /etc/environment on analytics machine
  3. Add worker key to API's LINKING_WORKER_KEYS list
  4. Deploy: cd worker/portable && npm ci && source /etc/environment && pm2 start ecosystem.config.cjs

  The worker will then automatically lease tracks from the API, process them in parallel (Apple/TIDAL/Spotify), and report results back.