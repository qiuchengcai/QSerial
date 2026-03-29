"use strict";
/**
 * MCP 命令处理�?
 * 处理来自 MCP Server 的命令请求，通过 QSerial 扩展执行操作
 */
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
exports.MCPCommandHandler = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const logger_1 = require("../utils/logger");
/** 结果目录 */
const RESULT_DIR = path.join(os.homedir(), '.qserial', 'results');
const STATUS_DIR = path.join(os.homedir(), '.qserial');
const STATUS_FILE = path.join(STATUS_DIR, 'status.json');
/**
 * MCP 命令处理�?
 */
class MCPCommandHandler {
    constructor(serialManager, sshManager, terminalManager) {
        this.mcpConnections = new Map();
        this.serialManager = serialManager;
        this.sshManager = sshManager;
        this.terminalManager = terminalManager;
        this.ensureResultDir();
        this.ensureStatusDir();
    }
    ensureStatusDir() {
        if (!fs.existsSync(STATUS_DIR)) {
            fs.mkdirSync(STATUS_DIR, { recursive: true });
        }
    }
    /**
     * 写入状态文�?
     */
    writeStatusFile() {
        this.ensureStatusDir();
        const status = {
            version: 1,
            terminals: Array.from(this.mcpConnections.values()).filter(c => c.connected),
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf8');
        logger_1.Logger.debug('MCP 状态文件已更新');
    }
    /**
     * 生成唯一终端 ID
     */
    generateTerminalId(type) {
        return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    ensureResultDir() {
        if (!fs.existsSync(RESULT_DIR)) {
            fs.mkdirSync(RESULT_DIR, { recursive: true });
        }
    }
    /**
     * ���� MCP ����״̬���û��ֶ��Ͽ�ʱ���ã�
     */
    clearMCPConnections(type) {
        if (type) {
            // ����ָ�����͵�����
            for (const [id, status] of this.mcpConnections) {
                if (status.type === type) {
                    this.mcpConnections.delete(id);
                }
            }
        }
        else {
            // ������������
            this.mcpConnections.clear();
        }
        this.writeStatusFile();
        logger_1.Logger.info(`MCP ����״̬������: ${type || 'all'}`);
    }
    /**
     * 写入结果文件
     */
    writeResult(requestId, result) {
        const filePath = path.join(RESULT_DIR, `${requestId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(result), 'utf8');
        logger_1.Logger.debug(`MCP 结果已写�? ${requestId}`);
    }
    /**
     * 处理连接命令
     */
    async handleConnect(params) {
        const { type, requestId, ...config } = params;
        logger_1.Logger.info(`MCP 连接请求: ${type} ${requestId}`);
        try {
            let result;
            if (type === 'serial') {
                result = await this.connectSerial(config);
            }
            else if (type === 'ssh') {
                result = await this.connectSSH(config);
            }
            else {
                throw new Error(`不支持的连接类型: ${type}`);
            }
            this.writeResult(requestId, { success: true, data: result });
            return result;
        }
        catch (error) {
            const err = error;
            logger_1.Logger.error(`MCP 连接失败: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }
    /**
     * 连接串口
     */
    async connectSerial(config) {
        const { path, baudRate, encoding } = config;
        if (!path) {
            throw new Error('串口路径不能为空');
        }
        // SerialManager.connect 只接�?path �?baudRate 两个参数
        // 其他参数（dataBits, stopBits, parity, encoding）从 VS Code 配置中读�?
        await this.serialManager.connect(path, baudRate || 115200);
        const terminalId = this.generateTerminalId('serial');
        const terminalStatus = {
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
    async connectSSH(config) {
        let { host, port, username, password, privateKey, passphrase, encoding, hostId: inputHostId } = config;
        // ��������� hostId���������л�ȡ�����õ���ϸ��Ϣ
        if (inputHostId) {
            const savedConfig = vscode.workspace.getConfiguration('qserial.ssh');
            const savedHosts = savedConfig.get('savedHosts', []);
            const targetHost = savedHosts.find((h) => h.id === inputHostId);
            if (targetHost) {
                host = targetHost.host;
                port = targetHost.port || 22;
                username = targetHost.username;
                // �����������˽Կ·����ʹ�������е�
                if (targetHost.privateKeyPath && !privateKey) {
                    privateKey = targetHost.privateKeyPath;
                }
                logger_1.Logger.info(`ʹ��ָ������: ${targetHost.name || host} (ID: ${inputHostId})`);
            }
            else {
                logger_1.Logger.warn(`δ�ҵ�����ID: ${inputHostId}��ʹ�ô������`);
            }
        }
        if (!host || !username) {
            throw new Error('SSH 主机地址和用户名不能为空');
        }
        // ���� privateKey - ������ļ�·�����ȡ�ļ�����
        let keyContent = undefined;
        if (privateKey) {
            // ����Ƿ����ļ�·��������·���ָ������� .ssh ��ͷ�ĳ���·����
            if (privateKey.includes('/') || privateKey.includes('\\') || privateKey.includes('.ssh')) {
                try {
                    keyContent = fs.readFileSync(privateKey);
                    logger_1.Logger.info(`��ȡ˽Կ�ļ�: ${privateKey}`);
                }
                catch (err) {
                    throw new Error(`�޷���ȡ˽Կ�ļ�: ${privateKey}`);
                }
            }
            else {
                // ֱ����Ϊ˽Կ����
                keyContent = privateKey;
            }
        }
        // ȷ�����յ� hostId
        let finalHostId;
        if (inputHostId) {
            // ʹ�ô���� hostId
            finalHostId = inputHostId;
        }
        else {
            // �����ѱ�����������ã���ȡ�� hostId
            const savedConfig = vscode.workspace.getConfiguration('qserial.ssh');
            const savedHosts = savedConfig.get('savedHosts', []);
            const matchingHost = savedHosts.find((h) => h.host === host &&
                (h.port || 22) === (port || 22) &&
                h.username === username);
            finalHostId = matchingHost?.id || `ssh-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        }
        await this.sshManager.connect({
            host,
            port: port || 22,
            username,
            password,
            privateKey: keyContent,
            passphrase,
            hostId: finalHostId // ���� hostId ��ƥ����״ͼ״̬
        });
        const terminalId = this.generateTerminalId('ssh');
        const terminalStatus = {
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
     * 处理发送命�?
     */
    async handleSend(params) {
        const { requestId, terminalId, data, appendNewline } = params;
        logger_1.Logger.info(`MCP 发送请�? ${terminalId}`);
        try {
            // 查找对应的终�?
            const terminal = this.findTerminal(terminalId);
            if (!terminal) {
                throw new Error(`终端不存�? ${terminalId}`);
            }
            // 发送数�?
            const dataToSend = appendNewline !== false ? data + '\n' : data;
            if (terminal.type === 'serial') {
                this.serialManager.send(dataToSend);
            }
            else {
                this.sshManager.send(terminalId, dataToSend);
            }
            this.writeResult(requestId, { success: true });
            return { success: true };
        }
        catch (error) {
            const err = error;
            logger_1.Logger.error(`MCP 发送失�? ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }
    /**
     * 处理断开命令
     */
    async handleDisconnect(params) {
        const { requestId, terminalId } = params;
        logger_1.Logger.info(`MCP 断开请求: ${terminalId}`);
        try {
            const terminal = this.findTerminal(terminalId);
            if (!terminal) {
                throw new Error(`终端不存�? ${terminalId}`);
            }
            if (terminal.type === 'serial') {
                await this.serialManager.disconnect();
                // �رմ����ն�
                this.terminalManager.closeSerialTerminal();
            }
            else {
                // ��ȡ������Ϣ���ҵ��ն�����
                const hostId = terminal.hostId || terminal.id;
                const conn = this.sshManager.getConnectionInfo(hostId);
                const terminalName = conn?.terminalName;
                // ʹ�� hostId �Ͽ� SSH ����
                await this.sshManager.disconnect(hostId);
                // �رն�Ӧ�� SSH �ն�
                if (terminalName) {
                    this.terminalManager.closeSSHTerminal(terminalName);
                    logger_1.Logger.info(`�ѹر� SSH �ն�: ${terminalName}`);
                }
            }
            // 从状态文件移�?
            for (const [id, status] of this.mcpConnections) {
                if (status.type === terminal.type) {
                    status.connected = false;
                    this.mcpConnections.delete(id);
                }
            }
            this.writeStatusFile();
            // ���� UI ����
            if (this.onConnectionChanged) {
                this.onConnectionChanged();
            }
            this.writeResult(requestId, { success: true });
            return { success: true };
        }
        catch (error) {
            const err = error;
            logger_1.Logger.error(`MCP 断开失败: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }
    /**
     * 处理读取命令
     */
    async handleRead(params) {
        const { requestId, terminalId, mode, bytes, lines, clear } = params;
        logger_1.Logger.info(`MCP 读取请求: ${terminalId}`);
        try {
            const terminal = this.findTerminal(terminalId);
            if (!terminal) {
                throw new Error(`终端不存�? ${terminalId}`);
            }
            let data;
            if (terminal.type === 'serial') {
                data = this.serialManager.read({ mode, bytes, lines, clear });
            }
            else {
                data = this.sshManager.read(terminalId, { mode, bytes, lines, clear });
            }
            this.writeResult(requestId, { success: true, data });
            return { success: true, data };
        }
        catch (error) {
            const err = error;
            logger_1.Logger.error(`MCP 读取失败: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }
    /**
     * 处理等待命令
     */
    async handleWait(params) {
        const { requestId, terminalId, pattern, patternType, timeout } = params;
        logger_1.Logger.info(`MCP 等待请求: ${terminalId}`);
        try {
            const terminal = this.findTerminal(terminalId);
            if (!terminal) {
                throw new Error(`终端不存�? ${terminalId}`);
            }
            let result;
            if (terminal.type === 'serial') {
                result = await this.serialManager.wait(pattern, { patternType, timeout });
            }
            else {
                result = await this.sshManager.wait(terminalId, pattern, { patternType, timeout });
            }
            this.writeResult(requestId, { success: true, data: result });
            return { success: true, data: result };
        }
        catch (error) {
            const err = error;
            logger_1.Logger.error(`MCP 等待失败: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }
    /**
     * 处理列出串口命令
     */
    async handleListPorts(params) {
        const { requestId } = params;
        logger_1.Logger.info('MCP 列出串口请求');
        try {
            const ports = await this.serialManager.listPorts();
            this.writeResult(requestId, { success: true, data: ports });
            return { success: true, data: ports };
        }
        catch (error) {
            const err = error;
            logger_1.Logger.error(`MCP 列出串口失败: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }
    /**
     * 处理获取终端状态命�?
     */
    async handleStatus(params) {
        const { requestId, terminalId } = params;
        logger_1.Logger.info(`MCP 状态请�? ${terminalId || 'all'}`);
        try {
            if (terminalId) {
                const terminal = this.findTerminal(terminalId);
                this.writeResult(requestId, { success: true, data: terminal });
                return terminal;
            }
            else {
                // 返回所有终端状�?
                const serialConn = this.serialManager.getConnectionInfo();
                const status = {
                    serial: serialConn ? {
                        connected: serialConn.isOpen,
                        path: serialConn.path,
                        baudRate: serialConn.baudRate
                    } : { connected: false },
                    ssh: this.sshManager.getAllConnections().map((conn) => ({ host: conn.host, port: conn.port, username: conn.username, isConnected: conn.isConnected, hostId: conn.hostId }))
                };
                this.writeResult(requestId, { success: true, data: status });
                return status;
            }
        }
        catch (error) {
            const err = error;
            logger_1.Logger.error(`MCP 状态查询失�? ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }
    /**
     * 查找终端
     */
    /**
     * ������ȡ��������
     */
    async handleGetConfig(params) {
        const { requestId } = params;
        logger_1.Logger.info('MCP ��ȡ��������');
        try {
            const config = vscode.workspace.getConfiguration('qserial');
            // ��ȡ����������Ϣ
            const configInfo = {
                serial: {
                    defaultBaudRate: config.get('serial.defaultBaudRate', 115200),
                    dataBits: config.get('serial.dataBits', 8),
                    stopBits: config.get('serial.stopBits', 1),
                    parity: config.get('serial.parity', 'none'),
                    autoNewline: config.get('serial.autoNewline', true),
                    encoding: config.get('serial.encoding', 'gbk')
                },
                log: {
                    defaultPath: config.get('log.defaultPath', ''),
                    enableTimestamp: config.get('log.enableTimestamp', true)
                },
                ssh: {
                    savedHosts: config.get('ssh.savedHosts', [])
                },
                buttons: {
                    customButtons: config.get('buttons.customButtons', [])
                },
                connections: {
                    serial: this.serialManager.getConnectionInfo()?.isOpen ? {
                        connected: true,
                        path: this.serialManager.getConnectionInfo()?.path,
                        baudRate: this.serialManager.getConnectionInfo()?.baudRate
                    } : { connected: false },
                    ssh: this.sshManager.getAllConnections().map((conn) => ({
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
        }
        catch (error) {
            const err = error;
            logger_1.Logger.error(`MCP ��ȡ����ʧ��: ${err.message}`);
            this.writeResult(requestId, { success: false, error: err.message });
            throw error;
        }
    }
    findTerminal(terminalId) {
        // ��鴮������
        const serialConn = this.serialManager.getConnectionInfo();
        if (serialConn?.isOpen) {
            const serialId = `serial_${serialConn.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
            if (serialId === terminalId) {
                return { type: 'serial', id: serialConn.path };
            }
        }
        // ��� SSH ����
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
exports.MCPCommandHandler = MCPCommandHandler;
//# sourceMappingURL=commandHandler.js.map