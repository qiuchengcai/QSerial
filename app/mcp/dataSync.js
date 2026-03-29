"use strict";
/**
 * MCP 数据同步器
 * 监听 MCP 连接状态文件，用于树状图显示 MCP 连接状态
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
exports.MCPDataSync = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const logger_1 = require("../utils/logger");
/** 状态文件路径 */
const STATUS_DIR = path.join(os.homedir(), '.qserial');
class MCPDataSync {
    constructor() {
        this.statusWatcher = null;
        this._lastConnections = [];
        /** 当 MCP 连接状态变化时触发 */
        this.onStatusChanged = null;
        this.startStatusWatcher();
        logger_1.Logger.info('MCPDataSync 已初始化');
    }
    /**
     * 获取当前 MCP 连接列表
     */
    getMCPConnections() {
        return this._lastConnections;
    }
    /**
     * 监听状态文件，检测 MCP 连接状态变化
     */
    startStatusWatcher() {
        if (!fs.existsSync(STATUS_DIR)) {
            fs.mkdirSync(STATUS_DIR, { recursive: true });
        }
        this.statusWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(STATUS_DIR, 'status.json'));
        this.statusWatcher.onDidChange(() => this.checkStatus());
        this.statusWatcher.onDidCreate(() => this.checkStatus());
        // 初始检查
        this.checkStatus();
    }
    /**
     * 检查状态文件，更新连接状态
     */
    checkStatus() {
        try {
            const statusFile = path.join(STATUS_DIR, 'status.json');
            if (!fs.existsSync(statusFile)) {
                // 状态文件不存在，如果没有残留连接则无需通知
                if (this._lastConnections.length > 0) {
                    this._lastConnections = [];
                    this.notifyStatusChanged();
                }
                return;
            }
            const content = fs.readFileSync(statusFile, 'utf8');
            const status = JSON.parse(content);
            const connections = [];
            for (const terminal of status.terminals) {
                if (terminal.connected) {
                    connections.push({
                        id: terminal.id,
                        type: terminal.type,
                        connected: true,
                        path: terminal.path,
                        baudRate: terminal.baudRate,
                        host: terminal.host,
                        port: terminal.port,
                        username: terminal.username,
                    });
                }
            }
            // 检查连接状态是否变化，通知外部
            const changed = JSON.stringify(connections) !== JSON.stringify(this._lastConnections);
            this._lastConnections = connections;
            if (changed) {
                this.notifyStatusChanged();
            }
        }
        catch (err) {
            logger_1.Logger.error('检查 MCP 状态失败: ' + err.message);
        }
    }
    /**
     * 通知外部状态变化
     */
    notifyStatusChanged() {
        if (this.onStatusChanged) {
            this.onStatusChanged(this._lastConnections);
        }
    }
    dispose() {
        this.statusWatcher?.dispose();
        logger_1.Logger.info('MCPDataSync 已销毁');
    }
}
exports.MCPDataSync = MCPDataSync;
//# sourceMappingURL=dataSync.js.map