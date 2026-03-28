# QSerial MCP 设计方案

## 目标

让 AI 能够像人类用户一样使用 QSerial 扩展的所有功能，包括：
- 串口连接/断开/数据收发
- SSH 连接/断开/命令执行
- 快捷按钮执行
- 状态查询

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI 助手 (Claude等)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Server (qmcp)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Tools      │  │  Resources   │  │   Prompts    │          │
│  │ - connect    │  │ - status     │  │ - 串口调试   │          │
│  │ - disconnect │  │ - ports      │  │ - SSH操作    │          │
│  │ - send       │  │ - buttons    │  │              │          │
│  │ - execute    │  │ - history    │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   SerialPort    │  │     SSH2        │  │  QSerial 扩展   │
│   (串口硬件)     │  │   (SSH协议)     │  │  (UI 同步)      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## MCP Tools 设计

### 1. 连接管理工具

#### `terminal_connect` - 连接终端
```typescript
{
  name: "terminal_connect",
  description: "连接到串口或SSH服务器",
  inputSchema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["serial", "ssh"] },
      // 串口参数
      path: { type: "string", description: "串口路径，如 COM3 或 /dev/ttyUSB0" },
      baudRate: { type: "number", default: 115200 },
      dataBits: { type: "number", enum: [5, 6, 7, 8], default: 8 },
      stopBits: { type: "number", enum: [1, 2], default: 1 },
      parity: { type: "string", enum: ["none", "even", "odd"], default: "none" },
      encoding: { type: "string", default: "gbk" },
      // SSH 参数
      host: { type: "string" },
      port: { type: "number", default: 22 },
      username: { type: "string" },
      password: { type: "string" },
      privateKey: { type: "string", description: "私钥内容或路径" },
      passphrase: { type: "string", description: "私钥密码" }
    },
    required: ["type"]
  }
}
```

#### `terminal_disconnect` - 断开连接
```typescript
{
  name: "terminal_disconnect",
  description: "断开终端连接",
  inputSchema: {
    type: "object",
    properties: {
      terminalId: { type: "string", description: "终端ID" }
    },
    required: ["terminalId"]
  }
}
```

### 2. 数据通信工具

#### `terminal_send` - 发送数据
```typescript
{
  name: "terminal_send",
  description: "向终端发送数据",
  inputSchema: {
    type: "object",
    properties: {
      terminalId: { type: "string" },
      data: { type: "string", description: "要发送的数据" },
      appendNewline: { type: "boolean", default: true, description: "是否追加换行符" }
    },
    required: ["terminalId", "data"]
  }
}
```

#### `terminal_read` - 读取数据
```typescript
{
  name: "terminal_read",
  description: "从终端读取数据",
  inputSchema: {
    type: "object",
    properties: {
      terminalId: { type: "string" },
      mode: { 
        type: "string", 
        enum: ["new", "all", "lines", "screen"],
        default: "new",
        description: "读取模式: new=新数据, all=全部, lines=按行, screen=屏幕缓冲"
      },
      lines: { type: "number", default: 50, description: "mode=lines 时的行数" },
      bytes: { type: "number", default: 4096, description: "读取字节数" },
      clear: { type: "boolean", default: true, description: "读取后是否清除缓冲" }
    },
    required: ["terminalId"]
  }
}
```

#### `terminal_wait` - 等待数据
```typescript
{
  name: "terminal_wait",
  description: "等待终端输出匹配特定模式",
  inputSchema: {
    type: "object",
    properties: {
      terminalId: { type: "string" },
      pattern: { type: "string", description: "匹配模式（正则表达式或字符串）" },
      patternType: { type: "string", enum: ["regex", "string"], default: "regex" },
      timeout: { type: "number", default: 10000, description: "超时时间(毫秒)" }
    },
    required: ["terminalId", "pattern"]
  }
}
```

### 3. 信息查询工具

#### `terminal_status` - 查询状态
```typescript
{
  name: "terminal_status",
  description: "获取终端连接状态",
  inputSchema: {
    type: "object",
    properties: {
      terminalId: { type: "string", description: "终端ID，不指定则返回所有" }
    }
  }
}
```

#### `serial_list_ports` - 列出串口
```typescript
{
  name: "serial_list_ports",
  description: "列出所有可用的串口设备",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

### 4. 快捷按钮工具

#### `button_execute` - 执行快捷按钮
```typescript
{
  name: "button_execute",
  description: "执行 QSerial 中配置的快捷按钮",
  inputSchema: {
    type: "object",
    properties: {
      buttonId: { type: "string", description: "按钮ID" },
      terminalId: { type: "string", description: "目标终端ID" }
    },
    required: ["buttonId"]
  }
}
```

#### `button_list` - 列出快捷按钮
```typescript
{
  name: "button_list",
  description: "列出所有可用的快捷按钮",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

## MCP Resources 设计

### 1. 终端状态资源
```
terminal://status
```
返回所有终端的当前状态，包括连接信息、缓冲区数据等。

### 2. 串口列表资源
```
serial://ports
```
返回可用串口设备列表。

### 3. 快捷按钮资源
```
qserial://buttons
```
返回配置的快捷按钮列表。

### 4. 历史记录资源
```
terminal://history/{terminalId}
```
返回指定终端的命令历史。

## MCP Prompts 设计

### 1. 串口调试助手
```typescript
{
  name: "serial_debug",
  description: "串口调试助手 - 帮助用户进行串口通信调试",
  arguments: [
    { name: "port", description: "串口路径" },
    { name: "baudRate", description: "波特率" }
  ]
}
```

### 2. SSH 远程操作
```typescript
{
  name: "ssh_session",
  description: "SSH 会话助手 - 帮助用户进行远程服务器操作",
  arguments: [
    { name: "host", description: "主机地址" },
    { name: "username", description: "用户名" }
  ]
}
```

## 与 QSerial 扩展的同步机制

### 方案一：状态文件同步（当前实现）
```
MCP Server ──写入──▶ ~/.qserial/status.json ◀──监听── QSerial 扩展
```

**优点**：简单，解耦
**缺点**：实时性差，需要轮询或文件监听

### 方案二：VS Code API 直接调用（推荐）

让 MCP Server 通过 VS Code 扩展 API 直接操作：

```typescript
// 在 QSerial 扩展中暴露 API
export interface QSerialAPI {
  // 连接管理
  connectSerial(path: string, options?: SerialOptions): Promise<string>;
  connectSSH(config: SSHConfig): Promise<string>;
  disconnect(terminalId: string): Promise<void>;
  
  // 数据通信
  send(terminalId: string, data: string): Promise<void>;
  read(terminalId: string, options?: ReadOptions): Promise<string>;
  wait(terminalId: string, pattern: string, timeout?: number): Promise<string>;
  
  // 状态查询
  getStatus(): Promise<TerminalStatus[]>;
  listPorts(): Promise<PortInfo[]>;
  
  // 快捷按钮
  executeButton(buttonId: string, terminalId?: string): Promise<void>;
  listButtons(): Promise<CustomButton[]>;
}

// extension.ts 中导出
export function activate(context: vscode.ExtensionContext): QSerialAPI {
  // ... 初始化代码 ...
  
  // 返回 API
  return {
    connectSerial: serialManager.connect.bind(serialManager),
    connectSSH: sshManager.connect.bind(sshManager),
    // ...
  };
}
```

### 方案三：WebSocket 通信

```
MCP Server ◀──WebSocket──▶ QSerial 扩展
```

**优点**：实时双向通信
**缺点**：复杂度高，需要额外的服务

## 推荐实现方案

### 阶段一：完善现有 MCP Tools
1. 实现完整的终端管理工具
2. 添加数据读取和等待功能
3. 添加快捷按钮支持

### 阶段二：QSerial 扩展集成
1. 在 QSerial 中暴露公共 API
2. MCP Server 通过 VS Code API 调用
3. 实现双向状态同步

### 阶段三：增强功能
1. 添加命令历史记录
2. 支持多终端会话
3. 添加数据过滤和解析

## 使用示例

### AI 助手使用场景

**场景一：串口调试**
```
用户: 帮我连接 COM3 串口，波特率 115200

AI: 我来帮你连接串口。
[调用 terminal_connect(type="serial", path="COM3", baudRate=115200)]
已成功连接 COM3 @ 115200。

用户: 发送 AT 命令

AI: [调用 terminal_send(terminalId="xxx", data="AT")]
已发送 AT 命令。
[调用 terminal_wait(terminalId="xxx", pattern="OK|ERROR", timeout=5000)]
收到响应: OK
```

**场景二：SSH 远程操作**
```
用户: 连接到服务器 192.168.1.100

AI: 我来帮你连接 SSH 服务器。
[调用 terminal_connect(type="ssh", host="192.168.1.100", username="user")]
请输入密码: ******

[调用 terminal_send(terminalId="xxx", data="ls -la")]
[调用 terminal_read(terminalId="xxx", mode="new")]
显示目录列表...
```

**场景三：使用快捷按钮**
```
用户: 执行重启设备的按钮

AI: [调用 button_list()]
找到按钮: "重启设备" (id: btn-restart)
[调用 button_execute(buttonId="btn-restart", terminalId="xxx")]
已执行重启命令。
```

## 技术细节

### 编码处理
- 串口默认使用 GBK 编码（中文环境常见）
- 支持 UTF-8、ASCII、HEX 等多种编码
- 流式数据需要处理多字节字符分割问题

### 缓冲区管理
- 环形缓冲区存储接收数据
- 支持按行、按字节、按模式读取
- 自动清理过期数据

### 错误处理
- 连接超时自动重试
- 断线自动重连
- 错误信息友好提示

## 文件结构

```
src/mcp/
├── mcpServer.ts           # MCP 服务器主入口
├── tools/
│   ├── connectTool.ts     # 连接工具
│   ├── disconnectTool.ts  # 断开工具
│   ├── sendTool.ts        # 发送工具
│   ├── readTool.ts        # 读取工具
│   ├── waitTool.ts        # 等待工具
│   ├── statusTool.ts      # 状态工具
│   ├── listPortsTool.ts   # 列出串口工具
│   └── buttonTool.ts      # 快捷按钮工具
├── resources/
│   ├── statusResource.ts  # 状态资源
│   ├── portsResource.ts   # 串口列表资源
│   └── buttonsResource.ts # 按钮资源
├── prompts/
│   ├── serialPrompt.ts    # 串口调试提示
│   └── sshPrompt.ts       # SSH 提示
└── types.ts               # 类型定义