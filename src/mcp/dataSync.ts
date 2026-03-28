/**
 * MCP 数据同步器
 * 监听 MCP Server 写入的数据文件，将内容显示在 QSerial 扩展的虚拟终端中
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as iconv from 'iconv-lite';
import { Logger } from '../utils/logger';

/** 数据文件路径 */
const STATUS_DIR = path.join(os.homedir(), '.qserial');
const DATA_DIR = path.join(STATUS_DIR, 'data');

/** 数据记录 */
interface DataRecord {
    timestamp: number;
    direction: 'send' | 'recv';
    data: string; // base64 编码
}

/** MCP 虚拟终端 */
interface MCPVirtualTerminal {
    terminal: vscode.Terminal;
    writeEmitter: vscode.EventEmitter<string>;
    lastPosition: number; // 文件读取位置
}

/**
 * MCP 数据同步器
 */
export class MCPDataSync implements vscode.Disposable {
    private terminals: Map<string, MCPVirtualTerminal> = new Map();
    private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
    private statusWatcher: vscode.FileSystemWatcher | null = null;
    private pollIntervals: Map<string, NodeJS.Timeout> = new Map();

    constructor() {
        this.startStatusWatcher();
        Logger.info('MCPDataSync 已初始化');
    }

    /**
     * 监听状态文件，检测新的 MCP 连接
     */
    private startStatusWatcher(): void {
        if (!fs.existsSync(STATUS_DIR)) {
            fs.mkdirSync(STATUS_DIR, { recursive: true });
        }
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        const statusFile = path.join(STATUS_DIR, 'status.json');

        this.statusWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(STATUS_DIR, 'status.json')
        );

        this.statusWatcher.onDidChange(() => this.checkStatus());
        this.statusWatcher.onDidCreate(() => this.checkStatus());

        // 初始检查
        this.checkStatus();
    }

    /**
     * 检查状态文件，创建/移除虚拟终端
     */
    private checkStatus(): void {
        try {
            const statusFile = path.join(STATUS_DIR, 'status.json');
            if (!fs.existsSync(statusFile)) return;

            const content = fs.readFileSync(statusFile, 'utf8');
            const status = JSON.parse(content);

            const activeIds = new Set<string>();

            for (const terminal of status.terminals) {
                if (terminal.connected) {
                    activeIds.add(terminal.id);
                    if (!this.terminals.has(terminal.id)) {
                        this.createVirtualTerminal(terminal.id, terminal);
                    }
                }
            }

            // 移除已断开的终端
            for (const [id] of this.terminals) {
                if (!activeIds.has(id)) {
                    this.removeVirtualTerminal(id);
                }
            }
        } catch (err) {
            Logger.error('检查 MCP 状态失败: ' + (err as Error).message);
        }
    }

    /**
     * 创建虚拟终端
     */
    private createVirtualTerminal(id: string, info: any): void {
        const writeEmitter = new vscode.EventEmitter<string>();
        const closeEmitter = new vscode.EventEmitter<number | void>();

        const target = info.type === 'serial'
            ? `${info.path} @ ${info.baudRate}`
            : `${info.username}@${info.host}`;

        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            onDidClose: closeEmitter.event,
            open: () => {
                writeEmitter.fire(`\x1b[32m✓ MCP 已连接: ${target}\x1b[0m\r\n`);
                writeEmitter.fire(`\x1b[90m此终端显示 AI 助手通过 MCP 的操作记录\x1b[0m\r\n\r\n`);
            },
            close: () => {
                Logger.info(`MCP 虚拟终端关闭: ${id}`);
            },
            handleInput: () => {
                // MCP 虚拟终端不接受用户输入
            }
        };

        const terminalName = info.type === 'serial'
            ? `MCP: ${info.path}`
            : `MCP: ${info.username}@${info.host}`;

        const terminal = vscode.window.createTerminal({
            name: terminalName,
            pty,
            iconPath: new vscode.ThemeIcon('plug'),
        });

        terminal.show();

        this.terminals.set(id, { terminal, writeEmitter, lastPosition: 0 });

        // 开始轮询数据文件
        this.startPolling(id);

        Logger.info(`MCP 虚拟终端已创建: ${terminalName}`);
    }

    /**
     * 移除虚拟终端
     */
    private removeVirtualTerminal(id: string): void {
        const vt = this.terminals.get(id);
        if (vt) {
            vt.writeEmitter.fire(`\x1b[31m✗ MCP 连接已断开\x1b[0m\r\n`);
            vt.terminal.dispose();
            vt.writeEmitter.dispose();
            this.terminals.delete(id);
        }

        // 停止轮询
        const interval = this.pollIntervals.get(id);
        if (interval) {
            clearInterval(interval);
            this.pollIntervals.delete(id);
        }

        // 停止监听
        const watcher = this.watchers.get(id);
        if (watcher) {
            watcher.dispose();
            this.watchers.delete(id);
        }
    }

    /**
     * 开始轮询数据文件
     */
    private startPolling(id: string): void {
        // 使用文件监听 + 轮询的方式
        const dataFile = path.join(DATA_DIR, `${id}.log`);

        // 创建文件监听器
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(DATA_DIR, `${id}.log`)
        );
        watcher.onDidChange(() => this.readNewData(id));
        watcher.onDidCreate(() => this.readNewData(id));
        this.watchers.set(id, watcher);

        // 同时使用轮询作为备份（文件监听可能不总是触发）
        const interval = setInterval(() => this.readNewData(id), 500);
        this.pollIntervals.set(id, interval);

        // 初始读取
        this.readNewData(id);
    }

    /**
     * 读取新数据
     */
    private readNewData(id: string): void {
        const vt = this.terminals.get(id);
        if (!vt) return;

        const dataFile = path.join(DATA_DIR, `${id}.log`);
        if (!fs.existsSync(dataFile)) return;

        try {
            const fd = fs.openSync(dataFile, 'r');
            const stat = fs.fstatSync(fd);

            if (stat.size <= vt.lastPosition) {
                fs.closeSync(fd);
                return;
            }

            const buffer = Buffer.alloc(stat.size - vt.lastPosition);
            fs.readSync(fd, buffer, 0, buffer.length, vt.lastPosition);
            fs.closeSync(fd);

            vt.lastPosition = stat.size;

            // 解析数据行
            const lines = buffer.toString('utf8').split('\n').filter(l => l.trim());
            for (const line of lines) {
                try {
                    const record: DataRecord = JSON.parse(line);
                    const data = Buffer.from(record.data, 'base64');
                    const text = data.toString('utf8');

                    if (record.direction === 'send') {
                        // 发送的数据用黄色显示
                        vt.writeEmitter.fire(`\x1b[33m${text}\x1b[0m`);
                    } else {
                        // 接收的数据正常显示
                        vt.writeEmitter.fire(text);
                    }
                } catch {
                    // 忽略解析错误
                }
            }
        } catch (err) {
            // 忽略读取错误
        }
    }

    dispose(): void {
        for (const [id] of this.terminals) {
            this.removeVirtualTerminal(id);
        }
        this.statusWatcher?.dispose();
        Logger.info('MCPDataSync 已销毁');
    }
}