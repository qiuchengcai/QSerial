# QSerial

一款现代化的跨平台终端工具，支持串口、SSH、Telnet、本地终端等多种连接方式，内置连接共享、文件传输服务（SFTP/FTP/TFTP/NFS）与 **MCP AI 服务器**，供 Claude Code、CodeBuddy 等 AI Agent 远程操作设备。

## 特性

- 🔌 **多协议支持**: 本地终端 (PTY)、串口、SSH、Telnet，支持 SSH 跳板机 (Jump Host)
- 🤖 **内置 MCP AI 服务器**: 30 个 MCP 工具 + 6 个 Resources + 8 种 Notifications + Sampling，支持 streamableHttp / SSE 传输
- 🎬 **宏录制与回放**: 录制终端操作序列，一键回放，AI 可通过 MCP 调用
- 📡 **连接共享**: TCP 共享任意活跃连接，支持密码认证
- 📁 **SFTP 文件传输**: SSH 连接内置 SFTP 文件浏览器，支持上传/下载/管理远程文件
- 📦 **TFTP 服务器**: 内置 TFTP 服务器，传输参数优化（blockSize=65464、windowSize=64）
- 🌐 **FTP 服务器**: 内置 FTP 服务器，支持用户名密码认证
- 💾 **NFS 服务器**: 内置 NFS 服务器（Windows: WinNFSd / Linux: nfs-kernel-server）
- 📑 **多标签管理**: 支持拖拽排序、分组管理
- ⚡ **快捷按钮**: 支持多行命令逐条发送、行间延迟配置
- 🎨 **主题定制**: 8 套预设主题，支持自定义
- 💾 **会话管理**: 保存连接配置，点击快速切换
- 🌍 **国际化**: 中文/English 双语切换

## MCP AI 服务器

QSerial 启动后自动启动 MCP 服务器（默认 127.0.0.1:9800），AI Agent 可远程操作设备。

### 配置方式

**Codex** — config.toml:

[INFO] config.toml 暂不展示

**Claude Code** — .mcp.json:

[INFO] JSON 暂不展示

### MCP 工具 (30个)

| 命名空间 | 工具 | 说明 |
|----------|------|------|
| conn.* | conn.create | 创建串口/SSH/Telnet/PTY 连接（支持跳板机） |
| | conn.disconnect | 断开并销毁连接 |
| | conn.reconnect | 重新连接已断开连接 |
| | conn.update | 更新窗口大小/波特率等参数 |
| | conn.list | 列出所有活跃连接 |
| | conn.share | TCP 共享 start/stop/list |
| conn.data.* | conn.data.write | 发送文本数据 |
| | conn.data.write_hex | 发送十六进制数据 |
| | conn.data.read | 读取输出缓冲区 |
| | conn.data.clear | 清空缓冲区 |
| | conn.data.expect | 等待匹配模式（子串/正则） |
| | conn.data.send | 发送命令+智能等待响应+去回显+AT解析 |
| | conn.data.history | 获取收发历史+字节统计 |
| conn.hw.* | conn.hw.dtr_rts | 控制 DTR/RTS 串口信号 |
| | conn.hw.break | 发送 break 信号 |
| conn.script.* | conn.script.run | 执行多步脚本 |
| | conn.script.login | 自动登录流程（Sampling 辅助） |
| conn.watch.* | conn.watch.start | 模式匹配监控+告警通知 |
| | conn.watch.stop | 停止监控 |
| conn.analyze.* | conn.analyze.state | 分析连接状态 |
| | conn.analyze.probe | 探测设备类型 (ESP32/STM32/RPi 等8种) |
| | conn.analyze.report | 生成会话摘要报告 |
| conn.file.* | conn.file.send | XMODEM/YMODEM 文件发送 |
| device.* | device.ports | 列出本机可用串口 |
| session.* | session.list | 列出已保存会话 |
| | session.save | 保存连接为会话 |
| | session.delete | 删除已保存会话 |
| app.* | app.screenshot | 捕获终端窗口截图 |
| | app.macro.list | 列出已录制宏 |
| | app.macro.run | 回放已录制宏 |

### MCP Resources (6个)

| URI | 说明 |
|-----|------|
| qserial://connections/active | 当前活跃连接列表 |
| qserial://serial/ports | 可用串口列表 |
| qserial://sessions/list | 已保存会话 |
| qserial://screenshot/latest | 最新截图 |
| qserial://notifications/pending | 待消费通知 |
| qserial://connections/{id} | 指定连接详情 |

### MCP Notifications (8种)

| 通知类型 | 触发时机 |
|----------|----------|
| connection/connected | 连接建立成功 |
| connection/disconnected | 连接断开 |
| connection/data_alert | Watch 规则匹配 |
| session/saved | 会话保存 |
| session/deleted | 会话删除 |
| share/started | TCP 共享启动 |
| share/stopped | TCP 共享停止 |
| script/step_completed | 脚本步骤完成 |

### Sampling

服务端可在关键事件（设备 panic、脚本失败、未知提示符）时主动请求 AI 决策。

详细文档见 AI 使用指南 docs/AI_USAGE.md。

## 开发

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### 安装依赖

pnpm install

### 开发模式

pnpm build:shared
pnpm dev

### 构建

pnpm build             # 构建所有包
pnpm package:win       # 打包 Windows
pnpm package:linux     # 打包 Linux
pnpm package:mac       # 打包 macOS

### 测试

npx vitest run         # 运行 68 个单元测试

## 技术栈

- **平台**: Windows / macOS / Linux
- **框架**: Electron 35 + React 18
- **语言**: TypeScript 5
- **终端**: xterm.js 5.x + addon-fit + addon-search + addon-web-links
- **状态管理**: Zustand (persist 中间件)
- **样式**: Tailwind CSS
- **构建**: Vite 5 + electron-builder
- **原生模块**: node-pty, serialport, ssh2, ftp-srv
- **MCP 协议**: JSON-RPC 2.0 (HTTP SSE + streamableHttp), 协议版本 2025-03-26

## 文档

| 文档 | 说明 |
|------|------|
| AI 使用指南 | MCP 工具参考与操作流程 |
| 开发与优化方案 | 技术路线图 v0.2→v0.4 |
| MCP 工具命名方案 | 命名空间重构设计 |
