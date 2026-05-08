#!/bin/bash

##############################################################################
# DSP Implementation Status - One-Time Setup Script
#
# This script performs the complete setup for DSP implementation status:
# 1. Runs database migrations (including migration 048)
# 2. Shows dry-run preview of DSP status changes
# 3. Applies DSP status updates automatically
# 4. Verifies everything is correct
#
# Usage:
#   bash server/scripts/dsp/setup-dsp-status.sh
#
# Prerequisites:
#   - Run on staging or production server
#   - Environment variables loaded (/etc/environment)
#   - Node.js and database accessible
##############################################################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "════════════════════════════════════════════════════════════"
echo "  DSP Implementation Status - One-Time Setup"
echo "════════════════════════════════════════════════════════════"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Must be run from project root${NC}"
    echo "   Current directory: $(pwd)"
    exit 1
fi

echo -e "${BLUE}Step 1: Loading environment variables${NC}"
echo "────────────────────────────────────────────────────────────"
if [ -f "/etc/environment" ]; then
    set -a
    source /etc/environment
    set +a
    echo -e "${GREEN}✓ Environment variables loaded${NC}"
else
    echo -e "${YELLOW}⚠️  /etc/environment not found - using existing environment${NC}"
fi
echo ""

echo -e "${BLUE}Step 2: Running database migrations${NC}"
echo "────────────────────────────────────────────────────────────"
echo "This will apply migration 048 and any other pending migrations..."
echo ""

node server/database/migrate.js up

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Migrations completed successfully${NC}"
else
    echo ""
    echo -e "${RED}❌ Migration failed${NC}"
    exit 1
fi
echo ""

echo -e "${BLUE}Step 3: Preview DSP status changes (dry-run)${NC}"
echo "────────────────────────────────────────────────────────────"
echo "Checking which curators will be marked as 'implemented'..."
echo ""

node server/scripts/dsp/update-dsp-status.js --dry-run --verbose

echo ""
echo -e "${YELLOW}⏸  Pausing for 3 seconds before applying changes...${NC}"
sleep 3
echo ""

echo -e "${BLUE}Step 4: Applying DSP status updates${NC}"
echo "────────────────────────────────────────────────────────────"
echo "Updating curator DSP implementation status based on historical usage..."
echo ""

node server/scripts/dsp/update-dsp-status.js

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ DSP status updates completed${NC}"
else
    echo ""
    echo -e "${RED}❌ DSP status update failed${NC}"
    exit 1
fi
echo ""

echo -e "${BLUE}Step 5: Running verification checks${NC}"
echo "────────────────────────────────────────────────────────────"
echo "Verifying everything is configured correctly..."
echo ""

node server/scripts/dsp/pre-deploy-check.js

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ All verification checks passed${NC}"
else
    echo ""
    echo -e "${RED}❌ Verification failed${NC}"
    echo -e "${YELLOW}   Please review the issues above before proceeding${NC}"
    exit 1
fi
echo ""

echo -e "${BLUE}Step 6: Database status summary${NC}"
echo "────────────────────────────────────────────────────────────"
echo ""

# Show curator status distribution
echo "Curator DSP Status Distribution:"
sqlite3 data/flowerpil.db "SELECT
    CASE
        WHEN dsp_implementation_status = 'implemented' THEN '  ✓ Implemented'
        WHEN dsp_implementation_status = 'not_yet_implemented' THEN '  ○ Not Yet Implemented'
        ELSE '  ? Unknown'
    END || ': ' || COUNT(*)
FROM curators
GROUP BY dsp_implementation_status;"

echo ""
echo "Total curators: $(sqlite3 data/flowerpil.db 'SELECT COUNT(*) FROM curators;')"
echo ""

echo "════════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ DSP Implementation Status Setup Complete!${NC}"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  • Migration 048 applied"
echo "  • DSP status retroactively detected and updated"
echo "  • All curators with historical DSP usage marked as 'implemented'"
echo "  • No curator lockout issues detected"
echo ""
echo "Next steps:"
echo "  • Review the output above to confirm correct assignments"
echo "  • Test curator access in admin dashboard"
echo "  • Monitor logs for any issues"
echo ""
echo -e "${GREEN}Safe to proceed with production use.${NC}"
echo ""
