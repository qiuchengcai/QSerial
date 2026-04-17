/**
 * TFTP 服务器配置对话框
 */

import React, { useEffect, useState } from 'react';
import { useTftpStore } from '@/stores/tftp';

interface TftpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TftpDialog: React.FC<TftpDialogProps> = ({ isOpen, onClose }) => {
  const {
    config,
    running,
    error,
    transfers,
    updateConfig,
    startServer,
    stopServer,
    loadStatus,
    clearTransfers,
  } = useTftpStore();
  const [localPort, setLocalPort] = useState(config.port);
  const [localRootDir, setLocalRootDir] = useState(config.rootDir);

  // 同步配置
  useEffect(() => {
    setLocalPort(config.port);
    setLocalRootDir(config.rootDir);
  }, [config]);

  // 加载状态
  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen, loadStatus]);

  const handlePickDir = async () => {
    const dir = await window.qserial.tftp.pickDir();
    if (dir) {
      setLocalRootDir(dir);
      updateConfig({ rootDir: dir });
    }
  };

  const handlePortChange = (value: string) => {
    const port = parseInt(value, 10);
    if (!isNaN(port) && port > 0 && port <= 65535) {
      setLocalPort(port);
      updateConfig({ port });
    }
  };

  const handleStart = async () => {
    updateConfig({ port: localPort, rootDir: localRootDir });
    await startServer();
  };

  const handleStop = async () => {
    await stopServer();
  };

  // 格式化文件大小
  const formatSize = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  // 获取状态颜色
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'started':
      case 'progress':
        return 'text-blue-400';
      case 'completed':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      case 'aborted':
        return 'text-yellow-400';
      default:
        return 'text-text-secondary';
    }
  };

  // 获取状态文本
  const getStatusText = (status: string): string => {
    switch (status) {
      case 'started':
        return '开始';
      case 'progress':
        return '传输中';
      case 'completed':
        return '完成';
      case 'error':
        return '错误';
      case 'aborted':
        return '中止';
      default:
        return status;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
      <div className="dialog-content bg-surface rounded-xl w-[480px] max-h-[80vh] flex flex-col border border-white/5">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
              <polyline points="13 2 13 9 20 9"/>
            </svg>
            <h3 className="text-base font-semibold">TFTP 服务器</h3>
          </div>
          <button
            onClick={onClose}
            className="dialog-close w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 1l12 12M13 1L1 13"/>
            </svg>
          </button>
        </div>

        <div className="space-y-4 flex-shrink-0 p-5">
          {/* 端口 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">端口</label>
            <input
              type="number"
              value={localPort}
              onChange={(e) => handlePortChange(e.target.value)}
              disabled={running}
              className="dialog-input"
              min={1}
              max={65535}
            />
          </div>

          {/* 共享目录 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">共享目录</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={localRootDir}
                onChange={(e) => setLocalRootDir(e.target.value)}
                disabled={running}
                className="dialog-input flex-1"
                placeholder="选择或输入目录路径"
              />
              <button
                onClick={handlePickDir}
                disabled={running}
                className="dialog-btn dialog-btn-secondary px-3 disabled:opacity-50"
              >
                浏览
              </button>
            </div>
          </div>

          {/* 状态 */}
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${running ? 'bg-green-500' : 'bg-gray-500'}`}
            />
            <span className="text-sm">
              {running ? `运行中 (${config.port})` : '已停止'}
            </span>
          </div>

          {/* 错误信息 */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-error bg-error/10 border-l-2 border-error px-3 py-2.5 rounded-r-lg">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="flex-shrink-0">
                <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM7.75 4v3.5a.75.75 0 01-1.5 0V4a.75.75 0 011.5 0z"/>
              </svg>
              {error}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2">
            {running ? (
              <button
                onClick={handleStop}
                className="dialog-btn flex-1 bg-error text-white hover:bg-error/80 rounded-md"
              >
                停止
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={!localRootDir}
                className="dialog-btn dialog-btn-primary flex-1 disabled:opacity-50"
              >
                启动
              </button>
            )}
          </div>
        </div>

        {/* 传输列表 */}
        {running && (
          <div className="px-5 pb-3 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">传输记录</h4>
              {transfers.length > 0 && (
                <button
                  onClick={clearTransfers}
                  className="text-xs text-text-secondary hover:text-text transition-colors"
                >
                  清空
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto border border-border/50 rounded-lg bg-background/50 max-h-48">
              {transfers.length === 0 ? (
                <div className="text-sm text-text-secondary/50 p-4 text-center">
                  暂无传输记录
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {transfers.map((transfer) => (
                    <div key={transfer.id} className="p-2.5 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-text-secondary">
                            {transfer.direction === 'download'
                              ? <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>
                              : <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>
                            }
                          </svg>
                          <span className="truncate" title={transfer.file}>
                            {transfer.file.split('/').pop()?.split('\\').pop() || transfer.file}
                          </span>
                        </div>
                        <span className={`flex-shrink-0 text-xs ${getStatusColor(transfer.status)}`}>
                          {getStatusText(transfer.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <span>{transfer.remoteAddress}</span>
                        {transfer.status === 'progress' && transfer.percent !== undefined && (
                          <>
                            <span>·</span>
                            <span className="text-primary font-medium">{transfer.percent.toFixed(0)}%</span>
                            <span>({formatSize(transfer.transferred)}/{formatSize(transfer.fileSize)})</span>
                          </>
                        )}
                        {transfer.status === 'completed' && transfer.fileSize && (
                          <>
                            <span>·</span>
                            <span>{formatSize(transfer.fileSize)}</span>
                          </>
                        )}
                        {transfer.error && (
                          <>
                            <span>·</span>
                            <span className="text-red-400">{transfer.error}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 提示 */}
        <div className="text-xs text-text-secondary/60 px-5 pb-2 flex-shrink-0 space-y-0.5">
          <p>· TFTP 用于简单的文件传输，常用于嵌入式设备固件升级</p>
          <p>· 端口 69 需要 administrator 权限，可使用其他端口如 6969</p>
          <p>· 传输进度显示在终端上方的状态栏中</p>
        </div>

        {/* 关闭按钮 */}
        <div className="flex justify-end px-5 py-4 border-t border-border bg-background/30 flex-shrink-0">
          <button onClick={onClose} className="dialog-btn dialog-btn-secondary">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
