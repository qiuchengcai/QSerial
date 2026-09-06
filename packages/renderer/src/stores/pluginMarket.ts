/**
 * 插件市场状态管理
 * 市场插件列表 / 源管理 / 安装 / 更新 / 更新检查 / 下载进度。
 */

import { create } from 'zustand';
import type {
  MarketPluginItem,
  PluginDownloadProgress,
  PluginSource,
  PluginUpdateInfo,
} from '@qserial/shared';
import { DEFAULT_MARKET_SOURCES } from '@qserial/shared';
import { usePluginsStore } from './plugins';

const SOURCES_KEY = 'pluginMarket.sources';
const ACTIVE_SOURCE_KEY = 'pluginMarket.activeSourceId';

interface PluginMarketState {
  sources: PluginSource[];
  activeSourceId: string;
  /** 宿主版本（用于不兼容判定） */
  hostVersion: string;
  /** 市场插件列表 */
  marketPlugins: MarketPluginItem[];
  marketLoading: boolean;
  /** 错误信息（原始，供友好文案 + 展开详情展示） */
  marketError: string | null;
  /** 下载中的插件（id → 进度） */
  downloadingPlugins: Record<string, PluginDownloadProgress>;
  updates: PluginUpdateInfo[];
  checkingUpdates: boolean;

  loadSources: () => Promise<void>;
  saveSources: (sources: PluginSource[], activeId?: string) => Promise<void>;
  fetchMarket: () => Promise<void>;
  installFromMarket: (pluginId: string) => Promise<void>;
  updatePlugin: (pluginId: string) => Promise<void>;
  updateAll: () => Promise<void>;
  checkUpdates: () => Promise<void>;
  clearError: () => void;
}

function activeSourceUrl(sources: PluginSource[], activeId: string): string | undefined {
  return (sources.find((s) => s.id === activeId) || sources[0])?.url;
}

function friendlyError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const usePluginMarketStore = create<PluginMarketState>()((set, get) => ({
  sources: DEFAULT_MARKET_SOURCES,
  activeSourceId: DEFAULT_MARKET_SOURCES[0].id,
  hostVersion: '1.1.0',
  marketPlugins: [],
  marketLoading: false,
  marketError: null,
  downloadingPlugins: {},
  updates: [],
  checkingUpdates: false,

  loadSources: async () => {
    try {
      const saved = (await window.qserial.config.get(SOURCES_KEY)) as PluginSource[] | undefined;
      const sources = Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_MARKET_SOURCES;
      const activeId =
        ((await window.qserial.config.get(ACTIVE_SOURCE_KEY)) as string) || sources[0].id;
      let hostVersion = '1.1.0';
      try {
        hostVersion = await window.qserial.app.version();
      } catch {
        /* ignore */
      }
      set({
        sources,
        activeSourceId: sources.some((s) => s.id === activeId) ? activeId : sources[0].id,
        hostVersion,
      });
    } catch (e) {
      console.error('Failed to load market sources:', e);
    }
  },

  saveSources: async (sources, activeId) => {
    await window.qserial.config.set(SOURCES_KEY, sources);
    if (activeId) await window.qserial.config.set(ACTIVE_SOURCE_KEY, activeId);
    set({ sources, activeSourceId: activeId || get().activeSourceId });
  },

  fetchMarket: async () => {
    const { sources, activeSourceId } = get();
    const url = activeSourceUrl(sources, activeSourceId);
    set({ marketLoading: true, marketError: null });
    try {
      const index = await window.qserial.plugin.marketFetch(url);
      set({ marketPlugins: index.plugins || [], marketLoading: false });
    } catch (e) {
      set({ marketLoading: false, marketError: friendlyError(e) });
    }
  },

  installFromMarket: async (pluginId) => {
    const { sources, activeSourceId } = get();
    const url = activeSourceUrl(sources, activeSourceId);
    set((s) => ({
      marketError: null,
      downloadingPlugins: {
        ...s.downloadingPlugins,
        [pluginId]: { pluginId, percent: 0, transferred: 0, total: 100 },
      },
    }));
    try {
      const plugins = await window.qserial.plugin.marketInstall(pluginId, url);
      usePluginsStore.setState({ plugins });
      set((s) => {
        const next = { ...s.downloadingPlugins };
        delete next[pluginId];
        return { downloadingPlugins: next };
      });
    } catch (e) {
      set((s) => {
        const next = { ...s.downloadingPlugins };
        delete next[pluginId];
        return { downloadingPlugins: next, marketError: friendlyError(e) };
      });
    }
  },

  updatePlugin: async (pluginId) => {
    const { sources, activeSourceId } = get();
    const url = activeSourceUrl(sources, activeSourceId);
    set((s) => ({
      marketError: null,
      downloadingPlugins: {
        ...s.downloadingPlugins,
        [pluginId]: { pluginId, percent: 0, transferred: 0, total: 100 },
      },
    }));
    try {
      const plugins = await window.qserial.plugin.marketUpdate(pluginId, url);
      usePluginsStore.setState({ plugins });
      set((s) => {
        const next = { ...s.downloadingPlugins };
        delete next[pluginId];
        return { downloadingPlugins: next };
      });
      await get().checkUpdates();
    } catch (e) {
      set((s) => {
        const next = { ...s.downloadingPlugins };
        delete next[pluginId];
        return { downloadingPlugins: next, marketError: friendlyError(e) };
      });
    }
  },

  updateAll: async () => {
    for (const u of [...get().updates]) {
      await get().updatePlugin(u.id);
    }
  },

  checkUpdates: async () => {
    const { sources, activeSourceId } = get();
    const url = activeSourceUrl(sources, activeSourceId);
    set({ checkingUpdates: true });
    try {
      const updates = await window.qserial.plugin.marketCheckUpdates(url);
      set({ updates, checkingUpdates: false });
    } catch {
      set({ checkingUpdates: false, updates: [] });
    }
  },

  clearError: () => set({ marketError: null }),
}));

let marketBridgeInitialized = false;

/** 初始化下载进度桥（App 启动时调用一次）。 */
export function initMarketBridge(): void {
  if (marketBridgeInitialized) return;
  marketBridgeInitialized = true;
  window.qserial.plugin.onDownloadProgress((progress) => {
    usePluginMarketStore.setState((s) => ({
      downloadingPlugins: { ...s.downloadingPlugins, [progress.pluginId]: progress },
    }));
  });
}
