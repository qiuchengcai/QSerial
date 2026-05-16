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
    starting,
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
  const [copied, setCopied] = useState(false);

  // 判断允许客户端的选择模式
  const presetClients = ['*', '192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12'];
  const isPresetClient = presetClients.includes(localAllowedClients);

  // 同步配置
  useEffect(() => {
    setLocalExportDir(config.exportDir);
    setLocalAllowedClients(config.allowedClients);
    setLocalOptions(config.options);
  }, [config]);

  // 加载状态（仅在对话框首次打开且服务不在启动/运行中时）
  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
      <div className="dialog-content bg-surface rounded-xl w-[480px] max-h-[80vh] flex flex-col border border-white/5">
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

        {/* 配置区域：运行时紧凑显示，停止时完整显示 */}
        <div className={`p-5 ${running ? 'pb-2' : ''} flex-shrink-0`}>
          {!running ? (
            /* 停止状态：完整配置表单 */
            <div className="space-y-4">
              {/* 共享目录 */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">共享目录</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={localExportDir}
                    onChange={(e) => setLocalExportDir(e.target.value)}
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

              {/* 允许的客户端 */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">允许的客户端</label>
                <select
                  value={isPresetClient ? localAllowedClients : '__custom__'}
                  onChange={(e) => setLocalAllowedClients(e.target.value === '__custom__' ? '' : e.target.value)}
                  className="dialog-input w-full appearance-none cursor-pointer"
                >
                  <option value="*">所有客户端</option>
                  <option value="192.168.0.0/16">192.168.0.0/16</option>
                  <option value="10.0.0.0/8">10.0.0.0/8</option>
                  <option value="172.16.0.0/12">172.16.0.0/12</option>
                  <option value="__custom__">指定 IP / 网段</option>
                </select>
                {!isPresetClient && (
                  <input
                    type="text"
                    value={localAllowedClients}
                    onChange={(e) => setLocalAllowedClients(e.target.value)}
                    className="dialog-input w-full mt-1.5"
                    placeholder="输入 IP 或网段，如 192.168.1.100 或 192.168.1.0/24"
                  />
                )}
              </div>

              {/* NFS 选项 */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">NFS 选项</label>
                <select
                  value={localOptions}
                  onChange={(e) => setLocalOptions(e.target.value)}
                  className="dialog-input w-full appearance-none cursor-pointer"
                >
                  <option value="rw,sync,no_subtree_check,no_root_squash">读写 (推荐，root 不映射)</option>
                  <option value="rw,sync,no_subtree_check,root_squash">读写 (root 映射为匿名)</option>
                  <option value="ro,sync,no_subtree_check,no_root_squash">只读 (root 不映射)</option>
                  <option value="ro,sync,no_subtree_check,root_squash">只读 (root 映射为匿名)</option>
                </select>
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
                  disabled={!localExportDir || starting}
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
                <span className="truncate" title={config.exportDir}>目录: {config.exportDir}</span>
                <span className="text-border">|</span>
                <span>客户端: {config.allowedClients === '*' ? '所有' : config.allowedClients}</span>
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

        {/* 运行时：挂载提示 + 客户端列表 */}
        {running && (
          <div className="px-5 pb-4 flex-1 min-h-0 flex flex-col space-y-3 overflow-y-auto">
            {/* 挂载提示 */}
            {mountHint && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg">
                {/* 标题栏 */}
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-primary/15">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary flex-shrink-0">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                  <span className="text-xs font-medium text-primary">设备连接指南</span>
                </div>

                {/* 步骤说明 */}
                <div className="px-3 pt-2.5 pb-1 space-y-1 text-xs text-text-secondary">
                  <p>1. 确保设备与本机在同一网络</p>
                  <p>2. 在设备终端执行以下命令：</p>
                </div>

                {/* 命令区域 */}
                <div className="px-3 pb-2.5">
                  <div className="bg-background/70 rounded-md">
                    <div className="flex items-center justify-between px-2.5 py-1 border-b border-white/5">
                      <span className="text-[10px] text-text-secondary/50 font-mono">SHELL</span>
                      <button
                        onClick={() => handleCopy(`mkdir -p /mnt/nfs\nmount -t nfs -o nolock ${mountHint.localIp}:${mountHint.exportDir} /mnt/nfs`)}
                        className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                      >
                        {copied ? '✓ 已复制' : '复制'}
                      </button>
                    </div>
                    <div className="px-2.5 py-2 font-mono text-xs text-text select-all">
                      <div className="leading-relaxed">$ mkdir -p /mnt/nfs</div>
                      <div className="leading-relaxed break-all">$ mount -t nfs -o nolock {mountHint.localIp}:{mountHint.exportDir} /mnt/nfs</div>
                    </div>
                  </div>
                </div>

                {/* 连接信息 */}
                <div className="border-t border-primary/15 px-3 py-2 space-y-1">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-text-secondary/60">本机 IP</span>
                    <span className="text-text font-mono">{mountHint.localIp}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-text-secondary/60">挂载路径</span>
                    <span className="text-text font-mono">/mnt/nfs</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-text-secondary/60">卸载命令</span>
                    <code className="text-text font-mono text-[11px]">umount /mnt/nfs</code>
                  </div>
                </div>

                {/* 使用提示 */}
                <div className="border-t border-primary/15 px-3 py-2 text-[11px] text-text-secondary/50">
                  NFS 适合大文件传输，IPC 设备常用 mount -t nfs -o nolock 挂载
                </div>
              </div>
            )}

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
                    {clients.map((client: { address: string; port?: number; mountedPath?: string; action: string; timestamp: number }, index: number) => (
                      <div key={index} className="p-2 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-text-secondary">
                              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                              <line x1="8" y1="21" x2="16" y2="21"/>
                              <line x1="12" y1="17" x2="12" y2="21"/>
                            </svg>
                            <span className="truncate">{client.address}</span>
                          </div>
                          <span className={`flex-shrink-0 text-xs ${client.action === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
                            {client.action === 'connected' ? '已连接' : '已断开'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
