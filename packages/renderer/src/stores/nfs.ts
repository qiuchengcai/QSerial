/**
 * NFS 服务器状态管理
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NfsClientEvent } from '@qserial/shared';

interface NfsConfig {
  exportDir: string;
  allowedClients: string;
  options: string;
}

interface NfsClient {
  address: string;
  port?: number;
  mountedPath?: string;
  action: 'connected' | 'disconnected';
  timestamp: number;
}

interface NfsState {
  config: NfsConfig;
  running: boolean;
  error?: string;
  clients: NfsClient[];
  mountHint?: {
    localIp: string;
    exportDir: string;
    mountCmd: string;
  };
}

interface NfsActions {
  updateConfig: (config: Partial<NfsConfig>) => void;
  setRunning: (running: boolean) => void;
  setError: (error?: string) => void;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  loadStatus: () => Promise<void>;
  handleClientEvent: (event: NfsClientEvent) => void;
  clearClients: () => void;
  loadMountHint: () => Promise<void>;
}

const DEFAULT_CONFIG: NfsConfig = {
  exportDir: '',
  allowedClients: '*',
  options: 'rw,sync,no_subtree_check,no_root_squash',
};

export const useNfsStore = create<NfsState & NfsActions>()(
  persist(
    (set, get) => ({
      config: DEFAULT_CONFIG,
      running: false,
      error: undefined,
      clients: [],
      mountHint: undefined,

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
        const { config } = get();
        if (!config.exportDir) {
          set({ error: '请选择共享目录' });
          return;
        }
        try {
          await window.qserial.nfs.start(
            config.exportDir,
            config.allowedClients,
            config.options,
          );
          set({ running: true, error: undefined });
          // 加载挂载提示
          get().loadMountHint();
        } catch (error) {
          set({ error: (error as Error).message, running: false });
        }
      },

      stopServer: async () => {
        try {
          await window.qserial.nfs.stop();
          set({ running: false, error: undefined, mountHint: undefined });
        } catch (error) {
          set({ error: (error as Error).message });
        }
      },

      loadStatus: async () => {
        try {
          const status = await window.qserial.nfs.getStatus();
          if (status.running) {
            set({
              running: true,
              config: {
                exportDir: status.exportDir,
                allowedClients: status.allowedClients,
                options: status.options,
              },
            });
            get().loadMountHint();
          } else {
            set({ running: false });
          }
        } catch (error) {
          console.error('Failed to load NFS status:', error);
        }
      },

      handleClientEvent: (event) => {
        set((state) => {
          const newClient: NfsClient = {
            ...event,
            timestamp: Date.now(),
          };
          // 保留最近 50 条记录
          const clients = [newClient, ...state.clients].slice(0, 50);
          return { clients };
        });
      },

      clearClients: () => {
        set({ clients: [] });
      },

      loadMountHint: async () => {
        try {
          const hint = await window.qserial.nfs.getMountHint();
          set({ mountHint: hint || undefined });
        } catch (error) {
          console.error('Failed to load mount hint:', error);
        }
      },
    }),
    {
      name: 'qserial-nfs',
      partialize: (state) => ({ config: state.config }),
    }
  )
);
