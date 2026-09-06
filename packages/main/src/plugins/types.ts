/**
 * 插件运行时类型（主进程侧，含宿主 API 函数签名）
 */

import type { PluginManifest, PluginStatus } from '@qserial/shared';
import type {
  DeviceProfile,
  McpToolDefinition,
  PluginToolHandler,
  QuickButtonContribution,
  UiContribution,
  OutputFilter,
} from './registry.js';

/**
 * 宿主暴露给插件的受限 API 上下文（ctx）。
 * 每个域仅在插件声明了对应权限时才可用，否则调用会抛出 PluginPermissionError。
 */
export interface PluginActivationContext {
  id: string;
  name: string;
  version: string;

  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };

  /** 插件自身命名空间配置（隔离存储，需 `config` 权限） */
  config: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
    getAll(): Record<string, unknown>;
    onChange(callback: (change: { key: string; value: unknown }) => void): () => void;
  };

  /** 连接域 API（需 `connection:read` / `connection:write` 权限） */
  connection: {
    list(): Array<{ id: string; type: string; name: string; state: string }>;
    state(id: string): string | undefined;
    send(id: string, data: string): void;
    onData(id: string, callback: (data: string) => void): () => void;
    onStateChange(id: string, callback: (state: string) => void): () => void;
  };

  /** 终端域 API（需 `terminal:write` 权限） */
  terminal: {
    registerOutputFilter(filter: OutputFilter): void;
    registerQuickButtons(buttons: QuickButtonContribution[]): void;
    registerCommand(name: string, handler: (args: unknown[]) => void | Promise<void>): void;
  };

  /** MCP 域 API（需 `mcp:register` 权限） */
  mcp: {
    registerTool(definition: McpToolDefinition, handler: PluginToolHandler): void;
  };

  /** 设备识别域 API（需 `device:register` 权限） */
  device: {
    registerProfiles(profiles: DeviceProfile[]): void;
  };

  /** UI 域 API（需 `ui` 权限） */
  ui: {
    contribute(entries: UiContribution[]): void;
  };
}

/**
 * 插件入口模块导出契约。
 */
export interface PluginModule {
  activate?: (ctx: PluginActivationContext) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

/**
 * 插件运行时状态（PluginManager 内部维护）。
 */
export interface PluginRuntime {
  id: string;
  manifest: PluginManifest;
  dir: string;
  entryPath?: string;
  enabled: boolean;
  status: PluginStatus;
  error?: string;
  module?: PluginModule;
  /** 入口模块导入版本（重载时递增，用于 import() 缓存失效） */
  importVersion?: number;
  /** 变更检测签名（manifest 字段 + 入口 mtime），不一致则重载 */
  signature?: string;
}

/**
 * PluginManager 可注入依赖（便于单元测试脱离 electron / 真实文件系统）。
 */
export interface PluginManagerOptions {
  /** 插件搜索目录列表 */
  searchPaths?: () => string[];
  /** 用户插件目录（安装目标 / 卸载删除范围判定） */
  userPluginsDir?: () => string;
  /** 读取持久化的启用状态 */
  getEnabledState?: (id: string) => boolean | undefined;
  /** 持久化启用状态 */
  setEnabledState?: (id: string, enabled: boolean) => void;
  /** 清除持久化的启用状态（卸载时调用） */
  clearEnabledState?: (id: string) => void;
  /** 是否启用热加载目录监听（可配置关闭） */
  hotReload?: () => boolean;
}
