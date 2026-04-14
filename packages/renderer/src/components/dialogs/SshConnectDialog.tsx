/**
 * SSH 连接对话框组件
 */

import React, { useState, useEffect } from 'react';
import type { SavedSession } from '@/stores/sessions';

interface SshConnectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (options: SshConnectOptions & { saveConfig?: boolean; configName?: string }) => void;
  editSession?: SavedSession | null;
}

export interface SshConnectOptions {
  host: string;
  port: number;
  username: string;
  password?: string;
}

export const SshConnectDialog: React.FC<SshConnectDialogProps> = ({
  isOpen,
  onClose,
  onConnect,
  editSession,
}) => {
  const [host, setHost] = useState('');
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saveConfig, setSaveConfig] = useState(false);
  const [configName, setConfigName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 编辑模式：加载已有配置
  useEffect(() => {
    if (editSession?.sshConfig) {
      setHost(editSession.sshConfig.host);
      setPort(editSession.sshConfig.port);
      setUsername(editSession.sshConfig.username);
      setPassword(editSession.sshConfig.password || '');
      setConfigName(editSession.name);
      setSaveConfig(true);
    }
  }, [editSession]);

  const handleConnect = () => {
    if (!host.trim()) {
      setError('请输入主机地址');
      return;
    }
    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }
    if (saveConfig && !configName.trim()) {
      setError('请输入配置名称');
      return;
    }

    onConnect({
      host: host.trim(),
      port,
      username: username.trim(),
      password: password || undefined,
      saveConfig,
      configName: configName.trim() || undefined,
    });

    // 重置表单
    setHost('');
    setUsername('');
    setPassword('');
    setSaveConfig(false);
    setConfigName('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl w-[400px] max-h-[90vh] overflow-auto">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium">{editSession ? '编辑 SSH 配置' : 'SSH 连接'}</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-hover"
          >
            ×
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4">
          {/* 主机和端口 */}
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

          {/* 用户名 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="登录用户名"
              className="w-full px-3 py-2 bg-surface border border-border rounded focus:outline-none focus:border-primary text-text"
            />
          </div>

          {/* 密码（可选） */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              密码 <span className="text-text-secondary/60">(可选，留空使用本地密钥)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="留空则使用 ~/.ssh 下的默认密钥"
              className="w-full px-3 py-2 bg-surface border border-border rounded focus:outline-none focus:border-primary text-text"
            />
          </div>

          {/* 保存配置 */}
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
                placeholder="输入配置名称，如：服务器A、树莓派..."
                className="w-full mt-2 px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-primary text-sm text-text"
              />
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}
        </div>

        {/* 底部按钮 */}
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
