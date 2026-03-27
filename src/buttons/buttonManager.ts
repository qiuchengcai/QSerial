import * as vscode from 'vscode';
import { SerialManager } from '../serial/serialManager';
import { SSHManager } from '../ssh/sshManager';
import { Logger } from '../utils/logger';

// 单个命令项
export interface CommandItem {
    id: string;           // 命令唯一ID
    command: string;      // 命令内容
    delay?: number;       // 执行后延迟 (ms)
    description?: string; // 命令描述
}

export interface CustomButton {
    id: string;
    label: string;
    commands: CommandItem[];  // 支持多个命令
    icon?: string;
    color?: string;
    target: 'serial' | 'ssh' | 'both';
    keybinding?: string;
}

export class ButtonManager {
    private context: vscode.ExtensionContext;
    private serialManager: SerialManager;
    private sshManager: SSHManager;
    private buttons: CustomButton[] = [];

    constructor(
        context: vscode.ExtensionContext,
        serialManager: SerialManager,
        sshManager: SSHManager
    ) {
        this.context = context;
        this.serialManager = serialManager;
        this.sshManager = sshManager;
        this.loadButtons();
    }

    private loadButtons(): void {
        const config = vscode.workspace.getConfiguration('qserial.buttons');
        const rawButtons = config.get<any[]>('customButtons', []);
        
        // 兼容旧格式：将单个 command 字符串转换为 commands 数组
        this.buttons = rawButtons.map(b => {
            if (typeof b.command === 'string' && !b.commands) {
                return {
                    ...b,
                    commands: [{
                        id: `cmd-${Date.now()}`,
                        command: b.command,
                        delay: 0
                    }]
                };
            }
            return b;
        });
        
        Logger.info(`Loaded ${this.buttons.length} custom buttons`);
    }

    private async saveButtons(): Promise<void> {
        const config = vscode.workspace.getConfiguration('qserial.buttons');
        await config.update('customButtons', this.buttons, vscode.ConfigurationTarget.Global);
        Logger.info('Saved custom buttons configuration');
    }

    addButton(button: CustomButton): void {
        this.buttons.push(button);
        this.saveButtons();
    }

    removeButton(id: string): void {
        this.buttons = this.buttons.filter(b => b.id !== id);
        this.saveButtons();
    }

    updateButton(id: string, updates: Partial<CustomButton>): void {
        const index = this.buttons.findIndex(b => b.id === id);
        if (index !== -1) {
            this.buttons[index] = { ...this.buttons[index], ...updates };
            this.saveButtons();
        }
    }

    // 上移按钮
    moveButtonUp(id: string): void {
        const index = this.buttons.findIndex(b => b.id === id);
        if (index > 0) {
            [this.buttons[index - 1], this.buttons[index]] = [this.buttons[index], this.buttons[index - 1]];
            this.saveButtons();
        }
    }

    // 下移按钮
    moveButtonDown(id: string): void {
        const index = this.buttons.findIndex(b => b.id === id);
        if (index !== -1 && index < this.buttons.length - 1) {
            [this.buttons[index], this.buttons[index + 1]] = [this.buttons[index + 1], this.buttons[index]];
            this.saveButtons();
        }
    }

    // 移动到顶部
    moveButtonToTop(id: string): void {
        const index = this.buttons.findIndex(b => b.id === id);
        if (index > 0) {
            const button = this.buttons.splice(index, 1)[0];
            this.buttons.unshift(button);
            this.saveButtons();
        }
    }

    // 移动到底部
    moveButtonToBottom(id: string): void {
        const index = this.buttons.findIndex(b => b.id === id);
        if (index !== -1 && index < this.buttons.length - 1) {
            const button = this.buttons.splice(index, 1)[0];
            this.buttons.push(button);
            this.saveButtons();
        }
    }

    getButtons(): CustomButton[] {
        return [...this.buttons];
    }

    getButton(id: string): CustomButton | undefined {
        return this.buttons.find(b => b.id === id);
    }

    // 执行单个命令
    private async executeCommand(command: string, target: 'serial' | 'ssh' | 'both'): Promise<void> {
        const commandToSend = command.endsWith('\n') ? command : command + '\n';

        if (target === 'serial' || target === 'both') {
            if (this.serialManager.isConnected()) {
                await this.serialManager.send(commandToSend);
                Logger.info(`Sent command to serial: ${command}`);
            } else if (target === 'serial') {
                throw new Error('串口未连接');
            }
        }

        if (target === 'ssh' || target === 'both') {
            if (this.sshManager.isConnected()) {
                await this.sshManager.send(commandToSend);
                Logger.info(`Sent command to SSH: ${command}`);
            } else if (target === 'ssh') {
                throw new Error('SSH 未连接');
            }
        }
    }

    async executeButton(button: CustomButton): Promise<void> {
        const { commands, target } = button;

        if (!commands || commands.length === 0) {
            vscode.window.showWarningMessage('按钮没有配置命令');
            return;
        }

        try {
            for (let i = 0; i < commands.length; i++) {
                const cmd = commands[i];
                Logger.info(`Executing command ${i + 1}/${commands.length}: ${cmd.command}`);
                
                await this.executeCommand(cmd.command, target);

                // 如果有延迟且不是最后一条命令，等待
                if (cmd.delay && cmd.delay > 0 && i < commands.length - 1) {
                    await this.delay(cmd.delay);
                }
            }
        } catch (error) {
            Logger.error(`Failed to execute button: ${error}`);
            throw error;
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Import buttons from JSON
    async importButtons(json: string): Promise<void> {
        try {
            const imported = JSON.parse(json);
            if (Array.isArray(imported)) {
                this.buttons = imported.map((b, i) => ({
                    ...b,
                    id: b.id || Date.now().toString() + i,
                    commands: b.commands || (b.command ? [{
                        id: `cmd-${Date.now()}`,
                        command: b.command,
                        delay: 0
                    }] : [])
                }));
                await this.saveButtons();
            }
        } catch (error) {
            throw new Error('Invalid JSON format');
        }
    }

    // Export buttons to JSON
    exportButtons(): string {
        return JSON.stringify(this.buttons, null, 2);
    }
}
