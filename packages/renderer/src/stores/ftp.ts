/**
 * FTP 服务器状态管理
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FtpClientEvent, FtpTransferEvent } from '@qserial/shared';

interface FtpConfig {
  port: number;
  rootDir: string;
  username: string;
  password: string;
  autoStart: boolean;
}

interface FtpClient {
  address: string;
  port?: number;
  userName?: string;
  action: 'connected' | 'disconnected';
  timestamp: number;
}

interface FtpState {
  config: FtpConfig;
  running: boolean;
  starting: boolean;
  stopping: boolean;
  error?: string;
  clients: FtpClient[];
  transfers: FtpTransferEvent[];
}

interface FtpActions {
  updateConfig: (config: Partial<FtpConfig>) => void;
  setRunning: (running: boolean) => void;
  setError: (error?: string) => void;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  loadStatus: () => Promise<void>;
  handleTransferEvent: (event: FtpTransferEvent) => void;
  handleClientEvent: (event: FtpClientEvent) => void;
  clearClients: () => void;
  clearTransfers: () => void;
}

const DEFAULT_CONFIG: FtpConfig = {
  port: 2121,
  rootDir: '',
  username: 'anonymous',
  password: '',
  autoStart: false,
};

export const useFtpStore = create<FtpState & FtpActions>()(
  persist(
    (set, get) => ({
      config: DEFAULT_CONFIG,
      running: false,
      starting: false,
      stopping: false,
      error: undefined,
      clients: [],
      transfers: [],

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
        if (!config.rootDir) {
          set({ error: '请选择共享目录' });
          return;
        }
        set({ starting: true, stopping: false, error: undefined });
        try {
          await window.qserial.ftp.start(
            config.port,
            config.rootDir,
            config.username,
            config.password,
          );
          set({ running: true, starting: false, error: undefined, config: { ...config, autoStart: true } });
        } catch (error) {
          set({ error: (error as Error).message, running: false, starting: false });
        }
      },

      stopServer: async () => {
        set({ starting: false, stopping: true });
        try {
          await window.qserial.ftp.stop();
          set({ running: false, stopping: false, error: undefined, clients: [], config: { ...get().config, autoStart: false } });
        } catch (error) {
          set({ error: (error as Error).message, stopping: false });
        }
      },

      loadStatus: async () => {
        try {
          const status = await window.qserial.ftp.getStatus();
          const { starting, stopping, running: currentRunning } = get();
          if (starting || stopping) return;
          if (status.running) {
            set({
              running: true,
              config: {
                port: status.port,
                rootDir: status.rootDir,
                username: status.username,
                password: get().config.password,
              },
            });
          } else {
            if (currentRunning) {
              console.log('[FTP] loadStatus: main process reports not running, syncing state to false');
            }
            set({ running: false });
          }
        } catch (error) {
          console.error('Failed to load FTP status:', error);
        }
      },

      handleTransferEvent: (event) => {
        set((state) => {
          const transfers = [event, ...state.transfers].slice(0, 50);
          return { transfers };
        });
      },

      handleClientEvent: (event) => {
        set((state) => {
          const newClient: FtpClient = {
            ...event,
            timestamp: Date.now(),
          };
          const existing = state.clients.findIndex(c => c.address === event.address);
          let clients: FtpClient[];
          if (existing >= 0) {
            clients = [...state.clients];
            clients[existing] = newClient;
          } else {
            clients = [...state.clients, newClient];
          }
          clients = clients.filter(c => c.action !== 'disconnected');
          return { clients };
        });
      },

      clearClients: () => {
        set({ clients: [] });
      },

      clearTransfers: () => {
        set({ transfers: [] });
      },
    }),
    {
      name: 'qserial-ftp',
      partialize: (state) => ({ config: state.config }),
      merge: (persisted: any, current: any) => ({
        ...current,
        ...persisted,
        config: { ...current.config, ...persisted?.config },
      }),
    }
  )
);

// 监听主进程的 FTP 状态变化事件
let listenersInitialized = false;

export function initFtpListeners(): void {
  if (listenersInitialized) return;
  listenersInitialized = true;

  window.qserial.ftp.onStatusChange((event) => {
    const state = useFtpStore.getState();
    if (!event.running) {
      if (state.starting) return;
      if (state.stopping) return;
      if (!state.running) return;
      useFtpStore.setState({ running: false, starting: false, stopping: false, error: event.error || 'FTP 服务已意外停止' });
    } else {
      if (!state.running) {
        useFtpStore.setState({ running: true, starting: false });
      }
    }
  });

  window.qserial.ftp.onTransfer((event) => {
    useFtpStore.getState().handleTransferEvent(event as FtpTransferEvent);
  });

  window.qserial.ftp.onClient((event) => {
    useFtpStore.getState().handleClientEvent(event as FtpClientEvent);
  });
}
