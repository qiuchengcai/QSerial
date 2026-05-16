/**
 * 主内容区组件 — TabBar 和 StatusBar 已移至 Header/Layout
 */

import React, { useMemo } from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { TerminalPane } from '../terminal/TerminalPane';
import { SftpPanel } from '../sftp';
import { useSftpStore } from '@/stores/sftp';

export const MainContent: React.FC = () => {
  const tabs = useTerminalStore(state => state.tabs);
  const activeTabId = useTerminalStore(state => state.activeTabId);
  const { panelVisible } = useSftpStore();

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
          <div className="flex-1 flex items-center justify-center bg-background px-8">
            <div className="text-center select-none max-w-md">
              {/* Logo */}
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/8 border border-primary/15 mb-6">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="text-primary">
                  <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="6.5" cy="8" r="1.3" fill="currentColor" opacity="0.5" />
                  <circle cx="10.5" cy="8" r="1.3" fill="currentColor" opacity="0.5" />
                  <circle cx="14.5" cy="8" r="1.3" fill="currentColor" opacity="0.5" />
                  <path d="M5 13 L8 15 L5 17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                  <rect x="10" y="12.5" width="8" height="1.6" rx="0.8" fill="currentColor" opacity="0.35" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-text mb-1 tracking-tight">QSerial</h1>
              <p className="text-sm text-text-secondary mb-8">
                现代化串口 · SSH · Telnet 终端调试工具
              </p>
              <div className="flex flex-col gap-2.5 mb-8">
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-pty'))}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/15 transition-all active:scale-[0.98]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="7 10 10 13 7 16"/></svg>
                  新建本地终端
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-serial'))}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border text-sm text-text-secondary hover:bg-hover transition-all active:scale-[0.98]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7V5a2 2 0 012-2h12a2 2 0 012 2v2"/><rect x="3" y="9" width="18" height="10" rx="2"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>
                  串口连接
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-ssh'))}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border text-sm text-text-secondary hover:bg-hover transition-all active:scale-[0.98]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M8 14l.5.5a2 2 0 003 0L12 14l1.5-1.5a2 2 0 013 0l.5.5"/><circle cx="12" cy="12" r="2"/></svg>
                  SSH 连接
                </button>
              </div>
              <div className="inline-flex items-center gap-4 px-4 py-2 rounded-lg bg-surface/50 border border-border/50">
                <span className="flex items-center gap-1.5 text-[11px] text-text-secondary/60">
                  <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono text-text-secondary/70">Ctrl+N</kbd>
                  新终端
                </span>
                <span className="w-px h-3 bg-border/50" />
                <span className="flex items-center gap-1.5 text-[11px] text-text-secondary/60">
                  <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono text-text-secondary/70">Ctrl+,</kbd>
                  设置
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 relative overflow-hidden bg-background">
            {terminalPanes}
          </div>
        )}
      </div>

      {/* SFTP 面板 */}
      {panelVisible && <SftpPanel />}
    </div>
  );
};
