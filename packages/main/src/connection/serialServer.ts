/**
 * 串口服务端连接
 * 将本地串口通过TCP共享
 */

import * as net from 'net';
import { SerialPort } from 'serialport';
import {
  ConnectionType,
  ConnectionState,
  SerialServerOptions,
} from '@qserial/shared';
import type { IConnection } from '@qserial/shared';

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
  // 写入队列：串行化多客户端写入，避免数据帧交错
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

    // 监听共享连接的数据
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
      if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
        this._notifyError(new Error('共享连接已断开'));
        this.close();
      }
    });

    // 监听共享连接的关闭事件
    this.closeUnsubscriber = this.sharedConnection.onClose(() => {
      this._notifyError(new Error('共享连接已关闭'));
      this.close();
    });

    // 监听共享连接的错误
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

        // 串口数据转发到已认证的客户端
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

  /**
   * 串行化处理写入队列，确保同一时刻只有一个数据块写入串口
   */
  private _processWriteQueue(): void {
    if (this.isWriting || this.writeQueue.length === 0) return;

    this.isWriting = true;
    const item = this.writeQueue.shift()!;

    const writeTarget = this.serialPort?.isOpen ? this.serialPort : this.sharedConnection;
    if (writeTarget) {
      writeTarget.write(item.data);
      this.dataCallbacks.forEach((cb) => cb(item.data));
    }

    // Node.js serialPort.write 是异步的，但对于小数据包通常立即完成
    // 使用 setImmediate 让出执行权，允许下一个 tick 处理队列
    setImmediate(() => {
      this.isWriting = false;
      this._processWriteQueue();
    });
  }

  async close(): Promise<void> {

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

    // 取消共享连接的监听
    this._unsubscribeSharedConnection();

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

  // ============== TELNET 协商方法 ==============

  /**
   * 发送 TELNET 协商命令，使客户端进入字符模式
   */
  private _sendTelnetNegotiation(socket: net.Socket): void {
    const cmds: number[] = [];
    cmds.push(IAC, WILL, OPT_ECHO);
    cmds.push(IAC, WILL, OPT_SUPPRESS_GA);
    cmds.push(IAC, DO, OPT_SUPPRESS_GA);
    cmds.push(IAC, DO, OPT_NAWS);
    cmds.push(IAC, DO, OPT_TTYPE);
    cmds.push(IAC, DONT, OPT_LINEMODE);
    socket.write(Buffer.from(cmds));
  }

  /**
   * 处理 TELNET 协议数据，提取纯用户输入数据
   */
  private _processTelnetData(data: Buffer, clientInfo: ClientInfo, isReentry = false): Buffer {
    const userData: number[] = [];
    let i = 0;

    while (i < data.length) {
      if (data[i] !== IAC) {
        // TELNET 规范：CR 后必须跟 LF 或 NUL，PTY 只需要 CR，过滤掉多余字节
        if (data[i] === 0x0D && i + 1 < data.length && (data[i + 1] === 0x0A || data[i + 1] === 0x00)) {
          userData.push(0x0D);
          i += 2;
          continue;
        }
        userData.push(data[i]);
        i++;
        continue;
      }

      if (!clientInfo.telnetNegotiated) {
        clientInfo.telnetNegotiated = true;
        this._sendTelnetNegotiation(clientInfo.socket);
      }

      if (i + 1 >= data.length) break;

      const cmd = data[i + 1];

      if (cmd === IAC) {
        userData.push(255);
        i += 2;
        continue;
      }

      if (cmd === NOP || cmd === SE) {
        i += 2;
        continue;
      }

      if (cmd === WILL || cmd === WONT || cmd === DO || cmd === DONT) {
        if (i + 2 >= data.length) break;
        const opt = data[i + 2];
        this._handleTelnetCommand(clientInfo.socket, cmd, opt);
        i += 3;
        continue;
      }

      if (cmd === SB) {
        if (i + 2 >= data.length) break;
        const opt = data[i + 2];
        const sePos = findIACSE(data, i + 3);
        if (sePos === -1) {
          clientInfo.telnetBuf = Buffer.concat([clientInfo.telnetBuf, data.slice(i)]);
          break;
        }
        const subData = data.slice(i + 3, sePos);
        this._handleTelnetSubnegotiation(clientInfo, opt, subData);
        i = sePos + 2;
        continue;
      }

      i += 2;
    }

    if (clientInfo.telnetBuf.length > 0 && !isReentry) {
      const combined = Buffer.concat([clientInfo.telnetBuf, data]);
      clientInfo.telnetBuf = Buffer.alloc(0);
      return this._processTelnetData(combined, clientInfo, true);
    }

    return Buffer.from(userData);
  }

  private _handleTelnetCommand(socket: net.Socket, cmd: number, opt: number): void {
    if (cmd === WILL) {
      if (opt === OPT_NAWS || opt === OPT_TTYPE || opt === OPT_SUPPRESS_GA) {
        socket.write(Buffer.from([IAC, DO, opt]));
      } else {
        socket.write(Buffer.from([IAC, DONT, opt]));
      }
    } else if (cmd === WONT) {
      socket.write(Buffer.from([IAC, DONT, opt]));
    } else if (cmd === DO) {
      if (opt === OPT_ECHO || opt === OPT_SUPPRESS_GA) {
        socket.write(Buffer.from([IAC, WILL, opt]));
      } else {
        socket.write(Buffer.from([IAC, WONT, opt]));
      }
    } else if (cmd === DONT) {
      socket.write(Buffer.from([IAC, WONT, opt]));
    }
  }

  private _handleTelnetSubnegotiation(clientInfo: ClientInfo, opt: number, subData: Buffer): void {
    if (opt === OPT_NAWS) {
      if (subData.length >= 4) {
        clientInfo.terminalCols = (subData[0] << 8) | subData[1];
        clientInfo.terminalRows = (subData[2] << 8) | subData[3];
      }
    }
  }
}
