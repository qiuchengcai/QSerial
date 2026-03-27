import * as vscode from 'vscode';

export class Logger {
    private static outputChannel: vscode.OutputChannel;

    static initialize(): void {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('QSerial');
        }
    }

    static info(message: string): void {
        this.log('INFO', message);
    }

    static warn(message: string): void {
        this.log('WARN', message);
    }

    static error(message: string): void {
        this.log('ERROR', message);
    }

    static debug(message: string): void {
        this.log('DEBUG', message);
    }

    private static log(level: string, message: string): void {
        if (!this.outputChannel) {
            this.initialize();
        }
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}`);
    }

    static show(): void {
        if (this.outputChannel) {
            this.outputChannel.show();
        }
    }

    static dispose(): void {
        if (this.outputChannel) {
            this.outputChannel.dispose();
        }
    }
}

// Initialize logger on module load
Logger.initialize();
