/**
 * SSH 连接实现
 */

import { Client, ClientChannel } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ConnectionType,
  ConnectionState,
  type IConnection,
  type SshConnectionOptions,
} from '@qserial/shared';
import { EventEmitter } from 'events';

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

    // 构建认证方式列表，按优先级尝试
    const defaultKeys = getDefaultPrivateKeys();

    // 收集所有可用的认证配置
    const authMethods: { privateKey?: Buffer; password?: string }[] = [];

    // 1. 默认密钥
    for (const key of defaultKeys) {
      authMethods.push({ privateKey: key });
    }

    // 2. 密码
    if (this.options.password) {
      authMethods.push({ password: this.options.password });
    }

    if (authMethods.length === 0) {
      this._state = ConnectionState.ERROR;
      this.emitStateChange();
      throw new Error('未找到 SSH 密钥 (~/.ssh/id_*) 且未提供密码');
    }

    // 依次尝试每种认证方式
    let lastError: Error | null = null;

    for (let i = 0; i < authMethods.length; i++) {
      const auth = authMethods[i];
      try {
        await this.tryConnect(auth);
        return; // 连接成功
      } catch (err) {
        lastError = err as Error;
        // 认证失败，尝试下一种方式
      }
    }

    // 所有方式都失败
    this._state = ConnectionState.ERROR;
    this.emitStateChange();
    throw lastError || new Error('All configured authentication methods failed');
  }

  private tryConnect(auth: { privateKey?: Buffer; password?: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      // 清理上一个客户端
      if (this.client) {
        try { this.client.end(); } catch { /* ignore */ }
        this.client = null;
      }
      if (this.stream) {
        this.stream = null;
      }

      this.client = new Client();

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onHandshake = () => {
        this.client!.shell(
          { term: 'xterm-256color', cols: 80, rows: 24 },
          (err, stream) => {
            if (err) {
              cleanup();
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
      };

      const cleanup = () => {
        this.client?.removeAllListeners();
        try { this.client?.end(); } catch { /* ignore */ }
        this.client = null;
        this.stream = null;
      };

      this.client.on('ready', onHandshake);
      this.client.on('error', onError);

      // 连接成功后保持事件监听（状态变化等）
      this.client.on('close', () => {
        this._state = ConnectionState.DISCONNECTED;
        this.emitStateChange();
        this.eventEmitter.emit('close');
      });

      const config: Record<string, unknown> = {
        host: this.options.host,
        port: this.options.port,
        username: this.options.username,
        readyTimeout: 20000,
        keepaliveInterval: this.options.keepaliveInterval || 30000,
      };

      if (auth.privateKey) {
        config.privateKey = auth.privateKey;
      }
      if (auth.password) {
        config.password = auth.password;
        config.tryKeyboard = true;
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
      // 将字符串转换为 Buffer，使用 UTF-8 编码以支持中文
      const bufferData = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
      this.stream.write(bufferData);
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
