/**
 * QSerial MCP Server
 * 提供 AI 助手访问串口和 SSH 的 MCP 工具
 * 通过 HTTP 请求调用 QSerial 扩展执行实际操作
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
import * as http from 'http';

/** HTTP Server 端口 */
const HTTP_PORT = 9527;

/**
 * 发送 HTTP 请求到 QSerial HTTP Server
 */
async function callHttpServer(action: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(params);
        const options = {
            hostname: 'localhost',
            port: HTTP_PORT,
            path: `/mcp/${action}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.success) {
                        resolve(result.data);
                    } else {
                        reject(new Error(result.error || '操作失败'));
                    }
                } catch (err) {
                    reject(new Error('解析响应失败'));
                }
            });
        });

        req.on('error', (err) => {
            // 提供更详细的错误信息
            let errorMsg = err.message || '连接被拒绝';
            if (err.message.includes('ECONNREFUSED') || err.message === '') {
                errorMsg = `无法连接到 QSerial HTTP Server (端口 ${HTTP_PORT})。请确保：
1. VS Code 已安装 QSerial 扩展并启动
2. 在 VS Code 输出面板查看 "QSerial" 日志确认 HTTP Server 已启动
3. 端口 ${HTTP_PORT} 未被其他程序占用`;
            }
            reject(new Error(errorMsg));
        });

        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });

        req.write(body);
        req.end();
    });
}

const server = new Server(
    {
        name: 'qserial-mcp-server',
        version: '0.3.0',
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
                        },
                        hostId: {
                            type: 'string',
                            description: 'SSH 配置ID（可选，用于连接指定配置）'
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
                            description: '读取模式',
                            default: 'new'
                        },
                        bytes: {
                            type: 'number',
                            description: '读取字节数 (mode=new 时)',
                            default: 4096
                        },
                        lines: {
                            type: 'number',
                            description: '读取行数 (mode=lines 时)',
                            default: 50
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
                name: 'terminal_status',
                description: '获取终端连接状态',
                inputSchema: {
                    type: 'object',
                    properties: {
                        terminalId: {
                            type: 'string',
                            description: '终端ID（可选，不指定则返回所有）'
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
            },
            {
                name: 'config_get',
                description: '获取 QSerial 的所有实时配置信息，包括串口设置、SSH保存的主机、自定义按钮等',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            }
        ]
    };
});

// ==================== 工具调用处理 ====================

/** 生成唯一请求ID */
function generateRequestId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case 'terminal_connect': {
                const result = await callHttpServer('connect', { ...args, requestId: generateRequestId() });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true, ...result }, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_disconnect': {
                await callHttpServer('disconnect', { ...args, requestId: generateRequestId() });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true }, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_send': {
                await callHttpServer('send', { ...args, requestId: generateRequestId() });
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
                const result = await callHttpServer('read', { ...args, requestId: generateRequestId() });
                // result 格式: { success: true, data: "实际数据" }
                const actualData = result?.data || result || '';
                return {
                    content: [
                        {
                            type: 'text',
                            text: typeof actualData === 'string' ? actualData : JSON.stringify(actualData, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_wait': {
                const result = await callHttpServer('wait', { ...args, requestId: generateRequestId() });
                const actualData = result?.data || result || '';
                return {
                    content: [
                        {
                            type: 'text',
                            text: typeof actualData === 'string' ? actualData : JSON.stringify(actualData, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_send_signal': {
                // 将信号转换为对应的控制字符并发送
                const signalMap: Record<string, string> = {
                    'SIGINT': '\x03',   // Ctrl+C
                    'SIGQUIT': '\x04',  // Ctrl+D
                    'SIGTSTP': '\x1a',  // Ctrl+Z
                    'SIGTERM': '\x03'   // 默认用 Ctrl+C
                };
                const signal = args?.signal as string || 'SIGINT';
                const terminalId = args?.terminalId as string;
                const signalChar = signalMap[signal] || '\x03';
                await callHttpServer('send', {
                    terminalId,
                    data: signalChar,
                    appendNewline: false,
                    requestId: generateRequestId()
                });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true, signal, note: `已发送 ${signal} 信号` }, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_read_stream': {
                const result = await callHttpServer('read', { ...args, mode: 'new', clear: false, requestId: generateRequestId() });
                const actualData = result?.data || result || '';
                return {
                    content: [
                        {
                            type: 'text',
                            text: typeof actualData === 'string' ? actualData : JSON.stringify(actualData, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_get_screen': {
                const result = await callHttpServer('read', { ...args, mode: 'screen', requestId: generateRequestId() });
                const actualData = result?.data || result || '';
                return {
                    content: [
                        {
                            type: 'text',
                            text: typeof actualData === 'string' ? actualData : JSON.stringify(actualData, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_clear_buffer': {
                // 清除缓冲需要特殊处理
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true, note: '清除缓冲功能暂未实现' }, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_status': {
                const result = await callHttpServer('status', { ...args, requestId: generateRequestId() });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }

            case 'serial_list_ports': {
                const result = await callHttpServer('listPorts', { ...args, requestId: generateRequestId() });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }

            case 'config_get': {
                const result = await callHttpServer('getConfig', { ...args, requestId: generateRequestId() });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }

            default:
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ error: `未知工具: ${name}` }, null, 2)
                        }
                    ],
                    isError: true
                };
        }
    } catch (error) {
        const err = error as Error;
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({ error: err.message }, null, 2)
                }
            ],
            isError: true
        };
    }
});

// ==================== 资源注册 ====================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: 'qserial://status',
                name: 'QSerial 状态',
                description: '当前 QSerial 连接状态',
                mimeType: 'application/json'
            }
        ]
    };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === 'qserial://status') {
        try {
            const status = await callHttpServer('status', {});
            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(status, null, 2)
                    }
                ]
            };
        } catch (error) {
            const err = error as Error;
            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify({ error: err.message }, null, 2)
                    }
                ]
            };
        }
    }

    throw new Error(`未知资源: ${uri}`);
});

// ==================== 启动服务器 ====================

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('QSerial MCP Server 已启动 (HTTP 模式，端口 9527)');
}

main().catch((error) => {
    console.error('MCP Server 启动失败:', error);
    process.exit(1);
});
