#!/bin/bash

# Script to check latest versions of Docker images used in sanctum
# Usage: bash backend/scripts/check-versions.sh

set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSIONS_FILE="$ROOT_DIR/infra/versions.env"

if [ ! -f "$VERSIONS_FILE" ]; then
    echo "Missing $VERSIONS_FILE"
    exit 1
fi

# shellcheck disable=SC1090
source "$VERSIONS_FILE"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Sanctum Docker Image Version Checker"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to check image version
check_image() {
    local image=$1
    local name=$2
    local current_version=$3
    local repo_path
    
    echo -n "🔍 Checking $name... "
    
    # Get the latest tag from Docker Hub API
    # Note: This requires jq to be installed. If not available, use simpler approach
    if command -v jq &> /dev/null; then
        if [[ "$image" == */* ]]; then
            repo_path="$image"
        else
            repo_path="library/$image"
        fi
        # Try to get latest tag (simple approach - gets a few tags)
        latest=$(curl -s "https://registry.hub.docker.com/v2/repositories/$repo_path/tags?page_size=1" | jq -r '.results[0].name' 2>/dev/null || echo "unknown")
        
        if [ "$latest" != "unknown" ] && [ -n "$latest" ]; then
            if [ "$current_version" = "$latest" ]; then
                echo -e "${GREEN}✓ Up to date ($latest)${NC}"
            else
                echo -e "${YELLOW}⚠ Update available: $current_version → $latest${NC}"
            fi
        else
            echo -e "${BLUE}ℹ Check manually on Docker Hub${NC}"
        fi
    else
        echo -e "${BLUE}ℹ Install 'jq' for automated version checking${NC}"
        echo "  https://hub.docker.com/_/$image"
    fi
}

# Check each image
echo -e "${BLUE}Backend:${NC}"
check_image "golang" "Go" "$GO_VERSION"

echo ""
echo -e "${BLUE}Database:${NC}"
check_image "postgres" "PostgreSQL" "$POSTGRES_VERSION"
check_image "redis" "Redis" "$REDIS_VERSION"

echo ""
echo -e "${BLUE}Frontend:${NC}"
check_image "oven/bun" "Bun" "$BUN_ALPINE_TAG"
check_image "nginx" "nginx" "$NGINX_VERSION"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 To install jq for better version checking:"
echo "  - macOS: brew install jq"
echo "  - Ubuntu/Debian: sudo apt-get install jq"
echo "  - Alpine: apk add jq"
echo ""
echo "🔗 Docker Hub Registry: https://hub.docker.com"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
