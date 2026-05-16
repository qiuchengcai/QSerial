#!/bin/bash
# QSerial 开发模式一键启动
# 用法: ./dev.sh  或  bash dev.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 路径定义
NODE="node"
TSC="node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc"
VITE="node_modules/.pnpm/vite@5.4.21_@types+node@20.19.40/node_modules/vite/bin/vite.js"
ESBUILD="$SCRIPT_DIR/node_modules/.pnpm/esbuild@0.21.5/node_modules/@esbuild/win32-x64/esbuild.exe"
ELECTRON="node_modules/.pnpm/electron@28.3.3/node_modules/electron/dist/electron.exe"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "=========================================="
echo "  QSerial 开发模式一键启动"
echo "=========================================="
echo ""

echo -e "${YELLOW}[1/3] 编译 shared 包...${NC}"
$NODE "$TSC" -p packages/shared/tsconfig.json --skipLibCheck
echo -e "${GREEN}  ✓ shared 完成${NC}"

echo -e "${YELLOW}[2/3] 编译 main 包...${NC}"
$NODE "$TSC" -p packages/main/tsconfig.json --skipLibCheck
echo -e "${GREEN}  ✓ main 完成${NC}"

echo -e "${YELLOW}[3/3] 启动 Vite HMR + Electron...${NC}"
echo ""
echo "  ┌──────────────────────────────────────┐"
echo "  │  Vite 开发服务器: http://localhost:5173  │"
echo "  │  UI 修改自动热更新，无需重新编译        │"
echo "  │  关闭 Electron 窗口即可停止             │"
echo "  └──────────────────────────────────────┘"
echo ""

# 后台启动 Vite
export ESBUILD_BINARY_PATH="$ESBUILD"
(cd packages/renderer && $NODE "$SCRIPT_DIR/$VITE" --host --strictPort) &
VITE_PID=$!

# 等待 Vite 就绪
sleep 4

# 启动 Electron（前台，关窗即退出）
export NODE_ENV=development
"$ELECTRON" packages/main/dist/index.js

# Electron 关闭后，停掉 Vite
kill $VITE_PID 2>/dev/null
