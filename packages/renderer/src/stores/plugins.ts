/**
 * 插件状态管理
 * 与主进程 PluginManager 同步：列表查询、启用/禁用、安装/卸载、重扫、变更监听。
 */

import { create } from 'zustand';
import type { PluginInfo } from '@qserial/shared';

type BusyAction = 'install' | 'rescan' | null;

interface PluginsState {
  plugins: PluginInfo[];
  isLoading: boolean;
  /** 全局操作（安装/刷新）loading 态 */
  busy: BusyAction;
  /** 正在 toggle / 卸载的插件 id（loading 态 + 防重复点击） */
  pendingId: string | null;
  /** 最近一次操作错误（展示给用户） */
  error: string | null;
  /** 当前查看详情的插件 id */
  selectedPluginId: string | null;
  /** 各插件已持久化配置缓存（按 id 索引） */
  pluginConfigs: Record<string, Record<string, unknown>>;

  load: () => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  install: (sourcePath: string) => Promise<void>;
  uninstall: (id: string) => Promise<void>;
  rescan: () => Promise<void>;
  reload: (id: string) => Promise<void>;
  clearError: () => void;
  selectPlugin: (id: string) => void;
  closePlugin: () => void;
  loadPluginConfig: (id: string) => Promise<Record<string, unknown>>;
  setPluginConfig: (id: string, key: string, value: unknown) => Promise<void>;
}

export const usePluginsStore = create<PluginsState>()((set) => ({
  plugins: [],
  isLoading: false,
  busy: null,
  pendingId: null,
  error: null,
  selectedPluginId: null,
  pluginConfigs: {},

  load: async () => {
    set({ isLoading: true });
    try {
      const plugins = await window.qserial.plugin.list();
      set({ plugins, isLoading: false });
    } catch (error) {
      console.error('Failed to load plugins:', error);
      set({ isLoading: false });
    }
  },

  setEnabled: async (id, enabled) => {
    set({ pendingId: id, error: null });
    try {
      const plugins = await window.qserial.plugin.setEnabled(id, enabled);
      set({ plugins, pendingId: null });
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
      set({ pendingId: null, error: error instanceof Error ? error.message : String(error) });
    }
  },

  install: async (sourcePath) => {
    set({ busy: 'install', error: null });
    try {
      const plugins = await window.qserial.plugin.install(sourcePath);
      set({ plugins, busy: null });
    } catch (error) {
      console.error('Failed to install plugin:', error);
      set({ busy: null, error: error instanceof Error ? error.message : String(error) });
    }
  },

  uninstall: async (id) => {
    set({ pendingId: id, error: null });
    try {
      const plugins = await window.qserial.plugin.uninstall(id, true);
      set({ plugins, pendingId: null });
    } catch (error) {
      console.error('Failed to uninstall plugin:', error);
      set({ pendingId: null, error: error instanceof Error ? error.message : String(error) });
    }
  },

  rescan: async () => {
    set({ busy: 'rescan', error: null });
    try {
      const plugins = await window.qserial.plugin.rescan();
      set({ plugins, busy: null });
    } catch (error) {
      console.error('Failed to rescan plugins:', error);
      set({ busy: null, error: error instanceof Error ? error.message : String(error) });
    }
  },

  reload: async (id) => {
    set({ pendingId: id, error: null });
    try {
      const plugins = await window.qserial.plugin.reload(id);
      set({ plugins, pendingId: null });
    } catch (error) {
      console.error('Failed to reload plugin:', error);
      set({ pendingId: null, error: error instanceof Error ? error.message : String(error) });
    }
  },

  clearError: () => set({ error: null }),

  selectPlugin: (id) => set({ selectedPluginId: id }),

  closePlugin: () => set({ selectedPluginId: null }),

  loadPluginConfig: async (id) => {
    const config = await window.qserial.plugin.configGet(id);
    set((s) => ({ pluginConfigs: { ...s.pluginConfigs, [id]: config } }));
    return config;
  },

  setPluginConfig: async (id, key, value) => {
    await window.qserial.plugin.configSet(id, key, value);
    set((s) => ({
      pluginConfigs: {
        ...s.pluginConfigs,
        [id]: { ...(s.pluginConfigs[id] || {}), [key]: value },
      },
    }));
  },
}));

let pluginBridgeInitialized = false;

/**
 * 初始化"主进程 → 插件 store"变更桥（App 启动时调用一次）。
 * 主进程在插件集合变化后推送 PLUGINS_CHANGED，这里实时刷新列表。
 */
export function initPluginBridge(): void {
  if (pluginBridgeInitialized) return;
  pluginBridgeInitialized = true;

  window.qserial.plugin.onChanged((plugins) => {
    if (Array.isArray(plugins)) {
      usePluginsStore.setState({ plugins });
    }
  });

  window.qserial.plugin.onConfigChanged(({ id, config }) => {
    usePluginsStore.setState((s) => ({
      pluginConfigs: { ...s.pluginConfigs, [id]: config },
    }));
  });
}
