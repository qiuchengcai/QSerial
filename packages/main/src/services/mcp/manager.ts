/**
 * MCP (Model Context Protocol) 服务器管理器
 * 内建 HTTP MCP Server，支持 SSE 和 streamableHttp 两种传输方式
 */

import * as http from 'node:http';
import * as crypto from 'node:crypto';
import { BrowserWindow } from 'electron';
import { ConnectionFactory } from '../connection/factory.js';
import { IPC_CHANNELS } from '@qserial/shared';
import { MCP_RESOURCES, readResource, setResourcesWindow } from './resources.js';
import { sseClients } from './notifications.js';
import { drainSampling, resolveSampling } from './sampling.js';
import { MCP_PROMPTS, getPrompt } from './prompts.js';
import {
  loadPlugins,
  getPluginResources,
  readPluginResource,
  getPluginPrompts,
  getPluginPrompt,
} from './plugin-loader.js';
import * as ctx from './context.js';
import { getMcpToolDefinitions, getMcpToolHandler } from '../../plugins/registry.js';
import type { ToolContext } from './types.js';

// Handler imports
import { deviceHandlers } from './tools/device.js';
import { sessionHandlers } from './tools/session.js';
import { connectionHandlers } from './tools/connection.js';
import { connIOHandlers } from './tools/connection-io.js';
import { connAdvancedHandlers } from './tools/connection-advanced.js';
import { sftpHandlers } from './tools/sftp.js';
import { appHandlers } from './tools/app.js';
import { buttonsHandlers } from './tools/buttons.js';

// ==================== 模块级状态 ====================

let mcpServer: http.Server | null = null;
let mcpRunning = false;
let mcpPort = 9800;
let mcpListenAddress = '127.0.0.1';
let removeConnectionDestroyHook: (() => void) | null = null;

// 构建 ToolContext
const toolContext: ToolContext = {
  get mainWindow() {
    return ctx.mainWindow;
  },
  get buffers() {
    return ctx.buffers;
  },
  get bufferSubscriptions() {
    return ctx.bufferSubscriptions;
  },
  get sharePool() {
    return ctx.sharePool;
  },
  get watches() {
    return ctx.watches;
  },
  get watchResults() {
    return ctx.watchResults;
  },
  get recordings() {
    return ctx.recordings;
  },
};

export interface McpServerStatus {
  running: boolean;
  port: number;
  listenAddress: string;
  needsAuth: boolean;
  token?: string;
  connections: {
    id: string;
    type: string;
    name: string;
    state: string;
  }[];
}

// ==================== 工具定义 ====================

const MCP_TOOLS = [
  {
    name: 'conn.list',
    description:
      '列出所有活跃连接，或传 id 获取指定连接详细信息（含完整连接参数）。无参数时返回摘要列表，传 id 时返回详情。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID（可选，传此参数返回该连接详情）' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'conn.data.write',
    description:
      '向指定连接发送数据或命令。支持发送前延迟和条件等待。注意：终端命令末尾需包含 \\n 换行符。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        data: { type: 'string', description: '要发送的文本，如 "ls -la\\n"' },
        delay_ms: { type: 'integer', description: '发送前等待毫秒数，默认 0' },
        wait_before: {
          type: 'string',
          description: '发送前等待输出中出现此文本（子串匹配），超时 10s',
        },
        response_timeout_ms: {
          type: 'integer',
          description:
            '等待回显最大毫秒数，默认 2000。有新数据立即返回，不等到超时。慢速嵌入式设备建议 3000-5000',
        },
      },
      required: ['data'],
    },
  },
  {
    name: 'conn.data.write_hex',
    description:
      '向指定连接发送十六进制数据。输入为纯十六进制字符串（如 "0D0A"），自动转为二进制发送。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        hex: { type: 'string', description: '十六进制字符串，仅允许 0-9, A-F, a-f' },
      },
      required: ['hex'],
    },
  },
  {
    name: 'conn.data.read',
    description:
      '读取连接输出缓冲区。支持 consume 模式（读后清空）和 peek 模式（预览不清空）。max_bytes=0 时仅清空。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        consume: {
          type: 'boolean',
          description: '是否消费（读后清空），默认 true（读后清空）。false 为预览模式',
        },
        max_bytes: {
          type: 'integer',
          description: '最多读取字节数，默认 4096。0 表示仅清空（consume=true 时）',
        },
      },
    },
  },
  {
    name: 'conn.data.clear',
    description: '清空连接输出缓冲区，返回释放的字节数。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'conn.data.expect',
    description: '等待指定模式出现在连接输出中。支持子串匹配和正则匹配，超时返回诊断信息。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        pattern: { type: 'string', description: '要等待的模式（子串或正则）' },
        regex: { type: 'boolean', description: '是否使用正则匹配，默认 false' },
        timeout: { type: 'number', description: '超时秒数，默认 30', default: 30 },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'conn.create',
    description:
      '创建并连接一个新设备（serial/ssh/telnet/pty）。创建后自动打开连接，数据流向渲染进程。',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '连接类型: serial, ssh, telnet, pty' },
        name: { type: 'string', description: '连接名称（可选，自动生成）' },
        path: { type: 'string', description: '串口路径（serial 类型必需）' },
        baudRate: { type: 'integer', description: '波特率（serial 默认 9600）' },
        dataBits: { type: 'integer', description: '数据位' },
        stopBits: { type: 'integer', description: '停止位' },
        parity: { type: 'string', description: '校验位' },
        flowControl: {
          type: 'string',
          description: '流控: "none" / "hardware" / "software"（serial 可选，默认 none）',
        },
        host: { type: 'string', description: '主机名/IP（ssh/telnet 必需）' },
        port: { type: 'integer', description: '端口（ssh 默认 22, telnet 默认 23）' },
        username: { type: 'string', description: '用户名（ssh 必需）' },
        password: { type: 'string', description: '密码（ssh 可选）' },
        privateKey: { type: 'string', description: '私钥内容（ssh 可选）' },
        passphrase: { type: 'string', description: '私钥密码（ssh 可选）' },
        jumpHost: {
          type: 'object',
          description: '跳板机配置 { host, port?, username, password?, privateKey? }',
        },
        shell: {
          type: 'string',
          description: 'PTY shell 命令（pty 类型，默认操作系统默认 shell）',
        },
        savedSessionId: { type: 'string', description: '保存的会话 ID（用于渲染进程恢复 UI）' },
      },
      required: ['type'],
    },
  },
  {
    name: 'conn.disconnect',
    description: '销毁指定连接。连接将从工厂移除，所有关联资源被释放。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'conn.reconnect',
    description: '重新连接指定设备。先关闭当前连接再打开新连接。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'conn.update',
    description: '修改连接参数。支持调整终端尺寸（cols/rows）和串口波特率（仅 serial）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        cols: { type: 'integer', description: '终端列数' },
        rows: { type: 'integer', description: '终端行数' },
        baudRate: { type: 'integer', description: '波特率（仅 serial 支持）' },
      },
    },
  },
  {
    name: 'conn.analyze.state',
    description: '分析终端交互状态。检测是否处于登录提示、密码提示、Shell 环境、启动中等状态。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'conn.script.login',
    description:
      '自动化登录流程。等待登录提示 → 发送用户名 → 等待密码提示 → 发送密码 → 等待 Shell 就绪。支持无密码设备和 AI 采样回退。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        username: { type: 'string', description: '用户名' },
        password: { type: 'string', description: '密码（可选，默认空）' },
        loginPrompt: {
          type: 'string',
          description: '登录提示符正则（默认 login[:\\s]|username[:\\s]）',
        },
        passwordPrompt: { type: 'string', description: '密码提示符正则（默认 [Pp]assword[:\\s]）' },
        shellPrompt: { type: 'string', description: 'Shell 提示符正则（默认 [#$>]\\s）' },
        timeout: { type: 'number', description: '超时秒数（默认 30）', default: 30 },
        debug: { type: 'boolean', description: '输出调试步骤（默认 true）' },
        no_password: {
          type: 'boolean',
          description: '跳过密码步骤（仅发送用户名）。用于无密码设备',
        },
      },
      required: ['username'],
    },
  },
  {
    name: 'device.ports',
    description: '列出计算机上可用的串口设备列表。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'session.list',
    description: '列出 QSerial 中所有已保存的会话配置。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'session.save',
    description: '保存会话配置（serial/ssh/telnet/pty），可通过 name 覆盖更新已有会话。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '会话 ID（可选，用于更新已有会话）' },
        name: { type: 'string', description: '会话名称（必需）' },
        type: { type: 'string', description: '连接类型: serial, ssh, telnet, pty（必需）' },
        serialConfig: { type: 'object', description: '串口配置' },
        sshConfig: { type: 'object', description: 'SSH 配置' },
        telnetConfig: { type: 'object', description: 'Telnet 配置' },
        ptyConfig: { type: 'object', description: 'PTY 配置' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'session.delete',
    description: '删除已保存的会话配置。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '要删除的会话 ID' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'buttons.groups.list',
    description:
      '列出所有快捷按钮分组。返回每个分组的 id、名称与按钮数量，以及各按钮的 id/名称摘要。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'buttons.list',
    description:
      '列出快捷按钮（完整字段）。可传 group_id 只看指定分组；不传则列出所有分组下的按钮。',
    inputSchema: {
      type: 'object',
      properties: {
        group_id: { type: 'string', description: '分组 ID（可选，缺省列出全部）' },
      },
    },
  },
  {
    name: 'buttons.get',
    description: '按按钮 id 获取单个快捷按钮的完整详情。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '按钮 ID（必需）' },
      },
      required: ['id'],
    },
  },
  {
    name: 'buttons.create',
    description:
      '在指定分组创建快捷按钮。name 与 command（或非空 commands）必填；支持 delay/noNewline/macroId/description/color/textColor。id 由服务端生成。',
    inputSchema: {
      type: 'object',
      properties: {
        group_id: { type: 'string', description: '目标分组 ID（必需）' },
        name: { type: 'string', description: '按钮名称（必需）' },
        command: { type: 'string', description: '单条命令（单行按钮）。多行请用 commands' },
        commands: {
          type: 'array',
          description: '多行命令数组（多行按钮，按行依次发送）',
          items: { type: 'string' },
        },
        delay: { type: 'integer', description: '多行命令行间延迟 ms（默认 100）' },
        noNewline: { type: 'boolean', description: 'true 时不自动追加 \\r\\n' },
        macroId: { type: 'string', description: '关联终端宏 ID（存在时点击回放宏而非发送文本）' },
        description: { type: 'string', description: '按钮描述（可选）' },
        color: { type: 'string', description: '按钮颜色（可选，如 #EF4444）' },
        textColor: { type: 'string', description: '文字颜色（可选）' },
      },
      required: ['group_id', 'name'],
    },
  },
  {
    name: 'buttons.update',
    description: '按按钮 id 局部更新快捷按钮的任意字段。仅更新传入字段，未传字段保持不变。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '按钮 ID（必需）' },
        name: { type: 'string', description: '新名称' },
        command: { type: 'string', description: '新命令（覆盖单行）' },
        commands: {
          type: 'array',
          description: '新多行命令数组',
          items: { type: 'string' },
        },
        delay: { type: 'integer', description: '行间延迟 ms' },
        noNewline: { type: 'boolean', description: '是否不自动追加换行' },
        macroId: { type: 'string', description: '关联宏 ID' },
        description: { type: 'string', description: '描述' },
        color: { type: 'string', description: '颜色' },
        textColor: { type: 'string', description: '文字颜色' },
      },
      required: ['id'],
    },
  },
  {
    name: 'buttons.delete',
    description:
      '按按钮 id 删除快捷按钮。删除是破坏性操作：必须显式传 confirm=true，否则拒绝执行。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '按钮 ID（必需）' },
        confirm: { type: 'boolean', description: '确认删除，必须为 true' },
      },
      required: ['id'],
    },
  },
  {
    name: 'buttons.groups.create',
    description: '创建一个空快捷按钮分组。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '分组名称（必需，且不能与其他分组重名）' },
      },
      required: ['name'],
    },
  },
  {
    name: 'buttons.groups.update',
    description: '重命名快捷按钮分组。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '分组 ID（必需）' },
        name: { type: 'string', description: '新分组名称（必需）' },
      },
      required: ['id', 'name'],
    },
  },
  {
    name: 'buttons.groups.delete',
    description:
      '删除快捷按钮分组。组为空：仅需 confirm=true；组内有按钮：需 confirm=true 且 cascade=true 级联删除整组（与 GUI 整组移除语义一致）。不传 confirm 一律拒绝。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '分组 ID（必需）' },
        confirm: { type: 'boolean', description: '确认删除，必须为 true' },
        cascade: { type: 'boolean', description: '组内有按钮时是否级联删除（默认 false）' },
      },
      required: ['id'],
    },
  },
  {
    name: 'buttons.run',
    description:
      '在指定已打开连接上执行一个快捷按钮，等价用户在 GUI 点击该按钮。普通按钮按行依次发送（支持行间 delay 与 noNewline）；按钮关联宏（macroId）时按宏步骤回放。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '快捷按钮 ID（必需）' },
        connection_id: { type: 'string', description: '目标连接 ID（必需，需已连接）' },
        connectionId: { type: 'string', description: '连接 ID（connection_id 的别名）' },
      },
      required: ['id'],
    },
  },
  {
    name: 'conn.hw.dtr_rts',
    description: '控制串口 DTR/RTS 信号线。仅串口连接可用。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        dtr: { type: 'boolean', description: 'DTR 信号电平（高/低）' },
        rts: { type: 'boolean', description: 'RTS 信号电平（高/低）' },
      },
    },
  },
  {
    name: 'conn.hw.break',
    description: '发送串口 break 信号。仅串口连接可用。duration_ms 范围 10-5000ms。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        duration_ms: {
          type: 'integer',
          description: 'break 持续时间（ms），默认 200，范围 10-5000',
        },
      },
    },
  },
  {
    name: 'conn.share',
    description: '管理连接共享（TCP Telnet 桥接）。支持启动、停止和列出共享。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '"start" / "stop" / "list"' },
        connection_id: { type: 'string', description: '源连接 ID（start 时必需）' },
        local_port: { type: 'integer', description: 'TCP 本地监听端口（start 时必需）' },
        listen_address: { type: 'string', description: '侦听地址（默认 0.0.0.0）' },
        password: { type: 'string', description: 'Telnet 访问密码（可选，默认取 MCP 密码）' },
        share_id: { type: 'string', description: '共享 ID（stop 时必需）' },
      },
      required: ['action'],
    },
  },
  {
    name: 'conn.file.send',
    description: '通过 XMODEM/YMODEM 协议向串口设备发送文件。仅串口连接可用。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        localPath: { type: 'string', description: '要发送的本地文件路径' },
        protocol: { type: 'string', description: '协议: "xmodem" 或 "ymodem"（默认 "xmodem"）' },
        timeout: { type: 'number', description: '传输超时秒数（默认 10）' },
        retries: { type: 'integer', description: '每包最大重试次数（默认 10）' },
      },
      required: ['localPath'],
    },
  },
  {
    name: 'conn.file.write',
    description:
      '将本地文本文件逐行写入串口设备。通过 echo/printf 命令逐行发送，自动转义特殊字符。适用于无 XModem 支持的设备。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        localPath: { type: 'string', description: '要发送的本地文件路径' },
        remote_path: {
          type: 'string',
          description: '设备端目标路径（如 /etc/config.conf），不传则输出到 stdout',
        },
        write_cmd: {
          type: 'string',
          description: '写入命令（默认 "echo"），可用 "printf" 处理特殊字符',
        },
        chunk_size: { type: 'integer', description: '每行最大字节数（默认 256）' },
        delay_ms: { type: 'integer', description: '行间延迟毫秒数（默认 30）' },
      },
      required: ['localPath'],
    },
  },
  {
    name: 'app.screenshot',
    description:
      '获取应用窗口截图。支持 html（DOM 快照）和 image（SVG+JPEG）两种模式。自动保存到 docs 目录。',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: '"html" 返回 innerHTML（快而轻量） / "image" 返回 SVG 截图（默认 "html"）',
        },
        compact: { type: 'boolean', description: 'html 模式下是否清理冗余属性（默认 true）' },
        scale: { type: 'number', description: 'image 模式缩放比例（默认 0.5）' },
        quality: { type: 'integer', description: 'image 模式 JPEG 质量（默认 60）' },
        scope: {
          type: 'string',
          description: 'image 模式:"body" 仅 body 区域 / "window" 整个窗口（默认 "body"）',
        },
      },
    },
  },
  {
    name: 'conn.data.send',
    description:
      '向连接发送命令并等待 Shell 提示符返回清理后的输出。自动剥离回显和提示符，解析 AT 命令响应。用于命令执行（expect 等需要自动匹配提示符的场景）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        command: { type: 'string', description: '要执行的命令（自动追加 \\n 换行）' },
        timeout_ms: { type: 'integer', description: '超时毫秒数（默认 5000）' },
        strip_echo: { type: 'boolean', description: '是否剥离命令回显（默认 true）' },
        strip_prompt: { type: 'boolean', description: '是否剥离末尾提示符（默认 true）' },
      },
      required: ['command'],
    },
  },
  {
    name: 'conn.data.history',
    description: '获取连接的发送/接收历史记录摘要。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        max_entries: { type: 'integer', description: '最大返回条目数（默认 20）' },
      },
    },
  },
  {
    name: 'conn.script.run',
    description:
      '执行一系列 send/expect 步骤（自动化脚本运行器）。每步发送命令 → 等待 Shell 提示符 → 检查 expect。失败步骤支持 AI 采样回退。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        steps: {
          type: 'array',
          description: '步骤数组 [{send, expect?, description?, timeout_ms?, delay_ms?}, ...]',
          items: {
            type: 'object',
            properties: {
              send: { type: 'string', description: '要发送的命令' },
              expect: { type: 'string', description: '期望输出中包含的文本' },
              description: { type: 'string', description: '步骤描述' },
              timeout_ms: { type: 'integer', description: '超时毫秒数（默认 15000）' },
              delay_ms: { type: 'integer', description: '发送前延迟毫秒数' },
            },
          },
        },
      },
      required: ['steps'],
    },
  },
  {
    name: 'conn.analyze.probe',
    description: '探测设备类型。发送 AT 命令并分析输出，匹配合适的设备类型。支持 22 种常见设备。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'conn.watch.start',
    description: '启动模式监控。在后台持续匹配连接输出中的模式，匹配时发送通知。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '要监控的连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        rules: {
          type: 'array',
          description:
            '监控规则 [{pattern: 匹配文本, regex: 是否正则(默认true), level: "info"|"warning"|"error"(默认warning)}, ...]',
          items: { type: 'object' },
        },
        duration_ms: { type: 'integer', description: '监控持续时长（ms），默认 60000' },
      },
      required: ['rules'],
    },
  },
  {
    name: 'conn.watch.stop',
    description: '停止指定 watch 并返回累积的告警结果。',
    inputSchema: {
      type: 'object',
      properties: {
        watch_id: { type: 'string', description: 'watch ID（conn.watch.start 返回的）' },
      },
      required: ['watch_id'],
    },
  },
  {
    name: 'conn.analyze.report',
    description: '生成会话摘要报告。统计发送命令数、收发字节数、时长等。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'app.macro.list',
    description: '列出所有已保存的终端宏。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'app.macro.run',
    description: '执行指定名称的宏。在指定连接上依次发送宏的每一步。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '目标连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        name: { type: 'string', description: '宏名称（必需）' },
      },
      required: ['name'],
    },
  },
  {
    name: 'conn.watch.results',
    description: '获取 watch 的累积结果。可通过 watch_id 指定，也可无参获取所有 watch 结果。',
    inputSchema: {
      type: 'object',
      properties: {
        watch_id: { type: 'string', description: 'watch ID（可选，不传则返回所有 watch 结果）' },
      },
    },
  },
  {
    name: 'conn.record.start',
    description: '开始记录连接的所有输出数据帧。用于后续回放分析。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '要记录的连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'conn.record.stop',
    description: '停止记录并返回数据帧统计信息。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'conn.record.list',
    description: '列出所有活跃的记录会话。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'conn.record.replay',
    description: '回放记录的数据帧。返回合并后的文本输出（去除部分 ANSI 转义序列）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '连接 ID' },
        connectionId: { type: 'string', description: '连接 ID（id 的别名）' },
        speed: { type: 'number', description: '回放速度倍数（默认 1）' },
      },
    },
  },
  {
    name: 'sftp.connect',
    description: '通过已有的 SSH 连接打开 SFTP 会话。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'SSH 连接 ID' },
        connectionId: { type: 'string', description: 'SSH 连接 ID（id 的别名）' },
      },
    },
  },
  {
    name: 'sftp.disconnect',
    description: '关闭 SFTP 会话。',
    inputSchema: {
      type: 'object',
      properties: { sftp_id: { type: 'string', description: 'SFTP 会话 ID' } },
      required: ['sftp_id'],
    },
  },
  {
    name: 'sftp.list',
    description: '列出远程目录内容。',
    inputSchema: {
      type: 'object',
      properties: {
        sftp_id: { type: 'string', description: 'SFTP 会话 ID' },
        path: { type: 'string', description: '远程目录路径（默认 "/"）' },
      },
      required: ['sftp_id'],
    },
  },
  {
    name: 'sftp.download',
    description: '通过 SFTP 下载文件到本地。',
    inputSchema: {
      type: 'object',
      properties: {
        sftp_id: { type: 'string', description: 'SFTP 会话 ID' },
        remote_path: { type: 'string', description: '远程文件路径' },
        local_path: { type: 'string', description: '本地保存路径' },
      },
      required: ['sftp_id', 'remote_path', 'local_path'],
    },
  },
  {
    name: 'sftp.upload',
    description: '通过 SFTP 上传本地文件到远程。',
    inputSchema: {
      type: 'object',
      properties: {
        sftp_id: { type: 'string', description: 'SFTP 会话 ID' },
        local_path: { type: 'string', description: '本地文件路径' },
        remote_path: { type: 'string', description: '远程保存路径' },
      },
      required: ['sftp_id', 'local_path', 'remote_path'],
    },
  },
  {
    name: 'sftp.mkdir',
    description: '通过 SFTP 在远程创建目录。',
    inputSchema: {
      type: 'object',
      properties: {
        sftp_id: { type: 'string', description: 'SFTP 会话 ID' },
        path: { type: 'string', description: '远程目录路径' },
      },
      required: ['sftp_id', 'path'],
    },
  },
  {
    name: 'sftp.stat',
    description: '通过 SFTP 获取远程文件元数据（大小、权限、修改时间等）。',
    inputSchema: {
      type: 'object',
      properties: {
        sftp_id: { type: 'string', description: 'SFTP 会话 ID' },
        path: { type: 'string', description: '远程文件路径' },
      },
      required: ['sftp_id', 'path'],
    },
  },
  {
    name: 'sftp.rm',
    description: '通过 SFTP 删除远程文件。',
    inputSchema: {
      type: 'object',
      properties: {
        sftp_id: { type: 'string', description: 'SFTP 会话 ID' },
        path: { type: 'string', description: '远程文件路径' },
      },
      required: ['sftp_id', 'path'],
    },
  },
  {
    name: 'app.record.start',
    description:
      'Start screen recording of the application window. Captures frames at specified FPS and encodes to MP4 on stop.',
    inputSchema: {
      type: 'object',
      properties: {
        fps: { type: 'integer', description: 'Frame rate (1-30, default 10)' },
      },
    },
  },
  {
    name: 'app.record.stop',
    description:
      'Stop screen recording and encode to MP4. Returns file path, size, duration, and frame count.',
    inputSchema: {
      type: 'object',
      properties: {
        recording_id: {
          type: 'string',
          description: 'Recording ID from app.record.start (required)',
        },
        output: {
          type: 'string',
          description: 'Output file path (default: docs/recording-<timestamp>.mp4)',
        },
      },
      required: ['recording_id'],
    },
  },
  {
    name: 'app.record.list',
    description: 'List all active screen recordings.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ==================== Handler 注册表 ====================

const allHandlers: Record<
  string,
  (args: Record<string, unknown>, toolCtx: ToolContext) => Promise<string>
> = {
  ...deviceHandlers,
  ...sessionHandlers,
  ...connectionHandlers,
  ...connIOHandlers,
  ...connAdvancedHandlers,
  ...sftpHandlers,
  ...appHandlers,
  ...buttonsHandlers,
};

// ==================== 工具执行 ====================

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const handler = allHandlers[name];
  if (handler) {
    try {
      return await handler(args, toolContext);
    } catch (err) {
      return `错误: ${(err as Error).message}`;
    }
  }

  // 插件注册的 MCP 工具：同样经过外层 HTTP 鉴权（checkAuth），无后门
  const pluginHandler = getMcpToolHandler(name);
  if (pluginHandler) {
    try {
      const result = await pluginHandler(args);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (err) {
      return `错误: ${(err as Error).message}`;
    }
  }

  return `错误: 未知工具 "${name}"`;
}

// ==================== 窗口引用 ====================

export function setMcpMainWindow(window: BrowserWindow | null): void {
  ctx.setMainWindowRef(window);
  setResourcesWindow(window);
}

// ==================== 认证检查 ====================

function checkAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (!ctx.mcpAuthPassword) return true;

  const authHeader = req.headers.authorization;
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader || '';

  const qs = (req.url || '').includes('?') ? (req.url || '').split('?')[1] : '';
  const queryToken = new URLSearchParams(qs).get('token') || '';

  const token = headerToken || queryToken;

  if (!token) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer realm="QSerial MCP"',
    });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32001, message: '未授权：需要 Bearer token 认证' },
      })
    );
    return false;
  }
  if (token !== ctx.mcpAuthPassword) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32002, message: '认证失败：token 不匹配' } })
    );
    return false;
  }
  return true;
}

// ==================== RPC 响应通道 ====================
// HTTP (streamable) 把响应写在 POST 响应体里;
// SSE 把响应以 message 事件推送到长连接流,POST 只返回 202 确认(符合 MCP SSE 传输规范)。

interface RpcChannel {
  /** 发送 JSON-RPC 响应/错误消息 */
  send(payload: Record<string, unknown>): void;
  /** 确认通知:HTTP 返回 202 空响应体 */
  ack(): void;
  /** 请求体解析失败:HTTP 返回 400,SSE 推送 parse error 到流 */
  parseError(): void;
}

function createHttpChannel(res: http.ServerResponse): RpcChannel {
  return {
    send(payload) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    },
    ack() {
      res.writeHead(202);
      res.end();
    },
    parseError() {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }));
    },
  };
}

interface SseSession {
  id: string;
  res: http.ServerResponse;
}

/** sessionId -> SSE 长连接,用于把 JSON-RPC 响应路由回对应客户端 */
const sseSessions = new Map<string, SseSession>();

function writeSseEvent(res: http.ServerResponse, payload: Record<string, unknown>): void {
  if (res.writableEnded || res.destroyed) return;
  res.write('event: message\ndata: ' + JSON.stringify(payload) + '\n\n');
}

function createSseChannel(session: SseSession, postRes: http.ServerResponse): RpcChannel {
  return {
    send(payload) {
      writeSseEvent(session.res, payload);
      postRes.writeHead(202);
      postRes.end();
    },
    ack() {
      postRes.writeHead(202);
      postRes.end();
    },
    parseError() {
      writeSseEvent(session.res, {
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' },
      });
      postRes.writeHead(202);
      postRes.end();
    },
  };
}

// ==================== JSON-RPC handler builder ====================

function createRpcHandler(): (channel: RpcChannel, body: string) => Promise<void> {
  return async (channel, body) => {
    try {
      const rpcData = JSON.parse(body);
      const { id: reqId, method, params } = rpcData;

      if (method === 'initialize') {
        channel.send({
          jsonrpc: '2.0',
          id: reqId,
          result: {
            protocolVersion: '2025-03-26',
            capabilities: { tools: {}, resources: {}, sampling: {}, prompts: {} },
            serverInfo: { name: 'qserial-mcp', version: '0.1.0' },
          },
        });
        return;
      }
      if (method === 'notifications/initialized') {
        channel.ack();
        return;
      }
      if (method === 'tools/list') {
        channel.send({
          jsonrpc: '2.0',
          id: reqId,
          result: { tools: [...MCP_TOOLS, ...getMcpToolDefinitions()] },
        });
        return;
      }
      if (method === 'tools/call') {
        try {
          const text = await executeTool(params.name, params.arguments || {});
          const sDrain = drainSampling();
          const resp: Record<string, unknown> = {
            jsonrpc: '2.0',
            id: reqId,
            result: { content: [{ type: 'text', text }], isError: false },
          };
          if (sDrain) resp.sampling = sDrain;
          channel.send(resp);
        } catch (e) {
          const error = e as Error;
          channel.send({
            jsonrpc: '2.0',
            id: reqId,
            error: { code: -32603, message: error.message },
          });
        }
        return;
      }
      if (method === 'resources/list') {
        channel.send({
          jsonrpc: '2.0',
          id: reqId,
          result: { resources: [...MCP_RESOURCES, ...getPluginResources()] },
        });
        return;
      }
      if (method === 'resources/read') {
        try {
          const rUri = (params as { uri: string }).uri;
          if (!rUri) {
            channel.send({
              jsonrpc: '2.0',
              id: reqId,
              error: { code: -32602, message: 'Missing uri' },
            });
            return;
          }
          let result = await readResource(rUri);
          if (!result) {
            const pluginRes = readPluginResource(rUri);
            if (pluginRes) {
              result = {
                contents: [{ uri: rUri, mimeType: pluginRes.mimeType, text: pluginRes.text }],
              };
            }
          }
          if (!result) {
            channel.send({
              jsonrpc: '2.0',
              id: reqId,
              error: { code: -32002, message: 'Resource not found: ' + rUri },
            });
            return;
          }
          channel.send({ jsonrpc: '2.0', id: reqId, result });
        } catch (e) {
          const err = e as Error;
          channel.send({
            jsonrpc: '2.0',
            id: reqId,
            error: { code: -32603, message: err.message },
          });
        }
        return;
      }
      if (method === 'sampling/response') {
        const sr = params as Record<string, string>;
        if (sr.samplingId && sr.choice) resolveSampling(sr.samplingId, sr.choice);
        channel.send({ jsonrpc: '2.0', id: reqId, result: { acknowledged: true } });
        return;
      }
      if (method === 'prompts/list') {
        channel.send({
          jsonrpc: '2.0',
          id: reqId,
          result: { prompts: [...MCP_PROMPTS, ...getPluginPrompts()] },
        });
        return;
      }
      if (method === 'prompts/get') {
        const { name, arguments: promptArgs } = params as {
          name: string;
          arguments?: Record<string, string>;
        };
        let result = getPrompt(name, promptArgs || {});
        if (!result) {
          const pluginContent = getPluginPrompt(name);
          if (pluginContent) {
            result = {
              messages: [{ role: 'user', content: { type: 'text', text: pluginContent } }],
            };
          }
        }
        if (!result) {
          channel.send({
            jsonrpc: '2.0',
            id: reqId,
            error: { code: -32002, message: 'Prompt not found: ' + name },
          });
          return;
        }
        channel.send({ jsonrpc: '2.0', id: reqId, result });
        return;
      }
      if (method === 'ping') {
        channel.send({ jsonrpc: '2.0', id: reqId, result: {} });
        return;
      }
      channel.send({
        jsonrpc: '2.0',
        id: reqId,
        error: { code: -32601, message: 'unknown method: ' + method },
      });
    } catch {
      channel.parseError();
    }
  };
}

// ==================== 公共接口 ====================

export async function startMcpServer(
  port: number,
  listenAddress?: string,
  authPassword?: string,
  corsOrigins?: string[]
): Promise<void> {
  if (mcpRunning) {
    await stopMcpServer();
  }

  ctx.setAuthPassword(authPassword || '');
  ctx.setCorsOrigins(corsOrigins || []);
  mcpListenAddress = listenAddress || '127.0.0.1';

  if (
    !ctx.mcpAuthPassword &&
    mcpListenAddress !== '127.0.0.1' &&
    mcpListenAddress !== 'localhost'
  ) {
    const pwd = crypto.randomBytes(16).toString('hex');
    ctx.setAuthPassword(pwd);
    console.log('[MCP] Auto-generated password:', pwd);
    console.log('[MCP] Use: Authorization: Bearer ' + pwd);
  }

  if (removeConnectionDestroyHook) removeConnectionDestroyHook();
  removeConnectionDestroyHook = ConnectionFactory.onDestroy((conn) => ctx.removeBuffer(conn.id));
  loadPlugins();

  const handleRpc = createRpcHandler();

  const httpServer = http.createServer(async (req, res) => {
    const corsOrigin =
      ctx.mcpCorsOrigins.length > 0
        ? ctx.mcpCorsOrigins.includes(req.headers.origin || '')
          ? req.headers.origin || ''
          : ctx.mcpCorsOrigins[0]
        : '*';
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlPath = (req.url || '/').split('?')[0];

    // SSE 握手端点:返回 endpoint 事件并保持长连接,
    // 后续 /messages 的 JSON-RPC 响应都经这条流以 message 事件推送
    if (req.method === 'GET' && urlPath === '/sse') {
      if (!checkAuth(req, res)) return;
      const sessionId = crypto.randomUUID();
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);
      const session: SseSession = { id: sessionId, res };
      sseSessions.set(sessionId, session);
      sseClients.add(res);
      req.on('close', () => {
        sseSessions.delete(sessionId);
        sseClients.delete(res);
      });
      return;
    }

    // SSE 消息端点:POST 携带 JSON-RPC 请求,响应经 SSE 流返回,POST 本身只确认 202
    if (req.method === 'POST' && urlPath === '/messages') {
      const sessionId =
        new URLSearchParams((req.url || '').split('?')[1] || '').get('sessionId') || '';
      const session = sseSessions.get(sessionId);
      if (!session) {
        // 无会话时回退到独立请求鉴权(兼容直接调用 /messages 的客户端)
        if (ctx.mcpAuthPassword && !checkAuth(req, res)) return;
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32004, message: 'SSE session not found' },
          })
        );
        return;
      }
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => handleRpc(createSseChannel(session, res), body));
      return;
    }

    // streamableHttp endpoint
    if (req.method === 'POST' && (urlPath === '/mcp' || urlPath === '/')) {
      if (ctx.mcpAuthPassword && !checkAuth(req, res)) return;
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => handleRpc(createHttpChannel(res), body));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    console.error('[MCP] Server error:', err.message);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, mcpListenAddress, () => {
      mcpRunning = true;
      // port 为 0 时由系统分配实际端口,需要回读真实端口
      mcpPort = (httpServer.address() as { port: number } | null)?.port ?? port;
      mcpServer = httpServer;
      sendStatus();
      resolve();
    });
    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      console.error('[MCP] Server listen error:', err.message);
      reject(
        new Error(
          err.code === 'EADDRINUSE'
            ? 'Port ' + port + ' in use'
            : 'MCP start failed: ' + err.message
        )
      );
    });
  });
}

export async function stopMcpServer(): Promise<void> {
  if (removeConnectionDestroyHook) {
    removeConnectionDestroyHook();
    removeConnectionDestroyHook = null;
  }

  // 先关闭所有 SSE 长连接,否则 server.close() 会一直等待活跃连接
  for (const session of sseSessions.values()) {
    try {
      session.res.end();
    } catch {
      /* ignore */
    }
  }
  sseSessions.clear();
  sseClients.clear();

  const server = mcpServer;
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    mcpServer = null;
  }

  for (const rec of ctx.recordings.values()) {
    try {
      rec.unsub();
    } catch {
      /* ignore */
    }
  }
  ctx.recordings.clear();
  for (const unsub of ctx.bufferSubscriptions.values()) {
    unsub();
  }
  ctx.bufferSubscriptions.clear();
  ctx.buffers.clear();

  mcpRunning = false;
  sendStatus();
}

export function getMcpStatus(): McpServerStatus {
  return {
    running: mcpRunning,
    port: mcpPort,
    listenAddress: mcpListenAddress,
    needsAuth: !!ctx.mcpAuthPassword,
    token: ctx.mcpAuthPassword || undefined,
    connections: ConnectionFactory.getAll().map((c) => ({
      id: c.id,
      type: c.type,
      name: (c.options as { name?: string }).name || '',
      state: c.state,
    })),
  };
}

function sendStatus(): void {
  if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
    ctx.mainWindow.webContents.send(IPC_CHANNELS.MCP_STATUS_EVENT, {
      running: mcpRunning,
      port: mcpPort,
    });
  }
}

export async function destroyMcpManager(): Promise<void> {
  await stopMcpServer();
}
