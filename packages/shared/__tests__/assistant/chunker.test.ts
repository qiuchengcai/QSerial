import { describe, it, expect } from 'vitest';
import { chunkText, parseHeadingLine } from '@qserial/shared';

describe('parseHeadingLine', () => {
  it('识别 1~6 级 Markdown 标题', () => {
    expect(parseHeadingLine('# 标题一')).toBe('标题一');
    expect(parseHeadingLine('### 三级')).toBe('三级');
    expect(parseHeadingLine('###### 六级')).toBe('六级');
  });

  it('非标题行返回 null', () => {
    expect(parseHeadingLine('普通文本')).toBeNull();
    expect(parseHeadingLine('')).toBeNull();
  });
});

describe('chunkText', () => {
  it('按空行切分段落并保留标题层级', () => {
    const text = '# 功能码\n\n01 读线圈\n\n03 读寄存器';
    const chunks = chunkText(text, { chunkSize: 100 });
    expect(chunks.length).toBeGreaterThan(0);
    // 所有块都归属到「功能码」标题下
    for (const c of chunks) {
      expect(c.heading).toBe('功能码');
    }
  });

  it('不同标题下的段落分属不同 chunk', () => {
    const text = '# A\n\n段落a\n\n# B\n\n段落b';
    const chunks = chunkText(text, { chunkSize: 100 });
    expect(chunks.some((c) => c.heading === 'A')).toBe(true);
    expect(chunks.some((c) => c.heading === 'B')).toBe(true);
  });

  it('相邻同标题段落按字符数合并', () => {
    const text = '段落一内容\n\n段落二内容';
    const chunks = chunkText(text, { chunkSize: 1000, overlap: 0 });
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain('段落一');
    expect(chunks[0].text).toContain('段落二');
  });

  it('超过 chunkSize 的段落被硬切', () => {
    const long = '字'.repeat(1200);
    const chunks = chunkText(long, { chunkSize: 500, overlap: 0 });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(500);
    }
  });

  it('相邻 chunk 存在重叠', () => {
    const text = 'ABCDEFGHIJ'.repeat(100); // 1000 字符
    const chunks = chunkText(text, { chunkSize: 500, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    const first = chunks[0].text;
    const second = chunks[1].text;
    expect(second.slice(0, 50)).toBe(first.slice(-50));
  });

  it('字符偏移 start/end 单调递增', () => {
    const text = '# 标题\n\n第一段内容\n\n第二段内容\n\n第三段内容';
    const chunks = chunkText(text, { chunkSize: 6, overlap: 0 });
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].start).toBeLessThanOrEqual(chunks[i].end);
      if (i > 0) expect(chunks[i].start).toBeGreaterThanOrEqual(chunks[i - 1].start);
    }
  });

  it('空文本返回空数组', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });
});
