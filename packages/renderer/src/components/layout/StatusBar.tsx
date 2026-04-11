/**
 * 状态栏组件
 */

import React from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { CONNECTION_STATE_NAMES } from '@qserial/shared';

export const StatusBar: React.FC = () => {
  const { tabs, activeTabId, sessions } = useTerminalStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeSession = activeTab?.activeSessionId
    ? sessions[activeTab.activeSessionId]
    : null;

  return (
    <div className="h-[var(--statusbar-height)] bg-surface border-t border-border flex items-center justify-between px-3 text-xs flex-shrink-0">
      {/* 左侧信息 */}
      <div className="flex items-center gap-4">
        {activeSession && (
          <>
            <span className="text-text-secondary">
              {activeSession.connectionType.toUpperCase()}
            </span>
            <span
              className={
                activeSession.connectionState === 'connected'
                  ? 'text-success'
                  : activeSession.connectionState === 'error'
                  ? 'text-error'
                  : 'text-warning'
              }
            >
              {CONNECTION_STATE_NAMES[activeSession.connectionState]}
            </span>
            <span className="text-text-secondary">
              {activeSession.cols}x{activeSession.rows}
            </span>
          </>
        )}
      </div>

      {/* 右侧信息 */}
      <div className="flex items-center gap-4">
        <span className="text-text-secondary">UTF-8</span>
        <span className="text-text-secondary">v0.1.0</span>
      </div>
    </div>
  );
};
