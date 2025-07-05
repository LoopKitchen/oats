#!/bin/bash

# OATS Local Development Helper Script
# This script helps with linking/unlinking OATS for local development

set -e

PACKAGE_NAME="@tryloop/oats"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Detect package manager
detect_package_manager() {
    if [ -f "$PROJECT_ROOT/yarn.lock" ]; then
        echo "yarn"
    elif [ -f "$PROJECT_ROOT/package-lock.json" ]; then
        echo "npm"
    else
        echo "yarn" # Default to yarn
    fi
}

PM=$(detect_package_manager)

# Print usage
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  link       - Build and link OATS for local development"
    echo "  unlink     - Unlink OATS from global registry"
    echo "  status     - Check link status"
    echo "  dev        - Start development mode with watch"
    echo "  help       - Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 link    # Link OATS for local development"
    echo "  $0 dev     # Start development with auto-rebuild"
}

# Build the project
build_project() {
    echo -e "${YELLOW}Building OATS...${NC}"
    cd "$PROJECT_ROOT"
    
    if [ "$PM" = "yarn" ]; then
        yarn build
    else
        npm run build
    fi
    
    echo -e "${GREEN}✓ Build completed${NC}"
}

# Link the project
link_project() {
    echo -e "${YELLOW}Linking $PACKAGE_NAME...${NC}"
    cd "$PROJECT_ROOT"
    
    # First build
    build_project
    
    # Then link
    if [ "$PM" = "yarn" ]; then
        yarn link
    else
        npm link
    fi
    
    echo -e "${GREEN}✓ Successfully linked $PACKAGE_NAME${NC}"
    echo ""
    echo "To use in another project, run:"
    if [ "$PM" = "yarn" ]; then
        echo "  yarn link $PACKAGE_NAME"
    else
        echo "  npm link $PACKAGE_NAME"
    fi
}

# Unlink the project
unlink_project() {
    echo -e "${YELLOW}Unlinking $PACKAGE_NAME...${NC}"
    cd "$PROJECT_ROOT"
    
    if [ "$PM" = "yarn" ]; then
        yarn unlink || true
    else
        npm unlink || true
    fi
    
    echo -e "${GREEN}✓ Successfully unlinked $PACKAGE_NAME${NC}"
    echo ""
    echo "Remember to unlink from your test projects:"
    if [ "$PM" = "yarn" ]; then
        echo "  yarn unlink $PACKAGE_NAME"
        echo "  yarn install --force"
    else
        echo "  npm unlink $PACKAGE_NAME"
        echo "  npm install"
    fi
}

# Check link status
check_status() {
    echo -e "${YELLOW}Checking link status...${NC}"
    
    if [ "$PM" = "yarn" ]; then
        if yarn global list 2>/dev/null | grep -q "$PACKAGE_NAME"; then
            echo -e "${GREEN}✓ $PACKAGE_NAME is linked globally${NC}"
        else
            echo -e "${RED}✗ $PACKAGE_NAME is not linked${NC}"
        fi
    else
        if npm list -g --depth=0 2>/dev/null | grep -q "$PACKAGE_NAME"; then
            echo -e "${GREEN}✓ $PACKAGE_NAME is linked globally${NC}"
        else
            echo -e "${RED}✗ $PACKAGE_NAME is not linked${NC}"
        fi
    fi
    
    # Check if oats command is available
    if command -v oats &> /dev/null; then
        echo -e "${GREEN}✓ 'oats' command is available${NC}"
        oats --version
    else
        echo -e "${RED}✗ 'oats' command is not available${NC}"
    fi
}

# Start development mode
start_dev() {
    echo -e "${YELLOW}Starting development mode...${NC}"
    echo "This will watch for changes and rebuild automatically"
    echo ""
    cd "$PROJECT_ROOT"
    
    if [ "$PM" = "yarn" ]; then
        yarn build:watch
    else
        npm run build:watch
    fi
}

# Main script logic
case "$1" in
    link)
        link_project
        ;;
    unlink)
        unlink_project
        ;;
    status)
        check_status
        ;;
    dev)
        start_dev
        ;;
    help|--help|-h|"")
        usage
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        usage
        exit 1
        ;;
esac