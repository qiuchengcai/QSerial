/**
 * 连接管理 MCP 工具处理函数 (conn.create, conn.disconnect, conn.reconnect, conn.update, conn.list)
 */

import * as crypto from 'node:crypto';
import { ConnectionFactory } from '../../connection/factory.js';
import { ConnectionState, IPC_CHANNELS, bufferToBase64 } from '@qserial/shared';
import type { ConnectionOptions } from '@qserial/shared';
import { sendMCPNotification } from '../notifications.js';
import * as ctx from '../context.js';
import type { ToolHandler } from '../types';

export const connectionHandlers: Record<string, ToolHandler> = {
  'conn.list': async (args) => {
    const id = ctx.resolveId(args);
    if (id) {
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
  },

  'conn.create': async (args, toolCtx) => {
    const ctype = args.type as string;
    if (!['serial', 'ssh', 'telnet', 'pty'].includes(ctype)) {
      return `错误: 不支持的连接类型 "${ctype}"，支持: serial, ssh, telnet, pty`;
    }

    const id = crypto.randomUUID();
    const name = (args.name as string) || `${ctype.toUpperCase()} ${((args.host || args.path) as string) || ''}`;

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
      ctx.ensureBuffer(id);
      sendMCPNotification('connection/connected', { id, type: ctype, name });

      conn.onData((data: Buffer) => {
        if (toolCtx.mainWindow && !toolCtx.mainWindow.isDestroyed()) {
          toolCtx.mainWindow.webContents.send(IPC_CHANNELS.CONNECTION_DATA, {
            id,
            data: bufferToBase64(data),
          });
        }
      });
      conn.onStateChange((state: ConnectionState) => {
        if (toolCtx.mainWindow && !toolCtx.mainWindow.isDestroyed()) {
          toolCtx.mainWindow.webContents.send(IPC_CHANNELS.CONNECTION_STATE, { id, state });
        }
      });
      conn.onError((error: Error) => {
        if (toolCtx.mainWindow && !toolCtx.mainWindow.isDestroyed()) {
          toolCtx.mainWindow.webContents.send(IPC_CHANNELS.CONNECTION_ERROR, { id, error: error.message });
        }
      });

      if (toolCtx.mainWindow && !toolCtx.mainWindow.isDestroyed()) {
        toolCtx.mainWindow.webContents.send(IPC_CHANNELS.MCP_CONNECTION_CREATED, {
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
  },

  'conn.disconnect': async (args) => {
    const id = ctx.resolveId(args);
    if (!id) return '错误: 未提供连接 id';
    const conn = ConnectionFactory.get(id);
    if (!conn) return `错误: 找不到连接 ${id}`;
    try {
      await ConnectionFactory.destroy(id);
      ctx.removeBuffer(id);
      sendMCPNotification('connection/disconnected', { id, reason: 'user_requested' });
      return `连接 ${id} 已断开并销毁`;
    } catch (err) {
      return `错误: 断开连接失败 — ${(err as Error).message}`;
    }
  },

  'conn.reconnect': async (args) => {
    const id = ctx.resolveId(args);
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
      ctx.ensureBuffer(id);
      sendMCPNotification('connection/connected', { id });
      return `连接 ${id} 已重新连接`;
    } catch (err) {
      return `错误: 重连失败 — ${(err as Error).message}`;
    }
  },

  'conn.update': async (args) => {
    const id = ctx.resolveId(args);
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
  },
};
