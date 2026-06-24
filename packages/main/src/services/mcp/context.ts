/**
 * MCP 共享状态和辅助函数
 * 被 manager.ts 和 tools/*.ts 共同使用
 */

import type { BrowserWindow } from 'electron';
import { ConnectionFactory } from '../connection/factory.js';

// ==================== 模块级状态 ====================

export let mainWindow: BrowserWindow | null = null;
export let mcpAuthPassword = '';
export let mcpCorsOrigins: string[] = [];

export const sharePool = new Map<string, { sourceId: string; serverId: string }>();
export const watches = new Map<string, () => void>();
export const watchResults = new Map<string, Array<{ ts: number; pattern: string; level: string; context: string }>>();
export const recordings = new Map<string, { id: string; connectionId: string; startedAt: number; duration_ms: number; frames: Array<{ ts: number; data: string }>; unsub: () => void }>();
export const buffers = new Map<string, Buffer[]>();
export const bufferSubscriptions = new Map<string, () => void>();

export function setMainWindowRef(window: BrowserWindow | null): void {
  mainWindow = window;
}

export function setAuthPassword(password: string): void {
  mcpAuthPassword = password;
}

export function setCorsOrigins(origins: string[]): void {
  mcpCorsOrigins = origins;
}

// ==================== 缓冲区管理 ====================

export function ensureBuffer(id: string): void {
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

export function getBuffer(id: string): Buffer {
  const buf = buffers.get(id);
  if (!buf || buf.length === 0) return Buffer.alloc(0);
  return Buffer.concat(buf);
}

export function consumeBuffer(id: string): Buffer {
  const result = getBuffer(id);
  buffers.set(id, []);
  return result;
}

/** 精确消费 n 字节（不足时返回全部），用于 XModem 等逐字节协议 */
export function consumeBytes(id: string, n: number): Buffer {
  const all = getBuffer(id);
  if (all.length <= n) {
    buffers.set(id, []);
    return all;
  }
  const result = all.subarray(0, n);
  const remaining = all.subarray(n);
  buffers.set(id, [remaining]);
  return result;
}

export function peekBuffer(id: string, maxBytes: number): Buffer {
  const all = getBuffer(id);
  return all.subarray(Math.max(0, all.length - maxBytes));
}

export function clearBuffer(id: string): void {
  buffers.set(id, []);
}

export function removeBuffer(id: string): void {
  const unsub = bufferSubscriptions.get(id);
  if (unsub) {
    unsub();
    bufferSubscriptions.delete(id);
  }
  buffers.delete(id);
}

// ==================== 串行写锁（同一连接排队） ====================

const writeLocks = new Map<string, Promise<void>>();

export async function acquireWriteLock(id: string): Promise<void> {
  const prev = writeLocks.get(id) || Promise.resolve();
  let release: () => void;
  const next = new Promise<void>(r => { release = r; });
  writeLocks.set(id, prev.then(() => next));
  await prev;
  (next as Promise<void> & { _release?: () => void })._release = release!;
}

export function releaseWriteLock(id: string): void {
  const lock = writeLocks.get(id) as Promise<void> & { _release?: () => void } | undefined;
  if (lock?._release) {
    lock._release();
  }
}

export function bufferSize(id: string): number {
  const buf = buffers.get(id);
  if (!buf) return 0;
  return buf.reduce((s, b) => s + b.length, 0);
}

// ==================== 辅助函数 ====================

export function resolveId(args: Record<string, unknown>): string {
  return (args.id || args.connectionId) as string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export function matchPattern(text: string, pattern: string, isRegex: boolean): boolean {
  if (isRegex) {
    try {
      return new RegExp(pattern, 'i').test(text);
    } catch {
      return text.toLowerCase().includes(pattern.toLowerCase());
    }
  }
  return text.toLowerCase().includes(pattern.toLowerCase());
}

export async function waitPattern(
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

export async function waitForAnyPattern(
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

export async function waitForData(id: string, timeoutMs: number): Promise<void> {
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

// ==================== 状态分析 ====================

export interface TerminalState {
  state: 'login_prompt' | 'password_prompt' | 'shell' | 'program_running' | 'idle' | 'booting' | 'unknown';
  shell_type?: string;
  detected_prompts: string[];
  details: string;
}

export function analyzeState(output: string, connectionState: string): TerminalState {
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
