/**
 * 宿主 API 构建器
 * 根据插件清单 permissions 声明，构建受限的 PluginActivationContext。
 * 未声明的能力域调用时抛出 PluginPermissionError（见 permissions.ts）。
 *
 * 安全约定：
 * - 插件代码运行在主进程，但不直接接触 Node 原生模块；所有 I/O 走本模块暴露的受限 API。
 * - 不通过 eval / new Function 执行插件代码（由 manager.ts 使用 import() 加载）。
 */

import { ConnectionState } from '@qserial/shared';
import type { PluginManifest } from '@qserial/shared';
import { ConfigManager } from '../config/manager.js';
import { ConnectionFactory } from '../services/connection/factory.js';
import { assertPermission } from './permissions.js';
import * as registry from './registry.js';
import type { PluginActivationContext } from './types.js';

/** 插件自身命名空间配置的前缀 */
const NAMESPACE_PREFIX = 'plugins.namespace';

/** 插件配置变更订阅：pluginId → 回调集合 */
const configSubscriptions = new Map<
  string,
  Set<(change: { key: string; value: unknown }) => void>
>();
let globalConfigListenerRegistered = false;

/** 全局 ConfigManager.onChange 监听器：把命名空间内变更分发给对应插件 */
function ensureGlobalConfigListener(): void {
  if (globalConfigListenerRegistered) return;
  globalConfigListenerRegistered = true;
  ConfigManager.onChange((key, value) => {
    const prefix = `${NAMESPACE_PREFIX}.`;
    if (!key.startsWith(prefix)) return;
    const rest = key.slice(prefix.length);
    const dot = rest.indexOf('.');
    if (dot < 0) return;
    const pluginId = rest.slice(0, dot);
    const fieldKey = rest.slice(dot + 1);
    const subs = configSubscriptions.get(pluginId);
    if (!subs) return;
    for (const cb of subs) {
      try {
        cb({ key: fieldKey, value });
      } catch {
        /* ignore */
      }
    }
  });
}

/** 清除指定插件的配置订阅（插件停用时调用） */
export function removePluginConfigSubscriptions(pluginId: string): void {
  configSubscriptions.delete(pluginId);
}

export function buildPluginContext(manifest: PluginManifest): PluginActivationContext {
  const perms = manifest.permissions || [];
  const id = manifest.id;

  return {
    id,
    name: manifest.name,
    version: manifest.version,

    log: {
      info: (message) => console.log(`[Plugin:${id}] ${message}`),
      warn: (message) => console.warn(`[Plugin:${id}] ${message}`),
      error: (message) => console.error(`[Plugin:${id}] ${message}`),
    },

    config: {
      get: (key) => {
        assertPermission(perms, 'config');
        return ConfigManager.get(`${NAMESPACE_PREFIX}.${id}.${key}`);
      },
      set: (key, value) => {
        assertPermission(perms, 'config');
        ConfigManager.set(`${NAMESPACE_PREFIX}.${id}.${key}`, value);
      },
      delete: (key) => {
        assertPermission(perms, 'config');
        ConfigManager.delete(`${NAMESPACE_PREFIX}.${id}.${key}`);
      },
      getAll: () => {
        assertPermission(perms, 'config');
        return (ConfigManager.get(`${NAMESPACE_PREFIX}.${id}`) as Record<string, unknown>) || {};
      },
      onChange: (callback) => {
        assertPermission(perms, 'config');
        ensureGlobalConfigListener();
        let subs = configSubscriptions.get(id);
        if (!subs) {
          subs = new Set();
          configSubscriptions.set(id, subs);
        }
        subs.add(callback);
        return () => {
          subs.delete(callback);
        };
      },
    },

    connection: {
      list: () => {
        assertPermission(perms, 'connection:read');
        return ConnectionFactory.getAll().map((c) => ({
          id: c.id,
          type: String(c.type),
          name: (c.options as { name?: string }).name || '',
          state: c.state,
        }));
      },
      state: (cid) => {
        assertPermission(perms, 'connection:read');
        return ConnectionFactory.get(cid)?.state;
      },
      send: (cid, data) => {
        assertPermission(perms, 'connection:write');
        const conn = ConnectionFactory.get(cid);
        if (!conn) throw new Error(`Connection ${cid} not found`);
        if (conn.state !== ConnectionState.CONNECTED) {
          throw new Error(`Connection ${cid} is not connected`);
        }
        conn.write(data);
      },
      onData: (cid, callback) => {
        assertPermission(perms, 'connection:read');
        const conn = ConnectionFactory.get(cid);
        if (!conn) throw new Error(`Connection ${cid} not found`);
        return conn.onData((data: Buffer) => callback(data.toString('utf-8')));
      },
      onStateChange: (cid, callback) => {
        assertPermission(perms, 'connection:read');
        const conn = ConnectionFactory.get(cid);
        if (!conn) throw new Error(`Connection ${cid} not found`);
        return conn.onStateChange((state) => callback(state));
      },
    },

    terminal: {
      registerOutputFilter: (filter) => {
        assertPermission(perms, 'terminal:write');
        registry.addOutputFilter(id, filter);
      },
      registerQuickButtons: (buttons) => {
        assertPermission(perms, 'terminal:write');
        registry.addQuickButtons(id, buttons);
      },
      registerCommand: (name, handler) => {
        assertPermission(perms, 'terminal:write');
        registry.addTerminalCommand(id, name, handler);
      },
    },

    mcp: {
      registerTool: (definition, handler) => {
        assertPermission(perms, 'mcp:register');
        registry.addMcpTool(id, definition, handler);
      },
    },

    device: {
      registerProfiles: (profiles) => {
        assertPermission(perms, 'device:register');
        registry.addDeviceProfiles(id, profiles);
      },
    },

    ipc: {
      register: (method, handler) => {
        assertPermission(perms, 'ipc');
        registry.registerIpcHandler(id, method, handler);
      },
      emit: (event, payload) => {
        assertPermission(perms, 'ipc');
        registry.emitPluginEvent({ pluginId: id, event, payload });
      },
    },

    ui: {
      contribute: (entries) => {
        assertPermission(perms, 'ui');
        registry.addUiEntries(id, entries);
      },
    },
  };
}
