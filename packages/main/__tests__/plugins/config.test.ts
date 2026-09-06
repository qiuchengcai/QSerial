/**
 * 插件配置读写 / 权限隔离 / 变更通知 / 单插件重载 单元测试
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

import { buildPluginContext } from '../../src/plugins/host-api.ts';
import { PluginManagerImpl } from '../../src/plugins/manager.ts';
import { ConfigManager } from '../../src/config/manager.ts';
import { getDeviceProfiles } from '../../src/plugins/registry.ts';
import type { PluginManifest } from '@qserial/shared';

let tmpDir: string;
const managers: PluginManagerImpl[] = [];
const testIds: string[] = [];

function manifest(id: string, permissions: string[], builtin: boolean): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    main: 'index.mjs',
    permissions: permissions as PluginManifest['permissions'],
    builtin,
  };
}

function makePlugin(dir: string, m: PluginManifest, entryCode: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: m.name,
        version: m.version,
        main: m.main,
        qserial: { id: m.id, permissions: m.permissions, builtin: m.builtin },
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(dir, 'index.mjs'), entryCode);
}

function newManager(searchDir: string): PluginManagerImpl {
  const state = new Map<string, boolean>();
  const m = new PluginManagerImpl().configure({
    searchPaths: () => [searchDir],
    userPluginsDir: () => searchDir,
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

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qserial-cfg-'));
  delete (globalThis as Record<string, unknown>).__cfgDeactivateCount;
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
  for (const id of testIds) {
    ConfigManager.delete(`plugins.namespace.${id}`);
  }
  testIds.length = 0;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ctx.config 权限隔离与读写', () => {
  it('reads/writes only its own namespace', () => {
    const idA = 'cfg-test-a';
    const idB = 'cfg-test-b';
    testIds.push(idA, idB);

    const ctxA = buildPluginContext(manifest(idA, ['config'], false));
    const ctxB = buildPluginContext(manifest(idB, ['config'], false));

    ctxA.config.set('foo', 1);
    ctxA.config.set('bar', 'x');

    expect(ctxA.config.get('foo')).toBe(1);
    expect(ctxA.config.getAll()).toEqual({ foo: 1, bar: 'x' });
    // B 无法读到 A 的配置（命名空间隔离）
    expect(ctxB.config.get('foo')).toBeUndefined();
    expect(ctxB.config.getAll()).toEqual({});
  });

  it('rejects config access without config permission', () => {
    const ctx = buildPluginContext(manifest('cfg-test-noperm', [], false));
    expect(() => ctx.config.get('k')).toThrow(/config/);
    expect(() => ctx.config.set('k', 'v')).toThrow(/config/);
    expect(() => ctx.config.getAll()).toThrow(/config/);
    expect(() => ctx.config.onChange(() => {})).toThrow(/config/);
  });

  it('notifies config change via ctx.config.onChange', () => {
    const id = 'cfg-test-notify';
    testIds.push(id);
    const ctx = buildPluginContext(manifest(id, ['config'], false));

    const events: Array<{ key: string; value: unknown }> = [];
    const unsub = ctx.config.onChange((e) => events.push(e));
    ctx.config.set('mode', 'b');
    ctx.config.set('baud', 9600);
    unsub();

    expect(events).toEqual([
      { key: 'mode', value: 'b' },
      { key: 'baud', value: 9600 },
    ]);

    // 取消订阅后不再收到通知
    ctx.config.set('after', 1);
    expect(events).toHaveLength(2);
  });
});

describe('reloadPlugin', () => {
  it('reloads a plugin keeping enabled state (deactivate → reactivate)', async () => {
    const entry = (name: string) => `export function activate(ctx) {
  ctx.device.registerProfiles([{ name: '${name}', patterns: ['${name.toLowerCase()}'] }]);
}
export function deactivate() {
  globalThis.__cfgDeactivateCount = (globalThis.__cfgDeactivateCount || 0) + 1;
}`;
    makePlugin(path.join(tmpDir, 'rp'), manifest('rp', ['device:register'], true), entry('A'));
    const m = newManager(tmpDir);
    await m.loadAll();

    const before = m.getRuntime('rp')!;
    expect(before.status).toBe('active');
    expect(before.importVersion).toBe(0);

    await m.reloadPlugin('rp');

    const after = m.getRuntime('rp')!;
    expect(after.status).toBe('active');
    expect(after.enabled).toBe(true);
    expect(after.importVersion).toBe(1);
    expect((globalThis as Record<string, unknown>).__cfgDeactivateCount).toBe(1);
    expect(getDeviceProfiles()).toContainEqual(expect.objectContaining({ name: 'A' }));
  });

  it('throws for unknown plugin id', async () => {
    const m = newManager(tmpDir);
    await m.loadAll();
    await expect(m.reloadPlugin('nope')).rejects.toThrow(/not found/i);
  });
});

describe('loadManifest configSchema 解析', () => {
  it('parses configSchema from package.json and drops invalid fields', async () => {
    const dir = path.join(tmpDir, 'sc');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify(
        {
          name: 'sc',
          version: '1.0.0',
          main: 'index.mjs',
          qserial: {
            id: 'sc',
            permissions: ['config'],
            configSchema: {
              fields: [
                { key: 'baud', label: '波特率', type: 'number', default: 115200, min: 300, max: 921600 },
                {
                  key: 'mode',
                  label: '模式',
                  type: 'select',
                  options: [{ value: 'a', label: 'A' }],
                  default: 'a',
                },
                { key: 'bad', label: '坏字段' },
              ],
            },
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(path.join(dir, 'index.mjs'), 'export function activate() {}');
    const m = newManager(tmpDir);
    await m.loadAll();

    const info = m.list()[0];
    expect(info.configSchema?.fields).toHaveLength(2);
    expect(info.configSchema?.fields[0]).toMatchObject({ key: 'baud', type: 'number', min: 300 });
    expect(info.configSchema?.fields[1]).toMatchObject({ key: 'mode', type: 'select' });
  });
});
