/**
 * 插件详情弹窗 — 基本信息 + 权限声明 + 操作区（启用/卸载/重载）+ 配置表单 Tab
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePluginsStore } from '@/stores/plugins';
import { usePluginMarketStore } from '@/stores/pluginMarket';
import type { PluginConfigField, PluginInfo, PluginPermission } from '@qserial/shared';
import { getDefaultConfig, validatePluginConfig, compareVersions } from '@qserial/shared';

interface PluginDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const PERMISSION_LABEL_KEYS: Record<PluginPermission, string> = {
  'connection:read': 'dialogs.pluginDetail.perms.connection_read',
  'connection:write': 'dialogs.pluginDetail.perms.connection_write',
  'terminal:write': 'dialogs.pluginDetail.perms.terminal_write',
  'mcp:register': 'dialogs.pluginDetail.perms.mcp_register',
  config: 'dialogs.pluginDetail.perms.config',
  'device:register': 'dialogs.pluginDetail.perms.device_register',
  ui: 'dialogs.pluginDetail.perms.ui',
  log: 'dialogs.pluginDetail.perms.log',
  ipc: 'dialogs.pluginDetail.perms.ipc',
};

type TabId = 'info' | 'config';

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '-';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export const PluginDetailDialog: React.FC<PluginDetailDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const selectedPluginId = usePluginsStore((s) => s.selectedPluginId);
  const plugins = usePluginsStore((s) => s.plugins);
  const pluginConfigs = usePluginsStore((s) => s.pluginConfigs);
  const loadPluginConfig = usePluginsStore((s) => s.loadPluginConfig);
  const setPluginConfig = usePluginsStore((s) => s.setPluginConfig);

  const plugin: PluginInfo | undefined = useMemo(
    () => plugins.find((p) => p.id === selectedPluginId),
    [plugins, selectedPluginId]
  );

  const marketPlugins = usePluginMarketStore((s) => s.marketPlugins);
  const marketUpdatePlugin = usePluginMarketStore((s) => s.updatePlugin);
  const marketInstall = usePluginMarketStore((s) => s.installFromMarket);
  const downloadingPlugins = usePluginMarketStore((s) => s.downloadingPlugins);
  const marketItem = marketPlugins.find((p) => p.id === selectedPluginId);
  const hasMarketUpdate =
    !!plugin && !!marketItem && compareVersions(marketItem.version, plugin.version) > 0;
  const downloading = selectedPluginId ? downloadingPlugins[selectedPluginId] : undefined;

  const [activeTab, setActiveTab] = useState<TabId>('info');
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const schema = plugin?.configSchema;

  useEffect(() => {
    if (!isOpen || !plugin) return;
    setActiveTab('info');
    setConfirmUninstall(false);
    setSaveError(null);
    setSaved(false);
    if (schema?.fields) {
      loadPluginConfig(plugin.id).then((persisted) => {
        const init: Record<string, unknown> = {};
        for (const f of schema.fields) {
          init[f.key] = persisted?.[f.key] !== undefined ? persisted[f.key] : f.default;
        }
        setDraft(init);
      });
    } else {
      setDraft({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, plugin?.id]);

  if (!isOpen || (!plugin && !marketItem)) return null;

  const displayName = plugin?.name || marketItem?.name || '';
  const displayVersion = plugin?.version || marketItem?.version || '';
  const displayAuthor = plugin?.author || marketItem?.author;
  const displayDescription = plugin?.description || marketItem?.description;

  const persisted = plugin ? pluginConfigs[plugin.id] || {} : {};
  const isDirty = schema?.fields
    ? schema.fields.some(
        (f) => draft[f.key] !== (persisted[f.key] !== undefined ? persisted[f.key] : f.default)
      )
    : false;

  const handleSave = async () => {
    if (!plugin || !schema?.fields) return;
    setSaveError(null);
    setSaved(false);
    const errors = validatePluginConfig(schema, draft);
    if (errors.length > 0) {
      setSaveError(t('dialogs.pluginDetail.validationError'));
      return;
    }
    for (const f of schema.fields) {
      const cur = persisted[f.key] !== undefined ? persisted[f.key] : f.default;
      if (draft[f.key] !== cur) {
        await setPluginConfig(plugin.id, f.key, draft[f.key]);
      }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleRestoreDefaults = async () => {
    if (!plugin || !schema?.fields) return;
    const defaults = getDefaultConfig(schema);
    setDraft(defaults);
    for (const f of schema.fields) {
      await setPluginConfig(plugin.id, f.key, defaults[f.key]);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const fieldInput = (field: PluginConfigField) => {
    const value = draft[field.key];
    const common = 'dialog-input w-full';
    switch (field.type) {
      case 'boolean':
        return (
          <button
            type="button"
            role="switch"
            aria-checked={!!value}
            onClick={() => setDraft((d) => ({ ...d, [field.key]: !d[field.key] }))}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              value ? 'bg-[var(--color-primary)]' : 'bg-border'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                value ? 'translate-x-[18px]' : 'translate-x-[4px]'
              }`}
            />
          </button>
        );
      case 'number':
        return (
          <input
            type="number"
            min={field.min}
            max={field.max}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                [field.key]: e.target.value === '' ? '' : Number(e.target.value),
              }))
            }
            className={common}
          />
        );
      case 'select':
        return (
          <select
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
            className={common}
          >
            {(field.options || []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      case 'textarea':
        return (
          <textarea
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
            rows={3}
            className={`${common} resize-y`}
          />
        );
      default:
        return (
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
            className={common}
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
      <div className="bg-surface rounded-xl shadow-md w-[560px] max-h-[86vh] overflow-hidden border border-border/80 flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{displayName}</h3>
            <span className="text-[10px] font-mono text-text-secondary/70">v{displayVersion}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setActiveTab('info')}
                className={`px-3 py-1 text-xs ${activeTab === 'info' ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-hover'}`}
              >
                {t('dialogs.pluginDetail.info')}
              </button>
              {schema?.fields && schema.fields.length > 0 && (
                <button
                  onClick={() => setActiveTab('config')}
                  className={`px-3 py-1 text-xs ${activeTab === 'config' ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-hover'}`}
                >
                  {t('dialogs.pluginDetail.config')}
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover"
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
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'info' ? (
            <div className="space-y-4">
              <div className="space-y-2 text-xs">
                <div className="flex">
                  <span className="w-20 text-text-secondary flex-shrink-0">
                    {t('dialogs.pluginDetail.name')}
                  </span>
                  <span className="text-text">{displayName}</span>
                </div>
                <div className="flex">
                  <span className="w-20 text-text-secondary flex-shrink-0">
                    {t('dialogs.pluginDetail.author')}
                  </span>
                  <span className="text-text">
                    {displayAuthor || t('dialogs.pluginDetail.none')}
                  </span>
                </div>
                {plugin && (
                  <>
                    <div className="flex">
                      <span className="w-20 text-text-secondary flex-shrink-0">
                        {t('dialogs.pluginDetail.type')}
                      </span>
                      <span className="text-text">
                        {plugin.builtin
                          ? t('dialogs.pluginDetail.builtinType')
                          : t('dialogs.pluginDetail.userType')}
                      </span>
                    </div>
                    <div className="flex">
                      <span className="w-20 text-text-secondary flex-shrink-0">
                        {t('dialogs.pluginDetail.status')}
                      </span>
                      <span
                        className={
                          plugin.status === 'error'
                            ? 'text-error'
                            : plugin.enabled
                              ? 'text-success'
                              : 'text-text-secondary'
                        }
                      >
                        {plugin.status === 'error'
                          ? t('dialogs.settings.pluginsError')
                          : plugin.enabled
                            ? t('dialogs.settings.pluginsEnabled')
                            : t('dialogs.settings.pluginsDisabled')}
                      </span>
                    </div>
                  </>
                )}
                {displayDescription && (
                  <div className="pt-2">
                    <span className="text-text-secondary">
                      {t('dialogs.pluginDetail.description')}:{' '}
                    </span>
                    <span className="text-text">{displayDescription}</span>
                  </div>
                )}
              </div>

              {/* 市场信息 */}
              {marketItem && (
                <div className="rounded-lg border border-border/60 p-3 space-y-1.5">
                  <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    {t('dialogs.pluginDetail.marketInfo')}
                  </h4>
                  {marketItem.releaseDate && (
                    <div className="flex text-xs">
                      <span className="w-20 text-text-secondary flex-shrink-0">
                        {t('dialogs.pluginDetail.releaseDate')}
                      </span>
                      <span className="text-text">{marketItem.releaseDate}</span>
                    </div>
                  )}
                  {marketItem.size !== undefined && (
                    <div className="flex text-xs">
                      <span className="w-20 text-text-secondary flex-shrink-0">
                        {t('dialogs.pluginDetail.size')}
                      </span>
                      <span className="text-text">{formatSize(marketItem.size)}</span>
                    </div>
                  )}
                  {marketItem.downloads !== undefined && (
                    <div className="flex text-xs">
                      <span className="w-20 text-text-secondary flex-shrink-0">
                        {t('dialogs.pluginDetail.downloads')}
                      </span>
                      <span className="text-text">{marketItem.downloads}</span>
                    </div>
                  )}
                  {marketItem.tags.length > 0 && (
                    <div className="flex text-xs items-center">
                      <span className="w-20 text-text-secondary flex-shrink-0">
                        {t('dialogs.pluginDetail.tags')}
                      </span>
                      <span className="flex gap-1 flex-wrap">
                        {marketItem.tags.map((x) => (
                          <span
                            key={x}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                          >
                            {x}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                  {marketItem.homepage && (
                    <div className="flex text-xs">
                      <span className="w-20 text-text-secondary flex-shrink-0">
                        {t('dialogs.pluginDetail.homepage')}
                      </span>
                      <a
                        href={marketItem.homepage}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary underline break-all"
                      >
                        {marketItem.homepage}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {plugin?.error && (
                <div className="text-xs text-error bg-error/10 border-l-2 border-error px-3 py-2 rounded-r-lg whitespace-pre-wrap">
                  {plugin.error}
                </div>
              )}

              {plugin && (
                <div>
                  <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    {t('dialogs.pluginDetail.permissions')}
                  </h4>
                  {plugin.permissions.length === 0 ? (
                    <p className="text-xs text-text-secondary/70">
                      {t('dialogs.pluginDetail.noPermissions')}
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {plugin.permissions.map((p) => (
                        <li key={p} className="flex items-start gap-2 text-xs">
                          <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-background/60 text-primary flex-shrink-0">
                            {p}
                          </code>
                          <span className="text-text-secondary">{t(PERMISSION_LABEL_KEYS[p])}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* 操作区 */}
              <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                {plugin ? (
                  <>
                    <button
                      onClick={() =>
                        usePluginsStore.getState().setEnabled(plugin.id, !plugin.enabled)
                      }
                      className="dialog-btn dialog-btn-secondary text-xs px-3 py-1.5"
                    >
                      {plugin.enabled
                        ? t('dialogs.pluginDetail.disable')
                        : t('dialogs.pluginDetail.enable')}
                    </button>
                    <button
                      onClick={() => usePluginsStore.getState().reload(plugin.id)}
                      className="dialog-btn dialog-btn-secondary text-xs px-3 py-1.5"
                    >
                      {t('dialogs.pluginDetail.reload')}
                    </button>
                    {hasMarketUpdate && marketItem && (
                      <button
                        onClick={() => marketUpdatePlugin(plugin.id)}
                        className="dialog-btn text-xs px-3 py-1.5 text-accent border-accent"
                      >
                        {t('dialogs.pluginMarket.update')} v{marketItem.version}
                      </button>
                    )}
                    {!plugin.builtin &&
                      (confirmUninstall ? (
                        <button
                          onClick={() => usePluginsStore.getState().uninstall(plugin.id)}
                          className="dialog-btn text-xs px-3 py-1.5 text-error border-error"
                        >
                          {t('dialogs.settings.pluginsConfirm')}
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmUninstall(true)}
                          className="dialog-btn dialog-btn-secondary text-xs px-3 py-1.5 text-error"
                        >
                          {t('dialogs.settings.pluginsUninstall')}
                        </button>
                      ))}
                  </>
                ) : marketItem ? (
                  <button
                    onClick={() => marketInstall(marketItem.id)}
                    disabled={!!downloading}
                    className="dialog-btn dialog-btn-primary text-xs px-4 py-1.5 disabled:opacity-50"
                  >
                    {downloading
                      ? t('dialogs.settings.pluginsProcessing')
                      : t('dialogs.pluginMarket.install')}
                  </button>
                ) : null}
              </div>
              {!plugin && downloading && (
                <div>
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <span>{downloading.percent}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-border overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${downloading.percent}%` }}
                    />
                  </div>
                </div>
              )}
              {confirmUninstall && (
                <p className="text-xs text-warning">
                  {t('dialogs.settings.pluginsConfirmUninstall')}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {saveError && (
                <div className="text-xs text-error bg-error/10 border-l-2 border-error px-3 py-2 rounded-r-lg">
                  {saveError}
                </div>
              )}
              <div className="space-y-3">
                {(schema?.fields || []).map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">
                      {field.label}
                      {field.required && <span className="text-error ml-0.5">*</span>}
                    </label>
                    {fieldInput(field)}
                    {field.description && (
                      <p className="text-[11px] text-text-secondary/70 mt-1">{field.description}</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                <button
                  onClick={handleSave}
                  disabled={!isDirty}
                  className="dialog-btn dialog-btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  {t('dialogs.pluginDetail.save')}
                </button>
                <button
                  onClick={handleRestoreDefaults}
                  className="dialog-btn dialog-btn-secondary text-xs px-3 py-1.5"
                >
                  {t('dialogs.pluginDetail.restoreDefaults')}
                </button>
                {saved && (
                  <span className="text-xs text-success">{t('dialogs.pluginDetail.saved')}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
