/**
 * 布局组件
 */

import React, { useEffect } from 'react';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { QuickButtonBar } from '../terminal/QuickButtonBar';
import { useThemeStore } from '../../stores/theme';
import { useTftpStore } from '../../stores/tftp';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import type { TftpTransferEvent } from '@qserial/shared';

export const Layout: React.FC = () => {
  const { currentTheme } = useThemeStore();
  const hasTexture = Boolean(currentTheme.ui.texture);
  const [showSettings, setShowSettings] = React.useState(false);

  // 全局监听 TFTP 状态和传输事件
  useEffect(() => {
    const unsubStatus = window.qserial.tftp.onStatusChange((event) => {
      if (event.running) {
        useTftpStore.getState().setRunning(true);
      } else {
        useTftpStore.getState().setError(event.error);
      }
    });
    const unsubTransfer = window.qserial.tftp.onTransfer((event) => {
      useTftpStore.getState().handleTransferEvent(event as TftpTransferEvent);
    });
    return () => {
      unsubStatus();
      unsubTransfer();
    };
  }, []);

  return (
    <div className={`h-screen flex flex-col bg-background overflow-hidden ${hasTexture ? 'has-texture' : ''}`}>
      {/* 标题栏 */}
      <TitleBar />

      {/* 主内容区 */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* 侧边栏 */}
        <Sidebar />

        {/* 终端区域 */}
        <MainContent />
      </div>

      {/* 底部栏：设置 + 快捷按钮 */}
      <div className="flex items-center border-t border-border bg-surface flex-shrink-0">
        <button
          onClick={() => setShowSettings(true)}
          className="flex-shrink-0 w-[var(--sidebar-width)] h-[var(--buttonbar-height)] flex items-center gap-2 px-3 border-r border-border hover:bg-hover transition-colors text-sm"
        >
          <span>⚙️</span>
          <span>设置</span>
        </button>
        <QuickButtonBar />
      </div>

      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
};
