#!/bin/bash
# QSerial Linux Build Script
# Supports Node.js 16+ (auto-detects GLIBC compatibility)
# Usage: ./build-linux.sh [--offline] [--clean] [--win]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ============================================
# Configuration
# ============================================

# 内网镜像源
MIRROR_BASE="https://mirrors.uniview.com"
NODE_MIRROR="$MIRROR_BASE/node"
NPM_REGISTRY="$MIRROR_BASE/npm/"

# Node.js 本地路径
LOCAL_NODE_DIR="/tmp"
NODE_VERSION="v16.20.2"  # 兼容 Ubuntu 18.04 (GLIBC 2.27)

# ============================================
# Environment Setup
# ============================================

# 检查 GLIBC 版本
get_glibc_version() {
    ldd --version 2>&1 | head -1 | grep -oP '\d+\.\d+' | head -1 || echo "2.27"
}

# 下载并安装 Node.js
download_node() {
    local node_dir="$LOCAL_NODE_DIR/node-$NODE_VERSION-linux-x64"
    local node_url="$NODE_MIRROR/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz"
    
    if [ -x "$node_dir/bin/node" ]; then
        echo -e "${GREEN}Node.js already installed at $node_dir${NC}"
        export NODE_BIN_DIR="$node_dir/bin"
        return 0
    fi
    
    echo -e "${YELLOW}Downloading Node.js $NODE_VERSION from mirror...${NC}"
    echo "  URL: $node_url"
    
    mkdir -p "$LOCAL_NODE_DIR"
    local tmp_file="/tmp/node-$NODE_VERSION-linux-x64.tar.xz"
    
    if curl -fsSL "$node_url" -o "$tmp_file"; then
        tar -xf "$tmp_file" -C "$LOCAL_NODE_DIR"
        rm -f "$tmp_file"
        export NODE_BIN_DIR="$node_dir/bin"
        echo -e "${GREEN}Node.js installed successfully${NC}"
        return 0
    else
        echo -e "${RED}[ERROR] Failed to download Node.js${NC}"
        return 1
    fi
}

# 查找可用的 Node.js
find_node() {
    local glibc_version=$(get_glibc_version)
    local glibc_major=$(echo "$glibc_version" | cut -d. -f1)
    local glibc_minor=$(echo "$glibc_version" | cut -d. -f2)
    
    # 默认值
    glibc_major=${glibc_major:-2}
    glibc_minor=${glibc_minor:-27}
    
    echo -e "${BLUE}Detected GLIBC version: $glibc_version${NC}"
    
    # GLIBC < 2.28 需要 Node.js 16
    if [ "$glibc_major" -eq 2 ] && [ "$glibc_minor" -lt 28 ]; then
        echo -e "${YELLOW}GLIBC < 2.28, using Node.js 16 for compatibility${NC}"
        NODE_VERSION="v16.20.2"
    else
        echo -e "${GREEN}GLIBC >= 2.28, can use Node.js 20+${NC}"
        NODE_VERSION="v20.20.2"
    fi
    
    # 检查已有安装
    local search_dirs=(
        "$LOCAL_NODE_DIR/node-v16.20.2-linux-x64/bin"
        "$LOCAL_NODE_DIR/node-v20.20.2-linux-x64/bin"
        "/tmp/qserial-nodejs/node-v16.20.2-linux-x64/bin"
        "/tmp/qserial-nodejs/node-v20.20.2-linux-x64/bin"
        "/opt/node-v16.20.2-linux-x64/bin"
        "/opt/node-v20.20.2-linux-x64/bin"
    )
    
    for bin_dir in "${search_dirs[@]}"; do
        if [ -x "$bin_dir/node" ]; then
            local version=$("$bin_dir/node" --version 2>/dev/null)
            if [ -n "$version" ]; then
                export NODE_BIN_DIR="$bin_dir"
                export PATH="$bin_dir:$PATH"
                echo -e "${GREEN}Found Node.js $version at $bin_dir${NC}"
                return 0
            fi
        fi
    done
    return 1
}

# Setup Node.js
setup_node() {
    if find_node; then
        return 0
    fi
    
    echo -e "${YELLOW}Node.js not found locally, downloading...${NC}"
    if download_node; then
        export PATH="$NODE_BIN_DIR:$PATH"
        return 0
    fi
    
    echo -e "${RED}[ERROR] Node.js setup failed${NC}"
    exit 1
}

# Setup pnpm with mirror
setup_pnpm() {
    local npm_bin="$NODE_BIN_DIR/npm"
    
    # 配置 npm 使用内网镜像
    mkdir -p ~/.npm-global
    cat > ~/.npmrc << 'EOF'
registry=https://mirrors.uniview.com/npm/
prefix=/home/q12444/.npm-global
EOF
    
    # 检查 pnpm 是否已安装
    if [ -x ~/.npm-global/bin/pnpm ]; then
        export PATH=~/.npm-global/bin:$PATH
        echo -e "${GREEN}pnpm already installed: $(pnpm --version)${NC}"
        return 0
    fi
    
    echo -e "${YELLOW}Installing pnpm via npm...${NC}"
    export PATH="$NODE_BIN_DIR":~/.npm-global/bin:$PATH
    "$npm_bin" install -g pnpm@8
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}pnpm installed: $(pnpm --version)${NC}"
    else
        echo -e "${RED}[ERROR] Failed to install pnpm${NC}"
        exit 1
    fi
}

# Setup environment
echo -e "${YELLOW}Setting up environment...${NC}"
setup_node
setup_pnpm

# Parse arguments
OFFLINE_MODE=false
CLEAN_MODE=false
BUILD_WIN=false

for arg in "$@"; do
    case $arg in
        --offline)
            OFFLINE_MODE=true
            shift
            ;;
        --clean)
            CLEAN_MODE=true
            shift
            ;;
        --win)
            BUILD_WIN=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --offline    Use offline mode for pnpm install"
            echo "  --clean      Clean release directory before build"
            echo "  --win        Build Windows version (cross-compile)"
            echo "  --help       Show this help message"
            exit 0
            ;;
    esac
done

echo ""
echo "=========================================="
echo -e "${BLUE}QSerial Linux Build Script${NC}"
echo "=========================================="
echo ""
echo "Working Directory: $SCRIPT_DIR"
echo "Node.js: $(node --version)"
echo "pnpm: $(pnpm --version)"
echo "Registry: $(pnpm config get registry)"
echo ""

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo -e "${RED}[ERROR] package.json not found${NC}"
    echo "Please run this script in project root directory"
    exit 1
fi

# Kill any running processes
echo -e "${YELLOW}Cleaning up previous processes...${NC}"
pkill -f "electron" 2>/dev/null || true
pkill -f "QSerial" 2>/dev/null || true
sleep 1

# Clean release directory
if [ "$CLEAN_MODE" = true ]; then
    echo -e "${YELLOW}Cleaning release directory...${NC}"
    rm -rf release 2>/dev/null || true
fi

echo ""

# Configure for native module compilation
export NODEJS_ORG_MIRROR="$MIRROR_BASE/node/"
export npm_config_nodedir="$LOCAL_NODE_DIR/node-$NODE_VERSION-linux-x64"
export ELECTRON_MIRROR="$MIRROR_BASE/electron/"

# Configure pnpm
echo -e "${YELLOW}Configuring pnpm...${NC}"
pnpm config set registry "$NPM_REGISTRY" 2>/dev/null || true
echo ""

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
if [ "$OFFLINE_MODE" = true ]; then
    echo "  Mode: Offline"
    pnpm install --offline --ignore-scripts
else
    echo "  Mode: Online"
    pnpm install --ignore-scripts
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR] Failed to install dependencies${NC}"
    exit 1
fi

# Rebuild native modules
echo -e "${YELLOW}Rebuilding native modules...${NC}"
export npm_config_nodedir="$LOCAL_NODE_DIR/node-$NODE_VERSION-linux-x64"
pnpm rebuild node-pty @serialport/bindings-cpp 2>&1 || true

# Fix execute permissions for app-builder
echo -e "${YELLOW}Fixing execute permissions...${NC}"
find node_modules/.pnpm -name "app-builder" -type f -exec chmod +x {} \; 2>/dev/null || true

echo -e "${GREEN}Dependencies installed!${NC}"
echo ""

# Build project
echo -e "${YELLOW}Building project...${NC}"
pnpm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR] Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}Build complete!${NC}"
echo ""

# Package app
echo -e "${YELLOW}Packaging Linux app...${NC}"
pnpm run package:linux

if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR] Package failed${NC}"
    exit 1
fi

# Build Windows version (optional)
if [ "$BUILD_WIN" = true ]; then
    echo ""
    echo -e "${YELLOW}Packaging Windows app (cross-compile)...${NC}"
    export CSC_IDENTITY_AUTO_DISCOVERY=false
    npx electron-builder --win --x64 -c electron-builder.config.cjs

    if [ $? -ne 0 ]; then
        echo -e "${RED}[ERROR] Windows package failed${NC}"
        exit 1
    fi
    echo -e "${GREEN}Windows package complete!${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}Build Complete!${NC}"
echo "=========================================="
echo ""

# Show output
echo "Generated files:"
if [ -d "release" ]; then
    find release -type f \( -name "*.AppImage" -o -name "*.deb" -o -name "*.exe" -o -name "*.dmg" \) -exec echo "  - {}" \;
    
    # Show file sizes
    echo ""
    echo "File sizes:"
    find release -type f \( -name "*.AppImage" -o -name "*.deb" -o -name "*.exe" -o -name "*.dmg" \) -exec du -h {} \;
    
    # Show unpacked directories
    echo ""
    echo "Unpacked directories:"
    find release -type d -name "*-unpacked" -exec echo "  - {}" \; 2>/dev/null || true
else
    echo "  No release directory found"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
