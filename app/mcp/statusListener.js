"use strict";
/**
 * MCP 状态监听器
 * 监听 QMCP 写入的状态文件，同步更新 QSerial 扩展的 UI
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
exports.StatusListener = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const logger_1 = require("../utils/logger");
/** 状态文件路径 */
const STATUS_DIR = path.join(os.homedir(), '.qserial');
const STATUS_FILE = path.join(STATUS_DIR, 'status.json');
/**
 * MCP 状态监听器
 * 使用 FileSystemWatcher 监听状态文件变化
 */
class StatusListener {
    constructor() {
        this.watcher = null;
        this.lastStatus = null;
        this._onStatusChange = new vscode.EventEmitter();
        /** 状态变化事件 */
        this.onStatusChange = this._onStatusChange.event;
        this.startWatching();
        logger_1.Logger.info('StatusListener 已初始化');
    }
    /**
     * 开始监听状态文件
     */
    startWatching() {
        // 确保目录存在
        if (!fs.existsSync(STATUS_DIR)) {
            fs.mkdirSync(STATUS_DIR, { recursive: true });
        }
        // 创建文件监听器
        this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(STATUS_DIR, 'status.json'));
        // 监听文件变化
        this.watcher.onDidChange(() => this.readStatus());
        this.watcher.onDidCreate(() => this.readStatus());
        this.watcher.onDidDelete(() => this.handleFileDelete());
        // 初始读取
        this.readStatus();
    }
    /**
     * 读取状态文件
     */
    readStatus() {
        try {
            if (!fs.existsSync(STATUS_FILE)) {
                logger_1.Logger.info('状态文件不存在');
                return;
            }
            const content = fs.readFileSync(STATUS_FILE, 'utf8');
            const status = JSON.parse(content);
            logger_1.Logger.info(`读取状态文件: ${status.terminals.length} 个终端, lastStatus: ${this.lastStatus ? '有' : '无'}`);
            // 检测变化并发射事件
            this.detectChanges(status);
            this.lastStatus = status;
        }
        catch (err) {
            logger_1.Logger.error('读取状态文件失败: ' + err.message);
        }
    }
    /**
     * 检测状态变化
     */
    detectChanges(newStatus) {
        if (!this.lastStatus) {
            // 首次读取，所有连接都是新连接
            logger_1.Logger.info(`首次读取状态，检测 ${newStatus.terminals.length} 个终端`);
            for (const terminal of newStatus.terminals) {
                if (terminal.connected) {
                    logger_1.Logger.info(`发射 connected 事件: ${terminal.id}`);
                    this._onStatusChange.fire({
                        type: 'connected',
                        terminal,
                    });
                }
            }
            return;
        }
        const oldMap = new Map(this.lastStatus.terminals.map(t => [t.id, t]));
        const newMap = new Map(newStatus.terminals.map(t => [t.id, t]));
        // 检测新连接
        for (const [id, terminal] of newMap) {
            const old = oldMap.get(id);
            if (!old && terminal.connected) {
                // 新连接
                this._onStatusChange.fire({
                    type: 'connected',
                    terminal,
                });
            }
            else if (old && !old.connected && terminal.connected) {
                // 从断开变为连接
                this._onStatusChange.fire({
                    type: 'connected',
                    terminal,
                });
            }
        }
        // 检测断开
        for (const [id, terminal] of oldMap) {
            const newTerm = newMap.get(id);
            if (!newTerm && terminal.connected) {
                // 已删除的连接
                this._onStatusChange.fire({
                    type: 'disconnected',
                    terminal,
                });
            }
            else if (newTerm && terminal.connected && !newTerm.connected) {
                // 从连接变为断开
                this._onStatusChange.fire({
                    type: 'disconnected',
                    terminal,
                });
            }
        }
    }
    /**
     * 处理文件删除
     */
    handleFileDelete() {
        if (this.lastStatus) {
            // 所有连接都断开
            for (const terminal of this.lastStatus.terminals) {
                if (terminal.connected) {
                    this._onStatusChange.fire({
                        type: 'disconnected',
                        terminal,
                    });
                }
            }
        }
        this.lastStatus = null;
    }
    /**
     * 获取当前状态
     */
    getCurrentStatus() {
        return this.lastStatus;
    }
    /**
     * 获取状态文件路径
     */
    getStatusFilePath() {
        return STATUS_FILE;
    }
    dispose() {
        this.watcher?.dispose();
        this._onStatusChange.dispose();
        logger_1.Logger.info('StatusListener 已销毁');
    }
}
exports.StatusListener = StatusListener;
//# sourceMappingURL=statusListener.js.map