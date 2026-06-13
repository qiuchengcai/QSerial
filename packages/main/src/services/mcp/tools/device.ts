/**
 * 设备相关 MCP 工具处理函数
 */

import { SerialConnection } from '../../connection/serial.js';
import type { ToolHandler } from '../types';

export const deviceHandlers: Record<string, ToolHandler> = {
  'device.ports': async (_args) => {
    const ports = await SerialConnection.listPorts();
    return JSON.stringify(ports, null, 2);
  },
};
