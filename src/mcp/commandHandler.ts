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

    constructor(
        serialManager: any,
        sshManager: any,
        terminalManager: any
    ) {
        this.serialManager = serialManager;
        this.sshManager = sshManager;
        this.terminalManager = terminalManager;
        this.ensureResultDir();
    }

    private ensureResultDir(): void {
        if (!fs.existsSync(RESULT_DIR)) {
            fs.mkdirSync(RESULT_DIR, { recursive: true });
        }
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
        const { path, baudRate, dataBits, stopBits, parity, encoding } = config;

        if (!path) {
            throw new Error('串口路径不能为空');
        }

        await this.serialManager.connect(path, {
            baudRate: baudRate || 115200,
            dataBits: dataBits || 8,
            stopBits: stopBits || 1,
            parity: parity || 'none'
        }, encoding || 'gbk');

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
        const { host, port, username, password, privateKey, passphrase } = config;

        if (!host || !username) {
            throw new Error('SSH 主机地址和用户名不能为空');
        }

        await this.sshManager.connect({
            host,
            port: port || 22,
            username,
            password,
            privateKey,
            passphrase
        });

        return {
            terminalId: `ssh_${username}_${host}_${port || 22}`.replace(/[^a-zA-Z0-9_]/g, '_'),
            type: 'ssh',
            host,
            port: port || 22,
            username
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
            } else {
                await this.sshManager.disconnect(terminalId);
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
                const status = {
                    serial: this.serialManager.getConnectionStatus(),
                    ssh: this.sshManager.getAllConnections()
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
    private findTerminal(terminalId: string): { type: string; id: string } | null {
        // 检查串口连接
        const serialStatus = this.serialManager.getConnectionStatus();
        if (serialStatus.connected) {
            const serialId = `serial_${serialStatus.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
            if (serialId === terminalId) {
                return { type: 'serial', id: serialStatus.path };
            }
        }

        // 检查 SSH 连接
        const sshConnections = this.sshManager.getAllConnections();
        for (const conn of sshConnections) {
            const sshId = `ssh_${conn.username}_${conn.host}_${conn.port}`.replace(/[^a-zA-Z0-9_]/g, '_');
            if (sshId === terminalId) {
                return { type: 'ssh', id: conn.terminalName };
            }
        }

        return null;
    }
}