/**
 * NFS 服务器配置对话框
 */

import React, { useEffect, useState } from 'react';
import { useNfsStore } from '@/stores/nfs';

interface NfsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NfsDialog: React.FC<NfsDialogProps> = ({ isOpen, onClose }) => {
  const {
    config,
    running,
    error,
    clients,
    mountHint,
    updateConfig,
    startServer,
    stopServer,
    loadStatus,
    clearClients,
  } = useNfsStore();
  const [localExportDir, setLocalExportDir] = useState(config.exportDir);
  const [localAllowedClients, setLocalAllowedClients] = useState(config.allowedClients);
  const [localOptions, setLocalOptions] = useState(config.options);

  // 同步配置
  useEffect(() => {
    setLocalExportDir(config.exportDir);
    setLocalAllowedClients(config.allowedClients);
    setLocalOptions(config.options);
  }, [config]);

  // 加载状态
  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen, loadStatus]);

  const handlePickDir = async () => {
    const dir = await window.qserial.nfs.pickDir();
    if (dir) {
      setLocalExportDir(dir);
      updateConfig({ exportDir: dir });
    }
  };

  const handleStart = async () => {
    updateConfig({
      exportDir: localExportDir,
      allowedClients: localAllowedClients,
      options: localOptions,
    });
    await startServer();
  };

  const handleStop = async () => {
    await stopServer();
  };

  // 获取客户端状态颜色
  const getClientColor = (action: string): string => {
    switch (action) {
      case 'connected':
        return 'text-green-400';
      case 'disconnected':
        return 'text-red-400';
      default:
        return 'text-text-secondary';
    }
  };

  // 获取客户端状态文本
  const getClientText = (action: string): string => {
    switch (action) {
      case 'connected':
        return '已连接';
      case 'disconnected':
        return '已断开';
      default:
        return action;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
      <div className="dialog-content bg-surface rounded-xl w-[520px] max-h-[80vh] flex flex-col border border-white/5">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            <h3 className="text-base font-semibold">NFS 服务器</h3>
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
          {/* 共享目录 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">共享目录</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={localExportDir}
                onChange={(e) => setLocalExportDir(e.target.value)}
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

          {/* 允许的客户端 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">允许的客户端</label>
            <input
              type="text"
              value={localAllowedClients}
              onChange={(e) => setLocalAllowedClients(e.target.value)}
              disabled={running}
              className="dialog-input w-full"
              placeholder="* 表示所有客户端，或指定 IP/网段 如 192.168.1.0/24"
            />
          </div>

          {/* NFS 选项 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">NFS 选项</label>
            <input
              type="text"
              value={localOptions}
              onChange={(e) => setLocalOptions(e.target.value)}
              disabled={running}
              className="dialog-input w-full"
              placeholder="rw,sync,no_subtree_check,no_root_squash"
            />
          </div>

          {/* 状态 */}
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${running ? 'bg-green-500' : 'bg-gray-500'}`}
            />
            <span className="text-sm">
              {running ? `运行中` : '已停止'}
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

          {/* 挂载提示 */}
          {running && mountHint && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <div className="text-xs font-medium text-primary mb-1.5">设备挂载命令</div>
              <code className="text-xs text-text bg-background/50 px-2 py-1 rounded block break-all">
                mount -t nfs -o nolock {mountHint.localIp}:{mountHint.exportDir} /mnt/nfs
              </code>
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
                disabled={!localExportDir}
                className="dialog-btn dialog-btn-primary flex-1 disabled:opacity-50"
              >
                启动
              </button>
            )}
          </div>
        </div>

        {/* 客户端列表 */}
        {running && (
          <div className="px-5 pb-3 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">客户端连接</h4>
              {clients.length > 0 && (
                <button
                  onClick={clearClients}
                  className="text-xs text-text-secondary hover:text-text transition-colors"
                >
                  清空
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto border border-border/50 rounded-lg bg-background/50 max-h-48">
              {clients.length === 0 ? (
                <div className="text-sm text-text-secondary/50 p-4 text-center">
                  等待客户端连接...
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {clients.map((client: { address: string; port?: number; mountedPath?: string; action: string; timestamp: number }, index: number) => (
                    <div key={index} className="p-2.5 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-text-secondary">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                            <line x1="8" y1="21" x2="16" y2="21"/>
                            <line x1="12" y1="17" x2="12" y2="21"/>
                          </svg>
                          <span className="truncate">{client.address}</span>
                        </div>
                        <span className={`flex-shrink-0 text-xs ${getClientColor(client.action)}`}>
                          {getClientText(client.action)}
                        </span>
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
          <p>· NFS 用于将本地目录共享给远程设备挂载，适合大文件传输</p>
          <p>· 需要系统已安装 nfs-kernel-server 并有 sudo 权限</p>
          <p>· IPC 设备常用 mount -t nfs -o nolock 挂载</p>
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
