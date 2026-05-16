/**
 * 侧边栏组件 — 对齐设计稿："连接"/"服务" 标签切换 + 服务状态区
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { useSavedSessionsStore, type SavedSession } from '@/stores/sessions';
import { useSidebarButtonsStore, type SidebarButtonType } from '@/stores/sidebarButtons';
import { useConfigStore } from '@/stores/config';
import { useTftpStore } from '@/stores/tftp';
import { useNfsStore } from '@/stores/nfs';
import { useFtpStore } from '@/stores/ftp';
import { useMcpStore } from '@/stores/mcp';
import { ConnectionType, ConnectionState } from '@qserial/shared';
import { SerialConnectDialog } from '../dialogs/SerialConnectDialog';
import { SshConnectDialog } from '../dialogs/SshConnectDialog';
import { TelnetConnectDialog } from '../dialogs/TelnetConnectDialog';
import { TftpDialog } from '../dialogs/TftpDialog';
import { NfsDialog } from '../dialogs/NfsDialog';
import { FtpDialog } from '../dialogs/FtpDialog';
import { PtyConnectDialog, type PtyConnectOptions } from '../dialogs/PtyConnectDialog';
import { McpDialog } from '../dialogs/McpDialog';
import { globalError } from '../common/ErrorToast';

const MIN_SIDEBAR_WIDTH = 140;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SIDEBAR_WIDTH = 210;

type NavTab = 'connections' | 'services';

export const Sidebar: React.FC = () => {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [activeNav, setActiveNav] = useState<NavTab>('connections');
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = ev.clientX - startXRef.current;
      const w = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidthRef.current + delta));
      setSidebarWidth(w);
      document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
    };
    const onUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  const sessions = useTerminalStore((s) => s.sessions);
  const { createTab, createSession, closeSessionAndTab } = useTerminalStore.getState();
  const savedSessionsState = useSavedSessionsStore();
  const savedSessions = savedSessionsState?.sessions || [];
  const addSession = savedSessionsState?.addSession;
  const removeSession = savedSessionsState?.removeSession;
  const updateSession = savedSessionsState?.updateSession;
  const reorderSessions = savedSessionsState?.reorderSessions;
  const [connectingType, setConnectingType] = useState<string | null>(null);
  const [showSerialDialog, setShowSerialDialog] = useState(false);
  const [showSshDialog, setShowSshDialog] = useState(false);
  const [showTelnetDialog, setShowTelnetDialog] = useState(false);
  const [showTftpDialog, setShowTftpDialog] = useState(false);
  const [showNfsDialog, setShowNfsDialog] = useState(false);
  const [showFtpDialog, setShowFtpDialog] = useState(false);
  const [showPtyDialog, setShowPtyDialog] = useState(false);
  const [showMcpDialog, setShowMcpDialog] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [editingSession, setEditingSession] = useState<SavedSession | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; session: SavedSession; index: number } | null>(null);

  const { buttons: sidebarButtons } = useSidebarButtonsStore();
  const terminalConfig = useConfigStore(s => s.config.terminal);

  // 服务状态
  const { running: tftpRunning } = useTftpStore();
  const { running: nfsRunning } = useNfsStore();
  const { running: ftpRunning } = useFtpStore();
  const { running: mcpRunning } = useMcpStore();

  useEffect(() => {
    const handlers: Record<string, () => void> = {
      'qserial:open-tftp': () => setShowTftpDialog(true),
      'qserial:open-nfs': () => setShowNfsDialog(true),
      'qserial:open-ftp': () => setShowFtpDialog(true),
      'qserial:open-mcp': () => setShowMcpDialog(true),
      'qserial:open-serial': () => setShowSerialDialog(true),
      'qserial:open-ssh': () => setShowSshDialog(true),
      'qserial:open-telnet': () => setShowTelnetDialog(true),
      'qserial:open-pty': () => setShowPtyDialog(true),
      'qserial:toggle-sidebar': () => setIsCollapsed((p) => !p),
    };
    for (const [ev, h] of Object.entries(handlers)) {
      window.addEventListener(ev, h);
    }
    return () => {
      for (const [ev, h] of Object.entries(handlers)) {
        window.removeEventListener(ev, h);
      }
    };
  }, []);

  const connectWithCleanup = async (connectionId: string, tabName: string, connectionType: ConnectionType, serialPath?: string, host?: string) => {
    createTab(tabName);
    const sessionId = createSession(connectionId, connectionType, serialPath, host);
    try { await window.qserial.connection.open(connectionId); }
    catch (error) { closeSessionAndTab(sessionId); throw error; }
  };

  const findActiveSession = (type: ConnectionType, match: (s: any) => boolean): string | null => {
    for (const [id, s] of Object.entries(sessions)) {
      if (s.connectionType === type && (s.connectionState === ConnectionState.CONNECTED || s.connectionState === ConnectionState.CONNECTING) && match(s)) return id;
    }
    return null;
  };

  const findActiveSerialSession = (serialPath: string) => findActiveSession(ConnectionType.SERIAL, (s) => s.serialPath === serialPath);

  const handlePtyConnect = async (options: PtyConnectOptions & { saveConfig?: boolean; configName?: string }) => {
    setConnectingType('pty');
    try {
      const connectionId = crypto.randomUUID();
      await window.qserial.connection.create({ id: connectionId, name: '本地终端', type: ConnectionType.PTY, shell: options.shell, cwd: options.cwd, cols: 80, rows: 24, autoReconnect: terminalConfig.autoReconnect, reconnectInterval: terminalConfig.reconnectInterval, reconnectAttempts: terminalConfig.reconnectAttempts });
      await connectWithCleanup(connectionId, '本地终端', ConnectionType.PTY);
    } catch (error) { globalError.show('创建终端失败: ' + (error as Error).message); }
    if (options.saveConfig && options.configName) { addSession({ name: options.configName, type: 'pty', ptyConfig: { shell: options.shell, cwd: options.cwd } }); }
    setConnectingType(null);
  };

  const handleSerialConnect = async (options: { path: string; baudRate: number; dataBits: 5|6|7|8; stopBits: 1|2; parity: 'none'|'even'|'odd'|'mark'|'space'; saveConfig?: boolean; configName?: string }) => {
    setConnectingType('serial');
    try {
      const connectionId = crypto.randomUUID();
      await window.qserial.connection.create({ id: connectionId, name: `串口 ${options.path}`, type: ConnectionType.SERIAL, path: options.path, baudRate: options.baudRate, dataBits: options.dataBits, stopBits: options.stopBits, parity: options.parity, autoReconnect: terminalConfig.autoReconnect, reconnectInterval: terminalConfig.reconnectInterval, reconnectAttempts: terminalConfig.reconnectAttempts });
      await connectWithCleanup(connectionId, `串口 ${options.path}`, ConnectionType.SERIAL, options.path);
    } catch (error) { globalError.show('创建串口连接失败: ' + (error as Error).message); }
    if (options.saveConfig && options.configName) { addSession({ name: options.configName, type: 'serial', serialConfig: { path: options.path, baudRate: options.baudRate, dataBits: options.dataBits, stopBits: options.stopBits, parity: options.parity } }); }
    setConnectingType(null);
  };

  const handleQuickConnect = async (savedSession: SavedSession) => {
    const cfg = savedSession;
    if (cfg.type === 'serial' && cfg.serialConfig) {
      const c = cfg.serialConfig;
      const activeId = findActiveSerialSession(c.path);
      if (activeId) { closeSessionAndTab(activeId); await new Promise(r => setTimeout(r, 500)); }
      setConnectingType('serial');
      try {
        const connectionId = crypto.randomUUID();
        await window.qserial.connection.create({ id: connectionId, name: cfg.name, type: ConnectionType.SERIAL, path: c.path, baudRate: c.baudRate, dataBits: c.dataBits, stopBits: c.stopBits, parity: c.parity, autoReconnect: terminalConfig.autoReconnect, reconnectInterval: terminalConfig.reconnectInterval, reconnectAttempts: terminalConfig.reconnectAttempts });
        await connectWithCleanup(connectionId, cfg.name, ConnectionType.SERIAL, c.path);
      } catch (error) { globalError.show('快速连接失败: ' + (error as Error).message); }
      setConnectingType(null);
      return;
    }
    if (cfg.type === 'ssh' && cfg.sshConfig) {
      const c = cfg.sshConfig;
      const activeId = findActiveSession(ConnectionType.SSH, (s) => s.host === c.host);
      if (activeId) { closeSessionAndTab(activeId); await new Promise(r => setTimeout(r, 300)); }
      setConnectingType('ssh');
      try {
        const connectionId = crypto.randomUUID();
        await window.qserial.connection.create({ id: connectionId, name: cfg.name, type: ConnectionType.SSH, host: c.host, port: c.port, username: c.username, password: c.password, privateKey: c.privateKey, passphrase: c.passphrase, autoReconnect: terminalConfig.autoReconnect, reconnectInterval: terminalConfig.reconnectInterval, reconnectAttempts: terminalConfig.reconnectAttempts });
        await connectWithCleanup(connectionId, cfg.name, ConnectionType.SSH, undefined, c.host);
      } catch (error) { globalError.show('SSH 快速连接失败: ' + (error as Error).message); }
      setConnectingType(null);
      return;
    }
    if (cfg.type === 'telnet' && cfg.telnetConfig) {
      const c = cfg.telnetConfig;
      const activeId = findActiveSession(ConnectionType.TELNET, (s) => s.host === c.host);
      if (activeId) { closeSessionAndTab(activeId); await new Promise(r => setTimeout(r, 300)); }
      setConnectingType('telnet');
      try {
        const connectionId = crypto.randomUUID();
        await window.qserial.connection.create({ id: connectionId, name: cfg.name, type: ConnectionType.TELNET, host: c.host, port: c.port, autoReconnect: terminalConfig.autoReconnect, reconnectInterval: terminalConfig.reconnectInterval, reconnectAttempts: terminalConfig.reconnectAttempts });
        await connectWithCleanup(connectionId, cfg.name, ConnectionType.TELNET, undefined, c.host);
      } catch (error) { globalError.show('Telnet 快速连接失败: ' + (error as Error).message); }
      setConnectingType(null);
      return;
    }
    if (cfg.type === 'pty' && cfg.ptyConfig) {
      const c = cfg.ptyConfig;
      const activeId = findActiveSession(ConnectionType.PTY, () => true);
      if (activeId) { closeSessionAndTab(activeId); await new Promise(r => setTimeout(r, 300)); }
      setConnectingType('pty');
      try {
        const connectionId = crypto.randomUUID();
        await window.qserial.connection.create({ id: connectionId, name: cfg.name, type: ConnectionType.PTY, shell: c.shell, cwd: c.cwd, cols: 80, rows: 24, autoReconnect: terminalConfig.autoReconnect, reconnectInterval: terminalConfig.reconnectInterval, reconnectAttempts: terminalConfig.reconnectAttempts });
        await connectWithCleanup(connectionId, cfg.name, ConnectionType.PTY);
      } catch (error) { globalError.show('本地终端快速连接失败: ' + (error as Error).message); }
      setConnectingType(null);
      return;
    }
  };

  const isSessionConnected = (savedSession: SavedSession): boolean => {
    for (const s of Object.values(sessions)) {
      if (s.connectionState !== ConnectionState.CONNECTED && s.connectionState !== ConnectionState.CONNECTING) continue;
      if (savedSession.type === 'serial' && savedSession.serialConfig) { if (s.connectionType === ConnectionType.SERIAL && s.serialPath === savedSession.serialConfig.path) return true; }
      else if (savedSession.type === 'ssh' && savedSession.sshConfig) { if (s.connectionType === ConnectionType.SSH && s.host === savedSession.sshConfig.host) return true; }
      else if (savedSession.type === 'telnet' && savedSession.telnetConfig) { if (s.connectionType === ConnectionType.TELNET && s.host === savedSession.telnetConfig.host) return true; }
      else if (savedSession.type === 'pty' && savedSession.ptyConfig) { if (s.connectionType === ConnectionType.PTY) return true; }
    }
    return false;
  };

  const handleSshConnect = async (options: { host: string; port: number; username: string; password?: string; privateKey?: string; passphrase?: string; saveConfig?: boolean; configName?: string }) => {
    setConnectingType('ssh');
    try {
      const connectionId = crypto.randomUUID();
      await window.qserial.connection.create({ id: connectionId, name: `SSH ${options.username}@${options.host}`, type: ConnectionType.SSH, host: options.host, port: options.port, username: options.username, password: options.password, privateKey: options.privateKey, passphrase: options.passphrase, autoReconnect: terminalConfig.autoReconnect, reconnectInterval: terminalConfig.reconnectInterval, reconnectAttempts: terminalConfig.reconnectAttempts });
      await connectWithCleanup(connectionId, `SSH ${options.host}`, ConnectionType.SSH, undefined, options.host);
    } catch (error) { globalError.show('SSH 连接失败: ' + (error as Error).message); }
    if (options.saveConfig && options.configName) { addSession({ name: options.configName, type: 'ssh', sshConfig: { host: options.host, port: options.port, username: options.username, password: options.password, privateKey: options.privateKey, passphrase: options.passphrase } }); }
    setConnectingType(null);
  };

  const handleTelnetConnect = async (options: { host: string; port: number; saveConfig?: boolean; configName?: string }) => {
    setConnectingType('telnet');
    try {
      const connectionId = crypto.randomUUID();
      await window.qserial.connection.create({ id: connectionId, name: `Telnet ${options.host}`, type: ConnectionType.TELNET, host: options.host, port: options.port, autoReconnect: terminalConfig.autoReconnect, reconnectInterval: terminalConfig.reconnectInterval, reconnectAttempts: terminalConfig.reconnectAttempts });
      await connectWithCleanup(connectionId, `Telnet ${options.host}`, ConnectionType.TELNET, undefined, options.host);
    } catch (error) { globalError.show('Telnet 连接失败: ' + (error as Error).message); }
    if (options.saveConfig && options.configName) { addSession({ name: options.configName, type: 'telnet', telnetConfig: { host: options.host, port: options.port } }); }
    setConnectingType(null);
  };

  const handleContextMenu = (e: React.MouseEvent, session: SavedSession, index: number) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, session, index }); };
  const closeContextMenu = () => setContextMenu(null);

  const handleEditSession = (session: SavedSession) => {
    setEditingSession(session); closeContextMenu();
    switch (session.type) {
      case 'serial': setShowSerialDialog(true); break;
      case 'ssh': setShowSshDialog(true); break;
      case 'telnet': setShowTelnetDialog(true); break;
      case 'pty': setShowPtyDialog(true); break;
    }
  };

  const handleSerialUpdate = (opts: any) => { if (editingSession && opts.saveConfig && opts.configName) updateSession(editingSession.id, { name: opts.configName, serialConfig: { path: opts.path, baudRate: opts.baudRate, dataBits: opts.dataBits, stopBits: opts.stopBits, parity: opts.parity } }); handleSerialConnect(opts); setEditingSession(null); };
  const handleSshUpdate = (opts: any) => { if (editingSession && opts.saveConfig && opts.configName) updateSession(editingSession.id, { name: opts.configName, sshConfig: { host: opts.host, port: opts.port, username: opts.username, password: opts.password } }); handleSshConnect(opts); setEditingSession(null); };
  const handleTelnetUpdate = (opts: any) => { if (editingSession && opts.saveConfig && opts.configName) updateSession(editingSession.id, { name: opts.configName, telnetConfig: { host: opts.host, port: opts.port } }); handleTelnetConnect(opts); setEditingSession(null); };
  const handlePtyUpdate = (opts: any) => { if (editingSession && opts.saveConfig && opts.configName) updateSession(editingSession.id, { name: opts.configName, ptyConfig: { shell: opts.shell, cwd: opts.cwd } }); handlePtyConnect(opts); setEditingSession(null); };

  // 按钮配置
  const connButtons: Array<{ type: SidebarButtonType; icon: string; label: string; onClick: () => void; disabled: boolean }> = [
    { type: 'pty', icon: '💻', label: connectingType === 'pty' ? '连接中...' : '本地终端', onClick: () => setShowPtyDialog(true), disabled: connectingType === 'pty' },
    { type: 'serial', icon: '🔌', label: '串口连接', onClick: () => setShowSerialDialog(true), disabled: connectingType === 'serial' },
    { type: 'ssh', icon: '🌐', label: 'SSH 连接', onClick: () => setShowSshDialog(true), disabled: connectingType === 'ssh' },
    { type: 'telnet', icon: '📡', label: 'Telnet 连接', onClick: () => setShowTelnetDialog(true), disabled: connectingType === 'telnet' },
  ];

  const serviceButtons: Array<{ icon: string; label: string; onClick: () => void; running: boolean }> = [
    { icon: '📁', label: 'TFTP 服务器', onClick: () => setShowTftpDialog(true), running: tftpRunning },
    { icon: '🗂️', label: 'NFS 服务器', onClick: () => setShowNfsDialog(true), running: nfsRunning },
    { icon: '📤', label: 'FTP 服务器', onClick: () => setShowFtpDialog(true), running: ftpRunning },
    { icon: '🤖', label: 'MCP AI 服务器', onClick: () => setShowMcpDialog(true), running: mcpRunning },
  ];

  // Collapsed state
  if (isCollapsed) {
    return (
      <div className="w-12 bg-surface border-r border-border flex flex-col items-center py-2 flex-shrink-0">
        <button onClick={() => setIsCollapsed(false)} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-hover text-text-secondary transition-colors mb-2" title="展开侧边栏">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {sidebarButtons.map((btn) => {
          const cfg = [...connButtons, ...serviceButtons.map(s => ({ type: s.label as SidebarButtonType, icon: s.icon, label: s.label, onClick: s.onClick, disabled: false }))].find(b => b.type === btn.type);
          return cfg ? <button key={btn.type} onClick={cfg.onClick} disabled={'disabled' in cfg && cfg.disabled} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-hover disabled:opacity-50 mb-1 text-text-secondary hover:text-text transition-colors text-sm" title={cfg.label}>{cfg.icon}</button> : null;
        })}
        {/* Dialogs */}
        <Dialogs />
      </div>
    );
  }

  return (
    <div className="w-[var(--sidebar-width)] bg-surface border-r border-border flex flex-col flex-shrink-0 relative">
      {/* 导航标签："连接" / "服务" */}
      <div className="flex border-b border-border flex-shrink-0">
        <button
          onClick={() => setActiveNav('connections')}
          className={`flex-1 h-[37px] text-xs font-medium transition-colors ${activeNav === 'connections' ? 'text-text border-b-2 border-primary' : 'text-text-secondary hover:text-text'}`}
        >连接</button>
        <button
          onClick={() => setActiveNav('services')}
          className={`flex-1 h-[37px] text-xs font-medium transition-colors ${activeNav === 'services' ? 'text-text border-b-2 border-primary' : 'text-text-secondary hover:text-text'}`}
        >服务</button>
      </div>

      {/* 折叠按钮 */}
      <button
        onClick={() => setIsCollapsed(true)}
        className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded hover:bg-hover text-text-secondary transition-colors z-10"
        title="折叠侧边栏"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M7 1L3 5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      {/* 连接标签页内容 */}
      {activeNav === 'connections' && (
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
          <div className="p-2 border-b border-border">
            <h3 className="text-[10px] uppercase tracking-wider text-text-secondary font-medium mb-1.5 px-1">新建连接</h3>
            <div className="flex flex-col gap-0.5">
              {connButtons.map((btn) => (
                <button
                  key={btn.type}
                  onClick={btn.onClick}
                  disabled={btn.disabled}
                  className={`sidebar-btn flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-hover transition-colors text-left ${btn.disabled ? 'opacity-50' : ''} group`}
                  title={btn.label}
                >
                  <span className="text-sm flex-shrink-0">{btn.icon}</span>
                  <span className="text-xs truncate">{btn.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 保存的会话 */}
          <div className="flex-1 overflow-y-auto p-2">
            <h3 className="text-[10px] uppercase tracking-wider text-text-secondary font-medium mb-1.5 px-1">配置</h3>
            {savedSessions.length === 0 ? (
              <div className="text-xs text-text-secondary px-2 py-3 text-center opacity-60">暂无保存的配置</div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {savedSessions.map((session, index) => {
                  const connected = isSessionConnected(session);
                  return (
                    <div
                      key={session.id}
                      className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${connected ? 'bg-green-500/10 hover:bg-green-500/15' : 'hover:bg-hover'}`}
                      onClick={() => handleQuickConnect(session)}
                      onContextMenu={(e) => handleContextMenu(e, session, index)}
                    >
                      <span className="flex-shrink-0">
                        {connected ? (
                          <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-green-500">
                            <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </span>
                        ) : (
                          <span className="block w-3.5 h-3.5 rounded-full border border-border" />
                        )}
                      </span>
                      <span className={`flex-1 text-xs truncate ${connected ? 'text-green-400' : ''}`}>{session.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeSession(session.id); }}
                        className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded hover:bg-active text-text-secondary flex-shrink-0 transition-opacity"
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 服务标签页内容 */}
      {activeNav === 'services' && (
        <div className="flex-1 overflow-y-auto p-2">
          <h3 className="text-[10px] uppercase tracking-wider text-text-secondary font-medium mb-1.5 px-1">服务管理</h3>
          <div className="flex flex-col gap-0.5">
            {serviceButtons.map((svc) => (
              <button
                key={svc.label}
                onClick={svc.onClick}
                className="sidebar-btn flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-hover transition-colors text-left group"
                title={svc.label}
              >
                <span className="text-sm flex-shrink-0">{svc.icon}</span>
                <span className="text-xs truncate flex-1">{svc.label}</span>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${svc.running ? 'bg-green-500' : 'bg-text-secondary/30'}`} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 底部服务状态区（始终可见） */}
      <div className="flex-shrink-0 border-t border-border p-2">
        <h3 className="text-[10px] uppercase tracking-wider text-text-secondary font-medium mb-1.5 px-1">服务状态</h3>
        <div className="flex flex-col gap-0.5">
          {[
            { label: 'TFTP', port: 69, running: tftpRunning, onClick: () => setShowTftpDialog(true) },
            { label: 'NFS', port: 2049, running: nfsRunning, onClick: () => setShowNfsDialog(true) },
            { label: 'FTP', port: 21, running: ftpRunning, onClick: () => setShowFtpDialog(true) },
            { label: 'MCP AI', port: 0, running: mcpRunning, onClick: () => setShowMcpDialog(true) },
          ].map((svc) => (
            <div
              key={svc.label}
              onClick={svc.onClick}
              className="flex items-center gap-2 px-2.5 py-1 rounded-md hover:bg-hover cursor-pointer transition-colors group"
            >
              <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${svc.running ? 'bg-green-500' : 'bg-text-secondary/30'}`} />
              <span className="text-xs text-text-secondary flex-1">{svc.label}</span>
              {svc.port > 0 && <span className="text-[10px] text-text-secondary/50 font-mono">:{svc.port}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Dialogs */}
      <Dialogs />

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu}/>
          <div className="fixed z-50 bg-surface border border-border rounded shadow-lg py-1 min-w-[120px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button onClick={() => handleEditSession(contextMenu.session)} className="w-full px-3 py-1.5 text-sm text-left hover:bg-hover">编辑配置</button>
            <button onClick={() => { removeSession(contextMenu.session.id); closeContextMenu(); }} className="w-full px-3 py-1.5 text-sm text-left hover:bg-hover text-red-500">删除配置</button>
            <div className="my-1 border-t border-border"/>
            <button onClick={() => { if (reorderSessions && contextMenu.index > 0) reorderSessions(contextMenu.index, contextMenu.index - 1); closeContextMenu(); }} disabled={contextMenu.index === 0} className="w-full px-3 py-1.5 text-sm text-left hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed">上移</button>
            <button onClick={() => { if (reorderSessions && contextMenu.index < savedSessions.length - 1) reorderSessions(contextMenu.index, contextMenu.index + 1); closeContextMenu(); }} disabled={contextMenu.index === savedSessions.length - 1} className="w-full px-3 py-1.5 text-sm text-left hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed">下移</button>
          </div>
        </>
      )}

      {/* 拖拽调整手柄 */}
      <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
    </div>
  );

  // 内联 Dialogs 组件
  function Dialogs() {
    return (
      <>
        <SerialConnectDialog isOpen={showSerialDialog} onClose={() => { setShowSerialDialog(false); setEditingSession(null); }} onConnect={editingSession ? handleSerialUpdate : handleSerialConnect} editSession={editingSession?.type === 'serial' ? editingSession : null} />
        <SshConnectDialog isOpen={showSshDialog} onClose={() => { setShowSshDialog(false); setEditingSession(null); }} onConnect={editingSession ? handleSshUpdate : handleSshConnect} editSession={editingSession?.type === 'ssh' ? editingSession : null} />
        <TelnetConnectDialog isOpen={showTelnetDialog} onClose={() => { setShowTelnetDialog(false); setEditingSession(null); }} onConnect={editingSession ? handleTelnetUpdate : handleTelnetConnect} editSession={editingSession?.type === 'telnet' ? editingSession : null} />
        <TftpDialog isOpen={showTftpDialog} onClose={() => setShowTftpDialog(false)} />
        <NfsDialog isOpen={showNfsDialog} onClose={() => setShowNfsDialog(false)} />
        <FtpDialog isOpen={showFtpDialog} onClose={() => setShowFtpDialog(false)} />
        <McpDialog isOpen={showMcpDialog} onClose={() => setShowMcpDialog(false)} />
        <PtyConnectDialog isOpen={showPtyDialog} onClose={() => { setShowPtyDialog(false); setEditingSession(null); }} onConnect={editingSession ? handlePtyUpdate : handlePtyConnect} editSession={editingSession?.type === 'pty' ? editingSession : null} />
      </>
    );
  }
};
