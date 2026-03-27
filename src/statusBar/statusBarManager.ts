import * as vscode from 'vscode';
import { SerialManager } from '../serial/serialManager';
import { SSHManager } from '../ssh/sshManager';

export class StatusBarManager implements vscode.Disposable {
    private serialStatusBar: vscode.StatusBarItem;
    private sshStatusBar: vscode.StatusBarItem;
    private serialManager: SerialManager;
    private sshManager: SSHManager;

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
        } else {
            this.serialStatusBar.text = '$(plug) 串口';
            this.serialStatusBar.command = 'qserial.serial.connect';
            this.serialStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
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
        } else {
            this.sshStatusBar.text = '$(terminal) SSH';
            this.sshStatusBar.command = 'qserial.ssh.connect';
            this.sshStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.sshStatusBar.show();
        }
    }

    dispose(): void {
        this.serialStatusBar.dispose();
        this.sshStatusBar.dispose();
    }
}
