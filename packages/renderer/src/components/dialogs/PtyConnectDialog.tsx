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
    const result = await window.qserial.dialog.pickDir('选择本地终端起始目录');
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
    <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
      <div className="dialog-content bg-surface rounded-xl w-[420px] max-h-[90vh] overflow-hidden border border-white/5">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <polyline points="4 17 10 11 4 5"/>
              <line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            <h2 className="text-base font-semibold">{editSession ? '编辑本地终端配置' : '本地终端'}</h2>
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
          {/* Shell 选择 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">终端类型</label>
            <select
              value={shell}
              onChange={(e) => setShell(e.target.value)}
              className="dialog-select"
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
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              起始目录 <span className="text-text-secondary/50 font-normal">(可选)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="留空则使用默认目录"
                className="dialog-input flex-1"
              />
              <button
                onClick={handlePickDir}
                className="dialog-btn dialog-btn-secondary px-3"
              >
                浏览
              </button>
            </div>
          </div>

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
                placeholder="配置名称，如：开发环境、Git..."
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
