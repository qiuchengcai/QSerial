/**
 * MCP HTTP transport integration tests
 * Verifies the /sse (SSE) handshake + message routing and
 * the /mcp (streamable HTTP) endpoint regression.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import * as http from 'node:http';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  app: {
    getPath: vi.fn(() => '/tmp'),
    getAppPath: vi.fn(() => process.cwd()),
    commandLine: { appendSwitch: vi.fn() },
  },
}));

import { startMcpServer, stopMcpServer, getMcpStatus } from '../../src/services/mcp/manager.ts';

let sseResponses: http.IncomingMessage[] = [];

afterEach(async () => {
  for (const res of sseResponses) {
    res.destroy();
  }
  sseResponses = [];
  await stopMcpServer();
});

async function startServer(authPassword?: string): Promise<number> {
  await startMcpServer(0, '127.0.0.1', authPassword);
  return getMcpStatus().port;
}

function get(port: number, pathname: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: pathname }, (res) => {
        let buf = '';
        res.on('data', (chunk: Buffer) => {
          buf += chunk.toString();
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, body: buf }));
      })
      .on('error', reject);
  });
}

function post(
  port: number,
  pathname: string,
  payload: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (chunk: Buffer) => {
          buf += chunk.toString();
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, body: buf }));
      }
    );
    req.on('error', reject);
    req.end(data);
  });
}

interface SseFrame {
  event: string;
  data: string;
}

/** Minimal SSE client: parses `event:`/`data:` frames and queues them. */
class SseTestClient {
  readonly res: http.IncomingMessage;
  sessionId = '';
  private buffer = '';
  private queue: SseFrame[] = [];
  private waiters: Array<(frame: SseFrame) => void> = [];

  constructor(res: http.IncomingMessage) {
    this.res = res;
  }

  push(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n\n')) !== -1) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const frame = this.parseBlock(block);
      if (!frame) continue;
      if (this.waiters.length > 0) {
        this.waiters.shift()!(frame);
      } else {
        this.queue.push(frame);
      }
    }
  }

  private parseBlock(block: string): SseFrame | null {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (dataLines.length === 0) return null;
    return { event, data: dataLines.join('\n') };
  }

  nextFrame(timeoutMs = 5000): Promise<SseFrame> {
    if (this.queue.length > 0) return Promise.resolve(this.queue.shift()!);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for SSE event')),
        timeoutMs
      );
      this.waiters.push((frame) => {
        clearTimeout(timer);
        resolve(frame);
      });
    });
  }

  static connect(port: number, token?: string): Promise<SseTestClient> {
    return new Promise((resolve, reject) => {
      const url = `http://127.0.0.1:${port}/sse${token ? '?token=' + token : ''}`;
      const req = http.get(url, (res) => {
        sseResponses.push(res);
        const client = new SseTestClient(res);
        res.on('data', (chunk: Buffer) => client.push(chunk.toString()));
        res.on('error', reject);
        resolve(client);
      });
      req.on('error', reject);
    });
  }
}

async function openSse(
  port: number,
  token?: string
): Promise<{ client: SseTestClient; sessionId: string }> {
  const client = await SseTestClient.connect(port, token);
  const first = await client.nextFrame();
  expect(first.event).toBe('endpoint');
  const sessionId = first.data.match(/sessionId=([0-9a-f-]+)/)?.[1] || '';
  expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
  return { client, sessionId };
}

describe('MCP SSE transport', () => {
  it('performs the handshake and returns an endpoint event with sessionId', async () => {
    const port = await startServer();
    const { sessionId } = await openSse(port);
    expect(sessionId.length).toBeGreaterThan(0);
  });

  it('routes initialize response back over the SSE stream', async () => {
    const port = await startServer();
    const { client, sessionId } = await openSse(port);

    const res = await post(port, '/messages?sessionId=' + sessionId, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });
    expect(res.status).toBe(202);

    const frame = await client.nextFrame();
    expect(frame.event).toBe('message');
    const msg = JSON.parse(frame.data);
    expect(msg.id).toBe(1);
    expect(msg.result.serverInfo.name).toBe('qserial-mcp');
  });

  it('lists all MCP tools over SSE', async () => {
    const port = await startServer();
    const { client, sessionId } = await openSse(port);

    const res = await post(port, '/messages?sessionId=' + sessionId, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    expect(res.status).toBe(202);

    const frame = await client.nextFrame();
    const msg = JSON.parse(frame.data);
    expect(msg.id).toBe(2);
    // 47 既有 + 10 buttons.* = 57
    expect(msg.result.tools).toHaveLength(57);
    // buttons.* 工具须全部可被发现（供 AI 客户端 tools/list 调用）
    const toolNames = (msg.result.tools as Array<{ name: string }>).map((t) => t.name);
    const buttonsTools = [
      'buttons.groups.list',
      'buttons.list',
      'buttons.get',
      'buttons.create',
      'buttons.update',
      'buttons.delete',
      'buttons.groups.create',
      'buttons.groups.update',
      'buttons.groups.delete',
      'buttons.run',
    ];
    for (const n of buttonsTools) {
      expect(toolNames).toContain(n);
    }
  });

  it('acknowledges notifications with 202', async () => {
    const port = await startServer();
    const { sessionId } = await openSse(port);

    const res = await post(port, '/messages?sessionId=' + sessionId, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(res.status).toBe(202);
  });

  it('returns 404 for an unknown session', async () => {
    const port = await startServer();
    const res = await post(port, '/messages?sessionId=00000000-0000-0000-0000-000000000000', {
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
      params: {},
    });
    expect(res.status).toBe(404);
  });
});

describe('MCP streamable HTTP transport', () => {
  it('handles initialize over /mcp', async () => {
    const port = await startServer();
    const res = await post(port, '/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });
    expect(res.status).toBe(200);
    const msg = JSON.parse(res.body);
    expect(msg.result.serverInfo.name).toBe('qserial-mcp');
  });

  it('acknowledges notifications with 202', async () => {
    const port = await startServer();
    const res = await post(port, '/mcp', {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(res.status).toBe(202);
  });
});

describe('MCP auth', () => {
  it('rejects /sse without a token', async () => {
    const port = await startServer('secret');
    const res = await get(port, '/sse');
    expect(res.status).toBe(401);
  });

  it('accepts /sse with a query token', async () => {
    const port = await startServer('secret');
    const { sessionId } = await openSse(port, 'secret');
    expect(sessionId.length).toBeGreaterThan(0);
  });

  it('accepts session-based /messages without repeating the token', async () => {
    const port = await startServer('secret');
    // 握手时通过 ?token= 完成认证,后续 POST /messages 不应再要求携带 token
    const { client, sessionId } = await openSse(port, 'secret');

    const res = await post(port, '/messages?sessionId=' + sessionId, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });
    expect(res.status).toBe(202);

    const frame = await client.nextFrame();
    const msg = JSON.parse(frame.data);
    expect(msg.id).toBe(1);
    expect(msg.result.serverInfo.name).toBe('qserial-mcp');
  });

  it('rejects /mcp without a token', async () => {
    const port = await startServer('secret');
    const res = await post(port, '/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });
    expect(res.status).toBe(401);
  });

  it('accepts /mcp with a Bearer token', async () => {
    const port = await startServer('secret');
    const res = await post(
      port,
      '/mcp',
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { Authorization: 'Bearer secret' }
    );
    expect(res.status).toBe(200);
  });
});
