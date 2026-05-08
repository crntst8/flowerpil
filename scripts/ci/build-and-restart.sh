#!/bin/bash
# Failover Full Deployment Script
# Runs 'npm run build' + 'bash api.sh'
# Usage: ./scripts/ci/build-and-restart.sh

set -e

echo "=== Flowerpil Full Deployment (Failover) ==="
echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo ""

cd /var/www/flowerpil

# Build frontend
echo "Step 1/2: npm run build"
npm run build

echo ""
echo "Step 2/2: bash api.sh"
bash api.sh

echo ""
echo "SUCCESS: Full deployment completed (Failover)"
echo "- Frontend: Built locally"
echo "- Backend: PM2 restarted"
exit 0
