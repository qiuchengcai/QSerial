/**
 * PluginManager — 插件核心加载器
 *
 * 职责：
 * - 扫描插件目录，读取 package.json 清单；
 * - 加载入口模块（import()，不使用 eval / new Function）；
 * - 构建受限宿主 API 上下文并调用 activate(ctx)；
 * - 支持启用/禁用（即时生效），状态持久化；
 * - 加载失败隔离：单个插件崩溃/抛错不影响主程序与其他插件。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type { PluginInfo, PluginManifest, PluginPermission } from '@qserial/shared';
import { buildPluginContext } from './host-api.js';
import { removeAllContributions } from './registry.js';
import type { PluginManagerOptions, PluginModule, PluginRuntime } from './types.js';

const DEFAULT_DESCRIPTION = '';

/** 基于 import.meta.url 计算的 __dirname（ESM 下无内置 __dirname） */
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * 收集插件搜索目录（多候选去重，适配 dev 直启 / electron . / 打包等多种启动方式）。
 */
function collectSearchPaths(extraDirs: string[] = []): string[] {
  const candidates = new Set<string>();
  // 1. 相对编译产物目录上溯到仓库/应用根的 plugins（覆盖 electron <dist>/index.js 直启）
  candidates.add(path.resolve(MODULE_DIR, '../../../plugins'));
  // 2. electron app.getAppPath() / userData 目录（打包/标准启动）
  for (const dir of extraDirs) {
    candidates.add(path.join(dir, 'plugins'));
  }
  // 3. 进程工作目录回退
  candidates.add(path.join(process.cwd(), 'plugins'));

  const result: string[] = [];
  for (const c of candidates) {
    if (fs.existsSync(c)) result.push(c);
  }
  return result;
}

function defaultSearchPaths(): Promise<string[]> {
  return import('electron')
    .then(({ app }) => {
      const extra: string[] = [];
      try {
        extra.push(app.getAppPath());
      } catch {
        /* ignore */
      }
      try {
        extra.push(app.getPath('userData'));
      } catch {
        /* ignore */
      }
      return collectSearchPaths(extra);
    })
    .catch(() => collectSearchPaths());
}

export class PluginManagerImpl {
  private runtimes = new Map<string, PluginRuntime>();
  private options: PluginManagerOptions = {};
  private listeners = new Set<() => void>();

  /** 注入依赖（测试用），并返回 this 便于链式调用 */
  configure(options: PluginManagerOptions): this {
    this.options = options;
    return this;
  }

  /** 监听插件集合变化（启用/禁用/加载） */
  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    for (const cb of this.listeners) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  }

  private resolveSearchPaths(): Promise<string[]> {
    if (this.options.searchPaths) {
      return Promise.resolve(this.options.searchPaths());
    }
    return defaultSearchPaths();
  }

  /** 读取清单（package.json）。非法或非插件目录返回 null。 */
  private loadManifest(dir: string): PluginManifest | null {
    const manifestPath = path.join(dir, 'package.json');
    if (!fs.existsSync(manifestPath)) return null;

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      return null;
    }

    const qserial = (raw.qserial || {}) as Record<string, unknown>;
    const name = typeof raw.name === 'string' ? raw.name : '';
    // 无 main 且无 qserial 标记，视为普通目录而非插件
    const hasMain = typeof raw.main === 'string' && raw.main.length > 0;
    if (!name || (!hasMain && typeof raw.qserial !== 'object')) return null;

    const permissionsRaw = Array.isArray(qserial.permissions) ? qserial.permissions : [];
    const permissions = permissionsRaw.filter((p): p is PluginPermission => typeof p === 'string');

    return {
      id: typeof qserial.id === 'string' && qserial.id ? qserial.id : name,
      name,
      version: typeof raw.version === 'string' ? raw.version : '0.0.0',
      author: typeof raw.author === 'string' ? raw.author : undefined,
      description:
        (typeof qserial.description === 'string' && qserial.description) ||
        (typeof raw.description === 'string' && raw.description) ||
        DEFAULT_DESCRIPTION,
      main: hasMain ? (raw.main as string) : undefined,
      permissions,
      builtin: qserial.builtin === true,
    };
  }

  private isEnabledByDefault(manifest: PluginManifest): boolean {
    return manifest.builtin === true;
  }

  private resolveEnabled(manifest: PluginManifest): boolean {
    if (this.options.getEnabledState) {
      const persisted = this.options.getEnabledState(manifest.id);
      if (persisted !== undefined) return persisted;
    }
    return this.isEnabledByDefault(manifest);
  }

  private persistEnabled(id: string, enabled: boolean): void {
    this.options.setEnabledState?.(id, enabled);
  }

  private async activatePlugin(runtime: PluginRuntime): Promise<void> {
    const { manifest } = runtime;
    if (!manifest.main || !runtime.entryPath) {
      runtime.status = 'error';
      runtime.error = 'Plugin manifest is missing a "main" entry file';
      return;
    }

    try {
      const url = pathToFileURL(runtime.entryPath).href;
      const mod = (await import(url)) as PluginModule;
      runtime.module = mod;

      if (typeof mod.activate !== 'function') {
        throw new Error('Plugin entry module does not export an "activate" function');
      }

      const ctx = buildPluginContext(manifest);
      await mod.activate(ctx);
      runtime.status = 'active';
      runtime.error = undefined;
      console.log(`[Plugin] Activated: ${manifest.id} v${manifest.version}`);
    } catch (err) {
      runtime.status = 'error';
      runtime.error = err instanceof Error ? err.message : String(err);
      // 激活失败时回收可能已注册的部分贡献，避免残留
      removeAllContributions(runtime.id);
      console.error(`[Plugin] Failed to activate ${runtime.id}:`, runtime.error);
    }
  }

  private async deactivatePlugin(runtime: PluginRuntime): Promise<void> {
    try {
      if (runtime.module?.deactivate) {
        await runtime.module.deactivate();
      }
    } catch (err) {
      console.error(
        `[Plugin] Error during deactivate ${runtime.id}:`,
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      runtime.module = undefined;
      removeAllContributions(runtime.id);
      runtime.status = 'disabled';
      runtime.error = undefined;
    }
  }

  /** 扫描并加载所有插件，激活启用项。 */
  async loadAll(): Promise<void> {
    this.runtimes.clear();

    let dirs: string[];
    try {
      dirs = await this.resolveSearchPaths();
    } catch {
      dirs = [];
    }

    const discovered: PluginRuntime[] = [];
    const seenDirs = new Set<string>();

    for (const pluginsDir of dirs) {
      if (!fs.existsSync(pluginsDir)) continue;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(pluginsDir, entry.name);
        const manifest = this.loadManifest(dir);
        if (!manifest) continue;
        if (seenDirs.has(manifest.id)) continue; // 同名插件仅加载首个
        seenDirs.add(manifest.id);

        const runtime: PluginRuntime = {
          id: manifest.id,
          manifest,
          dir,
          entryPath: manifest.main ? path.join(dir, manifest.main) : undefined,
          enabled: this.resolveEnabled(manifest),
          status: 'disabled',
        };
        discovered.push(runtime);
      }
    }

    // 按 id 稳定排序，便于测试与 UI 展示
    discovered.sort((a, b) => a.id.localeCompare(b.id));

    for (const runtime of discovered) {
      this.runtimes.set(runtime.id, runtime);
      if (runtime.enabled) {
        await this.activatePlugin(runtime);
      }
    }

    this.notify();
  }

  /** 启用/禁用插件（即时生效），返回更新后的插件列表。 */
  async setEnabled(id: string, enabled: boolean): Promise<PluginInfo[]> {
    const runtime = this.runtimes.get(id);
    if (!runtime) {
      throw new Error(`Plugin not found: ${id}`);
    }
    if (runtime.enabled === enabled) {
      return this.list();
    }

    runtime.enabled = enabled;
    this.persistEnabled(id, enabled);

    if (enabled) {
      await this.activatePlugin(runtime);
    } else {
      await this.deactivatePlugin(runtime);
    }

    this.notify();
    return this.list();
  }

  /** 停用全部插件（应用退出前清理）。 */
  async deactivateAll(): Promise<void> {
    for (const runtime of this.runtimes.values()) {
      if (runtime.enabled) {
        await this.deactivatePlugin(runtime);
      }
    }
  }

  list(): PluginInfo[] {
    return Array.from(this.runtimes.values()).map((r) => ({
      id: r.id,
      name: r.manifest.name,
      version: r.manifest.version,
      author: r.manifest.author,
      description: r.manifest.description,
      permissions: r.manifest.permissions,
      enabled: r.enabled,
      status: r.status,
      error: r.error,
      builtin: r.manifest.builtin === true,
      hasMain: !!r.manifest.main,
    }));
  }

  getRuntime(id: string): PluginRuntime | undefined {
    return this.runtimes.get(id);
  }
}

export const pluginManager = new PluginManagerImpl();

export function getPluginManager(): PluginManagerImpl {
  return pluginManager;
}
