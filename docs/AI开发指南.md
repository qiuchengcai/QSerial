# Claude AI 开发指南

本文档为 Claude AI 提供项目上下文和开发规范。

## 项目概述

QSerial 是一款跨平台终端工具，使用 Electron + React + TypeScript 开发。

## 技术栈

- **框架**: Electron 28 + React 18
- **语言**: TypeScript 5.3
- **终端**: xterm.js 5.x
- **状态管理**: Zustand
- **样式**: Tailwind CSS
- **构建**: Vite 5 + electron-builder

## 项目结构

```
QSerial/
├── packages/
│   ├── main/          # Electron 主进程
│   ├── renderer/      # 渲染进程 (React)
│   └── shared/        # 共享代码
├── build/             # 构建资源
├── docs/              # 文档
└── release/           # 打包输出
```

## 开发规范

### 代码风格

- 使用 TypeScript strict 模式
- 使用 ESLint + Prettier 格式化
- 组件使用函数式组件 + Hooks

### 提交规范

```
<类型>: <中文描述>

类型: 新增/修复/优化/重构/文档/样式/测试/构建/其他
```

### 分支规范

- `main`: 主分支
- `develop`: 开发分支
- `feature/*`: 功能分支
- `fix/*`: 修复分支

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发
pnpm dev

# 构建
pnpm build

# 打包
pnpm package:linux
pnpm package:win
```

## 原生模块

项目包含原生模块，需要编译：

- `node-pty`: 本地终端
- `serialport`: 串口通信

编译命令：
```bash
pnpm rebuild node-pty @serialport/bindings-cpp
```

## 内网环境

内网镜像配置见 `docs/内网镜像配置指南.md`

关键镜像地址：
- npm: `https://mirrors.uniview.com/npm/`
- electron: `https://mirrors.uniview.com/electron/`
- node: `https://mirrors.uniview.com/node/`
