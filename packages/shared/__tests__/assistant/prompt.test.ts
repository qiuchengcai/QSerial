import { describe, it, expect } from 'vitest';
import {
  buildPrompt,
  formatHistory,
  describeDeviceContext,
  ASSISTANT_SYSTEM_PROMPT,
} from '@qserial/shared';

describe('formatHistory', () => {
  it('格式化最近 N 轮', () => {
    const text = formatHistory(
      [
        { role: 'user', content: '问题1' },
        { role: 'assistant', content: '回答1' },
      ],
      1
    );
    expect(text).toContain('用户：问题1');
    expect(text).toContain('助手：回答1');
  });
  it('空历史返回空串', () => {
    expect(formatHistory([])).toBe('');
  });
});

describe('describeDeviceContext', () => {
  it('序列化串口参数', () => {
    const text = describeDeviceContext({ type: 'serial', baudRate: 115200, dataBits: 8 });
    expect(text).toContain('115200');
    expect(text).toContain('serial');
  });
  it('无上下文返回空串', () => {
    expect(describeDeviceContext(undefined)).toBe('');
  });
});

describe('buildPrompt', () => {
  it('包含参考资料与问题', () => {
    const { system, user } = buildPrompt({
      query: 'CRC 怎么算',
      chunks: [{ moduleName: 'Modbus', documentTitle: '帧格式', heading: 'CRC', snippet: 'CRC16 低字节在前' }],
    });
    expect(system).toBe(ASSISTANT_SYSTEM_PROMPT);
    expect(user).toContain('CRC16 低字节在前');
    expect(user).toContain('CRC 怎么算');
    expect(user).toContain('Modbus / 帧格式 / CRC');
  });

  it('无参考资料时标注', () => {
    const { user } = buildPrompt({ query: '问题', chunks: [] });
    expect(user).toContain('无参考资料');
  });

  it('携带设备上下文与历史', () => {
    const { user } = buildPrompt({
      query: 'q',
      chunks: [],
      context: { baudRate: 9600 },
      history: [{ role: 'user', content: 'hi' }],
    });
    expect(user).toContain('9600');
    expect(user).toContain('对话历史');
  });
});
