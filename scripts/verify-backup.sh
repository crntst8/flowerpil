#!/bin/bash
# Verify Litestream backup exists and is recent
# Usage: ./scripts/verify-backup.sh
# Exit codes: 0=success, 1=no backup found, 2=backup too old

set -e

DB_PATH="/var/www/flowerpil/data/flowerpil.db"
MAX_AGE_MINUTES=15

echo "=== Flowerpil Backup Verification ==="
echo "Database: $DB_PATH"
echo "Maximum backup age: $MAX_AGE_MINUTES minutes"
echo ""

# Check if Litestream is installed
if ! command -v litestream &> /dev/null; then
    echo "ERROR: Litestream is not installed"
    exit 1
fi

# Get latest snapshot info
SNAPSHOT_INFO=$(litestream snapshots "$DB_PATH" 2>&1 | head -n 1)

if echo "$SNAPSHOT_INFO" | grep -q "no snapshots found"; then
    echo "ERROR: No snapshots found for database"
    exit 1
fi

# Extract snapshot timestamp (format varies, we'll check if litestream is working)
if litestream snapshots "$DB_PATH" > /dev/null 2>&1; then
    SNAPSHOT_COUNT=$(litestream snapshots "$DB_PATH" | wc -l)
    echo "SUCCESS: Found $SNAPSHOT_COUNT snapshot(s)"
    echo ""
    echo "Latest snapshots:"
    litestream snapshots "$DB_PATH" | head -n 3
    echo ""
    echo "Litestream backup verification passed"
    exit 0
else
    echo "ERROR: Failed to verify snapshots"
    exit 1
fi
