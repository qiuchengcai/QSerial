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
  autoStart: boolean;
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
  starting: boolean;
  stopping: boolean;
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
  autoStart: false,
};

export const useNfsStore = create<NfsState & NfsActions>()(
  persist(
    (set, get) => ({
      config: DEFAULT_CONFIG,
      running: false,
      starting: false,
      stopping: false,
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
        const { config, starting } = get();
        if (starting) return;
        if (!config.exportDir) {
          set({ error: '请选择共享目录' });
          return;
        }
        console.log('[NFS] startServer: calling IPC start');
        set({ starting: true, stopping: false, error: undefined });
        try {
          await window.qserial.nfs.start(
            config.exportDir,
            config.allowedClients,
            config.options,
          );
          console.log('[NFS] startServer: IPC start succeeded');
          // 主进程已确认进程稳定运行（内部有 1 秒稳定性验证）
          // 手动启动成功后自动设置自启标记，保证重启后服务自动恢复
          set({ running: true, starting: false, error: undefined, config: { ...config, autoStart: true } });
          get().loadMountHint();
        } catch (error) {
          console.log('[NFS] startServer: IPC start failed:', (error as Error).message);
          set({ error: (error as Error).message, running: false, starting: false });
        }
      },

      stopServer: async () => {
        set({ starting: false, stopping: true });
        try {
          await window.qserial.nfs.stop();
          // 手动停止后关闭自启标记
          set({ running: false, stopping: false, error: undefined, mountHint: undefined, config: { ...get().config, autoStart: false } });
        } catch (error) {
          set({ error: (error as Error).message, stopping: false });
        }
      },

      loadStatus: async () => {
        try {
          const status = await window.qserial.nfs.getStatus();
          const { starting, stopping, running: currentRunning } = get();
          // 启动/停止过程中不覆盖状态，避免竞态
          if (starting || stopping) return;
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
            // 主进程认为未运行，但渲染进程认为运行中
            // 可能是应用重启后主进程内存重置，或进程确实已退出
            // 信任主进程的状态，同步为 false
            if (currentRunning) {
              console.log('[NFS] loadStatus: main process reports not running, syncing state to false');
            }
            set({ running: false, mountHint: undefined });
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
          // 按 IP 更新：同一 IP 只保留最新状态
          const existing = state.clients.findIndex(c => c.address === event.address);
          let clients: NfsClient[];
          if (existing >= 0) {
            clients = [...state.clients];
            clients[existing] = newClient;
          } else {
            clients = [...state.clients, newClient];
          }
          // 移除已断开连接的条目（保持列表干净）
          clients = clients.filter(c => c.action !== 'disconnected');
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
      merge: (persisted: any, current: any) => ({
        ...current,
        ...persisted,
        config: { ...current.config, ...persisted?.config },
      }),
    }
  )
);

// 监听主进程的 NFS 状态变化事件，实时同步 store
let listenersInitialized = false;

export function initNfsListeners(): void {
  if (listenersInitialized) return;
  listenersInitialized = true;

  // 监听服务状态变化（如 WinNFSd 进程意外退出）
  window.qserial.nfs.onStatusChange((event) => {
    const state = useNfsStore.getState();
    console.log('[NFS] onStatusChange:', JSON.stringify(event), 'state:', { running: state.running, starting: state.starting, stopping: state.stopping });
    if (!event.running) {
      // 启动过程中收到停止事件：说明进程在主进程稳定性验证期间退出了
      // 由 startServer catch 处理，此处不做额外操作
      if (state.starting) return;
      // 停止过程中忽略（由 stopServer 自行管理状态）
      if (state.stopping) return;
      // 只在服务确实处于运行状态时才处理停止事件
      if (!state.running) return;
      // 服务异常退出
      console.log('[NFS] handling unexpected stop');
      useNfsStore.setState({ running: false, starting: false, stopping: false, mountHint: undefined, error: event.error || 'NFS 服务已意外停止' });
    } else {
      // 收到 running:true 事件，同步状态
      if (!state.running) {
        useNfsStore.setState({ running: true, starting: false });
        state.loadMountHint();
      }
    }
  });

  // 监听客户端连接/断开事件
  window.qserial.nfs.onClient((event) => {
    useNfsStore.getState().handleClientEvent(event as NfsClientEvent);
  });
}
