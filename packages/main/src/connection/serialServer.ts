/**
 * 串口服务端连接
 * 将本地串口通过TCP共享
 */

import * as net from 'node:net';
import { SerialPort } from 'serialport';
import {
  ConnectionType,
  ConnectionState,
  SerialServerOptions,
} from '@qserial/shared';
import type { IConnection } from '@qserial/shared';
import {
  AUTH_TIMEOUT,
  sendTelnetNegotiation,
  processTelnetData,
  processPasswordAuth,
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
 * 串口服务端连接类
 */
export class SerialServerConnection implements IConnection {
  readonly id: string;
  readonly type = ConnectionType.SERIAL_SERVER;
  readonly options: SerialServerOptions;

  private _state: ConnectionState = ConnectionState.DISCONNECTED;
  private serialPort: SerialPort | null = null;
  private tcpServer: net.Server | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private dataCallbacks: Set<(data: Buffer) => void> = new Set();
  private stateCallbacks: Set<(state: ConnectionState) => void> = new Set();
  private errorCallbacks: Set<(error: Error) => void> = new Set();
  private closeCallbacks: Set<(code?: number) => void> = new Set();
  private sharedConnection: IConnection | null = null;
  private dataUnsubscriber: (() => void) | null = null;
  private stateUnsubscriber: (() => void) | null = null;
  private closeUnsubscriber: (() => void) | null = null;
  private errorUnsubscriber: (() => void) | null = null;
  private writeQueue: Array<{ data: Buffer; clientId: string }> = [];
  private isWriting = false;

  get state() {
    return this._state;
  }

  constructor(options: SerialServerOptions) {
    this.id = options.id;
    this.options = options;
  }

  async open(sharedConnection?: IConnection): Promise<void> {
    try {
      this._setState(ConnectionState.CONNECTING);

      if (sharedConnection) {
        this.sharedConnection = sharedConnection;
        this._setupSharedConnection();
      } else {
        await this.openSerialPort();
      }

      await this.startTcpServer();

      this._setState(ConnectionState.CONNECTED);
    } catch (error) {
      this._setState(ConnectionState.ERROR);
      await this.cleanupOnError();
      throw error;
    }
  }

  private async cleanupOnError(): Promise<void> {
    if (this.tcpServer) {
      await new Promise<void>((resolve) => {
        this.tcpServer!.close(() => resolve());
      });
      this.tcpServer = null;
    }

    if (this.serialPort && this.serialPort.isOpen) {
      await new Promise<void>((resolve) => {
        this.serialPort!.close(() => resolve());
      });
      this.serialPort = null;
    }

    this._unsubscribeSharedConnection();
    this.sharedConnection = null;
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
      if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
        this._notifyError(new Error('共享连接已断开'));
        this.close();
      }
    });

    this.closeUnsubscriber = this.sharedConnection.onClose(() => {
      this._notifyError(new Error('共享连接已关闭'));
      this.close();
    });

    this.errorUnsubscriber = this.sharedConnection.onError((err) => {
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

          const userData = processTelnetData(data, clientInfo);
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

        if (this.serialPort) {
          const dataHandler = (data: Buffer) => {
            if (!socket.destroyed && clientInfo.authenticated) {
              socket.write(data);
            }
          };
          this.serialPort.on('data', dataHandler);
          socket.on('close', () => {
            this.serialPort?.off('data', dataHandler);
          });
        }
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

    const writeTarget = this.serialPort?.isOpen ? this.serialPort : this.sharedConnection;
    if (writeTarget) {
      writeTarget.write(item.data);
      this.dataCallbacks.forEach((cb) => cb(item.data));
    }

    setImmediate(() => {
      this.isWriting = false;
      this._processWriteQueue();
    });
  }

  async close(): Promise<void> {
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

    if (this.serialPort && this.serialPort.isOpen) {
      await new Promise<void>((resolve) => {
        this.serialPort!.close(() => resolve());
      });
      this.serialPort = null;
    }

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

  getStatus(): {
    running: boolean;
    serialPath: string;
    localPort: number;
    listenAddress: string;
    clientCount: number;
    clients: string[];
    hasPassword: boolean;
  } {
    return {
      running: this._state === ConnectionState.CONNECTED,
      serialPath: this.options.serialPath,
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
}
