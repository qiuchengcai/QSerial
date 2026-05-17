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
import { useMcpStore } from './stores/mcp';

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
        try {
          const status = await window.qserial.mcp.getStatus();
          if (status.running) {
            // main进程已启动，renderer只同步状态，避免重复启动导致SSE断连
            const mcpStore = useMcpStore.getState();
            mcpStore.loadStatus();
          } else {
            const mcpCfg = useMcpStore.getState().config;
            window.qserial.mcp.start(mcpCfg.port, mcpCfg.listenAddress, mcpCfg.authPassword || undefined, true).catch(() => {});
          }
        } catch {
          const mcpCfg = useMcpStore.getState().config;
          window.qserial.mcp.start(mcpCfg.port, mcpCfg.listenAddress, mcpCfg.authPassword || undefined, true).catch(() => {});
        }
      }
    };
    autoStartServices();
  }, [initConfig]);

  // 应用主题到 CSS 变量
  React.useEffect(() => {
    const root = document.documentElement;
    const { colors, fonts, texture } = currentTheme.ui;

    // --- 工具函数：hex 颜色混合 ---
    const hexToRgb = (hex: string) => ({
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    });
    const rgbToHex = (r: number, g: number, b: number) =>
      '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
    const mix = (a: string, b: string, t: number) => {
      const ca = hexToRgb(a);
      const cb = hexToRgb(b);
      return rgbToHex(
        ca.r + (cb.r - ca.r) * t,
        ca.g + (cb.g - ca.g) * t,
        ca.b + (cb.b - ca.b) * t,
      );
    };

    // 衍生 dim 色默认值
    const primaryDim = colors.primaryDim || `rgba(${hexToRgb(colors.primary).r},${hexToRgb(colors.primary).g},${hexToRgb(colors.primary).b},0.12)`;
    const accentDim = colors.accentDim || `rgba(${hexToRgb(colors.accent).r},${hexToRgb(colors.accent).g},${hexToRgb(colors.accent).b},0.10)`;
    const successDim = colors.successDim || `rgba(${hexToRgb(colors.success).r},${hexToRgb(colors.success).g},${hexToRgb(colors.success).b},0.15)`;
    const surfaceRaised = colors.surfaceRaised || mix(colors.surface, colors.background, 0.6);
    const textTertiary = colors.textTertiary || mix(colors.textSecondary, colors.background, 0.35);
    const borderSubtle = colors.borderSubtle || mix(colors.border, colors.background, 0.45);

    // 颜色变量
    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-primary-dim', primaryDim);
    root.style.setProperty('--color-secondary', colors.secondary);
    root.style.setProperty('--color-accent', colors.accent);
    root.style.setProperty('--color-accent-dim', accentDim);
    root.style.setProperty('--color-background', colors.background);
    root.style.setProperty('--color-surface', colors.surface);
    root.style.setProperty('--color-surface-raised', surfaceRaised);
    root.style.setProperty('--color-text', colors.text);
    root.style.setProperty('--color-text-secondary', colors.textSecondary);
    root.style.setProperty('--color-text-tertiary', textTertiary);
    root.style.setProperty('--color-border', colors.border);
    root.style.setProperty('--color-border-subtle', borderSubtle);
    root.style.setProperty('--color-hover', colors.hover);
    root.style.setProperty('--color-active', colors.active);
    root.style.setProperty('--color-error', colors.error);
    root.style.setProperty('--color-warning', colors.warning);
    root.style.setProperty('--color-success', colors.success);
    root.style.setProperty('--color-success-dim', successDim);

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
