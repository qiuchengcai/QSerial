import { describe, it, expect } from 'vitest';
import {
  createConversation,
  fallbackConversationTitle,
  toConversationMeta,
  sortConversationsByUpdated,
  searchConversations,
  pruneConversationIds,
  buildMessage,
  isValidConversation,
} from '@qserial/shared';

describe('fallbackConversationTitle', () => {
  it('生成「新对话 + 日期」', () => {
    expect(fallbackConversationTitle(new Date('2026-09-07'))).toBe('新对话 2026-09-07');
  });
  it('接受时间戳数字', () => {
    expect(fallbackConversationTitle(new Date('2026-01-02').getTime())).toBe('新对话 2026-01-02');
  });
});

describe('createConversation', () => {
  it('补齐 id/标题/时间戳/空消息', () => {
    const c = createConversation('c1', 1000);
    expect(c.id).toBe('c1');
    expect(c.createdAt).toBe(1000);
    expect(c.messages).toEqual([]);
    expect(c.title).toContain('新对话');
  });
  it('无 id 时自动生成', () => {
    const c = createConversation();
    expect(c.id).toBeTruthy();
  });
});

describe('toConversationMeta', () => {
  it('提取标题与最后消息预览', () => {
    const c = createConversation('c1', 1000);
    c.messages = [
      buildMessage('m1', 'user', '你好'),
      buildMessage('m2', 'assistant', '这是回答内容很长很长'),
    ];
    const meta = toConversationMeta(c);
    expect(meta.id).toBe('c1');
    expect(meta.messageCount).toBe(2);
    expect(meta.lastPreview).toContain('这是回答内容');
  });
});

describe('sortConversationsByUpdated', () => {
  it('按更新时间降序', () => {
    const list = [
      { id: 'a', title: '', createdAt: 1, updatedAt: 1, messageCount: 0, lastPreview: '' },
      { id: 'b', title: '', createdAt: 1, updatedAt: 3, messageCount: 0, lastPreview: '' },
      { id: 'c', title: '', createdAt: 1, updatedAt: 2, messageCount: 0, lastPreview: '' },
    ];
    expect(sortConversationsByUpdated(list).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('searchConversations', () => {
  const list = [
    { id: 'a', title: 'Modbus 问题', createdAt: 1, updatedAt: 1, messageCount: 0, lastPreview: 'CRC 计算' },
    { id: 'b', title: 'AT 指令', createdAt: 1, updatedAt: 1, messageCount: 0, lastPreview: '连接 WiFi' },
  ];
  it('按标题匹配', () => {
    expect(searchConversations(list, 'modbus').map((x) => x.id)).toEqual(['a']);
  });
  it('按预览匹配', () => {
    expect(searchConversations(list, 'wifi').map((x) => x.id)).toEqual(['b']);
  });
  it('空关键词返回全部', () => {
    expect(searchConversations(list, '').length).toBe(2);
  });
});

describe('pruneConversationIds', () => {
  it('返回最旧的需要删除的 id', () => {
    const list = [
      { id: 'old1', title: '', createdAt: 1, updatedAt: 1, messageCount: 0, lastPreview: '' },
      { id: 'new', title: '', createdAt: 1, updatedAt: 5, messageCount: 0, lastPreview: '' },
      { id: 'old2', title: '', createdAt: 1, updatedAt: 2, messageCount: 0, lastPreview: '' },
    ];
    expect(pruneConversationIds(list, 1)).toEqual(['old2', 'old1']);
  });
  it('未超限返回空', () => {
    const list = [{ id: 'a', title: '', createdAt: 1, updatedAt: 1, messageCount: 0, lastPreview: '' }];
    expect(pruneConversationIds(list, 50)).toEqual([]);
  });
});

describe('buildMessage / isValidConversation', () => {
  it('构建消息并带元数据', () => {
    const m = buildMessage('m1', 'assistant', '内容', { tokens: 10 });
    expect(m.metadata?.tokens).toBe(10);
  });
  it('校验会话对象', () => {
    expect(isValidConversation({ id: 'x', messages: [] })).toBe(true);
    expect(isValidConversation(null)).toBe(false);
    expect(isValidConversation({ id: 'x', messages: 'bad' })).toBe(false);
  });
});
