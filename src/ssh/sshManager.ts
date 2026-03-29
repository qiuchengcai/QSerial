import { Client, ConnectConfig, ClientChannel } from 'ssh2';
import * as vscode from 'vscode';
import { TerminalManager } from '../terminal/terminalManager';
import { Logger } from '../utils/logger';

export interface SSHConnection {
    client: Client;
    host: string;
    port: number;
    username: string;
    isConnected: boolean;
    shell?: ClientChannel;
    hostId: string;  // 唯一标识符，用于区分不同的配置项
    terminalName: string;
}

export class SSHManager {
    private connections: Map<string, SSHConnection> = new Map();
    private terminalManager: TerminalManager;

    constructor(terminalManager: TerminalManager) {
        this.terminalManager = terminalManager;
    }

    async connect(config: ConnectConfig & { password?: string; passphrase?: string; hostId?: string; preserveFocus?: boolean }): Promise<void> {
        const hostId = config.hostId || `ssh-${Date.now()}`;
        const preserveFocus = config.preserveFocus;

        return new Promise((resolve, reject) => {
            const client = new Client();
            const terminalName = `${config.username}@${config.host} (${hostId.slice(-6)})`;

            client.on('ready', () => {
                const connection: SSHConnection = {
                    client,
                    host: config.host!,
                    port: config.port || 22,
                    username: config.username || '',
                    isConnected: true,
                    hostId,
                    terminalName
                };

                // 先添加到 Map，确保状态查询能找到
                this.connections.set(hostId, connection);

                // Create terminal for SSH
                // preserveFocus 为 true 时终端不抢占焦点（MCP 连接时使用）
                this.terminalManager.createSSHTerminal(terminalName, (data) => {
                    const conn = this.connections.get(hostId);
                    if (conn?.isConnected && conn.shell) {
                        conn.shell.write(data);
                    }
                }, preserveFocus);

                // Start shell
                client.shell((err, stream) => {
                    if (err) {
                        Logger.error('Failed to start shell: ' + err.message);
                        this.connections.delete(hostId);
                        reject(err.message);
                        return;
                    }

                    connection.shell = stream;

                    stream.on('data', (data: Buffer) => {
                        this.terminalManager.writeToSSHTerminal(data, terminalName);
                    });

                    stream.stderr.on('data', (data: Buffer) => {
                        this.terminalManager.writeToSSHTerminal(data, terminalName);
                    });

                    stream.on('close', () => {
                        Logger.info('SSH shell closed');
                        this.connections.delete(hostId);
                        // 不再关闭终端，因为可能是用户手动关闭终端触发的
                        // 如果是服务器断开，终端会显示连接断开
                    });

                    Logger.info(`SSH connected to ${config.username}@${config.host}`);
                    resolve();  // shell 创建成功后才 resolve
                });
            });

            client.on('error', (err) => {
                Logger.error('SSH connection error: ' + err.message);
                Logger.error('SSH connection error level: ' + (err as any).level);
                
                // 如果是连接断开相关的错误，不显示弹窗（这是正常断开流程）
                const isDisconnectError = err.message.includes('ECONNRESET') ||
                    err.message.includes('Connection closed') ||
                    err.message.includes('socket hang up');
                
                // 如果连接已存在（在 Map 中），说明是断开过程中的错误，不需要弹窗
                const isExistingConnection = this.connections.has(hostId);
                
                if (isDisconnectError && isExistingConnection) {
                    Logger.info('SSH 连接断开: ' + err.message);
                    return;
                }
                
                // 提供更详细的错误信息
                let errorMsg = err.message;
                if (err.message.includes('All configured authentication methods failed')) {
                    errorMsg = '认证失败\n' +
                        '可能原因：\n' +
                        '1. 用户名或密码错误\n' +
                        '2. 服务器禁用了密码认证（检查 /etc/ssh/sshd_config 中 PasswordAuthentication 是否为 yes）\n' +
                        '3. 用户不允许通过密码登录（检查服务器配置）';
                }
                vscode.window.showErrorMessage(`SSH 错误: ${errorMsg}`);
                reject(errorMsg);
            });

            client.on('close', () => {
                Logger.info('SSH connection closed');
            });

            // Connect
            const connConfig: ConnectConfig = {
                host: config.host,
                port: config.port || 22,
                username: config.username,
                tryKeyboard: true  // 支持键盘交互认证
            };

            if (config.password) {
                connConfig.password = config.password;
                Logger.info('Using password authentication');
            } else if (config.privateKey) {
                connConfig.privateKey = config.privateKey;
                if (config.passphrase) {
                    connConfig.passphrase = config.passphrase;
                }
                Logger.info('Using private key authentication');
            } else {
                // Try default private keys in order of preference
                const fs = require('fs');
                const path = require('path');
                const homeDir = process.env.HOME || process.env.USERPROFILE;
                const sshDir = path.join(homeDir, '.ssh');
                
                // Try common key file names in order
                const keyFiles = ['id_ed25519', 'id_rsa', 'id_ecdsa', 'id_dsa'];
                let keyFound = false;
                
                for (const keyFile of keyFiles) {
                    const keyPath = path.join(sshDir, keyFile);
                    try {
                        connConfig.privateKey = fs.readFileSync(keyPath);
                        Logger.info('Using default private key: ' + keyPath);
                        keyFound = true;
                        break;
                    } catch {
                        // Try next key file
                    }
                }
                
                if (!keyFound) {
                    Logger.warn('No private key found in ' + sshDir + ', password required');
                }
            }

            // 支持键盘交互认证（某些服务器需要）
            client.on('keyboard-interactive', (_name, _instructions, _instructionsLang, prompts, finish) => {
                if (prompts.length > 0 && config.password) {
                    finish([config.password]);
                } else {
                    finish([]);
                }
            });

            client.connect(connConfig);
        });
    }

    async disconnect(hostId?: string): Promise<void> {
        return new Promise((resolve) => {
            if (hostId) {
                const conn = this.connections.get(hostId);
                if (conn) {
                    conn.client.end();
                    this.connections.delete(hostId);
                    // 不在这里关闭终端，让调用方或终端关闭回调处理
                }
            } else {
                // Disconnect all
                for (const conn of this.connections.values()) {
                    conn.client.end();
                }
                this.connections.clear();
            }
            resolve();
        });
    }

    async send(data: string | Buffer, hostId?: string): Promise<void> {
        const conn = hostId ? this.connections.get(hostId) : this.connections.values().next().value;
        if (!conn?.isConnected) {
            throw new Error('SSH not connected');
        }

        const shell = conn.shell;
        if (!shell) {
            throw new Error('SSH shell not available');
        }

        shell.write(data);
    }

    /**
     * 读取 SSH 终端数据（MCP 用）
     * 注意：SSH 数据直接显示在终端，此方法返回空字符串
     */
    read(hostId: string, options?: { mode?: string; bytes?: number; lines?: number; clear?: boolean }): string {
        // SSH 数据直接写入终端，不缓存
        // 返回空字符串，MCP 用户需要查看终端输出
        return '';
    }

    /**
     * 等待 SSH 输出匹配（MCP 用）
     */
    async wait(hostId: string, pattern: string, options?: { patternType?: string; timeout?: number }): Promise<string | null> {
        // SSH 数据直接写入终端，无法等待匹配
        // 返回 null 表示不支持
        return null;
    }

    isConnected(hostId?: string): boolean {
        if (hostId) {
            return this.connections.get(hostId)?.isConnected ?? false;
        }
        return this.connections.size > 0;
    }

    getConnectionInfo(hostId?: string): SSHConnection | null {
        if (hostId) {
            return this.connections.get(hostId) || null;
        }
        return this.connections.values().next().value || null;
    }

    getAllConnections(): SSHConnection[] {
        return Array.from(this.connections.values());
    }
}
