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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-lg p-4 w-[480px] max-h-[80vh] flex flex-col">
        <h3 className="text-lg font-medium mb-4">TFTP 服务器</h3>

        <div className="space-y-4 flex-shrink-0">
          {/* 端口 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">端口</label>
            <input
              type="number"
              value={localPort}
              onChange={(e) => handlePortChange(e.target.value)}
              disabled={running}
              className="w-full px-3 py-2 bg-surface border border-border rounded focus:outline-none focus:border-primary disabled:opacity-50 text-text"
              min={1}
              max={65535}
            />
          </div>

          {/* 共享目录 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">共享目录</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={localRootDir}
                onChange={(e) => setLocalRootDir(e.target.value)}
                disabled={running}
                className="flex-1 px-3 py-2 bg-surface border border-border rounded focus:outline-none focus:border-primary disabled:opacity-50 text-text"
                placeholder="选择或输入目录路径"
              />
              <button
                onClick={handlePickDir}
                disabled={running}
                className="px-3 py-2 bg-surface border border-border rounded hover:bg-hover disabled:opacity-50 text-text"
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
            <div className="text-sm text-error bg-error/10 px-3 py-2 rounded">
              {error}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2">
            {running ? (
              <button
                onClick={handleStop}
                className="flex-1 px-4 py-2 bg-error text-white rounded hover:bg-error/80"
              >
                停止
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={!localRootDir}
                className="flex-1 px-4 py-2 bg-primary text-white rounded hover:bg-primary/80 disabled:opacity-50"
              >
                启动
              </button>
            )}
          </div>
        </div>

        {/* 传输列表 */}
        {running && (
          <div className="mt-4 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">传输记录</h4>
              {transfers.length > 0 && (
                <button
                  onClick={clearTransfers}
                  className="text-xs text-text-secondary hover:text-text"
                >
                  清空
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto border border-border rounded bg-background/50 max-h-48">
              {transfers.length === 0 ? (
                <div className="text-sm text-text-secondary p-4 text-center">
                  暂无传输记录
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {transfers.map((transfer) => (
                    <div key={transfer.id} className="p-2 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex-shrink-0">
                            {transfer.direction === 'download' ? '⬇️' : '⬆️'}
                          </span>
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
                            <span>•</span>
                            <span className="text-primary font-medium">{transfer.percent.toFixed(0)}%</span>
                            <span>({formatSize(transfer.transferred)}/{formatSize(transfer.fileSize)})</span>
                          </>
                        )}
                        {transfer.status === 'completed' && transfer.fileSize && (
                          <>
                            <span>•</span>
                            <span>{formatSize(transfer.fileSize)}</span>
                          </>
                        )}
                        {transfer.error && (
                          <>
                            <span>•</span>
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
        <div className="text-xs text-text-secondary mt-4 flex-shrink-0">
          <p>• TFTP 用于简单的文件传输，常用于嵌入式设备固件升级</p>
          <p>• 端口 69 需要 administrator 权限，可使用其他端口如 6969</p>
          <p>• 传输进度显示在终端上方的状态栏中</p>
        </div>

        {/* 关闭按钮 */}
        <div className="flex justify-end mt-4 pt-4 border-t border-border flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded hover:bg-hover">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
