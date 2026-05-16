/**
 * 配置状态管理
 */

import { create } from 'zustand';
import type { AppConfig } from '@qserial/shared';
import { DEFAULT_CONFIG } from '@qserial/shared';

interface ConfigState {
  config: AppConfig;
  isLoading: boolean;

  initialize: () => Promise<void>;
  updateConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  resetConfig: () => void;
}

export const useConfigStore = create<ConfigState>()((set) => ({
  config: DEFAULT_CONFIG,
  isLoading: true,

  initialize: async () => {
    try {
      const config = await window.qserial.config.getAll();
      set({ config: config as AppConfig, isLoading: false });
    } catch (error) {
      console.error('Failed to load config:', error);
      set({ isLoading: false });
    }
  },

  updateConfig: (key, value) => {
    let previousValue: AppConfig[typeof key] | undefined;
    set((state) => {
      previousValue = state.config[key];
      return { config: { ...state.config, [key]: value } };
    });
    window.qserial.config.set(key as string, value).catch((err) => {
      console.error('Failed to persist config:', err);
      if (previousValue !== undefined) {
        set((state) => ({ config: { ...state.config, [key]: previousValue } }));
      }
    });
  },

  resetConfig: () => {
    set({ config: DEFAULT_CONFIG });
    // 重置各个配置项
    Object.entries(DEFAULT_CONFIG).forEach(([key, value]) => {
      window.qserial.config.set(key, value);
    });
  },
}));
