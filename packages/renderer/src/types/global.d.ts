/**
 * 全局类型声明
 */

import type {
  SerialPortInfo,
  ConnectionServerStatus,
  McpServerStatus,
  TftpTransferEvent,
  SftpFileInfo,
  SftpFileStat,
  SftpProgressEvent,
  NfsServerStatus,
  NfsMountHint,
  FtpServerStatus,
  FtpClientInfo,
  FtpClientEvent,
  PluginInfo,
  MarketIndex,
  PluginUpdateInfo,
  PluginDownloadProgress,
} from '@qserial/shared';

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

  nfs: {
    start: (exportDir: string, allowedClients: string, options: string) => Promise<void>;
    stop: () => Promise<void>;
    getStatus: () => Promise<NfsServerStatus>;
    pickDir: () => Promise<string | null>;
    getMountHint: () => Promise<NfsMountHint | null>;
    onStatusChange: (callback: (event: { running: boolean; error?: string }) => void) => () => void;
    onClient: (callback: (event: unknown) => void) => () => void;
  };

  ftp: {
    start: (port: number, rootDir: string, username: string, password: string) => Promise<void>;
    stop: () => Promise<void>;
    getStatus: () => Promise<FtpServerStatus>;
    pickDir: () => Promise<string | null>;
    getClients: () => Promise<FtpClientInfo[]>;
    onStatusChange: (callback: (event: { running: boolean; error?: string }) => void) => () => void;
    onClient: (callback: (event: FtpClientEvent) => void) => () => void;
  };

  log: {
    start: (sessionId: string, filePath: string) => Promise<void>;
    stop: (sessionId: string) => Promise<void>;
    write: (sessionId: string, data: string) => Promise<void>;
    pickFile: (defaultName?: string) => Promise<string | null>;
  };

  // 连接共享服务（通用版）
  connectionServer: {
    start: (options: {
      id: string;
      sourceType: 'existing' | 'new';
      existingConnectionId?: string;
      newConnectionOptions?: unknown;
      localPort: number;
      listenAddress?: string;
      accessPassword?: string;
    }) => Promise<void>;
    stop: (id: string) => Promise<void>;
    getStatus: (id: string) => Promise<ConnectionServerStatus>;
  };

  mcp: {
    start: (
      port: number,
      listenAddress?: string,
      authPassword?: string,
      autoStart?: boolean
    ) => Promise<void>;
    stop: (autoStart?: boolean) => Promise<void>;
    getStatus: () => Promise<McpServerStatus>;
    onStatusChange: (callback: (event: { running: boolean; port: number }) => void) => () => void;
    onConnectionCreated: (
      callback: (event: {
        connectionId: string;
        type: string;
        name: string;
        path?: string;
        host?: string;
        savedSessionId?: string;
      }) => void
    ) => () => void;
    onShareChanged: (
      callback: (event: {
        shareId: string;
        running: boolean;
        sourceId?: string;
        localPort?: number;
        listenAddress?: string;
      }) => void
    ) => () => void;
  };

  // 网络
  getLocalIp: () => Promise<string>;

  // 快捷按钮（MCP 集成：主进程变更通知）
  quickButtons: {
    onChanged: (callback: (groups: unknown[]) => void) => () => void;
  };

  // 文件操作
  readFile: (path: string) => Promise<string>;

  // 插件系统
  plugin: {
    list: () => Promise<PluginInfo[]>;
    setEnabled: (id: string, enabled: boolean) => Promise<PluginInfo[]>;
    install: (sourcePath: string) => Promise<PluginInfo[]>;
    uninstall: (id: string, confirm: boolean) => Promise<PluginInfo[]>;
    rescan: () => Promise<PluginInfo[]>;
    reload: (id: string) => Promise<PluginInfo[]>;
    configGet: (id: string) => Promise<Record<string, unknown>>;
    configSet: (id: string, key: string, value: unknown) => Promise<void>;
    invoke: (pluginId: string, method: string, args?: unknown) => Promise<unknown>;
    onEvent: (
      callback: (event: { pluginId: string; event: string; payload: unknown }) => void
    ) => () => void;
    onChanged: (callback: (plugins: PluginInfo[]) => void) => () => void;
    onConfigChanged: (
      callback: (event: { id: string; config: Record<string, unknown> }) => void
    ) => () => void;
    marketFetch: (sourceUrl?: string) => Promise<MarketIndex>;
    marketInstall: (pluginId: string, sourceUrl?: string) => Promise<PluginInfo[]>;
    marketUpdate: (pluginId: string, sourceUrl?: string) => Promise<PluginInfo[]>;
    marketCheckUpdates: (sourceUrl?: string) => Promise<PluginUpdateInfo[]>;
    onDownloadProgress: (callback: (progress: PluginDownloadProgress) => void) => () => void;
  };

  // SFTP 文件传输
  dialog: {
    pickDir: (title: string) => Promise<string | null>;
  };

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
