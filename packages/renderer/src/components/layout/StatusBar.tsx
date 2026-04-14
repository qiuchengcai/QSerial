/**
 * 状态栏组件
 */

import React from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { useTftpStore } from '@/stores/tftp';
import { CONNECTION_STATE_NAMES } from '@qserial/shared';

export const StatusBar: React.FC = () => {
  const { tabs, activeTabId, sessions } = useTerminalStore();
  const { running: tftpRunning, transfers } = useTftpStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeSession = activeTab?.activeSessionId
    ? sessions[activeTab.activeSessionId]
    : null;

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
    <div className="h-[var(--statusbar-height)] bg-surface border-t border-border flex items-center justify-between px-3 text-xs flex-shrink-0">
      {/* 左侧信息 */}
      <div className="flex items-center gap-4 min-w-0">
        {activeSession && (
          <>
            <span className="text-text-secondary flex-shrink-0">
              {activeSession.connectionType.toUpperCase()}
            </span>
            <span
              className={
                activeSession.connectionState === 'connected'
                  ? 'text-success'
                  : activeSession.connectionState === 'error'
                  ? 'text-error'
                  : 'text-warning'
              }
            >
              {CONNECTION_STATE_NAMES[activeSession.connectionState]}
            </span>
            <span className="text-text-secondary flex-shrink-0">
              {activeSession.cols}x{activeSession.rows}
            </span>
          </>
        )}

        {/* TFTP 传输进度 */}
        {activeTransfer && (
          <div className="flex items-center gap-2 flex-shrink-0 ml-4 pl-4 border-l border-border">
            <span className="text-text-secondary text-xs">TFTP</span>
            <span className="flex-shrink-0">
              {activeTransfer.direction === 'download' ? '⬇️' : '⬆️'}
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
          <div className="flex items-center gap-1 flex-shrink-0 ml-4 pl-4 border-l border-border">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-text-secondary">TFTP</span>
          </div>
        )}
      </div>

      {/* 右侧信息 */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <span className="text-text-secondary">UTF-8</span>
        <span className="text-text-secondary">v0.1.0</span>
      </div>
    </div>
  );
};
