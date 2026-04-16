#!/bin/bash
# QSerial Windows Cross-Compilation Build Script (Linux -> Windows)
# 
# 使用方法：
#   chmod +x build-win-cross.sh
#   ./build-win-cross.sh
#
# 注意：由于原生模块限制，推荐使用 GitHub Actions 构建 Windows 版本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "=========================================="
echo -e "${BLUE}QSerial Windows 交叉编译构建${NC}"
echo "=========================================="
echo ""

# 设置环境
export PATH="/opt/node-v23.6.0-linux-x64/bin:/root/.npm-global/bin:$PATH"
export ELECTRON_MIRROR="https://mirrors.uniview.com/electron/"
export CSC_IDENTITY_AUTO_DISCOVERY=false

echo -e "${YELLOW}注意: 当前网络环境有限制，推荐使用 GitHub Actions 构建${NC}"
echo ""
echo "已创建以下构建方案文件："
echo "  1. .github/workflows/build.yml - GitHub Actions CI 配置"
echo "  2. docs/Linux交叉编译Windows版本指南.md - 详细文档"
echo ""

# 检查环境
echo -e "${BLUE}检查环境...${NC}"
node --version
pnpm --version
echo ""

# 构建步骤
echo -e "${YELLOW}[1/3] 构建 TypeScript...${NC}"
pnpm build:shared
pnpm build:main
pnpm build:renderer
echo -e "${GREEN}✓ TypeScript 构建完成${NC}"

echo ""
echo -e "${YELLOW}[2/3] 打包 Windows 目录版本...${NC}"
npx electron-builder --win dir --x64 2>&1 | tail -10 || true

echo ""
echo -e "${YELLOW}[3/3] 检查输出...${NC}"
if [ -f "release/win-unpacked/QSerial.exe" ]; then
    echo -e "${GREEN}✓ Windows 版本已生成: release/win-unpacked/QSerial.exe${NC}"
    ls -lh release/win-unpacked/QSerial.exe
else
    echo -e "${YELLOW}Windows 版本未生成，请使用 GitHub Actions CI 构建${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}构建完成！${NC}"
echo "=========================================="
echo ""
echo "推荐使用 GitHub Actions 构建完整 Windows 安装包:"
echo "  git tag v0.1.0"
echo "  git push origin v0.1.0"
echo ""
