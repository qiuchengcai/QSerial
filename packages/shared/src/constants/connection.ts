/**
 * 连接相关常量
 */

/**
 * 支持的波特率列表
 */
export const BAUD_RATES = [
  300, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
] as const;

/**
 * 数据位选项
 */
export const DATA_BITS = [5, 6, 7, 8] as const;

/**
 * 停止位选项
 */
export const STOP_BITS = [1, 1.5, 2] as const;

/**
 * 校验位选项
 */
export const PARITY_OPTIONS = ['none', 'even', 'odd', 'mark', 'space'] as const;

/**
 * 流控制选项
 */
export const FLOW_CONTROL_OPTIONS = ['none', 'hardware', 'software'] as const;

/**
 * 默认 Shell
 */
export const DEFAULT_SHELLS = {
  win32: 'powershell.exe',
  darwin: '/bin/zsh',
  linux: '/bin/bash',
} as const;

/**
 * 连接类型显示名称
 */
export const CONNECTION_TYPE_NAMES = {
  pty: '本地终端',
  serial: '串口',
  ssh: 'SSH',
  telnet: 'Telnet',
} as const;

/**
 * 连接状态显示名称
 */
export const CONNECTION_STATE_NAMES = {
  disconnected: '已断开',
  connecting: '连接中',
  connected: '已连接',
  reconnecting: '重连中',
  error: '错误',
} as const;
