#!/bin/bash
# Sync database from PRIMARY to FAILOVER
# This script should be run FROM the primary server or via deployment workflow
# Usage: ./scripts/sync-db-to-failover.sh <failover-host> <failover-user> [ssh-key-path]
#
# IMPORTANT: This syncs PRIMARY -> FAILOVER ONLY
# NEVER run this in reverse (failover -> primary)

set -e

FAILOVER_HOST="${1}"
FAILOVER_USER="${2}"
SSH_KEY="${3:-$HOME/.ssh/id_rsa}"

DB_PATH="/var/www/flowerpil/data/flowerpil.db"
REMOTE_DB_PATH="/var/www/flowerpil/data/flowerpil.db"

echo "=== Database Sync: PRIMARY -> FAILOVER ==="
echo "Source: $DB_PATH (local)"
echo "Destination: $FAILOVER_USER@$FAILOVER_HOST:$REMOTE_DB_PATH"
echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo ""

# Verify we're on primary
if [ ! -f "$DB_PATH" ]; then
    echo "ERROR: Database not found at $DB_PATH"
    exit 1
fi

# Verify SSH access
if [ -z "$FAILOVER_HOST" ] || [ -z "$FAILOVER_USER" ]; then
    echo "ERROR: Missing required arguments"
    echo "Usage: $0 <failover-host> <failover-user> [ssh-key-path]"
    exit 1
fi

# Get database size
DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
echo "Database size: $DB_SIZE"

# Create backup on failover before overwriting
echo ""
echo "Creating backup on failover before sync..."
if [ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ]; then
    ssh -i "$SSH_KEY" "$FAILOVER_USER@$FAILOVER_HOST" \
        "cd /var/www/flowerpil && cp data/flowerpil.db data/flowerpil.db.pre-sync-$(date +%Y%m%d-%H%M%S) 2>/dev/null || true"
else
    ssh "$FAILOVER_USER@$FAILOVER_HOST" \
        "cd /var/www/flowerpil && cp data/flowerpil.db data/flowerpil.db.pre-sync-$(date +%Y%m%d-%H%M%S) 2>/dev/null || true"
fi

# Sync database to failover
echo ""
echo "Syncing database to failover..."
if [ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ]; then
    rsync -avz -e "ssh -i $SSH_KEY" \
        "$DB_PATH" \
        "$FAILOVER_USER@$FAILOVER_HOST:$REMOTE_DB_PATH"
else
    rsync -avz \
        "$DB_PATH" \
        "$FAILOVER_USER@$FAILOVER_HOST:$REMOTE_DB_PATH"
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "SUCCESS: Database synced to failover"

    # Verify file exists on failover
    if [ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ]; then
        REMOTE_SIZE=$(ssh -i "$SSH_KEY" "$FAILOVER_USER@$FAILOVER_HOST" "du -h $REMOTE_DB_PATH | cut -f1")
    else
        REMOTE_SIZE=$(ssh "$FAILOVER_USER@$FAILOVER_HOST" "du -h $REMOTE_DB_PATH | cut -f1")
    fi

    echo "Remote database size: $REMOTE_SIZE"
    echo "Database sync completed successfully"
    exit 0
else
    echo ""
    echo "ERROR: Database sync failed"
    exit 1
fi
