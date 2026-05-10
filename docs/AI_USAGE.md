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
      "type": "streamableHttp",
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

---

## 2. MCP 工具列表

### 2.1 connection_list — 列出所有连接

```json
{"method": "tools/call", "params": {"name": "connection_list", "arguments": {}}}
```

返回所有活跃连接的 ID、类型、名称、状态。

### 2.2 connection_info — 查看连接详情

```json
{"method": "tools/call", "params": {"name": "connection_info", "arguments": {"id": "<connection_id>"}}}
```

返回连接的类型、状态、完整参数（如串口路径、波特率、SSH 主机等）。

### 2.3 connection_write — 发送命令

```json
{"method": "tools/call", "params": {"name": "connection_write", "arguments": {"id": "<connection_id>", "data": "ls -la\n"}}}
```

**重要**：终端命令末尾必须包含 `\n` 换行符。

发送数据后自动等待 300ms 回显，并将回显内容作为返回值。

### 2.4 connection_read — 读取输出

```json
{"method": "tools/call", "params": {"name": "connection_read", "arguments": {"id": "<connection_id>"}}}
```

读取设备的输出缓冲区，**读取后自动清空**。适合"发一条命令→读一次响应"的模式。

### 2.5 connection_peek — 预览输出

```json
{"method": "tools/call", "params": {"name": "connection_peek", "arguments": {"id": "<connection_id>", "max_bytes": 4096}}}
```

预览输出缓冲区内容，**不清空**。`max_bytes` 默认 4096，返回最近 N 字节。

### 2.6 connection_expect — 模式匹配等待

```json
{"method": "tools/call", "params": {"name": "connection_expect", "arguments": {"id": "<connection_id>", "pattern": "login:", "timeout": 30}}}
```

等待输出中出现指定文本（子串匹配）。超时默认 30 秒。适合等待设备启动、登录提示等场景。

### 2.7 connection_clear — 清空缓冲区

```json
{"method": "tools/call", "params": {"name": "connection_clear", "arguments": {"id": "<connection_id>"}}}
```

清空指定连接的输出缓冲区。

---

## 3. 典型操作流程

### 3.1 操作已有设备

```
1. connection_list          → 获取设备列表和 connection_id
2. connection_peek          → 了解当前终端显示内容
3. connection_write         → 发送命令（如 "cat /proc/version\n"）
4. connection_read          → 读取命令输出
```

### 3.2 等待设备启动

```
1. connection_list          → 确认设备已连接
2. connection_expect        → 等待 "login:" 提示（最多等 30s）
3. connection_write         → 发送用户名
4. connection_expect        → 等待 "Password:"
5. connection_write         → 发送密码
6. connection_read          → 读取登录后输出
```

### 3.3 实时监控

```
1. connection_peek          → 查看当前状态（不消耗）
2. ... 等待一段时间 ...
3. connection_peek          → 再次查看
4. connection_read          → 需要处理时再消耗
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
3. **connection_expect 阻塞**：expect 会轮询缓冲区直到匹配或超时，期间不会丢失数据。
4. **人类输入感知**：在共享连接（JSON API）模式下，人类输入通过 `peer_input` 事件实时推送给 AI。

---

## 7. 快速测试

用 curl 验证 MCP 服务器是否正常运行：

```bash
# 初始化
curl -s -X POST http://<host>:9800/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# 列出工具
curl -s -X POST http://<host>:9800/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# 列出连接
curl -s -X POST http://<host>:9800/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"connection_list","arguments":{}}}'
```
