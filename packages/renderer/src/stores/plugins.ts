/**
 * 插件状态管理
 * 与主进程 PluginManager 同步：列表查询、启用/禁用、变更监听。
 */

import { create } from 'zustand';
import type { PluginInfo } from '@qserial/shared';

interface PluginsState {
  plugins: PluginInfo[];
  isLoading: boolean;

  load: () => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
}

export const usePluginsStore = create<PluginsState>()((set) => ({
  plugins: [],
  isLoading: false,

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
    try {
      const plugins = await window.qserial.plugin.setEnabled(id, enabled);
      set({ plugins });
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
    }
  },
}));

let pluginBridgeInitialized = false;

/**
 * 初始化"主进程 → 插件 store"变更桥（App 启动时调用一次）。
 * 主进程在启用/禁用插件后推送 PLUGINS_CHANGED，这里实时刷新列表。
 */
export function initPluginBridge(): void {
  if (pluginBridgeInitialized) return;
  pluginBridgeInitialized = true;

  window.qserial.plugin.onChanged((plugins) => {
    if (Array.isArray(plugins)) {
      usePluginsStore.setState({ plugins });
    }
  });
}
