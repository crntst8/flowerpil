const os = require('os');

const enforceLocalOnly = () => {
  const hostname = (process.env.HOSTNAME || os.hostname() || '').toLowerCase();
  const blockedHosts = new Set(['prod', 'flowerpil-prod']);

  if (blockedHosts.has(hostname)) {
    throw new Error(
      `[ecosystem.config.cjs] Refusing to load local PM2 config on protected host "${hostname}"`
    );
  }

  const argv = process.argv.join(' ');
  if (/--env\s+production/.test(argv) || process.env.PM2_ENV === 'production') {
    throw new Error(
      '[ecosystem.config.cjs] This local PM2 config cannot be started with --env production. Use the production config instead.'
    );
  }

  if (process.env.FLOWERPIL_DEPLOY_TARGET && process.env.FLOWERPIL_DEPLOY_TARGET !== 'local') {
    throw new Error(
      `[ecosystem.config.cjs] FLOWERPIL_DEPLOY_TARGET=${process.env.FLOWERPIL_DEPLOY_TARGET} is not compatible with the local PM2 config.`
    );
  }
};

enforceLocalOnly();

module.exports = {
  apps: [{
    name: 'flowerpil-api-dev',
    script: 'server/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    ignore_watch: ['logs/', 'data/', 'storage/', 'node_modules/', 'dist/'],
    kill_timeout: 5000,
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    env: {

      // **** SITE CONFIG ***  //

      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_PATH: './data/flowerpil.db',
      UPLOAD_PATH: './storage/uploads',
      FRONTEND_URL: 'https://dev.testing',
      CORS_ORIGIN: 'https://dev.testing',
      LINKING_API_BASE: 'http://localhost:3000',
      LINKING_WORKER_KEY: '',
      FLOWERPATCH_API_BASE: 'http://127.0.0.1:3101',
      FLOWERPATCH_API_KEY: '',
      FLOWERPATCH_URL_IMPORT: 'false',
      FLOWERPATCH_LINKING: 'false',
      FLOWERPATCH_PLAYLIST_IMPORT: 'false',
      FLOWERPATCH_EXPORTS: 'false',
      ENABLE_AUDIO_FEATURES: 'true',
      VITE_ENABLE_AUDIO_FEATURES: 'true',
      VITE_SITE_PROTECTION_ENABLED: 'false',
      VITE_ENABLE_CONSOLE: 'true',
      LINKING_DISTRIBUTED: 'off',
      MOCK_AUTH_ENABLED: 'true',
      LOOKUP_WORKER_KEY: '',
      LOOKUP_WORKER_KEYS: '',
      SEARCH_AGGREGATOR_URL: 'http://127.0.0.1:3010',
      SEARCH_AGGREGATOR_SECRET: '',
      SEARCH_AGGREGATOR_TIMEOUT_MS: '7000',
      REDIS_URL: 'redis://localhost:6379',
      CACHE_TTL_SUCCESS: '604800',
      CACHE_TTL_FAILURE: '86400',
      DISABLE_MEMORY_CACHE: 'false',
      CACHE_FEED_TTL: '300000',
      CACHE_PLAYLIST_TTL: '900000',
      CACHE_CURATOR_TTL: '1800000',
      ERROR_REPORTING_ENABLED: 'true',
      ERROR_ALERT_COOLDOWN_MS: '600000',
      ERROR_DEDUPLICATION_WINDOW_MS: '300000',
      ERROR_RETENTION_DAYS: '90',
      STATE_RECOVERY_CRON: '*/10 * * * *',
      LEASE_EXPIRE_MARGIN_MINUTES: '5',
      HEARTBEAT_STALE_MINUTES: '10',
      EXPORT_STUCK_MINUTES: '30',
      EXPIRED_LEASE_ALERT_THRESHOLD: '10',
      STUCK_EXPORT_ALERT_THRESHOLD: '5',


      // **** API CONFIG ***  //


      // GOOGLE LOCATIONS
      VITE_GOOGLE_PLACES_API_KEY: '',

      // SPOTIFY
      SPOTIFY_CLIENT_ID: '',
      SPOTIFY_REDIRECT_URI: 'https://dev.testing/auth/spotify/callback',
      SPOTIFY_EXPORT_REDIRECT_URI: 'https://dev.testing/auth/spotify/callback',
      SPOTIFY_CLIENT_SECRET: '',

      // TIDAL
      TIDAL_CLIENT_ID: '',
      TIDAL_CLIENT_SECRET: '',
      TIDAL_EXPORT_REDIRECT_URI: 'https://dev.testing/auth/tidal/callback',

      // APPLE MUSIC
      APPLE_MUSIC_TEAM_ID: '',
      APPLE_MUSIC_KEY_ID: '',
      APPLE_MUSIC_KEY_PATH: 'auth/AuthKey_YOURKEYID.p8',
      APPLE_MUSIC_SCRAPER_ENABLED: 'true',
      APPLE_MUSIC_GAMDL_ENABLED: 'false',
      APPLE_MUSIC_FALLBACK_PUPPETEER: 'true',
      APPLE_MUSIC_SIMPLE_FALLBACK: 'true',
      APPLE_MUSIC_RATE_LIMIT: '10',
      APPLE_MUSIC_REGIONAL_FALLBACK: 'true',

      // YOUTUBE
      YOUTUBE_API_KEY: '',
      YOUTUBE_CLIENT_ID: '',
      YOUTUBE_CLIENT_SECRET: '',

      // META
      META_APP_ID: '',
      META_APP_SECRET: '',
      META_REDIRECT_URI: '',
      META_GRAPH_VERSION: 'v24.0',
      META_CAPI_TEST_EVENT_CODE: '',
      META_SYSTEM_USER_TOKEN: '',
      BASE_URL: 'https://dev.testing',

      // YOUTUBE MUSIC MICROSERVICE
      YTMUSIC_API_BASE: 'http://127.0.0.1:3001',
      YTMUSIC_SERVICE_PORT: '3001',

      // SOUNDCLOUD
      SOUNDCLOUD_CLIENT_ID: '',
      SOUNDCLOUD_CLIENT_SECRET: '',
      SOUNDCLOUD_CALLBACK_URL: 'https://dev.testing/auth/soundcloud/callback',

      // BREVO (email)
      EMAIL_PROVIDER: 'brevo',
      BREVO_HOST: 'smtp-relay.brevo.com',
      BREVO_PORT: '587',
      BREVO_USER: '',
      BREVO_PASS: '',
      EMAIL_CODE_PEPPER: '',

      // PUBLIC USER FEATURE FLAGS
      PUBLIC_USERS_ENABLED: 'false',
      INVITE_ONLY_MODE: 'true',
      DISABLE_PUBLIC_EXPORTS: 'false',
      PUBLIC_USER_IMPORT_LIMIT: '2',
      PUBLIC_USER_EXPORT_PLAYLIST_THRESHOLD: '6',

      // R2 (image storage)
      R2_ACCOUNT_ID: '',
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '',
      R2_BUCKET_NAME: '',
      R2_PUBLIC_URL: '',

      // ANALYTICS BEHAVIOR TRACKING
      ANALYTICS_ACTION_SAMPLE_RATE: '1.0',
      ANALYTICS_DEV_MODE: 'false',

      // SLACK (optional)
      SLACK_ACCESS_TOKEN: '',
      SLACK_REFRESH_TOKEN: '',
      SLACK_CLIENT_ID: '',
      SLACK_CLIENT_SECRET: '',
      SLACK_CHANNEL_ID: '',
      SLACK_NOTIFICATIONS_ENABLED: 'false'
  }
  }, {
    name: 'flowerpil-linking-worker-dev',
    script: 'server/worker/linking-worker.js',
    instances: 1,
    autorestart: true,
    watch: false,
    kill_timeout: 5000,
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    env: {
      NODE_ENV: 'development',
      LINKING_API_BASE: 'http://localhost:3000',
      LINKING_WORKER_KEY: '',
      LINKING_WORKER_ID: 'dev-linker-1',
      APPLE_MUSIC_STOREFRONT: 'us',
      FLOWERPATCH_API_BASE: 'http://127.0.0.1:3101',
      FLOWERPATCH_API_KEY: '',
      FLOWERPATCH_LINKING: 'false',

      // DSP credentials (reuse dev values from API)
      TIDAL_CLIENT_ID: '',
      TIDAL_CLIENT_SECRET: '',
      SPOTIFY_CLIENT_ID: '',
      SPOTIFY_CLIENT_SECRET: '',
      APPLE_MUSIC_TEAM_ID: '',
      APPLE_MUSIC_KEY_ID: '',
      APPLE_MUSIC_KEY_PATH: 'auth/AuthKey_YOURKEYID.p8',

      // YouTube Music microservice
      YTMUSIC_API_BASE: 'http://127.0.0.1:3001'
    }
  }, {
    name: 'flowerpil-ytmusic-service',
    script: 'gunicorn',
    args: '-w 2 -b 127.0.0.1:3001 app:app',
    cwd: './server/python-services/ytmusic',
    interpreter: 'none',
    instances: 1,
    autorestart: true,
    watch: false,
    kill_timeout: 5000,
    error_file: 'logs/pm2-ytmusic-error.log',
    out_file: 'logs/pm2-ytmusic-out.log',
    env: {
      YOUTUBE_CLIENT_ID: '',
      YOUTUBE_CLIENT_SECRET: ''
    }
  }, {
    name: 'flowerpil-search-aggregator',
    script: 'server/microservices/search-aggregator/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    kill_timeout: 5000,
    error_file: 'logs/pm2-search-aggregator-error.log',
    out_file: 'logs/pm2-search-aggregator-out.log',
    env: {
      NODE_ENV: 'development',
      PORT: 3010,
      SEARCH_AGGREGATOR_HOST: '127.0.0.1',
      SEARCH_AGGREGATOR_SECRET: '',
      SEARCH_AGGREGATOR_PROVIDER_ORDER: 'brave,bing,serpapi,google_cse',
      SEARCH_AGGREGATOR_TIMEOUT_MS: '7000',
      BRAVE_SEARCH_API_KEY: '',
      BING_SEARCH_API_KEY: '',
      SERPAPI_API_KEY: '',
      GOOGLE_CSE_API_KEY: '',
      GOOGLE_CSE_ENGINE_ID: ''
    }
  }]
};
