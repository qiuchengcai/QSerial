/**
 * 配置管理器
 */

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { AppConfig, DEFAULT_CONFIG } from '@qserial/shared';
import { EventEmitter } from 'events';

type ConfigChangeCallback = (key: string, value: unknown) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

class ConfigManagerImpl {
  private config: AppConfig;
  private configPath: string;
  private eventEmitter = new EventEmitter();
  private initialized = false;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'config.json');
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  /**
   * 初始化配置（损坏时自动从备份恢复）
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const bakPath = this.configPath + '.bak';
    const tmpPath = this.configPath + '.tmp';

    // 清理上次崩溃可能残留的临时文件
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }

    const loaded = this.tryLoad(this.configPath) || this.tryLoad(bakPath);

    if (loaded) {
      this.config = this.mergeConfig(
        DEFAULT_CONFIG as unknown as AnyRecord,
        loaded as AnyRecord
      ) as AppConfig;
      // 成功加载后立即更新备份
      try {
        const dir = path.dirname(bakPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(bakPath, JSON.stringify(this.config, null, 2), 'utf-8');
      } catch { /* 备份写入失败不影响正常运行 */ }
    }

    this.initialized = true;
  }

  private tryLoad(filePath: string): Record<string, unknown> | null {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        if (data.trim().startsWith('{')) {
          return JSON.parse(data);
        }
      }
    } catch { /* 损坏 → 尝试下一个来源 */ }
    return null;
  }

  /**
   * 深度合并配置
   */
  private mergeConfig(defaults: AnyRecord, user: AnyRecord): AnyRecord {
    const result = { ...defaults };

    for (const key in user) {
      if (Object.prototype.hasOwnProperty.call(user, key)) {
        const userValue = user[key];
        const defaultValue = defaults[key];

        if (
          typeof userValue === 'object' &&
          !Array.isArray(userValue) &&
          userValue !== null &&
          typeof defaultValue === 'object' &&
          !Array.isArray(defaultValue) &&
          defaultValue !== null
        ) {
          result[key] = this.mergeConfig(defaultValue, userValue);
        } else {
          result[key] = userValue;
        }
      }
    }

    return result;
  }

  /**
   * 保存配置（原子写入 + 备份）
   */
  private save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tmpPath = this.configPath + '.tmp';
      const bakPath = this.configPath + '.bak';
      const json = JSON.stringify(this.config, null, 2);

      // 1. 写临时文件
      fs.writeFileSync(tmpPath, json, 'utf-8');

      // 2. 如果已有旧配置，先备份
      if (fs.existsSync(this.configPath)) {
        try { fs.copyFileSync(this.configPath, bakPath); } catch { /* 备份失败不阻塞保存 */ }
      }

      // 3. 原子 rename（同文件系统上 rename 是原子的）
      fs.renameSync(tmpPath, this.configPath);
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  /**
   * 获取配置值
   */
  get<K extends keyof AppConfig>(key: K): AppConfig[K];
  get<T = unknown>(key: string): T | undefined;
  get(key: string): unknown {
    const keys = key.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let value: any = this.config;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * 设置配置值
   */
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void;
  set(key: string, value: unknown): void;
  set(key: string, value: unknown): void {
    const keys = key.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let obj: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in obj)) {
        obj[k] = {};
      }
      obj = obj[k];
    }

    obj[keys[keys.length - 1]] = value;
    this.save();
    this.eventEmitter.emit('change', key, value);
  }

  /**
   * 删除配置值
   */
  delete(key: string): void {
    const keys = key.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let obj: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]];
      if (!obj) return;
    }

    delete obj[keys[keys.length - 1]];
    this.save();
  }

  /**
   * 获取完整配置
   */
  getAll(): AppConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * 重置配置
   */
  reset(): void {
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    this.save();
  }

  /**
   * 监听配置变化
   */
  onChange(callback: ConfigChangeCallback): () => void {
    this.eventEmitter.on('change', callback);
    return () => this.eventEmitter.off('change', callback);
  }
}

export const ConfigManager = new ConfigManagerImpl();
