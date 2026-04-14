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
    if (saveConfig && !configName.trim()) {
      setError('请输入配置名称');
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl w-[400px] max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium">{editSession ? '编辑 Telnet 配置' : 'Telnet 连接'}</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-hover"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm text-text-secondary mb-1">主机</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="例如: 192.168.1.100"
                className="w-full px-3 py-2 bg-surface border border-border rounded focus:outline-none focus:border-primary text-text"
              />
            </div>
            <div className="w-20">
              <label className="block text-sm text-text-secondary mb-1">端口</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface border border-border rounded focus:outline-none focus:border-primary text-text"
              />
            </div>
          </div>

          <div className="p-3 bg-surface rounded border border-border">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveConfig}
                onChange={(e) => setSaveConfig(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">保存此配置</span>
            </label>
            {saveConfig && (
              <input
                type="text"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="输入配置名称..."
                className="w-full mt-2 px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-primary text-sm text-text"
              />
            )}
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded hover:bg-hover"
          >
            取消
          </button>
          <button
            onClick={handleConnect}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
          >
            {editSession ? '保存' : '连接'}
          </button>
        </div>
      </div>
    </div>
  );
};
