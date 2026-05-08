# =============================================================================
# Portable Linking Worker - Dockerfile
# =============================================================================
# Multi-stage build for optimized production image
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:18-alpine AS dependencies

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts

# -----------------------------------------------------------------------------
# Stage 2: Production Image
# -----------------------------------------------------------------------------
FROM node:18-alpine

# Add metadata
LABEL maintainer="flowerpil"
LABEL description="Portable Linking Worker for cross-platform music linking"
LABEL version="1.0.0"

# Create non-root user for security
RUN addgroup -g 1001 -S worker && \
    adduser -u 1001 -S worker -G worker

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies --chown=worker:worker /app/node_modules ./node_modules

# Copy application code
COPY --chown=worker:worker . .

# Create directory for Apple Music private key if needed
RUN mkdir -p /app/keys && chown worker:worker /app/keys

# Switch to non-root user
USER worker

# Expose health check port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const http = require('http'); \
    const options = { host: 'localhost', port: process.env.HEALTH_CHECK_PORT || 3001, path: '/health', timeout: 5000 }; \
    const req = http.request(options, (res) => { \
      if (res.statusCode === 200) { process.exit(0); } else { process.exit(1); } \
    }); \
    req.on('error', () => process.exit(1)); \
    req.end();"

# Start the worker
CMD ["node", "portable-link-worker.js"]
