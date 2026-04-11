/**
 * 侧边栏组件
 */

import React, { useState } from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { useSavedSessionsStore, type SavedSession } from '@/stores/sessions';
import { ConnectionType, ConnectionState } from '@qserial/shared';
import { SerialConnectDialog } from '../dialogs/SerialConnectDialog';
import { SettingsDialog } from '../dialogs/SettingsDialog';

export const Sidebar: React.FC = () => {
  const { createTab, createSession, sessions, closeSessionAndTab } = useTerminalStore();
  const { sessions: savedSessions, addSession, removeSession } = useSavedSessionsStore();
  const [isConnecting, setIsConnecting] = useState(false);
  const [showSerialDialog, setShowSerialDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

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

  const handleNewTerminal = async () => {
    if (isConnecting) return;
    setIsConnecting(true);

    try {
      const connectionId = crypto.randomUUID();

      await window.qserial.connection.create({
        id: connectionId,
        name: '本地终端',
        type: ConnectionType.PTY,
        shell: 'powershell.exe',
        cols: 80,
        rows: 24,
      });

      createTab('本地终端');
      createSession(connectionId, ConnectionType.PTY);
      await window.qserial.connection.open(connectionId);
    } catch (error) {
      console.error('Failed to create terminal:', error);
      alert('创建终端失败: ' + (error as Error).message);
    } finally {
      setIsConnecting(false);
    }
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
    setIsConnecting(true);

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

      createTab(`串口 ${options.path}`);
      createSession(connectionId, ConnectionType.SERIAL, options.path);
      await window.qserial.connection.open(connectionId);

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
      alert('创建串口连接失败: ' + (error as Error).message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleQuickConnect = async (savedSession: SavedSession) => {
    if (isConnecting || savedSession.type !== 'serial' || !savedSession.serialConfig) return;

    const config = savedSession.serialConfig;
    const activeSessionId = findActiveSerialSession(config.path);

    if (activeSessionId) {
      setIsConnecting(true);
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
        setIsConnecting(false);
      }
      return;
    }

    setIsConnecting(true);

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

      createTab(savedSession.name);
      createSession(connectionId, ConnectionType.SERIAL, config.path);
      await window.qserial.connection.open(connectionId);
    } catch (error) {
      console.error('Failed to quick connect:', error);
      alert('快速连接失败: ' + (error as Error).message);
    } finally {
      setIsConnecting(false);
    }
  };

  const isSessionConnected = (savedSession: SavedSession): boolean => {
    if (savedSession.type !== 'serial' || !savedSession.serialConfig) return false;
    return findActiveSerialSession(savedSession.serialConfig.path) !== null;
  };

  const handleNewSSH = () => {
    alert('SSH 连接功能开发中...');
  };

  // 折叠状态下只显示图标按钮
  if (isCollapsed) {
    return (
      <div className="w-12 bg-surface border-r border-border flex flex-col items-center py-2 flex-shrink-0">
        {/* 展开按钮 */}
        <button
          onClick={() => setIsCollapsed(false)}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-hover mb-2"
          title="展开侧边栏"
        >
          ▶
        </button>

        {/* 快捷操作图标 */}
        <button
          onClick={handleNewTerminal}
          disabled={isConnecting}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-hover disabled:opacity-50 mb-1"
          title="本地终端"
        >
          💻
        </button>
        <button
          onClick={() => setShowSerialDialog(true)}
          disabled={isConnecting}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-hover disabled:opacity-50 mb-1"
          title="串口连接"
        >
          🔌
        </button>
        <button
          onClick={handleNewSSH}
          disabled={isConnecting}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-hover disabled:opacity-50"
          title="SSH 连接"
        >
          🌐
        </button>

        {/* 底部设置 */}
        <div className="mt-auto">
          <button
            onClick={() => setShowSettingsDialog(true)}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-hover"
            title="设置"
          >
            ⚙️
          </button>
        </div>

        {/* 对话框 */}
        <SerialConnectDialog
          isOpen={showSerialDialog}
          onClose={() => setShowSerialDialog(false)}
          onConnect={handleSerialConnect}
        />
        <SettingsDialog
          isOpen={showSettingsDialog}
          onClose={() => setShowSettingsDialog(false)}
        />
      </div>
    );
  }

  return (
    <div className="w-[var(--sidebar-width)] bg-surface border-r border-border flex flex-col flex-shrink-0">
      {/* 快捷操作 */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs text-text-secondary">新建连接</h3>
          <button
            onClick={() => setIsCollapsed(true)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-hover text-text-secondary text-xs"
            title="折叠侧边栏"
          >
            ◀
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={handleNewTerminal}
            disabled={isConnecting}
            className="flex items-center gap-2 px-3 py-2 rounded hover:bg-hover transition-colors text-left disabled:opacity-50"
          >
            <span className="text-lg">💻</span>
            <span className="text-sm">{isConnecting ? '连接中...' : '本地终端'}</span>
          </button>
          <button
            onClick={() => setShowSerialDialog(true)}
            disabled={isConnecting}
            className="flex items-center gap-2 px-3 py-2 rounded hover:bg-hover transition-colors text-left disabled:opacity-50"
          >
            <span className="text-lg">🔌</span>
            <span className="text-sm">串口连接</span>
          </button>
          <button
            onClick={handleNewSSH}
            disabled={isConnecting}
            className="flex items-center gap-2 px-3 py-2 rounded hover:bg-hover transition-colors text-left disabled:opacity-50"
          >
            <span className="text-lg">🌐</span>
            <span className="text-sm">SSH 连接</span>
          </button>
        </div>
      </div>

      {/* 保存的会话列表 */}
      <div className="flex-1 overflow-y-auto p-3">
        <h3 className="text-xs text-text-secondary mb-2">保存的配置</h3>
        {savedSessions.length === 0 ? (
          <div className="text-sm text-text-secondary">暂无保存的配置</div>
        ) : (
          <div className="flex flex-col gap-1">
            {savedSessions.map((session) => {
              const connected = isSessionConnected(session);
              return (
                <div
                  key={session.id}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-hover cursor-pointer"
                  onClick={() => handleQuickConnect(session)}
                >
                  <span className="text-sm">{connected ? '🔌' : '○'}</span>
                  <span className={`flex-1 text-sm truncate ${connected ? 'text-green-500' : ''}`}>
                    {session.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-active text-text-secondary"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部设置 */}
      <div className="p-3 border-t border-border">
        <button
          onClick={() => setShowSettingsDialog(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-hover transition-colors"
        >
          <span>⚙️</span>
          <span className="text-sm">设置</span>
        </button>
      </div>

      {/* 对话框 */}
      <SerialConnectDialog
        isOpen={showSerialDialog}
        onClose={() => setShowSerialDialog(false)}
        onConnect={handleSerialConnect}
      />
      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      />
    </div>
  );
};
