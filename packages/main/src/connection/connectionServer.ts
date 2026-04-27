/**
 * 连接共享服务端
 * 将任意连接通过TCP共享，支持SSH反向隧道
 * 支持 TELNET 协议协商，确保 Tab 补全、方向键等交互功能正常
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Client } from 'ssh2';
import {
  ConnectionType,
  ConnectionState,
  ConnectionServerOptions,
} from '@qserial/shared';
import type { IConnection } from '@qserial/shared';
import { ConnectionFactory } from './factory.js';

// ============== TELNET 协议常量 ==============
const IAC = 255;   // Interpret As Command
const WILL = 251;
const WONT = 252;
const DO = 253;
const DONT = 254;
const SB = 250;    // Subnegotiation Begin
const SE = 240;    // Subnegotiation End
const NOP = 241;

// TELNET 选项
const OPT_ECHO = 1;
const OPT_SUPPRESS_GA = 3;
const OPT_NAWS = 31;    // Negotiate About Window Size
const OPT_TTYPE = 24;   // Terminal Type
const OPT_LINEMODE = 34;

// ============== 常规常量 ==============

// 默认密钥文件名列表（按优先级）
const DEFAULT_KEY_NAMES = [
  'id_ed25519',
  'id_rsa',
  'id_ecdsa',
  'id_dsa',
];

/** SSH 重连配置 */
const SSH_RECONNECT_MAX_ATTEMPTS = 5;
const SSH_RECONNECT_BASE_DELAY = 3000; // 3s

/** 客户端认证超时 */
const AUTH_TIMEOUT = 10000; // 10s

/**
 * 在数据中查找 IAC SE 的位置（子协商结束标记）
 */
function findIACSE(data: Buffer, offset: number): number {
  for (let i = offset; i < data.length - 1; i++) {
    if (data[i] === IAC && data[i + 1] === SE) {
      return i;
    }
  }
  return -1;
}

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
  authenticated: boolean;
  authTimer: ReturnType<typeof setTimeout> | null;
  telnetNegotiated: boolean;     // 是否完成 TELNET 协商
  telnetBuf: Buffer;             // TELNET 子协商缓冲
  terminalCols: number;          // 客户端终端列数
  terminalRows: number;          // 客户端终端行数
  authAttempts: number;          // 认证尝试次数
  authBuffer: string;            // 认证输入缓冲（逐字符累加直到回车）
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
  private sshClient: Client | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private dataCallbacks: Set<(data: Buffer) => void> = new Set();
  private stateCallbacks: Set<(state: ConnectionState) => void> = new Set();
  private errorCallbacks: Set<(error: Error) => void> = new Set();
  private closeCallbacks: Set<(code?: number) => void> = new Set();
  // 共享的数据源连接
  private sharedConnection: IConnection | null = null;
  private ownsSharedConnection = false; // 是否拥有数据源连接的生命周期
  private dataUnsubscriber: (() => void) | null = null;
  private stateUnsubscriber: (() => void) | null = null;
  private closeUnsubscriber: (() => void) | null = null;
  private errorUnsubscriber: (() => void) | null = null;
  private sshReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sshReconnectAttempts = 0;
  private isDestroyed = false;
  // 源连接是否处于断开状态（用于避免重复通知客户端）
  private sourceConnectionDown = false;
  // 写入队列：串行化多客户端写入，避免数据帧交错
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

      // 根据数据源类型获取或创建连接
      await this._resolveSourceConnection();

      // 启动TCP共享服务器
      await this.startTcpServer();

      // SSH反向隧道
      if (this.options.sshTunnel) {
        await this.setupSshTunnel();
      }

      this._setState(ConnectionState.CONNECTED);
    } catch (error) {
      this._setState(ConnectionState.ERROR);
      await this.cleanupOnError();
      throw error;
    }
  }

  /**
   * 根据配置解析数据源连接
   */
  private async _resolveSourceConnection(): Promise<void> {
    if (this.options.sourceType === 'existing' && this.options.existingConnectionId) {
      // 复用已有连接
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
      // 创建新连接
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
    this._clearSshReconnectTimer();

    if (this.tcpServer) {
      await new Promise<void>((resolve) => {
        this.tcpServer!.close(() => resolve());
      });
      this.tcpServer = null;
    }

    if (this.sshClient) {
      this.sshClient.end();
      this.sshClient = null;
    }

    this._unsubscribeSharedConnection();

    // 如果拥有数据源连接，销毁它
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

    // 监听共享连接的数据 -> 转发给所有客户端
    this.dataUnsubscriber = this.sharedConnection.onData((data) => {
      this.clients.forEach((clientInfo) => {
        if (!clientInfo.socket.destroyed && clientInfo.authenticated) {
          clientInfo.socket.write(data);
        }
      });
      this.dataCallbacks.forEach((cb) => cb(data));
    });

    // 监听共享连接的状态变化
    this.stateUnsubscriber = this.sharedConnection.onStateChange((state) => {
      if (state === ConnectionState.DISCONNECTED) {
        // 源连接断开，但可能配置了 autoReconnect 会自动恢复
        // 先不通知客户端，等确认是否进入 RECONNECTING 再通知
        // 如果 autoReconnect 开启，紧接着会收到 RECONNECTING 状态
        // 如果 autoReconnect 关闭，状态将停留在 DISCONNECTED，需要通知
        // 延迟一小段时间判断是否进入重连
        const connRef = this.sharedConnection;
        const wasDown = this.sourceConnectionDown;
        setTimeout(() => {
          // 如果状态仍是 DISCONNECTED（没有进入 RECONNECTING），说明不会自动重连
          if (connRef && this.sharedConnection === connRef && connRef.state === ConnectionState.DISCONNECTED && !wasDown) {
            this.sourceConnectionDown = true;
            this._notifyClientsConnectionDown();
          }
        }, 100);
      } else if (state === ConnectionState.RECONNECTING) {
        // 源连接正在重连，通知客户端但暂不关闭共享服务
        if (!this.sourceConnectionDown) {
          this.sourceConnectionDown = true;
          this._notifyClientsConnectionDown();
        }
      } else if (state === ConnectionState.ERROR) {
        // 源连接彻底失败，关闭共享服务
        if (!this.sourceConnectionDown) {
          this.sourceConnectionDown = true;
          this._notifyClientsConnectionDown();
        }
        this._notifyError(new Error('共享连接已断开'));
        this.close();
      } else if (state === ConnectionState.CONNECTED) {
        // 源连接恢复，通知客户端
        if (this.sourceConnectionDown) {
          this.sourceConnectionDown = false;
          this._notifyClientsConnectionRestored();
        }
      }
    });

    // 监听共享连接的关闭事件
    // 注意：对于支持自动重连的连接（如串口、SSH），stream close 不意味着连接彻底死亡
    // 仅在源连接处于 ERROR 状态（重连彻底失败）时才关闭共享服务
    // 其他情况由 onStateChange 处理
    this.closeUnsubscriber = this.sharedConnection.onClose(() => {
      if (this.sharedConnection && this.sharedConnection.state === ConnectionState.ERROR) {
        this._notifyError(new Error('共享连接已关闭'));
        this.close();
      }
      // DISCONNECTED/RECONNECTING 状态下 onClose 触发，onStateChange 已处理
    });

    // 监听共享连接的错误
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
          authenticated: !accessPassword, // 无密码则默认已认证
          authTimer: null,
          telnetNegotiated: false,
          telnetBuf: Buffer.alloc(0),
          terminalCols: 80,
          terminalRows: 24,
          authAttempts: 0,
          authBuffer: '',
        };

        // 有密码时设置认证超时
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

        // 主动 TELNET 协商：客户端连接后立即发送协商命令，使其尽快进入字符模式
        // 避免协商完成前的本地回显导致双重回显（空行）
        this._sendTelnetNegotiation(socket);
        clientInfo.telnetNegotiated = true;

        // 有密码时发送认证提示
        if (accessPassword) {
          socket.write('PASSWORD: ');
        }

        // 客户端数据处理
        socket.on('data', (data) => {
          // 未认证时处理密码验证
          if (accessPassword && !clientInfo.authenticated) {
            // 处理 TELNET 协议，提取纯用户数据
            const userData = this._processTelnetData(data, clientInfo);
            // 逐字符缓冲，等回车后再验证
            for (const byte of userData) {
              if (byte === 0x0D || byte === 0x0A) {
                // 回车/换行：验证缓冲中的密码
                const text = clientInfo.authBuffer.trim();
                clientInfo.authBuffer = '';
                if (!text) continue; // 空行忽略
                // 支持 PASSWORD:xxx 前缀或直接输入密码
                const pwd = text.startsWith('PASSWORD:') ? text.slice('PASSWORD:'.length) : text;
                if (pwd === accessPassword) {
                  clientInfo.authenticated = true;
                  if (clientInfo.authTimer) {
                    clearTimeout(clientInfo.authTimer);
                    clientInfo.authTimer = null;
                  }
                  socket.write('\r\nOK\r\n');
                } else {
                  clientInfo.authAttempts++;
                  if (clientInfo.authAttempts >= 3) {
                    socket.write('\r\nAUTH_FAILED\r\n');
                    socket.destroy();
                    this.clients.delete(address);
                  } else {
                    // 重置超时计时器，给用户更多时间重试
                    if (clientInfo.authTimer) {
                      clearTimeout(clientInfo.authTimer);
                    }
                    clientInfo.authTimer = setTimeout(() => {
                      if (!clientInfo.authenticated) {
                        socket.write('\r\nAUTH_TIMEOUT\r\n');
                        socket.destroy();
                        this.clients.delete(address);
                      }
                    }, AUTH_TIMEOUT);
                    socket.write('\r\nAUTH_FAILED, retry:\r\nPASSWORD: ');
                  }
                }
              } else if (byte === 0x7F || byte === 0x08) {
                // 退格/删除：删除最后一个字符，擦除屏幕上的 *
                clientInfo.authBuffer = clientInfo.authBuffer.slice(0, -1);
                socket.write('\b \b');
              } else if (byte >= 32 && byte < 127) {
                // 可打印字符：追加到缓冲，回显星号
                clientInfo.authBuffer += String.fromCharCode(byte);
                socket.write('*');
              }
              // 其他控制字符忽略
            }
            return; // 未认证时忽略其他数据
          }

          // 处理 TELNET 协议，提取纯用户数据
          const userData = this._processTelnetData(data, clientInfo);
          if (userData.length > 0) {
            // 已认证：加入写入队列
            this.writeQueue.push({ data: userData, clientId: address });
            this._processWriteQueue();
          }
        });

        socket.on('close', () => {
          if (clientInfo.authTimer) {
            clearTimeout(clientInfo.authTimer);
          }
          this.clients.delete(address);
        });

        socket.on('error', () => {
          if (clientInfo.authTimer) {
            clearTimeout(clientInfo.authTimer);
          }
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

  /**
   * 发送 TELNET 协商命令，使客户端进入字符模式
   * 关键：请求 WILL ECHO + WILL SUPPRESS-GA + DO SUPPRESS-GA，
   * 这样客户端不会在本地回显（避免双回显），且进入字符模式（每个按键即时发送，Tab 补全可用）
   */
  private _sendTelnetNegotiation(socket: net.Socket): void {
    const cmds: number[] = [];
    // 告诉客户端：我方将回显（服务端回显），客户端不要本地回显
    cmds.push(IAC, WILL, OPT_ECHO);
    // 抑制 Go-Ahead（字符模式的必要条件）
    cmds.push(IAC, WILL, OPT_SUPPRESS_GA);
    cmds.push(IAC, DO, OPT_SUPPRESS_GA);
    // 请求客户端报告窗口大小
    cmds.push(IAC, DO, OPT_NAWS);
    // 请求终端类型
    cmds.push(IAC, DO, OPT_TTYPE);
    // 不使用行模式
    cmds.push(IAC, DONT, OPT_LINEMODE);

    socket.write(Buffer.from(cmds));
  }

  /**
   * 处理 TELNET 协议数据，提取纯用户输入数据
   * 同时响应客户端的 TELNET 协商请求
   */
  private _processTelnetData(data: Buffer, clientInfo: ClientInfo, isReentry = false): Buffer {
    const userData: number[] = [];
    let i = 0;

    while (i < data.length) {
      if (data[i] !== IAC) {
        // TELNET 规范：CR 后必须跟 LF 或 NUL，PTTY 只需要 CR，过滤掉多余字节
        if (data[i] === 0x0D && i + 1 < data.length && (data[i + 1] === 0x0A || data[i + 1] === 0x00)) {
          userData.push(0x0D);
          i += 2;
          continue;
        }
        // 普通数据
        userData.push(data[i]);
        i++;
        continue;
      }

      // 检测到 IAC → 客户端是 TELNET 客户端，首次触发协商
      if (!clientInfo.telnetNegotiated) {
        clientInfo.telnetNegotiated = true;
        this._sendTelnetNegotiation(clientInfo.socket);
      }

      // IAC 开始
      if (i + 1 >= data.length) break;

      const cmd = data[i + 1];

      // IAC IAC → 转义为 0xFF 数据
      if (cmd === IAC) {
        userData.push(255);
        i += 2;
        continue;
      }

      // 简单两字节命令（NOP, SE 等）
      if (cmd === NOP || cmd === SE) {
        i += 2;
        continue;
      }

      // 三字节命令：WILL / WONT / DO / DONT
      if (cmd === WILL || cmd === WONT || cmd === DO || cmd === DONT) {
        if (i + 2 >= data.length) break;
        const opt = data[i + 2];
        this._handleTelnetCommand(clientInfo.socket, cmd, opt);
        i += 3;
        continue;
      }

      // 子协商：SB ... IAC SE
      if (cmd === SB) {
        if (i + 2 >= data.length) break;
        const opt = data[i + 2];

        // 查找 IAC SE 结束标记
        const sePos = findIACSE(data, i + 3);
        if (sePos === -1) {
          // 子协商不完整，暂存
          clientInfo.telnetBuf = Buffer.concat([clientInfo.telnetBuf, data.slice(i)]);
          break;
        }

        const subData = data.slice(i + 3, sePos);
        this._handleTelnetSubnegotiation(clientInfo, opt, subData);
        i = sePos + 2; // 跳过 IAC SE
        continue;
      }

      // 未知命令，跳过
      i += 2;
    }

    // 处理之前暂存的不完整子协商（防止无限递归）
    if (clientInfo.telnetBuf.length > 0 && !isReentry) {
      const combined = Buffer.concat([clientInfo.telnetBuf, data]);
      clientInfo.telnetBuf = Buffer.alloc(0);
      return this._processTelnetData(combined, clientInfo, true);
    }

    return Buffer.from(userData);
  }

  /**
   * 处理 TELNET 三字节命令
   */
  private _handleTelnetCommand(socket: net.Socket, cmd: number, opt: number): void {
    if (cmd === WILL) {
      // 客户端愿意启用某选项
      if (opt === OPT_NAWS || opt === OPT_TTYPE || opt === OPT_SUPPRESS_GA) {
        // 同意
        socket.write(Buffer.from([IAC, DO, opt]));
      } else {
        // 拒绝其他选项
        socket.write(Buffer.from([IAC, DONT, opt]));
      }
    } else if (cmd === WONT) {
      socket.write(Buffer.from([IAC, DONT, opt]));
    } else if (cmd === DO) {
      // 客户端请求我方启用某选项
      if (opt === OPT_ECHO || opt === OPT_SUPPRESS_GA) {
        socket.write(Buffer.from([IAC, WILL, opt]));
      } else {
        socket.write(Buffer.from([IAC, WONT, opt]));
      }
    } else if (cmd === DONT) {
      socket.write(Buffer.from([IAC, WONT, opt]));
    }
  }

  /**
   * 处理 TELNET 子协商
   */
  private _handleTelnetSubnegotiation(clientInfo: ClientInfo, opt: number, subData: Buffer): void {
    if (opt === OPT_NAWS) {
      // 窗口大小子协商：4 字节 (width-hi, width-lo, height-hi, height-lo)
      if (subData.length >= 4) {
        const cols = (subData[0] << 8) | subData[1];
        const rows = (subData[2] << 8) | subData[3];
        clientInfo.terminalCols = cols;
        clientInfo.terminalRows = rows;
      }
    } else if (opt === OPT_TTYPE) {
      // 终端类型子协商：第一个字节是 IS(0)，后面是终端类型字符串
      if (subData.length > 1 && subData[0] === 0) {
        // 终端类型信息已接收，无需特殊处理
      }
    }
  }

  /**
   * 串行化处理写入队列，确保同一时刻只有一个数据块写入共享连接
   */
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

  private async setupSshTunnel(): Promise<void> {
    const tunnelConfig = this.options.sshTunnel;
    if (!tunnelConfig) return;

    await this._connectSsh(tunnelConfig);
  }

  private async _connectSsh(tunnelConfig: NonNullable<ConnectionServerOptions['sshTunnel']>): Promise<void> {
    const defaultKeys = getDefaultPrivateKeys();

    // 收集所有可用的认证配置
    const authMethods: { privateKey?: Buffer; password?: string; name: string }[] = [];

    const keyNames = ['id_ed25519', 'id_rsa', 'id_ecdsa', 'id_dsa'];
    for (let i = 0; i < defaultKeys.length; i++) {
      authMethods.push({ privateKey: defaultKeys[i], name: keyNames[i] || `key-${i}` });
    }

    // 密码优先尝试（比密钥更可靠）
    if (tunnelConfig.password) {
      authMethods.unshift({ password: tunnelConfig.password, name: 'password' });
    }

    if (authMethods.length === 0) {
      throw new Error('未找到 SSH 密钥 (~/.ssh/id_*) 且未提供密码');
    }

    // 依次尝试每种认证方式
    let lastError: Error | null = null;
    let connected = false;

    for (const auth of authMethods) {
      if (connected) break;

      try {
        await new Promise<void>((connectResolve, connectReject) => {
          const client = new Client();
          let settled = false; // 防止多次 resolve/reject

          this.sshClient = client;

          const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            client.end();
            connectReject(new Error('SSH连接超时'));
          }, 15000);

          client.on('ready', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            this.sshReconnectAttempts = 0;

            // 请求远程端口转发
            client.forwardIn(
              '127.0.0.1',
              tunnelConfig.remotePort,
              (err) => {
                if (err) {
                  connectReject(new Error(`SSH隧道建立失败: ${err.message}`));
                } else {
                  connected = true;
                  connectResolve();
                }
              }
            );
          });

          client.on('tcp connection', (_info, accept) => {
            const channel = accept();
            if (!channel) return;

            // 将SSH连接转发到本地TCP服务器
            const socket = net.connect(this.options.localPort, '127.0.0.1', () => {
              channel.pipe(socket);
              socket.pipe(channel);
            });

            socket.on('error', () => {
              channel.end();
            });

            channel.on('error', () => {
              socket.end();
            });
          });

          client.on('close', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            // SSH 连接意外断开
            if (connected && !this.isDestroyed && this._state === ConnectionState.CONNECTED) {
              this._scheduleSshReconnect(tunnelConfig);
            }
          });

          client.on('error', (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            lastError = err;
            connectReject(err);
          });

          const connectConfig: {
            host: string;
            port: number;
            username: string;
            privateKey?: Buffer;
            password?: string;
            tryKeyboard?: boolean;
            readyTimeout: number;
            keepaliveInterval?: number;
            algorithms?: Record<string, string[]>;
          } = {
            host: tunnelConfig.host,
            port: tunnelConfig.port,
            username: tunnelConfig.username,
            readyTimeout: 20000,
            keepaliveInterval: 30000,
            // 兼容旧设备
            algorithms: {
              kex: [
                'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521',
                'diffie-hellman-group-exchange-sha256',
                'diffie-hellman-group14-sha256', 'diffie-hellman-group15-sha512',
                'diffie-hellman-group16-sha512', 'diffie-hellman-group17-sha512',
                'diffie-hellman-group18-sha512',
                'diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha1',
                'diffie-hellman-group1-sha1',
              ],
              serverHostKey: [
                'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384',
                'ecdsa-sha2-nistp521', 'rsa-sha2-512', 'rsa-sha2-256',
                'ssh-rsa', 'ssh-dss',
              ],
              cipher: [
                'aes128-gcm@openssh.com',
                'aes256-gcm@openssh.com', 'aes128-ctr', 'aes192-ctr', 'aes256-ctr',
                'aes128-cbc', 'aes256-cbc', '3des-cbc',
              ],
              hmac: [
                'hmac-sha2-512', 'hmac-sha2-256', 'hmac-sha1', 'hmac-sha1-96',
              ],
            },
          };

          if (auth.privateKey) {
            connectConfig.privateKey = auth.privateKey;
          } else if (auth.password) {
            connectConfig.password = auth.password;
            connectConfig.tryKeyboard = true;
          }

          client.connect(connectConfig);
        });
      } catch (err) {
        try { this.sshClient?.end(); } catch { /* ignore */ }
        this.sshClient = null;
        lastError = err as Error;
        continue;
      }
    }

    if (!connected) {
      const errorMsg = lastError?.message ?? '所有认证方式均失败';
      throw new Error(`SSH连接失败: ${errorMsg}。请检查密钥或密码是否正确。`);
    }
  }

  private _scheduleSshReconnect(tunnelConfig: NonNullable<ConnectionServerOptions['sshTunnel']>): void {
    if (this.isDestroyed || this.sshReconnectAttempts >= SSH_RECONNECT_MAX_ATTEMPTS) {
      this._notifyError(new Error(`SSH隧道断开，已达到最大重连次数 (${SSH_RECONNECT_MAX_ATTEMPTS})`));
      return;
    }

    const delay = SSH_RECONNECT_BASE_DELAY * Math.pow(2, this.sshReconnectAttempts);
    this.sshReconnectAttempts++;

    this.sshReconnectTimer = setTimeout(async () => {
      if (this.isDestroyed || this._state !== ConnectionState.CONNECTED) return;

      try {
        this.sshClient = null;
        await this._connectSsh(tunnelConfig);
      } catch {
        // 重连失败，继续尝试
        this._scheduleSshReconnect(tunnelConfig);
      }
    }, delay);
  }

  private _clearSshReconnectTimer(): void {
    if (this.sshReconnectTimer) {
      clearTimeout(this.sshReconnectTimer);
      this.sshReconnectTimer = null;
    }
  }

  async close(): Promise<void> {
    this._clearSshReconnectTimer();

    // 清理写入队列
    this.writeQueue = [];
    this.isWriting = false;

    // 关闭所有客户端连接（清理认证计时器）
    for (const [, clientInfo] of this.clients) {
      if (clientInfo.authTimer) {
        clearTimeout(clientInfo.authTimer);
      }
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
    this._unsubscribeSharedConnection();

    // 如果拥有数据源连接，销毁它
    if (this.ownsSharedConnection && this.sharedConnection) {
      try {
        await ConnectionFactory.destroy(this.sharedConnection.id);
      } catch { /* ignore */ }
    }

    // 清空共享连接引用（如果不拥有则不关闭它）
    this.sharedConnection = null;
    this.ownsSharedConnection = false;
    this.sourceConnectionDown = false;

    this._setState(ConnectionState.DISCONNECTED);
  }

  destroy(): void {
    this.isDestroyed = true;
    this._clearSshReconnectTimer();
    this.close().catch(() => {});
    this.dataCallbacks.clear();
    this.stateCallbacks.clear();
    this.errorCallbacks.clear();
    this.closeCallbacks.clear();
  }

  write(data: Buffer | string): void {
    // 将字符串转换为 Buffer
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

  /**
   * 获取服务状态
   */
  getStatus(): {
    running: boolean;
    sourceType: 'existing' | 'new';
    sourceDescription: string;
    localPort: number;
    listenAddress: string;
    clientCount: number;
    clients: string[];
    sshTunnelConnected: boolean;
    hasPassword: boolean;
  } {
    // 生成数据源描述
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
      sshTunnelConnected: this.sshClient !== null,
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

  /**
   * 通知所有已认证客户端：源连接已断开/正在重连
   */
  private _notifyClientsConnectionDown(): void {
    const msg = '\r\n\x1b[33m--- 共享连接已断开，等待重连... ---\x1b[0m\r\n';
    this.clients.forEach((clientInfo) => {
      if (!clientInfo.socket.destroyed && clientInfo.authenticated) {
        clientInfo.socket.write(msg);
      }
    });
  }

  /**
   * 通知所有已认证客户端：源连接已恢复
   */
  private _notifyClientsConnectionRestored(): void {
    const msg = '\r\n\x1b[32m--- 共享连接已恢复 ---\x1b[0m\r\n';
    this.clients.forEach((clientInfo) => {
      if (!clientInfo.socket.destroyed && clientInfo.authenticated) {
        clientInfo.socket.write(msg);
      }
    });
  }
}
