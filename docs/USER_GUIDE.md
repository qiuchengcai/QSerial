# QSerial 使用指南

## 简介

QSerial 是一个 VS Code 扩展，提供串口和 SSH 终端管理功能。它让你可以在 VS Code 中直接连接串口设备或 SSH 服务器，并通过自定义快捷按钮快速执行常用命令。

## 安装

### 从 VSIX 安装

1. 下载 `.vsix` 文件
2. 在 VS Code 中按 `Ctrl+Shift+P`
3. 输入 `Extensions: Install from VSIX`
4. 选择下载的 VSIX 文件

### 从源码安装

```bash
git clone https://github.com/qiuchengcai/QSerial.git
cd QSerial
npm install
npm run compile
npm run package
# 然后安装生成的 .vsix 文件
```

## 快速开始

### 打开 QSerial 面板

点击 VS Code 侧边栏的 QSerial 图标，或按 `Ctrl+Shift+P` 输入 `QSerial: 显示面板`。

面板包含三个选项卡：
- **连接** - 串口和 SSH 连接管理
- **快捷按钮** - 自定义命令按钮
- **设置** - 配置参数

## 串口使用

### 连接串口

1. 切换到"连接"选项卡
2. 点击刷新按钮获取串口列表
3. 右键点击目标串口，选择"连接"
4. 选择波特率（默认 115200）
5. 终端窗口自动打开

### 断开串口

右键点击已连接的串口，选择"断开"。

### 串口设置

在 VS Code 设置中搜索 `qserial`：

| 设置 | 说明 | 默认值 |
|------|------|--------|
| `serial.defaultBaudRate` | 默认波特率 | 115200 |
| `serial.dataBits` | 数据位 | 8 |
| `serial.stopBits` | 停止位 | 1 |
| `serial.parity` | 校验位 | none |
| `serial.encoding` | 编码方式 | gbk |

### 编码选择

根据设备选择合适的编码：
- **gbk** - 中文设备常用
- **utf8** - 国际标准
- **hex** - 查看原始数据

## SSH 使用

### 新建 SSH 连接

1. 在"连接"选项卡点击"新建 SSH 连接"
2. 填写连接信息：
   - 主机地址
   - 端口（默认 22）
   - 用户名
3. 选择认证方式：
   - **密码认证** - 输入密码
   - **私钥认证** - 使用 SSH 私钥

### 保存 SSH 配置

连接成功后，配置会自动保存。下次可以直接点击保存的主机快速连接。

### 管理 SSH 主机

右键点击保存的主机可以：
- **快速连接** - 直接连接
- **编辑** - 修改配置
- **删除** - 移除配置

### 多 SSH 连接

支持同时连接多个 SSH 服务器，每个连接独立管理。

### SSH 私钥

私钥文件查找顺序：
1. 配置中指定的路径
2. `~/.ssh/id_ed25519`
3. `~/.ssh/id_rsa`
4. `~/.ssh/id_ecdsa`
5. `~/.ssh/id_dsa`

## 快捷按钮

### 创建快捷按钮

1. 切换到"快捷按钮"选项卡
2. 点击添加按钮
3. 配置按钮：
   - **名称** - 显示的按钮名
   - **命令** - 要发送的命令
   - **目标** - 串口/SSH/两者
   - **图标** - 可选图标
   - **颜色** - 可选颜色

### 多命令序列

一个按钮可以包含多个命令，每个命令可以设置延迟：

```json
{
  "commands": [
    { "command": "cd /var/log", "delay": 500 },
    { "command": "ls -la", "delay": 1000 },
    { "command": "cat syslog" }
  ]
}
```

### 执行按钮

连接终端后，点击按钮即可执行命令。

### 管理按钮

右键点击按钮可以：
- **执行** - 发送命令
- **编辑** - 修改配置
- **删除** - 移除按钮
- **排序** - 上移/下移/置顶/置底

## 日志记录

### 开始记录

连接终端后，右键点击选择"开始记录日志"。

### 停止记录

右键点击选择"停止记录日志"。

### 查看日志

点击"打开日志文件夹"查看所有日志文件。

日志默认存储在 `Documents/QSerial/logs`，可在设置中修改。

## 状态栏

状态栏显示当前连接状态：
- 串口连接时显示：`COM3 @ 115200`
- SSH 连接时显示：`user@host:port`

点击状态栏可以快速切换连接。

## MCP 功能

QSerial 支持 MCP (Model Context Protocol)，让 AI 助手可以操作终端。

### 配置 MCP

参考 `docs/MCP_SETUP.md` 配置 MCP Server。

### AI 助手操作示例

```
用户：帮我连接 COM3 串口
AI：[调用 terminal_connect 工具]
已连接 COM3 @ 115200

用户：发送 AT 命令
AI：[调用 terminal_send]
已发送 AT

用户：等待响应
AI：[调用 terminal_wait]
收到响应：OK
```

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
| `config_get` | 获取配置 |

## 常见问题

### 串口无法连接

**原因**：
- 串口不存在
- 其他程序占用
- 权限不足

**解决**：
- 检查设备管理器确认串口存在
- 关闭其他串口工具
- Linux 下添加用户到 dialout 组

### SSH 连接失败

**原因**：
- 网络不通
- 认证信息错误
- 私钥权限问题

**解决**：
- 检查网络连接
- 确认用户名密码
- 私钥文件权限设为 600

### 数据显示乱码

**原因**：编码设置不匹配

**解决**：
- 尝试不同编码（gbk/utf8）
- 检查设备输出编码

### 终端无响应

**原因**：
- 连接已断开
- 设备未发送数据

**解决**：
- 检查连接状态
- 发送测试命令验证

## 快捷键

| 操作 | 快捷键 |
|------|--------|
| 打开面板 | 点击侧边栏图标 |
| 切换选项卡 | 点击选项卡按钮 |
| 连接串口 | 右键菜单 |
| 执行按钮 | 点击按钮 |

## 技术支持

- **GitHub**: https://github.com/qiuchengcai/QSerial
- **问题反馈**: GitHub Issues