# QSerial

一款现代化的跨平台终端工具，支持串口、SSH、本地终端等多种连接方式。

## 特性

- 🔌 **多协议支持**: 本地终端 (PTY)、串口、SSH、Telnet
- 📑 **多标签管理**: 支持拖拽排序、分组管理
- 🎨 **主题定制**: 丰富的主题系统，支持自定义
- 🔧 **插件扩展**: 完善的插件 API，可扩展性强
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
pnpm package
```

## 项目结构

```
QSerial/
├── packages/
│   ├── main/          # Electron 主进程
│   ├── renderer/      # 渲染进程 (React)
│   └── shared/        # 共享代码
├── plugins/           # 插件目录
├── docs/              # 文档
└── build/             # 构建资源
```

## 技术栈

- **框架**: Electron + React
- **终端**: xterm.js
- **状态管理**: Zustand
- **样式**: Tailwind CSS
- **构建**: Vite + electron-builder

## 许可证

MIT
