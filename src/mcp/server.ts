/**
 * QSerial MCP Server
 * 提供 AI 助手访问串口和 SSH 的 MCP 工具
 * 通过 VS Code 命令调用 QSerial 扩展执行实际操作
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
import * as childProcess from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';

/** 结果目录 */
const RESULT_DIR = path.join(os.homedir(), '.qserial', 'results');

/** 确保结果目录存在 */
function ensureResultDir(): void {
    if (!fs.existsSync(RESULT_DIR)) {
        fs.mkdirSync(RESULT_DIR, { recursive: true });
    }
}

/**
 * 调用 VS Code 命令并等待结果
 */
async function callVSCodeCommand(command: string, args: any): Promise<any> {
    const requestId = crypto.randomUUID();
    ensureResultDir();

    // 添加 requestId 到参数
    const paramsWithId = { ...args, requestId };

    // 构建命令
    const argsJson = JSON.stringify(paramsWithId);
    const codeCommand = `code --command ${command} --args '${argsJson}'`;

    // 执行命令
    return new Promise((resolve, reject) => {
        childProcess.exec(codeCommand, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`命令执行失败: ${error.message}`));
                return;
            }
        });

        // 轮询等待结果
        const resultFile = path.join(RESULT_DIR, `${requestId}.json`);
        const startTime = Date.now();
        const timeout = 30000; // 30秒超时

        const checkResult = () => {
            if (fs.existsSync(resultFile)) {
                try {
                    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
                    // 删除结果文件
                    fs.unlinkSync(resultFile);
                    if (result.success) {
                        resolve(result.data);
                    } else {
                        reject(new Error(result.error || '操作失败'));
                    }
                } catch (err) {
                    reject(new Error('解析结果失败'));
                }
            } else if (Date.now() - startTime > timeout) {
                reject(new Error('操作超时'));
            } else {
                setTimeout(checkResult, 100);
            }
        };

        // 延迟开始检查，给 VS Code 时间处理命令
        setTimeout(checkResult, 500);
    });
}

const server = new Server(
    {
        name: 'qserial-mcp-server',
        version: '0.2.0',
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
            }
        ]
    };
});

// ==================== 工具调用处理 ====================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case 'terminal_connect': {
                const result = await callVSCodeCommand('qserial.mcp.connect', args);
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
                await callVSCodeCommand('qserial.mcp.disconnect', args);
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
                await callVSCodeCommand('qserial.mcp.send', args);
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
                const result = await callVSCodeCommand('qserial.mcp.read', args);
                return {
                    content: [
                        {
                            type: 'text',
                            text: result || ''
                        }
                    ]
                };
            }

            case 'terminal_wait': {
                const result = await callVSCodeCommand('qserial.mcp.wait', args);
                return {
                    content: [
                        {
                            type: 'text',
                            text: result || ''
                        }
                    ]
                };
            }

            case 'terminal_send_signal': {
                // 信号发送需要特殊处理
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true, note: '信号发送功能暂未实现' }, null, 2)
                        }
                    ]
                };
            }

            case 'terminal_read_stream': {
                const result = await callVSCodeCommand('qserial.mcp.read', { ...args, mode: 'new', clear: false });
                return {
                    content: [
                        {
                            type: 'text',
                            text: result || ''
                        }
                    ]
                };
            }

            case 'terminal_get_screen': {
                const result = await callVSCodeCommand('qserial.mcp.read', { ...args, mode: 'screen' });
                return {
                    content: [
                        {
                            type: 'text',
                            text: result || ''
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
                const result = await callVSCodeCommand('qserial.mcp.status', args);
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
                const result = await callVSCodeCommand('qserial.mcp.listPorts', args);
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
            const status = await callVSCodeCommand('qserial.mcp.status', {});
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
    console.error('QSerial MCP Server 已启动 (VS Code 命令模式)');
}

main().catch((error) => {
    console.error('MCP Server 启动失败:', error);
    process.exit(1);
});
