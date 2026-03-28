/**
 * QSerial MCP Server
 * 提供 AI 助手访问串口和 SSH 的 MCP 工具
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
export { server };
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MCPTerminalManager } from './terminalManager.js';
import type {
    TerminalConnectConfig,
    ReadOptions,
    WaitOptions,
    PortInfo,
    TerminalInfo,
    CustomButton
} from './types.js';

const manager = new MCPTerminalManager();

const server = new Server(
    {
        name: 'qserial-mcp-server',
        version: '0.1.0',
    },
    {
        capabilities: {
            tools: {},
            resources: {},
        },
    }
);

// ==================== 工具注册 ====================

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            // 连接管理
            {
                name: 'terminal_connect',
                description: '连接到串口或SSH服务器',
                inputSchema: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['serial', 'ssh'],
                            description: '连接类型'
                        },
                        // 串口参数
                        path: {
                            type: 'string',
                            description: '串口路径，如 COM3 或 /dev/ttyUSB0'
                        },
                        baudRate: {
                            type: 'number',
                            description: '波特率',
                            default: 115200
                        },
                        dataBits: {
                            type: 'number',
                            enum: [5, 6, 7, 8],
                            description: '数据位',
                            default: 8
                        },
                        stopBits: {
                            type: 'number',
                            enum: [1, 2],
                            description: '停止位',
                            default: 1
                        },
                        parity: {
                            type: 'string',
                            enum: ['none', 'even', 'odd', 'mark', 'space'],
                            description: '校验位',
                            default: 'none'
                        },
                        encoding: {
                            type: 'string',
                            description: '编码方式',
                            default: 'gbk'
                        },
                        // SSH 参数
                        host: {
                            type: 'string',
                            description: 'SSH 主机地址'
                        },
                        port: {
                            type: 'number',
                            description: 'SSH 端口',
                            default: 22
                        },
                        username: {
                            type: 'string',
                            description: 'SSH 用户名'
                        },
                        password: {
                            type: 'string',
                            description: 'SSH 密码'
                        },
                        privateKey: {
                            type: 'string',
                            description: 'SSH 私钥内容或文件路径'
                        },
                        passphrase: {
                            type: 'string',
                            description: 'SSH 私钥密码'
                        }
                    },
                    required: ['type']
                }
            },
            {
                name: 'terminal_disconnect',
                description: '断开终端连接',
                inputSchema: {
                    type: 'object',
                    properties: {
                        terminalId: {
                            type: 'string',
                            description: '终端ID'
                        }
                    },
                    required: ['terminalId']
                }
            },
            // 数据通信
            {
                name: 'terminal_send',
                description: '向终端发送数据',
                inputSchema: {
                    type: 'object',
                    properties: {
                        terminalId: {
                            type: 'string',
                            description: '终端ID'
                        },
                        data: {
                            type: 'string',
                            description: '要发送的数据'
                        },
                        appendNewline: {
                            type: 'boolean',
                            description: '是否追加换行符',
                            default: true
                        }
                    },
                    required: ['terminalId', 'data']
                }
            },
            {
                name: 'terminal_read',
                description: '从终端读取数据',
                inputSchema: {
                    type: 'object',
                    properties: {
                        terminalId: {
                            type: 'string',
                            description: '终端ID'
                        },
                        mode: {
                            type: 'string',
                            enum: ['new', 'all', 'lines', 'screen'],
                            description: '读取模式: new=新数据, all=全部, lines=按行, screen=屏幕缓冲',
                            default: 'new'
                        },
                        lines: {
                            type: 'number',
                            description: '读取行数 (mode=lines 时)',
                            default: 50
                        },
                        bytes: {
                            type: 'number',
                            description: '读取字节数 (mode=new 时)',
                            default: 4096
                        },
                        clear: {
                            type: 'boolean',
                            description: '读取后是否清除缓冲',
                            default: true
                        }
                    },
                    required: ['terminalId']
                }
            },
            {
                name: 'terminal_wait',
                description: '等待终端输出匹配特定模式',
                inputSchema: {
                    type: 'object',
                    properties: {
                        terminalId: {
                            type: 'string',
                            description: '终端ID'
                        },
                        pattern: {
                            type: 'string',
                            description: '匹配模式（正则表达式或字符串）'
                        },
                        patternType: {
                            type: 'string',
                            enum: ['regex', 'string'],
                            description: '模式类型',
                            default: 'regex'
                        },
                        timeout: {
                            type: 'number',
                            description: '超时时间(毫秒)',
                            default: 10000
                        }
                    },
                    required: ['terminalId', 'pattern']
                }
            },
            {
                name: 'terminal_send_signal',
                description: '发送控制信号（如 Ctrl+C 中断运行中的命令）',
                inputSchema: {
                    type: 'object',
                    properties: {
                        terminalId: {
                            type: 'string',
                            description: '终端ID'
                        },
                        signal: {
                            type: 'string',
                            enum: ['SIGINT', 'SIGQUIT', 'SIGTSTP', 'SIGTERM'],
                            description: '信号类型: SIGINT=Ctrl+C, SIGQUIT=Ctrl+D, SIGTSTP=Ctrl+Z'
                        }
                    },
                    required: ['terminalId', 'signal']
                }
            },
            {
                name: 'terminal_read_stream',
                description: '流式读取数据（适合持续输出的命令如 top），不清除缓冲',
                inputSchema: {
                    type: 'object',
                    properties: {
                        terminalId: {
                            type: 'string',
                            description: '终端ID'
                        },
                        since: {
                            type: 'number',
                            description: '上次读取的时间戳（可选）'
                        }
                    },
                    required: ['terminalId']
                }
            },
            {
                name: 'terminal_clear_buffer',
                description: '清除终端缓冲区',
                inputSchema: {
                    type: 'object',
                    properties: {
                        terminalId: {
                            type: 'string',
                            description: '终端ID'
                        }
                    },
                    required: ['terminalId']
                }
            },
            {
                name: 'terminal_get_screen',
                description: '获取屏幕快照（处理 ANSI 控制码，适合 top 等命令）',
                inputSchema: {
                    type: 'object',
                    properties: {
                        terminalId: {
                            type: 'string',
                            description: '终端ID'
                        },
                        parseANSI: {
                            type: 'boolean',
                            description: '是否解析 ANSI 控制码',
                            default: true
                        }
                    },
                    required: ['terminalId']
                }
            },
            // 信息查询
            {
                name: 'terminal_status',
                description: '获取终端连接状态',
                inputSchema: {
                    type: 'object',
                    properties: {
                        terminalId: {
                            type: 'string',
                            description: '终端ID，不指定则返回所有'
                        }
                    }
                }
            },
            {
                name: 'serial_list_ports',
                description: '列出所有可用的串口设备',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case 'terminal_connect': {
                const config: TerminalConnectConfig = args as any;
                const terminalId = await manager.connect(config);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true, terminalId }, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_disconnect': {
                const { terminalId } = args as { terminalId: string };
                const success = manager.disconnect(terminalId);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success }, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_send': {
                const { terminalId, data, appendNewline = true } = args as {
                    terminalId: string;
                    data: string;
                    appendNewline?: boolean;
                };
                await manager.send(terminalId, data, appendNewline);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true }, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_read': {
                const { terminalId, mode = 'new', lines = 50, bytes = 4096, clear = true } = args as {
                    terminalId: string;
                    mode?: 'new' | 'all' | 'lines' | 'screen';
                    lines?: number;
                    bytes?: number;
                    clear?: boolean;
                };
                const result = manager.read(terminalId, { mode, lines, bytes, clear });
                return {
                    content: [
                        {
                            type: 'text',
                            text: result
                        }
                    ]
                };
            }

            case 'terminal_wait': {
                const { terminalId, pattern, patternType = 'regex', timeout = 10000 } = args as unknown as WaitOptions & { terminalId: string };
                const result = await manager.wait(terminalId, { pattern, patternType, timeout });
                return {
                    content: [
                        {
                            type: 'text',
                            text: result
                        }
                    ]
                };
            }

            case 'terminal_send_signal': {
                const { terminalId, signal } = args as {
                    terminalId: string;
                    signal: 'SIGINT' | 'SIGQUIT' | 'SIGTSTP' | 'SIGTERM';
                };
                await manager.sendSignal(terminalId, signal);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true }, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_read_stream': {
                const { terminalId, since } = args as {
                    terminalId: string;
                    since?: number;
                };
                const result = manager.readStream(terminalId, since);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_clear_buffer': {
                const { terminalId } = args as { terminalId: string };
                manager.clearBuffer(terminalId);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true }, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_get_screen': {
                const { terminalId, parseANSI = true } = args as {
                    terminalId: string;
                    parseANSI?: boolean;
                };
                const screen = manager.getScreenSnapshot(terminalId);
                return {
                    content: [
                        {
                            type: 'text',
                            text: screen
                        }
                    ]
                };
            }

            case 'terminal_status': {
                const { terminalId } = args as { terminalId?: string };
                if (terminalId) {
                    const info = manager.getTerminalInfo(terminalId);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(info || null, null, 2)
                            }
                        ]
                    };
                } else {
                    const terminals = manager.getAllTerminals();
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(terminals, null, 2)
                            }
                        ]
                    };
                }
            }

            case 'serial_list_ports': {
                const ports = await manager.listPorts();
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(ports, null, 2)
                        }
                    ]
                };
            }

            default:
                throw new Error(`未知工具: ${name}`);
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({ error: errorMsg }, null, 2)
                }
            ]
        };
    }
});

// ==================== 资源注册 ====================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: 'qserial://status',
                name: '终端状态',
                description: '所有终端的连接状态',
                mimeType: 'application/json'
            },
            {
                uri: 'qserial://ports',
                name: '串口列表',
                description: '可用的串口设备',
                mimeType: 'application/json'
            }
        ]
    };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
        if (uri === 'qserial://status') {
            const terminals = manager.getAllTerminals();
            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(terminals, null, 2)
                    }
                ]
            };
        } else if (uri === 'qserial://ports') {
            const ports = await manager.listPorts();
            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(ports, null, 2)
                    }
                ]
            };
        } else {
            throw new Error(`未知资源: ${uri}`);
        }
    } catch (error) {
        throw new Error(`读取资源失败: ${(error as Error).message}`);
    }
});

// ==================== 启动服务器 ====================

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // 优雅退出
    process.on('SIGINT', async () => {
        manager.dispose();
        await server.close();
        process.exit(0);
    });

    console.error('QSerial MCP Server 已启动');
}

main().catch((error) => {
    console.error('启动失败:', error);
    process.exit(1);
});
