import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import { Logger } from '../utils/logger';
import { TerminalLogger } from './terminalLogger';

interface SSHTerminal {
    terminal: vscode.Terminal;
    writeEmitter: vscode.EventEmitter<string>;
    onInput: (data: string) => void;
}

export class TerminalManager {
    private serialTerminal: vscode.Terminal | null = null;
    private serialWriteEmitter: vscode.EventEmitter<string> | null = null;
    private serialOnInput: ((data: string) => void) | null = null;
    private serialTerminalName: string | null = null;
    
    // Support multiple SSH terminals
    private sshTerminals: Map<string, SSHTerminal> = new Map();
    
    // Callback when SSH terminal is closed
    public onSSHTerminalClosed?: (terminalName: string) => void;

    // Terminal logger
    public readonly logger: TerminalLogger;

    constructor() {
        this.logger = new TerminalLogger();
    }

    createSerialTerminal(portName: string, onInput: (data: string) => void, preserveFocus?: boolean): void {
        this.closeSerialTerminal();
        
        this.serialOnInput = onInput;
        this.serialWriteEmitter = new vscode.EventEmitter<string>();
        this.serialTerminalName = `Serial: ${portName}`;

        const self = this;
        const writeEmitter = this.serialWriteEmitter;
        const closeEmitter = new vscode.EventEmitter<number | void>();
        
        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            onDidClose: closeEmitter.event,
            open: () => {
                writeEmitter.fire(`\x1b[32mConnected to ${portName}\x1b[0m\r\n`);
            },
            close: () => {
                this.serialTerminal = null;
                this.serialTerminalName = null;
                Logger.info('Serial terminal closed');
            },
            handleInput: (data: string) => {
                if (this.serialOnInput) {
                    this.serialOnInput(data);
                }
            }
        };

        const terminalOptions: vscode.ExtensionTerminalOptions = {
            name: `Serial: ${portName}`,
            pty,
            iconPath: new vscode.ThemeIcon('plug')
        };

        this.serialTerminal = vscode.window.createTerminal(terminalOptions);
        // preserveFocus 为 true 时不抢占焦点，终端显示在后台
        this.serialTerminal.show(preserveFocus !== false);
    }

    private getEncoding(): string {
        return vscode.workspace.getConfiguration('qserial.serial').get('encoding', 'gbk');
    }

    writeToSerialTerminal(data: Buffer): void {
        if (this.serialWriteEmitter) {
            const encoding = this.getEncoding();
            let str: string;

            if (encoding === 'hex') {
                str = data.toString('hex').replace(/(.{2})/g, '$1 ');
            } else {
                str = iconv.decode(data, encoding);
            }

            this.serialWriteEmitter.fire(str);

            // 写入日志
            if (this.serialTerminalName) {
                this.logger.writeToLog(this.serialTerminalName, str);
            }
        }
    }

    closeSerialTerminal(): void {
        if (this.serialTerminal) {
            this.serialTerminal.dispose();
            this.serialTerminal = null;
        }
        this.serialWriteEmitter?.dispose();
        this.serialWriteEmitter = null;
        this.serialOnInput = null;
        this.serialTerminalName = null;
    }

    getSerialTerminalName(): string | null {
        return this.serialTerminalName;
    }

    createSSHTerminal(connectionName: string, onInput: (data: string) => void, preserveFocus?: boolean): void {
        // 先关闭同名终端（如果存在）
        this.closeSSHTerminal(connectionName);
        
        const writeEmitter = new vscode.EventEmitter<string>();

        const self = this;
        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            onDidClose: new vscode.EventEmitter<number | void>().event,
            open: () => {
                writeEmitter.fire(`\x1b[32mSSH Connected: ${connectionName}\x1b[0m\r\n`);
            },
            close: () => {
                self.sshTerminals.delete(connectionName);
                Logger.info('SSH terminal closed: ' + connectionName);
                // 通知外部终端已关闭
                if (self.onSSHTerminalClosed) {
                    self.onSSHTerminalClosed(connectionName);
                }
            },
            handleInput: (data: string) => {
                const term = self.sshTerminals.get(connectionName);
                if (term?.onInput) {
                    term.onInput(data);
                }
            }
        };
        
        const terminalOptions: vscode.ExtensionTerminalOptions = {
            name: `SSH: ${connectionName}`,
            pty,
            iconPath: new vscode.ThemeIcon('terminal')
        };

        const terminal = vscode.window.createTerminal(terminalOptions);
        // preserveFocus 为 true 时不抢占焦点，终端显示在后台
        terminal.show(preserveFocus !== false);

        this.sshTerminals.set(connectionName, {
            terminal,
            writeEmitter,
            onInput
        });
    }

    private getSSHEncoding(): string {
        return vscode.workspace.getConfiguration('qserial.ssh').get('encoding', 'utf8');
    }

    writeToSSHTerminal(data: Buffer, terminalName?: string): void {
        const encoding = this.getSSHEncoding();
        let str: string;

        if (encoding === 'hex') {
            str = data.toString('hex').replace(/(.{2})/g, '$1 ');
        } else {
            str = iconv.decode(data, encoding);
        }
        
        if (terminalName) {
            const term = this.sshTerminals.get(terminalName);
            if (term) {
                term.writeEmitter.fire(str);
                // 写入日志
                this.logger.writeToLog(`SSH: ${terminalName}`, str);
            }
        } else {
            // Write to all SSH terminals
            for (const [name, term] of this.sshTerminals) {
                term.writeEmitter.fire(str);
                // 写入日志
                this.logger.writeToLog(`SSH: ${name}`, str);
            }
        }
    }

    closeSSHTerminal(terminalName?: string): void {
        if (terminalName) {
            const term = this.sshTerminals.get(terminalName);
            if (term) {
                term.terminal.dispose();
                term.writeEmitter.dispose();
                this.sshTerminals.delete(terminalName);
            }
        } else {
            // Close all SSH terminals
            for (const term of this.sshTerminals.values()) {
                term.terminal.dispose();
                term.writeEmitter.dispose();
            }
            this.sshTerminals.clear();
        }
    }

    dispose(): void {
        this.closeSerialTerminal();
        this.closeSSHTerminal();
        this.logger.dispose();
    }
}
