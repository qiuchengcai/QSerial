import * as vscode from 'vscode';
import { SerialManager } from '../serial/serialManager';
import { SSHManager } from '../ssh/sshManager';
import { Logger } from '../utils/logger';
import { MCPDataSync, MCPConnectionInfo } from '../mcp/dataSync';

export class StatusBarManager implements vscode.Disposable {
    private serialStatusBar: vscode.StatusBarItem;
    private sshStatusBar: vscode.StatusBarItem;
    private serialManager: SerialManager;
    private sshManager: SSHManager;
    private mcpDataSync: MCPDataSync | null = null;

    constructor(serialManager: SerialManager, sshManager: SSHManager) {
        this.serialManager = serialManager;
        this.sshManager = sshManager;

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
     * 设置 MCP 数据同步器引用
     */
    setMCPDataSync(mcpDataSync: MCPDataSync): void {
        this.mcpDataSync = mcpDataSync;
    }

    update(): void {
        this.updateSerialStatus();
        this.updateSSHStatus();
    }

    private updateSerialStatus(): void {
        const conn = this.serialManager.getConnectionInfo();
        
        if (conn && conn.isOpen) {
            this.serialStatusBar.text = `$(plug) ${conn.path} @ ${conn.baudRate}`;
            this.serialStatusBar.command = 'qserial.serial.disconnect';
            this.serialStatusBar.backgroundColor = undefined;
            this.serialStatusBar.show();
        } else if (this.hasMCPSerialConnection()) {
            // MCP 连接的串口
            const mcpConn = this.getMCPSerialConnection()!;
            this.serialStatusBar.text = `$(plug) ${mcpConn.path} @ ${mcpConn.baudRate} (MCP)`;
            this.serialStatusBar.command = 'qserial.serial.connect';
            this.serialStatusBar.backgroundColor = undefined;
            this.serialStatusBar.tooltip = `MCP 已连接: ${mcpConn.path} @ ${mcpConn.baudRate}`;
            this.serialStatusBar.show();
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
        const conn = this.sshManager.getConnectionInfo();
        
        if (conn && conn.isConnected) {
            this.sshStatusBar.text = `$(terminal) ${conn.username}@${conn.host}`;
            this.sshStatusBar.command = 'qserial.ssh.disconnect';
            this.sshStatusBar.backgroundColor = undefined;
            this.sshStatusBar.show();
        } else if (this.hasMCPSSHConnection()) {
            // MCP 连接的 SSH
            const mcpConn = this.getMCPSSHConnection()!;
            this.sshStatusBar.text = `$(terminal) ${mcpConn.username}@${mcpConn.host} (MCP)`;
            this.sshStatusBar.command = 'qserial.ssh.connect';
            this.sshStatusBar.backgroundColor = undefined;
            this.sshStatusBar.tooltip = `MCP 已连接: ${mcpConn.username}@${mcpConn.host}`;
            this.sshStatusBar.show();
        } else {
            // 未连接
            this.sshStatusBar.text = '$(terminal) SSH';
            this.sshStatusBar.command = 'qserial.ssh.connect';
            this.sshStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.sshStatusBar.tooltip = 'SSH 状态 - 点击连接/断开';
            this.sshStatusBar.show();
        }
    }

    private hasMCPSerialConnection(): boolean {
        return this.mcpDataSync?.getMCPConnections().some(c => c.type === 'serial' && c.connected) ?? false;
    }

    private hasMCPSSHConnection(): boolean {
        return this.mcpDataSync?.getMCPConnections().some(c => c.type === 'ssh' && c.connected) ?? false;
    }

    private getMCPSerialConnection(): MCPConnectionInfo | undefined {
        return this.mcpDataSync?.getMCPConnections().find(c => c.type === 'serial' && c.connected);
    }

    private getMCPSSHConnection(): MCPConnectionInfo | undefined {
        return this.mcpDataSync?.getMCPConnections().find(c => c.type === 'ssh' && c.connected);
    }

    dispose(): void {
        this.serialStatusBar.dispose();
        this.sshStatusBar.dispose();
    }
}
