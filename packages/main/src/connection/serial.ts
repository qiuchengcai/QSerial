/**
 * 串口连接实现
 */

import { SerialPort } from 'serialport';
import {
  ConnectionType,
  ConnectionState,
  type IConnection,
  type SerialConnectionOptions,
  type SerialPortInfo,
} from '@qserial/shared';
import { EventEmitter } from 'events';

export class SerialConnection implements IConnection {
  private port: SerialPort | null = null;
  private eventEmitter = new EventEmitter();
  private _state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectCount = 0;
  private sharedConnection: IConnection | null = null;
  private dataUnsubscriber: (() => void) | null = null;

  readonly id: string;
  readonly type = ConnectionType.SERIAL;
  readonly options: SerialConnectionOptions;

  constructor(options: SerialConnectionOptions) {
    this.id = options.id;
    this.options = options;
  }

  get state(): ConnectionState {
    return this._state;
  }

  async open(): Promise<void> {
    if (this.port?.isOpen) {
      throw new Error('Connection already open');
    }

    console.log('[SerialConnection] Opening connection:', this.options.path);
    this._state = ConnectionState.CONNECTING;
    this.emitStateChange();

    try {
      this.port = new SerialPort({
        path: this.options.path,
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        autoOpen: false,
      });

      await new Promise<void>((resolve, reject) => {
        this.port!.open((err) => {
          if (err) {
            console.error('[SerialConnection] Failed to open port:', err);
            reject(err);
          } else {
            console.log('[SerialConnection] Port opened successfully');
            resolve();
          }
        });
      });

      // 数据监听
      this.port.on('data', (data: Buffer) => {
        this.eventEmitter.emit('data', data);
      });

      // 错误监听
      this.port.on('error', (error: Error) => {
        console.error('[SerialConnection] Port error:', error);
        this._state = ConnectionState.ERROR;
        this.emitStateChange();
        this.eventEmitter.emit('error', error);
        this.handleReconnect();
      });

      // 关闭监听
      this.port.on('close', () => {
        console.log('[SerialConnection] Port closed');
        this._state = ConnectionState.DISCONNECTED;
        this.emitStateChange();
        this.eventEmitter.emit('close');
        this.handleReconnect();
      });

      console.log('[SerialConnection] Setting state to CONNECTED');
      this._state = ConnectionState.CONNECTED;
      this.reconnectCount = 0;
      this.emitStateChange();
    } catch (error) {
      console.error('[SerialConnection] Open failed:', error);
      this._state = ConnectionState.ERROR;
      this.emitStateChange();
      this.eventEmitter.emit('error', error);
      throw error;
    }
  }

  /**
   * 使用共享连接打开（复用已有串口）
   */
  async openWithShared(sharedConnection: IConnection): Promise<void> {
    console.log('[SerialConnection] Opening with shared connection:', sharedConnection.id);
    this.sharedConnection = sharedConnection;
    this._state = ConnectionState.CONNECTING;
    this.emitStateChange();

    try {
      // 监听共享连接的数据
      this.dataUnsubscriber = sharedConnection.onData((data) => {
        this.eventEmitter.emit('data', data);
      });

      // 监听共享连接的状态变化
      sharedConnection.onStateChange((state) => {
        if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
          this._state = state;
          this.emitStateChange();
          if (state === ConnectionState.ERROR) {
            this.eventEmitter.emit('error', new Error('Shared connection error'));
          }
        }
      });

      // 监听共享连接的错误
      sharedConnection.onError((err) => {
        this.eventEmitter.emit('error', err);
      });

      console.log('[SerialConnection] Shared connection established');
      this._state = ConnectionState.CONNECTED;
      this.emitStateChange();
    } catch (error) {
      console.error('[SerialConnection] Open with shared failed:', error);
      this._state = ConnectionState.ERROR;
      this.emitStateChange();
      this.eventEmitter.emit('error', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.cancelReconnect();

    // 取消共享连接的监听
    if (this.dataUnsubscriber) {
      this.dataUnsubscriber();
      this.dataUnsubscriber = null;
    }
    this.sharedConnection = null;

    if (this.port) {
      if (this.port.isOpen) {
        await new Promise<void>((resolve) => {
          this.port!.close(() => resolve());
        });
      }
      // 移除所有监听器
      this.port.removeAllListeners();
      this.port = null;
    }
    this._state = ConnectionState.DISCONNECTED;
    this.emitStateChange();
  }

  destroy(): void {
    this.cancelReconnect();

    // 取消共享连接的监听
    if (this.dataUnsubscriber) {
      this.dataUnsubscriber();
      this.dataUnsubscriber = null;
    }
    this.sharedConnection = null;

    if (this.port) {
      if (this.port.isOpen) {
        this.port.close(() => {});
      }
      this.port.removeAllListeners();
      this.port = null;
    }
    this._state = ConnectionState.DISCONNECTED;
    this.eventEmitter.removeAllListeners();
  }

  write(data: Buffer | string): void {
    // 将字符串转换为 Buffer，使用 UTF-8 编码以支持中文
    const bufferData = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;

    if (this.port?.isOpen) {
      this.port.write(bufferData);
    } else if (this.sharedConnection) {
      this.sharedConnection.write(bufferData);
    }
  }

  writeHex(hex: string): void {
    this.write(Buffer.from(hex, 'hex'));
  }

  resize(_cols: number, _rows: number): void {
    // 串口不支持 resize
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
      this.eventEmitter.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this._state = ConnectionState.RECONNECTING;
    this.emitStateChange();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectCount++;
      this.open().catch(() => {});
    }, interval);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectCount = 0;
  }

  /**
   * 获取可用串口列表
   */
  static async listPorts(): Promise<SerialPortInfo[]> {
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      serialNumber: p.serialNumber,
      pnpId: p.pnpId,
      locationId: p.locationId,
      productId: p.productId,
      vendorId: p.vendorId,
    }));
  }
}
