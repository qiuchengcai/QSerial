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

  // 导出配置
  const handleExport = () => {
    const exportData: ExportedConfig = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      theme: {
        themeId: currentTheme.id,
      },
      terminal: {
        fontSize: config.terminal.fontSize,
        fontFamily: config.terminal.fontFamily,
        scrollback: config.terminal.scrollback,
        copyOnSelect: config.terminal.copyOnSelect,
        rightClickPaste: config.terminal.rightClickPaste,
        bellStyle: config.terminal.bellStyle,
        enableWebLinks: config.terminal.enableWebLinks,
      },
      sessions: sessions,
      quickButtons: groups,
      tftp: {
        port: tftpConfig.port,
        rootDir: tftpConfig.rootDir,
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qserial-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 2000);
  };

  // 导入配置
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text) as ExportedConfig;

        // 验证版本
        if (!data.version) {
          throw new Error('无效的配置文件格式');
        }

        // 恢复主题
        if (data.theme?.themeId) {
          setTheme(data.theme.themeId);
        }

        // 恢复终端设置
        if (data.terminal) {
          updateConfig('terminal', {
            ...config.terminal,
            ...data.terminal,
          });
          updateConfig('app', {
            ...config.app,
            uiFontFamily: data.terminal.fontFamily,
          });
        }

        // 恢复会话配置
        if (data.sessions && Array.isArray(data.sessions)) {
          localStorage.setItem('qserial_saved_sessions', JSON.stringify({
            state: { sessions: data.sessions },
            version: 0,
          }));
        }

        // 恢复快捷按钮
        if (data.quickButtons && Array.isArray(data.quickButtons)) {
          localStorage.setItem('qserial-quick-buttons', JSON.stringify({
            state: { groups: data.quickButtons },
            version: 0,
          }));
        }

        // 恢复 TFTP 配置
        if (data.tftp) {
          updateTftpConfig(data.tftp);
        }

        setImportError(null);
        // 刷新页面以应用所有更改
        window.location.reload();
      } catch (error) {
        setImportError((error as Error).message);
      }
    };
    input.click();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl w-[500px] max-h-[90vh] overflow-auto">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium">设置</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-hover"
          >
            ×
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-6">
          {/* 外观设置 */}
          <div>
            <h3 className="text-sm font-medium mb-3 text-text-secondary">外观</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-text-secondary mb-2">主题</label>
                <div className="grid grid-cols-2 gap-2">
                  {themes.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => setTheme(theme.id)}
                      className={`p-3 rounded border text-left transition-colors ${
                        currentTheme.id === theme.id
                          ? 'border-primary ring-1 ring-primary'
                          : 'border-border hover:border-text-secondary'
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
            <h3 className="text-sm font-medium mb-3 text-text-secondary">终端</h3>
            <div className="space-y-3">
              {/* 字体大小 */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  字体大小: {fontSize}px
                </label>
                <input
                  type="range"
                  min="10"
                  max="24"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* 字体 */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">字体</label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded focus:outline-none focus:border-primary text-text"
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
            <h3 className="text-sm font-medium mb-3 text-text-secondary">配置管理</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={handleExport}
                  className="flex-1 px-4 py-2 bg-surface border border-border rounded hover:bg-hover transition-colors text-sm text-text"
                >
                  📤 导出配置
                </button>
                <button
                  onClick={handleImport}
                  className="flex-1 px-4 py-2 bg-surface border border-border rounded hover:bg-hover transition-colors text-sm text-text"
                >
                  📥 导入配置
                </button>
              </div>
              {exportSuccess && (
                <div className="text-sm text-success bg-success/10 px-3 py-2 rounded">
                  配置已导出
                </div>
              )}
              {importError && (
                <div className="text-sm text-error bg-error/10 px-3 py-2 rounded">
                  导入失败: {importError}
                </div>
              )}
              <p className="text-xs text-text-secondary">
                导出配置包含：主题、终端设置、会话配置、快捷按钮、TFTP 配置
              </p>
            </div>
          </div>
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
            onClick={handleSave}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};
