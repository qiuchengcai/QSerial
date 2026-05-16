/**
 * 连接类型定义
 */

/**
 * 连接类型枚举
 */
export enum ConnectionType {
  PTY = 'pty',
  SERIAL = 'serial',
  SSH = 'ssh',
  TELNET = 'telnet',
  SERIAL_SERVER = 'serial_server', // @deprecated 使用 CONNECTION_SERVER
  CONNECTION_SERVER = 'connection_server', // 连接共享服务端（TCP共享任意连接）
}

/**
 * 连接状态枚举
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

/**
 * 基础连接选项
 */
export interface BaseConnectionOptions {
  id: string;
  name: string;
  type: ConnectionType;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  reconnectAttempts?: number;
}

/**
 * PTY 连接选项
 */
export interface PtyConnectionOptions extends BaseConnectionOptions {
  type: ConnectionType.PTY;
  shell: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

/**
 * 串口连接选项
 */
export interface SerialConnectionOptions extends BaseConnectionOptions {
  type: ConnectionType.SERIAL;
  path: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
  flowControl?: 'none' | 'hardware' | 'software';
  encoding?: string;
}

/**
 * SSH 连接选项
 */
export interface SshConnectionOptions extends BaseConnectionOptions {
  type: ConnectionType.SSH;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  keepaliveInterval?: number;
  /** 是否验证 SSH 主机密钥，默认 true */
  verifyHostKey?: boolean;
}

/**
 * Telnet 连接选项
 */
export interface TelnetConnectionOptions extends BaseConnectionOptions {
  type: ConnectionType.TELNET;
  host: string;
  port: number;
  timeout?: number;
}

/**
 * 串口服务端选项（TCP共享串口）
 * @deprecated 使用 ConnectionServerOptions 替代
 */
export interface SerialServerOptions extends BaseConnectionOptions {
  type: ConnectionType.SERIAL_SERVER;
  serialPath: string; // 串口路径
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
  localPort: number; // 本地TCP监听端口
  listenAddress?: string; // 本地TCP监听地址，默认 '0.0.0.0'
  accessPassword?: string; // 访问密码，为空则无需认证
}

/**
 * 连接共享服务端选项（TCP共享任意连接）
 */
export interface ConnectionServerOptions extends BaseConnectionOptions {
  type: ConnectionType.CONNECTION_SERVER;
  // 数据源配置
  sourceType: 'existing' | 'new';
  existingConnectionId?: string; // 复用已有连接的ID
  newConnectionOptions?: ConnectionOptions; // 新建连接的配置
  // 串口参数（兼容旧配置，sourceType='new' 且连接类型为 serial 时使用）
  serialPath?: string;
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
  // 共享服务配置
  localPort: number; // 本地TCP监听端口
  listenAddress?: string; // 本地TCP监听地址，默认 '0.0.0.0'
  accessPassword?: string; // 访问密码，为空则无需认证
}

/**
 * 连接选项联合类型
 */
export type ConnectionOptions =
  | PtyConnectionOptions
  | SerialConnectionOptions
  | SshConnectionOptions
  | TelnetConnectionOptions
  | SerialServerOptions
  | ConnectionServerOptions;

/**
 * 连接信息
 */
export interface ConnectionInfo {
  id: string;
  type: ConnectionType;
  state: ConnectionState;
  name: string;
  createdAt: Date;
}

/**
 * 连接接口
 */
export interface IConnection {
  readonly id: string;
  readonly type: ConnectionType;
  readonly state: ConnectionState;
  readonly options: ConnectionOptions;

  open(): Promise<void>;
  close(): Promise<void>;
  destroy(): void;

  write(data: Buffer | string): void;
  writeHex(hex: string): void;

  resize(cols: number, rows: number): void;

  onData(callback: (data: Buffer) => void): () => void;
  onStateChange(callback: (state: ConnectionState) => void): () => void;
  onError(callback: (error: Error) => void): () => void;
  onClose(callback: (code?: number) => void): () => void;
}

/**
 * 串口信息
 */
export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  productId?: string;
  vendorId?: string;
}
