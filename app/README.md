# QSerial 交付件说明

## 目录结构

```
app/
├── vsix/                    # VS Code 扩展安装包
│   └── qserial-1.0.0.vsix   # 扩展安装文件
├── mcp/                     # MCP Server 文件
│   ├── server.js            # MCP 服务入口
│   └── ...                  # 其他依赖文件
├── docs/                    # 配置文档
│   └── MCP_SETUP.md/html    # MCP 配置指南
└── README.md                # 本说明文件
```

## 安装 VS Code 扩展

### 方法一：命令行安装
```bash
code --install-extension vsix/qserial-1.0.0.vsix
```

### 方法二：VS Code 内安装
1. 打开 VS Code
2. 按 `Ctrl+Shift+P` 打开命令面板
3. 输入 `Extensions: Install from VSIX`
4. 选择 `vsix/qserial-1.0.0.vsix` 文件
5. 重启 VS Code

## 配置 MCP Server

### CodeBuddy 配置

在用户目录创建 `.codebuddy/mcp.json`：

```json
{
  "mcpServers": {
    "qmcp": {
      "command": "node",
      "args": ["<安装路径>/mcp/server.js"]
    }
  }
}
```

将 `<安装路径>` 替换为实际安装路径，例如：
- Windows: `D:/QSerial/app/mcp/server.js`
- Linux/macOS: `/home/user/QSerial/app/mcp/server.js`

### Claude Desktop 配置

编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "qserial": {
      "command": "node",
      "args": ["<安装路径>/mcp/server.js"]
    }
  }
}
```

### Cursor 配置

1. 打开 Cursor Settings → AI → MCP Servers
2. 添加新的 MCP Server：
   - Name: `qserial`
   - Command: `node`
   - Args: `["<安装路径>/mcp/server.js"]`

## MCP 可用工具

| 工具 | 说明 |
|------|------|
| `terminal_connect` | 连接串口/SSH |
| `terminal_disconnect` | 断开连接 |
| `terminal_send` | 发送数据 |
| `terminal_read` | 读取数据 |
| `terminal_wait` | 等待匹配输出 |
| `terminal_send_signal` | 发送控制信号 (Ctrl+C) |
| `terminal_read_stream` | 流式读取 |
| `terminal_clear_buffer` | 清除缓冲区 |
| `terminal_get_screen` | 获取屏幕快照 |
| `terminal_status` | 查询状态 |
| `serial_list_ports` | 列出串口 |
| `config_get` | 获取配置 |

## 使用示例

```
用户：帮我连接 COM3 串口，波特率 115200

AI：[调用 terminal_connect]
已成功连接 COM3 @ 115200

用户：发送 AT 命令并等待响应

AI：[调用 terminal_send, terminal_wait]
收到响应：OK
```

## 注意事项

1. **Node.js 要求**：需要安装 Node.js 18+ 版本
2. **串口权限**：Linux 下需要将用户添加到 dialout 组
3. **路径格式**：Windows 路径使用正斜杠 `/` 或双反斜杠 `\\`
4. **编译状态**：MCP 文件已预编译，无需再次编译