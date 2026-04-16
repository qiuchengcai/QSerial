/**
 * 主内容区组件
 */

import React from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { TabBar } from '../tabs/TabBar';
import { TerminalPane } from '../terminal/TerminalPane';
import { StatusBar } from '../layout/StatusBar';

export const MainContent: React.FC = () => {
  const { tabs, activeTabId, sessions } = useTerminalStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex-1 min-h-0 bg-background flex flex-col">
      {tabs.length === 0 ? (
        /* 欢迎页面 */
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="text-6xl mb-4">🖥️</div>
            <h2 className="text-xl mb-2">欢迎使用 QSerial</h2>
            <p className="text-text-secondary">点击左侧按钮创建新连接</p>
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
            {tabs.map((tab) =>
              tab.sessions.map((sessionId) => {
                const session = sessions[sessionId];
                if (!session) return null;

                return (
                  <TerminalPane
                    key={sessionId}
                    sessionId={sessionId}
                    connectionId={session.connectionId}
                    isActive={tab.id === activeTabId && sessionId === tab.activeSessionId}
                  />
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};
