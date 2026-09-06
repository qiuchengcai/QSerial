/**
 * 设置对话框组件 — 侧边导航 + 内容双栏布局
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/stores/theme';
import { useConfigStore } from '@/stores/config';
import { useSavedSessionsStore, type SavedSession } from '@/stores/sessions';
import { useQuickButtonsStore } from '@/stores/quickButtons';
import { useTftpStore } from '@/stores/tftp';
import { useNfsStore } from '@/stores/nfs';
import { useFtpStore } from '@/stores/ftp';
import { usePluginsStore } from '@/stores/plugins';
import { PluginDetailDialog } from './PluginDetailDialog';
import type { AppConfig, Theme, PluginInfo } from '@qserial/shared';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ExportedConfig {
  version: string;
  exportedAt: string;
  theme: { themeId: string };
  config: AppConfig;
  sessions: unknown[];
  quickButtons: unknown[];
  tftp?: { port: number; rootDir: string; autoStart: boolean };
  nfs?: { exportDir: string; allowedClients: string; options: string; autoStart: boolean };
  ftp?: { port: number; rootDir: string; username: string; password: string; autoStart: boolean };
}

type SectionId = 'appearance' | 'behavior' | 'terminal' | 'manage' | 'plugins';

const SECTIONS: SectionId[] = ['appearance', 'behavior', 'terminal', 'manage', 'plugins'];

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { currentTheme, themes, setTheme } = useThemeStore();
  const { config, updateConfig } = useConfigStore();
  const savedSessionsState = useSavedSessionsStore();
  const sessions = savedSessionsState?.sessions || [];
  const quickButtonsState = useQuickButtonsStore();
  const groups = quickButtonsState?.groups || [];
  const tftpConfig = useTftpStore((s) => s.config);
  const nfsConfig = useNfsStore((s) => s.config);
  const ftpConfig = useFtpStore((s) => s.config);
  const pluginsState = usePluginsStore();
  const plugins = pluginsState?.plugins || [];
  const pluginsBusy = pluginsState?.busy ?? null;
  const pluginsPendingId = pluginsState?.pendingId ?? null;
  const pluginsError = pluginsState?.error ?? null;

  const [activeSection, setActiveSection] = useState<SectionId>('appearance');
  const [confirmUninstallId, setConfirmUninstallId] = useState<string | null>(null);

  // ── 本地编辑状态 ──
  const [fontSize, setFontSize] = useState(config.terminal.fontSize);
  const [fontFamily, setFontFamily] = useState(config.terminal.fontFamily);
  const [scrollback, setScrollback] = useState(config.terminal.scrollback);
  const [autoReconnect, setAutoReconnect] = useState(config.terminal.autoReconnect);
  const [reconnectInterval, setReconnectInterval] = useState(config.terminal.reconnectInterval);
  const [reconnectAttempts, setReconnectAttempts] = useState(config.terminal.reconnectAttempts);
  const [bellStyle, setBellStyle] = useState(config.terminal.bellStyle);
  const [copyOnSelect, setCopyOnSelect] = useState(config.terminal.copyOnSelect);
  const [rightClickPaste, setRightClickPaste] = useState(config.terminal.rightClickPaste);
  const [enableWebLinks, setEnableWebLinks] = useState(config.terminal.enableWebLinks);

  const [uiFontFamily, setUiFontFamily] = useState(config.app.uiFontFamily);
  const [language, setLanguage] = useState(config.app.language);
  const [autoUpdate, setAutoUpdate] = useState(config.app.autoUpdate);
  const [minimizeToTray, setMinimizeToTray] = useState(config.app.minimizeToTray);
  const [closeToTray, setCloseToTray] = useState(config.app.closeToTray);

  const [importError, setImportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  // 打开设置时加载插件列表
  useEffect(() => {
    if (isOpen) {
      usePluginsStore
        .getState()
        .load()
        .catch(() => {});
    }
  }, [isOpen]);

  // 同步 store → local state
  useEffect(() => {
    const c = config;
    setFontSize(c.terminal.fontSize);
    setFontFamily(c.terminal.fontFamily);
    setScrollback(c.terminal.scrollback);
    setAutoReconnect(c.terminal.autoReconnect);
    setReconnectInterval(c.terminal.reconnectInterval);
    setReconnectAttempts(c.terminal.reconnectAttempts);
    setBellStyle(c.terminal.bellStyle);
    setCopyOnSelect(c.terminal.copyOnSelect);
    setRightClickPaste(c.terminal.rightClickPaste);
    setEnableWebLinks(c.terminal.enableWebLinks);
    setUiFontFamily(c.app.uiFontFamily);
    setLanguage(c.app.language);
    setAutoUpdate(c.app.autoUpdate);
    setMinimizeToTray(c.app.minimizeToTray);
    setCloseToTray(c.app.closeToTray);
  }, [config]);

  if (!isOpen) return null;

  const handleSave = () => {
    updateConfig('terminal', {
      ...config.terminal,
      fontSize,
      fontFamily,
      scrollback,
      autoReconnect,
      reconnectInterval,
      reconnectAttempts,
      bellStyle,
      copyOnSelect,
      rightClickPaste,
      enableWebLinks,
    });
    updateConfig('app', {
      ...config.app,
      uiFontFamily,
      language,
      autoUpdate,
      minimizeToTray,
      closeToTray,
    });
    onClose();
  };

  const handleExport = async () => {
    try {
      const exportData: ExportedConfig = {
        version: '0.3.0',
        exportedAt: new Date().toISOString(),
        theme: { themeId: currentTheme.id },
        config: config,
        sessions,
        quickButtons: groups,
        tftp: tftpConfig,
        nfs: nfsConfig,
        ftp: ftpConfig,
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
      setImportError(
        t('dialogs.settings.exportFailed', {
          message: err instanceof Error ? err.message : String(err),
        })
      );
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
        const data = JSON.parse(text);
        if (!data.version) throw new Error(t('dialogs.settings.invalidConfigFile'));

        if (data.theme?.themeId) setTheme(data.theme.themeId);

        if (data.config) {
          const c = data.config as AppConfig;
          if (c.app) updateConfig('app', { ...config.app, ...c.app });
          if (c.terminal) updateConfig('terminal', { ...config.terminal, ...c.terminal });
        } else if (data.terminal) {
          updateConfig('terminal', { ...config.terminal, ...data.terminal });
        }

        if (data.quickButtons && Array.isArray(data.quickButtons)) {
          useQuickButtonsStore.getState().importGroups(data.quickButtons);
        }
        if (data.sessions && Array.isArray(data.sessions)) {
          useSavedSessionsStore.getState().importSessions(data.sessions as SavedSession[]);
        }
        if (data.tftp) {
          useTftpStore.getState().updateConfig(data.tftp);
        }
        if (data.nfs) {
          useNfsStore.getState().updateConfig(data.nfs);
        }
        if (data.ftp) {
          useFtpStore.getState().updateConfig(data.ftp);
        }
        setImportError(null);
      };
      input.click();
    } catch (err) {
      setImportError(
        t('dialogs.settings.importFailed', {
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  };

  // ── 工具组件 ──
  const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
    <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
      {title}
    </h3>
  );

  const Toggle: React.FC<{
    label: string;
    hint?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }> = ({ label, hint, checked, onChange }) => (
    <div className="flex items-center justify-between">
      <div>
        <label className="text-xs font-medium text-text">{label}</label>
        {hint && <p className="text-[11px] text-text-secondary mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-[var(--color-primary)]' : 'bg-border'}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[4px]'}`}
        />
      </button>
    </div>
  );

  const Select: React.FC<{
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
  }> = ({ label, value, onChange, options }) => (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="dialog-select">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  const NumberInput: React.FC<{
    label: string;
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
  }> = ({ label, value, onChange, min, max }) => (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="dialog-input w-24"
      />
    </div>
  );

  // ── 渲染当前 section 内容 ──
  const renderSection = () => {
    switch (activeSection) {
      case 'appearance':
        return (
          <div className="space-y-4">
            <SectionTitle title={t('dialogs.settings.appearance')} />
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                {t('dialogs.settings.theme')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {themes.map((theme: Theme) => (
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
                      <span className="text-[10px] text-text-secondary">
                        {theme.type === 'dark'
                          ? t('dialogs.settings.dark')
                          : t('dialogs.settings.light')}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'].map((color) => (
                        <div
                          key={color}
                          className="w-3 h-3 rounded-sm"
                          style={{
                            backgroundColor: theme.xterm[
                              color as keyof typeof theme.xterm
                            ] as string,
                          }}
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <Select
              label={t('dialogs.settings.uiFont')}
              value={uiFontFamily}
              onChange={setUiFontFamily}
              options={[
                {
                  value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  label: t('dialogs.settings.systemDefault'),
                },
                {
                  value: '"Microsoft YaHei", "PingFang SC", sans-serif',
                  label: t('dialogs.settings.msYahei'),
                },
                {
                  value: '"Source Han Sans CN", "Noto Sans SC", sans-serif',
                  label: t('dialogs.settings.sourceHan'),
                },
              ]}
            />
            <Select
              label={t('dialogs.settings.language')}
              value={language}
              onChange={setLanguage}
              options={[
                { value: 'zh-CN', label: '简体中文' },
                { value: 'en-US', label: 'English' },
              ]}
            />
          </div>
        );

      case 'behavior':
        return (
          <div className="space-y-4">
            <SectionTitle title={t('dialogs.settings.behavior')} />
            <Toggle
              label={t('dialogs.settings.autoUpdate')}
              checked={autoUpdate}
              onChange={setAutoUpdate}
            />
            <Toggle
              label={t('dialogs.settings.minimizeToTray')}
              hint={t('dialogs.settings.minimizeHint')}
              checked={minimizeToTray}
              onChange={setMinimizeToTray}
            />
            <Toggle
              label={t('dialogs.settings.closeToTray')}
              hint={t('dialogs.settings.closeHint')}
              checked={closeToTray}
              onChange={setCloseToTray}
            />
          </div>
        );

      case 'terminal':
        return (
          <div className="space-y-4">
            <SectionTitle title={t('dialogs.settings.terminal')} />
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                {t('dialogs.settings.fontSizeLabel', { size: fontSize })}
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
            <Select
              label={t('dialogs.settings.font')}
              value={fontFamily}
              onChange={setFontFamily}
              options={[
                {
                  value: 'JetBrains Mono, Consolas, monospace',
                  label: t('dialogs.settings.jetbrainsMono'),
                },
                { value: 'Consolas, monospace', label: 'Consolas' },
                { value: 'Monaco, monospace', label: 'Monaco' },
                { value: 'Source Code Pro, monospace', label: 'Source Code Pro' },
                { value: 'Fira Code, monospace', label: t('dialogs.settings.firaCode') },
              ]}
            />
            <NumberInput
              label={t('dialogs.settings.scrollback')}
              value={scrollback}
              onChange={setScrollback}
              min={100}
              max={100000}
            />
            <Toggle
              label={t('dialogs.settings.copyOnSelect')}
              checked={copyOnSelect}
              onChange={setCopyOnSelect}
            />
            <Toggle
              label={t('dialogs.settings.rightClickPaste')}
              checked={rightClickPaste}
              onChange={setRightClickPaste}
            />
            <Toggle
              label={t('dialogs.settings.enableLinks')}
              hint={t('dialogs.settings.linksHint')}
              checked={enableWebLinks}
              onChange={setEnableWebLinks}
            />
            <Select
              label={t('dialogs.settings.bell')}
              value={bellStyle}
              onChange={setBellStyle}
              options={[
                { value: 'none', label: t('dialogs.settings.bellNone') },
                { value: 'sound', label: t('dialogs.settings.bellSound') },
                { value: 'visual', label: t('dialogs.settings.bellVisual') },
              ]}
            />
            <Toggle
              label={t('dialogs.settings.autoReconnect')}
              hint={t('dialogs.settings.reconnectHint')}
              checked={autoReconnect}
              onChange={setAutoReconnect}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberInput
                label={t('dialogs.settings.reconnectInterval')}
                value={reconnectInterval}
                onChange={setReconnectInterval}
                min={1000}
                max={30000}
              />
              <NumberInput
                label={t('dialogs.settings.maxReconnect')}
                value={reconnectAttempts}
                onChange={setReconnectAttempts}
                min={1}
                max={100}
              />
            </div>
          </div>
        );

      case 'manage':
        return (
          <div className="space-y-4">
            <SectionTitle title={t('dialogs.settings.manage')} />
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                id="settings-export-btn"
                className="dialog-btn dialog-btn-secondary flex-1 flex items-center justify-center gap-2"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {t('dialogs.settings.exportConfig')}
              </button>
              <button
                onClick={handleImport}
                id="settings-import-btn"
                className="dialog-btn dialog-btn-secondary flex-1 flex items-center justify-center gap-2"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {t('dialogs.settings.importConfig')}
              </button>
            </div>
            {exportSuccess && (
              <div className="flex items-center gap-2 text-sm text-success bg-success/10 border-l-2 border-success px-3 py-2.5 rounded-r-lg">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="currentColor"
                  className="flex-shrink-0"
                >
                  <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm3.03 5.03a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 011.06-1.06L6 7.94l2.97-2.97a.75.75 0 011.06 0z" />
                </svg>
                {t('dialogs.settings.exported')}
              </div>
            )}
            {importError && (
              <div className="flex items-center gap-2 text-sm text-error bg-error/10 border-l-2 border-error px-3 py-2.5 rounded-r-lg">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="currentColor"
                  className="flex-shrink-0"
                >
                  <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM7.75 4v3.5a.75.75 0 01-1.5 0V4a.75.75 0 011.5 0z" />
                </svg>
                {importError}
              </div>
            )}
            <p className="text-xs text-text-secondary/70">{t('dialogs.settings.exportIncludes')}</p>
          </div>
        );

      case 'plugins':
        return (
          <div className="space-y-4">
            {/* 顶部操作区：安装 + 刷新 */}
            <div className="flex items-center gap-2">
              <SectionTitle title={t('dialogs.settings.plugins')} />
              <div className="ml-auto flex gap-2">
                <button
                  onClick={async () => {
                    const dir = await window.qserial.dialog.pickDir(
                      t('dialogs.settings.pluginsInstall')
                    );
                    if (dir) usePluginsStore.getState().install(dir);
                  }}
                  disabled={pluginsBusy === 'install' || pluginsBusy === 'rescan'}
                  className="dialog-btn dialog-btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  {pluginsBusy === 'install'
                    ? t('dialogs.settings.pluginsProcessing')
                    : t('dialogs.settings.pluginsInstall')}
                </button>
                <button
                  onClick={() => usePluginsStore.getState().rescan()}
                  disabled={pluginsBusy !== null}
                  className="dialog-btn dialog-btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  {pluginsBusy === 'rescan'
                    ? t('dialogs.settings.pluginsProcessing')
                    : t('dialogs.settings.pluginsRefresh')}
                </button>
              </div>
            </div>

            {pluginsError && (
              <div className="flex items-center gap-2 text-xs text-error bg-error/10 border-l-2 border-error px-3 py-2 rounded-r-lg">
                {pluginsError}
              </div>
            )}

            {plugins.length === 0 ? (
              <p className="text-xs text-text-secondary/70">{t('dialogs.settings.pluginsEmpty')}</p>
            ) : (
              <div className="space-y-3">
                {plugins.map((plugin: PluginInfo) => {
                  const isPending = pluginsPendingId === plugin.id;
                  const isTransient =
                    plugin.status === 'installing' ||
                    plugin.status === 'uninstalling' ||
                    plugin.status === 'updating';
                  const statusLabel = isTransient
                    ? t('dialogs.settings.pluginsProcessing')
                    : plugin.status === 'error'
                      ? t('dialogs.settings.pluginsError')
                      : plugin.enabled
                        ? t('dialogs.settings.pluginsEnabled')
                        : t('dialogs.settings.pluginsDisabled');
                  return (
                    <div
                      key={plugin.id}
                      className="rounded-lg border border-border bg-background/30 p-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{plugin.name}</span>
                            <span className="text-[10px] font-mono text-text-secondary/70">
                              v{plugin.version}
                            </span>
                            {plugin.builtin && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                {t('dialogs.settings.pluginsBuiltin')}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-text-secondary mt-0.5">
                            {t('dialogs.settings.pluginsAuthor')}:{' '}
                            {plugin.author || t('dialogs.settings.pluginsNone')}
                          </div>
                          {plugin.description && (
                            <p className="text-[11px] text-text-secondary/80 mt-1">
                              {plugin.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => usePluginsStore.getState().selectPlugin(plugin.id)}
                            className="text-[11px] px-2 py-1 rounded text-text-secondary hover:bg-hover"
                          >
                            {t('dialogs.pluginDetail.title')}
                          </button>
                          {!plugin.builtin &&
                            (confirmUninstallId === plugin.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => usePluginsStore.getState().uninstall(plugin.id)}
                                  disabled={isPending}
                                  className="text-[11px] px-2 py-1 rounded bg-error/10 text-error hover:bg-error/20 disabled:opacity-50"
                                >
                                  {t('dialogs.settings.pluginsConfirm')}
                                </button>
                                <button
                                  onClick={() => setConfirmUninstallId(null)}
                                  className="text-[11px] px-2 py-1 rounded text-text-secondary hover:bg-hover"
                                >
                                  {t('dialogs.settings.cancel')}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmUninstallId(plugin.id)}
                                disabled={isPending}
                                className="text-[11px] px-2 py-1 rounded text-error/80 hover:bg-error/10 disabled:opacity-50"
                              >
                                {t('dialogs.settings.pluginsUninstall')}
                              </button>
                            ))}
                          <Toggle
                            label=""
                            checked={plugin.enabled}
                            onChange={(v) => usePluginsStore.getState().setEnabled(plugin.id, v)}
                          />
                        </div>
                      </div>
                      {confirmUninstallId === plugin.id && (
                        <p className="text-[11px] text-warning mt-2">
                          {t('dialogs.settings.pluginsConfirmUninstall')}
                        </p>
                      )}
                      {plugin.error && (
                        <p className="text-[11px] text-error mt-2">{plugin.error}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border/60">
                        <span className="text-[11px] text-text-secondary">
                          {t('dialogs.settings.pluginsPermissions')}:
                        </span>
                        <span className="text-[11px] text-text-secondary/80">
                          {plugin.permissions.length > 0
                            ? plugin.permissions.join(', ')
                            : t('dialogs.settings.pluginsNone')}
                        </span>
                        <span
                          className={`ml-auto text-[11px] ${
                            plugin.status === 'error'
                              ? 'text-error'
                              : isTransient
                                ? 'text-text-secondary'
                                : plugin.enabled
                                  ? 'text-success'
                                  : 'text-text-secondary'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
        <div className="bg-surface rounded-xl shadow-md w-[660px] h-[480px] max-h-[88vh] overflow-hidden border border-border/80 flex">
          {/* 左侧导航 */}
          <div className="w-[130px] flex-shrink-0 border-r border-border bg-background/30 flex flex-col">
            <div className="px-3.5 pt-3.5 pb-2.5 border-b border-border/50">
              <h2 className="text-sm font-semibold">{t('dialogs.settings.title')}</h2>
            </div>
            <div className="flex-1 overflow-y-auto py-1.5">
              {SECTIONS.map((section) => (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  className={`w-full text-left px-3.5 py-1.5 text-xs transition-all ${
                    activeSection === section
                      ? 'bg-primary/10 text-primary border-r-[2.5px] border-primary font-medium'
                      : 'text-text-secondary hover:bg-hover hover:text-text'
                  }`}
                >
                  {t(`dialogs.settings.${section}`)}
                </button>
              ))}
            </div>
          </div>

          {/* 右侧内容 */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0 bg-surface">
              <h3 className="text-sm font-medium">{t(`dialogs.settings.${activeSection}`)}</h3>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M1 1l12 12M13 1L1 13" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">{renderSection()}</div>

            {/* 底部按钮 */}
            <div className="flex justify-end gap-2.5 px-5 py-3.5 border-t border-border bg-background/30 flex-shrink-0">
              <button onClick={onClose} className="dialog-btn dialog-btn-secondary text-sm px-4">
                {t('dialogs.settings.cancel')}
              </button>
              <button onClick={handleSave} className="dialog-btn dialog-btn-primary text-sm px-4">
                {t('dialogs.settings.save')}
              </button>
            </div>
          </div>
        </div>
      </div>
      <PluginDetailDialog
        isOpen={pluginsState?.selectedPluginId != null}
        onClose={() => usePluginsStore.getState().closePlugin()}
      />
    </>
  );
};
