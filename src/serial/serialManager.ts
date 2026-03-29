import { SerialPort } from 'serialport';
import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import { TerminalManager } from '../terminal/terminalManager';
import { Logger } from '../utils/logger';

export interface PortInfo {
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    vendorId?: string;
    productId?: string;
}

export interface SerialConnection {
    port: SerialPort;
    path: string;
    baudRate: number;
    isOpen: boolean;
}

/** 缓冲区数据条目 */
interface BufferEntry {
    timestamp: number;
    direction: 'TX' | 'RX' | 'SYS';  // TX=发送, RX=接收, SYS=系统消息
    data: string;
}

export class SerialManager {
    private connection: SerialConnection | null = null;
    private terminalManager: TerminalManager;
    private bufferEntries: BufferEntry[] = [];  // 结构化缓冲
    private maxBufferEntries: number = 1000;    // 最大条目数
    private lastReadIndex: number = 0;          // 上次读取位置

    constructor(terminalManager: TerminalManager) {
        this.terminalManager = terminalManager;
    }

    private getEncoding(): string {
        return vscode.workspace.getConfiguration('qserial.serial').get('encoding', 'gbk');
    }

    /**
     * 添加数据到缓冲
     */
    private addToBuffer(direction: 'TX' | 'RX' | 'SYS', data: string): void {
        this.bufferEntries.push({
            timestamp: Date.now(),
            direction,
            data
        });
        
        // 限制缓冲大小
        if (this.bufferEntries.length > this.maxBufferEntries) {
            const removeCount = this.bufferEntries.length - this.maxBufferEntries;
            this.bufferEntries = this.bufferEntries.slice(removeCount);
            this.lastReadIndex = Math.max(0, this.lastReadIndex - removeCount);
        }
    }

    async listPorts(): Promise<PortInfo[]> {
        try {
            const ports = await SerialPort.list();
            return ports.map(p => ({
                path: p.path,
                manufacturer: p.manufacturer,
                serialNumber: p.serialNumber,
                vendorId: p.vendorId,
                productId: p.productId
            }));
        } catch (error) {
            Logger.error('Failed to list ports: ' + error);
            return [];
        }
    }

    async connect(path: string, baudRate: number): Promise<void> {
        if (this.connection?.isOpen) {
            await this.disconnect();
        }

        // 清空缓冲
        this.bufferEntries = [];
        this.lastReadIndex = 0;

        return new Promise((resolve, reject) => {
            const config = vscode.workspace.getConfiguration('qserial.serial');
            const dataBits = config.get<number>('dataBits', 8) as 5 | 6 | 7 | 8;
            const stopBits = config.get<number>('stopBits', 1) as 1 | 2;
            const parity = config.get<string>('parity', 'none') as 'none' | 'even' | 'odd' | 'mark' | 'space';

            const port = new SerialPort({
                path,
                baudRate,
                dataBits,
                stopBits,
                parity,
                autoOpen: false
            });

            port.open((err) => {
                if (err) {
                    Logger.error('Failed to open port: ' + err.message);
                    reject(err.message);
                    return;
                }

                this.connection = {
                    port,
                    path,
                    baudRate,
                    isOpen: true
                };

                // 记录连接信息到缓冲
                this.addToBuffer('SYS', `[连接成功] ${path} @ ${baudRate} baud`);

                // Create terminal for this connection
                this.terminalManager.createSerialTerminal(path, (data) => {
                    if (this.connection?.isOpen) {
                        const encoding = this.getEncoding();
                        const buffer = encoding === 'hex'
                            ? Buffer.from(data.replace(/\s/g, ''), 'hex')
                            : iconv.encode(data, encoding);
                        this.connection.port.write(buffer);
                        
                        // 记录发送数据到缓冲
                        this.addToBuffer('TX', data);
                    }
                });

                // Handle incoming data
                port.on('data', (data: Buffer) => {
                    // 解码数据
                    const encoding = this.getEncoding();
                    let str: string;
                    if (encoding === 'hex') {
                        str = data.toString('hex').replace(/(.{2})/g, '$1 ');
                    } else {
                        str = iconv.decode(data, encoding);
                    }
                    
                    // 记录接收数据到缓冲
                    this.addToBuffer('RX', str);
                    
                    this.terminalManager.writeToSerialTerminal(data);
                });

                port.on('error', (err) => {
                    Logger.error('Serial port error: ' + err.message);
                    this.addToBuffer('SYS', `[错误] ${err.message}`);
                    vscode.window.showErrorMessage(`Serial port error: ${err.message}`);
                });

                port.on('close', () => {
                    Logger.info('Serial port closed');
                    this.addToBuffer('SYS', `[断开连接] ${path}`);
                    this.connection = null;
                    this.terminalManager.closeSerialTerminal();
                });

                Logger.info(`Connected to ${path} at ${baudRate} baud`);
                
                const autoNewline = config.get<boolean>('autoNewline', true);
                if (autoNewline) {
                    setTimeout(() => {
                        if (this.connection?.isOpen) {
                            port.write('\n');
                        }
                    }, 100);
                }
                
                resolve();
            });
        });
    }

    async disconnect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.connection) {
                resolve();
                return;
            }

            const path = this.connection.path;
            this.connection.port.close((err) => {
                if (err) {
                    reject(err.message);
                    return;
                }
                this.addToBuffer('SYS', `[断开连接] ${path}`);
                this.connection = null;
                this.terminalManager.closeSerialTerminal();
                resolve();
            });
        });
    }

    async send(data: string | Buffer): Promise<void> {
        if (!this.connection?.isOpen) {
            throw new Error('Serial port not connected');
        }

        // 记录发送数据
        const strData = typeof data === 'string' ? data : data.toString();
        this.addToBuffer('TX', strData);

        return new Promise((resolve, reject) => {
            this.connection!.port.write(data, (err) => {
                if (err) {
                    reject(err.message);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 读取缓冲数据
     * @param mode 读取模式:
     *   - 'new': 只读取上次读取后的新数据
     *   - 'all': 读取所有缓冲数据
     *   - 'lines': 读取最近N行
     *   - 'screen': 格式化为屏幕显示样式
     */
    read(options?: { mode?: 'new' | 'all' | 'lines' | 'screen'; lines?: number; clear?: boolean }): string {
        const mode = options?.mode || 'new';
        const clear = options?.clear !== false;

        let result: string;

        switch (mode) {
            case 'new':
                // 只读取新数据
                const newEntries = this.bufferEntries.slice(this.lastReadIndex);
                result = this.formatEntries(newEntries);
                if (clear && newEntries.length > 0) {
                    this.lastReadIndex = this.bufferEntries.length;
                }
                break;
                
            case 'all':
                result = this.formatEntries(this.bufferEntries);
                if (clear) {
                    this.bufferEntries = [];
                    this.lastReadIndex = 0;
                }
                break;
                
            case 'lines':
                const lineCount = options?.lines || 50;
                const recentEntries = this.bufferEntries.slice(-lineCount);
                result = this.formatEntries(recentEntries);
                if (clear && recentEntries.length > 0) {
                    const removeCount = this.bufferEntries.length - recentEntries.length;
                    this.bufferEntries = this.bufferEntries.slice(removeCount);
                    this.lastReadIndex = Math.max(0, this.lastReadIndex - removeCount);
                }
                break;
                
            case 'screen':
                // 格式化为类似终端显示的样式
                result = this.formatAsScreen();
                if (clear) {
                    this.bufferEntries = [];
                    this.lastReadIndex = 0;
                }
                break;
                
            default:
                result = this.formatEntries(this.bufferEntries.slice(this.lastReadIndex));
                if (clear) {
                    this.lastReadIndex = this.bufferEntries.length;
                }
        }

        return result;
    }

    /**
     * 格式化条目为文本
     */
    private formatEntries(entries: BufferEntry[]): string {
        if (entries.length === 0) {
            return '';
        }
        
        return entries.map(entry => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            const prefix = entry.direction === 'TX' ? '[TX]' 
                        : entry.direction === 'RX' ? '[RX]' 
                        : '[SYS]';
            return `${time} ${prefix} ${entry.data}`;
        }).join('\n');
    }

    /**
     * 格式化为屏幕样式（类似终端显示）
     */
    private formatAsScreen(): string {
        if (this.bufferEntries.length === 0) {
            return '';
        }
        
        // 只显示 RX 和 SYS，TX 通常在终端中不显示（除非设备回显）
        return this.bufferEntries
            .filter(e => e.direction === 'RX' || e.direction === 'SYS')
            .map(e => e.data)
            .join('');
    }

    /**
     * 等待匹配特定模式
     */
    async wait(pattern: string, options?: { patternType?: 'regex' | 'string'; timeout?: number }): Promise<string | null> {
        const patternType = options?.patternType || 'regex';
        const timeout = options?.timeout || 10000;

        const regex = patternType === 'regex' ? new RegExp(pattern) : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkInterval = 50;

            const check = () => {
                // 检查所有接收数据是否匹配
                const rxData = this.bufferEntries
                    .filter(e => e.direction === 'RX')
                    .map(e => e.data)
                    .join('');
                    
                const match = rxData.match(regex);
                if (match) {
                    resolve(match[0]);
                    return;
                }

                if (Date.now() - startTime > timeout) {
                    resolve(null);
                    return;
                }

                setTimeout(check, checkInterval);
            };

            check();
        });
    }

    /**
     * 获取缓冲统计信息
     */
    getBufferStats(): { total: number; unread: number; txCount: number; rxCount: number } {
        return {
            total: this.bufferEntries.length,
            unread: this.bufferEntries.length - this.lastReadIndex,
            txCount: this.bufferEntries.filter(e => e.direction === 'TX').length,
            rxCount: this.bufferEntries.filter(e => e.direction === 'RX').length
        };
    }

    isConnected(): boolean {
        return this.connection?.isOpen ?? false;
    }

    getConnectionInfo(): SerialConnection | null {
        return this.connection;
    }
}