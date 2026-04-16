# Linux 交叉编译 Windows 版本指南

本文档说明如何在 Linux 开发环境中交叉编译 QSerial 的 Windows 可执行文件。

## ⚠️ 重要限制

由于项目使用了两个原生 Node.js 模块，交叉编译存在以下限制：

| 模块 | Linux → Windows 交叉编译 | 说明 |
|------|-------------------------|------|
| `node-pty` | ❌ **不支持** | 依赖 Windows Console API (`conpty.dll`)，无法交叉编译 |
| `@serialport/bindings-cpp` | ✅ 可以 | 使用 MinGW 可以交叉编译 |

**结论**：PTY 功能（本地终端）在交叉编译版本中无法使用。如需完整功能，请使用 GitHub Actions CI 或 Windows 构建机。

---

## 方案一：跳过 node-pty（推荐快速验证）

如果只需要串口功能，可以跳过 PTY 模块：

```bash
# 1. 安装依赖
pnpm install --ignore-scripts

# 2. 构建代码
pnpm build:shared
pnpm build:main  
pnpm build:renderer

# 3. 交叉编译 serialport
npx @electron/rebuild -f -w @serialport/bindings-cpp \
    --platform=win32 --arch=x64 \
    --electron-version=28.2.0

# 4. 打包
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package:win
```

---

## 方案二：使用预编译 .node 文件

从 Windows 机器提取预编译的原生模块文件。

### 步骤 1: 在 Windows 机器上编译

```powershell
# Windows 上执行
cd QSerial
pnpm install
pnpm build

# 找到编译好的 .node 文件
Get-ChildItem -Recurse -Filter "*.node" node_modules
```

输出类似：
```
node_modules/node-pty/build/Release/pty.node
node_modules/@serialport/bindings-cpp/build/Release/serialport.node
```

### 步骤 2: 复制到 Linux

将 `.node` 文件复制到 Linux 项目的 `prebuilt/win32-x64/` 目录：

```
QSerial/
└── prebuilt/
    └── win32-x64/
        ├── pty.node
        └── serialport.node
```

### 步骤 3: 构建脚本集成

修改 `electron-builder.config.cjs`，添加预编译文件：

```javascript
extraResources: [
  {
    from: 'prebuilt/win32-x64',
    to: 'prebuilt',
    filter: ['**/*.node'],
  },
],
```

---

## 方案三：GitHub Actions CI（完整功能推荐）

创建 `.github/workflows/build.yml`：

```yaml
name: Build Windows

on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build-win:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
          
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          
      - run: pnpm install
      - run: pnpm build
      
      - run: pnpm package:win
      
      - uses: actions/upload-artifact@v4
        with:
          name: QSerial-win-x64
          path: release/*.exe
```

Linux 开发完成后：
```bash
git tag v0.1.0
git push origin v0.1.0
# 自动触发 CI 构建 Windows 版
```

---

## 环境准备

### 安装依赖工具

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y \
    nodejs npm \
    cmake \
    mingw-w64 \
    wine64  # 可选，用于测试 Windows exe

# 安装 pnpm
npm install -g pnpm@8

# CentOS/RHEL
sudo yum install -y \
    nodejs npm \
    cmake \
    mingw64-gcc mingw64-gcc-c++
```

### 验证环境

```bash
./build-win-cross.sh --dry-run
```

---

## 完整构建流程

```bash
# 赋予执行权限
chmod +x build-win-cross.sh

# 执行构建
./build-win-cross.sh

# 或跳过原生模块交叉编译
./build-win-cross.sh --skip-native
```

---

## 常见问题

### Q: node-pty 编译失败？

A: node-pty 不支持交叉编译到 Windows。解决方案：
1. 使用 GitHub Actions CI 在 Windows 上原生编译
2. 使用预编译的 `.node` 文件
3. 移除 PTY 功能（仅保留串口/SSH/Telnet）

### Q: serialport 交叉编译失败？

A: 确保安装了 MinGW：
```bash
sudo apt-get install mingw-w64
```

### Q: 打包后运行报错 "找不到模块"？

A: 检查 `electron-builder.config.cjs` 中的 `files` 配置，确保所有依赖都被包含。

### Q: 如何测试生成的 exe？

A: 使用 Wine：
```bash
wine release/QSerial-0.1.0-win-x64.exe
```
注意：Wine 不支持所有 Windows API，测试结果可能与真实 Windows 有差异。

---

## 文件说明

```
QSerial/
├── build-win-cross.sh          # 交叉编译脚本
├── prebuilt/                   # 预编译原生模块
│   └── win32-x64/
│       ├── pty.node            # Windows PTY 模块
│       └── serialport.node     # Windows 串口模块
└── docs/
    └── Linux交叉编译Windows版本指南.md  # 本文档
```
