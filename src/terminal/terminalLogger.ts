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
    lineBuffer: string;  // 行缓冲区，累积数据直到换行
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
            bytesWritten: 0,
            lineBuffer: ''
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

        // 写入缓冲区中剩余的内容
        if (session.writeStream && session.lineBuffer.trim()) {
            const timestamp = new Date().toLocaleTimeString();
            const logLine = `[${timestamp}] ${session.lineBuffer.trim()}\n`;
            session.writeStream.write(logLine);
            session.bytesWritten += Buffer.byteLength(logLine, 'utf8');
            session.lineBuffer = '';
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
     * 剥离 ANSI 转义序列
     * 包括颜色、光标移动、清屏、括号粘贴模式等控制码
     */
    private stripANSI(text: string): string {
        // 使用全面的 ANSI 转义序列匹配：
        // 1. CSI 序列: \x1b[ 后跟参数和最终字节（覆盖所有 \x1b[...X 形式）
        // 2. OSC 序列: \x1b]...\x07 或 \x1b]...\x1b\\
        // 3. 单字节转义: \x1b 后跟单个字符（如 \x1b=, \x1b>, \x1b( 等）
        // 4. 回车符 \r
        return text.replace(/\x1b\[[0-9;?]*[a-zA-Z@`]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][AB012]|\x1b[=>]|\x1b.[\x40-\x7e]?|\r/g, '');
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

        // 剥离 ANSI 转义序列，保留纯文本
        const content = this.stripANSI(data);

        // 跳过剥离后为空的内容（只有控制码的数据）
        if (!content) {
            return;
        }

        // 累积到行缓冲区
        session.lineBuffer += content;

        // 检查是否有完整行（包含换行符）
        const lines = session.lineBuffer.split('\n');
        
        // 如果有多个部分，说明有完整行
        if (lines.length > 1) {
            // 写入所有完整行（除了最后一个不完整的部分）
            for (let i = 0; i < lines.length - 1; i++) {
                const line = lines[i].trim();
                if (line) {
                    const timestamp = new Date().toLocaleTimeString();
                    const logLine = `[${timestamp}] ${line}\n`;
                    session.writeStream.write(logLine);
                    session.bytesWritten += Buffer.byteLength(logLine, 'utf8');
                }
            }
            // 保留最后一个不完整的部分在缓冲区
            session.lineBuffer = lines[lines.length - 1];
        }
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
