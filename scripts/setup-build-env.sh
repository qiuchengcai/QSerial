#!/bin/bash
# QSerial 构建环境配置脚本
# 用于配置 Linux 开发环境

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "=========================================="
echo -e "${BLUE}QSerial 构建环境配置${NC}"
echo "=========================================="
echo ""

# 检查 Node.js
check_node() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
        
        echo -e "${GREEN}✓${NC} Node.js: $NODE_VERSION"
        
        if [ "$NODE_MAJOR" -lt 20 ]; then
            echo -e "${YELLOW}  警告: Node.js 版本过低，建议 >= 20.0.0${NC}"
        fi
        return 0
    else
        echo -e "${RED}✗${NC} Node.js 未安装"
        return 1
    fi
}

# 检查 pnpm
check_pnpm() {
    if command -v pnpm &> /dev/null; then
        PNPM_VERSION=$(pnpm --version)
        echo -e "${GREEN}✓${NC} pnpm: $PNPM_VERSION"
        return 0
    else
        echo -e "${RED}✗${NC} pnpm 未安装"
        echo ""
        echo "安装方法:"
        echo "  npm install -g pnpm@8"
        echo "  或使用 corepack:"
        echo "  corepack enable && corepack prepare pnpm@8.15.0 --activate"
        return 1
    fi
}

# 检查 cmake
check_cmake() {
    if command -v cmake &> /dev/null; then
        echo -e "${GREEN}✓${NC} cmake: $(cmake --version | head -1)"
        return 0
    else
        echo -e "${YELLOW}○${NC} cmake 未安装 (原生模块编译需要)"
        return 0
    fi
}

# 检查 MinGW
check_mingw() {
    if command -v x86_64-w64-mingw32-g++ &> /dev/null; then
        echo -e "${GREEN}✓${NC} MinGW (x86_64): 已安装"
        return 0
    else
        echo -e "${YELLOW}○${NC} MinGW 未安装 (交叉编译需要)"
        echo ""
        echo "安装方法:"
        echo "  Ubuntu/Debian: sudo apt-get install mingw-w64"
        echo "  CentOS/RHEL:   sudo yum install mingw64-gcc-c++"
        return 0
    fi
}

# 检查编译工具
check_build_tools() {
    if command -v g++ &> /dev/null; then
        echo -e "${GREEN}✓${NC} g++: 已安装"
    else
        echo -e "${YELLOW}○${NC} g++ 未安装"
    fi
    
    if command -v make &> /dev/null; then
        echo -e "${GREEN}✓${NC} make: 已安装"
    else
        echo -e "${YELLOW}○${NC} make 未安装"
    fi
}

# 配置 npm 镜像
configure_mirror() {
    echo ""
    echo -e "${BLUE}配置镜像源...${NC}"
    
    # 检测可用的镜像
    local mirrors=(
        "https://mirrors.uniview.com/npm/"
        "https://registry.npmmirror.com/"
        "https://registry.npmjs.org/"
    )
    
    for mirror in "${mirrors[@]}"; do
        echo -n "测试 $mirror ... "
        if curl -sI "$mirror" --connect-timeout 3 2>/dev/null | grep -q "HTTP"; then
            echo -e "${GREEN}可用${NC}"
            
            # 配置 npm
            npm config set registry "$mirror"
            echo -e "${GREEN}✓${NC} 已配置 npm 镜像: $mirror"
            
            # 创建/更新 .npmrc
            echo "registry=$mirror" > .npmrc
            echo "electron_mirror=https://mirrors.uniview.com/electron/" >> .npmrc
            
            return 0
        else
            echo -e "${RED}不可用${NC}"
        fi
    done
    
    echo -e "${YELLOW}警告: 无法访问任何镜像源${NC}"
    return 1
}

# 主检查流程
echo -e "${BLUE}检查环境...${NC}"
echo ""

ERRORS=0

check_node || ((ERRORS++))
check_pnpm || ((ERRORS++))
check_cmake
check_mingw
check_build_tools

echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}存在必需工具缺失，请先安装${NC}"
    echo ""
    exit 1
fi

# 配置镜像
configure_mirror

echo ""
echo -e "${GREEN}环境检查完成！${NC}"
echo ""
echo "后续步骤:"
echo "  1. pnpm install              # 安装依赖"
echo "  2. pnpm build                # 构建项目"
echo "  3. pnpm package:linux        # 打包 Linux 版"
echo "     或"
echo "     ./build-win-cross.sh      # 交叉编译 Windows 版"
echo ""
