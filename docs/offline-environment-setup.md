# QSerial 离线开发环境配置指南

> 版本: 1.0.0 | 日期: 2026-04-16

## 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-04-16 | 1.0.0 | 初始版本 |

## 概述

本文档指导如何在离线环境（无法访问互联网）中配置 QSerial 项目的开发环境。

## 目录结构

项目本身就是完整的离线包：

```
QSerial/                            # 项目根目录（完整离线包）
│
├── .pnpm-store\v3\                 # pnpm 依赖存储（约 2.8GB）
│   └── 依赖包缓存...
│
├── node_modules\                   # 根目录依赖
│   └── 开发工具...
│
├── packages\                       # 工作区包
│   ├── main\node_modules\          # 主进程依赖
│   ├── renderer\node_modules\      # 渲染进程依赖
│   └── shared\node_modules\        # 共享模块依赖
│
├── release\                        # 【编译输出目录】
│   ├── win-unpacked\               # 未打包的原始文件
│   │   └── QSerial.exe             # 主程序（绿色版）
│   ├── QSerial-0.2.0-win-x64.exe   # 【安装包】最终交付文件
│   └── ...
│
├── build-offline.bat               # 一键编译脚本
├── package.json
├── pnpm-workspace.yaml
└── ... 其他项目文件
```

## 各路径作用

### 1. `.pnpm-store\v3\` - pnpm 依赖存储
- **功能**：pnpm 的依赖包缓存仓库
- **大小**：约 2.8GB
- **离线关键**：离线安装时从此处读取，不再联网下载

### 2. `node_modules\` - 项目依赖
- **根目录**：工作区级别的开发依赖
- **packages/**：各包的运行时依赖
- **离线关键**：已预安装，离线无需下载

### 3. `release\` - 编译输出
- **win-unpacked/**：绿色版程序
- **QSerial-0.2.0-win-x64.exe**：安装包（最终交付文件）

### 4. `build-offline.bat` - 一键编译
- 清理进程和旧构建
- 配置 pnpm 使用本地存储
- 离线安装依赖
- 构建并打包项目

## 联网准备步骤

### 1. 确保依赖完整

```powershell
cd QSerial

# 安装所有依赖
pnpm install

# 验证 pnpm 存储存在
Test-Path .pnpm-store\v3
```

### 2. 复制到目标机器

将整个 `QSerial` 文件夹复制到目标机器：
- U 盘/移动硬盘
- 内部文件传输系统

**注意**：确保包含 `.pnpm-store` 和所有 `node_modules`

## 离线编译步骤

### 1. 安装基础软件

- Node.js >= 18.0.0 (推荐 20.x LTS)
- Git for Windows
- pnpm：`npm install -g pnpm@8`

### 2. 一键编译

在项目根目录运行：

```powershell
cd QSerial           # 或你放置的路径
.\build-offline.bat
```

脚本会自动：
1. 清理进程（electron/node）
2. 清理旧构建（release 目录）
3. 配置 pnpm 使用项目目录的 `.pnpm-store`
4. 执行 `pnpm install --offline`
5. 构建项目（`pnpm run build`）
6. 打包应用（`pnpm run package:win`）

### 3. 获取交付文件

编译完成后，交付文件在：
```
release\QSerial-0.2.0-win-x64.exe    # 安装包
release\win-unpacked\QSerial.exe     # 绿色版
```

## 常见问题

### 问题1: pnpm install 仍然尝试访问网络

**解决方案：**
```bash
pnpm config set offline true
pnpm install --offline
```

### 问题2: 提示找不到模块

**解决方案：**
确保从联网环境复制时包含：
- `.pnpm-store\v3\` 目录
- 所有 `node_modules` 目录

### 问题3: 编译时提示文件被占用

**解决方案：**
`build-offline.bat` 会自动清理进程。如果手动编译：
```powershell
taskkill /F /IM electron.exe
taskkill /F /IM QSerial.exe
```

## 验证清单

- [ ] Node.js 20.x 已安装
- [ ] pnpm 已安装
- [ ] `.pnpm-store\v3\` 目录存在
- [ ] `node_modules` 目录存在
- [ ] `build-offline.bat` 可正常运行
- [ ] `release\QSerial-0.2.0-win-x64.exe` 生成成功
