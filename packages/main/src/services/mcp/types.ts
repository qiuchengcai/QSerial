import type { BrowserWindow } from 'electron';

export interface ToolContext {
  mainWindow: BrowserWindow | null;
  buffers: Map<string, Buffer[]>;
  bufferSubscriptions: Map<string, () => void>;
  sharePool: Map<string, { sourceId: string; serverId: string }>;
  watches: Map<string, () => void>;
  watchResults: Map<string, Array<{ ts: number; pattern: string; level: string; context: string }>>;
  recordings: Map<string, { id: string; connectionId: string; startedAt: number; duration_ms: number; frames: Array<{ ts: number; data: string }>; unsub: () => void }>;
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;

export interface TerminalState {
  state: 'login_prompt' | 'password_prompt' | 'shell' | 'program_running' | 'idle' | 'booting' | 'unknown';
  shell_type?: string;
  detected_prompts: string[];
  details: string;
}
