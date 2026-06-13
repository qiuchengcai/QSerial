/**
 * 连接数据 I/O MCP 工具处理函数
 * conn.data.*, conn.hw.*, conn.file.send
 */

import * as fs from 'node:fs';
import { ConnectionFactory } from '../../connection/factory.js';
import { ConnectionState, ConnectionType } from '@qserial/shared';
import { formatOk, formatError, appendHistory, historyLog, extractPrompt, stripEcho, stripPrompt, parseAtResponse } from '../ai-helpers.js';
import { xmodemSend } from '../xmodem.js';
import * as ctx from '../context.js';
import type { ToolHandler } from '../types';

export const connIOHandlers: Record<string, ToolHandler> = {
  'conn.data.write': async (args) => {
    const id = ctx.resolveId(args);
    const data = args.data as string;
    if (!id) return '错误: 未提供连接 id';
    if (!data) return '错误: 未提供 data 参数';
    const conn = ConnectionFactory.get(id);
    if (!conn) return `错误: 找不到连接 ${id}`;
    if (conn.state !== ConnectionState.CONNECTED) {
      return `错误: 连接 ${id} 未就绪（当前状态：${conn.state}）`;
    }
    ctx.ensureBuffer(id);

    if (args.wait_before) {
      const wbPattern = args.wait_before as string;
      const wbResult = await ctx.waitPattern(id, wbPattern, 10, false);
      if (!wbResult.matched) {
        return `错误: 等待 "${wbPattern}" 超时 (10s)。最后输出:\n${wbResult.output.slice(-500)}`;
      }
    }

    if (args.delay_ms) {
      await ctx.sleep(args.delay_ms as number);
    }

    conn.write(Buffer.from(data, 'utf-8'));
    const responseTimeout = (args.response_timeout_ms as number) || 2000;
    await ctx.waitForData(id, responseTimeout);
    const output = ctx.consumeBuffer(id).toString('utf-8');
    const meta = `sent=${data.length}B, replied=${output.length}B, ts=${Date.now()}`;
    return output
      ? `${output}\n\n[${meta}]`
      : `已发送 (${data.length} 字符)，无立即回显 [${meta}]`;
  },

  'conn.data.write_hex': async (args) => {
    const id = ctx.resolveId(args);
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
    ctx.ensureBuffer(id);
    conn.writeHex(hex);
    await ctx.waitForData(id, 2000);
    const output = ctx.consumeBuffer(id).toString('utf-8');
    const meta = `sent=${hex.length / 2}B hex, replied=${output.length}B, ts=${Date.now()}`;
    return output
      ? `${output}\n\n[${meta}]`
      : `已发送 (${hex.length / 2} 字节)，无立即回显 [${meta}]`;
  },

  'conn.data.read': async (args) => {
    const id = ctx.resolveId(args);
    if (!id) return '错误: 未提供连接 id';
    if (!ConnectionFactory.get(id)) return `错误: 找不到连接 ${id}`;
    ctx.ensureBuffer(id);

    const consume = args.consume !== false;
    const maxBytes = (args.max_bytes as number) || 4096;
    const totalBefore = ctx.bufferSize(id);

    if (consume) {
      if (maxBytes === 0) {
        ctx.clearBuffer(id);
        const meta = `cleared, total_before=${totalBefore}, ts=${Date.now()}`;
        return `(已清空 ${totalBefore}B) [${meta}]`;
      }
      const output = ctx.consumeBuffer(id).toString('utf-8');
      const meta = `bytes=${output.length}, total_before_read=${totalBefore}, ts=${Date.now()}`;
      return output
        ? `${output}\n[${meta}]`
        : `(无新输出) [${meta}]`;
    } else {
      const output = ctx.peekBuffer(id, maxBytes).toString('utf-8');
      const meta = `shown=${output.length}, buffer_total=${totalBefore}, ts=${Date.now()}`;
      return output
        ? `${output}\n[${meta}]`
        : `(缓冲区为空) [${meta}]`;
    }
  },

  'conn.data.expect': async (args) => {
    const id = ctx.resolveId(args);
    if (!id) return '错误: 未提供连接 id';
    const pattern = args.pattern as string;
    if (!pattern) return '错误: 未提供 pattern 参数';
    const isRegex = args.regex === true;
    const timeout = (args.timeout as number) || 30;
    const conn = ConnectionFactory.get(id);
    if (!conn) return `错误: 找不到连接 ${id}`;
    ctx.ensureBuffer(id);

    const result = await ctx.waitPattern(id, pattern, timeout, isRegex);

    if (result.matched) {
      return `${result.output}\n[匹配 "${pattern}" (${isRegex ? 'regex' : 'substr'}), 耗时=${result.output.length}B]`;
    }

    const remaining = ctx.consumeBuffer(id).toString('utf-8');
    const all = result.output + remaining;
    const tail = all.slice(-1000);
    return `错误: 超时 (${timeout}s) 未匹配/${isRegex ? 'regex' : 'substr'}: "${pattern}"。最后 1000 字节:\n${tail}`;
  },

  'conn.data.clear': async (args) => {
    const id = ctx.resolveId(args);
    if (!id) return '错误: 未提供连接 id';
    if (!ConnectionFactory.get(id)) return `错误: 找不到连接 ${id}`;
    const before = ctx.bufferSize(id);
    ctx.clearBuffer(id);
    return `缓冲区已清空 (释放 ${before} 字节)`;
  },

  'conn.data.send': async (args) => {
    const id = ctx.resolveId(args);
    const command = args.command as string;
    if (!id) return formatError('MISSING_PARAM', 'missing id');
    if (!command) return formatError('MISSING_PARAM', 'missing command');
    const conn = ConnectionFactory.get(id);
    if (!conn) return formatError('CONN_NOT_FOUND', 'connection not found: ' + id);
    if (conn.state !== ConnectionState.CONNECTED) return formatError('CONN_NOT_CONNECTED', 'not connected');
    ctx.ensureBuffer(id); ctx.clearBuffer(id);

    const timeoutMs = (args.timeout_ms as number) || 5000;
    const cmdForDisplay = command.endsWith('\n') ? command.slice(0, -1) : command;
    conn.write(Buffer.from(cmdForDisplay + '\n', 'utf-8'));
    appendHistory(id, 'send', cmdForDisplay + '\n');
    const t0 = Date.now();

    const patterns = [{ pattern: '[#$>]\\s', isRegex: true }];
    await ctx.waitForAnyPattern(id, patterns, Math.ceil(timeoutMs / 1000));
    const rawOutput = ctx.consumeBuffer(id).toString('utf-8');
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
  },

  'conn.data.history': async (args) => {
    const hid = ctx.resolveId(args);
    if (!hid) return formatError('MISSING_PARAM', 'missing id');
    const maxEntries = (args.max_entries as number) || 20;
    const log = historyLog.get(hid) || [];
    const entries = log.slice(-maxEntries);
    const totalSend = entries.filter(e => e.dir === 'send').reduce((s, e) => s + e.data.length, 0);
    const totalRecv = entries.filter(e => e.dir === 'recv').reduce((s, e) => s + e.data.length, 0);
    return formatOk({ entries, count: entries.length, total_send_bytes: totalSend, total_recv_bytes: totalRecv });
  },

  'conn.hw.dtr_rts': async (args) => {
    const id = ctx.resolveId(args);
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
  },

  'conn.hw.break': async (args) => {
    const id = ctx.resolveId(args);
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
      await ctx.sleep(durationMs);
      conn.set({ brk: false });
      return `Break 信号已发送 (${durationMs}ms)`;
    } catch (err) {
      return `错误: 发送 break 信号失败 — ${(err as Error).message}`;
    }
  },

  'conn.file.send': async (args) => {
    const id = ctx.resolveId(args);
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

    ctx.ensureBuffer(id);
    ctx.clearBuffer(id);

    const readByte = async (timeoutMs: number): Promise<number> => {
      await ctx.waitForData(id, timeoutMs);
      const buf = ctx.consumeBuffer(id);
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
  },
};
