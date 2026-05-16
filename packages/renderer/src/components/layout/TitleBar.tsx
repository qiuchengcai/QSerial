/**
 * 统一 Header 组件 — Logo + Tabs + 窗口控制
 * 对齐设计稿：单行 40px
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { ConnectionState } from '@qserial/shared';
import { ContextMenu } from '../common/ContextMenu';

interface TabContextMenu {
  x: number;
  y: number;
  tabId: string;
}

export const TitleBar: React.FC = () => {
  const terminalState = useTerminalStore();
  const tabs = terminalState?.tabs || [];
  const activeTabId = terminalState?.activeTabId;
  const setActiveTab = terminalState?.setActiveTab;
  const closeTab = terminalState?.closeTab;
  const sessions = terminalState?.sessions || {};

  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenu | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Tabs 滚轮
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY * 2;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Tab 右键菜单
  const tabCtxItems = tabContextMenu ? [
    { label: '关闭', onClick: () => { closeTab(tabContextMenu.tabId); setTabContextMenu(null); } },
    { label: '关闭其他标签页', onClick: () => { tabs.forEach((t) => { if (t.id !== tabContextMenu.tabId) closeTab(t.id); }); setTabContextMenu(null); }, disabled: tabs.length <= 1 },
    { label: '关闭右侧标签页', onClick: () => { const idx = tabs.findIndex((t) => t.id === tabContextMenu.tabId); for (let i = tabs.length - 1; i > idx; i--) closeTab(tabs[i].id); setTabContextMenu(null); }, disabled: tabs.findIndex((t) => t.id === tabContextMenu.tabId) >= tabs.length - 1 },
    { label: '关闭所有标签页', onClick: () => { [...tabs].reverse().forEach((t) => closeTab(t.id)); setTabContextMenu(null); } },
  ] : [];

  return (
    <div className="h-[var(--titlebar-height)] bg-surface flex items-center select-none app-drag flex-shrink-0 border-b border-border">
      {/* Logo */}
      <div className="flex items-center px-3 gap-2 app-no-drag">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-primary flex-shrink-0">
          <rect x="1.875" y="1.875" width="4.6875" height="11.25" rx="0.9375" stroke="currentColor" strokeWidth="1.4"/>
          <rect x="8.4375" y="1.875" width="4.6875" height="11.25" rx="0.9375" stroke="currentColor" strokeWidth="1.4"/>
        </svg>
        <span className="text-xs font-bold text-text-secondary">QSerial</span>
      </div>

      {/* Tabs */}
      <div
        ref={tabsRef}
        className="flex-1 flex items-center gap-0.5 px-1 overflow-x-auto overflow-y-hidden app-no-drag h-full min-w-0"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const sess = tab.activeSessionId ? sessions[tab.activeSessionId] : null;
          const connected = sess?.connectionState === ConnectionState.CONNECTED;
          return (
            <div
              key={tab.id}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 h-[30px] cursor-pointer rounded-md text-xs transition-colors ${
                isActive ? 'bg-primary/[0.08] border border-primary/20 text-primary' : 'hover:bg-hover text-text-secondary'
              }`}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault(); e.stopPropagation();
                setTabContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
              }}
            >
              <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${connected ? 'bg-success' : 'bg-text-secondary/40'}`} />
              <span className="truncate max-w-[100px]">{tab.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className={`w-4 h-4 flex items-center justify-center rounded hover:bg-active text-text-secondary hover:text-text ${isActive ? 'opacity-100' : 'opacity-0'} hover:opacity-100`}
              >×</button>
            </div>
          );
        })}
      </div>

      {/* 窗口控制 */}
      <div className="flex items-center app-no-drag flex-shrink-0">
        <button onClick={() => window.qserial.window.minimize()} className="w-10 h-[var(--titlebar-height)] flex items-center justify-center hover:bg-hover transition-colors" title="最小化">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" className="text-text-secondary"><rect x="2" y="5.5" width="8" height="1"/></svg>
        </button>
        <button onClick={() => window.qserial.window.maximize()} className="w-10 h-[var(--titlebar-height)] flex items-center justify-center hover:bg-hover transition-colors" title="最大化">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" className="text-text-secondary"><rect x="2" y="2" width="8" height="8" strokeWidth="1"/></svg>
        </button>
        <button onClick={() => window.qserial.window.close()} className="w-10 h-[var(--titlebar-height)] flex items-center justify-center hover:bg-[#ff7b72] hover:text-white transition-colors" title="关闭">
          <svg width="10" height="10" viewBox="0 0 12 12" className="text-text-secondary"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5"/></svg>
        </button>
      </div>

      {/* Tab 右键菜单 */}
      {tabContextMenu && (
        <ContextMenu x={tabContextMenu.x} y={tabContextMenu.y} items={tabCtxItems} onClose={() => setTabContextMenu(null)} />
      )}
    </div>
  );
};
