/**
 * MCP 服务器状态管理
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { McpServerStatus } from '@qserial/shared';
import type { ConnectionType } from '@qserial/shared';

interface McpConfig {
  port: number;
}

interface McpConnection {
  id: string;
  type: string;
  name: string;
  state: string;
}

interface McpState {
  config: McpConfig;
  running: boolean;
  starting: boolean;
  stopping: boolean;
  error?: string;
  connections: McpConnection[];
}

interface McpActions {
  updateConfig: (config: Partial<McpConfig>) => void;
  setRunning: (running: boolean) => void;
  setError: (error?: string) => void;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  loadStatus: () => Promise<void>;
}

const DEFAULT_CONFIG: McpConfig = {
  port: 9800,
};

export const useMcpStore = create<McpState & McpActions>()(
  persist(
    (set, get) => ({
      config: DEFAULT_CONFIG,
      running: false,
      starting: false,
      stopping: false,
      error: undefined,
      connections: [],

      updateConfig: (config) => {
        set((state) => ({
          config: { ...state.config, ...config },
        }));
      },

      setRunning: (running) => {
        set({ running, error: undefined });
      },

      setError: (error) => {
        set({ error, running: false });
      },

      startServer: async () => {
        const { config, starting } = get();
        if (starting) return;
        set({ starting: true, stopping: false, error: undefined });
        try {
          await window.qserial.mcp.start(config.port);
          set({ running: true, starting: false, error: undefined });
        } catch (error) {
          set({ error: (error as Error).message, running: false, starting: false });
        }
      },

      stopServer: async () => {
        set({ starting: false, stopping: true });
        try {
          await window.qserial.mcp.stop();
          set({ running: false, stopping: false, error: undefined, connections: [] });
        } catch (error) {
          set({ error: (error as Error).message, stopping: false });
        }
      },

      loadStatus: async () => {
        try {
          const status: McpServerStatus = await window.qserial.mcp.getStatus();
          const { starting, stopping, running: currentRunning } = get();
          if (starting || stopping) return;
          if (status.running) {
            set({
              running: true,
              config: { port: status.port },
              connections: status.connections,
            });
          } else {
            if (currentRunning) {
              console.log('[MCP] loadStatus: main process reports not running, syncing state to false');
            }
            set({ running: false, connections: [] });
          }
        } catch (error) {
          console.error('Failed to load MCP status:', error);
        }
      },
    }),
    {
      name: 'qserial-mcp',
      partialize: (state) => ({ config: state.config }),
    }
  )
);

// 监听主进程的 MCP 状态变化事件
let listenersInitialized = false;

export function initMcpListeners(): void {
  if (listenersInitialized) return;
  listenersInitialized = true;

  window.qserial.mcp.onStatusChange((event) => {
    const state = useMcpStore.getState();
    if (!event.running) {
      if (state.starting) return;
      if (state.stopping) return;
      if (!state.running) return;
      useMcpStore.setState({ running: false, starting: false, stopping: false, error: 'MCP 服务已意外停止' });
    } else {
      if (!state.running) {
        useMcpStore.setState({ running: true, starting: false });
      }
    }
  });
}
