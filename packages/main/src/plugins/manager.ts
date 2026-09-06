/**
 * PluginManager — 插件核心加载器
 *
 * 职责：
 * - 扫描插件目录，读取 package.json 清单；
 * - 加载入口模块（import()，不使用 eval / new Function）；
 * - 构建受限宿主 API 上下文并调用 activate(ctx)；
 * - 支持启用/禁用（即时生效），状态持久化；
 * - 运行时热加载：目录监听（fs.watch）→ 增量同步（新增/删除/修改重载）；
 * - 运行时安装/卸载、手动重扫；
 * - 加载失败隔离：单个插件崩溃/抛错不影响主程序与其他插件。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type {
  PluginInfo,
  PluginManifest,
  PluginPermission,
  PluginConfigSchema,
  PluginConfigField,
  PluginConfigFieldType,
} from '@qserial/shared';
import { ConfigManager } from '../config/manager.js';
import { buildPluginContext, removePluginConfigSubscriptions } from './host-api.js';
import { removeAllContributions } from './registry.js';
import type { PluginManagerOptions, PluginModule, PluginRuntime } from './types.js';

const DEFAULT_DESCRIPTION = '';
const WATCH_DEBOUNCE_MS = 400;

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
  private watchers: fs.FSWatcher[] = [];
  private watchTimer: ReturnType<typeof setTimeout> | null = null;

  /** 注入依赖（测试用），并返回 this 便于链式调用 */
  configure(options: PluginManagerOptions): this {
    this.options = options;
    return this;
  }

  /** 监听插件集合变化（启用/禁用/加载/安装/卸载/重扫/热重载） */
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

  /** 用户插件目录（安装目标 / 卸载删除范围判定）。默认 electron userData/plugins。 */
  private async resolveUserPluginsDir(): Promise<string> {
    if (this.options.userPluginsDir) return this.options.userPluginsDir();
    const { app } = await import('electron');
    const dir = path.join(app.getPath('userData'), 'plugins');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
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
      configSchema: this.parseConfigSchema(qserial),
    };
  }

  /** 从 qserial.configSchema 解析并规范化配置项声明（宽松校验，非法字段忽略）。 */
  private parseConfigSchema(qserial: Record<string, unknown>): PluginConfigSchema | undefined {
    const raw = qserial.configSchema;
    if (!raw || typeof raw !== 'object') return undefined;
    const fieldsRaw = (raw as Record<string, unknown>).fields;
    if (!Array.isArray(fieldsRaw)) return undefined;

    const fields: PluginConfigField[] = [];
    for (const f of fieldsRaw) {
      if (!f || typeof f !== 'object') continue;
      const o = f as Record<string, unknown>;
      if (typeof o.key !== 'string' || typeof o.label !== 'string' || typeof o.type !== 'string') {
        continue;
      }
      const field: PluginConfigField = {
        key: o.key,
        label: o.label,
        type: o.type as PluginConfigFieldType,
      };
      if (o.default !== undefined) field.default = o.default as string | number | boolean;
      if (typeof o.description === 'string') field.description = o.description;
      if (o.required === true) field.required = true;
      if (typeof o.min === 'number') field.min = o.min;
      if (typeof o.max === 'number') field.max = o.max;
      if (Array.isArray(o.options)) {
        const options: Array<{ value: string; label: string }> = [];
        for (const opt of o.options) {
          if (opt && typeof opt === 'object') {
            const p = opt as Record<string, unknown>;
            if (typeof p.value === 'string' && typeof p.label === 'string') {
              options.push({ value: p.value, label: p.label });
            }
          }
        }
        field.options = options;
      }
      fields.push(field);
    }

    return fields.length > 0 ? { fields } : undefined;
  }

  private isEnabledByDefault(manifest: PluginManifest): boolean {
    return manifest.builtin === true;
  }

  private resolveEnabled(manifest: PluginManifest): boolean {
    const getter = this.options.getEnabledState || this.defaultGetEnabledState;
    const persisted = getter(manifest.id);
    if (persisted !== undefined) return persisted;
    return this.isEnabledByDefault(manifest);
  }

  private persistEnabled(id: string, enabled: boolean): void {
    const setter = this.options.setEnabledState || this.defaultSetEnabledState;
    setter(id, enabled);
  }

  private clearEnabled(id: string): void {
    const clearer = this.options.clearEnabledState || this.defaultClearEnabledState;
    clearer(id);
  }

  private defaultGetEnabledState(id: string): boolean | undefined {
    return ConfigManager.get<boolean>(`plugins.enabled.${id}`);
  }

  private defaultSetEnabledState(id: string, enabled: boolean): void {
    ConfigManager.set(`plugins.enabled.${id}`, enabled);
  }

  private defaultClearEnabledState(id: string): void {
    ConfigManager.delete(`plugins.enabled.${id}`);
  }

  private isHotReloadEnabled(): boolean {
    if (this.options.hotReload) return this.options.hotReload();
    return ConfigManager.get<boolean>('plugins.hotReload') !== false;
  }

  /** 计算变更检测签名（manifest 关键字段 + 入口 mtime） */
  private computeSignature(manifest: PluginManifest, dir: string): string {
    let mtime = 0;
    if (manifest.main) {
      try {
        mtime = fs.statSync(path.join(dir, manifest.main)).mtimeMs;
      } catch {
        mtime = 0;
      }
    }
    return (
      JSON.stringify({
        v: manifest.version,
        main: manifest.main,
        perms: manifest.permissions,
        builtin: manifest.builtin === true,
      }) + `|${mtime}`
    );
  }

  private createRuntime(dir: string, manifest: PluginManifest, enabled: boolean): PluginRuntime {
    return {
      id: manifest.id,
      manifest,
      dir,
      entryPath: manifest.main ? path.join(dir, manifest.main) : undefined,
      enabled,
      status: 'disabled',
      importVersion: 0,
      signature: this.computeSignature(manifest, dir),
    };
  }

  private async activatePlugin(runtime: PluginRuntime): Promise<void> {
    const { manifest } = runtime;
    if (!manifest.main || !runtime.entryPath) {
      runtime.status = 'error';
      runtime.error = 'Plugin manifest is missing a "main" entry file';
      return;
    }

    try {
      const version = runtime.importVersion || 0;
      const url = pathToFileURL(runtime.entryPath).href + (version > 0 ? `?v=${version}` : '');
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
      removePluginConfigSubscriptions(runtime.id);
      runtime.status = 'disabled';
      runtime.error = undefined;
    }
  }

  /** 扫描所有搜索目录，返回（去重后按 id 排序的）插件清单列表。 */
  private async scanDiscoveries(): Promise<Array<{ dir: string; manifest: PluginManifest }>> {
    const dirs = await this.resolveSearchPaths();
    const discovered: Array<{ dir: string; manifest: PluginManifest }> = [];
    const seen = new Set<string>();

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
        if (seen.has(manifest.id)) continue; // 同名插件仅加载首个
        seen.add(manifest.id);
        discovered.push({ dir, manifest });
      }
    }

    discovered.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
    return discovered;
  }

  /** 扫描并加载所有插件，激活启用项。 */
  async loadAll(): Promise<void> {
    this.runtimes.clear();

    const discovered = await this.scanDiscoveries();
    for (const d of discovered) {
      const runtime = this.createRuntime(d.dir, d.manifest, this.resolveEnabled(d.manifest));
      this.runtimes.set(runtime.id, runtime);
      if (runtime.enabled) {
        await this.activatePlugin(runtime);
      }
    }

    this.notify();
  }

  /** 从内存移除插件（停用 + 回收贡献 + 清理持久化状态），不删除磁盘文件。 */
  private async removeRuntime(runtime: PluginRuntime): Promise<void> {
    if (runtime.enabled) {
      await this.deactivatePlugin(runtime);
    } else {
      removeAllContributions(runtime.id);
    }
    this.runtimes.delete(runtime.id);
    this.clearEnabled(runtime.id);
  }

  /** 重载插件（停用 → 更新元数据 → 按原启用状态重新激活），import 缓存失效。 */
  private async reloadRuntime(
    runtime: PluginRuntime,
    dir: string,
    manifest: PluginManifest,
    signature: string
  ): Promise<void> {
    const wasEnabled = runtime.enabled;
    runtime.status = 'updating';
    this.notify();
    await this.deactivatePlugin(runtime);

    runtime.dir = dir;
    runtime.manifest = manifest;
    runtime.entryPath = manifest.main ? path.join(dir, manifest.main) : undefined;
    runtime.signature = signature;
    runtime.importVersion = (runtime.importVersion || 0) + 1;

    if (wasEnabled) {
      await this.activatePlugin(runtime);
    }
  }

  /** 手动全量重扫：新增（inactive）/ 移除（停用），不重复加载已有插件。 */
  async rescan(): Promise<PluginInfo[]> {
    const discovered = await this.scanDiscoveries();
    const discoveredIds = new Set(discovered.map((d) => d.manifest.id));

    for (const runtime of [...this.runtimes.values()]) {
      if (!discoveredIds.has(runtime.id)) {
        await this.removeRuntime(runtime);
      }
    }
    for (const d of discovered) {
      if (!this.runtimes.has(d.manifest.id)) {
        // 新增 → inactive（不自动激活）
        this.runtimes.set(d.manifest.id, this.createRuntime(d.dir, d.manifest, false));
      }
    }

    this.notify();
    return this.list();
  }

  /** 磁盘同步（目录监听触发）：新增 / 移除 / 修改重载。 */
  async syncFromDisk(): Promise<void> {
    const discovered = await this.scanDiscoveries();
    const discoveredIds = new Set(discovered.map((d) => d.manifest.id));

    for (const runtime of [...this.runtimes.values()]) {
      if (!discoveredIds.has(runtime.id)) {
        await this.removeRuntime(runtime);
      }
    }

    for (const d of discovered) {
      const existing = this.runtimes.get(d.manifest.id);
      if (!existing) {
        // 新增 → inactive
        this.runtimes.set(d.manifest.id, this.createRuntime(d.dir, d.manifest, false));
        continue;
      }
      const signature = this.computeSignature(d.manifest, d.dir);
      if (existing.signature !== signature) {
        await this.reloadRuntime(existing, d.dir, d.manifest, signature);
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

  /** 重新加载单个插件（停用 → 重新激活，保持原启用状态，import 缓存失效）。 */
  async reloadPlugin(id: string): Promise<PluginInfo[]> {
    const runtime = this.runtimes.get(id);
    if (!runtime) {
      throw new Error(`Plugin not found: ${id}`);
    }
    const signature = this.computeSignature(runtime.manifest, runtime.dir);
    await this.reloadRuntime(runtime, runtime.dir, runtime.manifest, signature);
    this.notify();
    return this.list();
  }

  /** 运行时安装：复制到用户插件目录 → 加载（默认禁用）。 */
  async installPlugin(sourcePath: string): Promise<PluginInfo[]> {
    const src = path.resolve(sourcePath);
    if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
      throw new Error(`无效的插件目录: ${sourcePath}`);
    }
    const manifest = this.loadManifest(src);
    if (!manifest) {
      throw new Error('目录不含合法的插件清单 (package.json)');
    }
    if (manifest.main && !fs.existsSync(path.join(src, manifest.main))) {
      throw new Error(`插件入口文件不存在: ${manifest.main}`);
    }
    if (this.runtimes.has(manifest.id)) {
      throw new Error(`插件已安装: ${manifest.id}`);
    }

    const userDir = await this.resolveUserPluginsDir();
    const targetDir = path.join(userDir, manifest.id);
    if (path.resolve(targetDir) !== src && fs.existsSync(targetDir)) {
      throw new Error(`目标目录已存在: ${targetDir}`);
    }
    if (path.resolve(targetDir) !== src) {
      fs.cpSync(src, targetDir, { recursive: true });
    }

    // 安装后默认禁用（安全）
    const runtime = this.createRuntime(targetDir, manifest, false);
    this.runtimes.set(runtime.id, runtime);
    this.clearEnabled(runtime.id);

    this.notify();
    return this.list();
  }

  /** 运行时卸载：停用 → 移除 → 删目录。内置插件禁止卸载，需 confirm。 */
  async uninstallPlugin(id: string, confirm: boolean): Promise<PluginInfo[]> {
    if (confirm !== true) {
      throw new Error('卸载插件需显式确认 (confirm=true)');
    }
    const runtime = this.runtimes.get(id);
    if (!runtime) {
      throw new Error(`插件不存在: ${id}`);
    }
    if (runtime.manifest.builtin === true) {
      throw new Error('内置插件不可卸载');
    }

    runtime.status = 'uninstalling';
    this.notify();

    await this.removeRuntime(runtime);

    // 仅删除用户目录下的插件文件（内置目录只读）
    const userDir = path.resolve(await this.resolveUserPluginsDir());
    const resolved = path.resolve(runtime.dir);
    if (resolved.startsWith(userDir + path.sep) || resolved === userDir) {
      try {
        fs.rmSync(resolved, { recursive: true, force: true });
      } catch (err) {
        console.error(`[Plugin] Failed to remove dir ${resolved}:`, err);
      }
    }

    this.notify();
    return this.list();
  }

  /** 停用全部插件（应用退出前清理）。 */
  async deactivateAll(): Promise<void> {
    this.stopWatcher();
    for (const runtime of this.runtimes.values()) {
      if (runtime.enabled) {
        await this.deactivatePlugin(runtime);
      }
    }
  }

  // ==================== 目录监听（热发现） ====================

  /** 启动目录监听。可配置关闭（plugins.hotReload=false），无监听时 no-op。 */
  async startWatcher(): Promise<void> {
    if (this.watchers.length > 0) return;
    if (!this.isHotReloadEnabled()) return;

    const dirs = await this.resolveSearchPaths();
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const watcher = fs.watch(dir, { recursive: true }, () => this.scheduleSync());
        watcher.on('error', () => {
          /* 忽略监听错误（如 asar 只读目录） */
        });
        this.watchers.push(watcher);
      } catch {
        /* ignore */
      }
    }
    if (this.watchers.length > 0) {
      console.log(`[Plugin] Watching ${this.watchers.length} plugin dir(s)`);
    }
  }

  stopWatcher(): void {
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
    this.watchers = [];
    if (this.watchTimer) {
      clearTimeout(this.watchTimer);
      this.watchTimer = null;
    }
  }

  private scheduleSync(): void {
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => {
      this.watchTimer = null;
      this.syncFromDisk().catch((err) => {
        console.error('[Plugin] syncFromDisk failed:', err);
      });
    }, WATCH_DEBOUNCE_MS);
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
      configSchema: r.manifest.configSchema,
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
