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
          <div className="flex-1 flex items-center justify-center px-8">
            <div className="flex flex-col items-center">
              <svg width="56" height="46" viewBox="0 0 72 58" fill="none" className="text-primary mb-4" aria-label="QSerial">
                <path d="M12 14l12 16L12 46" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M30 46h28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <h1 className="text-xl font-semibold text-text tracking-tight">QSerial</h1>
              <p className="text-xs text-text-secondary/50 mt-0.5">嵌入式终端调试工具</p>

              <div className="w-[280px] mt-10 space-y-4">
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-pty'))}
                  className="w-full bg-background/60 border border-primary/20 rounded-lg overflow-hidden hover:border-primary/40 hover:bg-primary/[0.04] transition-all active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-primary flex-shrink-0">
                      <rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="7 10 10 13 7 16"/>
                    </svg>
                    <span className="text-sm font-medium text-primary">本地终端</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-primary/40 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"><path d="M4 2l4 4-4 4"/></svg>
                  </div>
                </button>

                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-serial'))}
                  className="w-full bg-background/60 border border-border/30 rounded-lg overflow-hidden hover:border-border/50 hover:bg-hover/50 transition-all active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-secondary flex-shrink-0 group-hover:text-text transition-colors">
                      <path d="M4 7V5a2 2 0 012-2h12a2 2 0 012 2v2"/><rect x="3" y="9" width="18" height="10" rx="2"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>
                    </svg>
                    <span className="text-sm text-text-secondary group-hover:text-text transition-colors">串口连接</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-secondary/30 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"><path d="M4 2l4 4-4 4"/></svg>
                  </div>
                </button>

                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-ssh'))}
                  className="w-full bg-background/60 border border-border/30 rounded-lg overflow-hidden hover:border-border/50 hover:bg-hover/50 transition-all active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-secondary flex-shrink-0 group-hover:text-text transition-colors">
                      <rect x="2" y="4" width="20" height="16" rx="3"/><path d="M8 14l.5.5a2 2 0 003 0L12 14l1.5-1.5a2 2 0 013 0l.5.5"/><circle cx="12" cy="12" r="2"/>
                    </svg>
                    <span className="text-sm text-text-secondary group-hover:text-text transition-colors">SSH 连接</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-secondary/30 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"><path d="M4 2l4 4-4 4"/></svg>
                  </div>
                </button>

                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-telnet'))}
                  className="w-full bg-background/60 border border-border/30 rounded-lg overflow-hidden hover:border-border/50 hover:bg-hover/50 transition-all active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-secondary flex-shrink-0 group-hover:text-text transition-colors">
                      <circle cx="12" cy="12" r="3"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>
                    </svg>
                    <span className="text-sm text-text-secondary group-hover:text-text transition-colors">Telnet 连接</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-secondary/30 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"><path d="M4 2l4 4-4 4"/></svg>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 relative overflow-hidden bg-background">
            {terminalPanes}
          </div>
        )}
      </div>

      {panelVisible && <SftpPanel />}
    </div>
  );
};
