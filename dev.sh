#!/bin/bash
# QSerial 开发模式一键启动
# 用法: ./dev.sh  或  bash dev.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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

# 路径定义 (node-linker=hoisted: 包在 node_modules/ 下为真实目录)
NODE="node"
TSC="node_modules/typescript/bin/tsc"
VITE="node_modules/vite/bin/vite.js"
ESBUILD_DIR="$SCRIPT_DIR/node_modules/@esbuild"
if [ -f "$ESBUILD_DIR/win32-x64/esbuild.exe" ]; then
  ESBUILD="$ESBUILD_DIR/win32-x64/esbuild.exe"
elif [ -f "$ESBUILD_DIR/linux-x64/bin/esbuild" ]; then
  ESBUILD="$ESBUILD_DIR/linux-x64/bin/esbuild"
else
  err_exit "esbuild 未找到 (tried win32-x64 & linux-x64)"
fi

ELECTRON_DIR="node_modules/electron/dist"
if [ -f "$ELECTRON_DIR/electron.exe" ]; then
  ELECTRON="$ELECTRON_DIR/electron.exe"
elif [ -f "$ELECTRON_DIR/electron" ]; then
  ELECTRON="$ELECTRON_DIR/electron"
else
  err_exit "electron 未找到"
fi

echo ""
echo "=========================================="
echo "  QSerial 开发模式一键启动"
echo "=========================================="
echo ""

# 检查 node_modules — 如果是 pnpm symlink 结构则自动安装
check_node_modules() {
  if [ -L "node_modules/node-pty" ]; then
    echo -e "${YELLOW}[check] node_modules 为 symlink 结构 (WSL pnpm 创建)${NC}"
    echo -e "${YELLOW}        .npmrc 已配置 node-linker=hoisted，正在运行 pnpm install...${NC}"
    if ! command -v pnpm >/dev/null 2>&1; then
      npm install -g pnpm 2>&1 | tail -1
    fi
    pnpm install --prefer-offline 2>&1 | tail -5 || err_exit "pnpm install 失败，请在 WSL 中手动运行"
    echo ""
  fi
}
check_node_modules

# 前置检查
echo -e "${YELLOW}[check] 检查环境...${NC}"
command -v node >/dev/null 2>&1 || err_exit "node 未找到，请安装 Node.js"
echo "  node: $(node --version)"

[ -f "$TSC" ]    || err_exit "tsc 未找到: $TSC"
[ -f "$VITE" ]   || err_exit "vite 未找到: $VITE"
[ -f "$ESBUILD" ] || err_exit "esbuild 未找到: $ESBUILD\n  (运行 npm install -g pnpm && pnpm install 即可)"
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
  --external:electron --external:serialport --external:ssh2 \
  --external:node-pty --external:tftp --external:electron-log \
  --external:uuid --external:'@serialport/*' \
  --alias:@qserial/shared=./packages/shared/src \
  --tsconfig=packages/main/tsconfig.json \
  || err_exit "main 编译失败"

"$ESBUILD" packages/main/src/preload.ts \
  --bundle --platform=node --format=cjs \
  --outfile=packages/main/dist/preload.cjs \
  --external:electron \
  --alias:@qserial/shared=./packages/shared/src \
  || err_exit "preload 编译失败"

echo -e "${GREEN}  ✓ main 完成 ($(du -sh packages/main/dist/index.mjs | cut -f1))${NC}"

# 启动
echo -e "${YELLOW}[3/3] 启动 Vite HMR + Electron...${NC}"
echo ""
echo "  Vite: http://localhost:5173"
echo "  UI 修改自动热更新"
echo "  关闭 Electron 窗口即停止"
echo ""

# 清理残留进程（上次未正常退出的 Electron / QSerial / Vite）
kill_残留() {
  local killed=0
  # 清理残留 Electron/QSerial 进程
  if command -v taskkill.exe >/dev/null 2>&1; then
    taskkill.exe /F /IM electron.exe >/dev/null 2>&1 && killed=1
    taskkill.exe /F /IM QSerial.exe >/dev/null 2>&1 && killed=1
  else
    pkill -f "electron.*packages/main/dist" 2>/dev/null && killed=1
    pkill -f "QSerial" 2>/dev/null && killed=1
  fi
  # 清理残留 Vite 进程
  VITE_PID_FILE=".vite.pid"
  if [ -f "$VITE_PID_FILE" ]; then
    OLD_PID=$(cat "$VITE_PID_FILE")
    kill "$OLD_PID" 2>/dev/null && killed=1
    rm "$VITE_PID_FILE"
  fi
  # 备用：通过端口强制清理 5173
  if command -v fuser >/dev/null 2>&1; then
    fuser -k 5173/tcp 2>/dev/null && killed=1
  elif command -v lsof >/dev/null 2>&1; then
    local pid
    pid=$(lsof -ti:5173 2>/dev/null)
    [ -n "$pid" ] && kill -9 $pid 2>/dev/null && killed=1
  fi
  # 清理 MCP 端口 9800
  if command -v fuser >/dev/null 2>&1; then
    fuser -k 9800/tcp 2>/dev/null && killed=1
  elif command -v lsof >/dev/null 2>&1; then
    local pid2
    pid2=$(lsof -ti:9800 2>/dev/null)
    [ -n "$pid2" ] && kill -9 $pid2 2>/dev/null && killed=1
  fi
  [ $killed -eq 1 ] && echo -e "  ${YELLOW}已清理残留进程${NC}" && sleep 1
}
kill_残留

VITE_PID_FILE=".vite.pid"

# 使用 vite.config.mjs (纯 JS) 避免 esbuild 解析 .ts 配置文件时的路径问题
(cd packages/renderer && $NODE "$SCRIPT_DIR/$VITE" --host --strictPort --config vite.config.mjs) &
VITE_PID=$!
echo $VITE_PID > "$VITE_PID_FILE"

sleep 4

export NODE_ENV=development
"$ELECTRON" packages/main/dist/index.mjs
ELECTRON_EXIT=$?

kill $VITE_PID 2>/dev/null
rm -f "$VITE_PID_FILE"

if [ $ELECTRON_EXIT -ne 0 ]; then
  echo ""
  echo -e "${RED}Electron exited with code $ELECTRON_EXIT${NC}"
  read -p "Press Enter to close..."
fi
