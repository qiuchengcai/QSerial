/**
 * MCP 缓冲区管理 + 辅助工具
 */

import { ConnectionFactory } from '../connection/factory.js';

const buffers = new Map<string, Buffer[]>();
const bufferSubscriptions = new Map<string, () => void>();

export function ensureBuffer(id: string): void {
  if (!buffers.has(id)) {
    buffers.set(id, []);
    const conn = ConnectionFactory.get(id);
    if (conn && !bufferSubscriptions.has(id)) {
      bufferSubscriptions.set(id, conn.onData((data: Buffer) => {
        const buf = buffers.get(id);
        if (buf) buf.push(data);
      }));
    }
  }
}

export function getBuffer(id: string): Buffer {
  const buf = buffers.get(id);
  return (buf && buf.length > 0) ? Buffer.concat(buf) : Buffer.alloc(0);
}

export function consumeBuffer(id: string): Buffer {
  const data = getBuffer(id);
  buffers.set(id, []);
  return data;
}

export function peekBuffer(id: string, maxBytes: number): Buffer {
  return getBuffer(id).subarray(0, maxBytes);
}

export function clearBuffer(id: string): void { buffers.set(id, []); }

export function removeBuffer(id: string): void {
  buffers.delete(id);
  const unsub = bufferSubscriptions.get(id);
  if (unsub) { unsub(); bufferSubscriptions.delete(id); }
}

export function bufferSize(id: string): number {
  const buf = buffers.get(id);
  return buf ? buf.reduce((s, b) => s + b.length, 0) : 0;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export function matchPattern(text: string, pattern: string, isRegex: boolean): boolean {
  if (isRegex) {
    try { return new RegExp(pattern, 'i').test(text); }
    catch { return text.toLowerCase().includes(pattern.toLowerCase()); }
  }
  return text.toLowerCase().includes(pattern.toLowerCase());
}
