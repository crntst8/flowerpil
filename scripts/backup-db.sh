#!/bin/bash
# Trigger on-demand Litestream snapshot for deployment
# Usage: ./scripts/backup-db.sh

set -e

DB_PATH="/var/www/flowerpil/data/flowerpil.db"
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

echo "=== Flowerpil Database Backup ==="
echo "Timestamp: $TIMESTAMP"
echo "Database: $DB_PATH"
echo ""

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "ERROR: Database file not found at $DB_PATH"
    exit 1
fi

# Check if Litestream is installed
if ! command -v litestream &> /dev/null; then
    echo "ERROR: Litestream is not installed"
    exit 1
fi

# Trigger snapshot
echo "Triggering Litestream snapshot..."
if litestream snapshots "$DB_PATH" > /dev/null 2>&1; then
    echo "SUCCESS: Snapshot triggered"
else
    echo "ERROR: Failed to trigger snapshot"
    exit 1
fi

# Get latest snapshot info
echo ""
echo "Latest snapshots:"
litestream snapshots "$DB_PATH" | head -n 5

# Get database size
DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
echo ""
echo "Database size: $DB_SIZE"
echo "Backup completed successfully"

exit 0
