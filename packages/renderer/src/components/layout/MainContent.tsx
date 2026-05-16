/**
 * 主内容区组件
 */

import React, { useMemo } from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { TabBar } from '../tabs/TabBar';
import { TerminalPane } from '../terminal/TerminalPane';
import { StatusBar } from '../layout/StatusBar';
import { SftpPanel } from '../sftp';
import { useSftpStore } from '@/stores/sftp';

export const MainContent: React.FC = () => {
  const tabs = useTerminalStore(state => state.tabs);
  const activeTabId = useTerminalStore(state => state.activeTabId);
  const { panelVisible } = useSftpStore();

  // 展平所有标签页中的终端面板（避免嵌套数组导致 React reconciliation 问题）
  const terminalPanes = useMemo(() => {
    const panes: React.ReactNode[] = [];
    const sessions = useTerminalStore.getState().sessions;
    for (const tab of tabs) {
      for (const sessionId of tab.sessions) {
        const session = sessions[sessionId];
        if (!session) continue;
        panes.push(
          <TerminalPane
            key={sessionId}
            sessionId={sessionId}
            connectionId={session.connectionId}
            isActive={tab.id === activeTabId && sessionId === tab.activeSessionId}
            activeTabId={activeTabId}
          />,
        );
      }
    }
    return panes;
  }, [tabs, activeTabId]);

  return (
    <div className="flex-1 min-h-0 bg-background flex main-content-container">
      <div className="flex-1 min-h-0 bg-background flex flex-col">
        {tabs.length === 0 ? (
          /* 欢迎页面 */
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="text-center select-none">
              <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="mx-auto mb-5 text-primary opacity-80">
                <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
              <h2 className="text-xl font-medium mb-2">欢迎使用 QSerial</h2>
              <p className="text-text-secondary text-sm mb-6">现代化的串口 / SSH / Telnet / 终端调试工具</p>
              <div className="flex items-center justify-center gap-3 mb-8">
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-pty'))}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:brightness-110 transition-all"
                >
                  💻 新建本地终端
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-serial'))}
                  className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-hover transition-colors"
                >
                  🔌 串口连接
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-ssh'))}
                  className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-hover transition-colors"
                >
                  🌐 SSH 连接
                </button>
              </div>
              <div className="text-xs text-text-secondary/60 space-y-1">
                <p>💡 按 <kbd className="px-1 py-0.5 bg-surface border border-border rounded text-[10px]">Ctrl+N</kbd> 快速创建本地终端</p>
                <p>💡 按 <kbd className="px-1 py-0.5 bg-surface border border-border rounded text-[10px]">Ctrl+,</kbd> 打开设置</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Tab 栏 */}
            <TabBar />

            {/* 状态栏 */}
            <StatusBar />

            {/* 终端内容 */}
            <div className="flex-1 min-h-0 relative overflow-hidden bg-background">
              {terminalPanes}
            </div>
          </>
        )}
      </div>

      {/* SFTP 面板 */}
      {panelVisible && <SftpPanel />}
    </div>
  );
};
