/**
 * 根组件
 */

import React from 'react';
import { Layout } from './components/layout/Layout';
import { useConfigStore } from './stores/config';
import { useThemeStore } from './stores/theme';
import { useTftpStore } from './stores/tftp';
import { useNfsStore } from './stores/nfs';
import { useFtpStore } from './stores/ftp';
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

    // 自启服务：autoStart = true 的服务在应用启动时自动运行
    const autoStartServices = async () => {
      const tftpCfg = useTftpStore.getState().config;
      if (tftpCfg.autoStart && tftpCfg.rootDir) {
        useTftpStore.getState().startServer().catch(() => {});
      }
      const nfsCfg = useNfsStore.getState().config;
      if (nfsCfg.autoStart && nfsCfg.exportDir) {
        useNfsStore.getState().startServer().catch(() => {});
      }
      const ftpCfg = useFtpStore.getState().config;
      if (ftpCfg.autoStart && ftpCfg.rootDir) {
        useFtpStore.getState().startServer().catch(() => {});
      }
      if (config.mcp.enabled) {
        window.qserial.mcp.start().catch(() => {});
      }
    };
    autoStartServices();
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

    // 主题切换过渡 (仅在非首次应用时添加)
    root.style.transition = 'background-color 150ms ease, color 150ms ease, border-color 150ms ease';
  }, [currentTheme, config.terminal.fontFamily]);

  return <Layout />;
};
