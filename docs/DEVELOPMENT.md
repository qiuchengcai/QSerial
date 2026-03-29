# QSerial 开发指南

## 项目概述

QSerial 是一个 VS Code 扩展，提供串口和 SSH 终端管理功能，支持自定义快捷按钮，并集成了 MCP (Model Context Protocol) 以支持 AI 助手操作。

## 技术栈

- **语言**: TypeScript
- **框架**: VS Code Extension API
- **依赖**:
  - `serialport` - 串口通信
  - `ssh2` - SSH 协议实现
  - `iconv-lite` - 编码转换（支持 GBK/UTF-8）
  - `@modelcontextprotocol/sdk` - MCP 协议支持

## 项目结构

```
src/
├── extension.ts              # 扩展入口，初始化所有 Manager
├── serial/
│   └── serialManager.ts      # 串口连接管理
├── ssh/
│   └── sshManager.ts         # SSH 多连接管理
├── terminal/
│   ├── terminalManager.ts    # VS Code Terminal 管理
│   └── terminalLogger.ts     # 日志记录到文件
├── tree/
│   ├── unifiedTreeProvider.ts    # 三选项卡视图统一管理
│   ├── connectionTreeProvider.ts # 连接选项卡
│   ├── buttonTreeProvider.ts     # 快捷按钮选项卡
│   └── settingsTreeProvider.ts   # 设置选项卡
├── statusBar/
│   └── statusBarManager.ts   # 状态栏显示连接状态
├── buttons/
│   └── buttonManager.ts      # 自定义按钮管理
├── mcp/
│   ├── server.ts             # MCP Server 主入口
│   ├── commandHandler.ts     # MCP 命令处理器
│   ├── httpServer.ts         # HTTP 服务（状态同步）
│   ├── dataSync.ts           # 数据同步机制
│   └── types.ts              # MCP 类型定义
└── utils/
    └── logger.ts             # 日志工具
```

## 核心模块

### 1. SerialManager

串口连接管理器，负责：
- 串口连接/断开
- 数据收发
- 编码转换（GBK/UTF-8）
- 缓冲区管理

```typescript
// 主要方法
connect(path: string, baudRate: number): Promise<void>
disconnect(): Promise<void>
send(data: string): void
read(options?: ReadOptions): string
listPorts(): Promise<PortInfo[]>
```

### 2. SSHManager

SSH 多连接管理器，使用 `Map<string, SSHConnection>` 以 `hostId` 为键存储连接：
- 支持密码和私钥认证
- 支持多个 SSH 连接
- 自动查找默认私钥（id_ed25519, id_rsa 等）

```typescript
// 主要方法
connect(config: SSHConfig): Promise<void>
disconnect(hostId?: string): Promise<void>
send(hostId: string, data: string): void
read(hostId: string, options?: ReadOptions): string
getAllConnections(): SSHConnection[]
```

### 3. TerminalManager

VS Code Terminal 管理，使用 `Pseudoterminal` 实现：
- 创建串口/SSH 专用终端
- 处理用户输入
- 写入设备输出

### 4. UnifiedTreeProvider

三选项卡视图：
- **连接** - 串口列表、SSH 主机列表
- **快捷按钮** - 自定义按钮列表
- **设置** - 串口/SSH/日志配置

### 5. MCPCommandHandler

MCP 命令处理器，处理来自 MCP Server 的请求：
- 连接/断开操作
- 数据发送/读取
- 状态查询
- UI 同步（通过 `onConnectionChanged` 回调）

## 数据流

```
用户输入 → TerminalManager → SerialManager/SSHManager → 设备/服务器
设备输出 → SerialManager/SSHManager → TerminalManager → VS Code Terminal
```

## 开发环境设置

### 1. 克隆项目

```bash
git clone https://github.com/qiuchengcai/QSerial.git
cd QSerial
```

### 2. 安装依赖

```bash
npm install
```

### 3. 编译

```bash
npm run compile      # 单次编译
npm run watch        # 监听模式编译
```

### 4. 调试

1. 在 VS Code 中打开项目
2. 按 `F5` 启动调试
3. 这会打开一个新的 VS Code 窗口，扩展已加载

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run compile` | TypeScript 编译 |
| `npm run watch` | 监听模式编译 |
| `npm run lint` | ESLint 检查 |
| `npm run pretest` | 编译 + lint |
| `npm run test` | 运行测试 |
| `npm run package` | 打包 VSIX |
| `npm run mcp` | 启动 MCP Server |

## 配置存储

- **VS Code Settings**: `qserial.serial.*`, `qserial.ssh.savedHosts`, `qserial.buttons.customButtons`
- **SecretStorage**: SSH 密码（安全存储）
- **全局状态**: 自定义按钮配置

## 编码处理

串口数据使用 `iconv-lite` 转换，默认 GBK。流式数据可能分割多字节字符，需注意缓冲处理：

```typescript
// 支持的编码
'utf8' | 'gbk' | 'gb2312' | 'ascii' | 'latin1' | 'hex'
```

## Git 提交规范

提交信息必须使用中文，格式：

```
<类型>: <中文描述>

类型说明:
- feat:     新功能
- fix:      修复bug
- docs:     文档更新
- style:    代码格式调整
- refactor: 重构代码
- test:     测试相关
- chore:    构建/工具变动
```

## 添加新功能

### 1. 添加新命令

在 `package.json` 的 `contributes.commands` 中添加：

```json
{
  "command": "qserial.newCommand",
  "title": "新命令"
}
```

然后在 `extension.ts` 中注册：

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('qserial.newCommand', () => {
    // 命令实现
  })
);
```

### 2. 添加新配置

在 `package.json` 的 `contributes.configuration.properties` 中添加：

```json
{
  "qserial.newConfig": {
    "type": "string",
    "default": "",
    "description": "新配置说明"
  }
}
```

### 3. 添加 MCP 工具

在 `src/mcp/server.ts` 中添加新工具定义，并在 `commandHandler.ts` 中实现处理逻辑。

## 调试技巧

1. **查看日志**: 使用 `Logger.info/debug/error` 输出日志
2. **检查状态**: 查看 `~/.qserial/status.json`
3. **串口测试**: 使用虚拟串口软件（如 com0com）
4. **SSH 测试**: 使用本地 SSH 服务器或 Docker 容器

## 发布流程

1. 更新 `package.json` 版本号
2. 运行 `npm run pretest` 确保代码质量
3. 运行 `npm run package` 生成 VSIX
4. 发布到 VS Code Marketplace 或 GitHub Releases