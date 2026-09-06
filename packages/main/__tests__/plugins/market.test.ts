/**
 * 插件市场主进程能力单元测试（sha256 / 定位插件根 / 安装校验 / 回滚前置）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('electron', () => ({
  app: {
    setName: () => {},
    getPath: (name: string) => (name === 'userData' ? '/tmp/qserial-test' : '/tmp'),
    getVersion: () => '1.1.0',
  },
}));

import { sha256Hex, sha256File, findPluginRoot, PluginMarket } from '../../src/plugins/market.ts';
import type { MarketPluginItem } from '@qserial/shared';

let tmpDir: string;
let userDir: string;

function item(overrides: Partial<MarketPluginItem> = {}): MarketPluginItem {
  return {
    id: 'pkg-a',
    name: 'Pkg A',
    version: '1.0.0',
    tags: [],
    downloadUrl: 'https://example.com/pkg-a.zip',
    hash: '',
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qserial-market-'));
  userDir = path.join(tmpDir, 'user');
  fs.mkdirSync(userDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('sha256', () => {
  it('computes sha256 hex of a buffer', () => {
    expect(sha256Hex(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('computes sha256 of a file', () => {
    const f = path.join(tmpDir, 'f.txt');
    fs.writeFileSync(f, 'hello');
    expect(sha256File(f)).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

describe('findPluginRoot', () => {
  it('returns dir when package.json at root', () => {
    const d = path.join(tmpDir, 'r1');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'package.json'), '{}');
    expect(findPluginRoot(d)).toBe(d);
  });

  it('finds single nested dir with package.json', () => {
    const d = path.join(tmpDir, 'r2');
    fs.mkdirSync(path.join(d, 'inner'), { recursive: true });
    fs.writeFileSync(path.join(d, 'inner', 'package.json'), '{}');
    expect(findPluginRoot(d)).toBe(path.join(d, 'inner'));
  });

  it('returns null when no package.json', () => {
    const d = path.join(tmpDir, 'r3');
    fs.mkdirSync(d, { recursive: true });
    expect(findPluginRoot(d)).toBeNull();
  });
});

describe('PluginMarket installFromMarket', () => {
  function makeMarket(): PluginMarket {
    return new PluginMarket().configure({
      userPluginsDir: async () => userDir,
      download: async (_url, dest, onData) => {
        fs.writeFileSync(dest, Buffer.from('zip-content'));
        onData(11, 11);
      },
      extract: async (_zipPath, destDir) => {
        fs.mkdirSync(path.join(destDir, 'pkg'), { recursive: true });
        fs.writeFileSync(
          path.join(destDir, 'pkg', 'package.json'),
          JSON.stringify({
            name: 'pkg-a',
            version: '1.0.0',
            main: 'index.mjs',
            qserial: { id: 'pkg-a', permissions: [] },
          })
        );
        fs.writeFileSync(path.join(destDir, 'pkg', 'index.mjs'), 'export function activate() {}');
      },
      hostVersion: () => '1.1.0',
    });
  }

  it('rejects on sha256 mismatch', async () => {
    const market = makeMarket();
    await expect(market.installFromMarket(item({ hash: 'deadbeef' }))).rejects.toThrow(
      /完整性校验失败|sha256/
    );
  });

  it('rejects when host version below minHostVersion', async () => {
    const market = makeMarket();
    await expect(
      market.installFromMarket(
        item({ minHostVersion: '9.0.0', hash: sha256Hex(Buffer.from('zip-content')) })
      )
    ).rejects.toThrow(/宿主版本/);
  });

  it('rejects unsafe download url', async () => {
    const market = makeMarket();
    await expect(
      market.installFromMarket(item({ downloadUrl: 'http://evil.example.com/x.zip' }))
    ).rejects.toThrow(/不安全的下载地址/);
  });
});
