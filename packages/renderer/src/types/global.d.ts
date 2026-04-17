/**
 * 全局类型声明
 */

import type { SerialPortInfo, SerialServerStatus, TftpTransferEvent, SftpFileInfo, SftpFileStat, SftpProgressEvent } from '@qserial/shared';

interface QSerialAPI {
  connection: {
    create: (options: unknown) => Promise<{ id: string }>;
    open: (id: string) => Promise<void>;
    close: (id: string) => Promise<void>;
    destroy: (id: string) => Promise<void>;
    write: (id: string, data: string) => Promise<void>;
    resize: (id: string, cols: number, rows: number) => Promise<void>;
    getState: (id: string) => Promise<{ state: string }>;
    onData: (id: string, callback: (data: string) => void) => () => void;
    onStateChange: (id: string, callback: (state: string) => void) => () => void;
    onError: (id: string, callback: (error: string) => void) => () => void;
  };

  serial: {
    list: () => Promise<SerialPortInfo[]>;
  };

  config: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
    getAll: () => Promise<Record<string, unknown>>;
  };

  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    setTitle: (title: string) => Promise<void>;
  };

  app: {
    version: () => Promise<string>;
    quit: () => Promise<void>;
  };

  tftp: {
    start: (port: number, rootDir: string) => Promise<void>;
    stop: () => Promise<void>;
    getStatus: () => Promise<{ running: boolean; port: number; rootDir: string }>;
    pickDir: () => Promise<string | null>;
    onStatusChange: (callback: (event: { running: boolean; error?: string }) => void) => () => void;
    onTransfer: (callback: (event: TftpTransferEvent) => void) => () => void;
  };

  log: {
    start: (sessionId: string, filePath: string) => Promise<void>;
    stop: (sessionId: string) => Promise<void>;
    write: (sessionId: string, data: string) => Promise<void>;
    pickFile: (defaultName?: string) => Promise<string | null>;
  };

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
    }) => Promise<void>;
    stop: (id: string) => Promise<void>;
    getStatus: (id: string) => Promise<SerialServerStatus>;
  };

  onDebugLog: (callback: (event: { message: string; timestamp: number }) => void) => () => void;

  // 网络
  getLocalIp: () => Promise<string>;

  // 文件操作
  readFile: (path: string) => Promise<string>;

  // SFTP 文件传输
  sftp: {
    create: (connectionId: string) => Promise<{ sftpId: string }>;
    destroy: (sftpId: string) => Promise<void>;
    list: (sftpId: string, path: string) => Promise<SftpFileInfo[]>;
    download: (sftpId: string, remotePath: string, localPath: string) => Promise<void>;
    upload: (sftpId: string, localPath: string, remotePath: string) => Promise<void>;
    mkdir: (sftpId: string, path: string) => Promise<void>;
    rmdir: (sftpId: string, path: string) => Promise<void>;
    rm: (sftpId: string, path: string) => Promise<void>;
    rename: (sftpId: string, oldPath: string, newPath: string) => Promise<void>;
    stat: (sftpId: string, path: string) => Promise<SftpFileStat>;
    readlink: (sftpId: string, path: string) => Promise<string>;
    symlink: (sftpId: string, target: string, path: string) => Promise<void>;
    pickLocalFile: () => Promise<string | null>;
    pickLocalDir: () => Promise<string | null>;
    realpath: (sftpId: string, path: string) => Promise<string>;
    onProgress: (callback: (event: SftpProgressEvent) => void) => () => void;
  };
}

declare global {
  interface Window {
    qserial: QSerialAPI;
  }
}

export {};
