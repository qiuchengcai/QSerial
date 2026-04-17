# QSerial

一款现代化的跨平台终端工具，支持串口、SSH、本地终端等多种连接方式。

## 特性

- 🔌 **多协议支持**: 本地终端 (PTY)、串口、SSH、Telnet
- 📡 **串口共享**: 将本地串口通过 TCP 共享给局域网/远程设备，支持密码认证和写入队列
- 📁 **SFTP 文件传输**: SSH 连接内置 SFTP 文件浏览器，支持上传/下载/管理远程文件
- 📦 **TFTP 服务器**: 内置 TFTP 服务器，支持文件上传下载和传输状态监控
- 📑 **多标签管理**: 支持拖拽排序、分组管理
- 🎨 **主题定制**: 丰富的主题系统，支持自定义
- 💾 **会话管理**: 保存连接配置，快速重连
- 🖥️ **跨平台**: Windows、macOS、Linux

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

内网镜像配置见 `docs/内网镜像配置指南.md`，关键镜像：
- npm: `https://mirrors.uniview.com/npm/`
- electron: `https://mirrors.uniview.com/electron/`
- node: `https://mirrors.uniview.com/node/`

## 文档

| 文档 | 说明 |
|------|------|
| [项目结构](docs/项目结构.md) | 目录结构与文件说明 |
| [架构设计文档](docs/架构设计文档.md) | 系统架构设计 |
| [未来优化计划](docs/未来优化计划.md) | 后续优化方向 |
| [内网镜像配置指南](docs/内网镜像配置指南.md) | Uniview 内网镜像配置 |
| [离线环境搭建指南](docs/离线环境搭建指南.md) | 离线环境搭建 |
| [Linux交叉编译Windows版本指南](docs/Linux交叉编译Windows版本指南.md) | 交叉编译 |

## 许可证

MIT
