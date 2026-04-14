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
   * 初始化配置
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const userConfig = JSON.parse(data);
        this.config = this.mergeConfig(
          DEFAULT_CONFIG as unknown as AnyRecord,
          userConfig as AnyRecord
        ) as AppConfig;
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }

    this.initialized = true;
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
   * 保存配置
   */
  private save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
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
