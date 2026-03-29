# QSerial - Serial & SSH Terminal

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/qiuchengcai/QSerial)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-purple.svg)](https://code.visualstudio.com/)

一个强大的 VS Code 扩展，提供串口和 SSH 终端管理功能，支持自定义快捷按钮，并集成 MCP (Model Context Protocol) 以支持 AI 助手操作。

## 功能特性

### 串口终端
- 自动检测并列出可用串口设备
- 支持自定义波特率、数据位、停止位、校验位
- 支持 GBK/UTF-8/HEX 等多种编码格式
- 实时数据收发和显示

### SSH 终端
- 支持密码和私钥两种认证方式
- 自动查找默认私钥（id_ed25519, id_rsa 等）
- 支持同时连接多个 SSH 服务器
- 保存 SSH 主机配置，快速重连

### 快捷按钮
- 自定义命令快捷按钮
- 支持多命令序列执行
- 可设置命令间延迟
- 按钮支持排序和管理

### 日志记录
- 终端数据日志记录
- 可自定义日志存储路径
- 支持时间戳前缀

### MCP 支持
- 让 AI 助手（如 Claude）可以操作终端
- 支持连接/断开/发送/读取等操作
- 支持等待特定输出模式

## 安装

### 从 VSIX 安装

```bash
code --install-extension qserial-1.0.0.vsix
```

或在 VS Code 中：
1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 `Extensions: Install from VSIX`
3. 选择 VSIX 文件

## 快速开始

1. 点击侧边栏的 QSerial 图标打开面板
2. 在"连接"选项卡中选择串口或添加 SSH 主机
3. 连接后即可在终端中发送和接收数据

## 配置选项

在 VS Code 设置中搜索 `qserial`：

| 设置 | 说明 | 默认值 |
|------|------|--------|
| `qserial.serial.defaultBaudRate` | 默认波特率 | 115200 |
| `qserial.serial.dataBits` | 数据位 | 8 |
| `qserial.serial.stopBits` | 停止位 | 1 |
| `qserial.serial.parity` | 校验位 | none |
| `qserial.serial.encoding` | 编码方式 | gbk |
| `qserial.serial.autoNewline` | 自动换行 | true |
| `qserial.log.defaultPath` | 日志路径 | Documents/QSerial/logs |
| `qserial.log.enableTimestamp` | 启用时间戳 | true |

## MCP 配置

### CodeBuddy 配置

在 `.codebuddy/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "qmcp": {
      "command": "node",
      "args": ["<安装路径>/app/mcp/server.js"]
    }
  }
}
```

将 `<安装路径>` 替换为实际安装路径，例如：
- Windows: `D:/QSerial/app/mcp/server.js`
- Linux/macOS: `/home/user/QSerial/app/mcp/server.js`

### 可用 MCP 工具

| 工具 | 说明 |
|------|------|
| `terminal_connect` | 连接串口/SSH |
| `terminal_disconnect` | 断开连接 |
| `terminal_send` | 发送数据 |
| `terminal_read` | 读取数据 |
| `terminal_wait` | 等待匹配输出 |
| `terminal_status` | 查询状态 |
| `serial_list_ports` | 列出串口 |

## 命令列表

| 命令 | 说明 |
|------|------|
| `qserial.serial.connect` | 连接串口 |
| `qserial.serial.disconnect` | 断开串口 |
| `qserial.serial.refreshPorts` | 刷新串口列表 |
| `qserial.ssh.connect` | 新建 SSH 连接 |
| `qserial.ssh.disconnect` | 断开 SSH |
| `qserial.ssh.quickConnect` | 快速连接 SSH |
| `qserial.buttons.addButton` | 添加快捷按钮 |
| `qserial.log.startSerial` | 开始记录串口日志 |
| `qserial.log.stopSerial` | 停止记录串口日志 |

## 常见问题

### 串口无法连接
- 检查设备管理器确认串口存在
- 关闭其他占用串口的程序
- Linux 下将用户添加到 dialout 组：`sudo usermod -aG dialout $USER`

### SSH 连接失败
- 检查网络连通性
- 确认用户名和密码正确
- 私钥文件权限设为 600：`chmod 600 ~/.ssh/id_rsa`

### 数据显示乱码
- 尝试切换编码格式（gbk/utf8）
- 检查设备输出的编码格式

## 更新日志

### v1.0.0
- 首次发布
- 串口终端功能
- SSH 多连接支持
- 自定义快捷按钮
- MCP 协议支持

## 许可证

[MIT License](LICENSE)

## 反馈与支持

- **GitHub**: https://github.com/qiuchengcai/QSerial
- **问题反馈**: [GitHub Issues](https://github.com/qiuchengcai/QSerial/issues)