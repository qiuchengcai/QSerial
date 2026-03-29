"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalManager = void 0;
const vscode = __importStar(require("vscode"));
const iconv = __importStar(require("iconv-lite"));
const logger_1 = require("../utils/logger");
const terminalLogger_1 = require("./terminalLogger");
class TerminalManager {
    constructor() {
        this.serialTerminal = null;
        this.serialWriteEmitter = null;
        this.serialOnInput = null;
        this.serialTerminalName = null;
        // Support multiple SSH terminals
        this.sshTerminals = new Map();
        this.logger = new terminalLogger_1.TerminalLogger();
    }
    createSerialTerminal(portName, onInput, preserveFocus) {
        this.closeSerialTerminal();
        this.serialOnInput = onInput;
        this.serialWriteEmitter = new vscode.EventEmitter();
        this.serialTerminalName = `Serial: ${portName}`;
        const self = this;
        const writeEmitter = this.serialWriteEmitter;
        const closeEmitter = new vscode.EventEmitter();
        const pty = {
            onDidWrite: writeEmitter.event,
            onDidClose: closeEmitter.event,
            open: () => {
                writeEmitter.fire(`\x1b[32mConnected to ${portName}\x1b[0m\r\n`);
            },
            close: () => {
                this.serialTerminal = null;
                this.serialTerminalName = null;
                logger_1.Logger.info('Serial terminal closed');
            },
            handleInput: (data) => {
                if (this.serialOnInput) {
                    this.serialOnInput(data);
                }
            }
        };
        const terminalOptions = {
            name: `Serial: ${portName}`,
            pty,
            iconPath: new vscode.ThemeIcon('plug')
        };
        this.serialTerminal = vscode.window.createTerminal(terminalOptions);
        // preserveFocus 为 true 时不抢占焦点，终端显示在后台
        this.serialTerminal.show(preserveFocus !== false);
    }
    getEncoding() {
        return vscode.workspace.getConfiguration('qserial.serial').get('encoding', 'gbk');
    }
    writeToSerialTerminal(data) {
        if (this.serialWriteEmitter) {
            const encoding = this.getEncoding();
            let str;
            if (encoding === 'hex') {
                str = data.toString('hex').replace(/(.{2})/g, '$1 ');
            }
            else {
                str = iconv.decode(data, encoding);
            }
            this.serialWriteEmitter.fire(str);
            // 写入日志
            if (this.serialTerminalName) {
                this.logger.writeToLog(this.serialTerminalName, str);
            }
        }
    }
    closeSerialTerminal() {
        if (this.serialTerminal) {
            this.serialTerminal.dispose();
            this.serialTerminal = null;
        }
        this.serialWriteEmitter?.dispose();
        this.serialWriteEmitter = null;
        this.serialOnInput = null;
        this.serialTerminalName = null;
    }
    getSerialTerminalName() {
        return this.serialTerminalName;
    }
    createSSHTerminal(connectionName, onInput, preserveFocus) {
        // 先关闭同名终端（如果存在）
        this.closeSSHTerminal(connectionName);
        const writeEmitter = new vscode.EventEmitter();
        const self = this;
        const pty = {
            onDidWrite: writeEmitter.event,
            onDidClose: new vscode.EventEmitter().event,
            open: () => {
                writeEmitter.fire(`\x1b[32mSSH Connected: ${connectionName}\x1b[0m\r\n`);
            },
            close: () => {
                self.sshTerminals.delete(connectionName);
                logger_1.Logger.info('SSH terminal closed: ' + connectionName);
                // 通知外部终端已关闭
                if (self.onSSHTerminalClosed) {
                    self.onSSHTerminalClosed(connectionName);
                }
            },
            handleInput: (data) => {
                const term = self.sshTerminals.get(connectionName);
                if (term?.onInput) {
                    term.onInput(data);
                }
            }
        };
        const terminalOptions = {
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
    getSSHEncoding() {
        return vscode.workspace.getConfiguration('qserial.ssh').get('encoding', 'utf8');
    }
    writeToSSHTerminal(data, terminalName) {
        const encoding = this.getSSHEncoding();
        let str;
        if (encoding === 'hex') {
            str = data.toString('hex').replace(/(.{2})/g, '$1 ');
        }
        else {
            str = iconv.decode(data, encoding);
        }
        if (terminalName) {
            const term = this.sshTerminals.get(terminalName);
            if (term) {
                term.writeEmitter.fire(str);
                // 写入日志
                this.logger.writeToLog(`SSH: ${terminalName}`, str);
            }
        }
        else {
            // Write to all SSH terminals
            for (const [name, term] of this.sshTerminals) {
                term.writeEmitter.fire(str);
                // 写入日志
                this.logger.writeToLog(`SSH: ${name}`, str);
            }
        }
    }
    closeSSHTerminal(terminalName) {
        if (terminalName) {
            const term = this.sshTerminals.get(terminalName);
            if (term) {
                term.terminal.dispose();
                term.writeEmitter.dispose();
                this.sshTerminals.delete(terminalName);
            }
        }
        else {
            // Close all SSH terminals
            for (const term of this.sshTerminals.values()) {
                term.terminal.dispose();
                term.writeEmitter.dispose();
            }
            this.sshTerminals.clear();
        }
    }
    dispose() {
        this.closeSerialTerminal();
        this.closeSSHTerminal();
        this.logger.dispose();
    }
}
exports.TerminalManager = TerminalManager;
//# sourceMappingURL=terminalManager.js.map