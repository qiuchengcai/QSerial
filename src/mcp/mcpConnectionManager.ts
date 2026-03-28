/**
 * MCP 连接管理器
 * 管理 MCP 建立的连接，与 QSerial 扩展的 UI 同步
 */

import * as vscode from 'vscode';
import { TerminalStatusInfo } from './statusListener';
import { SerialManager } from '../serial/serialManager';
import { TerminalManager } from '../terminal/terminalManager';
import { StatusBarManager } from '../statusBar/statusBarManager';
import { Logger } from '../utils/logger';

/**
 * MCP 连接信息
 * 用于在 QSerial 扩展中跟踪 MCP 建立的连接
 */
export interface MCPConnection {
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

/** MCP 虚拟终端信息 */
interface MCPVirtualTerminal {
    terminal: vscode.Terminal;
    writeEmitter: vscode.EventEmitter<string>;
}

/**
 * MCP 连接管理器
 * 监听 MCP 状态变化，更新 QSerial 扩展的 UI
 */
export class MCPConnectionManager implements vscode.Disposable {
    private mcpConnections: Map<string, MCPConnection> = new Map();
    private virtualTerminals: Map<string, MCPVirtualTerminal> = new Map();

    constructor(
        private serialManager: SerialManager,
        private terminalManager: TerminalManager,
        private statusBarManager: StatusBarManager
    ) {
        Logger.info('MCPConnectionManager 已初始化');
    }

    /**
     * 处理 MCP 连接事件
     */
    handleConnected(info: TerminalStatusInfo): void {
        Logger.info(`MCP 连接事件: ${info.type} - ${info.id}`);

        // 创建 MCP 连接记录
        const connection: MCPConnection = {
            id: info.id,
            type: info.type,
            path: info.path,
            baudRate: info.baudRate,
            host: info.host,
            port: info.port,
            username: info.username,
            connected: true,
            connectedAt: info.connectedAt,
            encoding: info.encoding,
        };

        this.mcpConnections.set(info.id, connection);

        // 更新 UI
        if (info.type === 'serial') {
            this.updateSerialUI(info);
        } else {
            this.updateSSHUI(info);
        }

        // 显示通知
        const target = info.type === 'serial' 
            ? info.path 
            : `${info.username}@${info.host}`;
        vscode.window.showInformationMessage(`MCP 已连接: ${target}`);
    }

    /**
     * 处理 MCP 断开事件
     */
    handleDisconnected(info: TerminalStatusInfo): void {
        Logger.info(`MCP 断开事件: ${info.type} - ${info.id}`);

        // 移除 MCP 连接记录
        this.mcpConnections.delete(info.id);

        // 关闭虚拟终端
        const vt = this.virtualTerminals.get(info.id);
        if (vt) {
            vt.terminal.dispose();
            vt.writeEmitter.dispose();
            this.virtualTerminals.delete(info.id);
        }

        // 更新 UI
        this.statusBarManager.update();

        // 显示通知
        const target = info.type === 'serial' 
            ? info.path 
            : `${info.username}@${info.host}`;
        vscode.window.showInformationMessage(`MCP 已断开: ${target}`);
    }

    /**
     * 更新串口 UI
     */
    private updateSerialUI(info: TerminalStatusInfo): void {
        Logger.info(`更新串口 UI: ${info.path} @ ${info.baudRate}`);
        
        // 创建虚拟终端显示 MCP 连接状态
        this.createMCPTerminal(info);
        
        // 更新状态栏显示
        this.statusBarManager.update();
    }

    /**
     * 更新 SSH UI
     */
    private updateSSHUI(info: TerminalStatusInfo): void {
        Logger.info(`SSH UI 更新: ${info.username}@${info.host}`);
        
        // 创建虚拟终端显示 MCP SSH 连接状态
        this.createMCPTerminal(info);
        
        // 更新状态栏
        this.statusBarManager.update();
    }

    /**
     * 创建 MCP 虚拟终端
     * 使用 Pseudoterminal 实现，不连接真实串口
     */
    private createMCPTerminal(info: TerminalStatusInfo): void {
        // 如果已有终端，先关闭
        const existing = this.virtualTerminals.get(info.id);
        if (existing) {
            existing.terminal.dispose();
            existing.writeEmitter.dispose();
        }

        const writeEmitter = new vscode.EventEmitter<string>();
        const closeEmitter = new vscode.EventEmitter<number | void>();

        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            onDidClose: closeEmitter.event,
            open: () => {
                const target = info.type === 'serial'
                    ? `${info.path} @ ${info.baudRate}`
                    : `${info.username}@${info.host}`;
                writeEmitter.fire(`\x1b[32m✓ MCP 已连接: ${target}\x1b[0m\r\n`);
                writeEmitter.fire(`\x1b[90m此终端由 CodeBuddy 通过 MCP 管理\x1b[0m\r\n`);
                writeEmitter.fire(`\x1b[90m串口数据在 MCP 服务端处理\x1b[0m\r\n\r\n`);
            },
            close: () => {
                Logger.info(`MCP 虚拟终端关闭: ${info.id}`);
            },
            handleInput: (data: string) => {
                // MCP 虚拟终端不处理用户输入
                // 串口由 MCP 服务端管理
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

        this.virtualTerminals.set(info.id, { terminal, writeEmitter });
        Logger.info(`MCP 虚拟终端已创建: ${terminalName}`);
    }

    /**
     * 获取所有 MCP 连接
     */
    getConnections(): MCPConnection[] {
        return Array.from(this.mcpConnections.values());
    }

    /**
     * 获取指定的 MCP 连接
     */
    getConnection(id: string): MCPConnection | undefined {
        return this.mcpConnections.get(id);
    }

    /**
     * 检查是否有 MCP 连接
     */
    hasMCPConnections(): boolean {
        return this.mcpConnections.size > 0;
    }

    /**
     * 检查是否有指定类型的 MCP 连接
     */
    hasMCPConnectionOfType(type: 'serial' | 'ssh'): boolean {
        for (const conn of this.mcpConnections.values()) {
            if (conn.type === type && conn.connected) {
                return true;
            }
        }
        return false;
    }

    dispose(): void {
        // 清理所有虚拟终端
        for (const [id, vt] of this.virtualTerminals) {
            vt.terminal.dispose();
            vt.writeEmitter.dispose();
        }
        this.virtualTerminals.clear();
        
        this.mcpConnections.clear();
        Logger.info('MCPConnectionManager 已销毁');
    }
}