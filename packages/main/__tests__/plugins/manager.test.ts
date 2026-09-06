/**
 * PluginManager 核心单元测试
 * 覆盖：正常加载与激活、加载失败隔离、权限拒绝、生命周期钩子、
 *       内置插件默认启用 / 持久化状态覆盖、MCP 工具注册与回收。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('electron', () => ({
  app: {
    setName: () => {},
    getPath: (name: string) => (name === 'userData' ? '/tmp/qserial-test' : '/tmp'),
  },
}));

import { PluginManagerImpl } from '../../src/plugins/manager.ts';
import {
  getDeviceProfiles,
  getMcpToolDefinitions,
  getMcpToolHandler,
} from '../../src/plugins/registry.ts';

let tmpDir: string;

function makePlugin(
  dirName: string,
  manifest: Record<string, unknown>,
  entryCode: string
): void {
  const pdir = path.join(tmpDir, dirName);
  fs.mkdirSync(pdir, { recursive: true });
  fs.writeFileSync(path.join(pdir, 'package.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(pdir, 'index.mjs'), entryCode);
}

function newManager(searchDir: string, initial?: Record<string, boolean>): PluginManagerImpl {
  const state = new Map<string, boolean>(Object.entries(initial || {}));
  return new PluginManagerImpl().configure({
    searchPaths: () => [searchDir],
    getEnabledState: (id) => state.get(id),
    setEnabledState: (id, v) => {
      state.set(id, v);
    },
  });
}

function manifest(
  id: string,
  permissions: string[],
  builtin: boolean
): Record<string, unknown> {
  return {
    name: id,
    version: '1.0.0',
    main: 'index.mjs',
    qserial: { id, permissions, builtin },
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qserial-plugin-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete (globalThis as Record<string, unknown>).__qserialDeactivateCount;
});

describe('PluginManager', () => {
  it('loads and activates an enabled builtin plugin', async () => {
    makePlugin(
      'p1',
      manifest('p1', ['device:register'], true),
      `export async function activate(ctx) {
        ctx.device.registerProfiles([{ name: 'Foo', patterns: ['foo'] }]);
      }`
    );
    const m = newManager(tmpDir);
    await m.loadAll();

    const list = m.list();
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('active');
    expect(list[0].enabled).toBe(true);
    expect(list[0].builtin).toBe(true);
    expect(getDeviceProfiles()).toContainEqual(expect.objectContaining({ name: 'Foo' }));

    await m.deactivateAll();
  });

  it('isolates a plugin whose activate throws without affecting others', async () => {
    makePlugin(
      'bad',
      manifest('bad', ['device:register'], true),
      `export async function activate() { throw new Error('boom'); }`
    );
    makePlugin(
      'good',
      manifest('good', ['device:register'], true),
      `export async function activate(ctx) {
        ctx.device.registerProfiles([{ name: 'Good', patterns: ['g'] }]);
      }`
    );
    const m = newManager(tmpDir);
    await m.loadAll();

    const list = m.list().sort((a, b) => a.id.localeCompare(b.id));
    const bad = list.find((p) => p.id === 'bad');
    const good = list.find((p) => p.id === 'good');

    expect(bad?.status).toBe('error');
    expect(bad?.error).toContain('boom');
    expect(good?.status).toBe('active');
    expect(getDeviceProfiles()).toContainEqual(expect.objectContaining({ name: 'Good' }));

    await m.deactivateAll();
  });

  it('rejects activation when an undeclared capability is used', async () => {
    makePlugin(
      'no-perm',
      manifest('no-perm', [], true),
      `export async function activate(ctx) {
        ctx.device.registerProfiles([{ name: 'X', patterns: ['x'] }]);
      }`
    );
    const m = newManager(tmpDir);
    await m.loadAll();

    const p = m.list()[0];
    expect(p.status).toBe('error');
    expect(p.error).toContain('device:register');
    // 权限拒绝时不应残留贡献
    expect(getDeviceProfiles()).toHaveLength(0);

    await m.deactivateAll();
  });

  it('calls deactivate on disable and removes contributions', async () => {
    makePlugin(
      'life',
      manifest('life', ['device:register'], true),
      `export function activate(ctx) {
        ctx.device.registerProfiles([{ name: 'Life', patterns: ['l'] }]);
      }
      export function deactivate() {
        globalThis.__qserialDeactivateCount = (globalThis.__qserialDeactivateCount || 0) + 1;
      }`
    );
    const m = newManager(tmpDir);
    await m.loadAll();
    expect(getDeviceProfiles()).toContainEqual(expect.objectContaining({ name: 'Life' }));

    await m.setEnabled('life', false);
    expect(m.list()[0].status).toBe('disabled');
    expect(m.list()[0].enabled).toBe(false);
    expect(getDeviceProfiles()).toHaveLength(0);
    expect((globalThis as Record<string, unknown>).__qserialDeactivateCount).toBe(1);

    await m.deactivateAll();
  });

  it('registers an MCP tool through ctx.mcp.registerTool and clears on disable', async () => {
    makePlugin(
      'mcp-plugin',
      manifest('mcp-plugin', ['mcp:register'], true),
      `export function activate(ctx) {
        ctx.mcp.registerTool(
          { name: 'foo.bar', description: 'demo', inputSchema: { type: 'object', properties: {} } },
          async () => 'hello-from-plugin'
        );
      }`
    );
    const m = newManager(tmpDir);
    await m.loadAll();

    expect(getMcpToolDefinitions().map((d) => d.name)).toContain('foo.bar');
    const handler = getMcpToolHandler('foo.bar')!;
    expect(await handler({})).toBe('hello-from-plugin');

    await m.setEnabled('mcp-plugin', false);
    expect(getMcpToolDefinitions().map((d) => d.name)).not.toContain('foo.bar');
    expect(getMcpToolHandler('foo.bar')).toBeUndefined();

    await m.deactivateAll();
  });

  it('defaults non-builtin to disabled and lets persisted state override builtin default', async () => {
    makePlugin('nb', manifest('nb', [], false), `export function activate() {}`);
    makePlugin('builtin-off', manifest('builtin-off', [], true), `export function activate() {}`);

    const m = newManager(tmpDir, { 'builtin-off': false });
    await m.loadAll();

    const nb = m.list().find((p) => p.id === 'nb');
    const builtinOff = m.list().find((p) => p.id === 'builtin-off');
    expect(nb?.enabled).toBe(false);
    expect(builtinOff?.enabled).toBe(false);

    await m.deactivateAll();
  });
});
