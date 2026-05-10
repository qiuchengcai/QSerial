# QSerial

一款现代化的跨平台终端工具，支持串口、SSH、Telnet、本地终端等多种连接方式，内置连接共享、文件传输服务（SFTP/FTP/TFTP/NFS）与 **MCP AI 服务器**，供 Claude Code、CodeBuddy 等 AI Agent 远程操作设备。

## 特性

- 🔌 **多协议支持**: 本地终端 (PTY)、串口、SSH、Telnet
- 🤖 **内置 MCP AI 服务器**: 13 个 MCP 工具，支持 streamableHttp / SSE 传输，AI 可创建连接、读写终端、自动登录、状态感知
- 📡 **连接共享**: TCP 共享任意活跃连接 + JSON API 端口（供 AI 程序化操作），支持密码认证
- 📁 **SFTP 文件传输**: SSH 连接内置 SFTP 文件浏览器，支持上传/下载/管理远程文件
- 📦 **TFTP 服务器**: 内置 TFTP 服务器，传输参数优化（blockSize=65464、windowSize=64）
- 🌐 **FTP 服务器**: 内置 FTP 服务器，支持用户名密码认证
- 💾 **NFS 服务器**: 内置 NFS 服务器（Windows: WinNFSd / Linux: nfs-kernel-server）
- 📑 **多标签管理**: 支持拖拽排序、分组管理
- ⚡ **快捷按钮**: 支持多行命令逐条发送、行间延迟配置
- 🎨 **主题定制**: 8 套预设主题，支持自定义
- 💾 **会话管理**: 保存连接配置，点击快速切换（所有连接类型均支持开关切换）

## MCP AI 服务器

QSerial 启动后自动在 `0.0.0.0:9800` 启动 MCP 服务器，AI Agent 可直接远程操作设备。

### 配置方式

**Claude Code** — `.mcp.json`:
```json
{
  "mcpServers": {
    "qserial": {
      "transport": "streamableHttp",
      "url": "http://<host>:9800/mcp"
    }
  }
}
```

**CodeBuddy** — `~/.codebuddy/mcp.json`:
```json
{
  "mcpServers": {
    "qserial": {
      "transport": "sse",
      "url": "http://<host>:9800/sse"
    }
  }
}
```

### MCP 工具 (13个)

| 类别 | 工具 | 说明 |
|------|------|------|
| 连接管理 | `connection_create` | 创建串口/SSH/Telnet/PTY 连接 |
| | `connection_disconnect` | 断开并销毁连接 |
| | `connection_update` | 调整终端尺寸或串口波特率 |
| | `connection_list` | 列出所有活跃连接 |
| | `connection_info` | 查看连接详细信息 |
| 数据交互 | `connection_write` | 发送命令/数据 |
| | `connection_read` | 读取输出（读后清空） |
| | `connection_peek` | 预览输出（不清空） |
| | `connection_expect` | 等待特定模式出现 |
| | `connection_clear` | 清空输出缓冲区 |
| 状态感知 | `connection_state` | 分析交互状态（login/shell/booting） |
| | `connection_login` | 自动化登录流程 |
| 帮助 | `help` | 获取完整使用说明 |

详细文档见 [AI 使用指南](docs/AI_USAGE.md)。

## 开发

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm build:shared
pnpm dev
```

### 构建

```bash
pnpm build             # 构建所有包
pnpm package:win       # 打包 Windows
pnpm package:linux     # 打包 Linux
pnpm package:mac       # 打包 macOS
```

## 项目结构

```
QSerial/
├── packages/
│   ├── main/          # Electron 主进程
│   │   └── src/
│   │       ├── connection/   # 连接模块 (PTY/Serial/SSH/Telnet/Server)
│   │       ├── config/       # 配置管理
│   │       ├── mcp/          # MCP AI 服务器
│   │       ├── sftp/         # SFTP 文件传输
│   │       ├── ftp/          # FTP 服务器
│   │       ├── nfs/          # NFS 服务器
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

- **平台**: Windows / macOS / Linux
- **框架**: Electron 28 + React 18
- **语言**: TypeScript 5
- **终端**: xterm.js 5.x + addon-fit + addon-search + addon-web-links
- **状态管理**: Zustand (persist 中间件)
- **样式**: Tailwind CSS
- **构建**: Vite 5 + electron-builder
- **原生模块**: node-pty, serialport, ssh2, ftp-srv
- **MCP 协议**: JSON-RPC 2.0 over HTTP (SSE + streamableHttp)

## 文档

| 文档 | 说明 |
|------|------|
| [AI 使用指南](docs/AI_USAGE.md) | MCP 工具参考与操作流程，供 AI Agent 阅读 |

## 许可证

MIT
