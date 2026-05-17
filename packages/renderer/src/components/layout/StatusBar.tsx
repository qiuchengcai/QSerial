/**
 * 状态栏组件
 */

import React from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { useTftpStore } from '@/stores/tftp';
import { useNfsStore } from '@/stores/nfs';
import { useFtpStore } from '@/stores/ftp';
import { useMcpStore } from '@/stores/mcp';
import { useSftpStore } from '@/stores/sftp';
import { CONNECTION_STATE_NAMES, ConnectionType, ConnectionState } from '@qserial/shared';

export const StatusBar: React.FC = () => {
  const terminalState = useTerminalStore();
  const tabs = terminalState?.tabs || [];
  const activeTabId = terminalState?.activeTabId;
  const sessions = terminalState?.sessions || {};
  const { running: tftpRunning, transfers } = useTftpStore();
  const { running: nfsRunning } = useNfsStore();
  const { running: ftpRunning } = useFtpStore();
  const { running: mcpRunning } = useMcpStore();
  const { panelVisible, setPanelVisible, createSession, sessions: sftpSessions } = useSftpStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeSession = activeTab?.activeSessionId
    ? sessions[activeTab.activeSessionId]
    : null;

  // 判断当前活动会话是否为 SSH 且已连接
  const isSshConnected = activeSession?.connectionType === ConnectionType.SSH &&
    activeSession.connectionState === ConnectionState.CONNECTED;

  // 打开 SFTP 面板
  const handleOpenSftp = async () => {
    if (!activeSession) return;

    // 检查是否已有该连接的 SFTP 会话
    const existingSession = Object.values(sftpSessions).find(
      (s) => s.connectionId === activeSession.connectionId
    );

    if (existingSession) {
      setPanelVisible(true);
      useSftpStore.getState().setActiveSession(existingSession.sftpId);
    } else {
      await createSession(activeSession.connectionId);
    }
  };

  // 获取正在进行的传输
  const activeTransfer = transfers.find(
    (t) => t.status === 'started' || t.status === 'progress'
  );

  // 格式化文件大小
  const formatSize = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <div className="h-[var(--statusbar-height)] bg-surface border-t border-border flex items-center justify-between px-3.5 text-[11px] flex-shrink-0 statusbar-glow">
      {/* 左侧信息 */}
      <div className="flex items-center gap-3 min-w-0">
        {!activeSession && (
          <span className="text-text-tertiary/60 truncate">未连接</span>
        )}
        {activeSession && (
          <>
            {/* 连接状态指示点 */}
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              activeSession.connectionState === 'connected' ? 'bg-success' :
              activeSession.connectionState === 'error' ? 'bg-error' : 'bg-warning'
            }`} />
            <span className={
              activeSession.connectionState === 'connected'
                ? 'text-success'
                : activeSession.connectionState === 'error'
                ? 'text-error'
                : 'text-warning'
            }>
              {CONNECTION_STATE_NAMES[activeSession.connectionState]}
            </span>
            <span className="w-px h-3.5 bg-border flex-shrink-0" />
            <span className="text-text-secondary flex-shrink-0 font-mono">
              {activeSession.connectionType === 'ssh' || activeSession.connectionType === 'telnet'
                ? (activeSession as any).host || ''
                : (activeSession as any).port || ''}
            </span>
            <span className="text-text-secondary/60 flex-shrink-0 font-mono">
              {activeSession.connectionType === 'ssh' ? ':22' :
               activeSession.connectionType === 'telnet' ? ':23' : ''}
            </span>
            <span className="w-px h-3.5 bg-border flex-shrink-0" />
            <span className="text-text-secondary/60 flex-shrink-0 font-mono">
              {activeSession.connectionType.toUpperCase()}
            </span>
            <span className="w-px h-3.5 bg-border flex-shrink-0" />
            <span className="text-text-secondary/60 flex-shrink-0">
              {activeSession.cols} x {activeSession.rows}
            </span>
          </>
        )}

        {/* TFTP 传输进度 */}
        {activeTransfer && (
          <div className="flex items-center gap-2 flex-shrink-0 ml-4 pl-4 border-l border-border">
            <span className="text-text-secondary text-xs">TFTP</span>
            <span className="flex-shrink-0">
              {activeTransfer.direction === 'download' ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v8M3 6l3 3 3-3" stroke="var(--color-primary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9V1M3 4l3-3 3 3" stroke="var(--color-primary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </span>
            <span className="truncate max-w-[100px]" title={activeTransfer.file}>
              {activeTransfer.file.split('/').pop()?.split('\\').pop() || activeTransfer.file}
            </span>
            <span className="text-primary font-medium">
              {activeTransfer.percent?.toFixed(0) ?? 0}%
            </span>
            {/* 进度条 */}
            <div className="w-16 h-1.5 bg-border rounded overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${Math.min(activeTransfer.percent ?? 0, 100)}%` }}
              />
            </div>
            <span className="text-text-secondary text-xs">
              {formatSize(activeTransfer.transferred)}/{formatSize(activeTransfer.fileSize)}
            </span>
          </div>
        )}

        {/* TFTP 服务器状态 */}
        {tftpRunning && !activeTransfer && (
          <div
            className="flex items-center gap-1 flex-shrink-0 ml-4 pl-4 border-l border-border cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-tftp'))}
            title="TFTP 服务器运行中 — 点击打开"
          >
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-text-secondary">TFTP</span>
          </div>
        )}

        {/* NFS 服务器状态 */}
        {nfsRunning && (
          <div
            className="flex items-center gap-1 flex-shrink-0 ml-4 pl-4 border-l border-border cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-nfs'))}
            title="NFS 服务器运行中 — 点击打开"
          >
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-text-secondary">NFS</span>
          </div>
        )}

        {/* FTP 服务器状态 */}
        {ftpRunning && (
          <div
            className="flex items-center gap-1 flex-shrink-0 ml-4 pl-4 border-l border-border cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-ftp'))}
            title="FTP 服务器运行中 — 点击打开"
          >
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-text-secondary">FTP</span>
          </div>
        )}

        {/* MCP 服务器状态 */}
        {mcpRunning && (
          <div
            className="flex items-center gap-1 flex-shrink-0 ml-4 pl-4 border-l border-border cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-mcp'))}
            title="MCP 服务器运行中 — 点击打开"
          >
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-text-secondary">MCP</span>
          </div>
        )}
      </div>

      {/* 右侧信息 */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* SFTP 文件浏览器按钮 */}
        {isSshConnected && (
          <button
            onClick={handleOpenSftp}
            className={`flex items-center gap-1 px-2 py-0.5 rounded hover:bg-hover transition-colors ${
              panelVisible ? 'bg-hover text-success' : 'text-text-secondary/60'
            }`}
            title="打开 SFTP 文件浏览器"
          >
            <span className="text-[11px] tracking-wide">文件</span>
          </button>
        )}
        <button
          className="text-text-secondary/60 hover:text-text-secondary px-2 py-0.5 rounded hover:bg-hover transition-colors text-[11px] tracking-wide"
          onClick={() => window.dispatchEvent(new CustomEvent('qserial:open-share'))}
        >
          共享
        </button>
        <span className="w-px h-3.5 bg-border flex-shrink-0" />
        <span className="text-text-secondary/60">v0.2.0</span>
      </div>
    </div>
  );
};
