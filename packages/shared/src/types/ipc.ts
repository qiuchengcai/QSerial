/**
 * IPC 类型定义
 */

import type { ConnectionOptions, SerialPortInfo } from './connection.js';

/**
 * IPC 通道名称
 */
export const IPC_CHANNELS = {
  // 连接管理
  CONNECTION_CREATE: 'connection:create',
  CONNECTION_OPEN: 'connection:open',
  CONNECTION_CLOSE: 'connection:close',
  CONNECTION_DESTROY: 'connection:destroy',
  CONNECTION_WRITE: 'connection:write',
  CONNECTION_RESIZE: 'connection:resize',
  CONNECTION_DATA: 'connection:data',
  CONNECTION_STATE: 'connection:state',
  CONNECTION_ERROR: 'connection:error',
  CONNECTION_GET_STATE: 'connection:get-state',

  // 串口特有
  SERIAL_LIST: 'serial:list',

  // 配置管理
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_DELETE: 'config:delete',
  CONFIG_GET_ALL: 'config:getAll',

  // 会话管理
  SESSION_SAVE: 'session:save',
  SESSION_LOAD: 'session:load',
  SESSION_LIST: 'session:list',
  SESSION_DELETE: 'session:delete',

  // 窗口管理
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_SET_TITLE: 'window:set-title',

  // 应用信息
  APP_VERSION: 'app:version',
  APP_QUIT: 'app:quit',
} as const;

/**
 * IPC 请求参数映射
 */
export interface IpcRequestMap {
  [IPC_CHANNELS.CONNECTION_CREATE]: { options: ConnectionOptions };
  [IPC_CHANNELS.CONNECTION_OPEN]: { id: string };
  [IPC_CHANNELS.CONNECTION_CLOSE]: { id: string };
  [IPC_CHANNELS.CONNECTION_DESTROY]: { id: string };
  [IPC_CHANNELS.CONNECTION_WRITE]: { id: string; data: string };
  [IPC_CHANNELS.CONNECTION_RESIZE]: { id: string; cols: number; rows: number };
  [IPC_CHANNELS.CONNECTION_GET_STATE]: { id: string };
  [IPC_CHANNELS.SERIAL_LIST]: void;
  [IPC_CHANNELS.CONFIG_GET]: { key: string };
  [IPC_CHANNELS.CONFIG_SET]: { key: string; value: unknown };
  [IPC_CHANNELS.CONFIG_DELETE]: { key: string };
  [IPC_CHANNELS.CONFIG_GET_ALL]: void;
  [IPC_CHANNELS.SESSION_LIST]: void;
  [IPC_CHANNELS.SESSION_DELETE]: { id: string };
  [IPC_CHANNELS.WINDOW_SET_TITLE]: { title: string };
}

/**
 * IPC 响应数据映射
 */
export interface IpcResponseMap {
  [IPC_CHANNELS.CONNECTION_CREATE]: { id: string };
  [IPC_CHANNELS.CONNECTION_OPEN]: void;
  [IPC_CHANNELS.CONNECTION_CLOSE]: void;
  [IPC_CHANNELS.CONNECTION_DESTROY]: void;
  [IPC_CHANNELS.CONNECTION_WRITE]: void;
  [IPC_CHANNELS.CONNECTION_RESIZE]: void;
  [IPC_CHANNELS.CONNECTION_GET_STATE]: { state: string };
  [IPC_CHANNELS.SERIAL_LIST]: SerialPortInfo[];
  [IPC_CHANNELS.CONFIG_GET]: unknown;
  [IPC_CHANNELS.CONFIG_SET]: void;
  [IPC_CHANNELS.CONFIG_DELETE]: void;
  [IPC_CHANNELS.CONFIG_GET_ALL]: Record<string, unknown>;
  [IPC_CHANNELS.SESSION_LIST]: SessionInfo[];
  [IPC_CHANNELS.SESSION_DELETE]: void;
  [IPC_CHANNELS.WINDOW_SET_TITLE]: void;
  [IPC_CHANNELS.APP_VERSION]: string;
}

/**
 * 会话信息
 */
export interface SessionInfo {
  id: string;
  name: string;
  type: string;
  options: ConnectionOptions;
  createdAt: string;
  updatedAt: string;
}

/**
 * 连接数据事件
 */
export interface ConnectionDataEvent {
  id: string;
  data: string; // base64 encoded
}

/**
 * 连接状态事件
 */
export interface ConnectionStateEvent {
  id: string;
  state: string;
}

/**
 * 连接错误事件
 */
export interface ConnectionErrorEvent {
  id: string;
  error: string;
}
