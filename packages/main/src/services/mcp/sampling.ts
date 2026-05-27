/**
 * MCP Sampling - server-initiated AI decision requests
 * When critical events occur (device panic, unknown prompt, step failure),
 * the server can ask the AI client to make a decision via sampling.
 */
import * as crypto from 'node:crypto';

interface PendingSampling {
  id: string;
  prompt: string;
  context: string;
  options: string[];
  resolve: (choice: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

const pending: PendingSampling[] = [];

/** Request AI decision. Returns the chosen option string. Timeout 30s. */
export function requestSampling(
  prompt: string,
  context: string,
  options: string[],
  timeoutMs = 30000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      const idx = pending.findIndex((p) => p.id === id);
      if (idx >= 0) {
        pending.splice(idx, 1);
        reject(new Error('SAMPLING_TIMEOUT'));
      }
    }, timeoutMs);
    pending.push({ id, prompt, context, options, resolve, reject, timer });
  });
}

/** Drain any pending sampling requests to include in next response */
export function drainSampling(): Array<{
  id: string;
  prompt: string;
  context: string;
  options: string[];
}> | null {
  if (pending.length === 0) return null;
  const results = pending.splice(0).map((p) => {
    clearTimeout(p.timer);
    return { id: p.id, prompt: p.prompt, context: p.context, options: p.options };
  });
  return results;
}

/** Resolve a sampling request with the client's choice */
export function resolveSampling(id: string, choice: string): boolean {
  const idx = pending.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  const p = pending[idx];
  pending.splice(idx, 1);
  clearTimeout(p.timer);
  p.resolve(choice);
  return true;
}

/** Check if any sampling requests are pending */
export function hasPendingSampling(): boolean {
  return pending.length > 0;
}
