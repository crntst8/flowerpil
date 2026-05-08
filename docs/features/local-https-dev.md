# Local HTTPS Development with `dev.testing`

Flowerpil uses `https://dev.testing` as the local development domain to enable OAuth callbacks, HTTPS-only features, and production-like security testing during development.

## Overview

The `dev.testing` setup provides:
- **HTTPS in development** for OAuth providers (Spotify, TIDAL, Apple Music)
- **Production-like environment** with proper security headers and CORS
- **Hot Module Replacement (HMR)** working seamlessly over HTTPS
- **Consistent URLs** across development tools and OAuth callbacks

## Architecture

```
https://dev.testing (browser)
         ↓
    Caddy Proxy (TLS termination, port 443)
         ↓
    Vite Dev Server (localhost:5173)
         ↓ (proxies /api and /uploads)
    Express API Server (localhost:3000)
```

### Components

1. **Caddy**: Reverse proxy that handles TLS and forwards requests to Vite
2. **Vite**: Dev server serving the React app with HMR over WSS (secure WebSocket)
3. **Express**: Backend API server handling business logic and OAuth callbacks

## Initial Setup

### 1. DNS Configuration

Add `dev.testing` to your hosts file:

```bash
echo "127.0.0.1 dev.testing" | sudo tee -a /etc/hosts
echo "::1 dev.testing" | sudo tee -a /etc/hosts
```

### 2. Install Dependencies

```bash
# Install Caddy and mkcert
brew install caddy mkcert nss

# Install and trust local CA
mkcert -install
```

### 3. Generate TLS Certificates

```bash
# Create certificate directory outside repo (won't be committed)
mkdir -p ~/dev-certs

# Generate certificates for dev.testing
mkcert -key-file ~/dev-certs/dev.testing-key.pem \
       -cert-file ~/dev-certs/dev.testing.pem \
       dev.testing
```

### 4. Configure Spotify OAuth (One-time)

Add the dev callback URL to your Spotify app settings:

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Open your app settings
3. Add to **Redirect URIs**:
   - `https://dev.testing/auth/spotify/callback`
4. Save changes

Repeat for other DSP providers as needed (TIDAL, Apple Music, etc.).

## Running the Development Environment

### Terminal 1: Start Caddy Proxy

```bash
caddy run --config Caddyfile.dev.testing
```

Keep this running. Caddy will:
- Listen on `https://dev.testing:443`
- Terminate TLS using the mkcert certificates
- Forward all traffic to `127.0.0.1:5173` (Vite)

### Terminal 2: Start Development Server

```bash
npm run dev
```

This starts:
- **PM2**: API server on `localhost:3000` with `ecosystem.config.cjs` env vars
- **Vite**: Frontend dev server on `127.0.0.1:5173`

### Access Your App

Open **`https://dev.testing`** in your browser. You should see:
- Secure HTTPS connection with valid certificate
- React app loads normally
- HMR (hot reload) works
- API calls to `/api/*` proxy to backend
- OAuth flows redirect back correctly

## How It Works

### Environment Variables (ecosystem.config.cjs)

The PM2 config sets all URLs to use `dev.testing`:

```javascript
env: {
  NODE_ENV: 'development',
  FRONTEND_URL: 'https://dev.testing',
  CORS_ORIGIN: 'https://dev.testing',
  SPOTIFY_REDIRECT_URI: 'https://dev.testing/auth/spotify/callback',
  SPOTIFY_EXPORT_REDIRECT_URI: 'https://dev.testing/auth/spotify/callback',
  TIDAL_EXPORT_REDIRECT_URI: 'https://dev.testing/auth/tidal/callback',
  // ... other env vars
}
```

### Smart Redirect URI Fallbacks

Services automatically use the correct redirect URIs:

**spotifyService.js & tidalService.js:**
```javascript
// Priority:
// 1. Explicit env var (SPOTIFY_REDIRECT_URI)
// 2. FRONTEND_URL in development
// 3. Production URL (flowerpil.io)

const getRedirectBase = () => {
  if (process.env.NODE_ENV === 'development' && process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL; // https://dev.testing
  }
  return 'https://flowerpil.io';
};
```

### Vite Configuration (vite.config.js)

```javascript
server: {
  host: '127.0.0.1',
  port: 5173,
  strictPort: true,
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
    '/uploads': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
  // HMR configured for HTTPS via Caddy
  hmr: {
    protocol: 'wss',
    host: 'dev.testing',
  },
}
```

### CORS & Security Headers (server/middleware/securityHeaders.js)

The backend allows `dev.testing` in development:

```javascript
const allowedOrigins = [
  'https://dev.testing', // Local HTTPS dev proxy
  'http://localhost:5173',
  'https://flowerpil.io',
  // ... other origins
];

connectSrc: [
  "'self'",
  ...(isDev ? ["wss://dev.testing", "https://dev.testing"] : []),
  // ... other sources
]
```

## OAuth Callback Flow

### Example: Spotify Site Admin Connection

1. **Admin clicks "Connect Spotify"** in Admin DSP Connections
2. **Frontend fetches auth URL**: `GET /api/v1/export/auth/spotify/url`
3. **Backend returns**: `https://accounts.spotify.com/authorize?redirect_uri=https://dev.testing/auth/spotify/callback&...`
4. **Popup opens** to Spotify authorization page
5. **User authorizes** the app on Spotify
6. **Spotify redirects to**: `https://dev.testing/auth/spotify/callback?code=ABC123&state=xyz`
7. **Caddy proxies** to Vite at `127.0.0.1:5173`
8. **Vite serves** React app (index.html)
9. **React Router** loads `SpotifyCallback` component (no auth required)
10. **SpotifyCallback** broadcasts code to opener window OR posts to backend
11. **Parent window** (AdminDSPConnections) receives code and calls `POST /api/v1/export/auth/spotify/callback`
12. **Backend exchanges** code for access token with Spotify
13. **Backend stores** token in database
14. **Frontend refreshes** connection status - shows "Connected"

### Frontend Routes (No Auth Required)

These routes bypass authentication in `DynamicRouter.jsx`:

```javascript
// All /auth/* routes are public
const requiresAuth =
  (isAdminModule && !route.path.startsWith('/auth/')) ||
  // ...
```

- `/auth/spotify/callback` → `SpotifyCallback.jsx`
- `/auth/tidal/callback` → `TidalExportCallback.jsx`
- `/auth/soundcloud/callback` → `SoundcloudCallback.jsx`

### Backend API Routes (Require Auth)

OAuth token exchange endpoints require authenticated session:

- `POST /api/v1/export/auth/spotify/callback` → Requires `authMiddleware`
- `POST /api/v1/export/auth/tidal/callback` → Requires `authMiddleware`
- `POST /api/v1/export/auth/apple/callback` → Requires `authMiddleware`

The admin user must be logged in when the API request is made (called from parent window, not the callback popup).

## DevUserSwitcher Integration

The dev user switcher automatically uses the current domain:

```javascript
// Generates referral URLs dynamically
const signupUrl = `${window.location.origin}/signup?referral=${code}`;
// Result: https://dev.testing/signup?referral=ABC123
```

This works for both `dev.testing` and `localhost:5173` without hardcoding.

## Troubleshooting

### Issue: "Cannot reach dev.testing"

**Solution**: Check `/etc/hosts` has the entries:
```bash
cat /etc/hosts | grep dev.testing
# Should show:
# 127.0.0.1 dev.testing
# ::1 dev.testing
```

### Issue: "Certificate not trusted" warning

**Solution**: Re-run mkcert installation:
```bash
mkcert -install
mkcert -key-file ~/dev-certs/dev.testing-key.pem \
       -cert-file ~/dev-certs/dev.testing.pem \
       dev.testing
```

Restart Caddy and refresh browser.

### Issue: "404 on OAuth callback"

**Causes**:
1. Frontend route not registered in module manifest
2. Redirect URI mismatch between Spotify app settings and ecosystem.config.cjs

**Solution**:
```bash
# Check manifest has the route
rg -n "auth.*callback" \
  src/modules/about/manifest.js \
  src/modules/admin/manifest.js \
  src/modules/bio/manifest.js \
  src/modules/blog/manifest.js \
  src/modules/common/manifest.js \
  src/modules/curator/manifest.js \
  src/modules/curators/manifest.js \
  src/modules/home/manifest.js \
  src/modules/playlists/manifest.js \
  src/modules/releases/manifest.js \
  src/modules/top10/manifest.js

# Verify env vars are loaded
npm run server:restart

# Check Spotify app settings match exactly:
# https://dev.testing/auth/spotify/callback
```

### Issue: "HMR not working / page doesn't hot reload"

**Cause**: WebSocket connection failing through Caddy

**Solution**: Check vite.config.js has:
```javascript
hmr: {
  protocol: 'wss',
  host: 'dev.testing',
}
```

Restart Vite: `npm run dev`

### Issue: "CORS error" when calling API

**Cause**: Backend not allowing `dev.testing` origin

**Solution**: Verify `server/middleware/securityHeaders.js` includes:
```javascript
allowedOrigins: [
  'https://dev.testing',
  // ...
]
```

Restart API: `npm run server:restart`

### Issue: OAuth callback gets 401 Unauthorized

**Cause**: The callback endpoint requires authentication, but the request lacks valid session

**Context**: This is expected for direct navigation. The OAuth flow should use the popup pattern where:
1. Popup loads callback page (public route)
2. Callback broadcasts to opener window
3. Opener window (authenticated) calls API

**Solution**: Ensure OAuth is initiated from AdminDSPConnections or CuratorDSPConnections, which handle the popup flow correctly.

## Alternative: Direct Vite HTTPS (No Proxy)

If you prefer not to run Caddy, Vite can serve HTTPS directly:

```bash
npm run client:dev -- \
  --host dev.testing \
  --https \
  --cert ~/dev-certs/dev.testing.pem \
  --key ~/dev-certs/dev.testing-key.pem \
  --port 5173
```

**Trade-offs**:
- Simpler setup (no Caddy)
- One less process to manage
- Must update vite.config.js to remove Caddy-specific HMR config
- Less production-like (no reverse proxy layer)

## Production vs Development

| Aspect | Development (dev.testing) | Production (flowerpil.io) |
|--------|---------------------------|---------------------------|
| **Protocol** | HTTPS via Caddy + mkcert | HTTPS via Let's Encrypt |
| **Domain** | `dev.testing` (local) | `flowerpil.io` |
| **API Server** | PM2 with nodemon reload | PM2 cluster mode |
| **Frontend** | Vite dev server (HMR) | Nginx serving static build |
| **OAuth Redirects** | `dev.testing/auth/...` | `flowerpil.io/auth/...` |
| **CORS** | Permissive (dev origins) | Strict (prod only) |
| **CSP** | Allows unsafe-eval | Stricter policy |

## Files Modified for dev.testing Support

### Core Configuration
- `ecosystem.config.cjs` - Environment variables for dev
- `vite.config.js` - HMR config and proxy rules
- `Caddyfile.dev.testing` - Reverse proxy configuration

### Services
- `server/services/spotifyService.js` - Smart redirect URI fallbacks
- `server/services/tidalService.js` - Smart redirect URI fallbacks

### Security
- `server/middleware/securityHeaders.js` - CORS and CSP for dev.testing

### Frontend
- `src/core/router/DynamicRouter.jsx` - Public /auth/* routes
- `src/dev/DevUserSwitcher.jsx` - Dynamic origin URLs

## Quick Reference

### Start Development
```bash
# Terminal 1: Caddy
caddy run --config Caddyfile.dev.testing

# Terminal 2: Dev servers
npm run dev

# Browser
open https://dev.testing
```

### Restart API (after config changes)
```bash
npm run server:restart
```

### View Logs
```bash
# API logs
npm run server:logs

# PM2 status
pm2 status

# Caddy logs (shown in terminal)
```

### Stop Everything
```bash
# Stop API
pm2 stop flowerpil-api-dev

# Stop Caddy
Ctrl+C in Caddy terminal

# Or use PM2 for dev script
pm2 stop all
```

## Security Notes

- Certificates in `~/dev-certs/` are for **local development only**
- Never commit certificates or keys to the repository
- `mkcert` creates a local CA trusted only on your machine
- `dev.testing` only resolves to `127.0.0.1` (localhost)
- Production uses Let's Encrypt for real TLS certificates

## Additional Resources

- [Caddy Documentation](https://caddyserver.com/docs/)
- [mkcert GitHub](https://github.com/FiloSottile/mkcert)
- [Vite Server Options](https://vitejs.dev/config/server-options.html)
- [Spotify OAuth Guide](https://developer.spotify.com/documentation/general/guides/authorization/)
