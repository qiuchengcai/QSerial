/**
 * 插件市场面板 — 搜索 / 分类筛选 / 排序 / 卡片列表 / 安装·更新 / 源管理 / 骨架屏 / 错误空态
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePluginMarketStore } from '@/stores/pluginMarket';
import { usePluginsStore } from '@/stores/plugins';
import {
  computeMarketItemStatus,
  computeMarketViewState,
  type MarketItemAction,
} from '@qserial/shared';
import type { MarketPluginItem, PluginSource } from '@qserial/shared';

type SortKey = 'latest' | 'downloads' | 'rating' | 'name';

const ALL_TAGS = 'all';

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: ALL_TAGS, label: 'dialogs.pluginMarket.allTags' },
  { value: '工具', label: 'dialogs.pluginMarket.categoryTool' },
  { value: '协议', label: 'dialogs.pluginMarket.categoryProtocol' },
  { value: 'MCP', label: 'dialogs.pluginMarket.categoryMcp' },
  { value: '设备识别', label: 'dialogs.pluginMarket.categoryDevice' },
  { value: '其他', label: 'dialogs.pluginMarket.categoryOther' },
];

function formatDownloads(n?: number): string {
  if (!n || n <= 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export const PluginMarketPanel: React.FC = () => {
  const { t } = useTranslation();
  const market = usePluginMarketStore();
  const plugins = usePluginsStore((s) => s.plugins);

  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string>(ALL_TAGS);
  const [sort, setSort] = useState<SortKey>('latest');
  const [showSources, setShowSources] = useState(false);
  const [showErrorDetail, setShowErrorDetail] = useState(false);

  useEffect(() => {
    market.loadSources().then(() => market.fetchMarket());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installedMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of plugins) m.set(p.id, p.version);
    return m;
  }, [plugins]);

  const items = useMemo(() => {
    let list = [...market.marketPlugins];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          p.tags.some((x) => x.toLowerCase().includes(q))
      );
    }
    if (tag !== ALL_TAGS) list = list.filter((p) => p.tags.includes(tag));
    list.sort((a, b) => {
      if (sort === 'downloads') return (b.downloads || 0) - (a.downloads || 0);
      if (sort === 'rating') return (b.rating || 0) - (a.rating || 0);
      if (sort === 'name') return a.name.localeCompare(b.name);
      return (b.releaseDate || '').localeCompare(a.releaseDate || '');
    });
    return list;
  }, [market.marketPlugins, query, tag, sort]);

  const viewState = computeMarketViewState({
    loading: market.marketLoading,
    error: market.marketError,
    totalPlugins: market.marketPlugins.length,
    filteredCount: items.length,
  });

  const statusFor = (item: MarketPluginItem): MarketItemAction =>
    computeMarketItemStatus(item, installedMap.get(item.id), market.hostVersion);

  return (
    <div className="space-y-3">
      {/* 工具栏：搜索框独占一行，筛选/操作第二行 */}
      <div className="space-y-2">
        <div className="relative">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary/60 pointer-events-none"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder={t('dialogs.pluginMarket.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="dialog-input w-full pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <select value={tag} onChange={(e) => setTag(e.target.value)} className="dialog-select">
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.label)}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="dialog-select"
          >
            <option value="latest">{t('dialogs.pluginMarket.sortLatest')}</option>
            <option value="downloads">{t('dialogs.pluginMarket.sortDownloads')}</option>
            <option value="rating">{t('dialogs.pluginMarket.sortRating')}</option>
            <option value="name">{t('dialogs.pluginMarket.sortName')}</option>
          </select>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => market.fetchMarket()}
              disabled={market.marketLoading}
              title={t('dialogs.settings.pluginsRefresh')}
              className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover disabled:opacity-50"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 2v2.5H11"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              onClick={() => setShowSources(true)}
              title={t('dialogs.pluginMarket.sources')}
              className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              >
                <circle cx="8" cy="8" r="2.2" />
                <path
                  d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 视图状态 */}
      {viewState === 'loading' && (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-background/30 p-3 animate-pulse"
            >
              <div className="h-3.5 w-1/3 rounded bg-border" />
              <div className="h-3 w-1/5 rounded bg-border mt-2" />
              <div className="h-3 w-full rounded bg-border mt-2" />
            </div>
          ))}
        </div>
      )}

      {viewState === 'error' && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-error/70"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 16.5v.5" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-sm text-text">{t('dialogs.pluginMarket.errorTitle')}</p>
            <p className="text-xs text-text-secondary mt-1">
              {t('dialogs.pluginMarket.errorHint')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => market.fetchMarket()}
              className="dialog-btn dialog-btn-primary text-xs px-4 py-1.5"
            >
              {t('dialogs.pluginMarket.retry')}
            </button>
            <button
              onClick={() => setShowErrorDetail((v) => !v)}
              className="text-xs text-text-secondary underline hover:text-text"
            >
              {t('dialogs.pluginMarket.viewDetail')}
            </button>
          </div>
          {showErrorDetail && market.marketError && (
            <pre className="text-[11px] text-text-secondary bg-background/50 rounded p-2 max-w-full overflow-x-auto whitespace-pre-wrap text-left w-full">
              {market.marketError}
            </pre>
          )}
        </div>
      )}

      {viewState === 'empty' && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-text-secondary/50"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-sm text-text">{t('dialogs.pluginMarket.emptyTitle')}</p>
            <p className="text-xs text-text-secondary mt-1">
              {t('dialogs.pluginMarket.emptyHint')}
            </p>
          </div>
        </div>
      )}

      {viewState === 'no-results' && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-text-secondary/50"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-sm text-text">{t('dialogs.pluginMarket.noResultsTitle')}</p>
            <p className="text-xs text-text-secondary mt-1">
              {t('dialogs.pluginMarket.noResultsHint')}
            </p>
          </div>
        </div>
      )}

      {viewState === 'list' && (
        <div className="space-y-2.5">
          {items.map((item) => {
            const status = statusFor(item);
            const progress = market.downloadingPlugins[item.id];
            const busy = !!progress;
            return (
              <div
                key={item.id}
                onClick={() => usePluginsStore.getState().selectPlugin(item.id)}
                className="rounded-lg border border-border bg-background/30 p-3 cursor-pointer hover:bg-hover/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="text-[10px] font-mono text-text-secondary/70">
                        v{item.version}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-secondary mt-0.5">{item.author}</div>
                    {item.description && (
                      <p className="text-[11px] text-text-secondary/80 mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {item.tags.slice(0, 3).map((x) => (
                        <span
                          key={x}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                        >
                          {x}
                        </span>
                      ))}
                      {(item.downloads !== undefined || item.rating !== undefined) && (
                        <span className="text-[10px] text-text-secondary/60 ml-auto flex items-center gap-2">
                          {item.rating !== undefined && <span>★ {item.rating.toFixed(1)}</span>}
                          {item.downloads !== undefined && (
                            <span>{formatDownloads(item.downloads)}</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <MarketActionButton
                    status={status}
                    busy={busy}
                    minHostVersion={item.minHostVersion}
                    onClick={() =>
                      status === 'update'
                        ? market.updatePlugin(item.id)
                        : status === 'install'
                          ? market.installFromMarket(item.id)
                          : undefined
                    }
                  />
                </div>
                {progress && (
                  <div className="mt-2 h-1.5 rounded bg-border overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showSources && <SourceDialog onClose={() => setShowSources(false)} />}
    </div>
  );
};

const MarketActionButton: React.FC<{
  status: MarketItemAction;
  busy: boolean;
  minHostVersion?: string;
  onClick?: () => void;
}> = ({ status, busy, minHostVersion, onClick }) => {
  const { t } = useTranslation();
  if (busy) {
    return (
      <span className="text-xs px-3 py-1.5 rounded text-text-secondary">
        {t('dialogs.settings.pluginsProcessing')}
      </span>
    );
  }
  if (status === 'incompatible') {
    return (
      <span
        title={minHostVersion ? `需要宿主版本 >= ${minHostVersion}` : undefined}
        className="text-xs px-3 py-1.5 rounded text-text-secondary/50 cursor-not-allowed"
      >
        {t('dialogs.pluginMarket.incompatible')}
      </span>
    );
  }
  if (status === 'installed') {
    return (
      <span className="text-xs px-3 py-1.5 rounded text-text-secondary/50">
        {t('dialogs.pluginMarket.installed')}
      </span>
    );
  }
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`text-xs px-3 py-1.5 rounded ${
        status === 'update'
          ? 'bg-accent/15 text-accent hover:bg-accent/25'
          : 'bg-primary/15 text-primary hover:bg-primary/25'
      }`}
    >
      {status === 'update' ? t('dialogs.pluginMarket.update') : t('dialogs.pluginMarket.install')}
    </button>
  );
};

const SourceDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  const market = usePluginMarketStore();
  const [draft, setDraft] = useState<PluginSource[]>([]);

  useEffect(() => {
    setDraft(market.sources.map((s) => ({ ...s })));
  }, [market.sources]);

  const update = (i: number, patch: Partial<PluginSource>) => {
    setDraft((d) => d.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const save = async () => {
    const valid = draft.filter((s) => s.name.trim() && s.url.trim());
    await market.saveSources(valid, market.activeSourceId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="bg-surface rounded-xl shadow-md w-[460px] max-h-[80vh] overflow-hidden border border-border/80 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">{t('dialogs.pluginMarket.sources')}</h3>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded text-text-secondary hover:text-text"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {draft.map((s, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  value={s.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  disabled={s.builtin}
                  className="dialog-input flex-1"
                  placeholder={t('dialogs.pluginMarket.sourceName')}
                />
                {s.builtin ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    {t('dialogs.settings.pluginsBuiltin')}
                  </span>
                ) : (
                  <button
                    onClick={() => setDraft((d) => d.filter((_, idx) => idx !== i))}
                    className="text-[11px] text-error/80 hover:bg-error/10 px-1.5 py-0.5 rounded"
                  >
                    {t('dialogs.settings.pluginsUninstall')}
                  </button>
                )}
              </div>
              <input
                value={s.url}
                onChange={(e) => update(i, { url: e.target.value })}
                className="dialog-input w-full"
                placeholder="https://..."
              />
            </div>
          ))}
          <button
            onClick={() => setDraft((d) => [...d, { id: `src-${Date.now()}`, name: '', url: '' }])}
            className="dialog-btn dialog-btn-secondary text-xs px-3 py-1.5"
          >
            {t('dialogs.pluginMarket.addSource')}
          </button>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button onClick={onClose} className="dialog-btn dialog-btn-secondary text-xs px-3 py-1.5">
            {t('dialogs.settings.cancel')}
          </button>
          <button onClick={save} className="dialog-btn dialog-btn-primary text-xs px-3 py-1.5">
            {t('dialogs.settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
};
