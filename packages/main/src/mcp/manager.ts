/**
 * MCP (Model Context Protocol) 服务器管理器
 * 内建 HTTP MCP Server，支持 SSE 和 streamableHttp 两种传输方式
 */

import * as http from 'node:http';
import * as crypto from 'node:crypto';
import { BrowserWindow } from 'electron';
import type { ConnectionOptions, ConnectionServerOptions } from '@qserial/shared';
import { ConnectionFactory } from '../connection/factory.js';
import { ConnectionServerConnection } from '../connection/connectionServer.js';
import {
  IPC_CHANNELS,
  ConnectionState,
  ConnectionType,
} from '@qserial/shared';

let mainWindow: BrowserWindow | null = null;
let mcpServer: http.Server | null = null;
let mcpRunning = false;
let mcpPort = 9800;
let mcpListenAddress = '127.0.0.1';
let mcpAuthPassword = '';

// 共享桥接池：shareId → { sourceId, serverId }
const sharePool = new Map<string, { sourceId: string; serverId: string }>();

// 简易令牌桶限流：每秒最多 30 个请求，突发最多 50
const rateLimitTokens = new Map<string, { tokens: number; lastRefill: number }>();
const RATE_LIMIT_MAX = 50;
const RATE_LIMIT_REFILL_RATE = 30; // tokens per second

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  let bucket = rateLimitTokens.get(clientId);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_MAX, lastRefill: now };
    rateLimitTokens.set(clientId, bucket);
  }
  // 补充令牌
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(RATE_LIMIT_MAX, bucket.tokens + elapsed * RATE_LIMIT_REFILL_RATE);
  bucket.lastRefill = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

// 定期清理过期的限流桶（每 5 分钟清理一次）
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitTokens) {
    if (now - bucket.lastRefill > 300_000) rateLimitTokens.delete(key);
  }
}, 300_000).unref();

// SSE 会话：sessionId → response
const sseSessions = new Map<string, http.ServerResponse>();

// 每个连接的输出缓冲区
const buffers = new Map<string, Buffer[]>();
const bufferSubscriptions = new Map<string, () => void>();

export interface McpServerStatus {
  running: boolean;
  port: number;
  listenAddress: string;
  needsAuth: boolean;
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

## 可用工具 (共13个)

### 连接管理
- connection_create — 创建并连接新设备 (serial/ssh/telnet/pty)
- connection_disconnect — 断开并销毁指定连接
- connection_update — 调整终端尺寸或串口波特率
- connection_list — 列出所有活跃连接及其状态
- connection_info — 获取连接详细信息（类型、参数）

### 数据交互
- connection_write — 发送命令/数据（末尾需 \\n）
- connection_read — 读取输出缓冲区（读后清空）
- connection_peek — 预览输出缓冲区（不清空）
- connection_expect — 等待指定模式出现（带超时）
- connection_clear — 清空输出缓冲区

### 状态感知
- connection_state — 分析交互状态: login_prompt/password_prompt/shell(root/user)/booting/program_running/idle
- connection_login — 自动登录: 检测login:→发送用户名→检测Password:→发送密码→等待Shell就绪

### 帮助
- help — 返回本文档

## 典型操作流程

### 创建并操作设备
1. connection_create → 创建 serial/ssh/telnet 连接，获取连接ID
2. connection_peek → 了解当前终端显示内容
3. connection_write → 发送命令（如 "cat /proc/version\\n"）
4. connection_read → 读取命令输出

### 自动登录设备
1. connection_state → 查看当前状态（login_prompt? shell?）
2. connection_login → 传入用户名密码，自动完成登录
3. connection_write → 登录成功后直接操作

### 等待设备启动
1. connection_state → 确认是否处于 booting 状态
2. connection_expect → 等待 "login:" 提示
3. connection_login → 自动完成登录

### 实时监控
1. connection_peek → 查看当前状态（不消耗缓冲区）
2. connection_state → 分析交互阶段
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
- 命令必须包含 \\n 结尾，否则不会执行
- connection_state 分析最近 64KB 输出，刚清屏可能返回 idle
- connection_update 修改波特率时会自动断开重连`;

// ==================== 工具定义 ====================

const MCP_TOOLS = [
  {
    name: 'connection_list',
    description: '列出 QSerial 中所有活跃的连接（串口、SSH、本地终端等）及其状态。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'connection_write',
    description: '向指定连接发送数据或命令。支持发送前延迟和条件等待。注意：终端命令末尾需包含 \\n 换行符。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        data: { type: 'string', description: '要发送的文本，如 "ls -la\\n"' },
        delay_ms: { type: 'integer', description: '发送前等待毫秒数，默认 0' },
        wait_before: { type: 'string', description: '发送前等待输出中出现此文本（子串匹配），超时 10s' },
        response_timeout_ms: { type: 'integer', description: '等待回显最大毫秒数，默认 500。有新数据立即返回，不等到超时' },
      },
      required: ['data'],
    },
  },
  {
    name: 'connection_read',
    description: '读取指定连接的输出缓冲区（读取后清空）。返回数据内容、字节数和时间戳。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'connection_peek',
    description: '预览指定连接的输出内容（不清空缓冲区）。返回数据内容、缓冲区总字节数。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        max_bytes: { type: 'integer', description: '最多返回字节数，默认 4096', default: 4096 },
      },
    },
  },
  {
    name: 'connection_expect',
    description: '等待连接输出中出现指定模式。支持普通子串匹配和正则表达式匹配。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        pattern: { type: 'string', description: '要匹配的模式（子串或正则）' },
        regex: { type: 'boolean', description: '为 true 时使用正则匹配（默认大小写不敏感）', default: false },
        timeout: { type: 'number', description: '超时秒数，默认 30', default: 30 },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'connection_info',
    description: '获取指定连接的详细信息（类型、状态、参数等）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'connection_clear',
    description: '清空指定连接的输出缓冲区。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'connection_create',
    description: '创建并连接新设备。type=serial 需提供 path/baudRate；type=ssh 需提供 host/username/password；type=telnet 需提供 host/port；type=pty 可无额外参数。',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '连接类型：serial, ssh, telnet, pty' },
        name: { type: 'string', description: '连接名称（可选）' },
        // serial
        path: { type: 'string', description: '[serial] 串口设备路径，如 /dev/ttyUSB0' },
        baudRate: { type: 'integer', description: '[serial] 波特率，默认 9600' },
        dataBits: { type: 'integer', description: '[serial] 数据位 5/6/7/8，默认 8' },
        stopBits: { type: 'number', description: '[serial] 停止位 1/1.5/2，默认 1' },
        parity: { type: 'string', description: '[serial] 校验位 none/even/odd/mark/space' },
        // ssh
        host: { type: 'string', description: '[ssh/telnet] 主机名或 IP' },
        port: { type: 'integer', description: '[ssh/telnet] 端口，SSH 默认 22，Telnet 默认 23' },
        username: { type: 'string', description: '[ssh] 用户名' },
        password: { type: 'string', description: '[ssh] 密码' },
        // pty
        shell: { type: 'string', description: '[pty] Shell 路径，默认系统默认 shell' },
      },
      required: ['type'],
    },
  },
  {
    name: 'connection_disconnect',
    description: '断开并销毁指定连接。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'connection_update',
    description: '修改连接参数。支持调整终端尺寸 (cols/rows) 或串口波特率。修改波特率会断开重连。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        cols: { type: 'integer', description: '终端列数' },
        rows: { type: 'integer', description: '终端行数' },
        baudRate: { type: 'integer', description: '[serial] 新波特率' },
      },
    },
  },
  {
    name: 'connection_state',
    description: '分析连接的当前交互状态。检测终端处于登录界面、Shell、程序运行中等阶段。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'connection_login',
    description: '自动化串口/Telnet 登录流程。支持正则模式匹配，提供每步详细调试输出。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        username: { type: 'string', description: '登录用户名' },
        password: { type: 'string', description: '登录密码' },
        loginPrompt: { type: 'string', description: '登录提示正则，默认 "login[:\\s]|username[:\\s]"' },
        passwordPrompt: { type: 'string', description: '密码提示正则，默认 "[Pp]assword[:\\s]"' },
        shellPrompt: { type: 'string', description: 'Shell 提示正则，默认 "[#$>]\\\\s"', default: '[#$>]\\s' },
        timeout: { type: 'number', description: '每步超时秒数，默认 30' },
        debug: { type: 'boolean', description: '为 true 时返回每步详细过程', default: true },
      },
      required: ['username', 'password'],
    },
  },
  {
    name: 'help',
    description: '获取 QSerial AI 使用说明和完整操作指南。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'connection_share_start',
    description: '为指定连接启动 TCP 共享服务。共享后可通过 Telnet 或 JSON API 端口远程访问该连接。密码默认使用 MCP 认证 token。',
    inputSchema: {
      type: 'object',
      properties: {
        connection_id: { type: 'string', description: '要共享的源连接 ID' },
        local_port: { type: 'integer', description: 'TCP Telnet 监听端口' },
        api_port: { type: 'integer', description: 'JSON API 端口（可选），供程序化访问' },
        listen_address: { type: 'string', description: '监听地址，默认 0.0.0.0', default: '0.0.0.0' },
        password: { type: 'string', description: '访问密码，默认使用 MCP 认证 token' },
      },
      required: ['connection_id', 'local_port'],
    },
  },
  {
    name: 'connection_share_stop',
    description: '停止指定共享服务并释放端口。',
    inputSchema: {
      type: 'object',
      properties: {
        share_id: { type: 'string', description: '共享服务 ID' },
      },
      required: ['share_id'],
    },
  },
  {
    name: 'connection_share_list',
    description: '列出所有活跃的共享服务及其状态（端口、客户端数等）。',
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

// ==================== 认证检查 ====================

function checkAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (!mcpAuthPassword) return true;
  const auth = req.headers.authorization;
  if (!auth) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer realm="QSerial MCP"',
    });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: '未授权：需要 Bearer token 认证' } }));
    return false;
  }
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (token !== mcpAuthPassword) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32002, message: '认证失败：token 不匹配' } }));
    return false;
  }
  return true;
}

// ==================== HTTP 服务器 ====================

function createMcpServer(port: number, listenAddress: string): http.Server {
  const bindAddr = listenAddress || '127.0.0.1';
  const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlPath = req.url?.split('?')[0] || '/';

    // ── SSE 会话端点 (MCP SSE transport) ──
    if (req.method === 'GET' && urlPath === '/sse') {
      const rawUrl2 = req.url || '/';
      const queryIdx = rawUrl2.indexOf('?');
      const queryString = queryIdx >= 0 ? rawUrl2.slice(queryIdx + 1) : '';
      const sseParams = new URLSearchParams(queryString);
      const sseToken = sseParams.get('token');
      if (mcpAuthPassword && sseToken !== mcpAuthPassword) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '认证失败：token 不匹配' }));
        return;
      }
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
      if (!checkAuth(req, res)) return;
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
        const rpcParams = { ...reqData.params || {}, _sessionId: sessionId, _clientIp: req.socket.remoteAddress };

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
      if (!checkAuth(req, res)) return;
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
        const rpcParams = { ...reqData.params || {}, _clientIp: req.socket.remoteAddress };

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

  server.listen(port, bindAddr, () => {
    mcpRunning = true;
    mcpPort = port;
    mcpListenAddress = bindAddr;
    sendStatus();
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error('[MCP] Server error:', err.message);
  });

  return server;
}

// ==================== 状态分析 ====================

interface TerminalState {
  state: 'login_prompt' | 'password_prompt' | 'shell' | 'program_running' | 'idle' | 'booting' | 'unknown';
  shell_type?: string;
  detected_prompts: string[];
  details: string;
}

function analyzeState(output: string, connectionState: string): TerminalState {
  if (connectionState !== 'connected') {
    return { state: 'idle', detected_prompts: [], details: `连接状态: ${connectionState}` };
  }

  if (!output || output.trim().length === 0) {
    return { state: 'idle', detected_prompts: [], details: '缓冲区为空，等待设备输出' };
  }

  const tail = output.slice(-1024).toLowerCase();
  const detected: string[] = [];

  if (/password[:\s]/i.test(tail)) {
    detected.push('password_prompt');
  }

  if (/login[:\s]|username[:\s]/i.test(tail) && !detected.includes('password_prompt')) {
    detected.push('login_prompt');
  }

  const lastLine = (output.split('\n').filter(l => l.trim()).pop() || '').trim();
  let shellType = '';
  if (lastLine.endsWith('# ') || lastLine.match(/#\s*$/)) {
    shellType = 'root';
    detected.push('root_shell');
  } else if (lastLine.endsWith('$ ') || lastLine.match(/\$\s*$/)) {
    shellType = 'user';
    detected.push('user_shell');
  } else if (lastLine.endsWith('> ') || lastLine.match(/>\s*$/)) {
    shellType = 'prompt';
    detected.push('shell_prompt');
  }

  const bootIndicators = ['booting', 'kernel', 'u-boot', 'uboot', 'starting kernel', 'bios', 'grub', 'systemd'];
  const hasBootMsg = bootIndicators.some(k => tail.includes(k));

  if (detected.includes('password_prompt')) {
    return { state: 'password_prompt', shell_type: shellType || undefined, detected_prompts: detected, details: '等待输入密码' };
  }
  if (detected.includes('login_prompt')) {
    return { state: 'login_prompt', shell_type: shellType || undefined, detected_prompts: detected, details: '等待输入用户名' };
  }
  if (shellType) {
    return { state: 'shell', shell_type: shellType, detected_prompts: detected, details: `Shell 就绪 (${shellType})` };
  }
  if (hasBootMsg) {
    return { state: 'booting', detected_prompts: detected, details: '设备正在启动中' };
  }

  return { state: 'program_running', detected_prompts: detected, details: '设备有数据输出，未检测到 Shell 提示符或登录提示' };
}

// ==================== 辅助函数 ====================

function resolveId(args: Record<string, unknown>): string {
  return (args.id || args.connectionId) as string;
}

function bufferSize(id: string): number {
  const buf = buffers.get(id);
  if (!buf) return 0;
  return buf.reduce((s, b) => s + b.length, 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function matchPattern(text: string, pattern: string, isRegex: boolean): boolean {
  if (isRegex) {
    try {
      return new RegExp(pattern, 'i').test(text);
    } catch {
      return text.toLowerCase().includes(pattern.toLowerCase());
    }
  }
  return text.toLowerCase().includes(pattern.toLowerCase());
}

async function waitPattern(
  id: string, pattern: string, timeout: number, isRegex = false,
): Promise<{ matched: boolean; output: string }> {
  const deadline = Date.now() + timeout * 1000;
  let allOutput = '';
  let wakeup: (() => void) | null = null;
  let unsub: (() => void) | null = null;

  const conn = ConnectionFactory.get(id);
  if (conn) {
    unsub = conn.onData(() => {
      wakeup?.();
    });
  }

  const cleanup = () => {
    if (unsub) { unsub(); unsub = null; }
  };

  try {
    while (Date.now() < deadline) {
      const chunk = consumeBuffer(id).toString('utf-8');
      if (chunk) {
        allOutput += chunk;
        if (matchPattern(allOutput, pattern, isRegex)) {
          cleanup();
          return { matched: true, output: allOutput };
        }
      }
      // Wait for new data or timeout (capped at 200ms per tick)
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await Promise.race([
        new Promise<void>(r => { wakeup = r; }),
        sleep(Math.min(remaining, 200)),
      ]);
    }
    cleanup();
    return { matched: false, output: allOutput };
  } catch {
    cleanup();
    return { matched: false, output: allOutput };
  }
}

async function waitForData(id: string, timeoutMs: number): Promise<void> {
  let wakeup: (() => void) | null = null;
  let unsub: (() => void) | null = null;

  const conn = ConnectionFactory.get(id);
  if (conn) {
    unsub = conn.onData(() => {
      wakeup?.();
    });
  }

  try {
    await Promise.race([
      new Promise<void>(r => { wakeup = r; }),
      sleep(timeoutMs),
    ]);
  } finally {
    if (unsub) unsub();
  }
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
      // 限流检查：使用 sessionId 或 IP 作为客户端标识
      const rateLimitKey = (params._sessionId as string) || (params._clientIp as string) || 'unknown';
      if (!checkRateLimit(rateLimitKey)) {
        throw Object.assign(new Error('请求过于频繁，请稍后再试'), { code: -32003 });
      }
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
        const id = resolveId(args);
        const data = args.data as string;
        if (!id) return '错误: 未提供连接 id';
        if (!data) return '错误: 未提供 data 参数';
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        if (conn.state !== ConnectionState.CONNECTED) {
          return `错误: 连接 ${id} 未就绪（当前状态：${conn.state}）`;
        }
        ensureBuffer(id);

        // 条件等待：发送前等待指定提示符
        if (args.wait_before) {
          const wbPattern = args.wait_before as string;
          const wbResult = await waitPattern(id, wbPattern, 10, false);
          if (!wbResult.matched) {
            return `错误: 等待 "${wbPattern}" 超时 (10s)。最后输出:\n${wbResult.output.slice(-500)}`;
          }
        }

        // 发送前延迟
        if (args.delay_ms) {
          await sleep(args.delay_ms as number);
        }

        conn.write(Buffer.from(data, 'utf-8'));
        // 等待回显数据，最长等待 response_timeout_ms（默认500ms），有新数据立即返回
        const responseTimeout = (args.response_timeout_ms as number) || 500;
        await waitForData(id, responseTimeout);
        const output = consumeBuffer(id).toString('utf-8');
        const meta = `sent=${data.length}B, replied=${output.length}B, ts=${Date.now()}`;
        return output
          ? `${output}\n\n[${meta}]`
          : `已发送 (${data.length} 字符)，无立即回显 [${meta}]`;
      }

      case 'connection_read': {
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
        if (!ConnectionFactory.get(id)) return `错误: 找不到连接 ${id}`;
        ensureBuffer(id);
        const totalBefore = bufferSize(id);
        const output = consumeBuffer(id).toString('utf-8');
        const meta = `bytes=${output.length}, total_before_read=${totalBefore}, ts=${Date.now()}`;
        return output
          ? `${output}\n[${meta}]`
          : `(无新输出) [${meta}]`;
      }

      case 'connection_peek': {
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
        const maxBytes = (args.max_bytes as number) || 4096;
        if (!ConnectionFactory.get(id)) return `错误: 找不到连接 ${id}`;
        ensureBuffer(id);
        const totalBytes = bufferSize(id);
        const output = peekBuffer(id, maxBytes).toString('utf-8');
        const meta = `shown=${output.length}, buffer_total=${totalBytes}, ts=${Date.now()}`;
        return output
          ? `${output}\n[${meta}]`
          : `(缓冲区为空) [${meta}]`;
      }

      case 'connection_expect': {
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
        const pattern = args.pattern as string;
        if (!pattern) return '错误: 未提供 pattern 参数';
        const isRegex = args.regex === true;
        const timeout = (args.timeout as number) || 30;
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        ensureBuffer(id);

        const result = await waitPattern(id, pattern, timeout, isRegex);

        if (result.matched) {
          return `${result.output}\n[匹配 "${pattern}" (${isRegex ? 'regex' : 'substr'}), 耗时=${result.output.length}B]`;
        }

        // 超时：提供更多诊断信息
        const remaining = consumeBuffer(id).toString('utf-8');
        const all = result.output + remaining;
        const tail = all.slice(-1000);
        return `错误: 超时 (${timeout}s) 未匹配/${isRegex ? 'regex' : 'substr'}: "${pattern}"。最后 1000 字节:\n${tail}`;
      }

      case 'connection_info': {
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
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
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
        clearBuffer(id);
        return '缓冲区已清空';
      }

      case 'connection_create': {
        const ctype = args.type as string;
        if (!['serial', 'ssh', 'telnet', 'pty'].includes(ctype)) {
          return `错误: 不支持的连接类型 "${ctype}"，支持: serial, ssh, telnet, pty`;
        }

        const id = crypto.randomUUID();
        const name = (args.name as string) || `${ctype.toUpperCase()} ${((args.host || args.path) as string) || ''}`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const options: any = {
          id,
          name,
          type: ctype,
          autoReconnect: false,
        };

        if (ctype === 'serial') {
          if (!args.path) return '错误: serial 类型需要 path 参数（串口设备路径）';
          options.path = args.path as string;
          options.baudRate = (args.baudRate as number) || 9600;
          options.dataBits = (args.dataBits as number) || 8;
          options.stopBits = (args.stopBits as number) || 1;
          options.parity = (args.parity as string) || 'none';
        } else if (ctype === 'ssh') {
          if (!args.host) return '错误: ssh 类型需要 host 参数';
          if (!args.username) return '错误: ssh 类型需要 username 参数';
          options.host = args.host as string;
          options.port = (args.port as number) || 22;
          options.username = args.username as string;
          if (args.password) options.password = args.password as string;
        } else if (ctype === 'telnet') {
          if (!args.host) return '错误: telnet 类型需要 host 参数';
          options.host = args.host as string;
          options.port = (args.port as number) || 23;
        } else if (ctype === 'pty') {
          options.shell = (args.shell as string) || (process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash');
          options.cols = 80;
          options.rows = 24;
        }

        try {
          const conn = await ConnectionFactory.create(options);
          await conn.open();
          ensureBuffer(id);
          return JSON.stringify({ id, type: ctype, state: conn.state, message: '连接已创建并就绪' }, null, 2);
        } catch (err) {
          return `错误: 创建连接失败 — ${(err as Error).message}`;
        }
      }

      case 'connection_disconnect': {
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        try {
          await ConnectionFactory.destroy(id);
          removeBuffer(id);
          return `连接 ${id} 已断开并销毁`;
        } catch (err) {
          return `错误: 断开连接失败 — ${(err as Error).message}`;
        }
      }

      case 'connection_update': {
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;

        const parts: string[] = [];

        if (args.cols !== undefined || args.rows !== undefined) {
          const cols = (args.cols as number) || 80;
          const rows = (args.rows as number) || 24;
          conn.resize(cols, rows);
          parts.push(`终端尺寸调整为 ${cols}x${rows}`);
        }

        if (args.baudRate !== undefined && conn.type === 'serial') {
          const opts = conn.options as { baudRate?: number };
          const oldBaud = opts.baudRate;
          try {
            await conn.close();
            opts.baudRate = args.baudRate as number;
            await conn.open();
            parts.push(`波特率从 ${oldBaud} 更新为 ${args.baudRate}`);
          } catch (err) {
            return `错误: 更新波特率失败 — ${(err as Error).message}`;
          }
        }

        return parts.length > 0 ? parts.join('; ') : '错误: 未提供需要修改的参数（cols/rows/baudRate）';
      }

      case 'connection_state': {
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        ensureBuffer(id);
        const totalBytes = bufferSize(id);
        const output = peekBuffer(id, 65536).toString('utf-8');
        const state = analyzeState(output, conn.state);
        return JSON.stringify({ ...state, buffer_bytes: totalBytes, output_tail_bytes: output.length }, null, 2);
      }

      case 'connection_login': {
        const id = resolveId(args);
        const username = args.username as string;
        const password = args.password as string;
        if (!id) return '错误: 未提供连接 id';
        if (!username) return '错误: 未提供 username 参数';
        if (!password) return '错误: 未提供 password 参数';

        const loginPrompt = (args.loginPrompt as string) || 'login[:\\s]|username[:\\s]';
        const passwordPrompt = (args.passwordPrompt as string) || '[Pp]assword[:\\s]';
        const shellPrompt = (args.shellPrompt as string) || '[#$>]\\s';
        const timeout = (args.timeout as number) || 30;
        const debug = args.debug !== false;
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        if (conn.state !== ConnectionState.CONNECTED) {
          return `错误: 连接未就绪（当前状态：${conn.state}）`;
        }
        ensureBuffer(id);

        const steps: string[] = [];
        const addStep = (s: string) => { if (debug) steps.push(s); };

        addStep(`[1/5] 等待登录提示 (regex: "${loginPrompt}", timeout=${timeout}s)...`);

        // 步骤 1: 等待登录提示
        const loginResult = await waitPattern(id, loginPrompt, timeout, true);
        if (!loginResult.matched) {
          if (debug) {
            return [
              ...steps,
              `[失败] 超时未匹配登录提示`,
              `当前输出 (500B): ${loginResult.output.slice(-500)}`,
              `提示: 尝试先用 connection_peek 查看终端内容，确认提示符格式`,
            ].join('\n');
          }
          return `错误: 超时未检测到登录提示 "${loginPrompt}"。当前内容:\n${loginResult.output.slice(-500)}`;
        }
        addStep(`[2/5] 检测到登录提示，发送用户名 "${username}" (输出 ${loginResult.output.length}B)`);

        // 步骤 2: 发送用户名
        conn.write(Buffer.from(username + '\n', 'utf-8'));
        await sleep(300);
        clearBuffer(id);

        // 步骤 3: 等待密码提示
        addStep(`[3/5] 等待密码提示 (regex: "${passwordPrompt}", timeout=${timeout}s)...`);
        const passResult = await waitPattern(id, passwordPrompt, timeout, true);
        if (!passResult.matched) {
          if (debug) {
            return [
              ...steps,
              `[失败] 超时未匹配密码提示`,
              `用户名已发送，但未检测到密码提示`,
              `当前输出 (500B): ${passResult.output.slice(-500)}`,
              `提示: 检查用户名是否正确，或使用 connection_peek 查看终端`,
            ].join('\n');
          }
          return `错误: 超时未检测到密码提示 "${passwordPrompt}"。当前内容:\n${passResult.output.slice(-500)}`;
        }
        addStep(`[4/5] 检测到密码提示，发送密码 (输出 ${passResult.output.length}B)`);

        // 步骤 4: 发送密码
        conn.write(Buffer.from(password + '\n', 'utf-8'));
        await sleep(300);

        // 步骤 5: 等待 Shell 提示符
        addStep(`[5/5] 等待 Shell 提示符 (regex: "${shellPrompt}", timeout=${timeout}s)...`);
        const shellResult = await waitPattern(id, shellPrompt, timeout, true);
        const output = consumeBuffer(id).toString('utf-8');

        if (shellResult.matched) {
          const state = analyzeState(output, conn.state);
          addStep(`[完成] 登录成功，Shell 类型: ${state.shell_type || 'detected'}`);
          return steps.join('\n') + `\n\n登录成功。\n${output.slice(-300)}`;
        }

        addStep(`[完成] 凭据已发送（Shell 提示未检测到，可能已登录）`);
        return steps.join('\n') + `\n\n${output.slice(-500)}`;
      }

      case 'connection_share_start': {
        const sourceId = args.connection_id as string;
        const localPort = args.local_port as number;
        if (!sourceId) return '错误: 未提供 connection_id';
        if (!localPort) return '错误: 未提供 local_port';

        const sourceConn = ConnectionFactory.get(sourceId);
        if (!sourceConn) return `错误: 找不到源连接 ${sourceId}`;
        if (sourceConn.state !== ConnectionState.CONNECTED) {
          return `错误: 源连接未就绪（当前状态：${sourceConn.state}）`;
        }

        const serverId = crypto.randomUUID();
        const apiPort = args.api_port as number | undefined;
        const listenAddress = (args.listen_address as string) || '0.0.0.0';
        const password = (args.password as string) || mcpAuthPassword || undefined;

        const options: ConnectionServerOptions = {
          id: serverId,
          type: ConnectionType.CONNECTION_SERVER,
          sourceType: 'existing',
          existingConnectionId: sourceId,
          localPort,
          listenAddress,
          accessPassword: password,
        };
        if (apiPort) options.apiPort = apiPort;

        try {
          const serverConn = await ConnectionFactory.create(options);
          await serverConn.open();
          sharePool.set(serverId, { sourceId, serverId });

          const status = (serverConn as ConnectionServerConnection).getStatus();
          return JSON.stringify({
            share_id: serverId,
            local_port: status.localPort,
            listen_address: status.listenAddress,
            source_id: sourceId,
            source_type: sourceConn.type,
            source_description: status.sourceDescription || `${sourceConn.type} - ${(sourceConn.options as { name?: string }).name || ''}`,
            client_count: status.clientCount,
            clients: status.clients,
            has_password: !!options.accessPassword,
            telnet_cmd: `telnet ${status.listenAddress} ${status.localPort}`,
            api_endpoint: apiPort ? `${status.listenAddress}:${apiPort}` : null,
          }, null, 2);
        } catch (err) {
          return `错误: 启动共享失败 — ${(err as Error).message}`;
        }
      }

      case 'connection_share_stop': {
        const shareId = args.share_id as string;
        if (!shareId) return '错误: 未提供 share_id';

        if (!sharePool.has(shareId)) return `错误: 找不到共享 ${shareId}`;

        try {
          await ConnectionFactory.destroy(shareId);
          sharePool.delete(shareId);
          removeBuffer(shareId);
          return `共享 ${shareId} 已停止`;
        } catch (err) {
          return `错误: 停止共享失败 — ${(err as Error).message}`;
        }
      }

      case 'connection_share_list': {
        const shares: unknown[] = [];
        for (const [id, entry] of sharePool) {
          const conn = ConnectionFactory.get(id);
          if (conn && conn.type === ConnectionType.CONNECTION_SERVER) {
            const status = (conn as ConnectionServerConnection).getStatus();
            shares.push({
              share_id: id,
              source_id: entry.sourceId,
              source_type: conn.options.type,
              local_port: status.localPort,
              listen_address: status.listenAddress,
              client_count: status.clientCount,
              clients: status.clients,
              has_password: status.hasPassword,
              running: status.running,
              telnet_cmd: status.running ? `telnet ${status.listenAddress} ${status.localPort}` : null,
            });
          }
        }
        return shares.length > 0 ? JSON.stringify(shares, null, 2) : '(没有活跃的共享)';
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

export async function startMcpServer(port: number, listenAddress?: string, authPassword?: string): Promise<void> {
  if (mcpRunning || mcpServer) {
    await stopMcpServer();
  }

  mcpAuthPassword = authPassword || '';
  mcpListenAddress = listenAddress || '127.0.0.1';
  ConnectionFactory.onDestroy((conn) => removeBuffer(conn.id));

  mcpServer = createMcpServer(port, mcpListenAddress);
}

export async function stopMcpServer(): Promise<void> {
  // 先关闭所有 SSE 长连接，否则 server.close() 不会触发
  for (const res of sseSessions.values()) {
    if (!res.destroyed) res.end();
  }
  sseSessions.clear();

  if (mcpServer) {
    await new Promise<void>((resolve) => {
      mcpServer!.close(() => resolve());
    });
    mcpServer = null;
  }

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
    listenAddress: mcpListenAddress,
    needsAuth: !!mcpAuthPassword,
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
