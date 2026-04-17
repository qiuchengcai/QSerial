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

  // TFTP 服务器
  tftp: {
    start: (port: number, rootDir: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TFTP_START, { port, rootDir }),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.TFTP_STOP),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.TFTP_GET_STATUS),
    pickDir: () => ipcRenderer.invoke(IPC_CHANNELS.TFTP_PICK_DIR),
    onStatusChange: (callback: (event: { running: boolean; error?: string }) => void) => {
      const handler = (_: unknown, event: { running: boolean; error?: string }) => callback(event);
      ipcRenderer.on(IPC_CHANNELS.TFTP_STATUS_EVENT, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.TFTP_STATUS_EVENT, handler);
    },
    onTransfer: (callback: (event: unknown) => void) => {
      const handler = (_: unknown, event: unknown) => callback(event);
      ipcRenderer.on(IPC_CHANNELS.TFTP_TRANSFER_EVENT, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.TFTP_TRANSFER_EVENT, handler);
    },
  },

  // 日志保存
  log: {
    start: (sessionId: string, filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOG_START, { sessionId, filePath }),
    stop: (sessionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOG_STOP, { sessionId }),
    write: (sessionId: string, data: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOG_WRITE, { sessionId, data }),
    pickFile: (defaultName?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOG_PICK_FILE, { defaultName }),
  },

  // 串口共享服务
  serialServer: {
    start: (options: {
      id: string;
      serialPath: string;
      baudRate: number;
      dataBits: 5 | 6 | 7 | 8;
      stopBits: 1 | 1.5 | 2;
      parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
      localPort: number;
      listenAddress?: string;
      accessPassword?: string;
      sshTunnel?: {
        host: string;
        port: number;
        username: string;
        remotePort: number;
        password?: string; // 可选，留空使用 ~/.ssh 下的默认密钥
      };
    }) => {
      return ipcRenderer.invoke(IPC_CHANNELS.SERIAL_SERVER_START, options);
    },
    stop: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SERIAL_SERVER_STOP, { id }),
    getStatus: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SERIAL_SERVER_STATUS, { id }),
  },

  // 连接共享服务（通用版，支持任意连接类型）
  connectionServer: {
    start: (options: {
      id: string;
      sourceType: 'existing' | 'new';
      existingConnectionId?: string;
      newConnectionOptions?: unknown;
      localPort: number;
      listenAddress?: string;
      accessPassword?: string;
      sshTunnel?: {
        host: string;
        port: number;
        username: string;
        remotePort: number;
        password?: string;
      };
    }) => {
      return ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_SERVER_START, options);
    },
    stop: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_SERVER_STOP, { id }),
    getStatus: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_SERVER_STATUS, { id }),
  },

  // 调试日志
  onDebugLog: (callback: (event: { message: string; timestamp: number }) => void) => {
    const handler = (_: unknown, event: { message: string; timestamp: number }) => {
      callback(event);
    };
    ipcRenderer.on(IPC_CHANNELS.DEBUG_LOG, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.DEBUG_LOG, handler);
  },

  // 网络
  getLocalIp: () => ipcRenderer.invoke(IPC_CHANNELS.GET_LOCAL_IP),

  // 文件操作
  readFile: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.READ_FILE, { path }),

  // SFTP 文件传输
  sftp: {
    create: (connectionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_CREATE, { connectionId }),
    destroy: (sftpId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_DESTROY, { sftpId }),
    list: (sftpId: string, path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_LIST, { sftpId, path }),
    download: (sftpId: string, remotePath: string, localPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_DOWNLOAD, { sftpId, remotePath, localPath }),
    upload: (sftpId: string, localPath: string, remotePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_UPLOAD, { sftpId, localPath, remotePath }),
    mkdir: (sftpId: string, path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_MKDIR, { sftpId, path }),
    rmdir: (sftpId: string, path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_RMDIR, { sftpId, path }),
    rm: (sftpId: string, path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_RM, { sftpId, path }),
    rename: (sftpId: string, oldPath: string, newPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_RENAME, { sftpId, oldPath, newPath }),
    stat: (sftpId: string, path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_STAT, { sftpId, path }),
    readlink: (sftpId: string, path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_READLINK, { sftpId, path }),
    symlink: (sftpId: string, target: string, path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_SYMLINK, { sftpId, target, path }),
    pickLocalFile: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_PICK_LOCAL),
    pickLocalDir: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_PICK_LOCAL_DIR),
    realpath: (sftpId: string, path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_REALPATH, { sftpId, path }),
    onProgress: (callback: (event: unknown) => void) => {
      const handler = (_: unknown, event: unknown) => callback(event);
      ipcRenderer.on(IPC_CHANNELS.SFTP_PROGRESS_EVENT, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.SFTP_PROGRESS_EVENT, handler);
    },
  },
};

// 暴露 API
contextBridge.exposeInMainWorld('qserial', api);
