/**
 * 标题栏组件
 */

import React from 'react';
import { useTerminalStore } from '@/stores/terminal';

export const TitleBar: React.FC = () => {
  const terminalState = useTerminalStore();
  const tabs = terminalState?.tabs || [];
  const activeTabId = terminalState?.activeTabId;
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleMinimize = () => {
    window.qserial.window.minimize();
  };

  const handleMaximize = () => {
    window.qserial.window.maximize();
  };

  const handleClose = () => {
    window.qserial.window.close();
  };

  return (
    <div className="h-[var(--titlebar-height)] bg-surface flex items-center select-none app-drag flex-shrink-0 border-b border-border">
      {/* 左侧：Logo + 品牌名 */}
      <div className="flex items-center px-4 gap-2">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-primary flex-shrink-0">
          <rect x="1.875" y="1.875" width="4.6875" height="11.25" rx="0.9375" stroke="currentColor" strokeWidth="1.4"/>
          <rect x="8.4375" y="1.875" width="4.6875" height="11.25" rx="0.9375" stroke="currentColor" strokeWidth="1.4"/>
        </svg>
        <span className="text-xs font-bold text-text-secondary">QSerial</span>
      </div>

      {/* 中间：标题 - 整体可拖动，文字不可拖动以支持选中 */}
      <div className="flex-1 flex items-center justify-center">
        {activeTab && (
          <span className="text-xs text-text-secondary app-no-drag">{activeTab.name}</span>
        )}
      </div>

      {/* 右侧：窗口控制按钮 */}
      <div className="flex items-center app-no-drag">
        <button
          onClick={handleMinimize}
          className="w-12 h-[var(--titlebar-height)] flex items-center justify-center hover:bg-hover transition-colors"
          title="最小化"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" className="text-text-secondary">
            <rect x="2" y="5.5" width="8" height="1" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-[var(--titlebar-height)] flex items-center justify-center hover:bg-hover transition-colors"
          title="最大化"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" className="text-text-secondary">
            <rect x="2" y="2" width="8" height="8" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-[var(--titlebar-height)] flex items-center justify-center hover:bg-[#ff7b72] hover:text-white transition-colors"
          title="关闭"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" className="text-text-secondary">
            <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
};
