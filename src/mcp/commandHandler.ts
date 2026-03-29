/**
 * MCP å‘½ä»¤å¤„ç†å™?
 * å¤„ç†æ¥è‡ª MCP Server çš„å‘½ä»¤è¯·æ±‚ï¼Œé€šè¿‡ QSerial æ‰©å±•æ‰§è¡Œæ“ä½œ
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../utils/logger';

/** ç»“æžœç›®å½• */
const RESULT_DIR = path.join(os.homedir(), '.qserial', 'results');
const STATUS_DIR = path.join(os.homedir(), '.qserial');
const STATUS_FILE = path.join(STATUS_DIR, 'status.json');

/** MCP ç»ˆç«¯çŠ¶æ€?*/
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

/** MCP çŠ¶æ€æ–‡ä»¶ç»“æž?*/
interface MCPStatusFile {
    version: number;
    terminals: MCPTerminalStatus[];
    updatedAt: string;
}

/** è¿žæŽ¥å‚æ•° */
interface ConnectParams {
    type: 'serial' | 'ssh';
    requestId: string;
    // ä¸²å£å‚æ•°
    path?: string;
    baudRate?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    encoding?: string;
    // SSH å‚æ•°
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
}

/** å‘é€å‚æ•?*/
interface SendParams {
    requestId: string;
    terminalId: string;
    data: string;
    appendNewline?: boolean;
}

/** ç­‰å¾…å‚æ•° */
interface WaitParams {
    requestId: string;
    terminalId: string;
    pattern: string;
    patternType?: 'regex' | 'string';
    timeout?: number;
}

/** è¯»å–å‚æ•° */
interface ReadParams {
    requestId: string;
    terminalId: string;
    mode?: 'new' | 'all' | 'lines' | 'screen';
    bytes?: number;
    lines?: number;
    clear?: boolean;
}

/**
 * MCP å‘½ä»¤å¤„ç†å™?
 */
export class MCPCommandHandler {
    private serialManager: any;
    private sshManager: any;
    private terminalManager: any;
    private mcpConnections: Map<string, MCPTerminalStatus> = new Map();
    
    // UI ¸üÐÂ»Øµ÷
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
     * å†™å…¥çŠ¶æ€æ–‡ä»?
     */
    private writeStatusFile(): void {
        this.ensureStatusDir();
        const status: MCPStatusFile = {
            version: 1,
            terminals: Array.from(this.mcpConnections.values()).filter(c => c.connected),
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf8');
        Logger.debug('MCP çŠ¶æ€æ–‡ä»¶å·²æ›´æ–°');
    }

    /**
     * ç”Ÿæˆå”¯ä¸€ç»ˆç«¯ ID
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
     * ÇåÀí MCP Á¬½Ó×´Ì¬£¨ÓÃ»§ÊÖ¶¯¶Ï¿ªÊ±µ÷ÓÃ£©
     */
    clearMCPConnections(type?: 'serial' | 'ssh'): void {
        if (type) {
            // ÇåÀíÖ¸¶¨ÀàÐÍµÄÁ¬½Ó
            for (const [id, status] of this.mcpConnections) {
                if (status.type === type) {
                    this.mcpConnections.delete(id);
                }
            }
        } else {
            // ÇåÀíËùÓÐÁ¬½Ó
            this.mcpConnections.clear();
        }
        this.writeStatusFile();
        Logger.info(`MCP Á¬½Ó×´Ì¬ÒÑÇåÀí: ${type || 'all'}`);
    }

    /**
     * å†™å…¥ç»“æžœæ–‡ä»¶
     */
    private writeResult(requestId: string, result: any): void {
        const filePath = path.join(RESULT_DIR, `${requestId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(result), 'utf8');
        Logger.debug(`MCP ç»“æžœå·²å†™å…? ${requestId}`);
    }

    /**
     * å¤„ç†è¿žæŽ¥å‘½ä»¤
     */
    async handleConnect(params: ConnectParams): Promise<any> {
        const { type, requestId, ...config } = params;
        Logger.info(`MCP è¿žæŽ¥è¯·æ±‚: ${type} ${requestId}`);

        try {
            let result: any;

            if (type === 'serial') {
                result = await this.connectSerial(config);
            } else if (type === 'ssh') {
                result = await this.connectSSH(config);
            } else {
                throw new Error(`ä¸æ”¯æŒçš„è¿žæŽ¥ç±»åž‹: ${type}`);
            }

            this.writeResult(requestId, { success: true, data: result });
            return result;
        } catch (error) {
            const err = error as Error;
            Logger.error(`MCP è¿žæŽ¥å¤±è´¥: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * è¿žæŽ¥ä¸²å£
     */
    private async connectSerial(config: any): Promise<any> {
        const { path, baudRate, encoding } = config;

        if (!path) {
            throw new Error('ä¸²å£è·¯å¾„ä¸èƒ½ä¸ºç©º');
        }

        // SerialManager.connect åªæŽ¥å?path å’?baudRate ä¸¤ä¸ªå‚æ•°
        // å…¶ä»–å‚æ•°ï¼ˆdataBits, stopBits, parity, encodingï¼‰ä»Ž VS Code é…ç½®ä¸­è¯»å?
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
     * è¿žæŽ¥ SSH
     */
    private async connectSSH(config: any): Promise<any> {
        let { host, port, username, password, privateKey, passphrase, encoding, hostId: inputHostId } = config;

        // Èç¹û´«ÈëÁË hostId£¬´ÓÅäÖÃÖÐ»ñÈ¡¸ÃÅäÖÃµÄÏêÏ¸ÐÅÏ¢
        if (inputHostId) {
            const savedConfig = vscode.workspace.getConfiguration('qserial.ssh');
            const savedHosts = savedConfig.get<any[]>('savedHosts', []);
            const targetHost = savedHosts.find((h: any) => h.id === inputHostId);
            if (targetHost) {
                host = targetHost.host;
                port = targetHost.port || 22;
                username = targetHost.username;
                // Èç¹ûÅäÖÃÖÐÓÐË½Ô¿Â·¾¶£¬Ê¹ÓÃÅäÖÃÖÐµÄ
                if (targetHost.privateKeyPath && !privateKey) {
                    privateKey = targetHost.privateKeyPath;
                }
                Logger.info(`Ê¹ÓÃÖ¸¶¨ÅäÖÃ: ${targetHost.name || host} (ID: ${inputHostId})`);
            } else {
                Logger.warn(`Î´ÕÒµ½ÅäÖÃID: ${inputHostId}£¬Ê¹ÓÃ´«Èë²ÎÊý`);
            }
        }

        if (!host || !username) {
            throw new Error('SSH ä¸»æœºåœ°å€å’Œç”¨æˆ·åä¸èƒ½ä¸ºç©º');
        }

        // ´¦Àí privateKey - Èç¹ûÊÇÎÄ¼þÂ·¾¶Ôò¶ÁÈ¡ÎÄ¼þÄÚÈÝ
        let keyContent: string | Buffer | undefined = undefined;
        if (privateKey) {
            // ¼ì²éÊÇ·ñÊÇÎÄ¼þÂ·¾¶£¨°üº¬Â·¾¶·Ö¸ô·û»òÒÔ .ssh ¿ªÍ·µÄ³£¼ûÂ·¾¶£©
            if (privateKey.includes('/') || privateKey.includes('\\') || privateKey.includes('.ssh')) {
                try {
                    keyContent = fs.readFileSync(privateKey);
                    Logger.info(`¶ÁÈ¡Ë½Ô¿ÎÄ¼þ: ${privateKey}`);
                } catch (err) {
                    throw new Error(`ÎÞ·¨¶ÁÈ¡Ë½Ô¿ÎÄ¼þ: ${privateKey}`);
                }
            } else {
                // Ö±½Ó×÷ÎªË½Ô¿ÄÚÈÝ
                keyContent = privateKey;
            }
        }

        // È·¶¨×îÖÕµÄ hostId
        let finalHostId: string;
        if (inputHostId) {
            // Ê¹ÓÃ´«ÈëµÄ hostId
            finalHostId = inputHostId;
        } else {
            // ²éÕÒÒÑ±£´æµÄÖ÷»úÅäÖÃ£¬»ñÈ¡Æä hostId
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
            hostId: finalHostId  // ´«Èë hostId ÒÔÆ¥ÅäÊ÷×´Í¼×´Ì¬
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
     * å¤„ç†å‘é€å‘½ä»?
     */
    async handleSend(params: SendParams): Promise<any> {
        const { requestId, terminalId, data, appendNewline } = params;
        Logger.info(`MCP å‘é€è¯·æ±? ${terminalId}`);

        try {
            // æŸ¥æ‰¾å¯¹åº”çš„ç»ˆç«?
            const terminal = this.findTerminal(terminalId);
            if (!terminal) {
                throw new Error(`ç»ˆç«¯ä¸å­˜åœ? ${terminalId}`);
            }

            // å‘é€æ•°æ?
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
            Logger.error(`MCP å‘é€å¤±è´? ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * å¤„ç†æ–­å¼€å‘½ä»¤
     */
    async handleDisconnect(params: { requestId: string; terminalId: string }): Promise<any> {
        const { requestId, terminalId } = params;
        Logger.info(`MCP æ–­å¼€è¯·æ±‚: ${terminalId}`);

        try {
            const terminal = this.findTerminal(terminalId);
            if (!terminal) {
                throw new Error(`ç»ˆç«¯ä¸å­˜åœ? ${terminalId}`);
            }

            if (terminal.type === 'serial') {
                await this.serialManager.disconnect();
                // ¹Ø±Õ´®¿ÚÖÕ¶Ë
                this.terminalManager.closeSerialTerminal();
            } else {
                // »ñÈ¡Á¬½ÓÐÅÏ¢ÒÔÕÒµ½ÖÕ¶ËÃû³Æ
                const hostId = terminal.hostId || terminal.id;
                const conn = this.sshManager.getConnectionInfo(hostId);
                const terminalName = conn?.terminalName;
                
                // Ê¹ÓÃ hostId ¶Ï¿ª SSH Á¬½Ó
                await this.sshManager.disconnect(hostId);
                
                // ¹Ø±Õ¶ÔÓ¦µÄ SSH ÖÕ¶Ë
                if (terminalName) {
                    this.terminalManager.closeSSHTerminal(terminalName);
                    Logger.info(`ÒÑ¹Ø±Õ SSH ÖÕ¶Ë: ${terminalName}`);
                }
            }

            // ä»ŽçŠ¶æ€æ–‡ä»¶ç§»é™?
            for (const [id, status] of this.mcpConnections) {
                if (status.type === terminal.type) {
                    status.connected = false;
                    this.mcpConnections.delete(id);
                }
            }
            this.writeStatusFile();

            // ´¥·¢ UI ¸üÐÂ
            if (this.onConnectionChanged) {
                this.onConnectionChanged();
            }

            this.writeResult(requestId, { success: true });
            return { success: true };
        } catch (error) {
            const err = error as Error;
            Logger.error(`MCP æ–­å¼€å¤±è´¥: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * å¤„ç†è¯»å–å‘½ä»¤
     */
    async handleRead(params: ReadParams): Promise<any> {
        const { requestId, terminalId, mode, bytes, lines, clear } = params;
        Logger.info(`MCP è¯»å–è¯·æ±‚: ${terminalId}`);

        try {
            const terminal = this.findTerminal(terminalId);
            if (!terminal) {
                throw new Error(`ç»ˆç«¯ä¸å­˜åœ? ${terminalId}`);
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
            Logger.error(`MCP è¯»å–å¤±è´¥: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * å¤„ç†ç­‰å¾…å‘½ä»¤
     */
    async handleWait(params: WaitParams): Promise<any> {
        const { requestId, terminalId, pattern, patternType, timeout } = params;
        Logger.info(`MCP ç­‰å¾…è¯·æ±‚: ${terminalId}`);

        try {
            const terminal = this.findTerminal(terminalId);
            if (!terminal) {
                throw new Error(`ç»ˆç«¯ä¸å­˜åœ? ${terminalId}`);
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
            Logger.error(`MCP ç­‰å¾…å¤±è´¥: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * å¤„ç†åˆ—å‡ºä¸²å£å‘½ä»¤
     */
    async handleListPorts(params: { requestId: string }): Promise<any> {
        const { requestId } = params;
        Logger.info('MCP åˆ—å‡ºä¸²å£è¯·æ±‚');

        try {
            const ports = await this.serialManager.listPorts();
            this.writeResult(requestId, { success: true, data: ports });
            return { success: true, data: ports };
        } catch (error) {
            const err = error as Error;
            Logger.error(`MCP åˆ—å‡ºä¸²å£å¤±è´¥: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * å¤„ç†èŽ·å–ç»ˆç«¯çŠ¶æ€å‘½ä»?
     */
    async handleStatus(params: { requestId: string; terminalId?: string }): Promise<any> {
        const { requestId, terminalId } = params;
        Logger.info(`MCP çŠ¶æ€è¯·æ±? ${terminalId || 'all'}`);

        try {
            if (terminalId) {
                const terminal = this.findTerminal(terminalId);
                this.writeResult(requestId, { success: true, data: terminal });
                return terminal;
            } else {
                // è¿”å›žæ‰€æœ‰ç»ˆç«¯çŠ¶æ€?
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
            Logger.error(`MCP çŠ¶æ€æŸ¥è¯¢å¤±è´? ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    /**
     * æŸ¥æ‰¾ç»ˆç«¯
     */
    /**
     * ´¦Àí»ñÈ¡ÅäÖÃÃüÁî
     */
    async handleGetConfig(params: { requestId: string }): Promise<any> {
        const { requestId } = params;
        Logger.info('MCP »ñÈ¡ÅäÖÃÇëÇó');

        try {
            const config = vscode.workspace.getConfiguration('qserial');
            
            // »ñÈ¡ËùÓÐÅäÖÃÐÅÏ¢
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
            Logger.error(`MCP »ñÈ¡ÅäÖÃÊ§°Ü: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }

    private findTerminal(terminalId: string): { type: string; id: string; hostId?: string } | null {
        // ¼ì²é´®¿ÚÁ¬½Ó
        const serialConn = this.serialManager.getConnectionInfo();
        if (serialConn?.isOpen) {
            const serialId = `serial_${serialConn.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
            if (serialId === terminalId) {
                return { type: 'serial', id: serialConn.path };
            }
        }

        // ¼ì²é SSH Á¬½Ó
        const sshConnections = this.sshManager.getAllConnections();
        for (const conn of sshConnections) {
            const sshId = `ssh_${conn.username}_${conn.host}_${conn.port}`.replace(/[^a-zA-Z0-9_]/g, '_');
            if (sshId === terminalId || conn.hostId === terminalId) {
                return { type: 'ssh', id: conn.hostId, hostId: conn.hostId };
            }
        }

        return null;
    }
}
