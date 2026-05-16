/**
 * 主题状态管理
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '@qserial/shared';
import { PRESET_THEMES, DEFAULT_DARK_THEME } from '@qserial/shared';

interface ThemeState {
  currentTheme: Theme;
  themes: Theme[];
  setTheme: (themeId: string) => void;
  addTheme: (theme: Theme) => void;
  removeTheme: (themeId: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      currentTheme: DEFAULT_DARK_THEME,
      themes: PRESET_THEMES,

      setTheme: (themeId) => {
        const { themes } = get();
        const theme = themes.find((t) => t.id === themeId);
        if (theme) {
          set({ currentTheme: theme });
        }
      },

      addTheme: (theme) => {
        set((state) => ({
          themes: [...state.themes, theme],
        }));
      },

      removeTheme: (themeId) => {
        const { currentTheme } = get();
        // 不允许删除预设主题
        if (PRESET_THEMES.some((t) => t.id === themeId)) {
          return;
        }
        set((state) => ({
          themes: state.themes.filter((t) => t.id !== themeId),
        }));
        // 如果删除的是当前主题，切换到默认主题
        if (currentTheme.id === themeId) {
          set({ currentTheme: DEFAULT_DARK_THEME });
        }
      },
    }),
    {
      name: 'qserial-theme',
      partialize: (state) => ({
        currentThemeId: state.currentTheme.id,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 根据保存的主题 ID 恢复主题
          const savedThemeId = (state as any).currentThemeId;
          if (savedThemeId) {
            const theme = state.themes.find((t) => t.id === savedThemeId);
            if (theme) {
              state.currentTheme = theme;
            }
          }
        }
      },
    }
  )
);
