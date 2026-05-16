/**
 * 统一 Header 组件 — Logo + Tabs + 工具栏 + 菜单 + 窗口控制
 * 对齐设计稿：单行 40px，合并原 TitleBar、TabBar、部分 MenuBar 功能
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { useSftpStore } from '@/stores/sftp';
import { ConnectionState } from '@qserial/shared';
import { ContextMenu } from '../common/ContextMenu';
import type { MenuItem } from './MenuBar';

interface TabContextMenu {
  x: number;
  y: number;
  tabId: string;
}

interface HeaderProps {
  menuItems: Array<{ label: string; items: MenuItem[] }>;
}

function parseLabel(raw: string): { before: string; mnemonic: string; after: string; mnemonicLower: string } {
  const idx = raw.indexOf('&');
  if (idx === -1) return { before: raw, mnemonic: '', after: '', mnemonicLower: '' };
  return {
    before: raw.slice(0, idx),
    mnemonic: raw.charAt(idx + 1) || '',
    after: raw.slice(idx + 2),
    mnemonicLower: (raw.charAt(idx + 1) || '').toLowerCase(),
  };
}

export const TitleBar: React.FC<HeaderProps> = ({ menuItems }) => {
  const terminalState = useTerminalStore();
  const tabs = terminalState?.tabs || [];
  const activeTabId = terminalState?.activeTabId;
  const setActiveTab = terminalState?.setActiveTab;
  const closeTab = terminalState?.closeTab;
  const sessions = terminalState?.sessions || {};

  const { panelVisible, setPanelVisible, createSession: createSftp, sessions: sftpSessions } = useSftpStore();

  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenu | null>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [newConnMenuOpen, setNewConnMenuOpen] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeSession = activeTab?.activeSessionId ? sessions[activeTab.activeSessionId] : null;
  const isSshConnected = activeSession?.connectionType === 'ssh' && activeSession?.connectionState === ConnectionState.CONNECTED;

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

  // 点击外部关闭菜单
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
        setNewConnMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Alt 键激活菜单
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      for (let i = 0; i < menuItems.length; i++) {
        const { mnemonicLower } = parseLabel(menuItems[i].label);
        if (mnemonicLower === key) {
          e.preventDefault();
          setMenuOpen((p) => (p === i ? null : i));
          setSubOpen(null);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuItems]);

  // Tab 右键菜单
  const tabCtxItems = tabContextMenu ? [
    { label: '关闭', onClick: () => { closeTab(tabContextMenu.tabId); setTabContextMenu(null); } },
    { label: '关闭其他标签页', onClick: () => { tabs.forEach((t) => { if (t.id !== tabContextMenu.tabId) closeTab(t.id); }); setTabContextMenu(null); }, disabled: tabs.length <= 1 },
    { label: '关闭右侧标签页', onClick: () => { const idx = tabs.findIndex((t) => t.id === tabContextMenu.tabId); for (let i = tabs.length - 1; i > idx; i--) closeTab(tabs[i].id); setTabContextMenu(null); }, disabled: tabs.findIndex((t) => t.id === tabContextMenu.tabId) >= tabs.length - 1 },
    { label: '关闭所有标签页', onClick: () => { [...tabs].reverse().forEach((t) => closeTab(t.id)); setTabContextMenu(null); } },
  ] : [];

  // SFTP
  const handleSftp = async () => {
    if (!activeSession || !isSshConnected) return;
    const existing = Object.values(sftpSessions).find((s) => s.connectionId === activeSession.connectionId);
    if (existing) {
      setPanelVisible(!panelVisible);
      if (!panelVisible) useSftpStore.getState().setActiveSession(existing.sftpId);
    } else {
      await createSftp(activeSession.connectionId);
    }
  };

  const dispatch = (ev: string) => window.dispatchEvent(new CustomEvent(ev));

  // 工具按钮定义
  const tools = [
    { title: '新建本地终端', onClick: () => { dispatch('qserial:open-pty'); setNewConnMenuOpen(false); }, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="7 10 10 13 7 16"/></svg> },
    { title: '新建连接', onClick: () => setNewConnMenuOpen(!newConnMenuOpen), icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>, hasDropdown: true },
    { title: '切换侧边栏', onClick: () => dispatch('qserial:toggle-sidebar'), icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="9" y1="5" x2="9" y2="19"/></svg> },
    { title: isSshConnected ? (panelVisible ? '关闭 SFTP' : '打开 SFTP') : 'SFTP (需SSH连接)', onClick: handleSftp, disabled: !isSshConnected, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg> },
    { title: '连接共享', onClick: () => dispatch('qserial:open-share'), icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> },
    { title: 'MCP AI 服务器', onClick: () => dispatch('qserial:open-mcp'), icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="4"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><path d="M9 15c.83.67 1.83 1 3 1s2.17-.33 3-1"/></svg> },
  ];

  return (
    <div className="h-[var(--titlebar-height)] bg-surface flex items-center select-none app-drag flex-shrink-0 border-b border-border" ref={menuRef}>
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

      {/* 工具按钮 */}
      <div className="flex items-center gap-0.5 px-1 app-no-drag flex-shrink-0">
        {/* 新建终端 */}
        <button onClick={() => dispatch('qserial:open-pty')} title="新建本地终端 (Ctrl+N)" className="h-[30px] w-[30px] flex items-center justify-center rounded-md hover:bg-hover text-text-secondary hover:text-text transition-colors">
          {tools[0].icon}
        </button>

        {/* 新建连接下拉 */}
        <div className="relative">
          <button onClick={() => setNewConnMenuOpen(!newConnMenuOpen)} title="新建连接" className="h-[30px] w-[30px] flex items-center justify-center rounded-md hover:bg-hover text-text-secondary hover:text-text transition-colors">
            {tools[1].icon}
          </button>
          {newConnMenuOpen && (
            <div className="absolute top-full right-0 mt-0.5 bg-surface border border-border rounded-md shadow-lg py-1 min-w-[180px] z-50 animate-fadeIn">
              {[
                { l: '本地终端', e: 'qserial:open-pty', k: 'Ctrl+N' },
                { l: '串口连接', e: 'qserial:open-serial', k: 'Ctrl+Shift+N' },
                { l: 'SSH 连接', e: 'qserial:open-ssh', k: 'Ctrl+Shift+S' },
                { l: 'Telnet 连接', e: 'qserial:open-telnet' },
              ].map((item) => (
                <button key={item.e} onClick={() => { dispatch(item.e); setNewConnMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-hover transition-colors">
                  <span>{item.l}</span>
                  {item.k && <span className="text-[10px] text-text-secondary/60 ml-4">{item.k}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 侧边栏 */}
        <button onClick={() => dispatch('qserial:toggle-sidebar')} title="切换侧边栏 (Ctrl+B)" className="h-[30px] w-[30px] flex items-center justify-center rounded-md hover:bg-hover text-text-secondary hover:text-text transition-colors">
          {tools[2].icon}
        </button>

        {/* SFTP */}
        <button onClick={handleSftp} disabled={!isSshConnected} title={tools[3].title} className={`h-[30px] w-[30px] flex items-center justify-center rounded-md transition-colors ${panelVisible ? 'bg-primary/10 text-primary' : 'hover:bg-hover text-text-secondary hover:text-text'} disabled:opacity-40 disabled:cursor-not-allowed`}>
          {tools[3].icon}
        </button>

        {/* 共享 */}
        <button onClick={() => dispatch('qserial:open-share')} title="连接共享" className="h-[30px] w-[30px] flex items-center justify-center rounded-md hover:bg-hover text-text-secondary hover:text-text transition-colors">
          {tools[4].icon}
        </button>

        {/* MCP */}
        <button onClick={() => dispatch('qserial:open-mcp')} title="MCP AI 服务器" className="h-[30px] w-[30px] flex items-center justify-center rounded-md hover:bg-hover text-text-secondary hover:text-text transition-colors">
          {tools[5].icon}
        </button>

        {/* 菜单下拉 */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(0)}
            className={`h-[30px] w-[30px] flex items-center justify-center rounded-md transition-colors ${menuOpen !== null ? 'bg-primary/10 text-primary' : 'hover:bg-hover text-text-secondary hover:text-text'}`}
            title="菜单"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
            </svg>
          </button>
          {menuOpen !== null && (
            <div className="absolute top-full right-0 mt-0.5 bg-surface border border-border rounded-md shadow-lg py-1 min-w-[200px] z-50 animate-fadeIn">
              {menuItems.map((menu, mi) => (
                <div key={mi}>
                  <div className="px-3 py-1 text-[10px] text-text-secondary/60 uppercase tracking-wider">{menu.label.replace(/&/g, '')}</div>
                  {menu.items.map((item, ii) => {
                    if (item.separator) return <div key={ii} className="my-0.5 border-t border-border" />;
                    return (
                      <button key={ii} disabled={item.enabled === false} onClick={() => { if (item.action) { item.action(); setMenuOpen(null); } }} className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        <span>{item.label?.replace(/&/g, '')}</span>
                        {item.shortcut && <span className="text-[10px] text-text-secondary/60 ml-4">{item.shortcut}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
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
