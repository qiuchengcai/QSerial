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
check_command pnpm
echo "  Node: $(node --version)"
echo "  pnpm: $(pnpm --version)"
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
pnpm install --engine-strict=false
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
pnpm build:shared
pnpm build:main
pnpm build:renderer
echo -e "${GREEN}  ✓ 项目构建完成${NC}"
echo ""

# 打包 Windows 免安装版
echo -e "${YELLOW}[4/5] 打包 Windows 免安装版...${NC}"
npx electron-builder --win dir --x64 -c electron-builder.config.cjs || true

# 修复 node-pty 原生模块：将 Windows 预编译文件复制到 build/Release/
node scripts/fix-node-pty-release.cjs

# 设置 exe 图标（使用 resedit 纯 JS 方式，不破坏 PE 结构，兼容网络磁盘运行）
if [ -f "release/win-unpacked/QSerial.exe" ]; then
  echo -e "${YELLOW}  设置 exe 图标...${NC}"
  node scripts/set-icon.cjs "$(pwd)/release/win-unpacked/QSerial.exe" "$(pwd)/build/icon.ico"
  echo -e "${GREEN}  ✓ 图标设置完成${NC}"
fi
echo -e "${GREEN}  ✓ 打包完成${NC}"
echo ""

# 检查结果
echo -e "${YELLOW}[5/5] 检查输出...${NC}"
if [ -f "release/win-unpacked/QSerial.exe" ]; then
  # 设置可执行权限，确保从网络磁盘(SMB共享)也能运行
  chmod +x release/win-unpacked/QSerial.exe release/win-unpacked/*.dll 2>/dev/null || true
  EXE_SIZE=$(ls -lh release/win-unpacked/QSerial.exe | awk '{print $5}')
  echo -e "${GREEN}  ✓ 构建成功!${NC}"
  echo ""
  echo "  输出目录: release/win-unpacked/"
  echo "  可执行文件: QSerial.exe ($EXE_SIZE)"
  echo ""
  echo "  将 release/win-unpacked/ 目录复制到 Windows 机器即可运行"
else
  echo -e "${RED}  ✗ 未找到 QSerial.exe，构建可能失败${NC}"
  exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}  编译完成!${NC}"
echo "=========================================="
