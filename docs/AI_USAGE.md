# QSerial AI 使用指南

## 概述

QSerial 是一个终端连接管理工具，内置 MCP (Model Context Protocol) 服务器，供 AI Agent 远程操作串口、SSH、Telnet、本地终端等设备。

**核心能力**：AI 和人类可以同时操作同一个终端设备，互不阻塞。
- AI 发送命令到设备 → 设备回显
- AI 读取设备输出缓冲区
- AI 等待特定模式出现（expect）
- 人类操作 → AI 通过 `peer_input` 感知

---

## 1. 连接 QSerial

### MCP 配置

内置 MCP 服务器监听 `0.0.0.0:<port>`，支持两种传输方式：

**streamableHttp** (Claude Code 等):
```json
{
  "mcpServers": {
    "qserial": {
      "transport": "streamableHttp",
      "url": "http://<host>:<port>/mcp"
    }
  }
}
```

**SSE** (CodeBuddy 等):
```json
{
  "mcpServers": {
    "qserial": {
      "transport": "sse",
      "url": "http://<host>:<port>/sse"
    }
  }
}
```

- 默认端口：9800
- 配置示例中 `<host>` 替换为 QSerial 运行机器的 IP
- QSerial 启动后自动开启 MCP（可在侧边栏 MCP 对话框中管理）

**启用审批** (Claude Code)：在项目 `.claude/settings.json` 中批准服务器：

```json
{
  "enabledMcpjsonServers": ["qserial"]
}
```

未添加此配置时，`.mcp.json` 中的服务器定义不会被加载。

---

## 2. MCP 工具列表

QSerial 共有 43 个 MCP 工具，按命名空间组织。以下为常用工具的使用说明。

### 2.1 conn.list — 列出所有连接

```json
{"method": "tools/call", "params": {"name": "conn.list", "arguments": {}}}
```

返回所有活跃连接的 ID、类型、名称、状态。

### 2.2 conn.create — 创建连接

```json
{"method": "tools/call", "params": {"name": "conn.create", "arguments": {"type": "serial", "path": "COM3", "baudRate": 115200}}}
```

创建并连接新设备。`type` 支持 `serial` / `ssh` / `telnet` / `pty`，不同类型需要不同参数。成功返回连接 ID。

SSH 连接支持跳板机（`jumpHost` / `jumpPort` / `jumpUsername` / `jumpPassword`）。

### 2.3 conn.disconnect — 断开连接

```json
{"method": "tools/call", "params": {"name": "conn.disconnect", "arguments": {"id": "<connection_id>"}}}
```

断开并销毁指定连接。

### 2.4 conn.reconnect — 重连连接

```json
{"method": "tools/call", "params": {"name": "conn.reconnect", "arguments": {"id": "<connection_id>"}}}
```

重新连接已断开的连接。

### 2.5 conn.update — 修改参数

```json
{"method": "tools/call", "params": {"name": "conn.update", "arguments": {"id": "<connection_id>", "baudRate": 115200}}}
```

调整终端尺寸（`cols`/`rows`）或串口波特率（修改波特率会断开重连）。

### 2.6 conn.data.write — 发送文本

```json
{"method": "tools/call", "params": {"name": "conn.data.write", "arguments": {"id": "<connection_id>", "data": "ls -la\n"}}}
```

**重要**：命令末尾必须包含 `\n` 换行符。

### 2.7 conn.data.write_hex — 发送十六进制数据

```json
{"method": "tools/call", "params": {"name": "conn.data.write_hex", "arguments": {"id": "<connection_id>", "hex": "1B 40"}}}
```

直接发送原始十六进制数据（如 ESC/POS 打印机指令、Modbus RTU 帧）。

### 2.8 conn.data.read — 读取输出

```json
{"method": "tools/call", "params": {"name": "conn.data.read", "arguments": {"id": "<connection_id>"}}}
```

读取设备的输出缓冲区，**读取后自动清空**。适合"发一条命令→读一次响应"的模式。

### 2.9 conn.data.clear — 清空缓冲区

```json
{"method": "tools/call", "params": {"name": "conn.data.clear", "arguments": {"id": "<connection_id>"}}}
```

清空指定连接的输出缓冲区。

### 2.10 conn.data.expect — 模式匹配等待

```json
{"method": "tools/call", "params": {"name": "conn.data.expect", "arguments": {"id": "<connection_id>", "pattern": "login:", "timeout": 30, "regex": false}}}
```

等待输出中出现指定文本。`regex: true` 时使用正则匹配。超时默认 30 秒。

### 2.11 conn.data.send — 发送命令并获取响应（推荐）

```json
{"method": "tools/call", "params": {"name": "conn.data.send", "arguments": {"id": "<connection_id>", "command": "cat /proc/version"}}}
```

一次调用完成：发送命令 → 等待响应 → 去除回显 → 返回干净输出。这是操作设备最常用的工具。

### 2.12 conn.data.history — 获取历史记录

```json
{"method": "tools/call", "params": {"name": "conn.data.history", "arguments": {"id": "<connection_id>"}}}
```

返回连接的收发历史记录和字节统计。

### 2.13 conn.hw.dtr_rts — 控制 DTR/RTS 信号

```json
{"method": "tools/call", "params": {"name": "conn.hw.dtr_rts", "arguments": {"id": "<connection_id>", "dtr": true, "rts": false}}}
```

控制串口的 DTR/RTS 硬件信号线。

### 2.14 conn.hw.break — 发送 Break 信号

```json
{"method": "tools/call", "params": {"name": "conn.hw.break", "arguments": {"id": "<connection_id>", "duration": 300}}}
```

发送串口 Break 信号（常用于进入 U-Boot 或恢复模式）。

### 2.15 conn.script.login — 自动登录

```json
{"method": "tools/call", "params": {"name": "conn.script.login", "arguments": {"id": "<connection_id>", "username": "root", "password": "admin123"}}}
```

自动化登录：等待 `login:` → 发送用户名 → 等待 `Password:` → 发送密码 → 等待 Shell 提示符。

### 2.16 conn.script.run — 执行多步脚本

```json
{"method": "tools/call", "params": {"name": "conn.script.run", "arguments": {"id": "<connection_id>", "steps": [{"send": "ls\n", "expect": "#"}]}}}
```

按步骤执行命令序列，每步支持 `send` / `expect` / `delay`。

### 2.17 conn.analyze.state — 交互状态分析

```json
{"method": "tools/call", "params": {"name": "conn.analyze.state", "arguments": {"id": "<connection_id>"}}}
```

分析终端输出，自动识别：`login_prompt` / `password_prompt` / `shell` / `booting` / `program_running` / `idle`。

### 2.18 conn.analyze.probe — 设备类型探测

```json
{"method": "tools/call", "params": {"name": "conn.analyze.probe", "arguments": {"id": "<connection_id>"}}}
```

自动识别设备类型（ESP32/STM32/RPi/Cisco/U-Boot/Linux/OpenWrt/Android 等 8 种）。

### 2.19 conn.analyze.report — 会话摘要

```json
{"method": "tools/call", "params": {"name": "conn.analyze.report", "arguments": {"id": "<connection_id>"}}}
```

生成会话摘要报告（时长、命令数、收发字节、状态变化）。

### 2.20 conn.watch.start — 启动模式监控

```json
{"method": "tools/call", "params": {"name": "conn.watch.start", "arguments": {"id": "<connection_id>", "pattern": "panic"}}}
```

持续监控输出，匹配到模式时触发通知（`conn.watch.stop` 停止，`conn.watch.results` 获取结果）。

### 2.21 conn.file.send — 文件传输

```json
{"method": "tools/call", "params": {"name": "conn.file.send", "arguments": {"id": "<connection_id>", "file_path": "/path/to/firmware.bin", "protocol": "xmodem"}}}
```

通过 XMODEM/YMODEM 协议传输文件到嵌入式设备。

### 2.22 conn.share — 连接共享

```json
{"method": "tools/call", "params": {"name": "conn.share", "arguments": {"action": "start", "id": "<connection_id>", "port": 23000, "password": "secret"}}}
```

将连接通过 TCP 共享（`start` / `stop` / `list`），支持远程 AI 客户端同时操作。

### 2.23 device.ports — 列出可用串口

```json
{"method": "tools/call", "params": {"name": "device.ports", "arguments": {}}}
```

列出系统中所有可用的串口设备（路径、厂商、产品 ID 等）。

### 2.24 session.* — 会话管理

```json
{"method": "tools/call", "params": {"name": "session.list", "arguments": {}}}
```
`session.list` 列出已保存会话 | `session.save` 保存当前连接 | `session.delete` 删除会话。

### 2.25 SFTP 工具组

`conn.list` / `conn.create` / `conn.disconnect` 操作 SFTP 连接后，使用：
- `sftp.list` — 列出远程目录
- `sftp.download` — 下载文件
- `sftp.upload` — 上传文件
- `sftp.mkdir` — 创建目录
- `sftp.stat` — 获取文件元数据
- `sftp.rm` — 删除文件/目录

### 2.26 app.* — 应用工具

- `app.screenshot` — 捕获终端窗口截图
- `app.macro.list` — 列出已录制宏
- `app.macro.run` — 回放已录制宏

---

## 3. 典型操作流程

### 3.1 操作已有设备

```
1. conn.list              → 获取设备列表和 connection_id
2. conn.data.send         → 发送命令并获取干净输出
3. conn.data.read         → 如需更多数据，读取缓冲区
```

### 3.2 自动登录设备

```
1. conn.create            → 创建串口/SSH 连接
2. conn.script.login      → 传入用户名密码，自动完成 login→Password→Shell
3. conn.data.send         → 登录成功后发送命令
```

### 3.3 手动等待设备启动

```
1. conn.create            → 创建连接
2. conn.analyze.state     → 检查当前状态（booting?）
3. conn.data.expect       → 等待 "login:" 提示（最多等 30s）
4. conn.script.login      → 自动完成登录
```

### 3.4 固件烧录流程

```
1. conn.create            → 连接串口设备
2. conn.analyze.probe     → 确认设备类型
3. conn.hw.dtr_rts        → 控制 DTR/RTS 进入烧录模式
4. conn.data.expect       → 等待 Bootloader 提示符
5. conn.file.send         → XMODEM 传输固件文件
6. conn.data.expect       → 等待 "success" 确认
7. conn.analyze.report    → 生成烧录会话报告
```

---

## 4. 连接类型

QSerial 支持以下设备连接类型，均在侧边栏创建和管理：

| 类型 | 说明 | 关键参数 |
|------|------|----------|
| Serial | 串口连接 | path, baudRate, dataBits, stopBits, parity |
| SSH | SSH 远程连接 | host, port, username, password/privateKey |
| Telnet | Telnet 连接 | host, port |
| PTY | 本地终端 | shell, cwd |

---

## 5. 连接共享 (JSON API)

QSerial 支持将任何连接通过网络共享，供远程 AI 客户端操作：

### 启动共享
在终端面板点击分享按钮，配置 TELNET 端口 + JSON API 端口。

### JSON API 协议
连接后收到 `auth_required`，发送：
```json
{"type": "auth", "password": "<password>"}
```
认证成功后即可发送命令：
```json
{"type": "write_text", "data": "ls -la\n"}
```
输出通过 `data` 事件返回，人类输入通过 `peer_input` 事件感知。

---

## 6. 注意事项

1. **缓冲区限制**：每个连接的输出缓冲区上限 1MB，超出自动丢弃最早数据。
2. **并发安全**：多个 AI 客户端可同时连接 MCP，互不影响。
3. **conn.data.expect 阻塞**：expect 会轮询缓冲区直到匹配或超时，期间不会丢失数据。
4. **人类输入感知**：在共享连接（JSON API）模式下，人类输入通过 `peer_input` 事件实时推送给 AI。
5. **命令需换行**：`conn.data.write` 和 `conn.script.login` 自动追加换行符，手动写入时务必以 `\n` 结尾。
6. **conn.analyze.state 状态分析**：分析的是最近 64KB 输出，如果终端刚清屏可能返回 `idle`。

---

## 7. 快速测试

用 curl 验证 MCP 服务器是否正常运行：

```bash
# 初始化
curl -s -X POST http://<host>:9800/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# 列出工具
curl -s -X POST http://<host>:9800/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# 列出连接
curl -s -X POST http://<host>:9800/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"conn.list","arguments":{}}}'
```
