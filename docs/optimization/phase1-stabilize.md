# 第一阶段：止血（Stabilize）

> 预计工时：1-2 周 | 目标：消除安全风险 + 建立测试基线

---

## 1.1 MCP 迁移到官方 SDK

### 背景

当前 `packages/main/src/mcp/manager.ts`（1682 行）自实现了全部 MCP 协议栈：
- JSON-RPC 2.0 解析/序列化
- SSE 会话管理
- streamableHttp 传输
- 令牌桶限流

### 风险

- 协议演进：MCP 规范持续更新，自实现需要手动跟随
- 边界情况：SSE 重连、streamableHttp 分帧等容易遗漏
- 安全审计：社区没有审查过这个自实现版本

### 方案

**引入 @modelcontextprotocol/sdk，用 SDK 替换传输层，保留工具 handler 逻辑**

#### 依赖变更

```json
// package.json
{
  "dependencies": {
+   "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

#### 代码改造

改造前文件结构：
```
packages/main/src/mcp/
├── manager.ts    # 1682 行：HTTP Server + JSON-RPC + SSE + streamableHttp + 限流 + 工具注册
└── xmodem.ts     # Xmodem 文件传输工具
```

改造后文件结构：
```
packages/main/src/mcp/
├── manager.ts         # 精简为：启动服务器 + 注册工具 + 生命周期管理（~200 行）
├── transports.ts      # 传输层配置（SSE + streamableHttp，各 ~30 行）
├── tools/
│   ├── connection.ts  # 连接管理工具（5个）
│   ├── data.ts        # 数据交互工具（5个）
│   ├── state.ts       # 状态感知工具（2个）
│   ├── xmodem.ts      # Xmodem 文件传输（已有）
│   └── help.ts        # 帮助工具
└── middleware.ts      # 认证 + 限流中间件
```

#### manager.ts 改造核心逻辑

```typescript
import { McpServer } from '@@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@@modelcontextprotocol/sdk/server/sse.js';
import * as http from 'node:http';

let mcpServer: McpServer | null = null;

export async function startMcpServer(port: number, address: string, password: string): Promise<void> {
  mcpServer = new McpServer({
    name: 'qserial',
    version: '0.2.0',
  });

  // 注册 13 个工具
  registerConnectionTools(mcpServer);
  registerDataTools(mcpServer);
  registerStateTools(mcpServer);
  registerXmodemTool(mcpServer);
  registerHelpTool(mcpServer);

  const httpServer = http.createServer(async (req, res) => {
    // 认证中间件
    if (password && !verifyAuth(req, password)) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    if (req.url === '/mcp') {
      // streamableHttp
      const transport = new StreamableHTTPServerTransport();
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } else if (req.url === '/sse') {
      // SSE（兼容 CodeBuddy）
      const transport = new SSEServerTransport('/messages', res);
      await mcpServer.connect(transport);
    }
  });

  httpServer.listen(port, address);
}
```

#### 删除的代码（~1200 行）

- 所有 JSON-RPC 解析/序列化逻辑
- 手动 SSE 会话管理（`sseSessions` Map）
- 手动 streamableHttp 处理
- 自实现令牌桶限流（SDK 提供更好的方案或中间件）

### 验证标准

- [ ] 13 个 MCP 工具全部可调用且行为不变
- [ ] Claude Code 通过 streamableHttp 连接正常
- [ ] CodeBuddy 通过 SSE 连接正常
- [ ] 密码认证生效
- [ ] manager.ts 代码量减少 60%+

---

## 1.2 MCP 安全加固

### 改动清单

| 序号 | 改动 | 说明 |
|------|------|------|
| 1 | 默认监听地址：`0.0.0.0` → `127.0.0.1` | 仅本地访问，需显式配置才开放 |
| 2 | 首次启动强制生成随机密码 | `crypto.randomBytes(16).toString('hex')` |
| 3 | 密码通过 IPC 展示给用户（UI 中显示） | 避免用户不知道密码 |
| 4 | Config 中新增 `mcp.listenAddress` 和 `mcp.password` 字段 | 持久化配置 |
| 5 | UI 中添加 MCP 设置面板 | 开关/端口/地址/密码管理 |

### 涉及文件

```
packages/main/src/mcp/manager.ts      # 安全逻辑
packages/shared/src/types/config.ts    # 新增 MCP 配置类型
packages/main/src/config/manager.ts    # 配置持久化
packages/renderer/src/stores/mcp.ts    # MCP 状态管理
packages/renderer/src/components/...   # MCP 设置 UI
```

### 验证标准

- [ ] 默认仅监听 127.0.0.1
- [ ] 无密码时拒绝所有 MCP 请求
- [ ] UI 中可查看/修改密码
- [ ] 密码持久化到配置文件

---

## 1.3 核心模块单元测试

### 测试范围

优先覆盖**最容易出错、修改最频繁**的模块：

| 模块 | 文件 | 测试重点 |
|------|------|---------|
| 连接工厂 | `connection/factory.ts` | 6 种类型的创建/销毁/异常 |
| 连接基类 | `connection/index.ts` | BaseConnection 生命周期 |
| Telnet | `connection/telnet.ts` | 选项协商、超时、断连 |
| MCP 工具 | `mcp/tools/*.ts` | handler 逻辑正确性 |
| 类型守卫 | `shared/types/connection.ts` | 类型判断函数 |
| Zustand Store | `renderer/stores/terminal.ts` | 状态流转 |

### 测试配置

`vitest.config.ts`（项目根目录）：
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/main/src/**', 'packages/shared/src/**'],
      thresholds: {
        lines: 15,
        branches: 10,
      },
    },
  },
});
```

### 示例：factory.test.ts

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 原生模块
vi.mock('node-pty', () => ({ spawn: vi.fn() }));
vi.mock('serialport', () => ({ SerialPort: vi.fn() }));
vi.mock('ssh2', () => ({ Client: vi.fn() }));

describe('ConnectionFactory', () => {
  let factory: ConnectionFactoryImpl;

  beforeEach(() => {
    factory = new ConnectionFactoryImpl();
    factory.initialize();
  });

  it('should create PTY connection', async () => {
    const conn = await factory.create({
      id: 'test-pty',
      name: 'Test PTY',
      type: ConnectionType.PTY,
      shell: 'bash',
    });
    expect(conn).toBeDefined();
    expect(conn.id).toBe('test-pty');
  });

  it('should throw on duplicate id', async () => {
    await factory.create({ id: 'dup', name: 'A', type: ConnectionType.PTY, shell: 'bash' });
    await expect(
      factory.create({ id: 'dup', name: 'B', type: ConnectionType.PTY, shell: 'bash' })
    ).rejects.toThrow('already exists');
  });

  it('should throw on unsupported type', async () => {
    await expect(
      factory.create({ id: 'x', name: 'X', type: 'invalid' as any })
    ).rejects.toThrow('Unsupported connection type');
  });

  it('should destroy connection', async () => {
    const conn = await factory.create({
      id: 'to-destroy', name: 'T', type: ConnectionType.PTY, shell: 'bash',
    });
    await factory.destroy('to-destroy');
    expect(factory.get('to-destroy')).toBeUndefined();
  });
});
```

### 验证标准

- [ ] `pnpm test` 可运行
- [ ] 至少覆盖 factory, telnet, MCP tools
- [ ] CI 中集成测试步骤
