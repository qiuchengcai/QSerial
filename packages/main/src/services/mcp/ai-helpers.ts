/**
 * MCP AI Enhancement Helpers
 * Structured errors, output cleaning, history tracking, AT parsing
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

/** Strip ANSI escape sequences from terminal output */
export function stripAnsi(text: string): string {
  if (!text) return text;
  return text
    .replace(/\x1b\][^\x07]*\x07/g, '')       // OSC terminated by BEL
    .replace(/\x1b\][^\x1b]*\x1b\\/g, '')     // OSC terminated by ST
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '') // CSI: \x1b[...final
    .replace(/\x1b[@-Z\^_]/g, '');             // Other escape sequences
}

/** Extract shell prompt text from terminal output */
export function extractPrompt(output: string): string | null {
  if (!output) return null;
  // Strip ANSI before matching so colored prompts are detected
  const stripped = stripAnsi(output);
  const lines = stripped.split('\n').filter((l: string) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/(\S.*?[#$>])\s*$/);
    if (m) return m[1].trimEnd();
  }
  return null;
}

/** Strip echoed command line from output */
export function stripEcho(output: string, command: string): string {
  if (!output || !command) return output;
  const lines = output.split('\n');
  for (let i = 0; i < Math.min(lines.length, 3); i++) {
    if (lines[i].trim() === command.trim() || lines[i].includes(command.trim())) {
      lines.splice(0, i + 1);
      break;
    }
  }
  return lines.join('\n').trim();
}

/** Strip trailing shell prompt from output */
export function stripPrompt(output: string, prompt: string | null): string {
  if (!output || !prompt) return output;
  // Strip ANSI so the regex can match against clean text
  const clean = stripAnsi(output);
  const escaped = prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return clean.replace(new RegExp(escaped + '\\s*$', 'm'), '').trimEnd();
}

/** Format a success response as JSON */
export function formatOk(data: unknown): string {
  return JSON.stringify({ ok: true, data });
}

/** Format an error response as JSON with error code */
export function formatError(code: string, detail: string): string {
  return JSON.stringify({ ok: false, code, detail });
}

/** Per-connection history log (ring buffer, max 200 entries) */
export const historyLog = new Map<string, Array<{ ts: number; dir: string; data: string }>>();

/** Append an entry to connection history */
export function appendHistory(id: string, dir: 'send' | 'recv', data: string): void {
  if (!historyLog.has(id)) historyLog.set(id, []);
  const log = historyLog.get(id)!;
  log.push({ ts: Date.now(), dir, data });
  if (log.length > 200) log.splice(0, log.length - 200);
}

/** Parse AT command response (e.g., +CMD: value / OK / ERROR) */
export function parseAtResponse(output: string): { result: string; fields: AnyRecord[] } {
  const fields: AnyRecord[] = [];
  let result = 'unknown';
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === 'OK') { result = 'OK'; continue; }
    if (trimmed === 'ERROR') { result = 'ERROR'; continue; }
    const m = trimmed.match(/^\+(\w+):\s*(.*)/);
    if (m) { const obj: AnyRecord = {}; obj[m[1]] = m[2]; fields.push(obj); }
  }
  return { result, fields };
}
