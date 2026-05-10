/**
 * PTY 连接实现
 */

import * as pty from 'node-pty';
import {
  ConnectionType,
  ConnectionState,
  type IConnection,
  type PtyConnectionOptions,
} from '@qserial/shared';
import { EventEmitter } from 'events';

export class PtyConnection implements IConnection {
  private ptyProcess: pty.IPty | null = null;
  private eventEmitter = new EventEmitter();
  private _state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectCount = 0;
  private isClosing = false;

  readonly id: string;
  readonly type = ConnectionType.PTY;
  readonly options: PtyConnectionOptions;

  constructor(options: PtyConnectionOptions) {
    this.id = options.id;
    this.options = options;
  }

  get state(): ConnectionState {
    return this._state;
  }

  async open(): Promise<void> {
    if (this.ptyProcess) {
      throw new Error('Connection already open');
    }

    this.isClosing = false;
    this._state = ConnectionState.CONNECTING;
    this.emitStateChange();

    try {
      const shell = this.options.shell || this.getDefaultShell();

      this.ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: this.options.cols || 80,
        rows: this.options.rows || 24,
        cwd: this.options.cwd || process.env.HOME || process.cwd(),
        env: { ...process.env, ...this.options.env },
      });

      this.ptyProcess.onData((data) => {
        this.eventEmitter.emit('data', Buffer.from(data));
      });

      this.ptyProcess.onExit(({ exitCode }) => {
        this.ptyProcess = null;
        this.eventEmitter.emit('close', exitCode);
        this.handleReconnect();
      });

      this.cancelReconnect();
      this._state = ConnectionState.CONNECTED;
      this.emitStateChange();
    } catch (error) {
      this._state = ConnectionState.ERROR;
      this.emitStateChange();
      this.eventEmitter.emit('error', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.isClosing = true;
    this.cancelReconnect();
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
    this._state = ConnectionState.DISCONNECTED;
    this.emitStateChange();
  }

  destroy(): void {
    this.isClosing = true;
    this.close();
    this.eventEmitter.removeAllListeners();
  }

  write(data: Buffer | string): void {
    if (this.ptyProcess) {
      this.ptyProcess.write(typeof data === 'string' ? data : data.toString());
    }
  }

  writeHex(hex: string): void {
    this.write(Buffer.from(hex, 'hex'));
  }

  resize(cols: number, rows: number): void {
    if (this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
    }
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
    if (!this.options.autoReconnect || this.isClosing) {
      this.ptyProcess = null;
      this._state = ConnectionState.DISCONNECTED;
      this.emitStateChange();
      return;
    }

    const maxAttempts = this.options.reconnectAttempts || 5;
    const interval = this.options.reconnectInterval || 3000;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.reconnectCount >= maxAttempts) {
      this._state = ConnectionState.DISCONNECTED;
      this.emitStateChange();
      this.eventEmitter.emit('error', new Error(`重连失败，已达最大重试次数 (${maxAttempts})`));
      return;
    }

    this._state = ConnectionState.RECONNECTING;
    this.emitStateChange();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectCount++;
      this.ptyProcess = null;
      this.open().catch(() => {
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

  private getDefaultShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }
}
