/**
 * 插件市场工具函数单元测试（版本比较 / 索引解析 / 兼容性 / 更新计算）
 */

import { describe, it, expect } from 'vitest';
import {
  compareVersions,
  validateMarketIndex,
  isVersionCompatible,
  computeUpdates,
  computeMarketItemStatus,
  computeMarketViewState,
} from '@qserial/shared';
import type { MarketPluginItem, PluginInfo } from '@qserial/shared';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });
  it('returns 1 when a > b', () => {
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
  });
  it('returns -1 when a < b', () => {
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
  });
  it('treats missing segments as 0', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
  });
  it('treats non-numeric as 0', () => {
    expect(compareVersions('x.y.z', '0.0.0')).toBe(0);
  });
});

describe('validateMarketIndex', () => {
  it('parses a valid index', () => {
    const idx = validateMarketIndex({
      meta: { version: '1', updatedAt: '2026-01-01', sourceName: 'test' },
      plugins: [
        {
          id: 'a',
          name: 'A',
          version: '1.0.0',
          tags: ['x'],
          downloadUrl: 'https://example.com/a.zip',
          hash: 'abc',
        },
      ],
    });
    expect(idx).not.toBeNull();
    expect(idx!.meta.sourceName).toBe('test');
    expect(idx!.plugins).toHaveLength(1);
  });

  it('returns null when meta missing', () => {
    expect(validateMarketIndex({ plugins: [] })).toBeNull();
  });

  it('drops items missing downloadUrl/hash', () => {
    const idx = validateMarketIndex({
      meta: { version: '1', updatedAt: '', sourceName: '' },
      plugins: [
        { id: 'a', name: 'A', version: '1.0.0', tags: [] },
        {
          id: 'b',
          name: 'B',
          version: '1.0.0',
          tags: [],
          downloadUrl: 'https://x/b.zip',
          hash: 'abc',
        },
      ],
    });
    expect(idx!.plugins).toHaveLength(1);
    expect(idx!.plugins[0].id).toBe('b');
  });
});

describe('isVersionCompatible', () => {
  it('returns true when no min version', () => {
    expect(isVersionCompatible('1.0.0', undefined)).toBe(true);
  });
  it('returns true when host >= min', () => {
    expect(isVersionCompatible('1.2.0', '1.1.0')).toBe(true);
  });
  it('returns false when host < min', () => {
    expect(isVersionCompatible('1.0.0', '1.1.0')).toBe(false);
  });
});

describe('computeUpdates', () => {
  const installed: PluginInfo[] = [
    {
      id: 'a',
      name: 'A',
      version: '1.0.0',
      permissions: [],
      enabled: true,
      status: 'active',
      builtin: false,
      hasMain: true,
    },
    {
      id: 'b',
      name: 'B',
      version: '2.0.0',
      permissions: [],
      enabled: false,
      status: 'disabled',
      builtin: false,
      hasMain: true,
    },
  ];

  it('finds plugins with newer market version', () => {
    const updates = computeUpdates(installed, [
      { id: 'a', name: 'A', version: '1.5.0', tags: [], downloadUrl: 'x', hash: 'h' },
      { id: 'b', name: 'B', version: '2.0.0', tags: [], downloadUrl: 'x', hash: 'h' },
    ]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ id: 'a', currentVersion: '1.0.0', latestVersion: '1.5.0' });
  });

  it('returns empty when no updates', () => {
    expect(computeUpdates(installed, [])).toEqual([]);
  });
});

describe('computeMarketItemStatus', () => {
  const item = (overrides: Partial<MarketPluginItem> = {}): MarketPluginItem => ({
    id: 'x',
    name: 'X',
    version: '1.2.0',
    tags: [],
    downloadUrl: 'https://x/x.zip',
    hash: 'h',
    ...overrides,
  });

  it('returns incompatible when minHostVersion above host', () => {
    expect(computeMarketItemStatus(item({ minHostVersion: '9.0.0' }), undefined, '1.1.0')).toBe(
      'incompatible'
    );
  });

  it('returns install when not installed', () => {
    expect(computeMarketItemStatus(item(), undefined, '1.1.0')).toBe('install');
  });

  it('returns update when installed version is lower', () => {
    expect(computeMarketItemStatus(item(), '1.0.0', '1.1.0')).toBe('update');
  });

  it('returns installed when version is same or higher', () => {
    expect(computeMarketItemStatus(item(), '1.2.0', '1.1.0')).toBe('installed');
    expect(computeMarketItemStatus(item(), '2.0.0', '1.1.0')).toBe('installed');
  });
});

describe('computeMarketViewState', () => {
  it('returns error first', () => {
    expect(
      computeMarketViewState({ loading: false, error: 'x', totalPlugins: 5, filteredCount: 5 })
    ).toBe('error');
  });

  it('returns loading when no error', () => {
    expect(
      computeMarketViewState({ loading: true, error: null, totalPlugins: 0, filteredCount: 0 })
    ).toBe('loading');
  });

  it('returns empty when market has no plugins', () => {
    expect(
      computeMarketViewState({ loading: false, error: null, totalPlugins: 0, filteredCount: 0 })
    ).toBe('empty');
  });

  it('returns no-results when filtered empty but total > 0', () => {
    expect(
      computeMarketViewState({ loading: false, error: null, totalPlugins: 5, filteredCount: 0 })
    ).toBe('no-results');
  });

  it('returns list when there are results', () => {
    expect(
      computeMarketViewState({ loading: false, error: null, totalPlugins: 5, filteredCount: 3 })
    ).toBe('list');
  });
});
