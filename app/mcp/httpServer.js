"use strict";
/**
 * MCP HTTP Server
 * 提供 HTTP 接口供 MCP Server 调用
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
exports.MCPHttpServer = void 0;
const http = __importStar(require("http"));
const logger_1 = require("../utils/logger");
class MCPHttpServer {
    constructor(commandHandler) {
        this.server = null;
        this.port = 9527;
        this.commandHandler = commandHandler;
    }
    start() {
        this.server = http.createServer(async (req, res) => {
            // 设置 CORS 头
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }
            // 解析 URL
            const url = new URL(req.url || '/', `http://localhost:${this.port}`);
            const pathname = url.pathname;
            try {
                let result;
                if (req.method === 'POST') {
                    // 读取请求体
                    const body = await this.readBody(req);
                    const params = JSON.parse(body);
                    // 路由到对应的处理方法
                    result = await this.handleRequest(pathname, params);
                }
                else if (req.method === 'GET') {
                    // GET 请求，从 query 参数获取
                    const params = {};
                    url.searchParams.forEach((value, key) => {
                        params[key] = value;
                    });
                    result = await this.handleRequest(pathname, params);
                }
                else {
                    res.writeHead(405);
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, data: result }));
            }
            catch (error) {
                const err = error;
                logger_1.Logger.error(`MCP HTTP 请求失败: ${err.message}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        this.server.listen(this.port, () => {
            logger_1.Logger.info(`MCP HTTP Server 已启动，监听端口 ${this.port}`);
        });
    }
    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            logger_1.Logger.info('MCP HTTP Server 已停止');
        }
    }
    getPort() {
        return this.port;
    }
    async readBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', (chunk) => {
                body += chunk.toString();
            });
            req.on('end', () => {
                resolve(body);
            });
            req.on('error', reject);
        });
    }
    async handleRequest(pathname, params) {
        // 移除 pathname 前缀的 /mcp/
        const action = pathname.replace('/mcp/', '').replace('/', '');
        switch (action) {
            case 'connect':
                return await this.commandHandler.handleConnect(params);
            case 'send':
                return await this.commandHandler.handleSend(params);
            case 'disconnect':
                return await this.commandHandler.handleDisconnect(params);
            case 'read':
                return await this.commandHandler.handleRead(params);
            case 'wait':
                return await this.commandHandler.handleWait(params);
            case 'listPorts':
                return await this.commandHandler.handleListPorts(params);
            case 'status':
                return await this.commandHandler.handleStatus(params);
            case 'getConfig':
                return await this.commandHandler.handleGetConfig(params);
            default:
                throw new Error(`未知操作: ${action}`);
        }
    }
}
exports.MCPHttpServer = MCPHttpServer;
//# sourceMappingURL=httpServer.js.map