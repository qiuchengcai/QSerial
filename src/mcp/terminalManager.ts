/**
 * MCP 终端管理器
 * 管理 MCP 建立的串口和 SSH 连接
 */

import { SerialPort } from 'serialport';
import { Client, ClientChannel } from 'ssh2';
import * as iconv from 'iconv-lite';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import {
    TerminalInfo,
    TerminalConnectConfig,
    PortInfo,
    ReadOptions,
    WaitOptions,
    ReadMode,
    PatternType
} from './types';

/** 状态文件路径 */
const STATUS_DIR = path.join(os.homedir(), '.qserial');
const STATUS_FILE = path.join(STATUS_DIR, 'status.json');
const DATA_DIR = path.join(STATUS_DIR, 'data');

/** 终端基类 */
interface BaseTerminal {
    id: string;
    type: 'serial' | 'ssh';
    connected: boolean;
    connectedAt: Date;
    encoding: string;
    buffer: Buffer[];
    bufferSize: number;
}

/** 串口终端 */
interface SerialTerminal extends BaseTerminal {
    type: 'serial';
    port: SerialPort;
    path: string;
    baudRate: number;
}

/** SSH 终端 */
interface SSHTerminal extends BaseTerminal {
    type: 'ssh';
    client: Client;
    shell?: ClientChannel;
    host: string;
    port: number;
    username: string;
}

type ManagedTerminal = SerialTerminal | SSHTerminal;

/**
 * MCP 终端管理器
 */
export class MCPTerminalManager {
    private terminals: Map<string, ManagedTerminal> = new Map();
    private maxBufferSize: number = 1024 * 1024; // 1MB

    constructor() {
        this.ensureStatusDir();
    }

    private ensureStatusDir(): void {
        if (!fs.existsSync(STATUS_DIR)) {
            fs.mkdirSync(STATUS_DIR, { recursive: true });
        }
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    }

    /**
     * 获取数据文件路径
     */
    private getDataFilePath(id: string): string {
        return path.join(DATA_DIR, `${id}.log`);
    }

    /**
     * 写入数据到共享文件（供 QSerial 扩展读取）
     */
    private writeDataToFile(id: string, data: Buffer, direction: 'send' | 'recv'): void {
        try {
            const filePath = this.getDataFilePath(id);
            const timestamp = Date.now();
            const prefix = direction === 'send' ? '\x1b[33m' : '\x1b[36m'; // 黄色=发送, 青色=接收
            const label = direction === 'send' ? '[MCP 发送] ' : '';
            const line = `${prefix}${label}${data.toString('utf8')}\x1b[0m\n`;
            fs.appendFileSync(filePath, JSON.stringify({ timestamp, direction, data: data.toString('base64') }) + '\n');
        } catch (err) {
            // 忽略写入错误
        }
    }

    /**
     * 生成唯一终端 ID
     */
    private generateId(prefix: string): string {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 连接串口
     */
    async connectSerial(config: TerminalConnectConfig): Promise<string> {
        const { path: portPath, baudRate = 115200, dataBits = 8, stopBits = 1, parity = 'none', encoding = 'gbk' } = config;

        if (!portPath) {
            throw new Error('串口路径不能为空');
        }

        const id = this.generateId('serial');

        return new Promise((resolve, reject) => {
            const port = new SerialPort({
                path: portPath,
                baudRate,
                dataBits,
                stopBits,
                parity,
                autoOpen: false
            });

            port.open((err) => {
                if (err) {
                    reject(err instanceof Error ? err : new Error(String(err)));
                    return;
                }

                const terminal: SerialTerminal = {
                    id,
                    type: 'serial',
                    port,
                    path: portPath,
                    baudRate,
                    connected: true,
                    connectedAt: new Date(),
                    encoding,
                    buffer: [],
                    bufferSize: 0
                };

                // 监听数据
                port.on('data', (data: Buffer) => {
                    this.addData(id, data);
                });

                port.on('error', (err: Error) => {
                    console.error(`Serial error: ${err.message}`);
                    this.disconnect(id);
                });

                port.on('close', () => {
                    this.disconnect(id);
                });

                this.terminals.set(id, terminal);
                this.updateStatusFile();
                resolve(id);
            });
        });
    }

    /**
     * 连接 SSH
     */
    async connectSSH(config: TerminalConnectConfig): Promise<string> {
        const { host, port = 22, username, password, privateKey, passphrase, encoding = 'utf8' } = config;

;

        if (!host || !username) {
            throw new Error('SSH 主机和用户名不能为空');
        }

        const id = this.generateId('ssh');

        return new Promise((resolve, reject) => {
            const client = new Client();
            const connConfig: any = {
                host,
                port,
                username,
                readyTimeout: 10000
            };

            if (password) {
                connConfig.password = password;
            } else if (privateKey) {
                // 处理私钥
                try {
                    if (fs.existsSync(privateKey)) {
                        connConfig.privateKey = fs.readFileSync(privateKey);
                    } else {
                        connConfig.privateKey = privateKey;
                    }
                } catch (err) {
                    // 可能是私钥内容
                    connConfig.privateKey = privateKey;
                }
            }

            if (passphrase) {
                connConfig.passphrase = passphrase;
            }

            client.on('ready', () => {
                const terminal: SSHTerminal = {
                    id,
                    type: 'ssh',
                    client,
                    host,
                    port,
                    username,
                    connected: true,
                    connectedAt: new Date(),
                    encoding,
                    buffer: [],
                    bufferSize: 0
                };

                // 启动 shell
                client.shell((err, stream) => {
                    if (err) {
                        client.end();
                        reject(err instanceof Error ? err : new Error(String(err)));
                        return;
                    }

                    terminal.shell = stream;

                    // 监听数据
                    stream.on('data', (data: Buffer) => {
                        this.addData(id, data);
                    });

                    stream.stderr.on('data', (data: Buffer) => {
                        this.addData(id, data);
                    });

                    stream.on('close', () => {
                        this.disconnect(id);
                    });

                    this.terminals.set(id, terminal);
                    this.updateStatusFile();
                    resolve(id);
                });
            });

            client.on('error', (err: Error) => {
                reject(err instanceof Error ? err : new Error(String(err)));
            });

            client.connect(connConfig);
        });
    }

    /**
     * 通用连接方法
     */
    async connect(config: TerminalConnectConfig): Promise<string> {
        if (config.type === 'serial') {
            return this.connectSerial(config);
        } else {
            return this.connectSSH(config);
        }
    }

    /**
     * 断开连接
     */
    disconnect(id: string): boolean {
        const terminal = this.terminals.get(id);
        if (!terminal) {
            return false;
        }

        try {
            if (terminal.type === 'serial') {
                if (terminal.port.isOpen) {
                    terminal.port.close();
                }
            } else {
                if (terminal.shell) {
                    terminal.shell.end();
                }
                if (terminal.client) {
                    terminal.client.end();
                }
            }
        } catch (err) {
            console.error(`Disconnect error: ${err}`);
        }

        this.terminals.delete(id);
        this.updateStatusFile();
        return true;
    }

    /**
     * 发送数据
     */
    async send(id: string, data: string, appendNewline = true): Promise<void> {
        const terminal = this.terminals.get(id);
        if (!terminal || !terminal.connected) {
            throw new Error('终端未连接');
        }

        const payload = appendNewline ? data + '\n' : data;
        const buffer = iconv.encode(payload, terminal.encoding);

        // 写入发送数据到共享文件
        this.writeDataToFile(id, buffer, 'send');

        if (terminal.type === 'serial') {
            return new Promise((resolve, reject) => {
                terminal.port.write(buffer, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        } else if (terminal.shell) {
            terminal.shell.write(buffer);
        }
    }

    /**
     * 发送控制信号（如 Ctrl+C）
     * @param signal 控制信号: 'SIGINT' (Ctrl+C), 'SIGQUIT' (Ctrl+D), 'SIGTSTP' (Ctrl+Z)
     */
    async sendSignal(id: string, signal: 'SIGINT' | 'SIGQUIT' | 'SIGTSTP' | 'SIGTERM'): Promise<void> {
        const terminal = this.terminals.get(id);
        if (!terminal || !terminal.connected) {
            throw new Error('终端未连接');
        }

        if (terminal.type === 'ssh' && terminal.shell) {
            // SSH 支持发送信号
            const signalMap: Record<string, string> = {
                'SIGINT': '\x03',   // Ctrl+C
                'SIGQUIT': '\x04',  // Ctrl+D
                'SIGTSTP': '\x1a',  // Ctrl+Z
                'SIGTERM': '\x03'   // 默认用 Ctrl+C
            };
            terminal.shell.write(signalMap[signal] || '\x03');
        } else if (terminal.type === 'serial') {
            // 串口只能发送 Ctrl+C 字符
            if (signal === 'SIGINT') {
                terminal.port.write(Buffer.from('\x03'));
            }
        }
    }

    /**
     * 流式读取 - 获取最新数据但不清除缓冲
     * 适合持续输出的命令如 top
     */
    readStream(id: string, since?: number): { data: string; timestamp: number } {
        const terminal = this.terminals.get(id);
        if (!terminal) {
            throw new Error('终端不存在');
        }

        // 获取时间戳之后的数据
        const now = Date.now();
        const cutoff = since || 0;

        // 简化实现：返回当前缓冲区内容
        const result = Buffer.concat(terminal.buffer);
        const data = iconv.decode(result, terminal.encoding);

        return {
            data,
            timestamp: now
        };
    }

    /**
     * 清除缓冲区
     */
    clearBuffer(id: string): void {
        const terminal = this.terminals.get(id);
        if (!terminal) return;

        terminal.buffer = [];
        terminal.bufferSize = 0;
    }

    /**
     * 解析 ANSI 控制码，提取纯文本
     * 处理 top 等命令的屏幕刷新
     */
    parseANSI(text: string): string {
        // 移除 ANSI 控制序列
        // 常见模式: ESC[...m (颜色), ESC[...H (光标), ESC[2J (清屏)
        const ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012]|\r/g;
        return text.replace(ansiRegex, '');
    }

    /**
     * 获取屏幕快照 - 尝试解析 ANSI 输出为屏幕内容
     * 对于 top 等持续刷新的命令
     */
    getScreenSnapshot(id: string): string {
        const terminal = this.terminals.get(id);
        if (!terminal) {
            throw new Error('终端不存在');
        }

        const result = Buffer.concat(terminal.buffer);
        const rawText = iconv.decode(result, terminal.encoding);

        // 解析 ANSI 控制码
        const cleanText = this.parseANSI(rawText);

        // 尝试提取最后一帧内容（简化实现）
        // 实际 ANSI 终端模拟需要更复杂的处理
        const lines = cleanText.split('\n');
        return lines.slice(-50).join('\n'); // 返回最后50行
    }

    /**
     * 添加数据到缓冲区
     */
    private addData(id: string, data: Buffer): void {
        const terminal = this.terminals.get(id);
        if (!terminal) return;

        terminal.buffer.push(data);
        terminal.bufferSize += data.length;

        // 写入接收数据到共享文件
        this.writeDataToFile(id, data, 'recv');

        // 限制缓冲区大小
        while (terminal.bufferSize > this.maxBufferSize && terminal.buffer.length > 0) {
            const removed = terminal.buffer.shift()!;
            terminal.bufferSize -= removed.length;
        }
    }

    /**
     * 读取数据
     */
    read(id: string, options: ReadOptions = {}): string {
        const terminal = this.terminals.get(id);
        if (!terminal) {
            throw new Error('终端不存在');
        }

        const {
            mode = 'new',
            lines = 50,
            bytes = 4096,
            clear = true
        } = options;

        let result = '';

        switch (mode) {
            case 'new':
                result = this.readNew(terminal, bytes);
                break;
            case 'all':
                result = this.readAll(terminal);
                break;
            case 'lines':
                result = this.readLines(terminal, lines);
                break;
            case 'screen':
                result = this.readLines(terminal, lines);
                break;
        }

        if (clear) {
            terminal.buffer = [];
            terminal.bufferSize = 0;
        }

        return result;
    }

    /**
     * 读取新数据
     */
    private readNew(terminal: ManagedTerminal, bytes: number): string {
        let result = Buffer.alloc(0);
        let remaining = bytes;

        for (let i = 0; i < terminal.buffer.length && remaining > 0; i++) {
            const chunk = terminal.buffer[i];
            if (chunk.length <= remaining) {
                result = Buffer.concat([result, chunk]);
                remaining -= chunk.length;
            } else {
                result = Buffer.concat([result, chunk.subarray(0, remaining)]);
                remaining = 0;
            }
        }

        return iconv.decode(result, terminal.encoding);
    }

    /**
     * 读取所有数据
     */
    private readAll(terminal: ManagedTerminal): string {
        const result = Buffer.concat(terminal.buffer);
        return iconv.decode(result, terminal.encoding);
    }

    /**
     * 读取指定行数
     */
    private readLines(terminal: ManagedTerminal, count: number): string {
        const all = this.readAll(terminal);
        const lines = all.split('\n');
        return lines.slice(-count).join('\n');
    }

    /**
     * 等待数据匹配
     */
    async wait(id: string, options: WaitOptions): Promise<string> {
        const terminal = this.terminals.get(id);
        if (!terminal) {
            throw new Error('终端不存在');
        }

        const {
            pattern,
            patternType = 'regex',
            timeout = 10000
        } = options;

        const startTime = Date.now();
        let output = '';

        while (Date.now() - startTime < timeout) {
            output = this.readAll(terminal);

            const matched = this.checkMatch(output, pattern, patternType);
            if (matched) {
                terminal.buffer = [];
                terminal.bufferSize = 0;
                return output;
            }

            await this.sleep(100);
        }

        throw new Error(`等待超时: ${timeout}ms`);
    }

    /**
     * 检查匹配
     */
    private checkMatch(output: string, pattern: string, patternType: PatternType): boolean {
        if (patternType === 'regex') {
            try {
                const regex = new RegExp(pattern);
                return regex.test(output);
            } catch (err) {
                return false;
            }
        } else {
            return output.includes(pattern);
        }
    }

    /**
     * 睡眠
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 获取终端信息
     */
    getTerminalInfo(id: string): TerminalInfo | undefined {
        const terminal = this.terminals.get(id);
        if (!terminal) return undefined;

        const base: TerminalInfo = {
            id: terminal.id,
            type: terminal.type,
            connected: terminal.connected,
            connectedAt: terminal.connectedAt,
            encoding: terminal.encoding
        };

        if (terminal.type === 'serial') {
            return {
                ...base,
                path: terminal.path,
                baudRate: terminal.baudRate
            };
        } else {
            return {
                ...base,
                host: terminal.host,
                port: terminal.port,
                username: terminal.username
            };
        }
    }

    /**
     * 获取所有终端
     */
    getAllTerminals(): TerminalInfo[] {
        return Array.from(this.terminals.keys())
            .map(id => this.getTerminalInfo(id))
            .filter(Boolean) as TerminalInfo[];
    }

    /**
     * 列出可用串口
     */
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
        } catch (err) {
            return [];
        }
    }

    /**
     * 更新状态文件
     */
    private updateStatusFile(): void {
        try {
            const status = {
                version: 1,
                terminals: this.getAllTerminals().map(t => ({
                    ...t,
                    connectedAt: t.connectedAt.toISOString()
                })),
                updatedAt: new Date().toISOString()
            };

            fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
        } catch (err) {
            console.error('Failed to update status file:', err);
        }
    }

    /**
     * 清理所有连接
     */
    dispose(): void {
        for (const id of this.terminals.keys()) {
            this.disconnect(id);
        }
    }
}