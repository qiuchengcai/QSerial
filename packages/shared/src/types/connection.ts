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
  SERIAL_SERVER = 'serial_server', // 串口服务端（TCP共享）
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
  // SSH反向隧道选项
  sshTunnel?: {
    host: string; // 远程服务器地址
    port: number; // SSH端口
    username: string;
    remotePort: number; // 远程转发端口
    privateKey?: string;
    password?: string;
  };
}

/**
 * 连接选项联合类型
 */
export type ConnectionOptions =
  | PtyConnectionOptions
  | SerialConnectionOptions
  | SshConnectionOptions
  | TelnetConnectionOptions
  | SerialServerOptions;

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
