/**
 * Telnet 连接对话框组件
 */

import React, { useState, useEffect } from 'react';
import type { SavedSession } from '@/stores/sessions';

interface TelnetConnectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (options: TelnetConnectOptions & { saveConfig?: boolean; configName?: string }) => void;
  editSession?: SavedSession | null;
}

export interface TelnetConnectOptions {
  host: string;
  port: number;
}

export const TelnetConnectDialog: React.FC<TelnetConnectDialogProps> = ({
  isOpen,
  onClose,
  onConnect,
  editSession,
}) => {
  const [host, setHost] = useState('');
  const [port, setPort] = useState(23);
  const [saveConfig, setSaveConfig] = useState(false);
  const [configName, setConfigName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 编辑模式：加载已有配置
  useEffect(() => {
    if (editSession?.telnetConfig) {
      setHost(editSession.telnetConfig.host);
      setPort(editSession.telnetConfig.port);
      setConfigName(editSession.name);
      setSaveConfig(true);
    }
  }, [editSession]);

  const handleConnect = () => {
    if (!host.trim()) {
      setError('请输入主机地址');
      return;
    }
    onConnect({
      host: host.trim(),
      port,
      saveConfig,
      configName: configName.trim() || undefined,
    });

    setHost('');
    setSaveConfig(false);
    setConfigName('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
      <div className="dialog-content bg-surface rounded-xl w-[420px] max-h-[90vh] overflow-hidden border border-white/5">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z"/>
            </svg>
            <h2 className="text-base font-semibold">{editSession ? '编辑 Telnet 配置' : 'Telnet 连接'}</h2>
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

        <div className="p-5 space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-secondary mb-1.5">主机</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.100"
                className="dialog-input"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-text-secondary mb-1.5">端口</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="dialog-input"
              />
            </div>
          </div>

          <div className="p-3 bg-background/50 rounded-lg border border-border/50">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={saveConfig}
                onChange={(e) => setSaveConfig(e.target.checked)}
                className="dialog-checkbox"
              />
              <span className="text-sm">保存此配置</span>
            </label>
            {saveConfig && (
              <input
                type="text"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="配置名称..."
                className="dialog-input mt-2.5"
              />
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-error bg-error/10 border-l-2 border-error px-3 py-2.5 rounded-r-lg">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="flex-shrink-0">
                <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM7.75 4v3.5a.75.75 0 01-1.5 0V4a.75.75 0 011.5 0z"/>
              </svg>
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-border bg-background/30">
          <button
            onClick={onClose}
            className="dialog-btn dialog-btn-secondary"
          >
            取消
          </button>
          <button
            onClick={handleConnect}
            className="dialog-btn dialog-btn-primary"
          >
            {editSession ? '保存' : '连接'}
          </button>
        </div>
      </div>
    </div>
  );
};
