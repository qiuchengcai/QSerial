#!/bin/bash
# QSerial Windows 免安装版一键编译脚本
# 用法: chmod +x build-win.sh && ./build-win.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 自动配置 PATH：检测常用 Node/pnpm 安装路径
for dir in /opt/node-v23.6.0-linux-x64/bin /opt/node-v18.20.6-linux-x64/bin /root/.npm-global/bin /usr/local/bin; do
  case ":$PATH:" in
    *":$dir:"*) ;;
    *) export PATH="$dir:$PATH" ;;
  esac
done

echo ""
echo "=========================================="
echo "  QSerial Windows 免安装版编译"
echo "=========================================="
echo ""

# 环境检查
check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}错误: 未找到 $1，请先安装${NC}"
    exit 1
  fi
}

echo -e "${YELLOW}[1/5] 检查环境...${NC}"
check_command node

# 如果 pnpm 不在 PATH 中，通过 npx 调用
if command -v pnpm &>/dev/null; then
  PNPM=pnpm
else
  echo "  pnpm 未在 PATH 中，将通过 npx pnpm 调用"
  PNPM="npx pnpm"
fi

echo "  Node: $(node --version)"
echo "  pnpm: $($PNPM --version)"
echo ""

# 设置环境变量
export CSC_IDENTITY_AUTO_DISCOVERY=false
# 抑制第三方原生模块（cpu-features 等）的 C++ 编译警告
export CFLAGS="-Wno-cast-function-type"
export CXXFLAGS="-Wno-cast-function-type"
# 绕过 /home/qcc/.npmrc 目录挂载导致的 EISDIR 警告
export npm_config_userconfig="${TMPDIR:-/tmp}/npmrc"
touch "$npm_config_userconfig" 2>/dev/null || true

# 安装依赖
echo -e "${YELLOW}[2/5] 安装依赖...${NC}"
$PNPM install --engine-strict=false
echo -e "${GREEN}  ✓ 依赖安装完成${NC}"
echo ""

# 生成 ICO 图标（32bpp，小尺寸 BMP + 大尺寸 PNG）
echo -e "${YELLOW}  生成 ICO 图标...${NC}"
python3 "$(dirname "$0")/scripts/gen_icon_ico.py"
echo -e "${GREEN}  ✓ ICO 图标生成完成${NC}"

# 构建 TypeScript
echo -e "${YELLOW}[3/5] 构建项目...${NC}"
# 准备 ftp-srv 依赖（打平安装到 resources/ftp-node-modules）
node scripts/prepare-ftp-deps.cjs
$PNPM build:shared
$PNPM build:main
$PNPM build:renderer
echo -e "${GREEN}  ✓ 项目构建完成${NC}"
echo ""

# 打包 Windows 免安装版
echo -e "${YELLOW}[4/5] 打包 Windows 免安装版...${NC}"

# WSL2 drvfs (9P) 文件系统下，electron-builder 自清理旧产物时可能
# 遇到 I/O error 或 Permission denied，因为文件被 Windows 侧锁死。
# 解决方案：将 electron-builder 输出定向到 Linux 原生文件系统 (/tmp)，
# 构建完成后再复制回 release/。

BUILD_TMP="$(mktemp -d /tmp/qserial-build-XXXXXX)"

# 生成临时 electron-builder 配置：输出到 Linux 原生文件系统
cat > "$BUILD_TMP/eb-config.cjs" << EBEOF
const base = require('$(pwd)/electron-builder.config.cjs');
module.exports = {
  ...base,
  directories: { ...base.directories, output: '$BUILD_TMP/output' },
};
EBEOF

npx electron-builder --win dir --x64 -c "$BUILD_TMP/eb-config.cjs"

TMP_UNPACKED="$BUILD_TMP/output/win-unpacked"

# 在 Linux 原生 fs 上修复 node-pty（后续复制时会一起带走）
echo "  修复 node-pty..."
node scripts/fix-node-pty-release.cjs "$TMP_UNPACKED"

# 在 Linux 原生 fs 上设置 exe 图标
if [ -f "$TMP_UNPACKED/QSerial.exe" ]; then
  echo "  设置 exe 图标..."
  node scripts/set-icon.cjs "$TMP_UNPACKED/QSerial.exe" "$(pwd)/build/icon.ico"
fi

# 复制结果到 release/
# 旧 win-unpacked 目录可能因 WSL2 drvfs 锁死，先尝试直接清理
rm -rf release/win-unpacked 2>/dev/null || true

if [ -d "release/win-unpacked" ]; then
  # 清理失败，旧文件被 Windows 锁死，使用带时间戳的新目录
  FALLBACK_DIR="release/win-unpacked-$(date +%Y%m%d-%H%M%S)"
  echo -e "${YELLOW}  旧 release/win-unpacked 清理失败（文件被 Windows 锁死）${NC}"
  echo -e "${YELLOW}  改输出到 $FALLBACK_DIR${NC}"
  echo -e "${YELLOW}  请在 Windows 资源管理器中手动删除锁死的 release/win-unpacked 目录${NC}"
  mkdir -p "$FALLBACK_DIR"
  cp -r "$TMP_UNPACKED"/* "$FALLBACK_DIR"/
  WIN_UNPACKED_DIR="$FALLBACK_DIR"
else
  # 旧目录清理成功，正常使用
  mkdir -p release/win-unpacked
  echo "  复制产物到 release/win-unpacked/ ..."
  cp -r "$TMP_UNPACKED"/* release/win-unpacked/
  WIN_UNPACKED_DIR="release/win-unpacked"
fi

# 清理临时目录
rm -rf "$BUILD_TMP"
echo -e "${GREEN}  ✓ 打包完成${NC}"
echo ""

# 检查结果
echo -e "${YELLOW}[5/5] 检查输出...${NC}"
if [ -f "$WIN_UNPACKED_DIR/QSerial.exe" ]; then
  chmod +x "$WIN_UNPACKED_DIR/QSerial.exe" "$WIN_UNPACKED_DIR"/*.dll 2>/dev/null || true
  EXE_SIZE=$(ls -lh "$WIN_UNPACKED_DIR/QSerial.exe" | awk '{print $5}')
  echo -e "${GREEN}  ✓ 构建成功!${NC}"
  echo ""
  echo "  输出目录: $WIN_UNPACKED_DIR/"
  echo "  可执行文件: QSerial.exe ($EXE_SIZE)"
  echo ""
  echo "  将 $WIN_UNPACKED_DIR/ 目录复制到 Windows 机器即可运行"
else
  echo -e "${RED}  ✗ 未找到 QSerial.exe，构建可能失败${NC}"
  exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}  编译完成!${NC}"
echo "=========================================="
