/**
 * Telnet 连接实现
 */

import * as net from 'net';
import {
  ConnectionType,
  ConnectionState,
  type IConnection,
  type TelnetConnectionOptions,
} from '@qserial/shared';
import { EventEmitter } from 'events';

// Telnet 协议命令
const IAC = 0xff; // Interpret As Command
const DONT = 0xfe;
const DO = 0xfd;
const WONT = 0xfc;
const WILL = 0xfb;

export class TelnetConnection implements IConnection {
  private socket: net.Socket | null = null;
  private eventEmitter = new EventEmitter();
  private _state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectCount = 0;

  readonly id: string;
  readonly type = ConnectionType.TELNET;
  readonly options: TelnetConnectionOptions;

  constructor(options: TelnetConnectionOptions) {
    this.id = options.id;
    this.options = options;
  }

  get state(): ConnectionState {
    return this._state;
  }

  async open(): Promise<void> {
    if (this.socket) {
      throw new Error('Connection already open');
    }

    this._state = ConnectionState.CONNECTING;
    this.emitStateChange();

    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      const connectTimeout = setTimeout(() => {
        reject(new Error('Connection timed out'));
        this.destroy();
      }, this.options.timeout || 15000);

      this.socket.connect(this.options.port, this.options.host, () => {
        clearTimeout(connectTimeout);
        this._state = ConnectionState.CONNECTED;
        this.reconnectCount = 0;
        this.emitStateChange();
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        const cleaned = this.handleTelnetCommands(data);
        if (cleaned.length > 0) {
          this.eventEmitter.emit('data', cleaned);
        }
      });

      this.socket.on('error', (err: Error) => {
        clearTimeout(connectTimeout);
        const wasConnecting = this._state === ConnectionState.CONNECTING;
        // 重连期间失败保持 RECONNECTING 状态
        if (this.reconnectCount === 0) {
          this._state = ConnectionState.ERROR;
          this.emitStateChange();
        }
        this.eventEmitter.emit('error', err);
        if (wasConnecting) {
          reject(err);
        }
      });

      this.socket.on('close', () => {
        clearTimeout(connectTimeout);
        this._state = ConnectionState.DISCONNECTED;
        this.emitStateChange();
        this.eventEmitter.emit('close');
        this.handleReconnect();
      });
    });
  }

  /**
   * 处理 Telnet 协议协商命令
   * 简单策略：拒绝所有选项
   */
  private handleTelnetCommands(data: Buffer): Buffer {
    const output: number[] = [];

    for (let i = 0; i < data.length; i++) {
      if (data[i] === IAC && i + 1 < data.length) {
        const cmd = data[i + 1];
        if (cmd === DO && i + 2 < data.length) {
          // 回复 WONT
          output.push(IAC, WONT, data[i + 2]);
          i += 2;
        } else if (cmd === WILL && i + 2 < data.length) {
          // 回复 DONT
          output.push(IAC, DONT, data[i + 2]);
          i += 2;
        } else if (cmd === IAC) {
          // 转义的 0xFF
          output.push(0xff);
          i += 1;
        } else {
          i += 1;
        }
      } else {
        output.push(data[i]);
      }
    }

    // 发送协商响应
    if (output.some((v, idx) => v === IAC && idx > 0 && output[idx - 1] !== IAC)) {
      // 有协商命令需要响应
      const responses: number[] = [];
      for (let i = 0; i < output.length; i++) {
        if (output[i] === IAC && (output[i + 1] === WONT || output[i + 1] === DONT)) {
          responses.push(output[i], output[i + 1], output[i + 2]);
        }
      }
      if (responses.length > 0 && this.socket) {
        this.socket.write(Buffer.from(responses));
      }
    }

    // 过滤掉协商命令，只保留实际数据
    const dataOnly: number[] = [];
    for (let i = 0; i < output.length; i++) {
      if (output[i] === IAC) {
        i += 2; // 跳过协商命令
        continue;
      }
      dataOnly.push(output[i]);
    }

    return Buffer.from(dataOnly);
  }

  async close(): Promise<void> {
    this.cancelReconnect();
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    this._state = ConnectionState.DISCONNECTED;
    this.emitStateChange();
  }

  destroy(): void {
    this.cancelReconnect();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this._state = ConnectionState.DISCONNECTED;
    this.eventEmitter.removeAllListeners();
  }

  write(data: Buffer | string): void {
    if (this.socket) {
      // 将字符串转换为 Buffer，使用 UTF-8 编码以支持中文
      const bufferData = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
      this.socket.write(bufferData);
    }
  }

  writeHex(hex: string): void {
    this.write(Buffer.from(hex, 'hex'));
  }

  resize(_cols: number, _rows: number): void {
    // Telnet 不支持 resize（除非通过 NAWS 协商，这里简化处理）
  }

  onData(callback: (data: Buffer) => void): () => void {
    this.eventEmitter.on('data', callback);
    return () => this.eventEmitter.off('data', callback);
  }

  onStateChange(callback: (state: ConnectionState) => void): () => void {
    this.eventEmitter.on('stateChange', callback);
    return () => this.eventEmitter.off('stateChange', callback);
  }

  onError(callback: (error: Error) => void): () => void {
    this.eventEmitter.on('error', callback);
    return () => this.eventEmitter.off('error', callback);
  }

  onClose(callback: (code?: number) => void): () => void {
    this.eventEmitter.on('close', callback);
    return () => this.eventEmitter.off('close', callback);
  }

  private emitStateChange(): void {
    this.eventEmitter.emit('stateChange', this._state);
  }

  private handleReconnect(): void {
    if (!this.options.autoReconnect) {
      // 清理引用，让 open() 可以被手动重连调用
      this.socket = null;
      return;
    }

    const maxAttempts = this.options.reconnectAttempts || 5;
    const interval = this.options.reconnectInterval || 3000;

    if (this.reconnectCount >= maxAttempts) {
      this.eventEmitter.emit('error', new Error(`重连失败，已达最大重试次数 (${maxAttempts})`));
      return;
    }

    this._state = ConnectionState.RECONNECTING;
    this.emitStateChange();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectCount++;
      this.socket = null;
      this.open().catch(() => {
        // open 失败后继续重连
        this.handleReconnect();
      });
    }, interval);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectCount = 0;
  }
}
