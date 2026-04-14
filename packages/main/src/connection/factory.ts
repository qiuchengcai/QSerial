/**
 * 连接工厂
 * 管理所有连接实例
 */

import type { IConnection, ConnectionOptions } from '@qserial/shared';
import { PtyConnection } from './pty.js';
import { SerialConnection } from './serial.js';
import { SshConnection } from './ssh.js';
import { TelnetConnection } from './telnet.js';
import { SerialServerConnection } from './serialServer.js';
import { EventEmitter } from 'events';

type ConnectionEventCallback = (connection: IConnection) => void;

class ConnectionFactoryImpl {
  private instances = new Map<string, IConnection>();
  private eventEmitter = new EventEmitter();

  /**
   * 初始化
   */
  initialize(): void {
    // 清理所有连接
    this.instances.clear();
  }

  /**
   * 创建连接实例
   */
  async create(options: ConnectionOptions): Promise<IConnection> {
    if (this.instances.has(options.id)) {
      throw new Error(`Connection ${options.id} already exists`);
    }

    let connection: IConnection;

    switch (options.type) {
      case 'pty':
        connection = new PtyConnection(options);
        break;
      case 'serial':
        connection = new SerialConnection(options);
        break;
      case 'ssh':
        connection = new SshConnection(options);
        break;
      case 'telnet':
        connection = new TelnetConnection(options);
        break;
      case 'serial_server':
        connection = new SerialServerConnection(options);
        break;
      default:
        throw new Error(`Unsupported connection type: ${options.type}`);
    }

    this.instances.set(options.id, connection);
    this.eventEmitter.emit('create', connection);

    return connection;
  }

  /**
   * 获取连接实例
   */
  get(id: string): IConnection | undefined {
    return this.instances.get(id);
  }

  /**
   * 获取所有连接
   */
  getAll(): IConnection[] {
    return Array.from(this.instances.values());
  }

  /**
   * 关闭并移除连接
   */
  async destroy(id: string): Promise<void> {
    const connection = this.instances.get(id);
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
      connection.destroy();
      this.instances.delete(id);
      this.eventEmitter.emit('destroy', connection);
    }
  }

  /**
   * 销毁所有连接
   */
  async destroyAll(): Promise<void> {
    const promises = Array.from(this.instances.keys()).map((id) => this.destroy(id));
    await Promise.all(promises);
  }

  /**
   * 监听连接创建
   */
  onCreate(callback: ConnectionEventCallback): () => void {
    this.eventEmitter.on('create', callback);
    return () => this.eventEmitter.off('create', callback);
  }

  /**
   * 监听连接销毁
   */
  onDestroy(callback: ConnectionEventCallback): () => void {
    this.eventEmitter.on('destroy', callback);
    return () => this.eventEmitter.off('destroy', callback);
  }
}

export const ConnectionFactory = new ConnectionFactoryImpl();
