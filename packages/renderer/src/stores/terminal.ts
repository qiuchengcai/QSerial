/**
 * 终端状态管理
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { ConnectionType, ConnectionState } from '@qserial/shared';
import { useSftpStore } from './sftp';

interface Session {
  id: string;
  name: string;
  connectionId: string;
  connectionType: ConnectionType;
  connectionState: ConnectionState;
  cols: number;
  rows: number;
  createdAt: Date;
  lastActiveAt: Date;
  // 串口路径（用于判断是否已连接）
  serialPath?: string;
  // 主机地址（SSH/Telnet 用于判断是否已连接）
  host?: string;
  // 日志文件路径
  logFilePath?: string;
  // 日志启用状态
  logEnabled: boolean;
}

interface Tab {
  id: string;
  name: string;
  sessions: string[];
  activeSessionId: string | null;
  splitDirection?: 'horizontal' | 'vertical';
}

interface TerminalState {
  tabs: Tab[];
  activeTabId: string | null;
  sessions: Record<string, Session>;

  // Tab 操作
  createTab: (name?: string) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => void;

  // Session 操作
  createSession: (connectionId: string, type: ConnectionType, serialPath?: string, host?: string) => string;
  closeSession: (sessionId: string) => void;
  updateSessionState: (sessionId: string, state: ConnectionState) => void;
  updateSessionSize: (sessionId: string, cols: number, rows: number) => void;

  // Split 操作
  splitSession: (sessionId: string, direction: 'horizontal' | 'vertical') => string;

  // 查找包含指定 session 的 Tab
  findTabBySession: (sessionId: string) => string | null;

  // 关闭 Session 及其所在的 Tab
  closeSessionAndTab: (sessionId: string) => void;

  // 日志操作
  startLog: (sessionId: string, filePath: string) => void;
  stopLog: (sessionId: string) => void;
  setLogEnabled: (sessionId: string, enabled: boolean) => void;
}

export const useTerminalStore = create<TerminalState>()(
  immer((set, get) => ({
    tabs: [],
    activeTabId: null,
    sessions: {},

    createTab: (name) => {
      const tabId = crypto.randomUUID();
      set((state) => {
        state.tabs.push({
          id: tabId,
          name: name || `Tab ${state.tabs.length + 1}`,
          sessions: [],
          activeSessionId: null,
        });
        state.activeTabId = tabId;
      });
      return tabId;
    },

    closeTab: (tabId) => {
      set((state) => {
        const tabIndex = state.tabs.findIndex((t) => t.id === tabId);
        if (tabIndex === -1) return;

        // 关闭该 Tab 下的所有 Session 和连接
        const tab = state.tabs[tabIndex];
        tab.sessions.forEach((sessionId) => {
          const session = state.sessions[sessionId];
          if (session) {
            // 异步关闭连接
            window.qserial.connection.destroy(session.connectionId).catch((err) => {
              console.error('Failed to destroy connection:', err);
            });
            // 同步关闭对应的 SFTP 会话
            useSftpStore.getState().destroySessionByConnection(session.connectionId).catch((err) => {
              console.error('Failed to destroy SFTP session:', err);
            });
          }
          delete state.sessions[sessionId];
        });

        state.tabs.splice(tabIndex, 1);

        // 切换到相邻 Tab
        if (state.activeTabId === tabId) {
          const newActiveTab = state.tabs[Math.min(tabIndex, state.tabs.length - 1)];
          state.activeTabId = newActiveTab?.id || null;
        }
      });
    },

    setActiveTab: (tabId) => {
      set((state) => {
        state.activeTabId = tabId;
      });
    },

    renameTab: (tabId, name) => {
      set((state) => {
        const tab = state.tabs.find((t) => t.id === tabId);
        if (tab) {
          tab.name = name;
        }
      });
    },

    createSession: (connectionId, type, serialPath, host) => {
      const sessionId = crypto.randomUUID();
      set((state) => {
        const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
        if (!activeTab) return;

        state.sessions[sessionId] = {
          id: sessionId,
          name: `${type}-${sessionId.slice(0, 4)}`,
          connectionId,
          connectionType: type,
          connectionState: ConnectionState.CONNECTING,
          cols: 80,
          rows: 24,
          createdAt: new Date(),
          lastActiveAt: new Date(),
          serialPath,
          host,
          logEnabled: false,
        };

        activeTab.sessions.push(sessionId);
        activeTab.activeSessionId = sessionId;
      });
      return sessionId;
    },

    closeSession: (sessionId) => {
      set((state) => {
        const session = state.sessions[sessionId];
        if (session) {
          // 异步关闭连接
          window.qserial.connection.destroy(session.connectionId).catch((err) => {
            console.error('Failed to destroy connection:', err);
          });
          // 同步关闭对应的 SFTP 会话
          useSftpStore.getState().destroySessionByConnection(session.connectionId).catch((err) => {
            console.error('Failed to destroy SFTP session:', err);
          });
        }
        delete state.sessions[sessionId];
        state.tabs.forEach((tab) => {
          const index = tab.sessions.indexOf(sessionId);
          if (index !== -1) {
            tab.sessions.splice(index, 1);
            if (tab.activeSessionId === sessionId) {
              tab.activeSessionId = tab.sessions[0] || null;
            }
          }
        });
      });
    },

    updateSessionState: (sessionId, connectionState) => {
      set((state) => {
        const session = state.sessions[sessionId];
        if (session) {
          session.connectionState = connectionState;
          session.lastActiveAt = new Date();
        }
      });
    },

    updateSessionSize: (sessionId, cols, rows) => {
      set((state) => {
        const session = state.sessions[sessionId];
        if (session) {
          session.cols = cols;
          session.rows = rows;
        }
      });
    },

    splitSession: (sessionId, direction) => {
      const state = get();
      const session = state.sessions[sessionId];
      if (!session) return sessionId;

      // 创建新的 Session (复用相同连接配置)
      const newSessionId = state.createSession(session.connectionId, session.connectionType, session.serialPath, session.host);

      set((s) => {
        const tab = s.tabs.find((t) => t.sessions.includes(sessionId));
        if (tab) {
          tab.splitDirection = direction;
        }
      });

      return newSessionId;
    },

    findTabBySession: (sessionId) => {
      const state = get();
      const tab = state.tabs.find((t) => t.sessions.includes(sessionId));
      return tab?.id || null;
    },

    closeSessionAndTab: (sessionId) => {
      set((state) => {
        const session = state.sessions[sessionId];

        // 找到包含该 session 的 Tab
        const tabIndex = state.tabs.findIndex((t) => t.sessions.includes(sessionId));
        if (tabIndex === -1) return;

        const tab = state.tabs[tabIndex];
        console.log('[closeSessionAndTab]', {
          sessionId: sessionId.slice(0, 8),
          sessionExists: !!session,
          tabIndex,
          tabName: tab?.name?.slice(0, 20),
          tabSessionCount: tab?.sessions?.length,
          currentActiveTabId: (state.activeTabId as string)?.slice(0, 8),
          allTabIds: state.tabs.map(t => t.id.slice(0, 8)),
          allSessionIds: Object.keys(state.sessions).map(s => s.slice(0, 8)),
        });
        if (session) {
          // 异步关闭连接
          window.qserial.connection.destroy(session.connectionId).catch((err) => {
            console.error('Failed to destroy connection:', err);
          });
          // 同步关闭对应的 SFTP 会话
          useSftpStore.getState().destroySessionByConnection(session.connectionId).catch((err) => {
            console.error('Failed to destroy SFTP session:', err);
          });
        }
        delete state.sessions[sessionId];

        // 从 Tab 中移除该 session
        const sessionIndex = tab.sessions.indexOf(sessionId);
        if (sessionIndex !== -1) {
          tab.sessions.splice(sessionIndex, 1);
        }

        // 如果 Tab 没有其他 session 了，关闭整个 Tab
        if (tab.sessions.length === 0) {
          state.tabs.splice(tabIndex, 1);

          // 切换到相邻 Tab
          if (state.activeTabId === tab.id) {
            const newActiveTab = state.tabs[Math.min(tabIndex, state.tabs.length - 1)];
            state.activeTabId = newActiveTab?.id || null;
          }
        } else {
          // 否则切换到该 Tab 的其他 session
          if (tab.activeSessionId === sessionId) {
            tab.activeSessionId = tab.sessions[0] || null;
          }
        }
      });
    },

    startLog: (sessionId, filePath) => {
      set((state) => {
        const session = state.sessions[sessionId];
        if (session) {
          session.logFilePath = filePath;
          session.logEnabled = true;
        }
      });
    },

    stopLog: (sessionId) => {
      set((state) => {
        const session = state.sessions[sessionId];
        if (session) {
          session.logEnabled = false;
        }
      });
    },

    setLogEnabled: (sessionId, enabled) => {
      set((state) => {
        const session = state.sessions[sessionId];
        if (session) {
          session.logEnabled = enabled;
        }
      });
    },
  }))
);
