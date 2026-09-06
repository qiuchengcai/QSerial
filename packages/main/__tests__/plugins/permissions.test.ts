/**
 * 插件权限系统单元测试
 * 覆盖：权限判断、权限断言、权限拒绝错误、宿主 API 权限裁剪。
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    setName: () => {},
    getPath: (name: string) => (name === 'userData' ? '/tmp/qserial-test' : '/tmp'),
  },
}));

import {
  hasPermission,
  assertPermission,
  PluginPermissionError,
} from '../../src/plugins/permissions.ts';
import { buildPluginContext } from '../../src/plugins/host-api.ts';
import type { PluginManifest } from '@qserial/shared';

describe('hasPermission / assertPermission', () => {
  it('returns true for declared permission', () => {
    expect(hasPermission(['device:register'], 'device:register')).toBe(true);
  });

  it('returns false for undeclared permission', () => {
    expect(hasPermission(['device:register'], 'mcp:register')).toBe(false);
  });

  it('assertPermission throws PluginPermissionError for undeclared permission', () => {
    expect(() => assertPermission([], 'mcp:register')).toThrow(PluginPermissionError);
    expect(() => assertPermission([], 'mcp:register')).toThrow(/mcp:register/);
  });

  it('assertPermission passes silently for declared permission', () => {
    expect(() => assertPermission(['mcp:register'], 'mcp:register')).not.toThrow();
  });
});

describe('buildPluginContext permission gating', () => {
  const baseManifest: PluginManifest = {
    id: 'test-plugin',
    name: 'test-plugin',
    version: '1.0.0',
    permissions: [],
  };

  it('rejects undeclared device:register capability', () => {
    const ctx = buildPluginContext(baseManifest);
    expect(() => ctx.device.registerProfiles([])).toThrow(PluginPermissionError);
  });

  it('rejects undeclared mcp:register capability', () => {
    const ctx = buildPluginContext(baseManifest);
    expect(() =>
      ctx.mcp.registerTool(
        { name: 'x', description: 'x', inputSchema: { type: 'object', properties: {} } },
        async () => 'x'
      )
    ).toThrow(PluginPermissionError);
  });

  it('rejects undeclared connection:write capability', () => {
    const ctx = buildPluginContext(baseManifest);
    expect(() => ctx.connection.send('id', 'data')).toThrow(PluginPermissionError);
  });

  it('allows declared capabilities', () => {
    const ctx = buildPluginContext({
      ...baseManifest,
      permissions: ['device:register', 'mcp:register', 'connection:read'],
    });
    expect(() => ctx.device.registerProfiles([{ name: 'A', patterns: ['a'] }])).not.toThrow();
    expect(() => ctx.connection.list()).not.toThrow();
  });
});
