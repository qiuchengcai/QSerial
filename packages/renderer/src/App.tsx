/**
 * 根组件
 */

import React from 'react';
import { Layout } from './components/layout/Layout';
import { useConfigStore } from './stores/config';
import { useThemeStore } from './stores/theme';
import { initNfsListeners } from './stores/nfs';
import { initFtpListeners } from './stores/ftp';
import { initMcpListeners } from './stores/mcp';

export const App: React.FC = () => {
  const { initialize: initConfig, config } = useConfigStore();
  const { currentTheme } = useThemeStore();

  React.useEffect(() => {
    initConfig();
    initNfsListeners();
    initFtpListeners();
    initMcpListeners();
  }, [initConfig]);

  // 应用主题到 CSS 变量
  React.useEffect(() => {
    const root = document.documentElement;
    const { colors, fonts, texture } = currentTheme.ui;

    // 颜色变量
    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-secondary', colors.secondary);
    root.style.setProperty('--color-accent', colors.accent);
    root.style.setProperty('--color-background', colors.background);
    root.style.setProperty('--color-surface', colors.surface);
    root.style.setProperty('--color-text', colors.text);
    root.style.setProperty('--color-text-secondary', colors.textSecondary);
    root.style.setProperty('--color-border', colors.border);
    root.style.setProperty('--color-hover', colors.hover);
    root.style.setProperty('--color-active', colors.active);
    root.style.setProperty('--color-error', colors.error);
    root.style.setProperty('--color-warning', colors.warning);
    root.style.setProperty('--color-success', colors.success);

    // 字体变量
    root.style.setProperty('--font-sans', config.app.uiFontFamily || fonts.sans);
    root.style.setProperty('--font-mono', fonts.mono);

    // 直接设置 body 字体，确保覆盖 Tailwind 编译后的值
    document.body.style.fontFamily = config.terminal.fontFamily || fonts.sans;

    // 纹理变量
    root.style.setProperty('--texture-background', texture || 'none');
  }, [currentTheme, config.terminal.fontFamily]);

  return <Layout />;
};
