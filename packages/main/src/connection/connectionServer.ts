/**
 * 连接共享服务端
 * 将任意连接通过TCP共享
 * 支持 TELNET 协议协商，确保 Tab 补全、方向键等交互功能正常
 */

import * as net from 'node:net';
import {
  ConnectionType,
  ConnectionState,
  ConnectionServerOptions,
} from '@qserial/shared';
import type { IConnection } from '@qserial/shared';
import { ConnectionFactory } from './factory.js';
import {
  AUTH_TIMEOUT,
  sendTelnetNegotiation,
  processTelnetData,
  processPasswordAuth,
  OPT_TTYPE,
} from './telnet-utils.js';
import type { TelnetClientState } from './telnet-utils.js';

interface ClientInfo extends TelnetClientState {
  address: string;
  authenticated: boolean;
  authTimer: ReturnType<typeof setTimeout> | null;
  authAttempts: number;
  authBuffer: string;
}

/**
 * 连接共享服务端类
 */
export class ConnectionServerConnection implements IConnection {
  readonly id: string;
  readonly type = ConnectionType.CONNECTION_SERVER;
  readonly options: ConnectionServerOptions;

  private _state: ConnectionState = ConnectionState.DISCONNECTED;
  private tcpServer: net.Server | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private dataCallbacks: Set<(data: Buffer) => void> = new Set();
  private stateCallbacks: Set<(state: ConnectionState) => void> = new Set();
  private errorCallbacks: Set<(error: Error) => void> = new Set();
  private closeCallbacks: Set<(code?: number) => void> = new Set();
  private sharedConnection: IConnection | null = null;
  private ownsSharedConnection = false;
  private dataUnsubscriber: (() => void) | null = null;
  private stateUnsubscriber: (() => void) | null = null;
  private closeUnsubscriber: (() => void) | null = null;
  private errorUnsubscriber: (() => void) | null = null;
  private sourceCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private sourceConnectionDown = false;
  private writeQueue: Array<{ data: Buffer; clientId: string }> = [];
  private isWriting = false;

  get state() {
    return this._state;
  }

  constructor(options: ConnectionServerOptions) {
    this.id = options.id;
    this.options = options;
  }

  async open(): Promise<void> {
    try {
      this._setState(ConnectionState.CONNECTING);

      await this._resolveSourceConnection();

      await this.startTcpServer();

      this._setState(ConnectionState.CONNECTED);
    } catch (error) {
      this._setState(ConnectionState.ERROR);
      await this.cleanupOnError();
      throw error;
    }
  }

  private async _resolveSourceConnection(): Promise<void> {
    if (this.options.sourceType === 'existing' && this.options.existingConnectionId) {
      const existing = ConnectionFactory.get(this.options.existingConnectionId);
      if (!existing) {
        throw new Error(`找不到已有连接: ${this.options.existingConnectionId}`);
      }
      if (existing.state !== ConnectionState.CONNECTED) {
        throw new Error(`已有连接未处于连接状态: ${this.options.existingConnectionId}`);
      }
      this.sharedConnection = existing;
      this.ownsSharedConnection = false;
      this._setupSharedConnection();
    } else if (this.options.sourceType === 'new' && this.options.newConnectionOptions) {
      const conn = await ConnectionFactory.create(this.options.newConnectionOptions);
      await conn.open();
      this.sharedConnection = conn;
      this.ownsSharedConnection = true;
      this._setupSharedConnection();
    } else {
      throw new Error('无效的数据源配置：需要指定 existingConnectionId 或 newConnectionOptions');
    }
  }

  private async cleanupOnError(): Promise<void> {
    this._clearSourceCheckTimer();

    if (this.tcpServer) {
      await new Promise<void>((resolve) => {
        this.tcpServer!.close(() => resolve());
      });
      this.tcpServer = null;
    }

    this._unsubscribeSharedConnection();

    if (this.ownsSharedConnection && this.sharedConnection) {
      try {
        await ConnectionFactory.destroy(this.sharedConnection.id);
      } catch { /* ignore */ }
    }
    this.sharedConnection = null;
    this.ownsSharedConnection = false;
  }

  private _unsubscribeSharedConnection(): void {
    if (this.dataUnsubscriber) {
      this.dataUnsubscriber();
      this.dataUnsubscriber = null;
    }
    if (this.stateUnsubscriber) {
      this.stateUnsubscriber();
      this.stateUnsubscriber = null;
    }
    if (this.closeUnsubscriber) {
      this.closeUnsubscriber();
      this.closeUnsubscriber = null;
    }
    if (this.errorUnsubscriber) {
      this.errorUnsubscriber();
      this.errorUnsubscriber = null;
    }
  }

  private _setupSharedConnection(): void {
    if (!this.sharedConnection) return;

    this.dataUnsubscriber = this.sharedConnection.onData((data) => {
      this.clients.forEach((clientInfo) => {
        if (!clientInfo.socket.destroyed && clientInfo.authenticated) {
          clientInfo.socket.write(data);
        }
      });
      this.dataCallbacks.forEach((cb) => cb(data));
    });

    this.stateUnsubscriber = this.sharedConnection.onStateChange((state) => {
      if (state === ConnectionState.DISCONNECTED) {
        const connRef = this.sharedConnection;
        const wasDown = this.sourceConnectionDown;
        if (this.sourceCheckTimer) clearTimeout(this.sourceCheckTimer);
        this.sourceCheckTimer = setTimeout(() => {
          this.sourceCheckTimer = null;
          if (connRef && this.sharedConnection === connRef && connRef.state === ConnectionState.DISCONNECTED && !wasDown) {
            this.sourceConnectionDown = true;
            this._notifyClientsConnectionDown();
          }
        }, 100);
      } else if (state === ConnectionState.RECONNECTING) {
        if (!this.sourceConnectionDown) {
          this.sourceConnectionDown = true;
          this._notifyClientsConnectionDown();
        }
      } else if (state === ConnectionState.ERROR) {
        if (!this.sourceConnectionDown) {
          this.sourceConnectionDown = true;
          this._notifyClientsConnectionDown();
        }
        this._notifyError(new Error('共享连接已断开'));
        this.close();
      } else if (state === ConnectionState.CONNECTED) {
        if (this.sourceConnectionDown) {
          this.sourceConnectionDown = false;
          this._notifyClientsConnectionRestored();
        }
      }
    });

    this.closeUnsubscriber = this.sharedConnection.onClose(() => {
      if (this.sharedConnection && this.sharedConnection.state === ConnectionState.ERROR) {
        this._notifyError(new Error('共享连接已关闭'));
        this.close();
      }
    });

    this.errorUnsubscriber = this.sharedConnection.onError((err) => {
      this._notifyError(err);
    });
  }

  private async startTcpServer(): Promise<void> {
    const listenAddress = this.options.listenAddress || '0.0.0.0';
    const accessPassword = this.options.accessPassword;

    return new Promise((resolve, reject) => {
      this.tcpServer = net.createServer((socket) => {
        const address = `${socket.remoteAddress}:${socket.remotePort}`;
        const clientInfo: ClientInfo = {
          socket,
          address,
          authenticated: !accessPassword,
          authTimer: null,
          telnetNegotiated: false,
          telnetBuf: Buffer.alloc(0),
          terminalCols: 80,
          terminalRows: 24,
          authAttempts: 0,
          authBuffer: '',
        };

        if (accessPassword) {
          clientInfo.authTimer = setTimeout(() => {
            if (!clientInfo.authenticated) {
              socket.write('\r\nAUTH_TIMEOUT\r\n');
              socket.destroy();
              this.clients.delete(address);
            }
          }, AUTH_TIMEOUT);
        }

        this.clients.set(address, clientInfo);

        sendTelnetNegotiation(socket);
        clientInfo.telnetNegotiated = true;

        if (accessPassword) {
          socket.write('PASSWORD: ');
        }

        socket.on('data', (data) => {
          if (accessPassword && !clientInfo.authenticated) {
            const userData = processTelnetData(data, clientInfo);
            processPasswordAuth(
              userData, clientInfo, socket, accessPassword,
              () => this.clients.delete(address),
            );
            return;
          }

          const userData = processTelnetData(
            data, clientInfo,
            (opt, subData) => {
              if (opt === OPT_TTYPE && subData.length > 1 && subData[0] === 0) {
                // 终端类型信息接收，无需特殊处理
              }
            },
          );
          if (userData.length > 0) {
            this.writeQueue.push({ data: userData, clientId: address });
            this._processWriteQueue();
          }
        });

        socket.on('close', () => {
          if (clientInfo.authTimer) clearTimeout(clientInfo.authTimer);
          this.clients.delete(address);
        });

        socket.on('error', () => {
          if (clientInfo.authTimer) clearTimeout(clientInfo.authTimer);
          this.clients.delete(address);
        });
      });

      this.tcpServer.on('error', (err: NodeJS.ErrnoException) => {
        this._notifyError(err);
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`本地端口 ${this.options.localPort} 已被占用，请选择其他端口`));
        } else {
          reject(new Error(`TCP服务器启动失败: ${err.message}`));
        }
      });

      this.tcpServer.listen(this.options.localPort, listenAddress, () => {
        resolve();
      });
    });
  }

  private _processWriteQueue(): void {
    if (this.isWriting || this.writeQueue.length === 0) return;

    this.isWriting = true;
    const item = this.writeQueue.shift()!;

    if (this.sharedConnection) {
      this.sharedConnection.write(item.data);
      this.dataCallbacks.forEach((cb) => cb(item.data));
    }

    setImmediate(() => {
      this.isWriting = false;
      this._processWriteQueue();
    });
  }

  private _clearSourceCheckTimer(): void {
    if (this.sourceCheckTimer) {
      clearTimeout(this.sourceCheckTimer);
      this.sourceCheckTimer = null;
    }
  }

  async close(): Promise<void> {
    this._clearSourceCheckTimer();

    this.writeQueue = [];
    this.isWriting = false;

    for (const [, clientInfo] of this.clients) {
      if (clientInfo.authTimer) clearTimeout(clientInfo.authTimer);
      clientInfo.socket.destroy();
    }
    this.clients.clear();

    if (this.tcpServer) {
      await new Promise<void>((resolve) => {
        this.tcpServer!.close(() => resolve());
      });
      this.tcpServer = null;
    }

    this._unsubscribeSharedConnection();

    if (this.ownsSharedConnection && this.sharedConnection) {
      try {
        await ConnectionFactory.destroy(this.sharedConnection.id);
      } catch { /* ignore */ }
    }

    this.sharedConnection = null;
    this.ownsSharedConnection = false;
    this.sourceConnectionDown = false;

    this._setState(ConnectionState.DISCONNECTED);
  }

  destroy(): void {
    this._clearSourceCheckTimer();
    this.close().catch(() => {});
    this.dataCallbacks.clear();
    this.stateCallbacks.clear();
    this.errorCallbacks.clear();
    this.closeCallbacks.clear();
  }

  write(data: Buffer | string): void {
    const bufferData = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;

    if (this.sharedConnection) {
      this.sharedConnection.write(bufferData);
    }
  }

  writeHex(hex: string): void {
    this.write(Buffer.from(hex, 'hex'));
  }

  resize(_cols: number, _rows: number): void {
    // 共享服务端不需要resize
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

  getStatus(): {
    running: boolean;
    sourceType: 'existing' | 'new';
    sourceDescription: string;
    localPort: number;
    listenAddress: string;
    clientCount: number;
    clients: string[];
    hasPassword: boolean;
  } {
    let sourceDescription = '';
    if (this.sharedConnection) {
      const opts = this.sharedConnection.options as unknown as Record<string, unknown>;
      switch (this.sharedConnection.type) {
        case ConnectionType.SERIAL:
          sourceDescription = `串口: ${(opts as { path?: string }).path || ''}`;
          break;
        case ConnectionType.SSH:
          sourceDescription = `SSH: ${(opts as { host?: string }).host || ''}:${(opts as { port?: number }).port || 22}`;
          break;
        case ConnectionType.TELNET:
          sourceDescription = `Telnet: ${(opts as { host?: string }).host || ''}:${(opts as { port?: number }).port || 23}`;
          break;
        case ConnectionType.PTY:
          sourceDescription = `本地终端: ${(opts as { shell?: string }).shell || ''}`;
          break;
        default:
          sourceDescription = `连接: ${this.sharedConnection.id}`;
      }
    }

    return {
      running: this._state === ConnectionState.CONNECTED,
      sourceType: this.options.sourceType,
      sourceDescription,
      localPort: this.options.localPort,
      listenAddress: this.options.listenAddress || '0.0.0.0',
      clientCount: this.clients.size,
      clients: Array.from(this.clients.values())
        .filter((c) => c.authenticated)
        .map((c) => c.address),
      hasPassword: !!this.options.accessPassword,
    };
  }

  private _setState(state: ConnectionState): void {
    this._state = state;
    this.stateCallbacks.forEach((cb) => cb(state));
  }

  private _notifyError(error: Error): void {
    this.errorCallbacks.forEach((cb) => cb(error));
  }

  private _notifyClientsConnectionDown(): void {
    const msg = '\r\n\x1b[33m--- 共享连接已断开，等待重连... ---\x1b[0m\r\n';
    this.clients.forEach((clientInfo) => {
      if (!clientInfo.socket.destroyed && clientInfo.authenticated) {
        clientInfo.socket.write(msg);
      }
    });
  }

  private _notifyClientsConnectionRestored(): void {
    const msg = '\r\n\x1b[32m--- 共享连接已恢复 ---\x1b[0m\r\n';
    this.clients.forEach((clientInfo) => {
      if (!clientInfo.socket.destroyed && clientInfo.authenticated) {
        clientInfo.socket.write(msg);
      }
    });
  }
}
