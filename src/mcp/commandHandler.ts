/**
 * MCP 命令处理器
 * 处理来自 MCP Server 的命令请求，通过 QSerial 扩展执行操作
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../utils/logger';

/** 结果目录 */
const RESULT_DIR = path.join(os.homedir(), '.qserial', 'results');
const STATUS_DIR = path.join(os.homedir(), '.qserial');
const STATUS_FILE = path.join(STATUS_DIR, 'status.json');

/** MCP 终端状态 */
interface MCPTerminalStatus {
    id: string;
    type: 'serial' | 'ssh';
    connected: boolean;
    connectedAt: string;
    encoding?: string;
    path?: string;
    baudRate?: number;
    host?: string;
    port?: number;
    username?: string;
}

/** MCP 状态文件结构 */
interface MCPStatusFile {
    version: number;
    terminals: MCPTerminalStatus[];
    updatedAt: string;
}

/** 连接参数 */
interface ConnectParams {
    type: 'serial' | 'ssh';
    requestId: string;
    // 串口参数
    path?: string;
    baudRate?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    encoding?: string;
    // SSH 参数
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
}

/** 发送参数 */
interface SendParams {
    requestId: string;
    terminalId: string;
    data: string;
    appendNewline?: boolean;
}

/** 等待参数 */
interface WaitParams {
    requestId: string;
    terminalId: string;
    pattern: string;
    patternType?: 'regex' | 'string';
    timeout?: number;
}

/** 读取参数 */
interface ReadParams {
    requestId: string;
    terminalId: string;
    mode?: 'new' | 'all' | 'lines' | 'screen';
    bytes?: number;
    lines?: number;
    clear?: boolean;
}

/**
 * MCP 命令处理器
 */
export class MCPCommandHandler {
    private serialManager: any;
    private sshManager: any;
    private terminalManager: any;
    private mcpConnections: Map<string, MCPTerminalStatus> = new Map();
    
    // UI 更新回调
    public onConnectionChanged?: () => void;

    constructor(
        serialManager: any,
        sshManager: any,
        terminalManager: any
    ) {
        this.serialManager = serialManager;
        this.sshManager = sshManager;
        this.terminalManager = terminalManager;
        this.ensureResultDir();
        this.ensureStatusDir();
    }

    private ensureStatusDir(): void {
        if (!fs.existsSync(STATUS_DIR)) {
            fs.mkdirSync(STATUS_DIR, { recursive: true });
        }
    }

    /**
     * 写入状态文件
     */
    private writeStatusFile(): void {
        this.ensureStatusDir();
        const status: MCPStatusFile = {
            version: 1,
            terminals: Array.from(this.mcpConnections.values()).filter(c => c.connected),
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf8');
        Logger.debug('MCP 状态文件已更新');
    }

    /**
     * 生成唯一终端 ID
     */
    private generateTerminalId(type: string): string {
        return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private ensureResultDir(): void {
        if (!fs.existsSync(RESULT_DIR)) {
            fs.mkdirSync(RESULT_DIR, { recursive: true });
        }
    }

    /**
     * 清理 MCP 连接状态（用户手动断开时调用）
     */
    clearMCPConnections(type?: 'serial' | 'ssh'): void {
        if (type) {
            // 清理指定类型的连接
            for (const [id, status] of this.mcpConnections) {
                if (status.type === type) {
                    this.mcpConnections.delete(id);
                }
            }
        } else {
            // 清理所有连接
            this.mcpConnections.clear();
        }
        this.writeStatusFile();
        Logger.info(`MCP 连接状态已清理: ${type || 'all'}`);
    }

    /**
     * 写入结果文件
     */
    private writeResult(requestId: string, result: any): void {
        const filePath = path.join(RESULT_DIR, `${requestId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(result), 'utf8');
        Logger.debug(`MCP 结果已写入: ${requestId}`);
    }

    /**
     * 处理连接命令
     */
    async handleConnect(params: ConnectParams): Promise<any> {
        const { type, requestId, ...config } = params;
        Logger.info(`MCP 连接请求: ${type} ${requestId}`);

        try {
            let result: any;

            if (type === 'serial') {
                result = await this.connectSerial(config);
            } else if (type === 'ssh') {
                result = await this.connectSSH(config);
            } else {
                throw new Error(`不支持的连接类型: ${type}`);
            }

            this.writeResult(requestId, { success: true, data: result });
            return result;
        } catch (error) {
            const err = error as Error;
            Logger.error(`MCP 连接失败: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * 连接串口
     */
    private async connectSerial(config: any): Promise<any> {
        const { path, baudRate, encoding } = config;

        if (!path) {
            throw new Error('串口路径不能为空');
        }

        // SerialManager.connect 只接受 path 和 baudRate 两个参数
        // 其他参数（dataBits, stopBits, parity, encoding）从 VS Code 配置中读取
        await this.serialManager.connect(path, baudRate || 115200);

        const terminalId = this.generateTerminalId('serial');
        const terminalStatus: MCPTerminalStatus = {
            id: terminalId,
            type: 'serial',
            connected: true,
            connectedAt: new Date().toISOString(),
            encoding: encoding || 'gbk',
            path,
            baudRate: baudRate || 115200
        };
        this.mcpConnections.set(terminalId, terminalStatus);
        this.writeStatusFile();

        return {
            terminalId: `serial_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
            type: 'serial',
            path,
            baudRate: baudRate || 115200
        };
    }

    /**
     * 连接 SSH
     */
    private async connectSSH(config: any): Promise<any> {
        let { host, port, username, password, privateKey, passphrase, encoding, hostId: inputHostId } = config;

        // 如果传入了 hostId，从配置中获取该配置的详细信息
        if (inputHostId) {
            const savedConfig = vscode.workspace.getConfiguration('qserial.ssh');
            const savedHosts = savedConfig.get<any[]>('savedHosts', []);
            const targetHost = savedHosts.find((h: any) => h.id === inputHostId);
            if (targetHost) {
                host = targetHost.host;
                port = targetHost.port || 22;
                username = targetHost.username;
                // 如果配置中有私钥路径，使用配置中的
                if (targetHost.privateKeyPath && !privateKey) {
                    privateKey = targetHost.privateKeyPath;
                }
                Logger.info(`使用指定配置: ${targetHost.name || host} (ID: ${inputHostId})`);
            } else {
                Logger.warn(`未找到配置ID: ${inputHostId}，使用传入参数`);
            }
        }

        if (!host || !username) {
            throw new Error('SSH 主机地址和用户名不能为空');
        }

        // 处理 privateKey - 如果是文件路径则读取文件内容
        let keyContent: string | Buffer | undefined = undefined;
        if (privateKey) {
            // 检查是否是文件路径（包含路径分隔符或以 .ssh 开头的常见路径）
            if (privateKey.includes('/') || privateKey.includes('\\') || privateKey.includes('.ssh')) {
                try {
                    keyContent = fs.readFileSync(privateKey);
                    Logger.info(`读取私钥文件: ${privateKey}`);
                } catch (err) {
                    throw new Error(`无法读取私钥文件: ${privateKey}`);
                }
            } else {
                // 直接作为私钥内容
                keyContent = privateKey;
            }
        }

        // 确定最终的 hostId
        let finalHostId: string;
        if (inputHostId) {
            // 使用传入的 hostId
            finalHostId = inputHostId;
        } else {
            // 查找已保存的主机配置，获取其 hostId
            const savedConfig = vscode.workspace.getConfiguration('qserial.ssh');
            const savedHosts = savedConfig.get<any[]>('savedHosts', []);
            const matchingHost = savedHosts.find((h: any) =>
                h.host === host &&
                (h.port || 22) === (port || 22) &&
                h.username === username
            );
            finalHostId = matchingHost?.id || `ssh-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        }

        await this.sshManager.connect({
            host,
            port: port || 22,
            username,
            password,
            privateKey: keyContent,
            passphrase,
            hostId: finalHostId  // 传入 hostId 以匹配树状图状态
        });

        const terminalId = this.generateTerminalId('ssh');
        const terminalStatus: MCPTerminalStatus = {
            id: terminalId,
            type: 'ssh',
            connected: true,
            connectedAt: new Date().toISOString(),
            encoding: encoding || 'utf8',
            host,
            port: port || 22,
            username
        };
        this.mcpConnections.set(terminalId, terminalStatus);
        this.writeStatusFile();

        return {
            terminalId: `ssh_${username}_${host}_${port || 22}`.replace(/[^a-zA-Z0-9_]/g, '_'),
            type: 'ssh',
            host,
            port: port || 22,
            username,
            hostId: finalHostId
        };
    }

    /**
     * 处理发送命令
     */
    async handleSend(params: SendParams): Promise<any> {
        const { requestId, terminalId, data, appendNewline } = params;
        Logger.info(`MCP 发送请求: ${terminalId}`);

        try {
            // 查找对应的终端
            const terminal = this.findTerminal(terminalId);
            if (!terminal) {
                throw new Error(`终端不存在: ${terminalId}`);
            }

            // 发送数据
            const dataToSend = appendNewline !== false ? data + '\n' : data;
            
            if (terminal.type === 'serial') {
                this.serialManager.send(dataToSend);
            } else {
                this.sshManager.send(terminalId, dataToSend);
            }

            this.writeResult(requestId, { success: true });
            return { success: true };
        } catch (error) {
            const err = error as Error;
            Logger.error(`MCP 发送失败: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * 处理断开命令
     */
    async handleDisconnect(params: { requestId: string; terminalId: string }): Promise<any> {
        const { requestId, terminalId } = params;
        Logger.info(`MCP 断开请求: ${terminalId}`);

        try {
            const terminal = this.findTerminal(terminalId);
            if (!terminal) {
                throw new Error(`终端不存在: ${terminalId}`);
            }

            if (terminal.type === 'serial') {
                await this.serialManager.disconnect();
                // 关闭串口终端
                this.terminalManager.closeSerialTerminal();
            } else {
                // 获取连接信息以找到终端名称
                const hostId = terminal.hostId || terminal.id;
                const conn = this.sshManager.getConnectionInfo(hostId);
                const terminalName = conn?.terminalName;
                
                // 使用 hostId 断开 SSH 连接
                await this.sshManager.disconnect(hostId);
                
                // 关闭对应的 SSH 终端
                if (terminalName) {
                    this.terminalManager.closeSSHTerminal(terminalName);
                    Logger.info(`已关闭 SSH 终端: ${terminalName}`);
                }
            }

            // 从状态文件移除
            for (const [id, status] of this.mcpConnections) {
                if (status.type === terminal.type) {
                    status.connected = false;
                    this.mcpConnections.delete(id);
                }
            }
            this.writeStatusFile();

            // 触发 UI 更新
            if (this.onConnectionChanged) {
                this.onConnectionChanged();
            }

            this.writeResult(requestId, { success: true });
            return { success: true };
        } catch (error) {
            const err = error as Error;
            Logger.error(`MCP 断开失败: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * 处理读取命令
     */
    async handleRead(params: ReadParams): Promise<any> {
        const { requestId, terminalId, mode, bytes, lines, clear } = params;
        Logger.info(`MCP 读取请求: ${terminalId}`);

        try {
            const terminal = this.findTerminal(terminalId);
            if (!terminal) {
                throw new Error(`终端不存在: ${terminalId}`);
            }

            let data: string;
            if (terminal.type === 'serial') {
                data = this.serialManager.read({ mode, bytes, lines, clear });
            } else {
                data = this.sshManager.read(terminalId, { mode, bytes, lines, clear });
            }

            this.writeResult(requestId, { success: true, data });
            return { success: true, data };
        } catch (error) {
            const err = error as Error;
            Logger.error(`MCP 读取失败: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * 处理等待命令
     */
    async handleWait(params: WaitParams): Promise<any> {
        const { requestId, terminalId, pattern, patternType, timeout } = params;
        Logger.info(`MCP 等待请求: ${terminalId}`);

        try {
            const terminal = this.findTerminal(terminalId);
            if (!terminal) {
                throw new Error(`终端不存在: ${terminalId}`);
            }

            let result: string | null;
            if (terminal.type === 'serial') {
                result = await this.serialManager.wait(pattern, { patternType, timeout });
            } else {
                result = await this.sshManager.wait(terminalId, pattern, { patternType, timeout });
            }

            this.writeResult(requestId, { success: true, data: result });
            return { success: true, data: result };
        } catch (error) {
            const err = error as Error;
            Logger.error(`MCP 等待失败: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * 处理列出串口命令
     */
    async handleListPorts(params: { requestId: string }): Promise<any> {
        const { requestId } = params;
        Logger.info('MCP 列出串口请求');

        try {
            const ports = await this.serialManager.listPorts();
            this.writeResult(requestId, { success: true, data: ports });
            return { success: true, data: ports };
        } catch (error) {
            const err = error as Error;
            Logger.error(`MCP 列出串口失败: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * 处理获取终端状态命令
     */
    async handleStatus(params: { requestId: string; terminalId?: string }): Promise<any> {
        const { requestId, terminalId } = params;
        Logger.info(`MCP 状态请求: ${terminalId || 'all'}`);

        try {
            if (terminalId) {
                const terminal = this.findTerminal(terminalId);
                this.writeResult(requestId, { success: true, data: terminal });
                return terminal;
            } else {
                // 返回所有终端状态
                const serialConn = this.serialManager.getConnectionInfo();
                const status = {
                    serial: serialConn ? {
                        connected: serialConn.isOpen,
                        path: serialConn.path,
                        baudRate: serialConn.baudRate
                    } : { connected: false },
                    ssh: this.sshManager.getAllConnections().map((conn: any) => ({ host: conn.host, port: conn.port, username: conn.username, isConnected: conn.isConnected, hostId: conn.hostId }))
                };
                this.writeResult(requestId, { success: true, data: status });
                return status;
            }
        } catch (error) {
            const err = error as Error;
            Logger.error(`MCP 状态查询失败: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * 查找终端
     */
    private findTerminal(terminalId: string): { type: string; id: string; hostId?: string } | null {
        // 检查串口连接
        const serialConn = this.serialManager.getConnectionInfo();
        if (serialConn?.isOpen) {
            const serialId = `serial_${serialConn.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
            if (serialId === terminalId) {
                return { type: 'serial', id: serialConn.path };
            }
        }

        // 检查 SSH 连接
        const sshConnections = this.sshManager.getAllConnections();
        for (const conn of sshConnections) {
            const sshId = `ssh_${conn.username}_${conn.host}_${conn.port}`.replace(/[^a-zA-Z0-9_]/g, '_');
            if (sshId === terminalId || conn.hostId === terminalId) {
                return { type: 'ssh', id: conn.hostId, hostId: conn.hostId };
            }
        }

        return null;
    }

    /**
     * 处理获取配置命令
     */
    async handleGetConfig(params: { requestId: string }): Promise<any> {
        const { requestId } = params;
        Logger.info('MCP 获取配置请求');

        try {
            const config = vscode.workspace.getConfiguration('qserial');
            
            // 获取所有配置信息
            const configInfo = {
                serial: {
                    defaultBaudRate: config.get<number>('serial.defaultBaudRate', 115200),
                    dataBits: config.get<number>('serial.dataBits', 8),
                    stopBits: config.get<number>('serial.stopBits', 1),
                    parity: config.get<string>('serial.parity', 'none'),
                    autoNewline: config.get<boolean>('serial.autoNewline', true),
                    encoding: config.get<string>('serial.encoding', 'gbk')
                },
                log: {
                    defaultPath: config.get<string>('log.defaultPath', ''),
                    enableTimestamp: config.get<boolean>('log.enableTimestamp', true)
                },
                ssh: {
                    savedHosts: config.get<any[]>('ssh.savedHosts', [])
                },
                buttons: {
                    customButtons: config.get<any[]>('buttons.customButtons', [])
                },
                connections: {
                    serial: this.serialManager.getConnectionInfo()?.isOpen ? {
                        connected: true,
                        path: this.serialManager.getConnectionInfo()?.path,
                        baudRate: this.serialManager.getConnectionInfo()?.baudRate
                    } : { connected: false },
                    ssh: this.sshManager.getAllConnections().map((conn: any) => ({
                        host: conn.host,
                        port: conn.port,
                        username: conn.username,
                        isConnected: conn.isConnected,
                        hostId: conn.hostId
                    }))
                }
            };

            this.writeResult(requestId, { success: true, data: configInfo });
            return { success: true, data: configInfo };
        } catch (error) {
            const err = error as Error;
            Logger.error(`MCP 获取配置失败: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }
}