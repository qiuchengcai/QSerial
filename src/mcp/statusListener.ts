/**
 * MCP 状态监听器
 * 监听 QMCP 写入的状态文件，同步更新 QSerial 扩展的 UI
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../utils/logger';

/** 状态文件路径 */
const STATUS_DIR = path.join(os.homedir(), '.qserial');
const STATUS_FILE = path.join(STATUS_DIR, 'status.json');

/** 终端状态信息 */
export interface TerminalStatusInfo {
    id: string;
    type: 'serial' | 'ssh';
    path?: string;
    baudRate?: number;
    host?: string;
    port?: number;
    username?: string;
    connected: boolean;
    connectedAt: string;
    encoding: string;
}

/** 状态文件格式 */
export interface StatusFile {
    version: number;
    terminals: TerminalStatusInfo[];
    updatedAt: string;
}

/** 状态变化事件 */
export interface StatusChangeEvent {
    type: 'connected' | 'disconnected';
    terminal: TerminalStatusInfo;
}

/**
 * MCP 状态监听器
 * 使用 FileSystemWatcher 监听状态文件变化
 */
export class StatusListener implements vscode.Disposable {
    private watcher: vscode.FileSystemWatcher | null = null;
    private lastStatus: StatusFile | null = null;
    private _onStatusChange: vscode.EventEmitter<StatusChangeEvent> = 
        new vscode.EventEmitter<StatusChangeEvent>();
    
    /** 状态变化事件 */
    readonly onStatusChange: vscode.Event<StatusChangeEvent> = this._onStatusChange.event;

    constructor() {
        this.startWatching();
        Logger.info('StatusListener 已初始化');
    }

    /**
     * 开始监听状态文件
     */
    private startWatching(): void {
        // 确保目录存在
        if (!fs.existsSync(STATUS_DIR)) {
            fs.mkdirSync(STATUS_DIR, { recursive: true });
        }

        // 创建文件监听器
        this.watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(STATUS_DIR, 'status.json')
        );

        // 监听文件变化
        this.watcher.onDidChange(() => this.readStatus());
        this.watcher.onDidCreate(() => this.readStatus());
        this.watcher.onDidDelete(() => this.handleFileDelete());

        // 初始读取
        this.readStatus();
    }

    /**
     * 读取状态文件
     */
    private readStatus(): void {
        try {
            if (!fs.existsSync(STATUS_FILE)) {
                return;
            }

            const content = fs.readFileSync(STATUS_FILE, 'utf8');
            const status: StatusFile = JSON.parse(content);

            // 检测变化并发射事件
            this.detectChanges(status);

            this.lastStatus = status;
        } catch (err) {
            Logger.error('读取状态文件失败: ' + (err as Error).message);
        }
    }

    /**
     * 检测状态变化
     */
    private detectChanges(newStatus: StatusFile): void {
        if (!this.lastStatus) {
            // 首次读取，所有连接都是新连接
            for (const terminal of newStatus.terminals) {
                if (terminal.connected) {
                    this._onStatusChange.fire({
                        type: 'connected',
                        terminal,
                    });
                }
            }
            return;
        }

        const oldMap = new Map(this.lastStatus.terminals.map(t => [t.id, t]));
        const newMap = new Map(newStatus.terminals.map(t => [t.id, t]));

        // 检测新连接
        for (const [id, terminal] of newMap) {
            const old = oldMap.get(id);
            if (!old && terminal.connected) {
                // 新连接
                this._onStatusChange.fire({
                    type: 'connected',
                    terminal,
                });
            } else if (old && !old.connected && terminal.connected) {
                // 从断开变为连接
                this._onStatusChange.fire({
                    type: 'connected',
                    terminal,
                });
            }
        }

        // 检测断开
        for (const [id, terminal] of oldMap) {
            const newTerm = newMap.get(id);
            if (!newTerm && terminal.connected) {
                // 已删除的连接
                this._onStatusChange.fire({
                    type: 'disconnected',
                    terminal,
                });
            } else if (newTerm && terminal.connected && !newTerm.connected) {
                // 从连接变为断开
                this._onStatusChange.fire({
                    type: 'disconnected',
                    terminal,
                });
            }
        }
    }

    /**
     * 处理文件删除
     */
    private handleFileDelete(): void {
        if (this.lastStatus) {
            // 所有连接都断开
            for (const terminal of this.lastStatus.terminals) {
                if (terminal.connected) {
                    this._onStatusChange.fire({
                        type: 'disconnected',
                        terminal,
                    });
                }
            }
        }
        this.lastStatus = null;
    }

    /**
     * 获取当前状态
     */
    getCurrentStatus(): StatusFile | null {
        return this.lastStatus;
    }

    /**
     * 获取状态文件路径
     */
    getStatusFilePath(): string {
        return STATUS_FILE;
    }

    dispose(): void {
        this.watcher?.dispose();
        this._onStatusChange.dispose();
        Logger.info('StatusListener 已销毁');
    }
}