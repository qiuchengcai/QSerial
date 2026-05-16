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
  const [localIp, setLocalIp] = useState('127.0.0.1');
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  const handleCopy = (label: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedLabel(label);
      setTimeout(() => setCopiedLabel(null), 1500);
    });
  };

  // 同步配置
  useEffect(() => {
    setLocalPort(config.port);
    setLocalRootDir(config.rootDir);
  }, [config]);

  // 加载状态和本机 IP
  useEffect(() => {
    if (isOpen) {
      loadStatus();
      window.qserial.getLocalIp().then(setLocalIp).catch(() => {});
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
      <div className="bg-surface rounded-xl shadow-md w-[500px] max-h-[85vh] flex flex-col border border-border/80">
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

        {/* 可滚动内容 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
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

          {/* 状态 + 操作 */}
          <div className="bg-background/40 rounded-lg border border-border/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-[9px] h-[9px] rounded-full flex-shrink-0 ${running ? 'bg-green-400 service-dot-active' : 'bg-text-secondary/20'}`}
                />
                <span className="text-sm font-medium">
                  {running ? '运行中' : '已停止'}
                </span>
              </div>
              {running && (
                <span className="text-xs text-text-secondary/60 font-mono">0.0.0.0:{config.port}</span>
              )}
            </div>
            <div className="flex gap-2">
              {running ? (
                <button
                  onClick={handleStop}
                  className="dialog-btn flex-1 bg-error text-white hover:bg-error/80 rounded-md text-sm"
                >
                  停止
                </button>
              ) : (
                <button
                  onClick={handleStart}
                  disabled={!localRootDir}
                  className="dialog-btn dialog-btn-primary flex-1 disabled:opacity-50 text-sm"
                >
                  启动
                </button>
              )}
            </div>
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

          {/* TFTP 命令指南（仅运行中显示） */}
          {running && (
            <div className="border border-primary/15 rounded-lg overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-primary/5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary flex-shrink-0">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span className="text-xs font-medium text-primary">设备命令</span>
              </div>
              <div className="divide-y divide-primary/10">
                <div className="p-1.5">
                  <div className="bg-background/70 border border-border/30 rounded-md overflow-hidden">
                    <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/20 bg-background/40">
                      <span className="text-[10px] text-text-secondary/40 font-mono">下载</span>
                      <button onClick={() => handleCopy('get', `tftp -g -r <filename> ${localIp}`)} className="text-[10px] text-primary hover:text-primary/80 transition-colors">{copiedLabel === 'get' ? '已复制' : '复制'}</button>
                    </div>
                    <div className="px-2.5 py-2 font-mono text-xs text-text">
                      <div className="leading-relaxed"><span className="text-text-secondary/40">$ </span>tftp -g -r <span className="text-warning/70">&lt;文件名&gt;</span> {localIp}</div>
                    </div>
                  </div>
                </div>
                <div className="p-1.5">
                  <div className="bg-background/70 border border-border/30 rounded-md overflow-hidden">
                    <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/20 bg-background/40">
                      <span className="text-[10px] text-text-secondary/40 font-mono">上传</span>
                      <button onClick={() => handleCopy('put', `tftp -p -l <localfile> ${localIp}`)} className="text-[10px] text-primary hover:text-primary/80 transition-colors">{copiedLabel === 'put' ? '已复制' : '复制'}</button>
                    </div>
                    <div className="px-2.5 py-2 font-mono text-xs text-text">
                      <div className="leading-relaxed"><span className="text-text-secondary/40">$ </span>tftp -p -l <span className="text-warning/70">&lt;本地文件&gt;</span> {localIp}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 传输列表 */}
          {running && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">传输记录</h4>
                {transfers.length > 0 && (
                  <button onClick={clearTransfers} className="text-xs text-text-secondary hover:text-text transition-colors">清空</button>
                )}
              </div>
              <div className="border border-border/50 rounded-lg bg-background/50 overflow-y-auto max-h-40" style={{ minHeight: transfers.length > 0 ? 'auto' : '56px' }}>
                {transfers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-1 py-2.5 text-text-secondary/30">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <span className="text-xs">暂无传输记录</span>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">{transfers.map((transfer) => (
                    <div key={transfer.id} className="p-2.5 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-text-secondary">
                            {transfer.direction === 'download' ? <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></> : <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>}
                          </svg>
                          <span className="truncate" title={transfer.file}>{transfer.file.split('/').pop()?.split('\\').pop() || transfer.file}</span>
                        </div>
                        <span className={`flex-shrink-0 text-xs ${getStatusColor(transfer.status)}`}>{getStatusText(transfer.status)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <span>{transfer.remoteAddress}</span>
                        {transfer.status === 'progress' && transfer.percent !== undefined && <><span>·</span><span className="text-primary font-medium">{transfer.percent.toFixed(0)}%</span><span>({formatSize(transfer.transferred)}/{formatSize(transfer.fileSize)})</span></>}
                        {transfer.status === 'completed' && transfer.fileSize && <><span>·</span><span>{formatSize(transfer.fileSize)}</span></>}
                        {transfer.error && <><span>·</span><span className="text-red-400">{transfer.error}</span></>}
                      </div>
                    </div>
                  ))}</div>
                )}
              </div>
            </div>
          )}

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
