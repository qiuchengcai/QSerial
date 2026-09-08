import { describe, it, expect } from 'vitest';
import {
  parseAnalysisResult,
  parseCommandResult,
  extractJson,
  DEFAULT_QUICK_PROMPTS,
  buildLogAnalysisPrompt,
} from '@qserial/shared';

describe('extractJson', () => {
  it('直接解析 JSON 字符串', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('从围栏代码块提取', () => {
    expect(extractJson('前缀\n```json\n{"a":1}\n```\n后缀')).toEqual({ a: 1 });
  });
  it('从首尾花括号提取', () => {
    expect(extractJson('说明：{"a":1}结束')).toEqual({ a: 1 });
  });
  it('非法输入返回 null', () => {
    expect(extractJson('不是 JSON')).toBeNull();
  });
});

describe('parseAnalysisResult', () => {
  it('解析完整结构化结果', () => {
    const r = parseAnalysisResult(
      JSON.stringify({
        protocol: 'Modbus RTU',
        confidence: 0.9,
        keyFields: [{ label: '功能码', value: '0x03' }],
        anomalies: [{ type: 'crc_error', description: 'CRC 校验失败', severity: 'high' }],
        suggestions: ['检查波特率'],
      })
    );
    expect(r?.protocol).toBe('Modbus RTU');
    expect(r?.confidence).toBe(0.9);
    expect(r?.keyFields[0].value).toBe('0x03');
    expect(r?.anomalies[0].severity).toBe('high');
    expect(r?.suggestions).toEqual(['检查波特率']);
  });

  it('围栏包裹的 JSON 也能解析', () => {
    const r = parseAnalysisResult('```json\n{"protocol":"AT","confidence":0.5,"keyFields":[],"anomalies":[],"suggestions":[]}\n```');
    expect(r?.protocol).toBe('AT');
  });

  it('非法结果返回 null（降级纯文本）', () => {
    expect(parseAnalysisResult('这不是结构化结果')).toBeNull();
    expect(parseAnalysisResult('{"protocol":"x"}')).not.toBeNull();
  });

  it('非法 severity 回退 medium', () => {
    const r = parseAnalysisResult('{"protocol":"x","anomalies":[{"type":"t","description":"d","severity":"??"}]}');
    expect(r?.anomalies[0].severity).toBe('medium');
  });
});

describe('parseCommandResult', () => {
  it('解析命令结果', () => {
    const r = parseCommandResult('{"hex":"01 03 00 00 00 01","ascii":"","explanation":"读寄存器"}');
    expect(r?.hex).toBe('01 03 00 00 00 01');
    expect(r?.explanation).toBe('读寄存器');
  });
  it('缺 hex 与 ascii 返回 null', () => {
    expect(parseCommandResult('{"hex":"","ascii":"","explanation":"x"}')).toBeNull();
  });
});

describe('DEFAULT_QUICK_PROMPTS', () => {
  it('提供 6 个默认快捷指令', () => {
    expect(DEFAULT_QUICK_PROMPTS).toHaveLength(6);
    expect(DEFAULT_QUICK_PROMPTS.some((p) => p.category === 'generate')).toBe(true);
  });
});

describe('buildLogAnalysisPrompt', () => {
  it('包含日志与设备参数', () => {
    const { system, user } = buildLogAnalysisPrompt('日志内容', { baudRate: 115200 });
    expect(system).toContain('JSON');
    expect(user).toContain('日志内容');
    expect(user).toContain('115200');
  });
});
