/**
 * 插件运行时热加载 / 安装 / 卸载 单元测试
 * 覆盖：安装（默认禁用 / 重复 / 非法清单）、卸载（confirm / 内置 / 成功删目录）、
 *       重扫（新增 inactive / 移除 / 不重复加载已有）、磁盘同步（修改重载保持启用态）。
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
import { getDeviceProfiles } from '../../src/plugins/registry.ts';

let tmpRoot: string;
let userDir: string;
let sourceDir: string;
const managers: PluginManagerImpl[] = [];

function makePlugin(dir: string, manifest: Record<string, unknown>, entryCode: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(dir, 'index.mjs'), entryCode);
}

function newManager(searchDir: string): PluginManagerImpl {
  const state = new Map<string, boolean>();
  const m = new PluginManagerImpl().configure({
    searchPaths: () => [searchDir],
    userPluginsDir: () => userDir,
    getEnabledState: (id) => state.get(id),
    setEnabledState: (id, v) => {
      state.set(id, v);
    },
    clearEnabledState: (id) => {
      state.delete(id);
    },
  });
  managers.push(m);
  return m;
}

function manifest(id: string, permissions: string[], builtin: boolean): Record<string, unknown> {
  return {
    name: id,
    version: '1.0.0',
    main: 'index.mjs',
    qserial: { id, permissions, builtin },
  };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qserial-hot-'));
  userDir = path.join(tmpRoot, 'user');
  sourceDir = path.join(tmpRoot, 'source');
  fs.mkdirSync(userDir, { recursive: true });
  fs.mkdirSync(sourceDir, { recursive: true });
  delete (globalThis as Record<string, unknown>).__hotDeactivateCount;
});

afterEach(async () => {
  for (const m of managers) {
    try {
      await m.deactivateAll();
    } catch {
      /* ignore */
    }
  }
  managers.length = 0;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('installPlugin', () => {
  it('copies to user dir and loads disabled (no auto-activate)', async () => {
    makePlugin(
      path.join(sourceDir, 'inst'),
      manifest('inst', ['device:register'], false),
      `export async function activate(ctx) {
        ctx.device.registerProfiles([{ name: 'Installed', patterns: ['x'] }]);
      }`
    );
    const m = newManager(userDir);
    await m.loadAll();
    expect(m.list()).toHaveLength(0);

    const list = await m.installPlugin(path.join(sourceDir, 'inst'));
    expect(list).toHaveLength(1);
    expect(list[0].enabled).toBe(false);
    expect(list[0].status).toBe('disabled');
    expect(fs.existsSync(path.join(userDir, 'inst', 'index.mjs'))).toBe(true);
    // 默认禁用 → 未激活 → 无贡献
    expect(getDeviceProfiles()).toHaveLength(0);
  });

  it('rejects duplicate id', async () => {
    makePlugin(
      path.join(sourceDir, 'dup'),
      manifest('dup', [], false),
      `export function activate() {}`
    );
    const m = newManager(userDir);
    await m.loadAll();
    await m.installPlugin(path.join(sourceDir, 'dup'));
    await expect(m.installPlugin(path.join(sourceDir, 'dup'))).rejects.toThrow('dup');
  });

  it('rejects invalid manifest (no package.json)', async () => {
    const empty = path.join(sourceDir, 'empty');
    fs.mkdirSync(empty, { recursive: true });
    const m = newManager(userDir);
    await m.loadAll();
    await expect(m.installPlugin(empty)).rejects.toThrow(/清单|package\.json/i);
  });
});

describe('uninstallPlugin', () => {
  it('rejects without confirm and keeps the plugin', async () => {
    makePlugin(
      path.join(sourceDir, 'u1'),
      manifest('u1', [], false),
      `export function activate() {}`
    );
    const m = newManager(userDir);
    await m.loadAll();
    await m.installPlugin(path.join(sourceDir, 'u1'));

    await expect(m.uninstallPlugin('u1', false)).rejects.toThrow(/confirm/i);
    expect(m.list()).toHaveLength(1);
  });

  it('rejects builtin plugin', async () => {
    makePlugin(
      path.join(userDir, 'builtin-p'),
      manifest('builtin-p', [], true),
      `export function activate() {}`
    );
    const m = newManager(userDir);
    await m.loadAll();

    await expect(m.uninstallPlugin('builtin-p', true)).rejects.toThrow(/内置|builtin/i);
    expect(m.list()).toHaveLength(1);
  });

  it('removes plugin, deletes dir and clears contributions', async () => {
    makePlugin(
      path.join(sourceDir, 'u3'),
      manifest('u3', ['device:register'], false),
      `export function activate(ctx) {
        ctx.device.registerProfiles([{ name: 'U3', patterns: ['u'] }]);
      }`
    );
    const m = newManager(userDir);
    await m.loadAll();
    await m.installPlugin(path.join(sourceDir, 'u3'));
    await m.setEnabled('u3', true);
    expect(getDeviceProfiles()).toContainEqual(expect.objectContaining({ name: 'U3' }));

    const list = await m.uninstallPlugin('u3', true);
    expect(list).toHaveLength(0);
    expect(fs.existsSync(path.join(userDir, 'u3'))).toBe(false);
    expect(getDeviceProfiles()).toHaveLength(0);
  });
});

describe('rescan', () => {
  it('adds new dir as inactive and removes deleted dir, without reloading existing', async () => {
    makePlugin(
      path.join(userDir, 'keep'),
      manifest('keep', ['device:register'], true),
      `export function activate(ctx) {
        ctx.device.registerProfiles([{ name: 'Keep', patterns: ['k'] }]);
      }`
    );
    const m = newManager(userDir);
    await m.loadAll();
    expect(m.list()).toHaveLength(1);
    expect(m.list()[0].status).toBe('active');

    // 新增一个插件目录
    makePlugin(
      path.join(userDir, 'added'),
      manifest('added', [], false),
      `export function activate() {}`
    );
    // 删除已有插件目录
    fs.rmSync(path.join(userDir, 'keep'), { recursive: true, force: true });

    const list = await m.rescan();
    expect(list.map((p) => p.id).sort()).toEqual(['added']);

    const keep = list.find((p) => p.id === 'keep');
    const added = list.find((p) => p.id === 'added');
    expect(keep).toBeUndefined();
    expect(added?.enabled).toBe(false);
    expect(added?.status).toBe('disabled');
    // 被移除的插件贡献已回收
    expect(getDeviceProfiles()).toHaveLength(0);
  });

  it('does not reload an unchanged existing plugin', async () => {
    makePlugin(
      path.join(userDir, 'stable'),
      manifest('stable', ['device:register'], true),
      `export function activate(ctx) {
        ctx.device.registerProfiles([{ name: 'Stable', patterns: ['s'] }]);
      }`
    );
    const m = newManager(userDir);
    await m.loadAll();
    const before = m.getRuntime('stable');
    const sig = before?.signature;

    await m.rescan();
    const after = m.getRuntime('stable');
    expect(after?.status).toBe('active');
    expect(after?.signature).toBe(sig);
    expect(getDeviceProfiles()).toContainEqual(expect.objectContaining({ name: 'Stable' }));
  });
});

describe('syncFromDisk (hot reload)', () => {
  it('reloads a modified plugin keeping enabled state (deactivate → reactivate)', async () => {
    const entryCode = (name: string) => `export function activate(ctx) {
  ctx.device.registerProfiles([{ name: '${name}', patterns: ['${name.toLowerCase()}'] }]);
}
export function deactivate() {
  globalThis.__hotDeactivateCount = (globalThis.__hotDeactivateCount || 0) + 1;
}`;
    makePlugin(
      path.join(userDir, 'hot'),
      manifest('hot', ['device:register'], true),
      entryCode('A')
    );
    const m = newManager(userDir);
    await m.loadAll();

    const before = m.getRuntime('hot')!;
    expect(before.status).toBe('active');
    expect(before.importVersion).toBe(0);
    const sig0 = before.signature;
    expect(getDeviceProfiles()).toContainEqual(expect.objectContaining({ name: 'A' }));

    // 修改入口文件，并显式改变 mtime 以确保签名变化
    const entry = path.join(userDir, 'hot', 'index.mjs');
    fs.writeFileSync(entry, entryCode('B'));
    fs.utimesSync(entry, new Date(), new Date(Date.now() + 5000));

    await m.syncFromDisk();

    const after = m.getRuntime('hot')!;
    expect(after.status).toBe('active');
    expect(after.enabled).toBe(true);
    expect(after.signature).not.toBe(sig0);
    // import 缓存失效版本递增（生产环境 Electron/Node 下使 ?v=n 生效，加载新代码）
    expect(after.importVersion).toBe(1);
    // deactivate 被调用，证明"停用 → 重新激活"完整闭环
    expect((globalThis as Record<string, unknown>).__hotDeactivateCount).toBe(1);
  });

  it('adds newly-created plugin as inactive', async () => {
    makePlugin(
      path.join(userDir, 'seed'),
      manifest('seed', [], true),
      `export function activate() {}`
    );
    const m = newManager(userDir);
    await m.loadAll();
    expect(m.list()).toHaveLength(1);

    makePlugin(
      path.join(userDir, 'newbie'),
      manifest('newbie', [], false),
      `export function activate() {}`
    );
    await m.syncFromDisk();

    const newbie = m.list().find((p) => p.id === 'newbie');
    expect(newbie?.enabled).toBe(false);
    expect(newbie?.status).toBe('disabled');
  });
});
