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
  const sessions = useTerminalStore(state => state.sessions);
  const { panelVisible } = useSftpStore();

  // 展平所有标签页中的终端面板（避免嵌套数组导致 React reconciliation 问题）
  const terminalPanes = useMemo(() => {
    const panes: React.ReactNode[] = [];
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
  }, [tabs, activeTabId, sessions]);

  return (
    <div className="flex-1 min-h-0 bg-background flex main-content-container">
      <div className="flex-1 min-h-0 bg-background flex flex-col">
        {tabs.length === 0 ? (
          /* 欢迎页面 */
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="text-center">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 text-primary opacity-80">
                <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
              <h2 className="text-xl mb-2">欢迎使用 QSerial</h2>
              <p className="text-text-secondary text-sm">点击左侧按钮创建新连接</p>
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
