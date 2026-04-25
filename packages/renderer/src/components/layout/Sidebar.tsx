/**
 * 侧边栏组件
 */

import React, { useState, useCallback, useRef } from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { useSavedSessionsStore, type SavedSession } from '@/stores/sessions';
import { useSidebarButtonsStore, type SidebarButtonType } from '@/stores/sidebarButtons';
import { ConnectionType, ConnectionState } from '@qserial/shared';
import { SerialConnectDialog } from '../dialogs/SerialConnectDialog';
import { SshConnectDialog } from '../dialogs/SshConnectDialog';
import { TelnetConnectDialog } from '../dialogs/TelnetConnectDialog';
import { TftpDialog } from '../dialogs/TftpDialog';
import { NfsDialog } from '../dialogs/NfsDialog';
import { FtpDialog } from '../dialogs/FtpDialog';
import { PtyConnectDialog, type PtyConnectOptions } from '../dialogs/PtyConnectDialog';

const MIN_SIDEBAR_WIDTH = 120;
const MAX_SIDEBAR_WIDTH = 400;
const DEFAULT_SIDEBAR_WIDTH = 160;

export const Sidebar: React.FC = () => {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
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

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidthRef.current + delta));
      setSidebarWidth(newWidth);
      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [sidebarWidth]);
  const terminalState = useTerminalStore();
  const createTab = terminalState?.createTab;
  const createSession = terminalState?.createSession;
  const sessions = terminalState?.sessions || {};
  const closeSessionAndTab = terminalState?.closeSessionAndTab;
  const savedSessionsState = useSavedSessionsStore();
  const savedSessions = savedSessionsState?.sessions || [];
  const addSession = savedSessionsState?.addSession;
  const removeSession = savedSessionsState?.removeSession;
  const updateSession = savedSessionsState?.updateSession;
  const [connectingType, setConnectingType] = useState<string | null>(null);
  const [showSerialDialog, setShowSerialDialog] = useState(false);
  const [showSshDialog, setShowSshDialog] = useState(false);
  const [showTelnetDialog, setShowTelnetDialog] = useState(false);
  const [showTftpDialog, setShowTftpDialog] = useState(false);
  const [showNfsDialog, setShowNfsDialog] = useState(false);
  const [showFtpDialog, setShowFtpDialog] = useState(false);
  const [showPtyDialog, setShowPtyDialog] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [editingSession, setEditingSession] = useState<SavedSession | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; session: SavedSession; index: number } | null>(null);

  const { buttons: sidebarButtons } = useSidebarButtonsStore();
  const reorderSessions = savedSessionsState?.reorderSessions;

  // 连接失败时自动清理 tab/session 的辅助函数
  const connectWithCleanup = async (
    connectionId: string,
    tabName: string,
    connectionType: ConnectionType,
    serialPath?: string,
    host?: string,
  ) => {
    createTab(tabName);
    const sessionId = createSession(connectionId, connectionType, serialPath, host);
    try {
      await window.qserial.connection.open(connectionId);
    } catch (error) {
      // open 失败后先销毁连接（取消自动重连等），再清理 session/tab
      try {
        await window.qserial.connection.destroy(connectionId);
      } catch {
        // destroy 失败不影响清理流程
      }
      closeSessionAndTab(sessionId);
      throw error;
    }
  };

  // 查找使用指定串口路径的活动连接
  const findActiveSerialSession = (serialPath: string): string | null => {
    for (const [sessionId, session] of Object.entries(sessions)) {
      if (session.connectionType === ConnectionType.SERIAL &&
          session.serialPath === serialPath &&
          (session.connectionState === ConnectionState.CONNECTED ||
           session.connectionState === ConnectionState.CONNECTING)) {
        return sessionId;
      }
    }
    return null;
  };

  const handleNewTerminal = () => {
    setShowPtyDialog(true);
  };

  const handlePtyConnect = async (options: PtyConnectOptions & { saveConfig?: boolean; configName?: string }) => {
    setConnectingType('pty');

    try {
      const connectionId = crypto.randomUUID();

      await window.qserial.connection.create({
        id: connectionId,
        name: '本地终端',
        type: ConnectionType.PTY,
        shell: options.shell,
        cwd: options.cwd,
        cols: 80,
        rows: 24,
      });

      await connectWithCleanup(connectionId, '本地终端', ConnectionType.PTY);

      if (options.saveConfig && options.configName) {
        addSession({
          name: options.configName,
          type: 'pty',
          ptyConfig: {
            shell: options.shell,
            cwd: options.cwd,
          },
        });
      }
    } catch (error) {
      console.error('Failed to create terminal:', error);
      setConnectingType(null);
      setTimeout(() => alert('创建终端失败: ' + (error as Error).message), 0);
      return;
    }
    setConnectingType(null);
  };

  const handleSerialConnect = async (options: {
    path: string;
    baudRate: number;
    dataBits: 5 | 6 | 7 | 8;
    stopBits: 1 | 2;
    parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
    saveConfig?: boolean;
    configName?: string;
  }) => {
    setConnectingType('serial');

    try {
      const connectionId = crypto.randomUUID();

      await window.qserial.connection.create({
        id: connectionId,
        name: `串口 ${options.path}`,
        type: ConnectionType.SERIAL,
        path: options.path,
        baudRate: options.baudRate,
        dataBits: options.dataBits,
        stopBits: options.stopBits,
        parity: options.parity,
        autoReconnect: true,
        reconnectInterval: 3000,
        reconnectAttempts: 5,
      });

      await connectWithCleanup(connectionId, `串口 ${options.path}`, ConnectionType.SERIAL, options.path);

      if (options.saveConfig && options.configName) {
        addSession({
          name: options.configName,
          type: 'serial',
          serialConfig: {
            path: options.path,
            baudRate: options.baudRate,
            dataBits: options.dataBits,
            stopBits: options.stopBits,
            parity: options.parity,
          },
        });
      }
    } catch (error) {
      console.error('Failed to create serial connection:', error);
      setConnectingType(null);
      setTimeout(() => alert('创建串口连接失败: ' + (error as Error).message), 0);
      return;
    }
    setConnectingType(null);
  };

  const handleQuickConnect = async (savedSession: SavedSession) => {
    if (savedSession.type === 'serial' && savedSession.serialConfig) {
      const config = savedSession.serialConfig;
      const activeSessionId = findActiveSerialSession(config.path);

      if (activeSessionId) {
        setConnectingType('serial');
        try {
          const session = sessions[activeSessionId];
          if (session) {
            await window.qserial.connection.destroy(session.connectionId);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          closeSessionAndTab(activeSessionId);
        } catch (err) {
          console.error('Failed to close connection:', err);
        } finally {
          setConnectingType(null);
        }
        return;
      }

        setConnectingType('serial');

      try {
        const connectionId = crypto.randomUUID();

        await window.qserial.connection.create({
          id: connectionId,
          name: savedSession.name,
          type: ConnectionType.SERIAL,
          path: config.path,
          baudRate: config.baudRate,
          dataBits: config.dataBits,
          stopBits: config.stopBits,
          parity: config.parity,
          autoReconnect: true,
          reconnectInterval: 3000,
          reconnectAttempts: 5,
        });

        await connectWithCleanup(connectionId, savedSession.name, ConnectionType.SERIAL, config.path);
      } catch (error) {
        console.error('Failed to quick connect:', error);
        setConnectingType(null);
        setTimeout(() => alert('快速连接失败: ' + (error as Error).message), 0);
        return;
      }
      setConnectingType(null);
      return;
    }

    if (savedSession.type === 'ssh' && savedSession.sshConfig) {
      const config = savedSession.sshConfig;
      setConnectingType('ssh');

      try {
        const connectionId = crypto.randomUUID();

        await window.qserial.connection.create({
          id: connectionId,
          name: savedSession.name,
          type: ConnectionType.SSH,
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          privateKey: config.privateKey,
          passphrase: config.passphrase,
          autoReconnect: true,
          reconnectInterval: 3000,
          reconnectAttempts: 5,
        });

        await connectWithCleanup(connectionId, savedSession.name, ConnectionType.SSH, undefined, config.host);
      } catch (error) {
        console.error('Failed to quick connect SSH:', error);
        setConnectingType(null);
        setTimeout(() => alert('SSH 快速连接失败: ' + (error as Error).message), 0);
        return;
      }
      setConnectingType(null);
      return;
    }

    if (savedSession.type === 'telnet' && savedSession.telnetConfig) {
      const config = savedSession.telnetConfig;
      setConnectingType('telnet');

      try {
        const connectionId = crypto.randomUUID();

        await window.qserial.connection.create({
          id: connectionId,
          name: savedSession.name,
          type: ConnectionType.TELNET,
          host: config.host,
          port: config.port,
          autoReconnect: true,
          reconnectInterval: 3000,
          reconnectAttempts: 5,
        });

        await connectWithCleanup(connectionId, savedSession.name, ConnectionType.TELNET, undefined, config.host);
      } catch (error) {
        console.error('Failed to quick connect Telnet:', error);
        setConnectingType(null);
        setTimeout(() => alert('Telnet 快速连接失败: ' + (error as Error).message), 0);
        return;
      }
      setConnectingType(null);
      return;
    }

    if (savedSession.type === 'pty' && savedSession.ptyConfig) {
      const config = savedSession.ptyConfig;
      setConnectingType('pty');

      try {
        const connectionId = crypto.randomUUID();

        await window.qserial.connection.create({
          id: connectionId,
          name: savedSession.name,
          type: ConnectionType.PTY,
          shell: config.shell,
          cwd: config.cwd,
          cols: 80,
          rows: 24,
        });

        await connectWithCleanup(connectionId, savedSession.name, ConnectionType.PTY);
      } catch (error) {
        console.error('Failed to quick connect PTY:', error);
        setConnectingType(null);
        setTimeout(() => alert('本地终端快速连接失败: ' + (error as Error).message), 0);
        return;
      }
      setConnectingType(null);
      return;
    }
  };

  const isSessionConnected = (savedSession: SavedSession): boolean => {
    for (const session of Object.values(sessions)) {
      if (session.connectionState !== ConnectionState.CONNECTED &&
          session.connectionState !== ConnectionState.CONNECTING) {
        continue;
      }
      if (savedSession.type === 'serial' && savedSession.serialConfig) {
        if (session.connectionType === ConnectionType.SERIAL &&
            session.serialPath === savedSession.serialConfig.path) {
          return true;
        }
      } else if (savedSession.type === 'ssh' && savedSession.sshConfig) {
        if (session.connectionType === ConnectionType.SSH &&
            session.host === savedSession.sshConfig.host) {
          return true;
        }
      } else if (savedSession.type === 'telnet' && savedSession.telnetConfig) {
        if (session.connectionType === ConnectionType.TELNET &&
            session.host === savedSession.telnetConfig.host) {
          return true;
        }
      } else if (savedSession.type === 'pty' && savedSession.ptyConfig) {
        if (session.connectionType === ConnectionType.PTY) {
          return true;
        }
      }
    }
    return false;
  };

  const handleNewSSH = () => {
    setShowSshDialog(true);
  };

  const handleSshConnect = async (options: {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    saveConfig?: boolean;
    configName?: string;
  }) => {
    setConnectingType('ssh');

    try {
      const connectionId = crypto.randomUUID();

      await window.qserial.connection.create({
        id: connectionId,
        name: `SSH ${options.username}@${options.host}`,
        type: ConnectionType.SSH,
        host: options.host,
        port: options.port,
        username: options.username,
        password: options.password,
        privateKey: options.privateKey,
        passphrase: options.passphrase,
        autoReconnect: true,
        reconnectInterval: 3000,
        reconnectAttempts: 5,
      });

      await connectWithCleanup(connectionId, `SSH ${options.host}`, ConnectionType.SSH, undefined, options.host);

      if (options.saveConfig && options.configName) {
        addSession({
          name: options.configName,
          type: 'ssh',
          sshConfig: {
            host: options.host,
            port: options.port,
            username: options.username,
            password: options.password,
            privateKey: options.privateKey,
            passphrase: options.passphrase,
          },
        });
      }
    } catch (error) {
      console.error('Failed to create SSH connection:', error);
      setConnectingType(null);
      setTimeout(() => alert('SSH 连接失败: ' + (error as Error).message), 0);
      return;
    }
    setConnectingType(null);
  };

  const handleTelnetConnect = async (options: {
    host: string;
    port: number;
    saveConfig?: boolean;
    configName?: string;
  }) => {
    setConnectingType('telnet');

    try {
      const connectionId = crypto.randomUUID();

      await window.qserial.connection.create({
        id: connectionId,
        name: `Telnet ${options.host}`,
        type: ConnectionType.TELNET,
        host: options.host,
        port: options.port,
        autoReconnect: true,
        reconnectInterval: 3000,
        reconnectAttempts: 5,
      });

      await connectWithCleanup(connectionId, `Telnet ${options.host}`, ConnectionType.TELNET, undefined, options.host);

      if (options.saveConfig && options.configName) {
        addSession({
          name: options.configName,
          type: 'telnet',
          telnetConfig: {
            host: options.host,
            port: options.port,
          },
        });
      }
    } catch (error) {
      console.error('Failed to create Telnet connection:', error);
      setConnectingType(null);
      setTimeout(() => alert('Telnet 连接失败: ' + (error as Error).message), 0);
      return;
    }
    setConnectingType(null);
  };

  // 右键菜单处理
  const handleContextMenu = (e: React.MouseEvent, session: SavedSession, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, session, index });
  };

  // 关闭右键菜单
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // 编辑配置
  const handleEditSession = (session: SavedSession) => {
    setEditingSession(session);
    closeContextMenu();
    switch (session.type) {
      case 'serial':
        setShowSerialDialog(true);
        break;
      case 'ssh':
        setShowSshDialog(true);
        break;
      case 'telnet':
        setShowTelnetDialog(true);
        break;
      case 'pty':
        setShowPtyDialog(true);
        break;
    }
  };

  // 更新串口配置
  const handleSerialUpdate = (options: {
    path: string;
    baudRate: number;
    dataBits: 5 | 6 | 7 | 8;
    stopBits: 1 | 2;
    parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
    saveConfig?: boolean;
    configName?: string;
  }) => {
    if (editingSession && options.saveConfig && options.configName) {
      updateSession(editingSession.id, {
        name: options.configName,
        serialConfig: {
          path: options.path,
          baudRate: options.baudRate,
          dataBits: options.dataBits,
          stopBits: options.stopBits,
          parity: options.parity,
        },
      });
    }
    handleSerialConnect(options);
    setEditingSession(null);
  };

  // 更新 SSH 配置
  const handleSshUpdate = (options: {
    host: string;
    port: number;
    username: string;
    password?: string;
    saveConfig?: boolean;
    configName?: string;
  }) => {
    if (editingSession && options.saveConfig && options.configName) {
      updateSession(editingSession.id, {
        name: options.configName,
        sshConfig: {
          host: options.host,
          port: options.port,
          username: options.username,
          password: options.password,
        },
      });
    }
    handleSshConnect(options);
    setEditingSession(null);
  };

  // 更新 Telnet 配置
  const handleTelnetUpdate = (options: {
    host: string;
    port: number;
    saveConfig?: boolean;
    configName?: string;
  }) => {
    if (editingSession && options.saveConfig && options.configName) {
      updateSession(editingSession.id, {
        name: options.configName,
        telnetConfig: {
          host: options.host,
          port: options.port,
        },
      });
    }
    handleTelnetConnect(options);
    setEditingSession(null);
  };

  // 更新 PTY 配置
  const handlePtyUpdate = (options: PtyConnectOptions & { saveConfig?: boolean; configName?: string }) => {
    if (editingSession && options.saveConfig && options.configName) {
      updateSession(editingSession.id, {
        name: options.configName,
        ptyConfig: {
          shell: options.shell,
          cwd: options.cwd,
        },
      });
    }
    handlePtyConnect(options);
    setEditingSession(null);
  };

  // 按钮类型配置映射（必须在所有 handler 函数之后定义）
  const buttonConfig: Record<SidebarButtonType, {
    icon: string;
    label: string;
    collapsedLabel: string;
    onClick: () => void;
    disabled: boolean;
    isService?: boolean;
  }> = {
    pty: {
      icon: '💻', label: connectingType === 'pty' ? '连接中...' : '本地终端',
      collapsedLabel: '本地终端',
      onClick: handleNewTerminal, disabled: connectingType === 'pty',
    },
    serial: {
      icon: '🔌', label: '串口连接',
      collapsedLabel: '串口连接',
      onClick: () => setShowSerialDialog(true), disabled: connectingType === 'serial',
    },
    ssh: {
      icon: '🌐', label: 'SSH',
      collapsedLabel: 'SSH 连接',
      onClick: handleNewSSH, disabled: connectingType === 'ssh',
    },
    telnet: {
      icon: '📡', label: 'Telnet',
      collapsedLabel: 'Telnet 连接',
      onClick: () => setShowTelnetDialog(true), disabled: connectingType === 'telnet',
    },
    tftp: {
      icon: '📁', label: 'TFTP',
      collapsedLabel: 'TFTP 服务器',
      onClick: () => setShowTftpDialog(true), disabled: false, isService: true,
    },
    nfs: {
      icon: '🗂️', label: 'NFS',
      collapsedLabel: 'NFS 服务器',
      onClick: () => setShowNfsDialog(true), disabled: false, isService: true,
    },
    ftp: {
      icon: '📤', label: 'FTP',
      collapsedLabel: 'FTP 服务器',
      onClick: () => setShowFtpDialog(true), disabled: false, isService: true,
    },
  };

  // 折叠状态下只显示图标按钮
  if (isCollapsed) {
    return (
      <div className="w-12 bg-surface border-r border-border flex flex-col items-center py-2 flex-shrink-0">
        {/* 展开按钮 */}
        <button
          onClick={() => setIsCollapsed(false)}
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-hover text-text-secondary transition-colors mb-2"
          title="展开侧边栏"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* 快捷操作图标 */}
        {sidebarButtons.map((btn) => {
          const config = buttonConfig[btn.type];
          return (
            <button
              key={btn.type}
              onClick={config.onClick}
              disabled={config.disabled}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-hover disabled:opacity-50 mb-1 text-text-secondary hover:text-text transition-colors text-sm"
              title={config.collapsedLabel}
            >
              {config.icon}
            </button>
          );
        })}

        {/* 对话框 */}
        <SerialConnectDialog
          isOpen={showSerialDialog}
          onClose={() => { setShowSerialDialog(false); setEditingSession(null); }}
          onConnect={editingSession ? handleSerialUpdate : handleSerialConnect}
          editSession={editingSession?.type === 'serial' ? editingSession : null}
        />
        <SshConnectDialog
          isOpen={showSshDialog}
          onClose={() => { setShowSshDialog(false); setEditingSession(null); }}
          onConnect={editingSession ? handleSshUpdate : handleSshConnect}
          editSession={editingSession?.type === 'ssh' ? editingSession : null}
        />
        <TelnetConnectDialog
          isOpen={showTelnetDialog}
          onClose={() => { setShowTelnetDialog(false); setEditingSession(null); }}
          onConnect={editingSession ? handleTelnetUpdate : handleTelnetConnect}
          editSession={editingSession?.type === 'telnet' ? editingSession : null}
        />
        <TftpDialog
          isOpen={showTftpDialog}
          onClose={() => setShowTftpDialog(false)}
        />
        <NfsDialog
          isOpen={showNfsDialog}
          onClose={() => setShowNfsDialog(false)}
        />
        <FtpDialog
          isOpen={showFtpDialog}
          onClose={() => setShowFtpDialog(false)}
        />
        <PtyConnectDialog
          isOpen={showPtyDialog}
          onClose={() => { setShowPtyDialog(false); setEditingSession(null); }}
          onConnect={editingSession ? handlePtyUpdate : handlePtyConnect}
          editSession={editingSession?.type === 'pty' ? editingSession : null}
        />

        {/* 右键菜单 */}
        {contextMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={closeContextMenu}
            />
            <div
              className="fixed z-50 bg-surface border border-border rounded shadow-lg py-1 min-w-[120px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                onClick={() => handleEditSession(contextMenu.session)}
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-hover"
              >
                编辑配置
              </button>
              <button
                onClick={() => {
                  removeSession(contextMenu.session.id);
                  closeContextMenu();
                }}
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-hover text-red-500"
              >
                删除配置
              </button>
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => {
                  if (reorderSessions && contextMenu.index > 0) {
                    reorderSessions(contextMenu.index, contextMenu.index - 1);
                  }
                  closeContextMenu();
                }}
                disabled={contextMenu.index === 0}
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed"
              >
                上移
              </button>
              <button
                onClick={() => {
                  if (reorderSessions && contextMenu.index < savedSessions.length - 1) {
                    reorderSessions(contextMenu.index, contextMenu.index + 1);
                  }
                  closeContextMenu();
                }}
                disabled={contextMenu.index === savedSessions.length - 1}
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed"
              >
                下移
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="w-[var(--sidebar-width)] bg-surface border-r border-border flex flex-col flex-shrink-0 relative">
      {/* 快捷操作 */}
      <div className="p-2 border-b border-border">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <h3 className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">新建连接</h3>
          <button
            onClick={() => setIsCollapsed(true)}
            className="w-4 h-4 flex items-center justify-center rounded hover:bg-hover text-text-secondary transition-colors"
            title="折叠侧边栏"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M7 1L3 5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {sidebarButtons.map((btn) => {
            const config = buttonConfig[btn.type];
            return (
              <button
                key={btn.type}
                onClick={config.onClick}
                disabled={config.disabled}
                className={`sidebar-btn flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-hover transition-colors text-left ${config.disabled ? 'opacity-50' : ''} group`}
                title={config.collapsedLabel}
              >
                <span className="text-sm flex-shrink-0">{config.icon}</span>
                <span className="text-xs truncate">{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 保存的会话列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <h3 className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">配置</h3>
        </div>
        {savedSessions.length === 0 ? (
          <div className="text-xs text-text-secondary px-2 py-3 text-center opacity-60">暂无保存的配置</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {savedSessions.map((session, index) => {
              const connected = isSessionConnected(session);
              return (
                <div
                  key={session.id}
                  className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                    connected ? 'bg-green-500/10 hover:bg-green-500/15' : 'hover:bg-hover'
                  }`}
                  onClick={() => handleQuickConnect(session)}
                  onContextMenu={(e) => handleContextMenu(e, session, index)}
                >
                  <span className="flex-shrink-0">
                    {connected ? (
                      <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-green-500">
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    ) : (
                      <span className="block w-3.5 h-3.5 rounded-full border border-border" />
                    )}
                  </span>
                  <span className={`flex-1 text-xs truncate ${connected ? 'text-green-400' : ''}`}>
                    {session.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded hover:bg-active text-text-secondary flex-shrink-0 transition-opacity"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                      <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 对话框 */}
      <SerialConnectDialog
        isOpen={showSerialDialog}
        onClose={() => { setShowSerialDialog(false); setEditingSession(null); }}
        onConnect={editingSession ? handleSerialUpdate : handleSerialConnect}
        editSession={editingSession?.type === 'serial' ? editingSession : null}
      />
      <SshConnectDialog
        isOpen={showSshDialog}
        onClose={() => { setShowSshDialog(false); setEditingSession(null); }}
        onConnect={editingSession ? handleSshUpdate : handleSshConnect}
        editSession={editingSession?.type === 'ssh' ? editingSession : null}
      />
      <TelnetConnectDialog
        isOpen={showTelnetDialog}
        onClose={() => { setShowTelnetDialog(false); setEditingSession(null); }}
        onConnect={editingSession ? handleTelnetUpdate : handleTelnetConnect}
        editSession={editingSession?.type === 'telnet' ? editingSession : null}
      />
      <TftpDialog
        isOpen={showTftpDialog}
        onClose={() => setShowTftpDialog(false)}
      />
      <NfsDialog
        isOpen={showNfsDialog}
        onClose={() => setShowNfsDialog(false)}
      />
      <FtpDialog
        isOpen={showFtpDialog}
        onClose={() => setShowFtpDialog(false)}
      />
      <PtyConnectDialog
        isOpen={showPtyDialog}
        onClose={() => { setShowPtyDialog(false); setEditingSession(null); }}
        onConnect={editingSession ? handlePtyUpdate : handlePtyConnect}
        editSession={editingSession?.type === 'pty' ? editingSession : null}
      />

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
          />
          <div
            className="fixed z-50 bg-surface border border-border rounded shadow-lg py-1 min-w-[120px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => handleEditSession(contextMenu.session)}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-hover"
            >
              编辑配置
            </button>
            <button
              onClick={() => {
                removeSession(contextMenu.session.id);
                closeContextMenu();
              }}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-hover text-red-500"
            >
              删除配置
            </button>
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => {
                if (reorderSessions && contextMenu.index > 0) {
                  reorderSessions(contextMenu.index, contextMenu.index - 1);
                }
                closeContextMenu();
              }}
              disabled={contextMenu.index === 0}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed"
            >
              上移
            </button>
            <button
              onClick={() => {
                if (reorderSessions && contextMenu.index < savedSessions.length - 1) {
                  reorderSessions(contextMenu.index, contextMenu.index + 1);
                }
                closeContextMenu();
              }}
              disabled={contextMenu.index === savedSessions.length - 1}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed"
            >
              下移
            </button>
          </div>
        </>
      )}

      {/* 拖拽调整宽度手柄 */}
      <div
        className="sidebar-resize-handle"
        onMouseDown={handleResizeStart}
      />
    </div>
  );
};
