/**
 * MCP HTTP Server
 * 提供 HTTP 接口供 MCP Server 调用
 */

import * as http from 'http';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export class MCPHttpServer {
    private server: http.Server | null = null;
    private port: number = 9527;
    private commandHandler: any;

    constructor(commandHandler: any) {
        this.commandHandler = commandHandler;
    }

    start(): void {
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
                let result: any;

                if (req.method === 'POST') {
                    // 读取请求体
                    const body = await this.readBody(req);
                    const params = JSON.parse(body);

                    // 路由到对应的处理方法
                    result = await this.handleRequest(pathname, params);
                } else if (req.method === 'GET') {
                    // GET 请求，从 query 参数获取
                    const params: any = {};
                    url.searchParams.forEach((value, key) => {
                        params[key] = value;
                    });
                    result = await this.handleRequest(pathname, params);
                } else {
                    res.writeHead(405);
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, data: result }));
            } catch (error) {
                const err = error as Error;
                Logger.error(`MCP HTTP 请求失败: ${err.message}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });

        this.server.listen(this.port, () => {
            Logger.info(`MCP HTTP Server 已启动，监听端口 ${this.port}`);
        });
    }

    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
            Logger.info('MCP HTTP Server 已停止');
        }
    }

    getPort(): number {
        return this.port;
    }

    private async readBody(req: http.IncomingMessage): Promise<string> {
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

    private async handleRequest(pathname: string, params: any): Promise<any> {
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