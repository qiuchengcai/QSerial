/**
 * 布局组件 — 对齐设计稿：Header 合并 Tabs + 工具按钮，QuickButtonBar 在终端顶部，StatusBar 全宽
 */

import React, { useEffect } from 'react';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { StatusBar } from './StatusBar';
import { QuickButtonBar } from '../terminal/QuickButtonBar';
import { useQuickButtonsStore } from '@/stores/quickButtons';
import { useThemeStore } from '../../stores/theme';
import { useTerminalStore } from '../../stores/terminal';
import { useTftpStore } from '../../stores/tftp';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { ErrorToast, useGlobalError } from '../common/ErrorToast';
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts';
import type { TftpTransferEvent } from '@qserial/shared';

export const Layout: React.FC = () => {
  const { currentTheme } = useThemeStore();
  const hasTexture = Boolean(currentTheme.ui.texture);
  const [showSettings, setShowSettings] = React.useState(false);
  const quickButtonsState = useQuickButtonsStore();
  const isVertical = quickButtonsState?.direction === 'vertical';
  const { errorMessage, dismiss } = useGlobalError();

  const terminalState = useTerminalStore();
  const tabs = terminalState?.tabs || [];


  useGlobalShortcuts();

  useEffect(() => {
    const handler = () => setShowSettings(true);
    window.addEventListener('qserial:open-settings', handler);
    return () => window.removeEventListener('qserial:open-settings', handler);
  }, []);

  useEffect(() => {
    if (!window.qserial?.tftp) return;
    const unsubStatus = window.qserial.tftp.onStatusChange((event) => {
      if (event.running) useTftpStore.getState().setRunning(true);
      else useTftpStore.getState().setError(event.error);
    });
    const unsubTransfer = window.qserial.tftp.onTransfer((event) => {
      useTftpStore.getState().handleTransferEvent(event as TftpTransferEvent);
    });
    return () => { unsubStatus(); unsubTransfer(); };
  }, []);

  return (
    <div className={`h-screen flex flex-col bg-background overflow-hidden ${hasTexture ? 'has-texture' : ''}`}>
      <TitleBar />

      {/* 主内容区：Sidebar + MainContent + 垂直快捷按钮 */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <Sidebar />

        <div className="flex-1 min-h-0 flex flex-col bg-background">
          {/* 主内容 */}
          <MainContent />

          {/* 快捷按钮栏 — 终端底部，始终可见 */}
          {!isVertical && (
            <div className="flex-shrink-0 border-t border-border bg-surface">
              <QuickButtonBar direction="horizontal" />
            </div>
          )}
        </div>

        {/* 垂直模式的快捷按钮面板 */}
        {isVertical && (
          <div className="flex flex-col border-l border-border bg-surface flex-shrink-0" style={{ width: 'var(--buttonbar-width, 140px)' }}>
            <QuickButtonBar direction="vertical" />
          </div>
        )}
      </div>

      {/* 全宽 StatusBar 在底部 */}
      <StatusBar />

      <SettingsDialog isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <ErrorToast message={errorMessage} onDismiss={dismiss} />
    </div>
  );
};
