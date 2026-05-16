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
          {/* 快捷按钮栏（设计稿：在终端顶部） */}
          {!isVertical && tabs.length > 0 && (
            <div className="flex-shrink-0 border-b border-border bg-surface">
              <div className="flex items-center">
                <button
                  onClick={() => setShowSettings(true)}
                  className="flex-shrink-0 h-[var(--buttonbar-height)] flex items-center gap-2 px-3 border-r border-border hover:bg-hover transition-colors group"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-secondary group-hover:text-text flex-shrink-0">
                    <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M13.3 10a1.1 1.1 0 00.2 1.2l.04.04a1.35 1.35 0 11-1.9 1.9l-.04-.04a1.1 1.1 0 00-1.2-.2 1.1 1.1 0 00-.67 1.01v.11a1.35 1.35 0 11-2.7 0v-.06a1.1 1.1 0 00-.72-1.01 1.1 1.1 0 00-1.2.2l-.04.04a1.35 1.35 0 11-1.9-1.9l.04-.04a1.1 1.1 0 00.2-1.2 1.1 1.1 0 00-1.01-.67h-.11a1.35 1.35 0 110-2.7h.06a1.1 1.1 0 001.01-.72 1.1 1.1 0 00-.2-1.2l-.04-.04a1.35 1.35 0 111.9-1.9l.04.04a1.1 1.1 0 001.2.2h.05a1.1 1.1 0 00.67-1.01v-.11a1.35 1.35 0 012.7 0v.06a1.1 1.1 0 00.72 1.01 1.1 1.1 0 001.2-.2l.04-.04a1.35 1.35 0 111.9 1.9l-.04.04a1.1 1.1 0 00-.2 1.2v.05a1.1 1.1 0 001.01.67h.11a1.35 1.35 0 010 2.7h-.06a1.1 1.1 0 00-1.01.72z" stroke="currentColor" strokeWidth="1" />
                  </svg>
                  <span className="text-xs text-text-secondary group-hover:text-text">设置</span>
                </button>
                <QuickButtonBar direction="horizontal" />
              </div>
            </div>
          )}

          {/* 主内容 */}
          <MainContent />
        </div>

        {/* 垂直模式的快捷按钮面板 */}
        {isVertical && (
          <div className="flex flex-col border-l border-border bg-surface flex-shrink-0" style={{ width: 'var(--buttonbar-width, 140px)' }}>
            <div className="h-[var(--buttonbar-height)] flex items-center gap-2 px-2 border-b border-border flex-shrink-0">
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 hover:bg-hover rounded-md px-1.5 py-0.5 transition-colors group"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-secondary group-hover:text-text flex-shrink-0">
                  <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M13.3 10a1.1 1.1 0 00.2 1.2l.04.04a1.35 1.35 0 11-1.9 1.9l-.04-.04a1.1 1.1 0 00-1.2-.2 1.1 1.1 0 00-.67 1.01v.11a1.35 1.35 0 11-2.7 0v-.06a1.1 1.1 0 00-.72-1.01 1.1 1.1 0 00-1.2.2l-.04.04a1.35 1.35 0 11-1.9-1.9l.04-.04a1.1 1.1 0 00.2-1.2 1.1 1.1 0 00-1.01-.67h-.11a1.35 1.35 0 110-2.7h.06a1.1 1.1 0 001.01-.72 1.1 1.1 0 00-.2-1.2l-.04-.04a1.35 1.35 0 111.9-1.9l.04.04a1.1 1.1 0 001.2.2h.05a1.1 1.1 0 00.67-1.01v-.11a1.35 1.35 0 012.7 0v.06a1.1 1.1 0 00.72 1.01 1.1 1.1 0 001.2-.2l.04-.04a1.35 1.35 0 111.9 1.9l-.04.04a1.1 1.1 0 00-.2 1.2v.05a1.1 1.1 0 001.01.67h.11a1.35 1.35 0 010 2.7h-.06a1.1 1.1 0 00-1.01.72z" stroke="currentColor" strokeWidth="1" />
                </svg>
                <span className="text-xs text-text-secondary group-hover:text-text">设置</span>
              </button>
            </div>
            <QuickButtonBar direction="vertical" />
          </div>
        )}
      </div>

      {/* 全宽 StatusBar 在底部 */}
      {tabs.length > 0 && <StatusBar />}

      <SettingsDialog isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <ErrorToast message={errorMessage} onDismiss={dismiss} />
    </div>
  );
};
