/**
 * 会话类型定义
 */

import type { ConnectionOptions, ConnectionType } from './connection.js';

/**
 * 会话配置
 */
export interface SessionConfig {
  id: string;
  name: string;
  type: ConnectionType;
  options: ConnectionOptions;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  favorite?: boolean;
  group?: string;
  tags?: string[];
}

/**
 * 会话组
 */
export interface SessionGroup {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  order: number;
}

/**
 * 会话存储结构
 */
export interface SessionStorage {
  sessions: SessionConfig[];
  groups: SessionGroup[];
  version: number;
}
