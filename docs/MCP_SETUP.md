# QSerial MCP 配置指南

## 方法一：Claude Desktop 配置

在 Claude Desktop 中，编辑 `claude_desktop_config.json` 文件：

```json
{
  "mcpServers": {
    "qserial": {
      "command": "node",
      "args": ["D:\\QPrj\\QSerial\\out\\mcp\\server.js"]
    }
  }
}
```

## 方法二：Cursor 配置

在 Cursor 的设置中，添加 MCP 配置：

1. 打开 Cursor Settings → AI → MCP Servers
2. 添加新的 MCP Server：
   - Name: `qserial`
   - Command: `node`
   - Args: `["D:\\QPrj\\QSerial\\out\\mcp\\server.js"]`

## 方法三：VS Code with CodeBuddy 配置

如果使用 VS Code 的 CodeBuddy/MCP 插件：

1. 在项目根目录创建 `mcp.config.json`：

```json
{
  "servers": {
    "qserial": {
      "command": "node",
      "args": ["${workspaceFolder}/out/mcp/server.js"]
    }
  }
}
```

## 测试 MCP Server

启动测试：

```bash
cd D:/QPrj/QSerial
npm run mcp
```

## 可用工具

连接到 MCP 后，可以使用以下工具：

- `terminal_connect` - 连接串口/SSH
- `terminal_disconnect` - 断开连接
- `terminal_send` - 发送数据
- `terminal_read` - 读取数据
- `terminal_wait` - 等待匹配输出
- `terminal_send_signal` - 发送控制信号 (Ctrl+C)
- `terminal_read_stream` - 流式读取
- `terminal_clear_buffer` - 清除缓冲区
- `terminal_get_screen` - 获取屏幕快照
- `terminal_status` - 查询状态
- `serial_list_ports` - 列出串口

## 示例对话

```
用户：帮我连接 COM3 串口，波特率 115200

AI：我来帮你连接串口。
[调用 terminal_connect(type="serial", path="COM3", baudRate=115200)]
已成功连接 COM3 @ 115200，终端 ID: serial-xxx

用户：发送 AT 命令并等待响应

AI：[调用 terminal_send(terminalId="serial-xxx", data="AT")]
[调用 terminal_wait(terminalId="serial-xxx", pattern="OK|ERROR", timeout=5000)]
收到响应：OK

用户：执行 top 命令

AI：[调用 terminal_send(terminalId="serial-xxx", data="top")]
[调用 terminal_get_screen(terminalId="serial-xxx")]
显示 top 输出...
（如果要退出，可以使用 terminal_send_signal 发送 Ctrl+C）
```

## 注意事项

1. 确保已运行 `npm run compile` 编译项目
2. 串口路径在 Windows 上是 `COM3`，Linux/macOS 上是 `/dev/ttyUSB0`
3. SSH 密码和私钥参数不会被记录在日志中
4. 状态文件位于 `~/.qserial/status.json`
