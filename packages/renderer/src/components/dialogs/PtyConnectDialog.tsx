/**
 * 本地终端连接对话框组件
 */

import React, { useState, useEffect } from 'react';
import { ConnectionType } from '@qserial/shared';
import type { SavedSession } from '@/stores/sessions';

interface PtyConnectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (options: PtyConnectOptions & { saveConfig?: boolean; configName?: string }) => void;
  editSession?: SavedSession | null;
}

export interface PtyConnectOptions {
  shell: string;
  cwd?: string;
}

const SHELL_OPTIONS = [
  { value: 'powershell.exe', label: 'PowerShell' },
  { value: 'cmd.exe', label: 'CMD' },
  { value: 'bash', label: 'Git Bash' },
  { value: 'wsl.exe', label: 'WSL' },
];

export const PtyConnectDialog: React.FC<PtyConnectDialogProps> = ({
  isOpen,
  onClose,
  onConnect,
  editSession,
}) => {
  const [shell, setShell] = useState<string>('powershell.exe');
  const [cwd, setCwd] = useState<string>('');
  const [saveConfig, setSaveConfig] = useState(false);
  const [configName, setConfigName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  // 编辑模式：加载已有配置
  useEffect(() => {
    if (editSession?.ptyConfig) {
      setShell(editSession.ptyConfig.shell);
      setCwd(editSession.ptyConfig.cwd || '');
      setConfigName(editSession.name);
      setSaveConfig(true);
    }
  }, [editSession]);

  const handlePickDir = async () => {
    const result = await window.qserial.tftp.pickDir();
    if (result) {
      setCwd(result);
    }
  };

  const handleConnect = () => {
    if (saveConfig && !configName.trim()) {
      setError('请输入配置名称');
      return;
    }

    onConnect({
      shell,
      cwd: cwd || undefined,
      saveConfig,
      configName: configName.trim() || undefined,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl w-[400px] max-h-[90vh] overflow-auto">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium">{editSession ? '编辑本地终端配置' : '本地终端'}</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-hover"
          >
            ×
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4">
          {/* Shell 选择 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">终端类型</label>
            <select
              value={shell}
              onChange={(e) => setShell(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded focus:outline-none focus:border-primary text-text"
            >
              {SHELL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 起始目录 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">起始目录（可选）</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="留空则使用默认目录"
                className="flex-1 px-3 py-2 bg-surface border border-border rounded focus:outline-none focus:border-primary text-text"
              />
              <button
                onClick={handlePickDir}
                className="px-3 py-2 bg-surface border border-border rounded hover:bg-hover text-text"
              >
                浏览
              </button>
            </div>
            <p className="text-xs text-text-secondary mt-1">
              设置终端启动时的工作目录
            </p>
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
                placeholder="输入配置名称，如：开发环境、Git..."
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
