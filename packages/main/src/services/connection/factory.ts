/**
 * 连接工厂
 * 管理所有连接实例
 * 使用动态 import 延迟加载原生模块（serialport/ssh2/node-pty），避免启动时阻塞
 */

import type { IConnection, ConnectionOptions } from '@qserial/shared';
import { EventEmitter } from 'events';

type ConnectionEventCallback = (connection: IConnection) => void;

class ConnectionFactoryImpl {
  private instances = new Map<string, IConnection>();
  private eventEmitter = new EventEmitter();

  initialize(): void {
    this.instances.clear();
  }

  async create(options: ConnectionOptions): Promise<IConnection> {
    if (this.instances.has(options.id)) {
      throw new Error(`Connection ${options.id} already exists`);
    }

    let connection: IConnection;

    switch (options.type) {
      case 'pty': {
        const { PtyConnection } = await import('./pty.js');
        connection = new PtyConnection(options);
        break;
      }
      case 'serial': {
        const { SerialConnection } = await import('./serial.js');
        connection = new SerialConnection(options);
        break;
      }
      case 'ssh': {
        const { SshConnection } = await import('./ssh.js');
        connection = new SshConnection(options);
        break;
      }
      case 'telnet': {
        const { TelnetConnection } = await import('./telnet.js');
        connection = new TelnetConnection(options);
        break;
      }
      case 'serial_server': {
        const { ConnectionServerConnection } = await import('./connectionServer.js');
        connection = new ConnectionServerConnection(options as unknown as import('@qserial/shared').ConnectionServerOptions);
        break;
      }
      case 'connection_server': {
        const { ConnectionServerConnection } = await import('./connectionServer.js');
        connection = new ConnectionServerConnection(options);
        break;
      }
      default:
        throw new Error(`Unsupported connection type: ${options.type}`);
    }

    this.instances.set(options.id, connection);
    this.eventEmitter.emit('create', connection);

    return connection;
  }

  get(id: string): IConnection | undefined {
    return this.instances.get(id);
  }

  getAll(): IConnection[] {
    return Array.from(this.instances.values());
  }

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

  async destroyAll(): Promise<void> {
    const promises = Array.from(this.instances.keys()).map((id) => this.destroy(id));
    await Promise.all(promises);
  }

  onCreate(callback: ConnectionEventCallback): () => void {
    this.eventEmitter.on('create', callback);
    return () => this.eventEmitter.off('create', callback);
  }

  onDestroy(callback: ConnectionEventCallback): () => void {
    this.eventEmitter.on('destroy', callback);
    return () => this.eventEmitter.off('destroy', callback);
  }
}

export const ConnectionFactory = new ConnectionFactoryImpl();
