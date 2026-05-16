/**
 * TFTP 服务器状态管理
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TftpTransferEvent } from '@qserial/shared';

interface TftpConfig {
  port: number;
  rootDir: string;
  autoStart: boolean;
}

interface TftpTransfer extends Omit<TftpTransferEvent, 'status'> {
  status: TftpTransferEvent['status'];
  startTime: number;
  endTime?: number;
}

interface TftpState {
  config: TftpConfig;
  running: boolean;
  error?: string;
  transfers: TftpTransfer[];
}

interface TftpActions {
  updateConfig: (config: Partial<TftpConfig>) => void;
  setRunning: (running: boolean) => void;
  setError: (error?: string) => void;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  loadStatus: () => Promise<void>;
  handleTransferEvent: (event: TftpTransferEvent) => void;
  clearTransfers: () => void;
}

const DEFAULT_CONFIG: TftpConfig = {
  port: 69,
  rootDir: '',
  autoStart: false,
};

export const useTftpStore = create<TftpState & TftpActions>()(
  persist(
    (set, get) => ({
      config: DEFAULT_CONFIG,
      running: false,
      error: undefined,
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
        const { config } = get();
        if (!config.rootDir) {
          set({ error: '请选择共享目录' });
          return;
        }
        try {
          await window.qserial.tftp.start(config.port, config.rootDir);
          set({ running: true, error: undefined, config: { ...config, autoStart: true } });
        } catch (error) {
          set({ error: (error as Error).message, running: false });
        }
      },

      stopServer: async () => {
        try {
          await window.qserial.tftp.stop();
          set({ running: false, error: undefined, config: { ...get().config, autoStart: false } });
        } catch (error) {
          set({ error: (error as Error).message });
        }
      },

      loadStatus: async () => {
        try {
          const status = await window.qserial.tftp.getStatus();
          // 只有当服务器正在运行时才更新配置
          // 否则保留 localStorage 中持久化的配置
          if (status.running) {
            set({
              running: true,
              config: {
                port: status.port,
                rootDir: status.rootDir,
              },
            });
          } else {
            // 服务器未运行，只更新 running 状态
            set({ running: false });
          }
        } catch (error) {
          console.error('Failed to load TFTP status:', error);
        }
      },

      handleTransferEvent: (event) => {
        set((state) => {
          const existingIndex = state.transfers.findIndex((t) => t.id === event.id);
          const now = Date.now();

          if (existingIndex >= 0) {
            // 更新现有传输
            const updated = [...state.transfers];
            const existing = updated[existingIndex];
            updated[existingIndex] = {
              ...existing,
              status: event.status,
              fileSize: event.fileSize ?? existing.fileSize,
              transferred: event.transferred ?? existing.transferred,
              percent: event.percent ?? existing.percent,
              error: event.error,
              endTime: event.status === 'completed' || event.status === 'error' || event.status === 'aborted' ? now : undefined,
            };
            return { transfers: updated };
          } else {
            // 新传输
            const newTransfer: TftpTransfer = {
              id: event.id,
              file: event.file,
              direction: event.direction,
              status: event.status,
              remoteAddress: event.remoteAddress,
              fileSize: event.fileSize,
              transferred: event.transferred ?? 0,
              percent: event.percent ?? 0,
              error: event.error,
              startTime: now,
            };
            // 保留最近 50 条记录
            const transfers = [newTransfer, ...state.transfers].slice(0, 50);
            return { transfers };
          }
        });
      },

      clearTransfers: () => {
        set({ transfers: [] });
      },
    }),
    {
      name: 'qserial-tftp',
      partialize: (state) => ({ config: state.config }),
    }
  )
);
