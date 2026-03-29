/**
 * MCP 数据同步器
 * 监听 MCP 连接状态文件，用于树状图显示 MCP 连接状态
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../utils/logger';

/** 状态文件路径 */
const STATUS_DIR = path.join(os.homedir(), '.qserial');

/** MCP 连接信息（供外部查询） */
export interface MCPConnectionInfo {
    id: string;
    type: 'serial' | 'ssh';
    connected: boolean;
    path?: string;
    baudRate?: number;
    host?: string;
    port?: number;
    username?: string;
}

export class MCPDataSync implements vscode.Disposable {
    private statusWatcher: vscode.FileSystemWatcher | null = null;
    private _lastConnections: MCPConnectionInfo[] = [];

    /** 当 MCP 连接状态变化时触发 */
    onStatusChanged: ((connections: MCPConnectionInfo[]) => void) | null = null;

    constructor() {
        this.startStatusWatcher();
        Logger.info('MCPDataSync 已初始化');
    }

    /**
     * 获取当前 MCP 连接列表
     */
    getMCPConnections(): MCPConnectionInfo[] {
        return this._lastConnections;
    }

    /**
     * 监听状态文件，检测 MCP 连接状态变化
     */
    private startStatusWatcher(): void {
        if (!fs.existsSync(STATUS_DIR)) {
            fs.mkdirSync(STATUS_DIR, { recursive: true });
        }

        this.statusWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(STATUS_DIR, 'status.json')
        );

        this.statusWatcher.onDidChange(() => this.checkStatus());
        this.statusWatcher.onDidCreate(() => this.checkStatus());

        // 初始检查
        this.checkStatus();
    }

    /**
     * 检查状态文件，更新连接状态
     */
    private checkStatus(): void {
        try {
            const statusFile = path.join(STATUS_DIR, 'status.json');
            if (!fs.existsSync(statusFile)) {
                // 状态文件不存在，如果没有残留连接则无需通知
                if (this._lastConnections.length > 0) {
                    this._lastConnections = [];
                    this.notifyStatusChanged();
                }
                return;
            }

            const content = fs.readFileSync(statusFile, 'utf8');
            const status = JSON.parse(content);

            const connections: MCPConnectionInfo[] = [];

            for (const terminal of status.terminals) {
                if (terminal.connected) {
                    connections.push({
                        id: terminal.id,
                        type: terminal.type,
                        connected: true,
                        path: terminal.path,
                        baudRate: terminal.baudRate,
                        host: terminal.host,
                        port: terminal.port,
                        username: terminal.username,
                    });
                }
            }

            // 检查连接状态是否变化，通知外部
            const changed = JSON.stringify(connections) !== JSON.stringify(this._lastConnections);
            this._lastConnections = connections;
            if (changed) {
                this.notifyStatusChanged();
            }
        } catch (err) {
            Logger.error('检查 MCP 状态失败: ' + (err as Error).message);
        }
    }

    /**
     * 通知外部状态变化
     */
    private notifyStatusChanged(): void {
        if (this.onStatusChanged) {
            this.onStatusChanged(this._lastConnections);
        }
    }

    dispose(): void {
        this.statusWatcher?.dispose();
        Logger.info('MCPDataSync 已销毁');
    }
}