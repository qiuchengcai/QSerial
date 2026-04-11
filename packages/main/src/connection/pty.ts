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
        this._state = ConnectionState.DISCONNECTED;
        this.emitStateChange();
        this.eventEmitter.emit('close', exitCode);
      });

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
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
    this._state = ConnectionState.DISCONNECTED;
    this.emitStateChange();
  }

  destroy(): void {
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

  private getDefaultShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }
}
