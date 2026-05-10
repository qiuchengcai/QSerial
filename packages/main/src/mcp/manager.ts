/**
 * MCP (Model Context Protocol) 服务器管理器
 * 内建 HTTP MCP Server，支持 SSE 和 streamableHttp 两种传输方式
 */

import * as http from 'node:http';
import * as crypto from 'node:crypto';
import { BrowserWindow } from 'electron';
import type { ConnectionOptions } from '@qserial/shared';
import { ConnectionFactory } from '../connection/factory.js';
import {
  IPC_CHANNELS,
  ConnectionState,
} from '@qserial/shared';

let mainWindow: BrowserWindow | null = null;
let mcpServer: http.Server | null = null;
let mcpRunning = false;
let mcpPort = 9800;

// SSE 会话：sessionId → response
const sseSessions = new Map<string, http.ServerResponse>();

// 每个连接的输出缓冲区
const buffers = new Map<string, Buffer[]>();
const bufferSubscriptions = new Map<string, () => void>();

export interface McpServerStatus {
  running: boolean;
  port: number;
  connections: {
    id: string;
    type: string;
    name: string;
    state: string;
  }[];
}

// ==================== 帮助文档 ====================

const HELP_TEXT = `# QSerial AI 使用指南

## 概述
QSerial 是一个终端连接管理工具，内置 MCP 服务器，供 AI Agent 远程操作串口、SSH、Telnet、本地终端等设备。
AI 和人类可以同时操作同一个终端设备，互不阻塞。

## 可用工具

### connection_list — 列出所有连接
列出 QSerial 中所有活跃的连接及其状态。返回每个连接的 id、type、name、state。

### connection_info — 查看连接详情
参数: { "id": "连接ID" }
获取指定连接的详细信息（类型、状态、完整参数）。

### connection_write — 发送命令
参数: { "id": "连接ID", "data": "命令文本" }
向连接发送数据或命令。重要：终端命令末尾必须包含 \\n 换行符。
发送后自动等待 300ms 回显并返回。

### connection_read — 读取输出
参数: { "id": "连接ID" }
读取设备的输出缓冲区，读取后自动清空。适合"发一条命令→读一次响应"的模式。

### connection_peek — 预览输出
参数: { "id": "连接ID", "max_bytes": 4096 }
预览输出缓冲区内容，不清空。max_bytes 可选，默认 4096，返回最近 N 字节。

### connection_expect — 模式匹配等待
参数: { "id": "连接ID", "pattern": "匹配文本", "timeout": 30 }
等待输出中出现指定文本（子串匹配）。timeout 可选，默认 30 秒。
适合等待设备启动、登录提示等场景。

### connection_clear — 清空缓冲区
参数: { "id": "连接ID" }
清空指定连接的输出缓冲区。

## 典型操作流程

### 操作已有设备
1. connection_list → 获取设备列表和 connection_id
2. connection_peek → 了解当前终端显示内容
3. connection_write → 发送命令（如 "cat /proc/version\\n"）
4. connection_read → 读取命令输出

### 等待设备启动
1. connection_expect → 等待 "login:" 提示（最多等 30s）
2. connection_write → 发送用户名
3. connection_expect → 等待 "Password:"
4. connection_write → 发送密码
5. connection_read → 读取登录后输出

### 实时监控
1. connection_peek → 查看当前状态（不消耗）
2. connection_peek → 再次查看
3. connection_read → 需要处理时才消耗

## 连接类型
| 类型   | 说明       | 关键参数                              |
|--------|------------|---------------------------------------|
| SERIAL | 串口连接   | path, baudRate, dataBits, stopBits    |
| SSH    | SSH 远程   | host, port, username, password        |
| TELNET | Telnet     | host, port                            |
| PTY    | 本地终端   | shell, cwd                            |

## 注意事项
- 缓冲区上限 1MB，超出自动丢弃最早数据
- 多个 AI 客户端可同时连接 MCP，互不影响
- expect 会轮询缓冲区直到匹配或超时，期间不会丢失数据
- 命令必须包含 \\n 结尾，否则不会执行`;

// ==================== 工具定义 ====================

const MCP_TOOLS = [
  {
    name: 'connection_list',
    description: '列出 QSerial 中所有活跃的连接（串口、SSH、本地终端等）及其状态。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'connection_write',
    description: '向指定连接发送数据或命令。注意：终端命令末尾需包含 \\n 换行符。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        data: { type: 'string', description: '要发送的文本，如 "ls -la\\n"' },
      },
      required: ['id', 'data'],
    },
  },
  {
    name: 'connection_read',
    description: '读取指定连接的输出缓冲区（读取后清空）。用于获取设备对上次命令的响应。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'connection_peek',
    description: '预览指定连接的输出内容（不清空缓冲区）。用于了解当前终端显示的內容。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        max_bytes: { type: 'integer', description: '最多返回字节数，默认 4096', default: 4096 },
      },
      required: ['id'],
    },
  },
  {
    name: 'connection_expect',
    description: '等待连接输出中出现指定模式（如 "login:" 或 "ERROR"），带超时。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        pattern: { type: 'string', description: '要等待的文本模式（子串匹配）' },
        timeout: { type: 'number', description: '超时秒数，默认 30', default: 30 },
      },
      required: ['id', 'pattern'],
    },
  },
  {
    name: 'connection_info',
    description: '获取指定连接的详细信息（类型、状态、参数等）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'connection_clear',
    description: '清空指定连接的输出缓冲区。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'help',
    description: '获取 QSerial AI 使用说明和完整操作指南。',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ==================== 窗口引用 ====================

export function setMcpMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

// ==================== 缓冲区管理 ====================

function ensureBuffer(id: string): void {
  if (buffers.has(id)) return;
  buffers.set(id, []);

  const conn = ConnectionFactory.get(id);
  if (conn) {
    const unsub = conn.onData((data: Buffer) => {
      const buf = buffers.get(id);
      if (!buf) return;
      buf.push(data);
      let total = buf.reduce((s, b) => s + b.length, 0);
      while (total > 1_000_000 && buf.length > 0) {
        total -= buf.shift()!.length;
      }
      notifySse('data', {
        id,
        data: data.toString('base64'),
      });
    });
    bufferSubscriptions.set(id, unsub);
  }
}

function getBuffer(id: string): Buffer {
  const buf = buffers.get(id);
  if (!buf || buf.length === 0) return Buffer.alloc(0);
  return Buffer.concat(buf);
}

function consumeBuffer(id: string): Buffer {
  const result = getBuffer(id);
  buffers.set(id, []);
  return result;
}

function peekBuffer(id: string, maxBytes: number): Buffer {
  const all = getBuffer(id);
  return all.subarray(Math.max(0, all.length - maxBytes));
}

function clearBuffer(id: string): void {
  buffers.set(id, []);
}

function removeBuffer(id: string): void {
  const unsub = bufferSubscriptions.get(id);
  if (unsub) {
    unsub();
    bufferSubscriptions.delete(id);
  }
  buffers.delete(id);
}

// ==================== SSE 广播 ====================

function notifySse(event: string, data: Record<string, unknown>): void {
  const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseSessions.values()) {
    if (!res.destroyed) res.write(line);
  }
}

// ==================== SSE 单播 ====================

function sendSse(sessionId: string, event: string, data: string): void {
  const res = sseSessions.get(sessionId);
  if (res && !res.destroyed) {
    res.write(`event: ${event}\ndata: ${data}\n\n`);
  }
}

// ==================== HTTP 服务器 ====================

function createMcpServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlPath = req.url?.split('?')[0] || '/';

    // ── SSE 会话端点 (MCP SSE transport) ──
    if (req.method === 'GET' && urlPath === '/sse') {
      const sessionId = crypto.randomUUID();
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // 发送 endpoint 事件，告知客户端 POST 地址
      res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

      sseSessions.set(sessionId, res);

      req.on('close', () => {
        sseSessions.delete(sessionId);
      });
      return;
    }

    // ── 消息端点 (MCP SSE transport: POST JSON-RPC, 响应通过 SSE 返回) ──
    if (req.method === 'POST' && urlPath === '/messages') {
      const rawUrl = req.url || '/';
      const queryIdx = rawUrl.indexOf('?');
      const queryString = queryIdx >= 0 ? rawUrl.slice(queryIdx + 1) : '';
      const params = new URLSearchParams(queryString);
      const sessionId = params.get('sessionId');

      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });

      req.on('end', async () => {
        let reqData: { id?: unknown; method?: string; params?: Record<string, unknown> };
        try {
          reqData = JSON.parse(body);
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }));
          return;
        }

        const reqId = reqData.id;
        const method = reqData.method;
        const rpcParams = reqData.params || {};

        try {
          const result = await handleRpc(method, rpcParams, reqId);
          if (reqId === undefined || reqId === null) {
            res.writeHead(202);
            res.end();
            return;
          }

          const payload = JSON.stringify({ jsonrpc: '2.0', id: reqId, result });

          if (sessionId && sseSessions.has(sessionId)) {
            sendSse(sessionId, 'message', payload);
            res.writeHead(202);
            res.end();
          } else {
            // 无 SSE 会话时退化为同步 HTTP 响应
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(payload);
          }
        } catch (err) {
          if (reqId === undefined || reqId === null) {
            res.writeHead(202);
            res.end();
            return;
          }
          const errorPayload = JSON.stringify({
            jsonrpc: '2.0',
            id: reqId,
            error: { code: (err as { code?: number }).code || -32603, message: (err as Error).message },
          });

          if (sessionId && sseSessions.has(sessionId)) {
            sendSse(sessionId, 'message', errorPayload);
            res.writeHead(202);
            res.end();
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(errorPayload);
          }
        }
      });
      return;
    }

    // ── 直接 JSON-RPC 端点 (streamableHttp / 向后兼容) ──
    if (req.method === 'POST' && (urlPath === '/mcp' || urlPath === '/')) {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });

      req.on('end', () => {
        let reqData: { id?: unknown; method?: string; params?: Record<string, unknown> };
        try {
          reqData = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }));
          return;
        }

        const reqId = reqData.id;
        const method = reqData.method;
        const rpcParams = reqData.params || {};

        handleRpc(method, rpcParams, reqId)
          .then((result) => {
            if (reqId === undefined || reqId === null) return;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: reqId, result }));
          })
          .catch((err) => {
            if (reqId === undefined || reqId === null) return;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: reqId,
              error: { code: (err as { code?: number }).code || -32603, message: (err as Error).message },
            }));
          });
      });
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port, '0.0.0.0', () => {
    mcpRunning = true;
    mcpPort = port;
    sendStatus();
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error('[MCP] Server error:', err.message);
  });

  return server;
}

// ==================== JSON-RPC 处理 ====================

async function handleRpc(
  method: string | undefined,
  params: Record<string, unknown>,
  _reqId: unknown,
): Promise<unknown> {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'qserial-mcp', version: '0.1.0' },
      };

    case 'notifications/initialized':
      return {};

    case 'tools/list':
      return { tools: MCP_TOOLS };

    case 'tools/call': {
      const toolName = params.name as string;
      const toolArgs = (params.arguments as Record<string, unknown>) || {};
      const text = await executeTool(toolName, toolArgs);
      const isError = text.startsWith('错误:');
      return { content: [{ type: 'text', text }], isError };
    }

    case 'ping':
      return {};

    default:
      throw Object.assign(new Error(`未知方法: ${method}`), { code: -32601 });
  }
}

// ==================== 工具执行 ====================

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'connection_list': {
        const all = ConnectionFactory.getAll();
        return JSON.stringify(
          all.map((c) => ({
            id: c.id,
            type: c.type,
            name: (c.options as { name?: string }).name || '',
            state: c.state,
          })),
          null, 2,
        );
      }

      case 'connection_write': {
        const id = args.id as string;
        const data = args.data as string;
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        if (conn.state !== ConnectionState.CONNECTED) {
          return `错误: 连接 ${id} 未就绪（当前状态：${conn.state}）`;
        }
        ensureBuffer(id);
        conn.write(Buffer.from(data, 'utf-8'));
        await new Promise((r) => setTimeout(r, 300));
        const output = consumeBuffer(id).toString('utf-8');
        return output || `已发送 (${data.length} 字符)，无立即回显`;
      }

      case 'connection_read': {
        const id = args.id as string;
        if (!ConnectionFactory.get(id)) return `错误: 找不到连接 ${id}`;
        ensureBuffer(id);
        const output = consumeBuffer(id).toString('utf-8');
        return output || '(无新输出)';
      }

      case 'connection_peek': {
        const id = args.id as string;
        const maxBytes = (args.max_bytes as number) || 4096;
        if (!ConnectionFactory.get(id)) return `错误: 找不到连接 ${id}`;
        ensureBuffer(id);
        const output = peekBuffer(id, maxBytes).toString('utf-8');
        return output || '(缓冲区为空)';
      }

      case 'connection_expect': {
        const id = args.id as string;
        const pattern = args.pattern as string;
        const timeout = (args.timeout as number) || 30;
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        ensureBuffer(id);

        const deadline = Date.now() + timeout * 1000;
        while (Date.now() < deadline) {
          const output = consumeBuffer(id).toString('utf-8');
          if (output && output.includes(pattern)) {
            return output;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        const remaining = consumeBuffer(id).toString('utf-8');
        return `错误: 超时 (${timeout}s) 未匹配到 "${pattern}"。最后输出:\n${remaining.slice(-1000)}`;
      }

      case 'connection_info': {
        const id = args.id as string;
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        const opts = conn.options as ConnectionOptions;
        return JSON.stringify({
          id: conn.id,
          type: conn.type,
          state: conn.state,
          name: (opts as { name?: string }).name || '',
          options: opts,
        }, null, 2);
      }

      case 'connection_clear': {
        const id = args.id as string;
        clearBuffer(id);
        return '缓冲区已清空';
      }

      case 'help': {
        return HELP_TEXT;
      }

      default:
        return `错误: 未知工具 "${name}"`;
    }
  } catch (err) {
    return `错误: ${(err as Error).message}`;
  }
}

// ==================== 公共接口 ====================

export async function startMcpServer(port: number): Promise<void> {
  if (mcpRunning || mcpServer) {
    await stopMcpServer();
  }

  ConnectionFactory.onDestroy((conn) => removeBuffer(conn.id));

  mcpServer = createMcpServer(port);
}

export async function stopMcpServer(): Promise<void> {
  if (mcpServer) {
    await new Promise<void>((resolve) => {
      mcpServer!.close(() => resolve());
    });
    mcpServer = null;
  }

  for (const res of sseSessions.values()) {
    if (!res.destroyed) res.end();
  }
  sseSessions.clear();

  for (const unsub of bufferSubscriptions.values()) {
    unsub();
  }
  bufferSubscriptions.clear();
  buffers.clear();

  mcpRunning = false;
  sendStatus();
}

export function getMcpStatus(): McpServerStatus {
  return {
    running: mcpRunning,
    port: mcpPort,
    connections: ConnectionFactory.getAll().map((c) => ({
      id: c.id,
      type: c.type,
      name: (c.options as { name?: string }).name || '',
      state: c.state,
    })),
  };
}

function sendStatus(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.MCP_STATUS_EVENT, {
      running: mcpRunning,
      port: mcpPort,
    });
  }
}

export async function destroyMcpManager(): Promise<void> {
  await stopMcpServer();
}
