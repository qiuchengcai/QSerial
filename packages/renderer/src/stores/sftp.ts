/**
 * SFTP 状态管理
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { SftpFileInfo, SftpProgressEvent } from '@qserial/shared';

interface SftpSession {
  sftpId: string;
  connectionId: string;
  currentPath: string;
  homePath: string;
  files: SftpFileInfo[];
  loading: boolean;
  error: string | null;
  selectedFiles: string[];
  history: string[];
  historyIndex: number;
}

interface TransferTask {
  id: string;
  sftpId: string;
  operation: 'upload' | 'download';
  localPath: string;
  remotePath: string;
  total: number;
  transferred: number;
  percent: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
}

interface SftpState {
  // SFTP 会话
  sessions: Record<string, SftpSession>;
  activeSftpId: string | null;

  // 传输任务
  transfers: TransferTask[];

  // 面板可见性
  panelVisible: boolean;
  panelWidth: number;

  // 操作方法
  createSession: (connectionId: string) => Promise<string>;
  destroySession: (sftpId: string) => Promise<void>;
  destroySessionByConnection: (connectionId: string) => Promise<void>;
  setActiveSession: (sftpId: string) => void;
  navigateTo: (sftpId: string, path: string) => Promise<void>;
  refresh: (sftpId: string) => Promise<void>;
  goBack: (sftpId: string) => Promise<void>;
  goForward: (sftpId: string) => Promise<void>;
  selectFile: (sftpId: string, fileName: string, multi?: boolean) => void;
  clearSelection: (sftpId: string) => void;

  // 传输操作
  downloadFile: (sftpId: string, remotePath: string, localPath: string) => Promise<void>;
  uploadFile: (sftpId: string, localPath: string, remotePath: string) => Promise<void>;
  updateProgress: (event: SftpProgressEvent) => void;

  // 面板控制
  setPanelVisible: (visible: boolean) => void;
  setPanelWidth: (width: number) => void;
}

export const useSftpStore = create<SftpState>()(
  immer((set, get) => ({
    sessions: {},
    activeSftpId: null,
    transfers: [],
    panelVisible: false,
    panelWidth: 280,

    createSession: async (connectionId) => {
      const result = await window.qserial.sftp.create(connectionId);
      const sftpId = result.sftpId;

      // 用 realpath 解析当前工作目录获取 home 目录
      // SFTP 连接后默认工作目录就是用户 home 目录
      let homePath = '/';
      try {
        homePath = await window.qserial.sftp.realpath(sftpId, '.');
      } catch {
        try {
          // 某些服务器不支持 '.' ，尝试 '~'
          homePath = await window.qserial.sftp.realpath(sftpId, '~');
        } catch {
          // 都失败则回退到 /
        }
      }

      set((state) => {
        state.sessions[sftpId] = {
          sftpId,
          connectionId,
          currentPath: homePath,
          homePath,
          files: [],
          loading: false,
          error: null,
          selectedFiles: [],
          history: [homePath],
          historyIndex: 0,
        };
        state.activeSftpId = sftpId;
        state.panelVisible = true;
      });

      // 加载 home 目录
      await get().navigateTo(sftpId, homePath);

      return sftpId;
    },

    destroySession: async (sftpId) => {
      await window.qserial.sftp.destroy(sftpId);
      set((state) => {
        delete state.sessions[sftpId];
        if (state.activeSftpId === sftpId) {
          const remaining = Object.keys(state.sessions);
          state.activeSftpId = remaining.length > 0 ? remaining[0] : null;
          if (remaining.length === 0) {
            state.panelVisible = false;
          }
        }
      });
    },

    destroySessionByConnection: async (connectionId) => {
      const state = get();
      const matchingSessions = Object.values(state.sessions).filter(
        (s) => s.connectionId === connectionId
      );
      for (const session of matchingSessions) {
        await get().destroySession(session.sftpId);
      }
    },

    setActiveSession: (sftpId) => {
      set((state) => {
        state.activeSftpId = sftpId;
      });
    },

    navigateTo: async (sftpId, path) => {
      const session = get().sessions[sftpId];
      if (!session) return;

      set((state) => {
        if (state.sessions[sftpId]) {
          state.sessions[sftpId].loading = true;
          state.sessions[sftpId].error = null;
        }
      });

      try {
        const files = await window.qserial.sftp.list(sftpId, path);

        set((state) => {
          if (state.sessions[sftpId]) {
            state.sessions[sftpId].currentPath = path;
            state.sessions[sftpId].files = files;
            state.sessions[sftpId].loading = false;
            state.sessions[sftpId].selectedFiles = [];

            // 更新历史记录
            const history = state.sessions[sftpId].history;
            const newIndex = state.sessions[sftpId].historyIndex + 1;
            // 裁剪历史记录，保留最近 100 条
            const sliced = history.slice(0, newIndex);
            state.sessions[sftpId].history = [...sliced.slice(-99), path];
            state.sessions[sftpId].historyIndex = newIndex;
          }
        });
      } catch (error) {
        set((state) => {
          if (state.sessions[sftpId]) {
            state.sessions[sftpId].loading = false;
            state.sessions[sftpId].error = (error as Error).message;
          }
        });
      }
    },

    refresh: async (sftpId) => {
      const session = get().sessions[sftpId];
      if (!session) return;
      await get().navigateTo(sftpId, session.currentPath);
    },

    goBack: async (sftpId) => {
      const session = get().sessions[sftpId];
      if (!session || session.historyIndex <= 0) return;

      const newIndex = session.historyIndex - 1;
      const path = session.history[newIndex];

      set((state) => {
        if (state.sessions[sftpId]) {
          state.sessions[sftpId].historyIndex = newIndex;
        }
      });

      await get().navigateTo(sftpId, path);
    },

    goForward: async (sftpId) => {
      const session = get().sessions[sftpId];
      if (!session || session.historyIndex >= session.history.length - 1) return;

      const newIndex = session.historyIndex + 1;
      const path = session.history[newIndex];

      set((state) => {
        if (state.sessions[sftpId]) {
          state.sessions[sftpId].historyIndex = newIndex;
        }
      });

      await get().navigateTo(sftpId, path);
    },

    selectFile: (sftpId, fileName, multi = false) => {
      set((state) => {
        const session = state.sessions[sftpId];
        if (!session) return;

        if (multi) {
          const index = session.selectedFiles.indexOf(fileName);
          if (index >= 0) {
            session.selectedFiles.splice(index, 1);
          } else {
            session.selectedFiles.push(fileName);
          }
        } else {
          session.selectedFiles = [fileName];
        }
      });
    },

    clearSelection: (sftpId) => {
      set((state) => {
        const session = state.sessions[sftpId];
        if (session) {
          session.selectedFiles = [];
        }
      });
    },

    downloadFile: async (sftpId, remotePath, localPath) => {
      const taskId = crypto.randomUUID();

      set((state) => {
        state.transfers.push({
          id: taskId,
          sftpId,
          operation: 'download',
          localPath,
          remotePath,
          total: 0,
          transferred: 0,
          percent: 0,
          status: 'running',
        });
        state.transfers = state.transfers.slice(-50);
      });

      try {
        await window.qserial.sftp.download(sftpId, remotePath, localPath);
        set((state) => {
          const task = state.transfers.find((t) => t.id === taskId);
          if (task) {
            task.status = 'completed';
            task.percent = 100;
          }
        });
      } catch (error) {
        set((state) => {
          const task = state.transfers.find((t) => t.id === taskId);
          if (task) {
            task.status = 'error';
            task.error = (error as Error).message;
          }
        });
      }
    },

    uploadFile: async (sftpId, localPath, remotePath) => {
      const taskId = crypto.randomUUID();

      set((state) => {
        state.transfers.push({
          id: taskId,
          sftpId,
          operation: 'upload',
          localPath,
          remotePath,
          total: 0,
          transferred: 0,
          percent: 0,
          status: 'running',
        });
        state.transfers = state.transfers.slice(-50);
      });

      try {
        await window.qserial.sftp.upload(sftpId, localPath, remotePath);
        set((state) => {
          const task = state.transfers.find((t) => t.id === taskId);
          if (task) {
            task.status = 'completed';
            task.percent = 100;
          }
        });
        // 刷新目录
        await get().refresh(sftpId);
      } catch (error) {
        set((state) => {
          const task = state.transfers.find((t) => t.id === taskId);
          if (task) {
            task.status = 'error';
            task.error = (error as Error).message;
          }
        });
      }
    },

    updateProgress: (event) => {
      set((state) => {
        const task = state.transfers.find(
          (t) =>
            t.sftpId === event.sftpId &&
            t.remotePath === event.remotePath &&
            t.status === 'running'
        );
        if (task) {
          task.total = event.total;
          task.transferred = event.transferred;
          task.percent = event.percent;
        }
      });
    },

    setPanelVisible: (visible) => {
      set((state) => {
        state.panelVisible = visible;
      });
    },

    setPanelWidth: (width) => {
      set((state) => {
        state.panelWidth = Math.max(200, Math.min(500, width));
      });
    },
  }))
);
