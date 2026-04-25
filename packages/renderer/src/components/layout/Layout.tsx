/**
 * 布局组件
 */

import React, { useEffect } from 'react';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { QuickButtonBar } from '../terminal/QuickButtonBar';
import { useQuickButtonsStore } from '@/stores/quickButtons';
import { useThemeStore } from '../../stores/theme';
import { useTftpStore } from '../../stores/tftp';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import type { TftpTransferEvent } from '@qserial/shared';

export const Layout: React.FC = () => {
  const { currentTheme } = useThemeStore();
  const hasTexture = Boolean(currentTheme.ui.texture);
  const [showSettings, setShowSettings] = React.useState(false);
  const quickButtonsState = useQuickButtonsStore();
  const isVertical = quickButtonsState?.direction === 'vertical';

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

      {/* 底部栏：设置 + 快捷按钮（仅水平模式） */}
      {!isVertical && (
        <div className="flex items-center border-t border-border bg-surface flex-shrink-0">
          <button
            onClick={() => setShowSettings(true)}
            className="flex-shrink-0 w-[var(--sidebar-width)] h-[var(--buttonbar-height)] flex items-center gap-2 px-3 border-r border-border hover:bg-hover transition-colors group"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-secondary group-hover:text-text flex-shrink-0">
              <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M13.3 10a1.1 1.1 0 00.2 1.2l.04.04a1.35 1.35 0 11-1.9 1.9l-.04-.04a1.1 1.1 0 00-1.2-.2 1.1 1.1 0 00-.67 1.01v.11a1.35 1.35 0 11-2.7 0v-.06a1.1 1.1 0 00-.72-1.01 1.1 1.1 0 00-1.2.2l-.04.04a1.35 1.35 0 11-1.9-1.9l.04-.04a1.1 1.1 0 00.2-1.2 1.1 1.1 0 00-1.01-.67h-.11a1.35 1.35 0 110-2.7h.06a1.1 1.1 0 001.01-.72 1.1 1.1 0 00-.2-1.2l-.04-.04a1.35 1.35 0 111.9-1.9l.04.04a1.1 1.1 0 001.2.2h.05a1.1 1.1 0 00.67-1.01v-.11a1.35 1.35 0 012.7 0v.06a1.1 1.1 0 00.72 1.01 1.1 1.1 0 001.2-.2l.04-.04a1.35 1.35 0 111.9 1.9l-.04.04a1.1 1.1 0 00-.2 1.2v.05a1.1 1.1 0 001.01.67h.11a1.35 1.35 0 010 2.7h-.06a1.1 1.1 0 00-1.01.72z" stroke="currentColor" strokeWidth="1" />
            </svg>
            <span className="text-xs text-text-secondary group-hover:text-text">设置</span>
          </button>
          <QuickButtonBar direction="horizontal" />
        </div>
      )}

      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
};
