/**
 * 保存的会话配置
 */

export interface SavedSession {
  id: string;
  name: string;
  type: 'serial' | 'ssh' | 'telnet' | 'pty';
  createdAt: Date;
  lastUsedAt: Date;

  // 串口配置
  serialConfig?: {
    path: string;
    baudRate: number;
    dataBits: 5 | 6 | 7 | 8;
    stopBits: 1 | 2;
    parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
  };

  // SSH 配置
  sshConfig?: {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
  };

  // Telnet 配置
  telnetConfig?: {
    host: string;
    port: number;
  };

  // PTY 配置
  ptyConfig?: {
    shell: string;
    cwd?: string;
  };
}

interface SavedSessionsState {
  sessions: SavedSession[];

  // 添加会话
  addSession: (session: Omit<SavedSession, 'id' | 'createdAt' | 'lastUsedAt'>) => string;

  // 删除会话
  removeSession: (id: string) => void;

  // 更新会话
  updateSession: (id: string, updates: Partial<SavedSession>) => void;

  // 更新最后使用时间
  touchSession: (id: string) => void;

  // 导入会话（合并，跳过重复）
  importSessions: (sessions: SavedSession[]) => void;

  // 重排会话顺序
  reorderSessions: (fromIndex: number, toIndex: number) => void;

  // 加载保存的会话
  loadSessions: () => void;

  // 保存会话到存储
  saveSessions: () => void;
}

const STORAGE_KEY = 'qserial_saved_sessions';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSavedSessionsStore = create<SavedSessionsState>()(
  persist(
    (set, get) => ({
      sessions: [],

      addSession: (session) => {
        const id = crypto.randomUUID();
        const now = new Date();

        const currentSessions = get().sessions || [];

        // 检查是否已存在相同名称或相同串口路径的配置
        const existingIndex = currentSessions.findIndex((s) => {
          if (session.type === 'serial' && s.type === 'serial' &&
              session.serialConfig && s.serialConfig) {
            return s.serialConfig.path === session.serialConfig.path;
          }
          return s.name === session.name;
        });

        // 如果已存在，更新而不是添加
        if (existingIndex !== -1) {
          set((state) => {
            const sessions = [...(state.sessions || [])];
            sessions[existingIndex] = {
              ...sessions[existingIndex],
              ...session,
              lastUsedAt: now,
            };
            return { sessions };
          });
          return (get().sessions || [])[existingIndex]?.id || id;
        }

        set((state) => ({
          sessions: [
            ...(state.sessions || []),
            {
              ...session,
              id,
              createdAt: now,
              lastUsedAt: now,
            },
          ],
        }));

        return id;
      },

      removeSession: (id) => {
        set((state) => ({
          sessions: (state.sessions || []).filter((s) => s.id !== id),
        }));
      },

      updateSession: (id, updates) => {
        set((state) => ({
          sessions: (state.sessions || []).map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        }));
      },

      touchSession: (id) => {
        set((state) => ({
          sessions: (state.sessions || []).map((s) =>
            s.id === id ? { ...s, lastUsedAt: new Date() } : s
          ),
        }));
      },

      importSessions: (importedSessions) => {
        if (!Array.isArray(importedSessions)) return;
        set((state) => {
          const currentSessions = state.sessions || [];
          const existingKeys = new Set(
            currentSessions.map((s) =>
              s.type === 'serial' && s.serialConfig ? s.serialConfig.path : s.name
            )
          );
          const newSessions = importedSessions.filter((s) => {
            const key = s.type === 'serial' && s.serialConfig ? s.serialConfig.path : s.name;
            return !existingKeys.has(key);
          });
          return {
            sessions: [...currentSessions, ...newSessions],
          };
        });
      },

      reorderSessions: (fromIndex, toIndex) => {
        set((state) => {
          const sessions = [...(state.sessions || [])];
          const [removed] = sessions.splice(fromIndex, 1);
          sessions.splice(toIndex, 0, removed);
          return { sessions };
        });
      },

      loadSessions: () => {
        // zustand persist 会自动加载
      },

      saveSessions: () => {
        // zustand persist 会自动保存
      },
    }),
    {
      name: STORAGE_KEY,
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<SavedSessionsState> | null | undefined;
        if (!persistedState || typeof persistedState !== 'object') {
          return current;
        }
        return {
          ...current,
          ...persistedState,
          sessions: Array.isArray(persistedState.sessions) ? persistedState.sessions : current.sessions,
        };
      },
    }
  )
);
