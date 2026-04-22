# QSerial

一款 AI 原生串口终端工具，支持串口、SSH、本地终端等多种连接方式，内置 AI 远程设备操控能力。

## 特性

- 🔌 **多协议支持**: 本地终端 (PTY)、串口、SSH、Telnet
- 📡 **终端共享**: 将本地终端通过 TCP 共享给远程用户，基于 TELNET 协议协商 + 密码认证
- 🤖 **AI 设备操控**: 通过 Skill 直连设备，无需 MCP 中间层，单命令 2-3 秒响应
- 📁 **SFTP 文件传输**: SSH 连接内置 SFTP 文件浏览器，支持上传/下载/管理远程文件
- 📦 **TFTP 服务器**: 内置 TFTP 服务器，传输参数优化（blockSize=65464、windowSize=64）
- 📑 **多标签管理**: 支持拖拽排序、分组管理
- ⚡ **快捷按钮**: 支持多行命令逐条发送、行间延迟配置
- 🎨 **主题定制**: 丰富的主题系统，支持自定义
- 💾 **会话管理**: 保存连接配置，快速重连

## 开发

### 环境要求

- Node.js >= 20.0.0
- pnpm >= 8.0.0

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 构建共享包
pnpm build:shared

# 启动开发服务器
pnpm dev
```

### 构建

```bash
# 构建所有包
pnpm build

# 打包应用
pnpm package:win      # Windows
pnpm package:linux    # Linux
pnpm package:mac      # macOS
```

### 原生模块编译

项目包含原生模块（node-pty、serialport），如需重新编译：

```bash
pnpm rebuild node-pty @serialport/bindings-cpp
```

## 项目结构

```
QSerial/
├── packages/
│   ├── main/          # Electron 主进程
│   │   └── src/
│   │       ├── connection/   # 连接模块 (PTY/Serial/SSH/Telnet/SerialServer)
│   │       ├── sftp/         # SFTP 文件传输
│   │       ├── tftp/         # TFTP 服务器
│   │       └── ipc/          # IPC 处理
│   ├── renderer/      # 渲染进程 (React)
│   │   └── src/
│   │       ├── components/   # UI 组件
│   │       └── stores/       # 状态管理 (Zustand)
│   └── shared/        # 共享代码 (类型/常量/工具)
├── scripts/           # 构建脚本
├── docs/              # 文档
└── build/             # 构建资源
```

## 技术栈

- **平台**: Windows
- **框架**: Electron 28 + React 18
- **语言**: TypeScript 5.3
- **终端**: xterm.js 5.x
- **状态管理**: Zustand
- **样式**: Tailwind CSS
- **构建**: Vite 5 + electron-builder

## 开发规范

### 代码风格

- TypeScript strict 模式
- ESLint + Prettier 格式化
- 函数式组件 + Hooks

### 提交规范

```
<类型>: <中文描述>

类型: 新增/修复/优化/重构/文档/样式/测试/构建/其他
```

### 内网环境

内网镜像配置见 `docs/intranet-mirror-setup.md`，关键镜像：
- npm: `https://mirrors.uniview.com/npm/`
- electron: `https://mirrors.uniview.com/electron/`
- node: `https://mirrors.uniview.com/node/`

## 文档

| 文档 | 说明 |
|------|------|
| [项目结构](docs/project-structure.md) | 目录结构与文件说明 |
| [架构设计文档](docs/architecture-design.md) | 系统架构设计 |
| [用户指南](docs/user-guide.md) | 功能使用说明 |
| [优化路线图](docs/optimization-roadmap.md) | 后续优化方向 |
| [内网镜像配置指南](docs/intranet-mirror-setup.md) | Uniview 内网镜像配置 |
| [离线环境搭建指南](docs/offline-environment-setup.md) | 离线环境搭建 |
| [Linux交叉编译Windows版本指南](docs/linux-cross-compile-windows.md) | 交叉编译 |

## 许可证

MIT
