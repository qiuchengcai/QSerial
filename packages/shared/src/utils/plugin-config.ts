/**
 * 插件配置工具函数（纯函数，供渲染进程表单与单元测试复用）。
 */

import type { PluginConfigSchema } from '../types/plugin.js';

/**
 * 校验错误码。
 */
export type PluginConfigErrorCode = 'required' | 'not-a-number' | 'min' | 'max' | 'invalid-option';

export interface PluginConfigError {
  key: string;
  code: PluginConfigErrorCode;
}

/**
 * 将嵌套对象拍平为「点分隔键」的扁平对象。
 * ConfigManager 以点号键存储时会形成嵌套结构，渲染进程配置面板按 schema 的
 * 点号 field.key 读取，因此读取时需拍平还原。
 */
export function flattenConfig(
  obj: Record<string, unknown>,
  prefix = '',
  out: Record<string, unknown> = {}
): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenConfig(v as Record<string, unknown>, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

/**
 * 根据 schema 生成默认配置对象。
 */
export function getDefaultConfig(schema?: PluginConfigSchema): Record<string, unknown> {
  if (!schema?.fields) return {};
  const out: Record<string, unknown> = {};
  for (const f of schema.fields) {
    if (f.default !== undefined) out[f.key] = f.default;
  }
  return out;
}

/**
 * 校验配置值（required、number 类型与范围、select 取值合法性）。
 * 返回错误列表（空数组表示校验通过）。
 */
export function validatePluginConfig(
  schema: PluginConfigSchema | undefined,
  values: Record<string, unknown>
): PluginConfigError[] {
  const errors: PluginConfigError[] = [];
  if (!schema?.fields) return errors;

  for (const f of schema.fields) {
    const v = values[f.key];

    if (f.required && (v === undefined || v === null || v === '')) {
      errors.push({ key: f.key, code: 'required' });
      continue;
    }

    if (f.type === 'number' && v !== undefined && v !== null && v !== '') {
      if (typeof v !== 'number' || Number.isNaN(v)) {
        errors.push({ key: f.key, code: 'not-a-number' });
      } else if (f.min !== undefined && v < f.min) {
        errors.push({ key: f.key, code: 'min' });
      } else if (f.max !== undefined && v > f.max) {
        errors.push({ key: f.key, code: 'max' });
      }
    }

    if (f.type === 'select' && v !== undefined && v !== null && v !== '') {
      const options = f.options || [];
      if (options.length > 0 && !options.some((o) => o.value === v)) {
        errors.push({ key: f.key, code: 'invalid-option' });
      }
    }
  }

  return errors;
}
