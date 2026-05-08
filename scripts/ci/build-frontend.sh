#!/bin/bash
# Failover Frontend Build Script
# Runs 'npm run build' only (no Cloudflare deployment)
# Usage: ./scripts/ci/build-frontend.sh

set -e

echo "=== Flowerpil Frontend Build (Failover) ==="
echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo ""

cd /var/www/flowerpil

# Build frontend (no Cloudflare deployment on failover)
echo "Running: npm run build"
npm run build

echo ""
echo "SUCCESS: Frontend built (no Cloudflare deployment on failover)"
exit 0
