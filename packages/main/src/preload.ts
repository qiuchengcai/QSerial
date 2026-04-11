/**
 * Preload Script
 * 暴露安全的 API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@qserial/shared';

// 暴露给渲染进程的 API
const api = {
  // 连接管理
  connection: {
    create: (options: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_CREATE, { options }),
    open: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_OPEN, { id }),
    close: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_CLOSE, { id }),
    destroy: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_DESTROY, { id }),
    write: (id: string, data: string) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_WRITE, { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_RESIZE, { id, cols, rows }),

    getState: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_GET_STATE, { id }),

    onData: (id: string, callback: (data: string) => void) => {
      const handler = (_: unknown, event: { id: string; data: string }) => {
        if (event.id === id) {
          callback(event.data);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.CONNECTION_DATA, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.CONNECTION_DATA, handler);
    },

    onStateChange: (id: string, callback: (state: string) => void) => {
      const handler = (_: unknown, event: { id: string; state: string }) => {
        if (event.id === id) callback(event.state);
      };
      ipcRenderer.on(IPC_CHANNELS.CONNECTION_STATE, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.CONNECTION_STATE, handler);
    },

    onError: (id: string, callback: (error: string) => void) => {
      const handler = (_: unknown, event: { id: string; error: string }) => {
        if (event.id === id) callback(event.error);
      };
      ipcRenderer.on(IPC_CHANNELS.CONNECTION_ERROR, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.CONNECTION_ERROR, handler);
    },
  },

  // 串口
  serial: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.SERIAL_LIST),
  },

  // 配置
  config: {
    get: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET, { key }),
    set: (key: string, value: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, { key, value }),
    delete: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_DELETE, { key }),
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_ALL),
  },

  // 窗口
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
    setTitle: (title: string) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_TITLE, { title }),
  },

  // 应用
  app: {
    version: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),
    quit: () => ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT),
  },
};

// 暴露 API
contextBridge.exposeInMainWorld('qserial', api);
