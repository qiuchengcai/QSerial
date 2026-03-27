import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

interface LogSession {
    id: string;
    terminalName: string;
    terminalType: 'serial' | 'ssh';
    filePath: string;
    writeStream: fs.WriteStream | null;
    startTime: Date;
    bytesWritten: number;
}

export class TerminalLogger {
    private activeSessions: Map<string, LogSession> = new Map();
    private defaultLogPath: string;

    constructor() {
        // 默认日志路径为用户文档目录下的 QSerial/logs
        const homeDir = process.env.USERPROFILE || process.env.HOME || '';
        this.defaultLogPath = path.join(homeDir, 'Documents', 'QSerial', 'logs');
    }

    /**
     * 获取默认日志路径
     */
    getDefaultLogPath(): string {
        return this.defaultLogPath;
    }

    /**
     * 开始记录终端输出
     * @param terminalName 终端名称
     * @param terminalType 终端类型
     * @param customPath 自定义日志路径（可选）
     */
    async startLogging(
        terminalName: string,
        terminalType: 'serial' | 'ssh',
        customPath?: string
    ): Promise<string> {
        // 检查是否已经在记录
        const existingSession = this.findSessionByTerminalName(terminalName);
        if (existingSession) {
            throw new Error(`终端 "${terminalName}" 已在记录中`);
        }

        // 确定日志路径
        let logDir = customPath || this.defaultLogPath;

        // 确保目录存在
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        // 生成日志文件名
        const timestamp = this.formatTimestamp(new Date());
        const safeName = terminalName.replace(/[<>:"/\\|?*]/g, '_');
        const fileName = `${safeName}_${timestamp}.log`;
        const filePath = path.join(logDir, fileName);

        // 创建写入流
        const writeStream = fs.createWriteStream(filePath, { flags: 'a' });

        // 写入文件头
        const header = `=== 终端日志记录 ===\n终端: ${terminalName}\n类型: ${terminalType}\n开始时间: ${new Date().toLocaleString()}\n========================================\n\n`;
        writeStream.write(header);

        const sessionId = `log-${Date.now()}`;
        const session: LogSession = {
            id: sessionId,
            terminalName,
            terminalType,
            filePath,
            writeStream,
            startTime: new Date(),
            bytesWritten: 0
        };

        this.activeSessions.set(sessionId, session);
        Logger.info(`Started logging for terminal: ${terminalName} -> ${filePath}`);

        return filePath;
    }

    /**
     * 停止记录
     * @param terminalName 终端名称
     */
    async stopLogging(terminalName: string): Promise<void> {
        const session = this.findSessionByTerminalName(terminalName);
        if (!session) {
            throw new Error(`终端 "${terminalName}" 未在记录中`);
        }

        // 写入文件尾
        if (session.writeStream) {
            const footer = `\n\n========================================\n结束时间: ${new Date().toLocaleString()}\n总写入: ${session.bytesWritten} 字节\n`;
            session.writeStream.write(footer);
            session.writeStream.end();
            session.writeStream = null;
        }

        this.activeSessions.delete(session.id);
        Logger.info(`Stopped logging for terminal: ${terminalName}`);
    }

    /**
     * 写入日志数据
     * @param terminalName 终端名称
     * @param data 数据（已解码的字符串）
     */
    writeToLog(terminalName: string, data: string): void {
        const session = this.findSessionByTerminalName(terminalName);
        if (!session || !session.writeStream) {
            return;
        }

        const content = data;

        // 添加时间戳前缀
        const timestamp = new Date().toLocaleTimeString();
        const logLine = `[${timestamp}] ${content}`;

        session.writeStream.write(logLine);
        session.bytesWritten += Buffer.byteLength(logLine, 'utf8');
    }

    /**
     * 检查终端是否正在记录
     * @param terminalName 终端名称
     */
    isLogging(terminalName: string): boolean {
        return this.findSessionByTerminalName(terminalName) !== undefined;
    }

    /**
     * 获取所有活动记录会话
     */
    getActiveSessions(): LogSession[] {
        return Array.from(this.activeSessions.values());
    }

    /**
     * 获取记录会话信息
     * @param terminalName 终端名称
     */
    getSessionInfo(terminalName: string): LogSession | undefined {
        return this.findSessionByTerminalName(terminalName);
    }

    /**
     * 根据终端名称查找会话
     */
    private findSessionByTerminalName(terminalName: string): LogSession | undefined {
        for (const session of this.activeSessions.values()) {
            if (session.terminalName === terminalName) {
                return session;
            }
        }
        return undefined;
    }

    /**
     * 格式化时间戳
     */
    private formatTimestamp(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}_${hours}${minutes}${seconds}`;
    }

    /**
     * 清理所有记录会话
     */
    dispose(): void {
        for (const session of this.activeSessions.values()) {
            if (session.writeStream) {
                const footer = `\n\n=== 记录被中断 ===\n时间: ${new Date().toLocaleString()}\n`;
                session.writeStream.write(footer);
                session.writeStream.end();
            }
        }
        this.activeSessions.clear();
        Logger.info('TerminalLogger disposed');
    }
}
