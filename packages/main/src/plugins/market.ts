/**
 * 插件市场（主进程）
 * 能力：拉取远程索引、下载+sha256 校验+解压安装、更新（含回滚）、批量检查更新。
 *
 * 安全约束：
 * - 下载地址仅允许 https（http 本地回环可放行给自建源）；
 * - 安装前 sha256 校验，失败拒绝；
 * - 最低宿主版本校验，不兼容拒绝安装；
 * - 安装/更新失败自动回滚，不破坏已装插件。
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';
import type { MarketIndex, MarketPluginItem, PluginDownloadProgress } from '@qserial/shared';
import { validateMarketIndex, isVersionCompatible } from '@qserial/shared';
import { getPluginManager } from './manager.js';
import { isMockMarketEnabled, MOCK_MARKET_INDEX, generateMockPluginDir } from './mock-market.js';

type ProgressFn = (p: PluginDownloadProgress) => void;

export interface MarketOptions {
  /** 下载 url → 目标文件（可注入以便测试） */
  download?: (
    url: string,
    dest: string,
    onData: (transferred: number, total: number) => void
  ) => Promise<void>;
  /** 解压 zip（可注入） */
  extract?: (zipPath: string, destDir: string) => Promise<void>;
  /** 拉取索引原始 JSON（可注入） */
  fetchIndex?: (url: string) => Promise<unknown>;
  /** 用户插件目录 */
  userPluginsDir?: () => Promise<string>;
  /** 宿主版本 */
  hostVersion?: () => string;
}

/** sha256（hex） */
export function sha256Hex(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function sha256File(filePath: string): string {
  return sha256Hex(fs.readFileSync(filePath));
}

/** 流式下载（https/http），回调已下载/总字节。 */
export function downloadFile(
  url: string,
  dest: string,
  onData?: (transferred: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(downloadFile(res.headers.location, dest, onData));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`下载失败 HTTP ${res.statusCode}`));
        return;
      }
      const total = Number(res.headers['content-length'] || 0);
      let transferred = 0;
      const ws = fs.createWriteStream(dest);
      res.on('data', (chunk: Buffer) => {
        transferred += chunk.length;
        onData?.(transferred, total);
      });
      res.pipe(ws);
      ws.on('finish', () => {
        ws.close();
        resolve();
      });
      ws.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

/** 在解压目录中定位插件根目录（含 package.json）。 */
export function findPluginRoot(extractDir: string): string | null {
  if (fs.existsSync(path.join(extractDir, 'package.json'))) return extractDir;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(extractDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (fs.existsSync(path.join(extractDir, e.name, 'package.json'))) {
      return path.join(extractDir, e.name);
    }
  }
  return null;
}

export class PluginMarket {
  private options: MarketOptions = {};

  configure(options: MarketOptions): this {
    this.options = options;
    return this;
  }

  private async defaultUserPluginsDir(): Promise<string> {
    const { app } = await import('electron');
    const dir = path.join(app.getPath('userData'), 'plugins');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private async defaultExtract(zipPath: string, destDir: string): Promise<void> {
    const extract = (await import('extract-zip')).default;
    await extract(zipPath, { dir: destDir });
  }

  private async defaultFetchIndex(url: string): Promise<unknown> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`拉取索引失败 HTTP ${res.status}`);
    return res.json();
  }

  private async userPluginsDir(): Promise<string> {
    return this.options.userPluginsDir
      ? this.options.userPluginsDir()
      : this.defaultUserPluginsDir();
  }

  private hostVersion(): string {
    return this.options.hostVersion ? this.options.hostVersion() : '0.0.0';
  }

  private async download(
    url: string,
    dest: string,
    onData: (transferred: number, total: number) => void
  ): Promise<void> {
    if (this.options.download) return this.options.download(url, dest, onData);
    return downloadFile(url, dest, onData);
  }

  private async extract(zipPath: string, destDir: string): Promise<void> {
    if (this.options.extract) return this.options.extract(zipPath, destDir);
    return this.defaultExtract(zipPath, destDir);
  }

  async fetchMarketIndex(sourceUrl: string): Promise<MarketIndex> {
    // 开发联调：mock 开启时直接返回本地 mock 索引，不访问网络
    if (isMockMarketEnabled()) {
      return MOCK_MARKET_INDEX;
    }
    const fetchFn = this.options.fetchIndex || this.defaultFetchIndex;
    const raw = await fetchFn(sourceUrl);
    const index = validateMarketIndex(raw);
    if (!index) throw new Error('市场索引格式非法');
    return index;
  }

  /** 模拟下载进度（约 2 秒）。 */
  private mockProgress(item: MarketPluginItem, onProgress?: ProgressFn): Promise<void> {
    return new Promise((resolve) => {
      const total = 100;
      let percent = 0;
      const timer = setInterval(() => {
        percent += 10;
        if (percent >= 100) {
          percent = 100;
          clearInterval(timer);
          onProgress?.({ pluginId: item.id, percent, transferred: total, total });
          resolve();
        } else {
          onProgress?.({ pluginId: item.id, percent, transferred: percent, total });
        }
      }, 200);
    });
  }

  /** 校验下载地址与最低宿主版本。 */
  private assertCompatible(item: MarketPluginItem): void {
    if (
      !item.downloadUrl.startsWith('https://') &&
      !item.downloadUrl.startsWith('http://127.0.0.1') &&
      !item.downloadUrl.startsWith('http://localhost')
    ) {
      throw new Error(`不安全的下载地址: ${item.downloadUrl}`);
    }
    if (!isVersionCompatible(this.hostVersion(), item.minHostVersion)) {
      throw new Error(`插件 ${item.name} 要求宿主版本 >= ${item.minHostVersion}`);
    }
  }

  /** 下载 → sha256 校验 → 解压 → 返回插件根目录（临时目录内）。 */
  private async downloadAndExtract(
    item: MarketPluginItem,
    onProgress?: ProgressFn
  ): Promise<{ tmpRoot: string; pluginRoot: string }> {
    this.assertCompatible(item);
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qserial-market-'));
    const zipPath = path.join(tmpRoot, `${item.id}.zip`);
    const extractDir = path.join(tmpRoot, 'extract');

    try {
      await this.download(item.downloadUrl, zipPath, (transferred, total) => {
        const percent = total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0;
        onProgress?.({ pluginId: item.id, percent, transferred, total });
      });

      const hash = sha256File(zipPath);
      if (hash.toLowerCase() !== item.hash.toLowerCase()) {
        throw new Error(`插件 ${item.id} 完整性校验失败 (sha256 不匹配)`);
      }

      await this.extract(zipPath, extractDir);
      const pluginRoot = findPluginRoot(extractDir);
      if (!pluginRoot) {
        throw new Error(`插件压缩包内未找到 package.json`);
      }
      return { tmpRoot, pluginRoot };
    } catch (err) {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  /** 从市场安装插件（下载 → 校验 → 解压 → 移动到用户目录 → 加载，默认禁用）。 */
  async installFromMarket(item: MarketPluginItem, onProgress?: ProgressFn): Promise<void> {
    // mock 联调：模拟进度 + 生成示例插件目录
    if (isMockMarketEnabled()) {
      const userDir = await this.userPluginsDir();
      const target = path.join(userDir, item.id);
      if (fs.existsSync(target)) throw new Error(`插件已安装: ${item.id}`);
      await this.mockProgress(item, onProgress);
      generateMockPluginDir(item, target);
      await getPluginManager().rescan();
      return;
    }

    const { tmpRoot, pluginRoot } = await this.downloadAndExtract(item, onProgress);
    try {
      const userDir = await this.userPluginsDir();
      const target = path.join(userDir, item.id);
      if (fs.existsSync(target)) {
        throw new Error(`插件已安装: ${item.id}`);
      }
      fs.renameSync(pluginRoot, target);
      // 加载（默认禁用）
      await getPluginManager().rescan();
    } finally {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  /** 更新插件（下载新版本 → 备份旧目录 → 替换 → 重载，失败回滚）。 */
  async updatePlugin(
    pluginId: string,
    item: MarketPluginItem,
    onProgress?: ProgressFn
  ): Promise<void> {
    const manager = getPluginManager();
    const runtime = manager.getRuntime(pluginId);
    if (!runtime) throw new Error(`插件不存在: ${pluginId}`);

    // mock 联调：模拟进度 + 重新生成插件目录 + 重载
    if (isMockMarketEnabled()) {
      const userDir = await this.userPluginsDir();
      const target = path.join(userDir, pluginId);
      await this.mockProgress(item, onProgress);
      generateMockPluginDir(item, target);
      await manager.reloadPlugin(pluginId);
      return;
    }

    const { tmpRoot, pluginRoot } = await this.downloadAndExtract(item, onProgress);
    try {
      const userDir = await this.userPluginsDir();
      const target = path.join(userDir, pluginId);
      if (!fs.existsSync(target)) throw new Error(`插件目录缺失: ${target}`);

      const backup = `${target}.bak.${Date.now()}`;
      fs.renameSync(target, backup); // 备份旧目录
      try {
        fs.renameSync(pluginRoot, target); // 放入新目录
        await manager.reloadPlugin(pluginId);
        const rt = manager.getRuntime(pluginId);
        if (rt && rt.status === 'error') {
          throw new Error(`插件激活失败: ${rt.error || 'unknown'}`);
        }
        fs.rmSync(backup, { recursive: true, force: true });
      } catch (err) {
        // 回滚
        try {
          fs.rmSync(target, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
        if (fs.existsSync(backup)) {
          fs.renameSync(backup, target);
          await manager.reloadPlugin(pluginId);
        }
        throw err;
      }
    } finally {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

export const pluginMarket = new PluginMarket();

export function getPluginMarket(): PluginMarket {
  return pluginMarket;
}
