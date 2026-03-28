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

/**
 * MCP 连接管理器
 * 监听 MCP 状态变化，更新 QSerial 扩展的 UI
 */
export class MCPConnectionManager implements vscode.Disposable {
    private mcpConnections: Map<string, MCPConnection> = new Map();

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
        // 创建虚拟终端用于显示 MCP 连接状态
        // 注意：实际的串口数据由 MCP 服务端处理，这里只是创建一个显示终端
        const terminalName = `MCP: ${info.path}`;
        
        // 使用 TerminalManager 创建一个只读终端显示连接状态
        this.terminalManager.createSerialTerminal(info.path!, (data) => {
            // MCP 连接的终端，用户输入不会直接发送到串口
            // 因为串口由 MCP 服务端管理
            Logger.debug(`MCP 终端输入（忽略）: ${data}`);
        });

        // 写入连接提示
        this.terminalManager.writeToSerialTerminal(
            Buffer.from(`\x1b[32mMCP 已连接到 ${info.path} @ ${info.baudRate}\x1b[0m\r\n`)
        );

        // 更新状态栏
        this.statusBarManager.update();
    }

    /**
     * 更新 SSH UI
     */
    private updateSSHUI(info: TerminalStatusInfo): void {
        // SSH 连接的 UI 更新
        // 目前 QSerial 的 SSH 终端管理需要扩展
        Logger.info(`SSH UI 更新: ${info.username}@${info.host}`);
        
        // 更新状态栏
        this.statusBarManager.update();
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
        this.mcpConnections.clear();
        Logger.info('MCPConnectionManager 已销毁');
    }
}