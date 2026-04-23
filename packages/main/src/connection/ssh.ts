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

/**
 * 算法配置预设
 * - full: 完整算法列表，优先兼容新设备
 * - legacy: 仅使用最保守的算法，兼容旧设备
 */
const ALGORITHM_PRESETS = {
  full: {
    kex: [
      'ecdh-sha2-nistp256',
      'ecdh-sha2-nistp384',
      'ecdh-sha2-nistp521',
      'diffie-hellman-group-exchange-sha256',
      'diffie-hellman-group14-sha256',
      'diffie-hellman-group15-sha512',
      'diffie-hellman-group16-sha512',
      'diffie-hellman-group17-sha512',
      'diffie-hellman-group18-sha512',
      'diffie-hellman-group14-sha1',
      'diffie-hellman-group-exchange-sha1',
      'diffie-hellman-group1-sha1',
    ],
    serverHostKey: [
      'ssh-rsa',
      'ssh-ed25519',
      'rsa-sha2-512',
      'rsa-sha2-256',
      'ecdsa-sha2-nistp256',
      'ecdsa-sha2-nistp384',
      'ecdsa-sha2-nistp521',
      'ssh-dss',
    ],
    cipher: [
      'aes128-gcm@openssh.com',
      'aes256-gcm@openssh.com',
      'aes128-ctr',
      'aes192-ctr',
      'aes256-ctr',
      'aes128-cbc',
      'aes256-cbc',
      '3des-cbc',
    ],
    hmac: [
      'hmac-sha2-512',
      'hmac-sha2-256',
      'hmac-sha1',
      'hmac-sha1-96',
    ],
  },
  legacy: {
    kex: [
      'diffie-hellman-group14-sha1',
      'diffie-hellman-group1-sha1',
      'diffie-hellman-group-exchange-sha1',
      'ecdh-sha2-nistp256',
      'ecdh-sha2-nistp384',
      'ecdh-sha2-nistp521',
    ],
    serverHostKey: [
      // 只保留 ssh-rsa 和 ssh-dss，避免 rsa-sha2-* 签名不匹配
      'ssh-rsa',
      'ssh-dss',
    ],
    cipher: [
      'aes128-ctr',
      'aes192-ctr',
      'aes256-ctr',
      'aes128-cbc',
      'aes256-cbc',
      '3des-cbc',
    ],
    hmac: [
      'hmac-sha1',
      'hmac-sha1-96',
      'hmac-sha2-256',
      'hmac-sha2-512',
    ],
  },
};

export class SshConnection implements IConnection {
  private client: Client | null = null;
  private stream: ClientChannel | null = null;
  private eventEmitter = new EventEmitter();
  private _state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectCount = 0;

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
    const authMethods: { privateKey?: Buffer; password?: string; passphrase?: string }[] = [];

    // 1. 用户指定的私钥（最高优先级）
    if (this.options.privateKey) {
      try {
        const keyPath = this.options.privateKey.replace(/^~/, os.homedir());
        const keyBuffer = fs.readFileSync(keyPath);
        authMethods.push({ privateKey: keyBuffer, passphrase: this.options.passphrase });
      } catch {
        // 读取失败跳过
      }
    }

    // 2. 用户指定的密码
    if (this.options.password) {
      authMethods.push({ password: this.options.password });
    }

    // 3. 默认密钥（最低优先级，仅在用户未提供任何认证时使用）
    if (!this.options.privateKey && !this.options.password) {
      for (const key of defaultKeys) {
        authMethods.push({ privateKey: key });
      }
    }

    if (authMethods.length === 0) {
      this._state = ConnectionState.ERROR;
      this.emitStateChange();
      throw new Error('未找到 SSH 密钥 (~/.ssh/id_*) 且未提供密码');
    }

    // 连接策略：先用完整算法列表，失败后回退到保守算法
    const algorithmPresets = ['full', 'legacy'] as const;
    let lastError: Error | null = null;

    for (const preset of algorithmPresets) {
      for (const auth of authMethods) {
        try {
          await this.tryConnect(auth, ALGORITHM_PRESETS[preset]);
          return; // 连接成功
        } catch (err) {
          lastError = err as Error;
          const errMsg = lastError.message || '';

          // 签名验证失败时，立即切换到保守算法预设重试
          if (errMsg.includes('signature verification failed') && preset === 'full') {
            console.log('[SSH] signature verification failed with full algorithms, retrying with legacy preset...');
            break; // 跳出 authMethods 循环，进入 legacy preset
          }

          // 其他错误（如认证失败），继续尝试下一个认证方式
        }
      }

      // 如果已经是 legacy preset 且仍然签名验证失败，不再重试
      if (lastError?.message?.includes('signature verification failed')) {
        break;
      }
    }

    // 所有方式都失败
    if (this.reconnectCount > 0) {
      // 重连失败时保持 RECONNECTING 状态（handleReconnect 会继续调度）
      this._state = ConnectionState.RECONNECTING;
    } else {
      this._state = ConnectionState.ERROR;
    }
    this.emitStateChange();
    throw lastError || new Error('All configured authentication methods failed');
  }

  private tryConnect(
    auth: { privateKey?: Buffer; password?: string; passphrase?: string },
    algorithms: typeof ALGORITHM_PRESETS.full,
  ): Promise<void> {
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
              this.handleReconnect();
            });

            stream.stderr.on('data', (data: Buffer) => {
              this.eventEmitter.emit('data', data);
            });

            this._state = ConnectionState.CONNECTED;
            this.reconnectCount = 0;
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
        this.handleReconnect();
      });

      const config: Record<string, unknown> = {
        host: this.options.host,
        port: this.options.port,
        username: this.options.username,
        readyTimeout: 20000,
        keepaliveInterval: this.options.keepaliveInterval || 30000,
        // 跳过主机密钥验证（兼容旧设备，生产环境应改为严格验证）
        hostVerifier: () => true,
        algorithms,
        debug: (msg: string) => {
          console.log('[SSH]', msg);
        },
      };

      if (auth.privateKey) {
        config.privateKey = auth.privateKey;
        if (auth.passphrase) {
          config.passphrase = auth.passphrase;
        }
      }
      if (auth.password) {
        config.password = auth.password;
        config.tryKeyboard = true;
      }

      this.client.connect(config);
    });
  }

  async close(): Promise<void> {
    this.cancelReconnect();
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
    this.cancelReconnect();
    if (this.stream) {
      this.stream = null;
    }
    if (this.client) {
      try { this.client.end(); } catch { /* ignore */ }
      this.client = null;
    }
    this._state = ConnectionState.DISCONNECTED;
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

  private handleReconnect(): void {
    if (!this.options.autoReconnect) return;

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
      // 清理旧连接后重连
      this.client = null;
      this.stream = null;
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
