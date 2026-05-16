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
              <svg width="64" height="64" viewBox="0 0 15 15" fill="none" className="mx-auto mb-5 text-primary opacity-70">
                <rect x="1.875" y="1.875" width="4.6875" height="11.25" rx="0.9375" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="8.4375" y="1.875" width="4.6875" height="11.25" rx="0.9375" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
              <h2 className="text-lg font-semibold mb-2 text-text">欢迎使用 QSerial</h2>
              <p className="text-text-secondary text-xs mb-6">现代化的串口 / SSH / Telnet / 终端调试工具</p>
              <div className="flex items-center justify-center gap-3 mb-8">
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-pty'))}
                  className="px-4 py-2 rounded-md bg-primary/10 border border-primary/20 text-primary text-xs hover:bg-primary/20 transition-all"
                >
                  新建本地终端
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-serial'))}
                  className="px-4 py-2 rounded-md border border-border text-xs text-text-secondary hover:bg-hover transition-colors"
                >
                  串口连接
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-ssh'))}
                  className="px-4 py-2 rounded-md border border-border text-xs text-text-secondary hover:bg-hover transition-colors"
                >
                  SSH 连接
                </button>
              </div>
              <div className="text-[11px] text-text-secondary/50 space-y-1.5">
                <p>按 <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-[10px] font-mono">Ctrl+N</kbd> 快速创建本地终端</p>
                <p>按 <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-[10px] font-mono">Ctrl+,</kbd> 打开设置</p>
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
