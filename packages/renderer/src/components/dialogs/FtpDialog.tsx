/**
 * FTP 服务器配置对话框
 */

import React, { useEffect, useState } from 'react';
import { useFtpStore } from '@/stores/ftp';

interface FtpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FtpDialog: React.FC<FtpDialogProps> = ({ isOpen, onClose }) => {
  const {
    config,
    running,
    starting,
    error,
    clients,
    transfers,
    updateConfig,
    startServer,
    stopServer,
    loadStatus,
    clearClients,
    clearTransfers,
  } = useFtpStore();
  const [localPort, setLocalPort] = useState(config.port);
  const [localRootDir, setLocalRootDir] = useState(config.rootDir);
  const [localUsername, setLocalUsername] = useState(config.username);
  const [localPassword, setLocalPassword] = useState(config.password);
  const [copied, setCopied] = useState('');
  const [localIp, setLocalIp] = useState('');

  // 获取本机 IP
  useEffect(() => {
    window.qserial.getLocalIp().then((ip) => setLocalIp(ip)).catch(() => {});
  }, [running]);
  useEffect(() => {
    setLocalPort(config.port);
    setLocalRootDir(config.rootDir);
    setLocalUsername(config.username);
    setLocalPassword(config.password);
  }, [config]);

  // 加载状态
  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePickDir = async () => {
    const dir = await window.qserial.ftp.pickDir();
    if (dir) {
      setLocalRootDir(dir);
      updateConfig({ rootDir: dir });
    }
  };

  const handleStart = async () => {
    updateConfig({
      port: localPort,
      rootDir: localRootDir,
      username: localUsername,
      password: localPassword,
    });
    await startServer();
  };

  const handleStop = async () => {
    await stopServer();
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    });
  };

  // 格式化文件大小
  const formatSize = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
      <div className="dialog-content bg-surface rounded-xl w-[480px] max-h-[80vh] flex flex-col border border-white/5">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <h3 className="text-base font-semibold">FTP 服务器</h3>
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

        {/* 配置区域：运行时紧凑显示，停止时完整显示 */}
        <div className={`p-5 ${running ? 'pb-2' : ''} flex-shrink-0`}>
          {!running ? (
            /* 停止状态：完整配置表单 */
            <div className="space-y-4">
              {/* 端口 */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">端口</label>
                <input
                  type="number"
                  value={localPort}
                  onChange={(e) => setLocalPort(parseInt(e.target.value) || 2121)}
                  disabled={starting}
                  className="dialog-input w-full disabled:opacity-50"
                  min={1}
                  max={65535}
                  placeholder="2121"
                />
                <p className="text-[10px] text-text-secondary/50 mt-1">端口 21 需要管理员权限，建议使用 2121</p>
              </div>

              {/* 共享目录 */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">共享目录</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={localRootDir}
                    onChange={(e) => setLocalRootDir(e.target.value)}
                    disabled={starting}
                    className="dialog-input flex-1 disabled:opacity-50"
                    placeholder="选择或输入目录路径"
                  />
                  <button
                    onClick={handlePickDir}
                    disabled={starting}
                    className="dialog-btn dialog-btn-secondary px-3 disabled:opacity-50"
                  >
                    浏览
                  </button>
                </div>
              </div>

              {/* 用户名 */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">用户名</label>
                <input
                  type="text"
                  value={localUsername}
                  onChange={(e) => setLocalUsername(e.target.value)}
                  disabled={starting}
                  className="dialog-input w-full disabled:opacity-50"
                  placeholder="anonymous（匿名访问）"
                />
              </div>

              {/* 密码 */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">密码</label>
                <input
                  type="password"
                  value={localPassword}
                  onChange={(e) => setLocalPassword(e.target.value)}
                  disabled={starting}
                  className="dialog-input w-full disabled:opacity-50"
                  placeholder="留空则不需要密码"
                />
              </div>

              {/* 状态 */}
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${starting ? 'bg-yellow-500 animate-pulse' : 'bg-gray-500'}`} />
                <span className="text-sm">
                  {starting ? '启动中...' : '已停止'}
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

              {/* 启动按钮 */}
              <div className="flex gap-2">
                <button
                  onClick={handleStart}
                  disabled={!localRootDir || starting}
                  className="dialog-btn dialog-btn-primary flex-1 disabled:opacity-50"
                >
                  {starting ? '启动中...' : '启动'}
                </button>
              </div>
            </div>
          ) : (
            /* 运行状态：紧凑信息栏 + 停止按钮 */
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">运行中</span>
                </div>
                <button
                  onClick={handleStop}
                  className="dialog-btn bg-error text-white hover:bg-error/80 rounded-md px-4"
                >
                  停止
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs text-text-secondary">
                <span>端口: {config.port}</span>
                <span className="text-border">|</span>
                <span className="truncate" title={config.rootDir}>目录: {config.rootDir}</span>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-sm text-error bg-error/10 border-l-2 border-error px-3 py-2 rounded-r-lg">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="flex-shrink-0">
                    <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM7.75 4v3.5a.75.75 0 01-1.5 0V4a.75.75 0 011.5 0z"/>
                  </svg>
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 运行时：连接提示 + 客户端列表 + 传输记录 */}
        {running && (
          <div className="px-5 pb-4 flex-1 min-h-0 flex flex-col space-y-3 overflow-y-auto">
            {/* 连接提示 */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg">
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-primary/15">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary flex-shrink-0">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
                <span className="text-xs font-medium text-primary">设备连接指南</span>
              </div>

              <div className="px-3 pt-2.5 pb-1 space-y-1 text-xs text-text-secondary">
                <p>1. 确保设备与本机在同一网络</p>
                <p>2. 在设备终端执行以下命令：</p>
              </div>

              <div className="px-3 pb-2.5">
                <div className="bg-background/70 rounded-md">
                  <div className="flex items-center justify-between px-2.5 py-1 border-b border-white/5">
                    <span className="text-[10px] text-text-secondary/50 font-mono">SHELL</span>
                    <button
                      onClick={() => handleCopy(
                        config.username === 'anonymous'
                          ? `ftp ${localIp || '<本机IP>'}`
                          : `ftp ${config.username}@${localIp || '<本机IP>'}`,
                        'cmd'
                      )}
                      className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                    >
                      {copied === 'cmd' ? '✓ 已复制' : '复制'}
                    </button>
                  </div>
                  <div className="px-2.5 py-2 font-mono text-xs text-text select-all">
                    <div className="leading-relaxed">
                      $ ftp {config.username === 'anonymous'
                        ? localIp || '&lt;本机IP&gt;'
                        : `${config.username}@${localIp || '<本机IP>'}`}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-primary/15 px-3 py-2 space-y-1">
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-text-secondary/60">本机 IP</span>
                  <span className="text-text font-mono cursor-pointer hover:text-primary transition-colors"
                    onClick={() => handleCopy(localIp || '', 'ip')}>
                    {localIp || '获取中...'}
                    {copied === 'ip' && <span className="ml-1 text-primary">✓</span>}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-text-secondary/60">端口</span>
                  <span className="text-text font-mono">{config.port}</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-text-secondary/60">认证</span>
                  <span className="text-text font-mono">{config.username === 'anonymous' ? '匿名' : config.username}</span>
                </div>
              </div>

              <div className="border-t border-primary/15 px-3 py-2 text-[11px] text-text-secondary/50">
                FTP 适合批量文件传输，支持目录浏览和断点续传
              </div>
            </div>

            {/* 客户端列表 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
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
              <div className="border border-border/50 rounded-lg bg-background/50 max-h-24 overflow-y-auto">
                {clients.length === 0 ? (
                  <div className="text-sm text-text-secondary/50 p-2.5 text-center">
                    等待客户端连接...
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {clients.map((client, index) => (
                      <div key={index} className="p-2 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-text-secondary">
                              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                              <line x1="8" y1="21" x2="16" y2="21"/>
                              <line x1="12" y1="17" x2="12" y2="21"/>
                            </svg>
                            <span className="truncate">{client.address}</span>
                            {client.userName && client.userName !== 'anonymous' && (
                              <span className="text-text-secondary text-xs">({client.userName})</span>
                            )}
                          </div>
                          <span className="flex-shrink-0 text-xs text-green-400">已连接</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 传输记录 */}
            {transfers.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">传输记录</h4>
                  <button
                    onClick={clearTransfers}
                    className="text-xs text-text-secondary hover:text-text transition-colors"
                  >
                    清空
                  </button>
                </div>
                <div className="border border-border/50 rounded-lg bg-background/50 max-h-32 overflow-y-auto">
                  <div className="divide-y divide-border/50">
                    {transfers.map((t) => (
                      <div key={t.id} className="p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={t.direction === 'download' ? 'text-green-400' : 'text-blue-400'}>
                              {t.direction === 'download' ? '↓' : '↑'}
                            </span>
                            <span className="truncate" title={t.file}>
                              {t.file.split('/').pop()?.split('\\').pop() || t.file}
                            </span>
                          </div>
                          <span className={`flex-shrink-0 ml-2 ${
                            t.status === 'completed' ? 'text-green-400' :
                            t.status === 'error' ? 'text-error' :
                            'text-text-secondary'
                          }`}>
                            {t.status === 'completed' ? '完成' :
                             t.status === 'error' ? '失败' :
                             t.status === 'progress' ? `${t.percent?.toFixed(0) ?? 0}%` :
                             t.status === 'started' ? '传输中' : t.status}
                          </span>
                        </div>
                        <div className="text-text-secondary/50 mt-0.5">
                          {t.remoteAddress} · {formatSize(t.fileSize)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

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
