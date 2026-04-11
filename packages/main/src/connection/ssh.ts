/**
 * SSH 连接实现
 */

import { Client, ClientChannel } from 'ssh2';
import {
  ConnectionType,
  ConnectionState,
  type IConnection,
  type SshConnectionOptions,
} from '@qserial/shared';
import { EventEmitter } from 'events';

export class SshConnection implements IConnection {
  private client: Client | null = null;
  private stream: ClientChannel | null = null;
  private eventEmitter = new EventEmitter();
  private _state: ConnectionState = ConnectionState.DISCONNECTED;

  readonly id: string;
  readonly type = ConnectionType.SSH;
  readonly options: SshConnectionOptions;

  constructor(options: SshConnectionOptions) {
    this.id = options.id;
    this.options = options;
  }

  get state(): ConnectionState {
    return this._state;
  }

  async open(): Promise<void> {
    if (this.client) {
      throw new Error('Connection already open');
    }

    this._state = ConnectionState.CONNECTING;
    this.emitStateChange();

    return new Promise((resolve, reject) => {
      this.client = new Client();

      this.client.on('ready', () => {
        this.client!.shell(
          { term: 'xterm-256color', cols: 80, rows: 24 },
          (err, stream) => {
            if (err) {
              this._state = ConnectionState.ERROR;
              this.emitStateChange();
              this.eventEmitter.emit('error', err);
              reject(err);
              return;
            }

            this.stream = stream;

            stream.on('data', (data: Buffer) => {
              this.eventEmitter.emit('data', data);
            });

            stream.on('close', () => {
              this._state = ConnectionState.DISCONNECTED;
              this.emitStateChange();
              this.eventEmitter.emit('close');
              this.client?.end();
            });

            stream.stderr.on('data', (data: Buffer) => {
              this.eventEmitter.emit('data', data);
            });

            this._state = ConnectionState.CONNECTED;
            this.emitStateChange();
            resolve();
          }
        );
      });

      this.client.on('error', (err: Error) => {
        this._state = ConnectionState.ERROR;
        this.emitStateChange();
        this.eventEmitter.emit('error', err);
        reject(err);
      });

      this.client.on('close', () => {
        this._state = ConnectionState.DISCONNECTED;
        this.emitStateChange();
        this.eventEmitter.emit('close');
      });

      // 连接配置
      const config: Record<string, unknown> = {
        host: this.options.host,
        port: this.options.port,
        username: this.options.username,
        readyTimeout: this.options.keepaliveInterval || 20000,
        keepaliveInterval: this.options.keepaliveInterval || 30000,
      };

      if (this.options.password) {
        config.password = this.options.password;
      }

      if (this.options.privateKey) {
        config.privateKey = this.options.privateKey;
        if (this.options.passphrase) {
          config.passphrase = this.options.passphrase;
        }
      }

      this.client.connect(config);
    });
  }

  async close(): Promise<void> {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
    if (this.client) {
      this.client.end();
      this.client = null;
    }
    this._state = ConnectionState.DISCONNECTED;
    this.emitStateChange();
  }

  destroy(): void {
    this.close();
    this.eventEmitter.removeAllListeners();
  }

  write(data: Buffer | string): void {
    if (this.stream) {
      this.stream.write(data);
    }
  }

  writeHex(hex: string): void {
    this.write(Buffer.from(hex, 'hex'));
  }

  resize(cols: number, rows: number): void {
    if (this.stream) {
      this.stream.setWindow(rows, cols, 480, 640);
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
}
