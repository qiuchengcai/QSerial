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
  privateKey?: string;
  passphrase?: string;
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
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
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
      setPrivateKey(editSession.sshConfig.privateKey || '');
      setPassphrase(editSession.sshConfig.passphrase || '');
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
      privateKey: privateKey.trim() || undefined,
      passphrase: passphrase || undefined,
      saveConfig,
      configName: configName.trim() || undefined,
    });

    // 重置表单
    setHost('');
    setUsername('');
    setPassword('');
    setPrivateKey('');
    setPassphrase('');
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
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
              <path d="M7 9l3 3-3 3" strokeOpacity="0.6"/>
              <line x1="13" y1="15" x2="17" y2="15" strokeOpacity="0.6"/>
            </svg>
            <h2 className="text-base font-semibold">{editSession ? '编辑 SSH 配置' : 'SSH 连接'}</h2>
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

        {/* 内容 */}
        <div className="p-5 space-y-4">
          {/* 主机和端口 */}
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

          {/* 用户名 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="登录用户名"
              className="dialog-input"
            />
          </div>

          {/* 密码（可选） */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              密码 <span className="text-text-secondary/50 font-normal">(可选)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="留空则使用密钥认证"
              className="dialog-input"
            />
          </div>

          {/* 私钥文件（可选） */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              私钥文件 <span className="text-text-secondary/50 font-normal">(可选)</span>
            </label>
            <input
              type="text"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="如 ~/.ssh/id_ed25519，留空则自动尝试默认密钥"
              className="dialog-input"
            />
          </div>

          {/* 密钥密码（可选） */}
          {privateKey && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                密钥密码 <span className="text-text-secondary/50 font-normal">(可选)</span>
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="加密私钥的密码"
                className="dialog-input"
              />
            </div>
          )}

          {/* 保存配置 */}
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
                placeholder="配置名称，如：服务器A、树莓派..."
                className="dialog-input mt-2.5"
              />
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-error bg-error/10 border-l-2 border-error px-3 py-2.5 rounded-r-lg">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="flex-shrink-0">
                <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM7.75 4v3.5a.75.75 0 01-1.5 0V4a.75.75 0 011.5 0z"/>
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
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
