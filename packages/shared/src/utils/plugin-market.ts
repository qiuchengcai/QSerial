/**
 * 插件市场工具函数（纯函数，供主进程与单元测试复用）。
 */

import type {
  MarketIndex,
  MarketPluginItem,
  PluginSource,
  PluginUpdateInfo,
} from '../types/plugin-market.js';
import type { PluginInfo } from '../types/plugin.js';

/** 内置默认市场源（不可删除）。URL 为占位，可在设置中替换/添加自定义源。 */
export const DEFAULT_MARKET_SOURCES: PluginSource[] = [
  {
    id: 'official',
    name: 'QSerial 官方源',
    url: 'https://raw.githubusercontent.com/qserial/qserial-plugins/main/index.json',
    builtin: true,
  },
];

/** 解析 x.y.z 版本为数字三元组（非法位按 0） */
function parseVersion(v: string): [number, number, number] {
  const parts = String(v || '0.0.0')
    .split('.')
    .map((s) => parseInt(s, 10));
  return [
    Number.isFinite(parts[0]) ? parts[0] : 0,
    Number.isFinite(parts[1]) ? parts[1] : 0,
    Number.isFinite(parts[2]) ? parts[2] : 0,
  ];
}

/**
 * 比较两个版本号。返回 -1（a<b）/ 0（相等）/ 1（a>b）。
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

/**
 * 宿主版本是否满足插件最低版本要求。minVersion 为空表示无要求。
 */
export function isVersionCompatible(hostVersion: string, minVersion?: string): boolean {
  if (!minVersion) return true;
  return compareVersions(hostVersion, minVersion) >= 0;
}

/**
 * 计算已安装插件相对市场索引的可更新项。
 */
export function computeUpdates(
  installed: PluginInfo[],
  market: MarketPluginItem[]
): PluginUpdateInfo[] {
  const result: PluginUpdateInfo[] = [];
  for (const p of installed) {
    const item = market.find((m) => m.id === p.id);
    if (item && compareVersions(item.version, p.version) > 0) {
      result.push({
        id: p.id,
        name: p.name,
        currentVersion: p.version,
        latestVersion: item.version,
      });
    }
  }
  return result;
}

/** 市场卡片动作类型 */
export type MarketItemAction = 'install' | 'update' | 'installed' | 'incompatible';

/**
 * 计算市场条目的操作状态（含不兼容判断）。
 */
export function computeMarketItemStatus(
  item: MarketPluginItem,
  installedVersion: string | undefined,
  hostVersion: string
): MarketItemAction {
  if (!isVersionCompatible(hostVersion, item.minHostVersion)) return 'incompatible';
  if (!installedVersion) return 'install';
  if (compareVersions(item.version, installedVersion) > 0) return 'update';
  return 'installed';
}

/** 市场视图状态 */
export type MarketViewState = 'loading' | 'error' | 'empty' | 'no-results' | 'list';

/**
 * 计算市场 Tab 应展示的视图状态。
 */
export function computeMarketViewState(opts: {
  loading: boolean;
  error: string | null;
  totalPlugins: number;
  filteredCount: number;
}): MarketViewState {
  if (opts.error) return 'error';
  if (opts.loading) return 'loading';
  if (opts.totalPlugins === 0) return 'empty';
  if (opts.filteredCount === 0) return 'no-results';
  return 'list';
}

/**
 * 宽松解析市场索引。结构非法或缺失关键字段时返回 null。
 */
export function validateMarketIndex(raw: unknown): MarketIndex | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const metaRaw = obj.meta;
  if (!metaRaw || typeof metaRaw !== 'object') return null;
  const meta = metaRaw as Record<string, unknown>;
  if (typeof meta.version !== 'string' || !Array.isArray(obj.plugins)) return null;

  const plugins: MarketPluginItem[] = [];
  for (const p of obj.plugins) {
    const item = parseMarketItem(p);
    if (item) plugins.push(item);
  }

  return {
    meta: {
      version: meta.version,
      updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : '',
      sourceName: typeof meta.sourceName === 'string' ? meta.sourceName : '',
    },
    plugins,
  };
}

function parseMarketItem(p: unknown): MarketPluginItem | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.version !== 'string') {
    return null;
  }
  if (typeof o.downloadUrl !== 'string' || typeof o.hash !== 'string') return null;

  const item: MarketPluginItem = {
    id: o.id,
    name: o.name,
    version: o.version,
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [],
    downloadUrl: o.downloadUrl,
    hash: o.hash,
  };
  if (typeof o.author === 'string') item.author = o.author;
  if (typeof o.description === 'string') item.description = o.description;
  if (typeof o.size === 'number') item.size = o.size;
  if (typeof o.releaseDate === 'string') item.releaseDate = o.releaseDate;
  if (typeof o.homepage === 'string') item.homepage = o.homepage;
  if (typeof o.downloads === 'number') item.downloads = o.downloads;
  if (typeof o.rating === 'number') item.rating = o.rating;
  if (typeof o.minHostVersion === 'string') item.minHostVersion = o.minHostVersion;
  return item;
}
