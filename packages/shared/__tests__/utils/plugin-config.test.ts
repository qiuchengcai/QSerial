/**
 * 插件配置工具单元测试（getDefaultConfig / validatePluginConfig）
 */

import { describe, it, expect } from 'vitest';
import { getDefaultConfig, validatePluginConfig } from '@qserial/shared';
import type { PluginConfigSchema } from '@qserial/shared';

const schema: PluginConfigSchema = {
  fields: [
    { key: 'name', label: '名称', type: 'string', required: true, default: 'dev' },
    { key: 'baud', label: '波特率', type: 'number', min: 300, max: 921600, default: 115200 },
    { key: 'auto', label: '自动', type: 'boolean', default: false },
    {
      key: 'mode',
      label: '模式',
      type: 'select',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      default: 'a',
    },
    { key: 'note', label: '备注', type: 'textarea' },
  ],
};

describe('getDefaultConfig', () => {
  it('returns defaults for fields with default', () => {
    const cfg = getDefaultConfig(schema);
    expect(cfg).toEqual({ name: 'dev', baud: 115200, auto: false, mode: 'a' });
  });

  it('returns empty object when schema undefined or empty', () => {
    expect(getDefaultConfig(undefined)).toEqual({});
    expect(getDefaultConfig({ fields: [] })).toEqual({});
  });
});

describe('validatePluginConfig', () => {
  it('passes a valid config', () => {
    const errors = validatePluginConfig(schema, {
      name: 'prod',
      baud: 9600,
      auto: true,
      mode: 'b',
      note: 'hello',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects missing required field', () => {
    const errors = validatePluginConfig(schema, { baud: 9600 });
    expect(errors).toContainEqual({ key: 'name', code: 'required' });
  });

  it('rejects non-number for number field', () => {
    const errors = validatePluginConfig(schema, { name: 'x', baud: 'fast' });
    expect(errors).toContainEqual({ key: 'baud', code: 'not-a-number' });
  });

  it('rejects number below min', () => {
    const errors = validatePluginConfig(schema, { name: 'x', baud: 100 });
    expect(errors).toContainEqual({ key: 'baud', code: 'min' });
  });

  it('rejects number above max', () => {
    const errors = validatePluginConfig(schema, { name: 'x', baud: 9999999 });
    expect(errors).toContainEqual({ key: 'baud', code: 'max' });
  });

  it('rejects invalid select option', () => {
    const errors = validatePluginConfig(schema, { name: 'x', mode: 'zzz' });
    expect(errors).toContainEqual({ key: 'mode', code: 'invalid-option' });
  });

  it('returns no errors when schema undefined', () => {
    expect(validatePluginConfig(undefined, {})).toEqual([]);
  });
});
