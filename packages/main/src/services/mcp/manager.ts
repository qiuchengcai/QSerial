/**
 * MCP (Model Context Protocol) 服务器管理器
 * 内建 HTTP MCP Server，支持 SSE 和 streamableHttp 两种传输方式
 */

import * as http from 'node:http';
import * as crypto from 'node:crypto';
// McpServer used via SSEServerTransport
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BrowserWindow } from 'electron';
import type { ConnectionOptions, ConnectionServerOptions } from '@qserial/shared';
import { ConnectionFactory } from '../connection/factory.js';
import { ConnectionServerConnection } from '../connection/connectionServer.js';
import { SerialConnection } from '../connection/serial.js';
import { xmodemSend } from './xmodem.js';
import { formatOk, formatError, extractPrompt, stripEcho, stripPrompt, historyLog, appendHistory, parseAtResponse } from './ai-helpers.js';
import { MCP_RESOURCES, readResource, setResourcesWindow } from './resources.js';
import { sseClients, sendMCPNotification } from './notifications.js';
import { drainSampling, resolveSampling, requestSampling } from './sampling.js';
import { MCP_PROMPTS, getPrompt } from './prompts.js';
import { loadPlugins, getPluginResources, readPluginResource, getPluginPrompts, getPluginPrompt } from './plugin-loader.js';
import {
  IPC_CHANNELS,
  ConnectionState,
  ConnectionType,
  bufferToBase64,
} from '@qserial/shared';

let mainWindow: BrowserWindow | null = null;
let mcpServer: http.Server | null = null;
let mcpRunning = false;
let mcpPort = 9800;
let mcpListenAddress = '127.0.0.1';
let mcpAuthPassword = '';
let mcpCorsOrigins: string[] = [];

// 共享桥接池：shareId → { sourceId, serverId }
const sharePool = new Map<string, { sourceId: string; serverId: string }>();
const watches = new Map<string, () => void>();

// 简易令牌桶限流：每秒最多 30 个请求，突发最多 50
// Rate limiting removed (handled by McpServer)


// SSE 会话：sessionId → response
// sseSessions removed (SDK migration)

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

// 截图自动保存目录
const SCREENSHOT_DIR = path.resolve(process.cwd?.() || __dirname, '../../docs');

// ==================== 工具定义 ====================

const MCP_TOOLS = [
  {
    name: 'conn.list',
    description: '列出所有活跃连接，或传 id 获取指定连接详细信息（含完整连接参数）。无参数时返回摘要列表，传 id 时返回详情。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID（可选，传此参数返回该连接详情）' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'conn.data.write',
    description: '向指定连接发送数据或命令。支持发送前延迟和条件等待。注意：终端命令末尾需包含 \\n 换行符。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        data: { type: 'string', description: '要发送的文本，如 "ls -la\\n"' },
        delay_ms: { type: 'integer', description: '发送前等待毫秒数，默认 0' },
        wait_before: { type: 'string', description: '发送前等待输出中出现此文本（子串匹配），超时 10s' },
        response_timeout_ms: { type: 'integer', description: '等待回显最大毫秒数，默认 2000。有新数据立即返回，不等到超时。慢速嵌入式设备建议 3000-5000' },
      },
      required: ['data'],
    },
  },
  {
    name: 'conn.data.write_hex',
    description: '向指定连接发送十六进制数据。输入为不带分隔符的十六进制字符串，如 "7E01FFAABB"。适用于嵌入式设备的二进制协议（Modbus、自定义帧等）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        hex: { type: 'string', description: '十六进制字符串，如 "7E01FFAABB"' },
      },
      required: ['hex'],
    },
  },
  {
    name: 'conn.data.read',
    description: '读取连接输出。默认读后清空缓冲区（consume=true）。设置 consume=false 可预览不清空（配合 max_bytes 限制返回长度）。设置 consume=true 且 max_bytes=0 可仅清空不返回数据。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        consume: { type: 'boolean', description: '是否消费（清空）缓冲区，默认 true', default: true },
        max_bytes: { type: 'integer', description: '最多返回字节数，默认 4096（仅 consume=false 时生效）', default: 4096 },
      },
    },
  },
  {
    name: 'conn.data.clear',
    description: '清空指定连接的输出缓冲区，释放内存。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'conn.data.expect',
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
    name: 'conn.create',
    description: '创建并连接新设备。type=serial 需提供 path/baudRate；type=ssh 需提供 host/username/password；type=telnet 需提供 host/port；type=pty 可无额外参数。如需关联已保存的会话配置（让 GUI 按钮变绿），传入从 session_list 获取的 id 作为 savedSessionId。',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '连接类型：serial, ssh, telnet, pty' },
        name: { type: 'string', description: '连接名称（可选）' },
        savedSessionId: { type: 'string', description: '从 session_list 获取的已保存会话 id（可选，用于关联 GUI 状态）' },
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
    name: 'conn.disconnect',
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
    name: 'conn.reconnect',
    description: '重新连接已断开的连接，保持相同的连接 ID。不会销毁连接对象。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'conn.update',
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
    name: 'conn.analyze.state',
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
    name: 'conn.script.login',
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
        no_password: { type: 'boolean', description: '设为 true 跳过密码步骤（适用于无密码直接进 shell 的设备）', default: false },
      },
      required: ['username'],
    },
  },
  {
    name: 'device.ports',
    description: '列出系统中所有可用的串口设备（路径、厂商、产品ID等）。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'session.list',
    description: '列出 QSerial 中已保存的所有会话配置（串口、SSH、Telnet 等），包含完整连接参数。可直接用 connection_create 连接这些会话。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'session.save',
    description: '保存会话配置。提供 sessionId 则更新已有会话，否则新建。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '已有会话 ID（可选，提供则更新，不提供则新建）' },
        name: { type: 'string', description: '会话名称' },
        type: { type: 'string', description: '连接类型: serial, ssh, telnet, pty' },
        serialConfig: { type: 'object', description: '[serial] 串口配置 { path, baudRate, dataBits, stopBits, parity }' },
        sshConfig: { type: 'object', description: '[ssh] SSH 配置 { host, port, username, password? }' },
        telnetConfig: { type: 'object', description: '[telnet] Telnet 配置 { host, port }' },
        ptyConfig: { type: 'object', description: '[pty] PTY 配置 { shell }' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'session.delete',
    description: '删除已保存的会话配置。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '要删除的会话 ID' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'conn.hw.dtr_rts',
    description: '控制串口 DTR 和 RTS 信号线状态。仅对串口连接有效。常用于 MCU（ESP32/Arduino/STM32）自动复位进入烧录模式。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        dtr: { type: 'boolean', description: 'DTR 信号状态（可选，不传则不改变）' },
        rts: { type: 'boolean', description: 'RTS 信号状态（可选，不传则不改变）' },
      },
    },
  },
  {
    name: 'conn.hw.break',
    description: '发送串口 break 信号。发送期间其他通信暂停。仅对串口连接有效。常用于中断 U-Boot 自动启动进入命令行。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        duration_ms: { type: 'integer', description: 'Break 信号持续时间（毫秒），默认 200，范围 10-5000', default: 200 },
      },
    },
  },
  {
    name: 'conn.share',
    description: '管理连接共享服务。action=start 启动 TCP Telnet 共享；action=stop 停止共享；action=list 列出所有活跃共享。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作: "start" / "stop" / "list"' },
        connection_id: { type: 'string', description: '[start] 源连接 ID' },
        local_port: { type: 'integer', description: '[start] TCP 监听端口' },
        listen_address: { type: 'string', description: '[start] 监听地址，默认 0.0.0.0' },
        password: { type: 'string', description: '[start] 访问密码' },
        share_id: { type: 'string', description: '[stop] 共享 ID' },
      },
      required: ['action'],
    },
  },
  {
    name: 'conn.file.send',
    description: '通过 XMODEM 或 YMODEM 协议发送文件到串口设备。仅支持串口连接。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        localPath: { type: 'string', description: '本地文件路径' },
        protocol: { type: 'string', description: '协议: "xmodem" 或 "ymodem"', enum: ['xmodem', 'ymodem'] },
        timeout: { type: 'integer', description: '每块传输超时秒数，默认 10', default: 10 },
      },
      required: ['localPath', 'protocol'],
    },
  },
  {
    name: 'app.screenshot',
    description: '抓取当前软件窗口。mode=html(默认,快速) 返回body DOM，compact=true去掉Vite样式减体积，false保留完整CSS；mode=image 返回SVG+JPEG，quality/scale可调。截图与DOM尺寸获取并行加速。',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', description: '模式: "html"(默认,返回DOM) 或 "image"(返回SVG截图)', default: 'html' },
        compact: { type: 'boolean', description: '[html] 去掉Vite HMR style块，默认true。false保留完整CSS', default: true },
        scope: { type: 'string', description: '[image] 截图范围: "body"(默认,仅内容) 或 "full"(含标题栏)', default: 'body' },
        quality: { type: 'integer', description: '[image] JPEG质量 10-100，默认60', default: 60 },
        scale: { type: 'number', description: '[image] 缩放比例 0.1-1.0，默认0.5', default: 0.5 },
      },
    },
  },
  {
    name: "conn.data.send",
    description: "Send command and wait for response, returning clean output. Auto-appends newline, strips echo and prompt.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Connection ID" },
        connectionId: { type: "string", description: "Connection ID (alias)" },
        command: { type: "string", description: "Command to execute (auto-appends \n)" },
        timeout_ms: { type: "integer", description: "Response timeout ms, default 5000", default: 5000 },
        expect_pattern: { type: "string", description: "Custom end pattern (default: auto-detect prompt)" },
        expect_regex: { type: "boolean", description: "Use regex for expect_pattern", default: false },
        strip_echo: { type: "boolean", description: "Strip command echo from output, default true", default: true },
        strip_prompt: { type: "boolean", description: "Strip trailing prompt from output, default true", default: true },
      },
      required: ["command"],
    },
  },
  {
    name: "conn.data.history",
    description: "Get recent send/receive history for a connection.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Connection ID" },
        connectionId: { type: "string", description: "Connection ID (alias)" },
        max_entries: { type: "integer", description: "Max entries to return, default 20", default: 20 },
      },
    },
  },
  {
    name: "conn.script.run",
    description: "Execute a sequence of {send, expect} steps.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Connection ID" },
        connectionId: { type: "string", description: "Connection ID (alias)" },
        steps: { type: "array", description: "Array of {send, expect?, timeout_ms?, delay_ms?, description?}" },
        stop_on_error: { type: "boolean", description: "Stop on first error, default true", default: true },
      },
      required: ["steps"],
    },
  },
  {
    name: 'conn.analyze.probe',
    description: 'Auto-detect device type by sending probe commands and analyzing response patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Connection ID' },
        connectionId: { type: 'string', description: 'Connection ID (alias)' },
        timeout_ms: { type: 'integer', description: 'Per-probe timeout ms, default 3000', default: 3000 },
      },
    },
  },
  {
    name: 'conn.watch.start',
    description: 'Monitor a connection for patterns and send notifications on match.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Connection ID' },
        connectionId: { type: 'string', description: 'Connection ID (alias)' },
        rules: { type: 'array', description: 'Array of {pattern, regex?, level?}' },
        duration_ms: { type: 'integer', description: 'Watch duration ms (0=indefinite), default 60000', default: 60000 },
      },
      required: ['rules'],
    },
  },
  {
    name: 'conn.watch.stop',
    description: 'Stop a running watch by watch_id.',
    inputSchema: {
      type: 'object',
      properties: {
        watch_id: { type: 'string', description: 'Watch ID from connection_watch' },
      },
      required: ['watch_id'],
    },
  },
  {
    name: 'conn.analyze.report',
    description: 'Generate structured session summary: duration, commands, bytes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Connection ID' },
        connectionId: { type: 'string', description: 'Connection ID (alias)' },
      },
    },  },
  {
    name: 'app.macro.list',
    description: 'List all saved terminal macros (recorded by user). Returns name, id, step count, creation time.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'app.macro.run',
    description: 'Execute a saved terminal macro by name on the given connection. Replays recorded keystrokes with original timing.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Connection ID' },
        connectionId: { type: 'string', description: 'Connection ID (alias)' },
        name: { type: 'string', description: 'Macro name to execute (exact match)' },
      },
      required: ['name'],
    },
  },
];

// ==================== 窗口引用 ====================

export function setMcpMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
  setResourcesWindow(window);
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

// sendSse removed (SDK migration)


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

// createMcpServer removed (SDK migration - HTTP server built inline in startMcpServer)


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

async function waitForAnyPattern(
  id: string,
  patterns: { pattern: string; isRegex: boolean }[],
  timeout: number,
): Promise<{ matched: boolean; index: number; output: string }> {
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
        for (let i = 0; i < patterns.length; i++) {
          if (matchPattern(allOutput, patterns[i].pattern, patterns[i].isRegex)) {
            cleanup();
            return { matched: true, index: i, output: allOutput };
          }
        }
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await Promise.race([
        new Promise<void>(r => { wakeup = r; }),
        sleep(Math.min(remaining, 200)),
      ]);
    }
    cleanup();
    return { matched: false, index: -1, output: allOutput };
  } catch {
    cleanup();
    return { matched: false, index: -1, output: allOutput };
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

// handleRpc removed (SDK migration)


// ==================== 工具执行 ====================

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'device.ports': {
        const ports = await SerialConnection.listPorts();
        return JSON.stringify(ports, null, 2);
      }

      case 'session.list': {
        if (!mainWindow || mainWindow.isDestroyed()) {
          return '错误: 主窗口未就绪';
        }
        try {
          const sessions = await mainWindow.webContents.executeJavaScript(
            `(function() {
              try {
                var raw = localStorage.getItem('qserial_saved_sessions');
                if (!raw) return [];
                var data = JSON.parse(raw);
                var sessions = data.state ? data.state.sessions : (data.sessions || []);
                return (sessions || []).map(function(s) {
                  var ss = {
                    id: s.id, name: s.name, type: s.type,
                    serialConfig: s.serialConfig || null,
                    telnetConfig: s.telnetConfig || null,
                    ptyConfig: s.ptyConfig || null,
                    lastUsedAt: s.lastUsedAt
                  };
                  if (s.sshConfig) {
                    ss.sshConfig = { host: s.sshConfig.host, port: s.sshConfig.port, username: s.sshConfig.username };
                  } else {
                    ss.sshConfig = null;
                  }
                  return ss;
                });
              } catch(e) { return '解析失败: ' + e.message; }
            })()`
          );
          if (typeof sessions === 'string') return sessions;
          if (!Array.isArray(sessions) || sessions.length === 0) {
            return '(没有已保存的会话)';
          }
          return JSON.stringify(sessions, null, 2);
        } catch (err) {
          return '错误: 读取会话失败 — ' + (err as Error).message;
        }
      }

      case 'session.save': {
        if (!mainWindow || mainWindow.isDestroyed()) {
          return '错误: 主窗口未就绪';
        }
        const sessionId = args.sessionId as string | undefined;
        const name = args.name as string;
        const connId = (args.id || args.connectionId) as string | undefined;
        let type = args.type as string | undefined;
        // Auto-detect type from connection ID if provided
        if (connId && !type) {
          const conn = ConnectionFactory.get(connId);
          if (conn) { type = conn.type; }
        }
        if (!name) return '错误: 未提供 name 参数';
        if (!type) return '错误: 未提供 type 参数';
        if (!['serial', 'ssh', 'telnet', 'pty'].includes(type)) {
          return `错误: 不支持的会话类型 "${type}"`;
        }
        try {
          const sessionData = JSON.stringify({
            sessionId: sessionId || null,
            name,
            type,
            serialConfig: args.serialConfig || null,
            sshConfig: args.sshConfig || null,
            telnetConfig: args.telnetConfig || null,
            ptyConfig: args.ptyConfig || null,
          });
          const result = await mainWindow.webContents.executeJavaScript(`
            (function() {
              try {
                var raw = localStorage.getItem('qserial_saved_sessions');
                var data = raw ? JSON.parse(raw) : { state: { sessions: [] } };
                var sessions = data.state ? data.state.sessions : [];
                var input = ${sessionData};
                var now = new Date().toISOString();
                if (input.sessionId) {
                  var idx = sessions.findIndex(function(s) { return s.id === input.sessionId; });
                  if (idx < 0) return JSON.stringify({ error: '\\u4f1a\\u8bdd\\u4e0d\\u5b58\\u5728: ' + input.sessionId });
                  sessions[idx] = {
                    ...sessions[idx],
                    name: input.name,
                    type: input.type,
                    serialConfig: input.serialConfig || sessions[idx].serialConfig || undefined,
                    sshConfig: input.sshConfig || sessions[idx].sshConfig || undefined,
                    telnetConfig: input.telnetConfig || sessions[idx].telnetConfig || undefined,
                    ptyConfig: input.ptyConfig || sessions[idx].ptyConfig || undefined,
                    lastUsedAt: now,
                  };
                  var resultId = input.sessionId;
                } else {
                  var newSession = {
                    id: crypto.randomUUID(),
                    name: input.name,
                    type: input.type,
                    createdAt: now,
                    lastUsedAt: now,
                    serialConfig: input.serialConfig || undefined,
                    sshConfig: input.sshConfig || undefined,
                    telnetConfig: input.telnetConfig || undefined,
                    ptyConfig: input.ptyConfig || undefined,
                  };
                  sessions.push(newSession);
                  var resultId = newSession.id;
                }
                data.state.sessions = sessions;
                localStorage.setItem('qserial_saved_sessions', JSON.stringify(data));
                return JSON.stringify({ id: resultId });
              } catch(e) { return JSON.stringify({ error: e.message }); }
            })()
          `);
          const parsed = JSON.parse(result);
          if (parsed.error) return '错误: ' + parsed.error;
          sendMCPNotification('session/saved', { id: parsed.id, name });
          return JSON.stringify({ id: parsed.id, message: '会话已保存' }, null, 2);
        } catch (err) {
          return '错误: 保存会话失败 — ' + (err as Error).message;
        }
      }

      case 'session.delete': {
        if (!mainWindow || mainWindow.isDestroyed()) {
          return '错误: 主窗口未就绪';
        }
        const sessionId = args.sessionId as string;
        if (!sessionId) return '错误: 未提供 sessionId 参数';
        try {
          const result = await mainWindow.webContents.executeJavaScript(`
            (function() {
              try {
                var raw = localStorage.getItem('qserial_saved_sessions');
                if (!raw) return JSON.stringify({ error: '\\u6ca1\\u6709\\u5df2\\u4fdd\\u5b58\\u7684\\u4f1a\\u8bdd' });
                var data = JSON.parse(raw);
                var sessions = data.state ? data.state.sessions : [];
                var before = sessions.length;
                sessions = sessions.filter(function(s) { return s.id !== '${sessionId.replace(/'/g, "\\'")}'; });
                if (sessions.length === before) return JSON.stringify({ error: '\\u4f1a\\u8bdd\\u4e0d\\u5b58\\u5728' });
                data.state.sessions = sessions;
                localStorage.setItem('qserial_saved_sessions', JSON.stringify(data));
                return JSON.stringify({ success: true });
              } catch(e) { return JSON.stringify({ error: e.message }); }
            })()
          `);
          const parsed = JSON.parse(result);
          if (parsed.error) return '错误: ' + parsed.error;
          sendMCPNotification('session/deleted', { id: sessionId });
          return `会话 ${sessionId} 已删除`;
        } catch (err) {
          return '错误: 删除会话失败 — ' + (err as Error).message;
        }
      }

      case 'conn.list': {
        const id = resolveId(args);
        if (id) {
          // 传 id → 返回单个连接详情
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
        // 无参 → 返回摘要列表
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

      case 'conn.data.write': {
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
        const responseTimeout = (args.response_timeout_ms as number) || 2000;
        await waitForData(id, responseTimeout);
        const output = consumeBuffer(id).toString('utf-8');
        const meta = `sent=${data.length}B, replied=${output.length}B, ts=${Date.now()}`;
        return output
          ? `${output}\n\n[${meta}]`
          : `已发送 (${data.length} 字符)，无立即回显 [${meta}]`;
      }

      case 'conn.data.write_hex': {
        const id = resolveId(args);
        const hex = args.hex as string;
        if (!id) return '错误: 未提供连接 id';
        if (!hex) return '错误: 未提供 hex 参数';
        if (!/^[0-9A-Fa-f]*$/.test(hex)) return '错误: hex 参数包含非法字符（仅允许 0-9, A-F, a-f）';
        if (hex.length % 2 !== 0) return '错误: hex 字符串长度必须为偶数';
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        if (conn.state !== ConnectionState.CONNECTED) {
          return `错误: 连接 ${id} 未就绪（当前状态：${conn.state}）`;
        }
        ensureBuffer(id);
        conn.writeHex(hex);
        await waitForData(id, 2000);
        const output = consumeBuffer(id).toString('utf-8');
        const meta = `sent=${hex.length / 2}B hex, replied=${output.length}B, ts=${Date.now()}`;
        return output
          ? `${output}\n\n[${meta}]`
          : `已发送 (${hex.length / 2} 字节)，无立即回显 [${meta}]`;
      }

      case 'conn.data.read': {
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
        if (!ConnectionFactory.get(id)) return `错误: 找不到连接 ${id}`;
        ensureBuffer(id);

        const consume = args.consume !== false; // 默认 true
        const maxBytes = (args.max_bytes as number) || 4096;
        const totalBefore = bufferSize(id);

        if (consume) {
          // consume=true: 读后清空（原 read 行为）；max_bytes=0 → 仅清空
          if (maxBytes === 0) {
            clearBuffer(id);
            const meta = `cleared, total_before=${totalBefore}, ts=${Date.now()}`;
            return `(已清空 ${totalBefore}B) [${meta}]`;
          }
          const output = consumeBuffer(id).toString('utf-8');
          const meta = `bytes=${output.length}, total_before_read=${totalBefore}, ts=${Date.now()}`;
          return output
            ? `${output}\n[${meta}]`
            : `(无新输出) [${meta}]`;
        } else {
          // consume=false: 预览不清空（原 peek 行为）
          const output = peekBuffer(id, maxBytes).toString('utf-8');
          const meta = `shown=${output.length}, buffer_total=${totalBefore}, ts=${Date.now()}`;
          return output
            ? `${output}\n[${meta}]`
            : `(缓冲区为空) [${meta}]`;
        }
      }

      case 'conn.data.expect': {
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

      case 'conn.create': {
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
          if (args.privateKey) options.privateKey = args.privateKey as string;
          if (args.passphrase) options.passphrase = args.passphrase as string;
          if (args.jumpHost) options.jumpHost = args.jumpHost as { host: string; port?: number; username: string; password?: string; privateKey?: string };
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
          sendMCPNotification('connection/connected', { id, type: ctype, name });

          // 设置数据转发到渲染进程（MCP 连接缺少 IPC 管线的 onData 注册）
          conn.onData((data: Buffer) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(IPC_CHANNELS.CONNECTION_DATA, {
                id,
                data: bufferToBase64(data),
              });
            }
          });
          conn.onStateChange((state: ConnectionState) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(IPC_CHANNELS.CONNECTION_STATE, { id, state });
            }
          });
          conn.onError((error: Error) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(IPC_CHANNELS.CONNECTION_ERROR, { id, error: error.message });
            }
          });

          // 通知渲染进程自动创建标签页
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.MCP_CONNECTION_CREATED, {
              connectionId: id,
              type: ctype,
              name,
              path: (args.path as string) || undefined,
              host: (args.host as string) || undefined,
              savedSessionId: (args.savedSessionId as string) || undefined,
            });
          }
          return JSON.stringify({ id, type: ctype, state: conn.state, message: '连接已创建并就绪' }, null, 2);
        } catch (err) {
          return `错误: 创建连接失败 — ${(err as Error).message}`;
        }
      }

      case 'conn.disconnect': {
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        try {
          await ConnectionFactory.destroy(id);
          removeBuffer(id);
        sendMCPNotification('connection/disconnected', { id, reason: 'user_requested' });
          return `连接 ${id} 已断开并销毁`;
        } catch (err) {
          return `错误: 断开连接失败 — ${(err as Error).message}`;
        }
      }

      case 'conn.reconnect': {
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        try {
          if (conn.state === ConnectionState.CONNECTED || conn.state === ConnectionState.CONNECTING) {
            await conn.close();
          }
        } catch (err) {
          return `错误: 关闭连接失败 — ${(err as Error).message}`;
        }
        try {
          await conn.open();
          ensureBuffer(id);
          sendMCPNotification('connection/connected', { id });
          return `连接 ${id} 已重新连接`;
        } catch (err) {
          return `错误: 重连失败 — ${(err as Error).message}`;
        }
      }

      case 'conn.update': {
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

      case 'conn.hw.dtr_rts': {
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        if (conn.type !== ConnectionType.SERIAL) {
          return '错误: 仅串口连接支持 DTR/RTS 控制';
        }
        if (conn.state !== ConnectionState.CONNECTED) {
          return `错误: 连接 ${id} 未就绪（当前状态：${conn.state}）`;
        }
        const opts: { dtr?: boolean; rts?: boolean } = {};
        if (args.dtr !== undefined) opts.dtr = args.dtr === true;
        if (args.rts !== undefined) opts.rts = args.rts === true;
        if (Object.keys(opts).length === 0) return '错误: 请至少提供 dtr 或 rts 参数';
        try {
          conn.set(opts);
          const parts: string[] = [];
          if (args.dtr !== undefined) parts.push(`DTR=${opts.dtr ? '高' : '低'}`);
          if (args.rts !== undefined) parts.push(`RTS=${opts.rts ? '高' : '低'}`);
          return `串口信号已设置: ${parts.join(', ')}`;
        } catch (err) {
          return `错误: 设置串口信号失败 — ${(err as Error).message}`;
        }
      }

      case 'conn.hw.break': {
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        if (conn.type !== ConnectionType.SERIAL) {
          return '错误: 仅串口连接支持 break 信号';
        }
        if (conn.state !== ConnectionState.CONNECTED) {
          return `错误: 连接 ${id} 未就绪（当前状态：${conn.state}）`;
        }
        const durationMs = (args.duration_ms as number) || 200;
        if (durationMs < 10 || durationMs > 5000) {
          return '错误: duration_ms 应在 10-5000 范围内';
        }
        try {
          conn.set({ brk: true });
          await sleep(durationMs);
          conn.set({ brk: false });
          return `Break 信号已发送 (${durationMs}ms)`;
        } catch (err) {
          return `错误: 发送 break 信号失败 — ${(err as Error).message}`;
        }
      }

      case 'conn.file.send': {
        const id = resolveId(args);
        const localPath = args.localPath as string;
        const protocol = (args.protocol as string) || 'xmodem';
        if (!id) return '错误: 未提供连接 id';
        if (!localPath) return '错误: 未提供 localPath 参数';
        if (!['xmodem', 'ymodem'].includes(protocol)) {
          return '错误: protocol 必须是 "xmodem" 或 "ymodem"';
        }
        const conn = ConnectionFactory.get(id);
        if (!conn) return `错误: 找不到连接 ${id}`;
        if (conn.state !== ConnectionState.CONNECTED) {
          return `错误: 连接 ${id} 未就绪（当前状态：${conn.state}）`;
        }
        if (conn.type !== ConnectionType.SERIAL) {
          return '错误: 文件传输仅支持串口连接';
        }
        let fileData: Buffer;
        try {
          fileData = fs.readFileSync(localPath);
        } catch (err) {
          return `错误: 读取文件失败 — ${(err as Error).message}`;
        }
        if (fileData.length === 0) return '错误: 文件为空';

        ensureBuffer(id);
        clearBuffer(id);

        const readByte = async (timeoutMs: number): Promise<number> => {
          await waitForData(id, timeoutMs);
          const buf = consumeBuffer(id);
          return buf.length > 0 ? buf[0] : -1;
        };

        try {
          const timeout = (args.timeout as number) || 10;
          await xmodemSend(
            (data) => conn.write(data),
            readByte,
            fileData,
            protocol as 'xmodem' | 'ymodem',
            { timeout },
          );
          const meta = `file=${localPath}, size=${fileData.length}B, protocol=${protocol}, ts=${Date.now()}`;
          return `文件已发送: ${localPath} (${fileData.length} 字节, ${protocol})\n[${meta}]`;
        } catch (err) {
          return `错误: 文件传输失败 — ${(err as Error).message}`;
        }
      }

      case 'conn.analyze.state': {
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

      case 'conn.data.clear': {
        const id = resolveId(args);
        if (!id) return '错误: 未提供连接 id';
        if (!ConnectionFactory.get(id)) return `错误: 找不到连接 ${id}`;
        const before = bufferSize(id);
        clearBuffer(id);
        return `缓冲区已清空 (释放 ${before} 字节)`;
      }

      case 'conn.script.login': {
        const id = resolveId(args);
        const username = args.username as string;
        const password = (args.password as string) || '';
        if (!id) return '错误: 未提供连接 id';
        if (!username) return '错误: 未提供 username 参数';

        const loginPrompt = (args.loginPrompt as string) || 'login[:\\s]|username[:\\s]';
        const passwordPrompt = (args.passwordPrompt as string) || '[Pp]assword[:\\s]';
        const shellPrompt = (args.shellPrompt as string) || '[#$>]\\s';
        const timeout = (args.timeout as number) || 30;
        const debug = args.debug !== false;
        const noPassword = args.no_password === true;
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
          try {
            const lctx = loginResult.output.slice(-500);
            const lchoice = await requestSampling(
              'Login prompt not matched on device',
              'Device output: ' + lctx + ' | Pattern: ' + loginPrompt,
              ['retry', 'send_anyway', 'abort'], 15000
            );
            if (lchoice === 'retry') return formatError('SAMPLING_RETRY', 'AI suggests retry. Output: ' + lctx);
            if (lchoice === 'abort') return formatError('SAMPLING_ABORT', 'AI aborted login');
          } catch { /* sampling timeout */ }
          if (debug) {
            return [
              ...steps,
              `[失败] 超时未匹配登录提示`,
              `当前输出 (500B): ${loginResult.output.slice(-500)}`,
              `提示: 尝试先用 connection_read (consume=false) 查看终端内容，确认提示符格式`,
            ].join('\n');
          }
          return `错误: 超时未检测到登录提示 "${loginPrompt}"。当前内容:\n${loginResult.output.slice(-500)}`;
        }
        addStep(`[2/5] 检测到登录提示，发送用户名 "${username}" (输出 ${loginResult.output.length}B)`);

        // 步骤 2: 发送用户名
        conn.write(Buffer.from(username + '\n', 'utf-8'));
        await sleep(300);
        clearBuffer(id);

        // 步骤 3: 显式跳过密码（no_password=true）
        if (noPassword) {
          addStep(`[3/4] 跳过密码（no_password=true），等待 Shell 提示符 (regex: "${shellPrompt}", timeout=${timeout}s)...`);
          const shellResult = await waitPattern(id, shellPrompt, timeout, true);
          const output = consumeBuffer(id).toString('utf-8');
          if (shellResult.matched) {
            const state = analyzeState(output, conn.state);
            addStep(`[完成] 登录成功（无密码），Shell 类型: ${state.shell_type || 'detected'}`);
            return steps.join('\n') + `\n\n登录成功。\n${output.slice(-300)}`;
          }
          addStep(`[完成] 凭据已发送（Shell 提示未检测到，可能已登录）`);
          return steps.join('\n') + `\n\n${output.slice(-500)}`;
        }

        // 步骤 3: 等待密码提示 OR Shell 提示（自动检测无密码设备）
        addStep(`[3/5] 等待密码提示或 Shell 提示 (regex: "${passwordPrompt}" / "${shellPrompt}", timeout=${timeout}s)...`);
        const postUserResult = await waitForAnyPattern(id, [
          { pattern: passwordPrompt, isRegex: true },
          { pattern: shellPrompt, isRegex: true },
        ], timeout);

        // 自动检测：Shell 提示先于密码提示 → 无密码设备
        if (postUserResult.matched && postUserResult.index === 1) {
          const remaining = consumeBuffer(id).toString('utf-8');
          const output = postUserResult.output + remaining;
          const state = analyzeState(output, conn.state);
          addStep(`[跳过] 设备直接进入 Shell，未出现密码提示（无密码设备），输出 ${output.length}B`);
          addStep(`[完成] 登录成功（无密码设备），Shell 类型: ${state.shell_type || 'detected'}`);
          return steps.join('\n') + `\n\n登录成功（检测到无密码设备）。\n${output.slice(-300)}`;
        }

        if (!postUserResult.matched) {
          if (debug) {
            return [
              ...steps,
              `[失败] 超时未匹配密码提示或 Shell 提示`,
              `用户名已发送，但未检测到密码提示或 Shell 提示`,
              `当前输出 (500B): ${postUserResult.output.slice(-500)}`,
              `提示: 检查用户名是否正确；或使用 no_password=true 跳过密码步骤；或使用 connection_read (consume=false) 查看终端`,
            ].join('\n');
          }
          return `错误: 超时未检测到密码提示或 Shell 提示。当前内容:\n${postUserResult.output.slice(-500)}`;
        }

        // 检测到密码提示，继续正常流程
        addStep(`[4/5] 检测到密码提示，发送密码 (输出 ${postUserResult.output.length}B)`);

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

      case 'conn.share': {
        const action = args.action as string;
        if (!action || !['start', 'stop', 'list'].includes(action)) {
          return '错误: 请提供 action 参数: "start" / "stop" / "list"';
        }

        if (action === 'start') {
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
          const listenAddress = (args.listen_address as string) || '0.0.0.0';
          const password = (args.password as string) || mcpAuthPassword || undefined;

          const options: ConnectionServerOptions = {
            id: serverId,
            name: `Share-${sourceId.slice(0, 8)}`,
            type: ConnectionType.CONNECTION_SERVER,
            sourceType: 'existing',
            existingConnectionId: sourceId,
            localPort,
            listenAddress,
            accessPassword: password,
          };

          try {
            const serverConn = await ConnectionFactory.create(options);
            await serverConn.open();
            sharePool.set(serverId, { sourceId, serverId });
            sendMCPNotification('share/started', { share_id: serverId, source_id: sourceId, local_port: localPort });

            // 通知渲染进程共享已启动
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(IPC_CHANNELS.MCP_SHARE_CHANGED, {
                shareId: serverId,
                running: true,
                sourceId,
                localPort,
                listenAddress,
              });
            }

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
            }, null, 2);
          } catch (err) {
            return `错误: 启动共享失败 — ${(err as Error).message}`;
          }
        }

        if (action === 'stop') {
          const shareId = args.share_id as string;
          if (!shareId) return '错误: 未提供 share_id';

          if (!sharePool.has(shareId)) return `错误: 找不到共享 ${shareId}`;

          try {
            await ConnectionFactory.destroy(shareId);
            sharePool.delete(shareId);
            removeBuffer(shareId);
            sendMCPNotification('share/stopped', { share_id: shareId });

            // 通知渲染进程共享已停止
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(IPC_CHANNELS.MCP_SHARE_CHANGED, {
                shareId,
                running: false,
              });
            }

            return `共享 ${shareId} 已停止`;
          } catch (err) {
            return `错误: 停止共享失败 — ${(err as Error).message}`;
          }
        }

        if (action === 'list') {
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

        return `错误: 未知 action "${action}"`;
      }

      case 'app.screenshot': {
        if (!mainWindow || mainWindow.isDestroyed()) {
          return '错误: 主窗口未就绪';
        }
        try {
          const mode = (args.mode as string) || 'html';

          // ── html 模式：返回 body.innerHTML (快, 100% 元素完整) ──
          if (mode === 'html') {
            const compact = args.compact !== false; // 默认 true
            const html = await mainWindow.webContents.executeJavaScript(`
              (function() {
                var doc = document.documentElement.cloneNode(true);
                var body = doc.querySelector('body');
                if (!body) return '错误: body 不存在';
                // 去掉 script
                body.querySelectorAll('script').forEach(function(s){ s.remove(); });
                ${compact ? `
                // 只去掉 Vite HMR 注入的巨型 style 块 (data-vite-dev-id)，保留应用样式
                doc.querySelectorAll('style[data-vite-dev-id]').forEach(function(s){ s.remove(); });
                // 清理 Vite 相关属性和 React 的 data-v-* 属性
                body.querySelectorAll('*').forEach(function(el){
                  ['data-vite-dev-id','data-vite-hmr'].forEach(function(a){ el.removeAttribute(a); });
                  var attrs = el.getAttributeNames().filter(function(a){ return a.startsWith('data-v-'); });
                  attrs.forEach(function(a){ el.removeAttribute(a); });
                });
                ` : ''}
                return '<!DOCTYPE html>\\n' + doc.outerHTML;
              })()
            `);
            // 自动保存到 docs 目录
            try {
              fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
              const file = path.join(SCREENSHOT_DIR, `window-snapshot-${Date.now()}.html`);
              fs.writeFileSync(file, html, 'utf-8');
            } catch (_) { /* 保存失败不影响返回 */ }
            return html;
          }

          // ── image 模式：capturePage 截图 → SVG+JPEG ──
          const scale = (args.scale as number) || 0.5;
          const quality = (args.quality as number) || 60;
          const scope = (args.scope as string) || 'body';

          // 并行：截图 + 获取 body 尺寸，减少串行等待
          const [rawImage, bodySizeResult] = await Promise.all([
            mainWindow.webContents.capturePage(),
            scope === 'body'
              ? mainWindow.webContents.executeJavaScript(`
                  (function() {
                    var b = document.body;
                    if (!b) return null;
                    var r = b.getBoundingClientRect();
                    return { w: Math.round(r.width * ${scale}), h: Math.round(r.height * ${scale}) };
                  })()
                `)
              : Promise.resolve(null),
          ]);

          const size = rawImage.getSize();
          const newW = Math.round(size.width * scale);
          const newH = Math.round(size.height * scale);
          const image = rawImage.resize({ width: newW, height: newH });
          const jpg = image.toJPEG(quality).toString('base64');

          const svgWidth = bodySizeResult?.w ?? newW;
          const svgHeight = bodySizeResult?.h ?? newH;

          const svg = [
            `<svg xmlns="http://www.w3.org/2000/svg"`,
            ` width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${newW} ${newH}">`,
            `  <image width="${newW}" height="${newH}"`,
            `    href="data:image/jpeg;base64,${jpg}" />`,
            `</svg>`,
          ].join('\n');

          const ts = Date.now();
          try {
            fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
            const file = path.join(SCREENSHOT_DIR, `screenshot-${ts}.svg`);
            fs.writeFileSync(file, svg, 'utf-8');
          } catch (_) { /* 保存失败不影响返回 */ }
          return svg;
        } catch (err) {
          return `错误: 截图失败 — ${(err as Error).message}`;
        }
      }

      case 'conn.data.send': {
        const id = resolveId(args);
        const command = args.command as string;
        if (!id) return formatError('MISSING_PARAM', 'missing id');
        if (!command) return formatError('MISSING_PARAM', 'missing command');
        const conn = ConnectionFactory.get(id);
        if (!conn) return formatError('CONN_NOT_FOUND', 'connection not found: ' + id);
        if (conn.state !== ConnectionState.CONNECTED) return formatError('CONN_NOT_CONNECTED', 'not connected');
        ensureBuffer(id); clearBuffer(id);

        const timeoutMs = (args.timeout_ms as number) || 5000;
        const cmdForDisplay = command.endsWith('\n') ? command.slice(0, -1) : command;
        conn.write(Buffer.from(cmdForDisplay + '\n', 'utf-8'));
        appendHistory(id, 'send', cmdForDisplay + '\n');
        const t0 = Date.now();

        const patterns = [{ pattern: '[#$>]\\s', isRegex: true }];
        await waitForAnyPattern(id, patterns, Math.ceil(timeoutMs / 1000));
        const rawOutput = consumeBuffer(id).toString('utf-8');
        if (rawOutput) appendHistory(id, 'recv', rawOutput);

        let cleanOutput = rawOutput;
        if (args.strip_echo !== false) cleanOutput = stripEcho(cleanOutput, cmdForDisplay);
        const prompt = extractPrompt(rawOutput);
        if (args.strip_prompt !== false && prompt) cleanOutput = stripPrompt(cleanOutput, prompt);
        const atParsed = parseAtResponse(rawOutput);

        return formatOk({
          command: cmdForDisplay,
          output: cleanOutput,
          raw_output: rawOutput.slice(0, 1000),
          prompt: prompt || undefined,
          duration_ms: Date.now() - t0,
          ...(atParsed.result !== 'unknown' || atParsed.fields.length ? { parsed: { at_result: atParsed.result, at_fields: atParsed.fields } } : {}),
        });
      }

      case 'conn.data.history': {
        const hid = resolveId(args);
        if (!hid) return formatError('MISSING_PARAM', 'missing id');
        const maxEntries = (args.max_entries as number) || 20;
        const log = historyLog.get(hid) || [];
        const entries = log.slice(-maxEntries);
        const totalSend = entries.filter(e => e.dir === 'send').reduce((s, e) => s + e.data.length, 0);
        const totalRecv = entries.filter(e => e.dir === 'recv').reduce((s, e) => s + e.data.length, 0);
        return formatOk({ entries, count: entries.length, total_send_bytes: totalSend, total_recv_bytes: totalRecv });
      }

      case 'conn.script.run': {
        const rsid = resolveId(args);
        if (!rsid) return formatError('MISSING_PARAM', 'missing id');
        const steps = args.steps as Array<Record<string, unknown>> | undefined;
        if (!steps || !Array.isArray(steps) || steps.length === 0) return formatError('MISSING_PARAM', 'missing steps');
        const conn2 = ConnectionFactory.get(rsid);
        if (!conn2) return formatError('CONN_NOT_FOUND', 'connection not found');
        if (conn2.state !== ConnectionState.CONNECTED) return formatError('CONN_NOT_CONNECTED', 'not connected');

        const results: Array<Record<string, unknown>> = [];
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const timeout: number = typeof step.timeout_ms === 'number' ? step.timeout_ms : 5000;
          if (step.delay_ms) await sleep(step.delay_ms as number);
          ensureBuffer(rsid); clearBuffer(rsid);
          const t1 = Date.now();
          const sendStr: string = String(step.send || '');
          const data = sendStr.endsWith('\n') ? sendStr : sendStr + '\n';
          conn2.write(Buffer.from(data, 'utf-8'));
          appendHistory(rsid, 'send', data);
          const pats = [{ pattern: '[#$>]\\s', isRegex: true }];
          await waitForAnyPattern(rsid, pats, Math.ceil(timeout / 1000));
          const output = consumeBuffer(rsid).toString('utf-8');
          if (output) appendHistory(rsid, 'recv', output);
          sendMCPNotification('script/step_completed', { connection_id: rsid, step: i, total: steps.length, ok: true });
          const xp: string = (step.expect as string) || '';
          const isOk = !xp || output.includes(xp);
          if (!isOk && xp) {
            try {
              const schoice = await requestSampling(
                'Script step ' + (i+1) + ' failed: expected "' + xp + '" not found',
                'Command: ' + String(step.send || '') + ' | Output: ' + output.slice(0, 400),
                ['retry', 'skip', 'abort'], 15000
              );
              if (schoice === 'retry') { i--; continue; }
              if (schoice === 'abort') return formatError('SCRIPT_ABORTED', 'AI aborted at step ' + (i+1));
            } catch { /* sampling timeout */ }
            results.push({ step: i, description: (step.description as string) || ('step ' + (i + 1)), ok: false, output: output.slice(0, 2000), duration_ms: Date.now() - t1, error: 'expect not matched' });
            continue;
          }
          results.push({ step: i, description: (step.description as string) || ('step ' + (i + 1)), ok: true, output: output.slice(0, 2000), duration_ms: Date.now() - t1 });
        }
        return formatOk({ completed: results.length, total: steps.length, success: true, results });
      }


      case 'conn.analyze.probe': {
        const probeId = resolveId(args);
        if (!probeId) return formatError('MISSING_PARAM', 'missing id');
        const probeConn = ConnectionFactory.get(probeId);
        if (!probeConn) return formatError('CONN_NOT_FOUND', 'connection not found');
        if (probeConn.state !== ConnectionState.CONNECTED) return formatError('CONN_NOT_CONNECTED', 'not connected');
        const knownDevices = [
          { name: 'ESP32/ESP8266', patterns: ['ESP32', 'ESP8266', 'AT version', 'ready'], baud_hint: 115200 },
          { name: 'STM32', patterns: ['STM32', 'STMicroelectronics', 'U-Boot SPL'], baud_hint: 115200 },
          { name: 'Raspberry Pi', patterns: ['Raspberry Pi', 'raspberrypi', 'Debian', 'Raspbian'], baud_hint: 115200 },
          { name: 'U-Boot', patterns: ['U-Boot', 'Hit any key', 'Loading from', 'Booting'], baud_hint: 115200 },
          { name: 'Linux', patterns: ['login:', 'Password:', 'Debian', 'Ubuntu', 'CentOS', 'kernel'], baud_hint: 115200 },
          { name: 'Cisco IOS', patterns: ['Cisco IOS', 'Router>', 'Switch>', 'enable'], baud_hint: 9600 },
          { name: 'Arduino', patterns: ['Arduino', 'avrdude'], baud_hint: 9600 },
          { name: 'BusyBox', patterns: ['BusyBox', '/ #', '# '], baud_hint: 115200 },
        ];
        ensureBuffer(probeId); clearBuffer(probeId);
        probeConn.write(Buffer.from('AT\n', 'utf-8'));
        appendHistory(probeId, 'send', 'AT\n');
        await sleep(3000);
        const probeOutput = consumeBuffer(probeId).toString('utf-8');
        if (probeOutput) appendHistory(probeId, 'recv', probeOutput);
        const matches = knownDevices.filter(d => d.patterns.some(p => probeOutput.includes(p)))
          .map(d => ({ device: d.name, confidence: d.patterns.filter(p => probeOutput.includes(p)).length / d.patterns.length, baud_hint: d.baud_hint }));
        matches.sort((a,b) => b.confidence - a.confidence);
        return matches.length > 0 ? formatOk({ best_match: matches[0], all_matches: matches.slice(0, 3) })
          : formatOk({ device: 'unknown', confidence: 0, output_sample: probeOutput.slice(0, 300) });
      }

      case 'conn.watch.start': {
        const watchId = resolveId(args);
        if (!watchId) return formatError('MISSING_PARAM', 'missing id');
        const watchConn = ConnectionFactory.get(watchId);
        if (!watchConn) return formatError('CONN_NOT_FOUND', 'connection not found');
        const rules = (args.rules as any[]) || [];
        if (!Array.isArray(rules) || rules.length === 0) return formatError('MISSING_PARAM', 'missing rules');
        const duration = (args.duration_ms as number) || 60000;
        const wid = 'watch_' + crypto.randomUUID().slice(0, 8);
        const compiled = rules.map((r: any) => ({ pattern: r.pattern as string, isRegex: r.regex !== false, level: (r.level as string) || 'warning' }));
        let stopped = false;
        watches.set(wid, () => { stopped = true; });
        (async () => {
          const tStart = Date.now();
          while (!stopped) {
            if (duration > 0 && Date.now() - tStart > duration) break;
            await sleep(2000);
            if (stopped) break;
            try {
              const data = Buffer.concat(buffers.get(watchId) || []).toString('utf-8');
              for (const r of compiled) {
                if (r.isRegex ? new RegExp(r.pattern, 'i').test(data) : data.includes(r.pattern)) {
                  sendMCPNotification('connection/data_alert', { id: watchId, pattern: r.pattern, level: r.level, watch_id: wid, context: data.slice(-200) });
                }
              }
            } catch { break; }
          }
          watches.delete(wid);
        })().catch(() => {});
        return formatOk({ watch_id: wid, rules_count: compiled.length, duration_ms: duration });
      }

      case 'conn.watch.stop': {
        const wid = args.watch_id as string;
        if (!wid) return formatError('MISSING_PARAM', 'missing watch_id');
        const stopFn = watches.get(wid);
        if (stopFn) { stopFn(); return formatOk({ stopped: wid }); }
        return formatError('NOT_FOUND', 'watch not found: ' + wid);
      }

      case 'conn.analyze.report': {
        const sumId = resolveId(args);
        if (!sumId) return formatError('MISSING_PARAM', 'missing id');
        const log = historyLog.get(sumId) || [];
        const sendEntries = log.filter(e => e.dir === 'send');
        const recvEntries = log.filter(e => e.dir === 'recv');
        const totalSend = sendEntries.reduce((s, e) => s + e.data.length, 0);
        const totalRecv = recvEntries.reduce((s, e) => s + e.data.length, 0);
        const tFirst = log.length > 0 ? log[0].ts : 0;
        const tLast = log.length > 0 ? log[log.length - 1].ts : 0;
        return formatOk({ connection_id: sumId, duration_ms: tLast - tFirst, total_commands: sendEntries.length, total_bytes_sent: totalSend, total_bytes_received: totalRecv, history_entries: log.length });
      }
      case 'app.macro.list': {
        if (!mainWindow || mainWindow.isDestroyed()) return formatError('INTERNAL', 'No window');
        try {
          const raw = await mainWindow.webContents.executeJavaScript(
            "JSON.parse(localStorage.getItem('qserial-terminal-macros') || '{}')?.state?.savedMacros || []"
          );
          const list = (raw || []).map((m: any) => ({ name: m.name, id: m.id, steps: m.steps?.length || 0, created: new Date(m.createdAt).toISOString() }));
          return formatOk({ macros: list, total: list.length });
        } catch (e: any) { return formatError('INTERNAL', e.message); }
      }
      case 'app.macro.run': {
        const connId = (args.id || args.connectionId) as string | undefined;
        const macroName = args.name as string;
        if (!macroName) return formatError('INVALID_PARAM', 'name is required');
        if (!mainWindow || mainWindow.isDestroyed()) return formatError('INTERNAL', 'No window');
        try {
          const raw = await mainWindow.webContents.executeJavaScript(
            "JSON.parse(localStorage.getItem('qserial-terminal-macros') || '{}')?.state?.savedMacros || []"
          );
          const macro = (raw || []).find((m: any) => m.name === macroName);
          if (!macro) return formatError('NOT_FOUND', 'Macro not found: ' + macroName);
          const conn = connId ? ConnectionFactory.get(connId) : null;
          if (!conn) return formatError('NOT_FOUND', 'Connection not found');
          const results: string[] = [];
          for (const step of macro.steps) {
            if (step.delay > 0) await new Promise(r => setTimeout(r, step.delay));
            await conn.write(step.data);
            results.push(step.data.replace(/\r?\n/g, '\\n'));
          }
          return formatOk({ macro: macroName, steps_executed: results.length, commands: results });
        } catch (e: any) { return formatError('INTERNAL', e.message); }
      }
      default:
        return formatError('UNSUPPORTED', 'unknown tool: ' + name);
    }
  } catch (err) {
    return `错误: ${(err as Error).message}`;
  }
}

// ==================== 公共接口 ====================

export async function startMcpServer(port: number, listenAddress?: string, authPassword?: string, corsOrigins?: string[]): Promise<void> {
  if (mcpRunning) {
    await stopMcpServer();
  }

  mcpAuthPassword = authPassword || '';
  mcpCorsOrigins = corsOrigins || [];
  // Auto-generate password for remote access
  if (!mcpAuthPassword && mcpListenAddress !== '127.0.0.1' && mcpListenAddress !== 'localhost') {
    mcpAuthPassword = crypto.randomBytes(16).toString('hex');
    console.log('[MCP] Auto-generated password:', mcpAuthPassword);
    console.log('[MCP] Use: Authorization: Bearer ' + mcpAuthPassword);
  }
  mcpListenAddress = listenAddress || '127.0.0.1';
  ConnectionFactory.onDestroy((conn) => removeBuffer(conn.id));
  loadPlugins();

  const httpServer = http.createServer(async (req, res) => {
    const corsOrigin = mcpCorsOrigins.length > 0
    ? (mcpCorsOrigins.includes(req.headers.origin || '') ? req.headers.origin || '' : mcpCorsOrigins[0])
    : '*';
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlPath = (req.url || '/').split('?')[0];

    // SSE endpoint
    if (req.method === 'GET' && urlPath === '/sse') {
      const qs = (req.url || '').includes('?') ? (req.url || '').split('?')[1] : '';
      if (mcpAuthPassword) {
        const sseParams = new URLSearchParams(qs);
        const sseToken = sseParams.get('token');
        if (sseToken !== mcpAuthPassword) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'auth failed' }));
          return;
        }
      }
      sseClients.add(res);
      const sseTransport = new SSEServerTransport('/messages', res);
      // SSE transport manages its own session
      req.on('close', () => { sseClients.delete(res); sseTransport.close().catch(() => {}); });
      return;
    }

    // SSE message endpoint (POST to /messages)
    if (req.method === 'POST' && urlPath === '/messages') {
      if (mcpAuthPassword && !checkAuth(req, res)) return;
      // SSE messages are forwarded through the SSE transport session
      let body = "";
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const rpcData = JSON.parse(body);
          const { id: reqId, method, params } = rpcData;
          if (method === "initialize") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { protocolVersion: "2025-03-26", capabilities: { tools: {}, resources: {}, sampling: {}, prompts: {} }, serverInfo: { name: "qserial-mcp", version: "0.1.0" } } }));
            return;
          }
          if (method === "notifications/initialized") { res.writeHead(202); res.end(); return; }
          if (method === "tools/list") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { tools: MCP_TOOLS } }));
            return;
          }
          if (method === "tools/call") {
            try {
              const text = await executeTool(params.name, params.arguments || {});
              res.writeHead(200, { "Content-Type": "application/json" });
              const sDrain = drainSampling(); const resp = { jsonrpc: "2.0", id: reqId, result: { content: [{ type: "text", text }], isError: false } }; if (sDrain) (resp as any).sampling = sDrain; res.end(JSON.stringify(resp));
            } catch (e) {
              const error = e as Error;
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, error: { code: -32603, message: error.message } }));
            }
            return;
          }
                    if (method === "resources/list") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { resources: [...MCP_RESOURCES, ...getPluginResources()] } }));
            return;
          }
          if (method === "resources/read") {
            try {
              const rUri = (params as { uri: string }).uri;
              if (!rUri) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, error: { code: -32602, message: "Missing uri" } })); return; }
              let result = await readResource(rUri);
              if (!result) { const pluginRes = readPluginResource(rUri); if (pluginRes) { result = { contents: [{ uri: rUri, mimeType: pluginRes.mimeType, text: pluginRes.text }] }; } } if (!result) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, error: { code: -32002, message: "Resource not found: " + rUri } })); return; }
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result }));
            } catch (e) { const err = e as Error; res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, error: { code: -32603, message: err.message } })); }
            return;
          }
          if (method === "sampling/response") { const sr = (params as Record<string,string>); if (sr.samplingId && sr.choice) resolveSampling(sr.samplingId, sr.choice); res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { acknowledged: true } })); return; }
          
          if (method === "prompts/list") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { prompts: [...MCP_PROMPTS, ...getPluginPrompts()] } }));
            return;
          }
          if (method === "prompts/get") {
            const { name, arguments: promptArgs } = (params as { name: string; arguments?: Record<string, string> });
            let result = getPrompt(name, promptArgs || {});
            if (!result) { const pluginContent = getPluginPrompt(name); if (pluginContent) { result = { messages: [{ role: "user", content: { type: "text", text: pluginContent } }] }; } } if (!result) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, error: { code: -32002, message: "Prompt not found: " + name } })); return; }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result }));
            return;
          }
          
          if (method === "prompts/list") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { prompts: [...MCP_PROMPTS, ...getPluginPrompts()] } }));
            return;
          }
          if (method === "prompts/get") {
            const { name, arguments: promptArgs } = (params as { name: string; arguments?: Record<string, string> });
            let result = getPrompt(name, promptArgs || {});
            if (!result) { const pluginContent = getPluginPrompt(name); if (pluginContent) { result = { messages: [{ role: "user", content: { type: "text", text: pluginContent } }] }; } } if (!result) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, error: { code: -32002, message: "Prompt not found: " + name } })); return; }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result }));
            return;
          }
          if (method === "ping") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: {} })); return; }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, error: { code: -32601, message: "unknown method: " + method } }));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } }));
        }
      });
      return;
    }

    // streamableHttp endpoint (POST to /mcp or /)
    if (req.method === 'POST' && (urlPath === '/mcp' || urlPath === '/')) {
      if (mcpAuthPassword && !checkAuth(req, res)) return;
      let body = "";
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const rpcData = JSON.parse(body);
          const { id: reqId, method, params } = rpcData;
          if (method === "initialize") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { protocolVersion: "2025-03-26", capabilities: { tools: {}, resources: {}, sampling: {}, prompts: {} }, serverInfo: { name: "qserial-mcp", version: "0.1.0" } } }));
            return;
          }
          if (method === "notifications/initialized") { res.writeHead(202); res.end(); return; }
          if (method === "tools/list") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { tools: MCP_TOOLS } }));
            return;
          }
          if (method === "tools/call") {
            try {
              const text = await executeTool(params.name, params.arguments || {});
              res.writeHead(200, { "Content-Type": "application/json" });
              const sDrain2 = drainSampling(); const resp2 = { jsonrpc: "2.0", id: reqId, result: { content: [{ type: "text", text }], isError: false } }; if (sDrain2) (resp2 as any).sampling = sDrain2; res.end(JSON.stringify(resp2));
            } catch (e) {
              const error = e as Error;
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, error: { code: -32603, message: error.message } }));
            }
            return;
          }
                    if (method === "resources/list") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { resources: [...MCP_RESOURCES, ...getPluginResources()] } }));
            return;
          }
          if (method === "resources/read") {
            try {
              const rUri = (params as { uri: string }).uri;
              if (!rUri) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, error: { code: -32602, message: "Missing uri" } })); return; }
              let result = await readResource(rUri);
              if (!result) { const pluginRes = readPluginResource(rUri); if (pluginRes) { result = { contents: [{ uri: rUri, mimeType: pluginRes.mimeType, text: pluginRes.text }] }; } } if (!result) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, error: { code: -32002, message: "Resource not found: " + rUri } })); return; }
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result }));
            } catch (e) { const err = e as Error; res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, error: { code: -32603, message: err.message } })); }
            return;
          }
          if (method === "sampling/response") { const sr = (params as Record<string,string>); if (sr.samplingId && sr.choice) resolveSampling(sr.samplingId, sr.choice); res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { acknowledged: true } })); return; }
          if (method === "ping") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: {} })); return; }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, error: { code: -32601, message: "unknown method: " + method } }));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    console.error('[MCP] Server error:', err.message);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, mcpListenAddress, () => {
      mcpRunning = true;
      mcpPort = port;
      mcpServer = httpServer;
      sendStatus();
      resolve();
    });
    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      console.error('[MCP] Server listen error:', err.message);
      reject(new Error(err.code === 'EADDRINUSE'
        ? 'Port ' + port + ' in use'
        : 'MCP start failed: ' + err.message));
    });
  });
}

export async function stopMcpServer(): Promise<void> {
  const server = mcpServer;
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
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
  
  
