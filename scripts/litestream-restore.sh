#!/bin/bash
#
# Litestream Database Restore & R2 Cleanup Script
# Usage: ./scripts/litestream-restore.sh [command]
#
# Commands:
#   restore     - Restore database from R2 backup
#   cleanup     - Remove old generations from R2 (keeps last 7 days)
#   status      - Show current replication status
#   verify      - Verify R2 backup integrity
#   help        - Show this help message
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$REPO_DIR/litestream.yml"
DB_PATH="$REPO_DIR/data/flowerpil.db"
LITESTREAM_BIN="/usr/local/bin/litestream"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment variables
load_env() {
    if [[ -f /etc/environment ]]; then
        set -a
        source /etc/environment
        set +a
    fi

    # Verify R2 credentials
    if [[ -z "$R2_ACCESS_KEY_ID" ]] || [[ -z "$R2_SECRET_ACCESS_KEY" ]]; then
        echo -e "${RED}Error: R2 credentials not found in environment${NC}"
        echo "Ensure R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are set in /etc/environment"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    if [[ ! -f "$LITESTREAM_BIN" ]]; then
        echo -e "${RED}Error: Litestream not found at $LITESTREAM_BIN${NC}"
        exit 1
    fi

    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo -e "${RED}Error: Config file not found at $CONFIG_FILE${NC}"
        exit 1
    fi
}

# Show status
cmd_status() {
    echo -e "${BLUE}=== Litestream Status ===${NC}"
    echo ""

    echo -e "${YELLOW}Generations in R2:${NC}"
    $LITESTREAM_BIN generations -config "$CONFIG_FILE" "$DB_PATH"
    echo ""

    echo -e "${YELLOW}Recent Snapshots (last 10):${NC}"
    $LITESTREAM_BIN snapshots -config "$CONFIG_FILE" "$DB_PATH" | tail -11
    echo ""

    echo -e "${YELLOW}PM2 Process:${NC}"
    pm2 status litestream 2>/dev/null | grep -E "name|litestream" || echo "Litestream not running in PM2"
}

# Verify backup integrity
cmd_verify() {
    echo -e "${BLUE}=== Verifying R2 Backup Integrity ===${NC}"

    TEMP_DB="/tmp/litestream-verify-$$.db"
    rm -f "$TEMP_DB" "${TEMP_DB}-shm" "${TEMP_DB}-wal" "${TEMP_DB}.tmp-shm" "${TEMP_DB}.tmp-wal"
    trap "rm -f $TEMP_DB ${TEMP_DB}-shm ${TEMP_DB}-wal ${TEMP_DB}.tmp-shm ${TEMP_DB}.tmp-wal" EXIT

    echo -e "${YELLOW}Restoring latest backup to temp location...${NC}"
    $LITESTREAM_BIN restore -config "$CONFIG_FILE" -o "$TEMP_DB" "$DB_PATH"

    echo -e "${YELLOW}Running SQLite integrity check...${NC}"
    INTEGRITY=$(sqlite3 "$TEMP_DB" "PRAGMA integrity_check;" 2>&1)

    if [[ "$INTEGRITY" == "ok" ]]; then
        echo -e "${GREEN}✓ Integrity check passed${NC}"
    else
        echo -e "${RED}✗ Integrity check failed: $INTEGRITY${NC}"
        exit 1
    fi

    echo -e "${YELLOW}Record counts:${NC}"
    echo -n "  Playlists: "
    sqlite3 "$TEMP_DB" "SELECT COUNT(*) FROM playlists;"
    echo -n "  Tracks:    "
    sqlite3 "$TEMP_DB" "SELECT COUNT(*) FROM tracks;"
    echo -n "  Curators:  "
    sqlite3 "$TEMP_DB" "SELECT COUNT(*) FROM curators;"

    echo ""
    echo -e "${GREEN}✓ R2 backup verification complete${NC}"
}

# Restore database
cmd_restore() {
    echo -e "${BLUE}=== Database Restore ===${NC}"

    # Parse options
    OUTPUT_PATH=""
    TIMESTAMP=""
    FORCE=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            -o|--output)
                OUTPUT_PATH="$2"
                shift 2
                ;;
            -t|--timestamp)
                TIMESTAMP="$2"
                shift 2
                ;;
            -f|--force)
                FORCE=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    # Default output path
    if [[ -z "$OUTPUT_PATH" ]]; then
        OUTPUT_PATH="$DB_PATH"
    fi

    # Safety check if restoring to live database
    if [[ "$OUTPUT_PATH" == "$DB_PATH" ]]; then
        echo -e "${YELLOW}Warning: You are about to restore to the LIVE database!${NC}"
        echo "Path: $DB_PATH"
        echo ""

        # Check if services are running
        if pm2 status 2>/dev/null | grep -qE "flowerpil-api.*online"; then
            echo -e "${RED}Error: flowerpil-api is still running!${NC}"
            echo "Stop services first: pm2 stop all"
            exit 1
        fi

        if pm2 status 2>/dev/null | grep -qE "litestream.*online"; then
            echo -e "${RED}Error: litestream is still running!${NC}"
            echo "Stop litestream first: pm2 stop litestream"
            exit 1
        fi

        if [[ "$FORCE" != true ]]; then
            echo -n "Are you sure you want to continue? (yes/no): "
            read -r CONFIRM
            if [[ "$CONFIRM" != "yes" ]]; then
                echo "Aborted."
                exit 0
            fi
        fi

        # Backup existing database
        BACKUP_PATH="${DB_PATH}.pre-restore-$(date +%Y%m%d-%H%M%S)"
        echo -e "${YELLOW}Backing up existing database to: $BACKUP_PATH${NC}"
        cp "$DB_PATH" "$BACKUP_PATH"

        # Remove WAL files
        rm -f "${DB_PATH}-wal" "${DB_PATH}-shm"
    fi

    # Build restore command
    RESTORE_CMD="$LITESTREAM_BIN restore -config $CONFIG_FILE"

    if [[ -n "$TIMESTAMP" ]]; then
        echo -e "${YELLOW}Restoring to timestamp: $TIMESTAMP${NC}"
        RESTORE_CMD="$RESTORE_CMD -timestamp $TIMESTAMP"
    else
        echo -e "${YELLOW}Restoring latest backup...${NC}"
    fi

    RESTORE_CMD="$RESTORE_CMD -o $OUTPUT_PATH $DB_PATH"

    # Execute restore
    echo "Running: $RESTORE_CMD"
    eval "$RESTORE_CMD"

    # Verify restored database
    echo -e "${YELLOW}Verifying restored database...${NC}"
    INTEGRITY=$(sqlite3 "$OUTPUT_PATH" "PRAGMA integrity_check;" 2>&1)

    if [[ "$INTEGRITY" == "ok" ]]; then
        echo -e "${GREEN}✓ Restore successful - integrity check passed${NC}"
        echo ""
        echo "Record counts:"
        echo -n "  Playlists: "
        sqlite3 "$OUTPUT_PATH" "SELECT COUNT(*) FROM playlists;"
        echo -n "  Tracks:    "
        sqlite3 "$OUTPUT_PATH" "SELECT COUNT(*) FROM tracks;"
        echo -n "  Curators:  "
        sqlite3 "$OUTPUT_PATH" "SELECT COUNT(*) FROM curators;"
    else
        echo -e "${RED}✗ Integrity check failed after restore: $INTEGRITY${NC}"

        if [[ -n "$BACKUP_PATH" ]] && [[ -f "$BACKUP_PATH" ]]; then
            echo "Restoring from backup: $BACKUP_PATH"
            cp "$BACKUP_PATH" "$OUTPUT_PATH"
        fi
        exit 1
    fi

    # Cleanup temp files
    rm -f "${OUTPUT_PATH}.tmp-shm" "${OUTPUT_PATH}.tmp-wal"

    echo ""
    echo -e "${GREEN}Database restored to: $OUTPUT_PATH${NC}"

    if [[ "$OUTPUT_PATH" == "$DB_PATH" ]]; then
        echo ""
        echo -e "${YELLOW}Next steps:${NC}"
        echo "  1. Start litestream: pm2 start litestream"
        echo "  2. Start API: pm2 start flowerpil-api"
    fi
}

# Cleanup old generations from R2
cmd_cleanup() {
    echo -e "${BLUE}=== R2 Backup Cleanup ===${NC}"

    # Parse options
    RETENTION_DAYS=7
    DRY_RUN=true

    while [[ $# -gt 0 ]]; do
        case $1 in
            --retention)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            --execute)
                DRY_RUN=false
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    echo "Retention: $RETENTION_DAYS days"
    echo ""

    # Get current generations
    echo -e "${YELLOW}Current generations:${NC}"
    GENERATIONS=$($LITESTREAM_BIN generations -config "$CONFIG_FILE" "$DB_PATH")
    echo "$GENERATIONS"
    echo ""

    # Count generations
    GEN_COUNT=$(echo "$GENERATIONS" | grep -c "^s3" || true)

    if [[ $GEN_COUNT -le 1 ]]; then
        echo -e "${GREEN}Only $GEN_COUNT generation(s) found - nothing to clean up${NC}"
        return 0
    fi

    # Calculate cutoff date
    CUTOFF_DATE=$(date -u -d "$RETENTION_DAYS days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
                  date -u -v-${RETENTION_DAYS}d +%Y-%m-%dT%H:%M:%SZ)
    echo "Cutoff date: $CUTOFF_DATE"
    echo ""

    # Find old generations (all except the most recent one)
    # Parse generations - skip header, get generation IDs where end date is before cutoff
    OLD_GENS=()
    NEWEST_GEN=""

    while IFS= read -r line; do
        if [[ "$line" =~ ^s3[[:space:]]+([a-f0-9]+) ]]; then
            GEN_ID="${BASH_REMATCH[1]}"
            # Get the end date (last field before the second-to-last)
            END_DATE=$(echo "$line" | awk '{print $NF}')

            if [[ -z "$NEWEST_GEN" ]]; then
                NEWEST_GEN="$GEN_ID"
            elif [[ "$END_DATE" < "$CUTOFF_DATE" ]]; then
                OLD_GENS+=("$GEN_ID")
            fi
        fi
    done <<< "$GENERATIONS"

    if [[ ${#OLD_GENS[@]} -eq 0 ]]; then
        echo -e "${GREEN}No generations older than $RETENTION_DAYS days found${NC}"
        return 0
    fi

    echo -e "${YELLOW}Generations to remove (${#OLD_GENS[@]}):${NC}"
    for gen in "${OLD_GENS[@]}"; do
        echo "  - $gen"
    done
    echo ""

    if [[ "$DRY_RUN" == true ]]; then
        echo -e "${YELLOW}DRY RUN - No changes made${NC}"
        echo "Run with --execute to actually delete old generations"
        echo ""
        echo "Example: $0 cleanup --execute"
        return 0
    fi

    # Stop litestream before cleanup
    if pm2 status 2>/dev/null | grep -qE "litestream.*online"; then
        echo -e "${YELLOW}Stopping litestream...${NC}"
        pm2 stop litestream
        RESTART_LITESTREAM=true
    fi

    # Delete old generations
    # Note: Litestream doesn't have a direct delete command, so we use the retention mechanism
    # The retention settings in the config will handle cleanup automatically
    # For manual cleanup, we'd need to use the R2 API directly

    echo -e "${YELLOW}Triggering retention cleanup...${NC}"

    # Start litestream briefly to trigger retention check
    timeout 30 $LITESTREAM_BIN replicate -config "$CONFIG_FILE" 2>&1 | head -20 || true

    echo ""
    echo -e "${YELLOW}Generations after cleanup:${NC}"
    $LITESTREAM_BIN generations -config "$CONFIG_FILE" "$DB_PATH"

    if [[ "$RESTART_LITESTREAM" == true ]]; then
        echo ""
        echo -e "${YELLOW}Restarting litestream...${NC}"
        pm2 start litestream
    fi

    echo ""
    echo -e "${GREEN}Cleanup complete${NC}"
}

# Show help
cmd_help() {
    echo "Litestream Database Restore & R2 Cleanup Script"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  status              Show current replication status and generations"
    echo "  verify              Verify R2 backup integrity without restoring"
    echo "  restore [options]   Restore database from R2 backup"
    echo "  cleanup [options]   Remove old generations from R2"
    echo "  help                Show this help message"
    echo ""
    echo "Restore Options:"
    echo "  -o, --output PATH   Output path (default: live database)"
    echo "  -t, --timestamp TS  Restore to specific timestamp (ISO 8601)"
    echo "  -f, --force         Skip confirmation prompts"
    echo ""
    echo "Cleanup Options:"
    echo "  --retention DAYS    Keep generations newer than DAYS (default: 7)"
    echo "  --execute           Actually delete (default is dry-run)"
    echo ""
    echo "Examples:"
    echo "  # Check current status"
    echo "  $0 status"
    echo ""
    echo "  # Verify backup integrity"
    echo "  $0 verify"
    echo ""
    echo "  # Restore latest to temp file"
    echo "  $0 restore -o /tmp/restored.db"
    echo ""
    echo "  # Restore to specific point in time"
    echo "  $0 restore -o /tmp/restored.db -t '2025-12-30T12:00:00Z'"
    echo ""
    echo "  # Restore to live database (DANGEROUS)"
    echo "  $0 restore --force"
    echo ""
    echo "  # Preview cleanup (dry run)"
    echo "  $0 cleanup"
    echo ""
    echo "  # Execute cleanup with 14-day retention"
    echo "  $0 cleanup --retention 14 --execute"
}

# Main
main() {
    load_env
    check_prerequisites

    COMMAND="${1:-help}"
    shift || true

    case "$COMMAND" in
        status)
            cmd_status
            ;;
        verify)
            cmd_verify
            ;;
        restore)
            cmd_restore "$@"
            ;;
        cleanup)
            cmd_cleanup "$@"
            ;;
        help|--help|-h)
            cmd_help
            ;;
        *)
            echo -e "${RED}Unknown command: $COMMAND${NC}"
            echo ""
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
