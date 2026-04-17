/**
 * 设置对话框组件
 */

import React, { useState, useEffect } from 'react';
import { useThemeStore } from '@/stores/theme';
import { useConfigStore } from '@/stores/config';
import { useSavedSessionsStore } from '@/stores/sessions';
import { useQuickButtonsStore } from '@/stores/quickButtons';
import { useTftpStore } from '@/stores/tftp';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// 导出配置结构
interface ExportedConfig {
  version: string;
  exportedAt: string;
  theme: {
    themeId: string;
  };
  terminal: {
    fontSize: number;
    fontFamily: string;
    scrollback: number;
    copyOnSelect: boolean;
    rightClickPaste: boolean;
    bellStyle: string;
    enableWebLinks: boolean;
  };
  sessions: unknown[];
  quickButtons: unknown[];
  tftp: {
    port: number;
    rootDir: string;
  };
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const { currentTheme, themes, setTheme } = useThemeStore();
  const { config, updateConfig } = useConfigStore();
  const { sessions } = useSavedSessionsStore();
  const { groups } = useQuickButtonsStore();
  const { config: tftpConfig, updateConfig: updateTftpConfig } = useTftpStore();

  const [fontSize, setFontSize] = useState(config.terminal.fontSize);
  const [fontFamily, setFontFamily] = useState(config.terminal.fontFamily);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  // 同步 store 变化
  useEffect(() => {
    setFontSize(config.terminal.fontSize);
    setFontFamily(config.terminal.fontFamily);
  }, [config.terminal.fontSize, config.terminal.fontFamily]);

  if (!isOpen) return null;

  const handleSave = () => {
    updateConfig('terminal', {
      ...config.terminal,
      fontSize,
      fontFamily,
    });
    updateConfig('app', {
      ...config.app,
      uiFontFamily: fontFamily,
    });
    onClose();
  };

  const handleExport = async () => {
    try {
      const exportData: ExportedConfig = {
        version: '0.2.0',
        exportedAt: new Date().toISOString(),
        theme: {
          themeId: currentTheme.id,
        },
        terminal: config.terminal,
        sessions: sessions,
        quickButtons: groups,
        tftp: {
          port: tftpConfig.port,
          rootDir: tftpConfig.rootDir,
        },
      };
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qserial-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportSuccess(true);
      setImportError(null);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      setImportError(`导出失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleImport = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const text = await file.text();
        const data = JSON.parse(text) as ExportedConfig;
        if (!data.version) {
          throw new Error('无效的配置文件');
        }
        if (data.theme?.themeId) {
          setTheme(data.theme.themeId);
        }
        if (data.terminal) {
          updateConfig('terminal', data.terminal);
          setFontSize(data.terminal.fontSize);
          setFontFamily(data.terminal.fontFamily);
        }
        if (data.quickButtons && Array.isArray(data.quickButtons)) {
          useQuickButtonsStore.getState().importGroups(data.quickButtons);
        }
        if (data.tftp) {
          updateTftpConfig({ port: data.tftp.port, rootDir: data.tftp.rootDir });
        }
        setImportError(null);
      };
      input.click();
    } catch (err) {
      setImportError(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
      <div className="dialog-content bg-surface rounded-xl w-[520px] max-h-[90vh] overflow-hidden border border-white/5">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            <h2 className="text-base font-semibold">设置</h2>
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
        <div className="p-5 space-y-6 overflow-y-auto max-h-[calc(90vh-130px)]">
          {/* 外观设置 */}
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">外观</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">主题</label>
                <div className="grid grid-cols-2 gap-2">
                  {themes.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => setTheme(theme.id)}
                      className={`p-3 rounded-lg border text-left transition-all duration-150 ${
                        currentTheme.id === theme.id
                          ? 'border-primary ring-1 ring-primary/50 bg-primary/5'
                          : 'border-border hover:border-text-secondary/50 hover:bg-hover/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-4 h-4 rounded-full border border-border"
                          style={{ backgroundColor: theme.xterm.background }}
                        />
                        <span className="text-sm font-medium">{theme.name}</span>
                      </div>
                      <div className="flex gap-1">
                        {['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'].map((color) => (
                          <div
                            key={color}
                            className="w-3 h-3 rounded-sm"
                            style={{ backgroundColor: theme.xterm[color as keyof typeof theme.xterm] as string }}
                          />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 终端设置 */}
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">终端</h3>
            <div className="space-y-3">
              {/* 字体大小 */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  字体大小: {fontSize}px
                </label>
                <input
                  type="range"
                  min="10"
                  max="24"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full accent-[var(--color-primary)]"
                />
              </div>

              {/* 字体 */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">字体</label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="dialog-select"
                >
                  <option value="JetBrains Mono, Consolas, monospace">JetBrains Mono（推荐）</option>
                  <option value="Consolas, monospace">Consolas</option>
                  <option value="Monaco, monospace">Monaco</option>
                  <option value="Source Code Pro, monospace">Source Code Pro</option>
                  <option value="Fira Code, monospace">Fira Code（连字符）</option>
                </select>
              </div>
            </div>
          </div>

          {/* 配置导入导出 */}
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">配置管理</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={handleExport}
                  className="dialog-btn dialog-btn-secondary flex-1 flex items-center justify-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  导出配置
                </button>
                <button
                  onClick={handleImport}
                  className="dialog-btn dialog-btn-secondary flex-1 flex items-center justify-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  导入配置
                </button>
              </div>
              {exportSuccess && (
                <div className="flex items-center gap-2 text-sm text-success bg-success/10 border-l-2 border-success px-3 py-2.5 rounded-r-lg">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="flex-shrink-0">
                    <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm3.03 5.03a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 011.06-1.06L6 7.94l2.97-2.97a.75.75 0 011.06 0z"/>
                  </svg>
                  配置已导出
                </div>
              )}
              {importError && (
                <div className="flex items-center gap-2 text-sm text-error bg-error/10 border-l-2 border-error px-3 py-2.5 rounded-r-lg">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="flex-shrink-0">
                    <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM7.75 4v3.5a.75.75 0 01-1.5 0V4a.75.75 0 011.5 0z"/>
                  </svg>
                  导入失败: {importError}
                </div>
              )}
              <p className="text-xs text-text-secondary/70">
                导出配置包含：主题、终端设置、会话配置、快捷按钮、TFTP 配置
              </p>
            </div>
          </div>
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
            onClick={handleSave}
            className="dialog-btn dialog-btn-primary"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};
