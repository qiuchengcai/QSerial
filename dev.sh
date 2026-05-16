#!/bin/bash
# QSerial 开发模式一键启动
# 用法: ./dev.sh  或  bash dev.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 路径定义
NODE="node"
TSC="node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc"
VITE="node_modules/.pnpm/vite@5.4.21_@types+node@20.19.40/node_modules/vite/bin/vite.js"
ESBUILD="$SCRIPT_DIR/node_modules/.pnpm/esbuild@0.21.5/node_modules/@esbuild/win32-x64/esbuild.exe"
ELECTRON="node_modules/.pnpm/electron@28.3.3/node_modules/electron/dist/electron.exe"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

err_exit() {
  echo ""
  echo -e "${RED}[ERROR]${NC} $1"
  echo ""
  read -p "Press Enter to exit..."
  exit 1
}

echo ""
echo "=========================================="
echo "  QSerial 开发模式一键启动"
echo "=========================================="
echo ""

# 前置检查
echo -e "${YELLOW}[check] 检查环境...${NC}"
command -v node >/dev/null 2>&1 || err_exit "node 未找到，请安装 Node.js"
echo "  node: $(node --version)"

[ -f "$TSC" ]    || err_exit "tsc 未找到: $TSC"
[ -f "$VITE" ]   || err_exit "vite 未找到: $VITE"
[ -f "$ESBUILD" ] || err_exit "esbuild 未找到: $ESBUILD\n  (需要 Windows 版本，运行: \n   curl ... 下载 @esbuild/win32-x64)"
[ -f "$ELECTRON" ] || err_exit "electron 未找到: $ELECTRON"
echo -e "${GREEN}  ✓ 环境检查通过${NC}"
echo ""

# 编译
echo -e "${YELLOW}[1/3] 编译 shared 包...${NC}"
$NODE "$TSC" -p packages/shared/tsconfig.json --skipLibCheck || err_exit "shared 编译失败"
echo -e "${GREEN}  ✓ shared 完成${NC}"

echo -e "${YELLOW}[2/3] 编译 main 包...${NC}"
"$ESBUILD" packages/main/src/index.ts \
  --bundle --platform=node --format=esm \
  --outfile=packages/main/dist/index.mjs \
  --external:serialport --external:ssh2 \
  --external:node-pty --external:tftp --external:electron-log \
  --external:uuid --external:'@serialport/*' \
  --tsconfig=packages/main/tsconfig.json \
  || err_exit "main 编译失败"

"$ESBUILD" packages/main/src/preload.ts \
  --bundle --platform=node --format=cjs \
  --outfile=packages/main/dist/preload.cjs \
  --external:electron \
  || err_exit "preload 编译失败"
echo -e "${GREEN}  ✓ main 完成 ($(du -sh packages/main/dist/index.mjs | cut -f1))${NC}"

# 启动
echo -e "${YELLOW}[3/3] 启动 Vite HMR + Electron...${NC}"
echo ""
echo "  Vite: http://localhost:5173"
echo "  UI 修改自动热更新"
echo "  关闭 Electron 窗口即停止"
echo ""

export ESBUILD_BINARY_PATH="$ESBUILD"
(cd packages/renderer && $NODE "$SCRIPT_DIR/$VITE" --host --strictPort) &
VITE_PID=$!

sleep 4

export NODE_ENV=development
"$ELECTRON" packages/main/dist/index.cjs
ELECTRON_EXIT=$?

kill $VITE_PID 2>/dev/null

if [ $ELECTRON_EXIT -ne 0 ]; then
  echo ""
  echo -e "${RED}Electron exited with code $ELECTRON_EXIT${NC}"
  read -p "Press Enter to close..."
fi
