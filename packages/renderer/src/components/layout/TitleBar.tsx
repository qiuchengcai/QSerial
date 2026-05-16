/**
 * 统一 Header 组件 — 双行式布局
 *
 * 第一行：窗口控制圆点 + Logo → 居中显示当前终端名称 → 状态信息
 * 第二行：终端标签页
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
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

  // 当前活动终端信息
  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId), [tabs, activeTabId]);
  const activeSession = activeTab?.activeSessionId ? sessions[activeTab.activeSessionId] : null;
  const activeName = activeTab?.name || '未连接';
  const isConnected = activeSession?.connectionState === ConnectionState.CONNECTED;

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
    { label: '关闭左侧标签页', onClick: () => { const idx = tabs.findIndex((t) => t.id === tabContextMenu.tabId); for (let i = idx - 1; i >= 0; i--) closeTab(tabs[i].id); setTabContextMenu(null); }, disabled: tabs.findIndex((t) => t.id === tabContextMenu.tabId) <= 0 },
    { label: '关闭右侧标签页', onClick: () => { const idx = tabs.findIndex((t) => t.id === tabContextMenu.tabId); for (let i = tabs.length - 1; i > idx; i--) closeTab(tabs[i].id); setTabContextMenu(null); }, disabled: tabs.findIndex((t) => t.id === tabContextMenu.tabId) >= tabs.length - 1 },
    { label: '关闭其他标签页', onClick: () => { tabs.forEach((t) => { if (t.id !== tabContextMenu.tabId) closeTab(t.id); }); setTabContextMenu(null); }, disabled: tabs.length <= 1 },
    { label: '关闭所有标签页', onClick: () => { [...tabs].reverse().forEach((t) => closeTab(t.id)); setTabContextMenu(null); } },
  ] : [];

  return (
    <div className="bg-surface flex flex-col select-none app-drag flex-shrink-0 border-b border-border">
      {/* ====== 第一行：标题信息栏 ====== */}
      <div className="h-8 flex items-center px-2 gap-0.5">
        {/* Logo + 品牌 */}
        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0 app-no-drag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-primary flex-shrink-0">
            <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M7 11l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="13" y="14.5" width="5" height="1.8" rx="0.9" fill="currentColor" opacity="0.5"/>
          </svg>
          <span className="text-[11px] font-semibold text-text-secondary">QSerial</span>
        </div>

        {/* 分隔线 */}
        <div className="w-px h-4 bg-border/60 mx-2 flex-shrink-0" />

        {/* 居中：当前终端名称 */}
        <div className="flex-1 flex items-center justify-center min-w-0">
          {activeTab ? (
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-success' : 'bg-text-secondary/30'}`} />
              <span className="text-xs font-medium text-text truncate max-w-[300px]" title={activeName}>
                {activeName}
              </span>
            </div>
          ) : (
            <span className="text-xs text-text-tertiary/60">暂无终端</span>
          )}
        </div>

        {/* macOS 风格窗口控制圆点 */}
        <div className="flex items-center gap-2 px-3 ml-2 app-no-drag">
          <button
            onClick={() => window.qserial.window.minimize()}
            className="w-[14px] h-[14px] rounded-full bg-[#febc2e] hover:brightness-90 transition-all"
            title="最小化"
          />
          <button
            onClick={() => window.qserial.window.maximize()}
            className="w-[14px] h-[14px] rounded-full bg-[#29c840] hover:brightness-90 transition-all"
            title="最大化"
          />
          <button
            onClick={() => window.qserial.window.close()}
            className="w-[14px] h-[14px] rounded-full bg-[#ff5f57] hover:brightness-90 transition-all"
            title="关闭"
          />
        </div>
      </div>

      {/* ====== 第二行：标签页栏 ====== */}
      <div
        ref={tabsRef}
        className="h-[30px] flex items-center gap-px px-1 overflow-x-auto overflow-y-hidden app-no-drag"
      >
        {tabs.length === 0 ? (
          <span className="text-[11px] text-text-tertiary/40 ml-2">点击左侧"终端"开始</span>
        ) : (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const sess = tab.activeSessionId ? sessions[tab.activeSessionId] : null;
            const connected = sess?.connectionState === ConnectionState.CONNECTED;
            return (
              <div
                key={tab.id}
                className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 h-[26px] cursor-pointer text-xs transition-all rounded ${
                  isActive
                    ? 'bg-[var(--color-primary-dim)] text-primary font-medium'
                    : 'text-text-secondary hover:bg-hover'
                }`}
                onClick={() => setActiveTab(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  setTabContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                }}
              >
                <span className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${connected ? 'bg-success' : 'bg-text-secondary/30'}`} />
                <span className="truncate max-w-[130px]" title={tab.name}>{tab.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  className={`w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-active text-text-tertiary hover:text-text transition-all text-[11px] ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  } hover:opacity-100`}
                >×</button>
              </div>
            );
          })
        )}
      </div>

      {/* Tab 右键菜单 */}
      {tabContextMenu && (
        <ContextMenu x={tabContextMenu.x} y={tabContextMenu.y} items={tabCtxItems} onClose={() => setTabContextMenu(null)} />
      )}
    </div>
  );
};
