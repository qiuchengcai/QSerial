import * as vscode from 'vscode';
import { SerialManager } from '../serial/serialManager';
import { SSHManager } from '../ssh/sshManager';
import { MCPConnectionManager } from '../mcp/mcpConnectionManager';
import { Logger } from '../utils/logger';

export class StatusBarManager implements vscode.Disposable {
    private serialStatusBar: vscode.StatusBarItem;
    private sshStatusBar: vscode.StatusBarItem;
    private serialManager: SerialManager;
    private sshManager: SSHManager;
    private mcpConnectionManager?: MCPConnectionManager;

    constructor(serialManager: SerialManager, sshManager: SSHManager, mcpConnectionManager?: MCPConnectionManager) {
        this.serialManager = serialManager;
        this.sshManager = sshManager;
        this.mcpConnectionManager = mcpConnectionManager;

        // Serial status bar item
        this.serialStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.serialStatusBar.command = 'qserial.serial.connect';
        this.serialStatusBar.tooltip = '串口状态 - 点击连接/断开';

        // SSH status bar item
        this.sshStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            99
        );
        this.sshStatusBar.command = 'qserial.ssh.connect';
        this.sshStatusBar.tooltip = 'SSH 状态 - 点击连接/断开';

        this.update();
    }

    /**
     * 设置 MCP 连接管理器
     */
    setMCPConnectionManager(mcpConnectionManager: MCPConnectionManager): void {
        this.mcpConnectionManager = mcpConnectionManager;
    }

    update(): void {
        this.updateSerialStatus();
        this.updateSSHStatus();
    }

    private updateSerialStatus(): void {
        // 检查本地串口连接
        const conn = this.serialManager.getConnectionInfo();
        
        // 检查 MCP 串口连接
        const mcpSerialConnected = this.mcpConnectionManager?.hasMCPConnectionOfType('serial') ?? false;
        
        Logger.info(`updateSerialStatus: local=${!!conn && conn.isOpen}, mcp=${mcpSerialConnected}, mcpManager=${!!this.mcpConnectionManager}`);
        
        if (conn && conn.isOpen) {
            // 本地串口已连接
            this.serialStatusBar.text = `$(plug) ${conn.path} @ ${conn.baudRate}`;
            this.serialStatusBar.command = 'qserial.serial.disconnect';
            this.serialStatusBar.backgroundColor = undefined;
            this.serialStatusBar.show();
        } else if (mcpSerialConnected) {
            // MCP 串口已连接
            const mcpConnections = this.mcpConnectionManager?.getConnections() ?? [];
            const serialConn = mcpConnections.find(c => c.type === 'serial' && c.connected);
            if (serialConn) {
                this.serialStatusBar.text = `$(plug) MCP: ${serialConn.path} @ ${serialConn.baudRate}`;
                this.serialStatusBar.command = 'qserial.serial.connect'; // MCP 连接不能通过点击断开
                this.serialStatusBar.backgroundColor = undefined;
                this.serialStatusBar.tooltip = `MCP 已连接 ${serialConn.path} - 通过 CodeBuddy 管理`;
                this.serialStatusBar.show();
            }
        } else {
            // 未连接
            this.serialStatusBar.text = '$(plug) 串口';
            this.serialStatusBar.command = 'qserial.serial.connect';
            this.serialStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.serialStatusBar.tooltip = '串口状态 - 点击连接/断开';
            this.serialStatusBar.show();
        }
    }

    private updateSSHStatus(): void {
        // 检查本地 SSH 连接
        const conn = this.sshManager.getConnectionInfo();
        
        // 检查 MCP SSH 连接
        const mcpSSHConnected = this.mcpConnectionManager?.hasMCPConnectionOfType('ssh') ?? false;
        
        if (conn && conn.isConnected) {
            // 本地 SSH 已连接
            this.sshStatusBar.text = `$(terminal) ${conn.username}@${conn.host}`;
            this.sshStatusBar.command = 'qserial.ssh.disconnect';
            this.sshStatusBar.backgroundColor = undefined;
            this.sshStatusBar.show();
        } else if (mcpSSHConnected) {
            // MCP SSH 已连接
            const mcpConnections = this.mcpConnectionManager?.getConnections() ?? [];
            const sshConn = mcpConnections.find(c => c.type === 'ssh' && c.connected);
            if (sshConn) {
                this.sshStatusBar.text = `$(terminal) MCP: ${sshConn.username}@${sshConn.host}`;
                this.sshStatusBar.command = 'qserial.ssh.connect'; // MCP 连接不能通过点击断开
                this.sshStatusBar.backgroundColor = undefined;
                this.sshStatusBar.tooltip = `MCP 已连接 ${sshConn.username}@${sshConn.host} - 通过 CodeBuddy 管理`;
                this.sshStatusBar.show();
            }
        } else {
            // 未连接
            this.sshStatusBar.text = '$(terminal) SSH';
            this.sshStatusBar.command = 'qserial.ssh.connect';
            this.sshStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.sshStatusBar.tooltip = 'SSH 状态 - 点击连接/断开';
            this.sshStatusBar.show();
        }
    }

    dispose(): void {
        this.serialStatusBar.dispose();
        this.sshStatusBar.dispose();
    }
}
