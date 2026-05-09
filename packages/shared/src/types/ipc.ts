/**
 * IPC 类型定义
 */

import type { ConnectionOptions, SerialPortInfo } from './connection.js';

/**
 * IPC 通道名称
 */
export const IPC_CHANNELS = {
  // 连接管理
  CONNECTION_CREATE: 'connection:create',
  CONNECTION_OPEN: 'connection:open',
  CONNECTION_CLOSE: 'connection:close',
  CONNECTION_DESTROY: 'connection:destroy',
  CONNECTION_WRITE: 'connection:write',
  CONNECTION_RESIZE: 'connection:resize',
  CONNECTION_DATA: 'connection:data',
  CONNECTION_STATE: 'connection:state',
  CONNECTION_ERROR: 'connection:error',
  CONNECTION_GET_STATE: 'connection:get-state',

  // 串口特有
  SERIAL_LIST: 'serial:list',

  // 配置管理
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_DELETE: 'config:delete',
  CONFIG_GET_ALL: 'config:getAll',

  // 会话管理
  SESSION_SAVE: 'session:save',
  SESSION_LOAD: 'session:load',
  SESSION_LIST: 'session:list',
  SESSION_DELETE: 'session:delete',

  // 窗口管理
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_SET_TITLE: 'window:set-title',

  // 应用信息
  APP_VERSION: 'app:version',
  APP_QUIT: 'app:quit',

  // TFTP 服务器
  TFTP_START: 'tftp:start',
  TFTP_STOP: 'tftp:stop',
  TFTP_GET_STATUS: 'tftp:getStatus',
  TFTP_PICK_DIR: 'tftp:pickDir',
  TFTP_STATUS_EVENT: 'tftp:statusEvent',
  TFTP_TRANSFER_EVENT: 'tftp:transferEvent',

  // NFS 服务器
  NFS_START: 'nfs:start',
  NFS_STOP: 'nfs:stop',
  NFS_GET_STATUS: 'nfs:getStatus',
  NFS_PICK_DIR: 'nfs:pickDir',
  NFS_STATUS_EVENT: 'nfs:statusEvent',
  NFS_CLIENT_EVENT: 'nfs:clientEvent',
  NFS_GET_MOUNT_HINT: 'nfs:getMountHint',

  // FTP 服务器
  FTP_START: 'ftp:start',
  FTP_STOP: 'ftp:stop',
  FTP_GET_STATUS: 'ftp:getStatus',
  FTP_PICK_DIR: 'ftp:pickDir',
  FTP_STATUS_EVENT: 'ftp:statusEvent',
  FTP_TRANSFER_EVENT: 'ftp:transferEvent',
  FTP_GET_CLIENTS: 'ftp:getClients',
  FTP_CLIENT_EVENT: 'ftp:clientEvent',

  // 日志保存
  LOG_START: 'log:start',
  LOG_STOP: 'log:stop',
  LOG_WRITE: 'log:write',
  LOG_PICK_FILE: 'log:pickFile',

  // 连接共享服务
  SERIAL_SERVER_START: 'serialServer:start',
  SERIAL_SERVER_STOP: 'serialServer:stop',
  SERIAL_SERVER_STATUS: 'serialServer:status',
  CONNECTION_SERVER_START: 'connectionServer:start',
  CONNECTION_SERVER_STOP: 'connectionServer:stop',
  CONNECTION_SERVER_STATUS: 'connectionServer:status',

  // 调试日志
  DEBUG_LOG: 'debug:log',

  // 网络
  GET_LOCAL_IP: 'network:getLocalIp',

  // 文件操作
  READ_FILE: 'file:read',

  // 通用对话框
  DIALOG_PICK_DIR: 'dialog:pickDir',

  // SFTP 文件传输
  SFTP_CREATE: 'sftp:create',
  SFTP_DESTROY: 'sftp:destroy',
  SFTP_LIST: 'sftp:list',
  SFTP_DOWNLOAD: 'sftp:download',
  SFTP_UPLOAD: 'sftp:upload',
  SFTP_MKDIR: 'sftp:mkdir',
  SFTP_RMDIR: 'sftp:rmdir',
  SFTP_RM: 'sftp:rm',
  SFTP_RENAME: 'sftp:rename',
  SFTP_STAT: 'sftp:stat',
  SFTP_READLINK: 'sftp:readlink',
  SFTP_SYMLINK: 'sftp:symlink',
  SFTP_PICK_LOCAL: 'sftp:pickLocal',
  SFTP_PICK_LOCAL_DIR: 'sftp:pickLocalDir',
  SFTP_PROGRESS_EVENT: 'sftp:progressEvent',
  SFTP_REALPATH: 'sftp:realpath',
} as const;

/**
 * IPC 请求参数映射
 */
export interface IpcRequestMap {
  [IPC_CHANNELS.CONNECTION_CREATE]: { options: ConnectionOptions };
  [IPC_CHANNELS.CONNECTION_OPEN]: { id: string };
  [IPC_CHANNELS.CONNECTION_CLOSE]: { id: string };
  [IPC_CHANNELS.CONNECTION_DESTROY]: { id: string };
  [IPC_CHANNELS.CONNECTION_WRITE]: { id: string; data: string };
  [IPC_CHANNELS.CONNECTION_RESIZE]: { id: string; cols: number; rows: number };
  [IPC_CHANNELS.CONNECTION_GET_STATE]: { id: string };
  [IPC_CHANNELS.SERIAL_LIST]: void;
  [IPC_CHANNELS.CONFIG_GET]: { key: string };
  [IPC_CHANNELS.CONFIG_SET]: { key: string; value: unknown };
  [IPC_CHANNELS.CONFIG_DELETE]: { key: string };
  [IPC_CHANNELS.CONFIG_GET_ALL]: void;
  [IPC_CHANNELS.SESSION_LIST]: void;
  [IPC_CHANNELS.SESSION_DELETE]: { id: string };
  [IPC_CHANNELS.WINDOW_SET_TITLE]: { title: string };
  [IPC_CHANNELS.TFTP_START]: { port: number; rootDir: string };
  [IPC_CHANNELS.TFTP_STOP]: void;
  [IPC_CHANNELS.TFTP_GET_STATUS]: void;
  [IPC_CHANNELS.TFTP_PICK_DIR]: void;
  [IPC_CHANNELS.NFS_START]: { exportDir: string; allowedClients: string; options: string };
  [IPC_CHANNELS.NFS_STOP]: void;
  [IPC_CHANNELS.NFS_GET_STATUS]: void;
  [IPC_CHANNELS.NFS_PICK_DIR]: void;
  [IPC_CHANNELS.NFS_GET_MOUNT_HINT]: void;
  [IPC_CHANNELS.FTP_START]: { port: number; rootDir: string; username: string; password: string };
  [IPC_CHANNELS.FTP_STOP]: void;
  [IPC_CHANNELS.FTP_GET_STATUS]: void;
  [IPC_CHANNELS.FTP_PICK_DIR]: void;
  [IPC_CHANNELS.FTP_GET_CLIENTS]: void;
  [IPC_CHANNELS.LOG_START]: { sessionId: string; filePath: string };
  [IPC_CHANNELS.LOG_STOP]: { sessionId: string };
  [IPC_CHANNELS.LOG_WRITE]: { sessionId: string; data: string };
  [IPC_CHANNELS.LOG_PICK_FILE]: { defaultName?: string };
  [IPC_CHANNELS.SERIAL_SERVER_START]: {
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
  };
  [IPC_CHANNELS.SERIAL_SERVER_STOP]: { id: string };
  [IPC_CHANNELS.SERIAL_SERVER_STATUS]: { id: string };
  [IPC_CHANNELS.CONNECTION_SERVER_START]: {
    id: string;
    sourceType: 'existing' | 'new';
    existingConnectionId?: string;
    newConnectionOptions?: ConnectionOptions;
    // 串口参数（兼容旧配置）
    serialPath?: string;
    baudRate?: number;
    dataBits?: 5 | 6 | 7 | 8;
    stopBits?: 1 | 1.5 | 2;
    parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
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
  };
  [IPC_CHANNELS.CONNECTION_SERVER_STOP]: { id: string };
  [IPC_CHANNELS.CONNECTION_SERVER_STATUS]: { id: string };
  [IPC_CHANNELS.GET_LOCAL_IP]: void;
  [IPC_CHANNELS.READ_FILE]: { path: string };
  [IPC_CHANNELS.DIALOG_PICK_DIR]: { title: string };
  [IPC_CHANNELS.SFTP_CREATE]: { connectionId: string };
  [IPC_CHANNELS.SFTP_DESTROY]: { sftpId: string };
  [IPC_CHANNELS.SFTP_LIST]: { sftpId: string; path: string };
  [IPC_CHANNELS.SFTP_DOWNLOAD]: { sftpId: string; remotePath: string; localPath: string };
  [IPC_CHANNELS.SFTP_UPLOAD]: { sftpId: string; localPath: string; remotePath: string };
  [IPC_CHANNELS.SFTP_MKDIR]: { sftpId: string; path: string };
  [IPC_CHANNELS.SFTP_RMDIR]: { sftpId: string; path: string };
  [IPC_CHANNELS.SFTP_RM]: { sftpId: string; path: string };
  [IPC_CHANNELS.SFTP_RENAME]: { sftpId: string; oldPath: string; newPath: string };
  [IPC_CHANNELS.SFTP_STAT]: { sftpId: string; path: string };
  [IPC_CHANNELS.SFTP_READLINK]: { sftpId: string; path: string };
  [IPC_CHANNELS.SFTP_SYMLINK]: { sftpId: string; target: string; path: string };
  [IPC_CHANNELS.SFTP_PICK_LOCAL]: void;
  [IPC_CHANNELS.SFTP_PICK_LOCAL_DIR]: void;
  [IPC_CHANNELS.SFTP_REALPATH]: { sftpId: string; path: string };
}

/**
 * IPC 响应数据映射
 */
export interface IpcResponseMap {
  [IPC_CHANNELS.CONNECTION_CREATE]: { id: string };
  [IPC_CHANNELS.CONNECTION_OPEN]: void;
  [IPC_CHANNELS.CONNECTION_CLOSE]: void;
  [IPC_CHANNELS.CONNECTION_DESTROY]: void;
  [IPC_CHANNELS.CONNECTION_WRITE]: void;
  [IPC_CHANNELS.CONNECTION_RESIZE]: void;
  [IPC_CHANNELS.CONNECTION_GET_STATE]: { state: string };
  [IPC_CHANNELS.SERIAL_LIST]: SerialPortInfo[];
  [IPC_CHANNELS.CONFIG_GET]: unknown;
  [IPC_CHANNELS.CONFIG_SET]: void;
  [IPC_CHANNELS.CONFIG_DELETE]: void;
  [IPC_CHANNELS.CONFIG_GET_ALL]: Record<string, unknown>;
  [IPC_CHANNELS.SESSION_LIST]: SessionInfo[];
  [IPC_CHANNELS.SESSION_DELETE]: void;
  [IPC_CHANNELS.WINDOW_SET_TITLE]: void;
  [IPC_CHANNELS.APP_VERSION]: string;
  [IPC_CHANNELS.TFTP_START]: void;
  [IPC_CHANNELS.TFTP_STOP]: void;
  [IPC_CHANNELS.TFTP_GET_STATUS]: TftpServerStatus;
  [IPC_CHANNELS.TFTP_PICK_DIR]: string | null;
  [IPC_CHANNELS.NFS_START]: void;
  [IPC_CHANNELS.NFS_STOP]: void;
  [IPC_CHANNELS.NFS_GET_STATUS]: NfsServerStatus;
  [IPC_CHANNELS.NFS_PICK_DIR]: string | null;
  [IPC_CHANNELS.NFS_GET_MOUNT_HINT]: NfsMountHint | null;
  [IPC_CHANNELS.FTP_START]: void;
  [IPC_CHANNELS.FTP_STOP]: void;
  [IPC_CHANNELS.FTP_GET_STATUS]: FtpServerStatus;
  [IPC_CHANNELS.FTP_PICK_DIR]: string | null;
  [IPC_CHANNELS.FTP_GET_CLIENTS]: FtpClientInfo[];
  [IPC_CHANNELS.LOG_START]: void;
  [IPC_CHANNELS.LOG_STOP]: void;
  [IPC_CHANNELS.LOG_WRITE]: void;
  [IPC_CHANNELS.LOG_PICK_FILE]: string | null;
  [IPC_CHANNELS.SERIAL_SERVER_START]: void;
  [IPC_CHANNELS.SERIAL_SERVER_STOP]: void;
  [IPC_CHANNELS.SERIAL_SERVER_STATUS]: SerialServerStatus;
  [IPC_CHANNELS.CONNECTION_SERVER_START]: void;
  [IPC_CHANNELS.CONNECTION_SERVER_STOP]: void;
  [IPC_CHANNELS.CONNECTION_SERVER_STATUS]: ConnectionServerStatus;
  [IPC_CHANNELS.GET_LOCAL_IP]: string;
  [IPC_CHANNELS.READ_FILE]: string;
  [IPC_CHANNELS.DIALOG_PICK_DIR]: string | null;
  [IPC_CHANNELS.SFTP_CREATE]: { sftpId: string };
  [IPC_CHANNELS.SFTP_DESTROY]: void;
  [IPC_CHANNELS.SFTP_LIST]: SftpFileInfo[];
  [IPC_CHANNELS.SFTP_DOWNLOAD]: void;
  [IPC_CHANNELS.SFTP_UPLOAD]: void;
  [IPC_CHANNELS.SFTP_MKDIR]: void;
  [IPC_CHANNELS.SFTP_RMDIR]: void;
  [IPC_CHANNELS.SFTP_RM]: void;
  [IPC_CHANNELS.SFTP_RENAME]: void;
  [IPC_CHANNELS.SFTP_STAT]: SftpFileStat;
  [IPC_CHANNELS.SFTP_READLINK]: string;
  [IPC_CHANNELS.SFTP_SYMLINK]: void;
  [IPC_CHANNELS.SFTP_PICK_LOCAL]: string | null;
  [IPC_CHANNELS.SFTP_PICK_LOCAL_DIR]: string | null;
  [IPC_CHANNELS.SFTP_REALPATH]: string;
}

/**
 * 会话信息
 */
export interface SessionInfo {
  id: string;
  name: string;
  type: string;
  options: ConnectionOptions;
  createdAt: string;
  updatedAt: string;
}

/**
 * 连接数据事件
 */
export interface ConnectionDataEvent {
  id: string;
  data: string; // base64 encoded
}

/**
 * 连接状态事件
 */
export interface ConnectionStateEvent {
  id: string;
  state: string;
}

/**
 * 连接错误事件
 */
export interface ConnectionErrorEvent {
  id: string;
  error: string;
}

/**
 * TFTP 服务器状态
 */
export interface TftpServerStatus {
  running: boolean;
  port: number;
  rootDir: string;
}

/**
 * TFTP 状态事件
 */
export interface TftpStatusEvent {
  running: boolean;
  error?: string;
}

/**
 * TFTP 传输方向
 */
export type TftpTransferDirection = 'download' | 'upload';

/**
 * TFTP 传输状态
 */
export type TftpTransferStatus = 'started' | 'progress' | 'completed' | 'error' | 'aborted';

/**
 * TFTP 传输事件
 */
export interface TftpTransferEvent {
  id: string;
  file: string;
  direction: TftpTransferDirection;
  status: TftpTransferStatus;
  remoteAddress: string;
  fileSize?: number;
  transferred?: number;
  percent?: number;
  error?: string;
}

/**
 * NFS 服务器状态
 */
export interface NfsServerStatus {
  running: boolean;
  exportDir: string;
  allowedClients: string;
  options: string;
}

/**
 * NFS 状态事件
 */
export interface NfsStatusEvent {
  running: boolean;
  error?: string;
}

/**
 * NFS 客户端事件
 */
export interface NfsClientEvent {
  address: string;
  port?: number;
  mountedPath?: string;
  action: 'connected' | 'disconnected';
}

/**
 * NFS 挂载提示
 */
export interface NfsMountHint {
  localIp: string;
  exportDir: string;
  mountCmd: string;
}

/**
 * FTP 服务器状态
 */
export interface FtpServerStatus {
  running: boolean;
  port: number;
  rootDir: string;
  username: string;
  hasPassword: boolean;
}

/**
 * FTP 状态事件
 */
export interface FtpStatusEvent {
  running: boolean;
  error?: string;
}

/**
 * FTP 传输方向
 */
export type FtpTransferDirection = 'download' | 'upload';

/**
 * FTP 传输状态
 */
export type FtpTransferStatus = 'started' | 'progress' | 'completed' | 'error';

/**
 * FTP 传输事件
 */
export interface FtpTransferEvent {
  id: string;
  file: string;
  direction: FtpTransferDirection;
  status: FtpTransferStatus;
  remoteAddress: string;
  fileSize?: number;
  transferred?: number;
  percent?: number;
  error?: string;
}

/**
 * FTP 客户端信息
 */
export interface FtpClientInfo {
  address: string;
  port?: number;
  userName?: string;
}

/**
 * FTP 客户端事件
 */
export interface FtpClientEvent {
  address: string;
  port?: number;
  userName?: string;
  action: 'connected' | 'disconnected';
}

/**
 * 串口服务端状态
 * @deprecated 使用 ConnectionServerStatus 替代
 */
export interface SerialServerStatus {
  running: boolean;
  serialPath: string;
  localPort: number;
  listenAddress: string;
  clientCount: number;
  clients: string[];
  sshTunnelConnected: boolean;
  hasPassword: boolean;
}

/**
 * 连接共享服务端状态
 */
export interface ConnectionServerStatus {
  running: boolean;
  sourceType: 'existing' | 'new';
  sourceDescription: string; // 数据源描述（如串口路径、SSH地址等）
  localPort: number;
  listenAddress: string;
  clientCount: number;
  clients: string[];
  sshTunnelConnected: boolean;
  hasPassword: boolean;
}

/**
 * SFTP 文件信息
 */
export interface SftpFileInfo {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size: number;
  modifyTime: number;
  accessTime: number;
  rights?: {
    user?: string;
    group?: string;
    other?: string;
  };
  owner?: number;
  group?: number;
  target?: string; // 符号链接目标
}

/**
 * SFTP 文件状态
 */
export interface SftpFileStat {
  size: number;
  mode: number;
  modifyTime: number;
  accessTime: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
}

/**
 * SFTP 传输进度事件
 */
export interface SftpProgressEvent {
  sftpId: string;
  operation: 'download' | 'upload';
  localPath: string;
  remotePath: string;
  total: number;
  transferred: number;
  percent: number;
}
