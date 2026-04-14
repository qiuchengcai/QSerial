/**
 * 标题栏组件
 */

import React from 'react';
import { useTerminalStore } from '@/stores/terminal';

export const TitleBar: React.FC = () => {
  const { tabs, activeTabId } = useTerminalStore();
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
    <div className="h-[var(--titlebar-height)] bg-surface flex items-center select-none app-drag flex-shrink-0">
      {/* 左侧：菜单 */}
      <div className="flex items-center px-3 gap-4 w-32">
        <span className="text-sm font-medium">QSerial</span>
      </div>

      {/* 中间：标题 */}
      <div className="flex-1 flex items-center justify-center app-no-drag">
        {activeTab && (
          <span className="text-sm">{activeTab.name}</span>
        )}
      </div>

      {/* 右侧：窗口控制按钮 */}
      <div className="flex items-center app-no-drag w-32 justify-end">
        <button
          onClick={handleMinimize}
          className="w-11 h-8 flex items-center justify-center hover:bg-hover transition-colors"
          title="最小化"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2" y="5" width="8" height="1" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-8 flex items-center justify-center hover:bg-hover transition-colors"
          title="最大化"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <rect x="2" y="2" width="8" height="8" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-11 h-8 flex items-center justify-center hover:bg-error transition-colors"
          title="关闭"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
};
