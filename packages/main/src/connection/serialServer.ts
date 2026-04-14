/**
 * 串口服务端连接
 * 将本地串口通过TCP共享，支持SSH反向隧道
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Client } from 'ssh2';
import { SerialPort } from 'serialport';
import {
  ConnectionType,
  ConnectionState,
  SerialServerOptions,
} from '@qserial/shared';
import type { IConnection } from '@qserial/shared';

// 默认密钥文件名列表（按优先级）
const DEFAULT_KEY_NAMES = [
  'id_ed25519',
  'id_rsa',
  'id_ecdsa',
  'id_dsa',
];

/**
 * 获取用户默认 SSH 密钥列表
 */
function getDefaultPrivateKeys(): Buffer[] {
  const sshDir = path.join(os.homedir(), '.ssh');
  const keys: Buffer[] = [];

  for (const name of DEFAULT_KEY_NAMES) {
    const keyPath = path.join(sshDir, name);
    try {
      if (fs.existsSync(keyPath)) {
        keys.push(fs.readFileSync(keyPath));
      }
    } catch {
      // 读取失败跳过
    }
  }

  return keys;
}

interface ClientInfo {
  socket: net.Socket;
  address: string;
}

/**
 * 串口服务端连接类
 */
export class SerialServerConnection implements IConnection {
  readonly id: string;
  readonly type = ConnectionType.SERIAL_SERVER;
  readonly options: SerialServerOptions;

  private _state: ConnectionState = ConnectionState.DISCONNECTED;
  private serialPort: SerialPort | null = null;
  private tcpServer: net.Server | null = null;
  private sshClient: Client | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private dataCallbacks: Set<(data: Buffer) => void> = new Set();
  private stateCallbacks: Set<(state: ConnectionState) => void> = new Set();
  private errorCallbacks: Set<(error: Error) => void> = new Set();
  private closeCallbacks: Set<(code?: number) => void> = new Set();
  private sharedConnection: IConnection | null = null;
  private dataUnsubscriber: (() => void) | null = null;

  get state() {
    return this._state;
  }

  constructor(options: SerialServerOptions) {
    this.id = options.id;
    this.options = options;
  }

  async open(sharedConnection?: IConnection): Promise<void> {
    console.log('[SerialServer] open() called, sharedConnection:', sharedConnection ? `exists (id=${sharedConnection.id})` : 'null');
    try {
      this._setState(ConnectionState.CONNECTING);

      if (sharedConnection) {
        // 复用现有连接
        this.sharedConnection = sharedConnection;
        console.log('[SerialServer] Using shared connection, id:', sharedConnection.id);
        this._setupSharedConnection();
      } else {
        // 1. 打开串口
        console.log('[SerialServer] No shared connection, opening serial port:', this.options.serialPath);
        await this.openSerialPort();
      }

      // 2. 启动TCP服务器
      await this.startTcpServer();

      // 3. 如果配置了SSH隧道，建立反向隧道
      if (this.options.sshTunnel) {
        await this.setupSshTunnel();
      }

      this._setState(ConnectionState.CONNECTED);
    } catch (error) {
      this._setState(ConnectionState.ERROR);
      // 清理已启动的资源
      await this.cleanupOnError();
      throw error;
    }
  }

  private async cleanupOnError(): Promise<void> {
    // 关闭TCP服务器
    if (this.tcpServer) {
      await new Promise<void>((resolve) => {
        this.tcpServer!.close(() => resolve());
      });
      this.tcpServer = null;
    }

    // 关闭SSH客户端
    if (this.sshClient) {
      this.sshClient.end();
      this.sshClient = null;
    }

    // 关闭串口（如果是自己打开的）
    if (this.serialPort && this.serialPort.isOpen) {
      await new Promise<void>((resolve) => {
        this.serialPort!.close(() => resolve());
      });
      this.serialPort = null;
    }

    // 取消共享连接的监听
    if (this.dataUnsubscriber) {
      this.dataUnsubscriber();
      this.dataUnsubscriber = null;
    }
    this.sharedConnection = null;
  }

  private _setupSharedConnection(): void {
    if (!this.sharedConnection) return;

    // 监听共享连接的数据
    this.dataUnsubscriber = this.sharedConnection.onData((data) => {
      // 转发到所有TCP客户端
      this.clients.forEach((clientInfo) => {
        if (!clientInfo.socket.destroyed) {
          clientInfo.socket.write(data);
        }
      });
      // 通知数据回调
      this.dataCallbacks.forEach((cb) => cb(data));
    });

    // 监听共享连接的状态变化
    this.sharedConnection.onStateChange((state) => {
      if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
        this.close();
      }
    });

    // 监听共享连接的错误
    this.sharedConnection.onError((err) => {
      this._notifyError(err);
    });
  }

  private async openSerialPort(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serialPort = new SerialPort({
        path: this.options.serialPath,
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        autoOpen: false,
      });

      this.serialPort.on('error', (err) => {
        this._notifyError(err);
      });

      this.serialPort.on('close', () => {
        // 串口关闭时通知所有客户端
      });

      this.serialPort.open((err) => {
        if (err) {
          reject(new Error(`无法打开串口 ${this.options.serialPath}: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  private async startTcpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tcpServer = net.createServer((socket) => {
        const address = `${socket.remoteAddress}:${socket.remotePort}`;
        const clientInfo: ClientInfo = {
          socket,
          address,
        };
        this.clients.set(address, clientInfo);

        // 客户端数据转发到串口或共享连接
        socket.on('data', (data) => {
          if (this.serialPort && this.serialPort.isOpen) {
            this.serialPort.write(data);
            this.dataCallbacks.forEach((cb) => cb(data));
          } else if (this.sharedConnection) {
            this.sharedConnection.write(data);
            this.dataCallbacks.forEach((cb) => cb(data));
          }
        });

        socket.on('close', () => {
          this.clients.delete(address);
        });

        socket.on('error', () => {
          this.clients.delete(address);
        });

        // 串口数据转发到客户端
        if (this.serialPort) {
          const dataHandler = (data: Buffer) => {
            if (!socket.destroyed) {
              socket.write(data);
            }
          };
          this.serialPort.on('data', dataHandler);
          socket.on('close', () => {
            this.serialPort?.off('data', dataHandler);
          });
        }
      });

      this.tcpServer.on('error', (err) => {
        this._notifyError(err);
        reject(new Error(`TCP服务器启动失败: ${err.message}`));
      });

      this.tcpServer.listen(this.options.localPort, () => {
        resolve();
      });
    });
  }

  private async setupSshTunnel(): Promise<void> {
    const tunnelConfig = this.options.sshTunnel;
    if (!tunnelConfig) return;

    // 获取默认密钥
    const defaultKeys = getDefaultPrivateKeys();
    console.log(`[SerialServer] 找到 ${defaultKeys.length} 个默认密钥文件`);

    // 收集所有可用的认证配置
    const authMethods: { privateKey?: Buffer; password?: string; name: string }[] = [];

    // 1. 默认密钥
    const keyNames = ['id_ed25519', 'id_rsa', 'id_ecdsa', 'id_dsa'];
    for (let i = 0; i < defaultKeys.length; i++) {
      authMethods.push({ privateKey: defaultKeys[i], name: keyNames[i] || `key-${i}` });
    }

    // 2. 密码
    if (tunnelConfig.password) {
      authMethods.push({ password: tunnelConfig.password, name: 'password' });
    }

    if (authMethods.length === 0) {
      throw new Error('未找到 SSH 密钥 (~/.ssh/id_*) 且未提供密码');
    }

    console.log(`[SerialServer] 共 ${authMethods.length} 种认证方式，将依次尝试`);
    console.log(`[SerialServer] 正在连接SSH: ${tunnelConfig.username}@${tunnelConfig.host}:${tunnelConfig.port}`);

    // 依次尝试每种认证方式
    let lastError: Error | null = null;
    let connected = false;

    for (const auth of authMethods) {
      if (connected) break;

      console.log(`[SerialServer] 尝试认证方式: ${auth.name}`);

      try {
        await new Promise<void>((connectResolve, connectReject) => {
          this.sshClient = new Client();

          const timeout = setTimeout(() => {
            this.sshClient?.end();
            connectReject(new Error('SSH连接超时'));
          }, 15000);

          this.sshClient.on('ready', () => {
            clearTimeout(timeout);
            console.log(`[SerialServer] 认证成功: ${auth.name}`);
            console.log('[SerialServer] 正在建立反向隧道...');

            // 请求远程端口转发
            this.sshClient!.forwardIn(
              '127.0.0.1',
              tunnelConfig.remotePort,
              (err) => {
                if (err) {
                  connectReject(new Error(`SSH隧道建立失败: ${err.message}`));
                } else {
                  console.log(`[SerialServer] 反向隧道建立成功，远程端口: ${tunnelConfig.remotePort}`);
                  connected = true;
                  connectResolve();
                }
              }
            );
          });

          this.sshClient.on('tcp connection', (_info, accept) => {
            console.log('[SerialServer] 收到远程连接请求');
            const channel = accept();
            if (!channel) return;

            // 将SSH连接转发到本地TCP服务器
            const socket = net.connect(this.options.localPort, '127.0.0.1', () => {
              console.log('[SerialServer] 已连接到本地TCP服务器');
              channel.pipe(socket);
              socket.pipe(channel);
            });

            socket.on('error', (err: Error) => {
              console.error('[SerialServer] 本地连接错误:', err.message);
              channel.end();
            });
            channel.on('error', (err: Error) => {
              console.error('[SerialServer] SSH通道错误:', err.message);
              socket.end();
            });
          });

          this.sshClient.on('error', (err) => {
            clearTimeout(timeout);
            lastError = err;
            console.log(`[SerialServer] 认证失败: ${auth.name}, 错误: ${err.message}`);
            connectReject(err);
          });

          this.sshClient.on('close', () => {
            clearTimeout(timeout);
          });

          const connectConfig: {
            host: string;
            port: number;
            username: string;
            privateKey?: Buffer;
            password?: string;
            tryKeyboard?: boolean;
            readyTimeout: number;
          } = {
            host: tunnelConfig.host,
            port: tunnelConfig.port,
            username: tunnelConfig.username,
            readyTimeout: 20000,
          };

          if (auth.privateKey) {
            connectConfig.privateKey = auth.privateKey;
          } else if (auth.password) {
            connectConfig.password = auth.password;
            connectConfig.tryKeyboard = true;
          }

          this.sshClient.connect(connectConfig);
        });
      } catch {
        // 认证失败，尝试下一种方式
        try { this.sshClient?.end(); } catch { /* ignore */ }
        this.sshClient = null;
        continue;
      }
    }

    if (!connected) {
      const errorMsg = (lastError as Error | null)?.message ?? '所有认证方式均失败';
      console.error(`[SerialServer] SSH连接最终失败: ${errorMsg}`);
      throw new Error(`SSH连接失败: ${errorMsg}。请检查密钥或密码是否正确。`);
    }
  }

  async close(): Promise<void> {
    // 关闭所有客户端连接
    for (const [, clientInfo] of this.clients) {
      clientInfo.socket.destroy();
    }
    this.clients.clear();

    // 关闭TCP服务器
    if (this.tcpServer) {
      await new Promise<void>((resolve) => {
        this.tcpServer!.close(() => resolve());
      });
      this.tcpServer = null;
    }

    // 关闭SSH隧道
    if (this.sshClient) {
      this.sshClient.end();
      this.sshClient = null;
    }

    // 取消共享连接的监听
    if (this.dataUnsubscriber) {
      this.dataUnsubscriber();
      this.dataUnsubscriber = null;
    }

    // 只有是自己的串口才关闭
    if (this.serialPort && this.serialPort.isOpen) {
      await new Promise<void>((resolve) => {
        this.serialPort!.close(() => resolve());
      });
      this.serialPort = null;
    }

    // 清空共享连接引用（但不关闭它）
    this.sharedConnection = null;

    this._setState(ConnectionState.DISCONNECTED);
  }

  destroy(): void {
    this.close().catch(() => {});
    this.dataCallbacks.clear();
    this.stateCallbacks.clear();
    this.errorCallbacks.clear();
    this.closeCallbacks.clear();
  }

  write(data: Buffer | string): void {
    // 将字符串转换为 Buffer，使用 UTF-8 编码以支持中文
    const bufferData = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    
    if (this.serialPort && this.serialPort.isOpen) {
      this.serialPort.write(bufferData);
    } else if (this.sharedConnection) {
      this.sharedConnection.write(bufferData);
    }
  }

  writeHex(hex: string): void {
    const buffer = Buffer.from(hex, 'hex');
    this.write(buffer);
  }

  resize(_cols: number, _rows: number): void {
    // 串口服务端不需要resize
  }

  onData(callback: (data: Buffer) => void): () => void {
    this.dataCallbacks.add(callback);
    return () => this.dataCallbacks.delete(callback);
  }

  onStateChange(callback: (state: ConnectionState) => void): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  onError(callback: (error: Error) => void): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  onClose(callback: (code?: number) => void): () => void {
    this.closeCallbacks.add(callback);
    return () => this.closeCallbacks.delete(callback);
  }

  /**
   * 获取服务状态
   */
  getStatus(): {
    running: boolean;
    serialPath: string;
    localPort: number;
    clientCount: number;
    sshTunnelConnected: boolean;
  } {
    return {
      running: this._state === ConnectionState.CONNECTED,
      serialPath: this.options.serialPath,
      localPort: this.options.localPort,
      clientCount: this.clients.size,
      sshTunnelConnected: this.sshClient !== null,
    };
  }

  private _setState(state: ConnectionState): void {
    this._state = state;
    this.stateCallbacks.forEach((cb) => cb(state));
  }

  private _notifyError(error: Error): void {
    this.errorCallbacks.forEach((cb) => cb(error));
  }
}
