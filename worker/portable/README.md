# Portable Linking Worker

A **standalone, production-ready worker** for cross-platform music linking that coordinates with the Flowerpil API via distributed leasing. This worker can run independently on separate infrastructure and scale horizontally to handle high-volume linking workloads.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment Options](#deployment-options)
- [Monitoring & Health Checks](#monitoring--health-checks)
- [Scaling](#scaling)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Features

### Core Functionality
- ✅ **Distributed Coordination**: Lease-based system prevents duplicate work across multiple workers
- ✅ **Multi-Platform Support**: Search across Spotify, Tidal, and Apple Music simultaneously
- ✅ **Graceful Shutdown**: Completes in-flight tracks before exiting
- ✅ **Auto-Recovery**: Lease TTL ensures orphaned work is reclaimed
- ✅ **Heartbeat Mechanism**: Extends leases for actively processing tracks

### Production Ready
- ✅ **Health Checks**: HTTP endpoints for liveness and readiness probes
- ✅ **Metrics Collection**: Detailed operational metrics and performance tracking
- ✅ **Structured Logging**: JSON or text format with configurable log levels
- ✅ **Configuration Validation**: Startup checks ensure proper configuration
- ✅ **Error Handling**: Comprehensive error tracking and recovery

### Deployment Flexibility
- ✅ **Docker Support**: Dockerfile and docker-compose for containerized deployment
- ✅ **PM2 Support**: Process management for Node.js production deployments
- ✅ **Systemd Support**: Native Linux service integration
- ✅ **Portable**: Zero database dependencies, communicates via REST API only

## Architecture

```
┌─────────────────────────────────────────────────┐
│          Flowerpil Core API                     │
│  ┌──────────────────────────────────────────┐  │
│  │  Lease Management & Coordination         │  │
│  │  - Issues track leases (batch=5)         │  │
│  │  - Enforces TTL (120s default)           │  │
│  │  - Accepts heartbeats & reports          │  │
│  └──────────────────────────────────────────┘  │
└────────────────┬────────────────────────────────┘
                 │ REST API (HTTPS)
                 │ X-Worker-Key authentication
        ┌────────┴────────┐
        │                 │
┌───────▼───────┐  ┌──────▼──────┐
│  Worker 1     │  │  Worker 2   │  ... (N workers)
│  ┌─────────┐  │  │  ┌─────────┐│
│  │ Lease   │  │  │  │ Lease   ││
│  │ 5 tracks│  │  │  │ 5 tracks││
│  └─────────┘  │  │  └─────────┘│
│       │       │  │       │      │
│  Per-track    │  │  Per-track   │
│  lookup:      │  │  lookup:     │
│  - Apple (1x) │  │  - Apple (1x)│
│  - Tidal (3x) │  │  - Tidal (3x)│
│  - Spotify(3x)│  │  - Spotify(3x)│
│       │       │  │       │      │
│  ┌─────────┐  │  │  ┌─────────┐│
│  │ Report  │  │  │  │ Report  ││
│  │ Results │  │  │  │ Results ││
│  └─────────┘  │  │  └─────────┘│
└───────────────┘  └─────────────┘
```

### Processing Flow

1. **Lease**: Worker requests batch of pending tracks from API
2. **Process**: Parallel lookups across configured platforms
3. **Heartbeat**: Periodic lease renewal for in-flight tracks
4. **Report**: Submit results when all platforms complete for a track
5. **Repeat**: Continuous loop with configurable polling interval

## Requirements

- **Node.js**: >= 18.0.0 (for native `fetch` API)
- **Network**: Access to Flowerpil API and DSP endpoints
- **Credentials**: At least one DSP platform configured (Spotify, Tidal, or Apple Music)

## Quick Start

### 1. Install Dependencies

```bash
cd worker/portable
npm ci
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values:
#   - LINKING_API_BASE
#   - LINKING_WORKER_KEY
#   - Platform credentials (Spotify, Tidal, Apple Music)
```

### 3. Validate Configuration

```bash
npm run validate:env
```

### 4. Start Worker

```bash
# Development (text logs, debug level)
npm run dev

# Production
npm start
```

### 5. Verify Health

```bash
# Check health
curl http://localhost:3001/health

# View metrics
curl http://localhost:3001/metrics
```

## Configuration

All configuration is via environment variables. See [.env.example](.env.example) for complete documentation.

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `LINKING_API_BASE` | Core API base URL | `https://api.flowerpil.io` |
| `LINKING_WORKER_KEY` | Authentication key | `your-secure-key` |

### Platform Credentials

At least one platform should be configured:

**Spotify:**
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

**Tidal:**
- `TIDAL_CLIENT_ID`
- `TIDAL_CLIENT_SECRET`

**Apple Music:**
- `APPLE_MUSIC_TEAM_ID`
- `APPLE_MUSIC_KEY_ID`
- `APPLE_MUSIC_PRIVATE_KEY_PATH` or `APPLE_MUSIC_PRIVATE_KEY`
- `APPLE_MUSIC_STOREFRONT` (default: `us`)

### Optional Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `LINKING_WORKER_ID` | `hostname-pid` | Unique worker identifier |
| `LINKING_PLAYLIST_ID` | - | Restrict to specific playlist |
| `LINKING_BATCH_SIZE` | `5` | Tracks to lease per batch |
| `LINKING_POLL_INTERVAL_MS` | `100` | Loop interval |
| `LINKING_HEARTBEAT_INTERVAL_SEC` | `60` | Heartbeat frequency |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | `json` | `json` or `text` |
| `HEALTH_CHECK_ENABLED` | `true` | Enable health server |
| `HEALTH_CHECK_PORT` | `3001` | Health server port |
| `METRICS_ENABLED` | `true` | Enable metrics collection |

## Deployment Options

### Docker (Recommended)

**Build and run:**
```bash
npm run docker:build
npm run docker:run
```

**Docker Compose:**
```bash
# Start
npm run docker:up

# View logs
npm run docker:logs

# Stop
npm run docker:down
```

**Scale workers:**
```bash
docker-compose up -d --scale linking-worker=3
```

### PM2 (Node.js Process Manager)

**Single worker:**
```bash
npm run pm2:start
```

**Production mode:**
```bash
npm run pm2:start:prod
```

**Monitor:**
```bash
npm run pm2:monit
npm run pm2:logs
```

**Auto-start on boot:**
```bash
npm run pm2:save
pm2 startup  # Follow instructions
```

### Systemd (Linux Service)

1. Copy service file:
```bash
sudo cp linking-worker.service /etc/systemd/system/
```

2. Edit file with your paths and credentials:
```bash
sudo nano /etc/systemd/system/linking-worker.service
```

3. Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable linking-worker
sudo systemctl start linking-worker
sudo systemctl status linking-worker
```

4. View logs:
```bash
sudo journalctl -u linking-worker -f
```

### Manual/Development

```bash
# Development mode (debug logs, text format)
npm run dev

# Production mode
npm start
```

## Monitoring & Health Checks

### Health Endpoints

The worker exposes HTTP endpoints for monitoring:

| Endpoint | Purpose | Status Codes |
|----------|---------|--------------|
| `/health` | Overall health status | 200 (healthy), 503 (unhealthy) |
| `/metrics` | Detailed metrics | 200 |
| `/ready` | Readiness probe | 200 (ready), 503 (not ready) |
| `/live` | Liveness probe | 200 (alive) |

### Example: Check Health

```bash
curl http://localhost:3001/health | jq
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1699564321000,
  "uptime": {
    "seconds": 3425,
    "human": "57m 5s"
  },
  "inflight": 3,
  "counters": {
    "tracksLeased": 1247,
    "tracksCompleted": 1244,
    "tracksFailed": 3
  }
}
```

### Metrics

```bash
curl http://localhost:3001/metrics | jq
```

**Available metrics:**
- Uptime and worker status
- Track processing counters (leased, completed, failed)
- Per-platform success/failure rates
- Performance timings (avg, p95, p99)
- API call latencies
- Error rates and health status

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /live
    port: 3001
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 5
```

## Scaling

### Horizontal Scaling

Run multiple workers to increase throughput:

**Docker Compose:**
```bash
docker-compose up -d --scale linking-worker=5
```

**PM2:**
Edit `ecosystem.config.cjs` to add more worker instances with unique IDs and health ports.

**Systemd:**
Create multiple service files (`linking-worker-1.service`, `linking-worker-2.service`, etc.)

### Load Balancing

Workers naturally distribute work via the API's lease mechanism:
- Small batch sizes (default: 5 tracks) ensure fair distribution
- TTL-based leases prevent monopolization
- No coordination needed between workers

### Dedicated Workers

Assign workers to specific playlists:

```bash
# Worker 1: All playlists
LINKING_WORKER_ID=worker-1

# Worker 2: Playlist 123 only
LINKING_WORKER_ID=worker-2
LINKING_PLAYLIST_ID=123
```

## Troubleshooting

### Worker not starting

**Check configuration:**
```bash
npm run validate:env
```

**Common issues:**
- Missing `LINKING_API_BASE` or `LINKING_WORKER_KEY`
- No platform credentials configured
- Invalid API base URL format

### No tracks being processed

**Check API connectivity:**
```bash
curl -H "X-Worker-Key: YOUR_KEY" \
  https://api.flowerpil.io/api/v1/cross-platform/worker-config
```

**Possible causes:**
- `LINKING_DISTRIBUTED` not enabled on API server
- No pending tracks in the system
- Worker key doesn't match API configuration
- Firewall blocking API access

### High error rates

**Check metrics:**
```bash
npm run metrics
```

**Common causes:**
- Invalid DSP credentials (check platform counters)
- Rate limiting (increase delays in worker config on API)
- Network issues (check API call timings)

### Memory leaks

**Monitor with PM2:**
```bash
npm run pm2:monit
```

**Set memory limits:**
- Docker: `deploy.resources.limits.memory` in docker-compose.yml
- PM2: `max_memory_restart` in ecosystem.config.cjs
- Systemd: `MemoryMax` in service file

## Development

### Project Structure

```
worker/portable/
├── portable-link-worker.js   # Main worker process
├── config.js                 # Configuration management
├── logger.js                 # Structured logging
├── metrics.js                # Metrics collection
├── health-server.js          # Health check HTTP server
├── services/                 # DSP service implementations
│   ├── appleSearch.js        # Apple Music API
│   ├── tidalService.js       # Tidal API
│   └── spotifyService.js     # Spotify API
├── package.json              # Dependencies and scripts
├── .env.example              # Configuration template
├── Dockerfile                # Container image
├── docker-compose.yml        # Docker orchestration
├── ecosystem.config.cjs      # PM2 configuration
├── linking-worker.service    # Systemd service
└── README.md                 # This file
```

### Local Development

```bash
# Install dependencies
npm install

# Create .env from example
cp .env.example .env

# Edit .env with local API endpoint
nano .env

# Run in development mode
npm run dev
```

### Testing

```bash
# Validate configuration
npm run validate:env

# Check health endpoint
npm run health

# View metrics
npm run metrics
```

### Debugging

**Enable debug logging:**
```bash
LOG_LEVEL=debug LOG_FORMAT=text npm start
```

**Track specific track:**
Look for `trackId` in logs:
```bash
npm start | grep '"trackId":123'
```

## License

UNLICENSED - Proprietary

## Support

For issues, questions, or contributions:
- GitHub: https://github.com/flowerpil/production
- Issues: https://github.com/flowerpil/production/issues
