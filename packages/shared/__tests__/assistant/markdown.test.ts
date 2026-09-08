import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseInline, extractCodeLanguage } from '@qserial/shared';

describe('parseMarkdown', () => {
  it('解析标题层级', () => {
    const blocks = parseMarkdown('# 标题\n\n## 副标题');
    expect(blocks[0]).toEqual({ type: 'heading', level: 1, text: '标题' });
    expect(blocks[1]).toEqual({ type: 'heading', level: 2, text: '副标题' });
  });

  it('解析围栏代码块与语言', () => {
    const blocks = parseMarkdown('```js\nconst a = 1;\n```');
    expect(blocks[0]).toMatchObject({ type: 'code', language: 'js' });
    if (blocks[0].type === 'code') expect(blocks[0].code).toBe('const a = 1;');
  });

  it('解析无序与有序列表', () => {
    const blocks = parseMarkdown('- a\n- b\n\n1. x\n2. y');
    expect(blocks[0]).toMatchObject({ type: 'list', ordered: false });
    expect(blocks[1]).toMatchObject({ type: 'list', ordered: true });
    if (blocks[0].type === 'list') expect(blocks[0].items).toEqual(['a', 'b']);
  });

  it('解析表格', () => {
    const blocks = parseMarkdown('| 名 | 值 |\n| --- | --- |\n| a | 1 |');
    expect(blocks[0].type).toBe('table');
    if (blocks[0].type === 'table') {
      expect(blocks[0].header).toEqual(['名', '值']);
      expect(blocks[0].rows).toEqual([['a', '1']]);
    }
  });

  it('解析引用', () => {
    const blocks = parseMarkdown('> 引用内容');
    expect(blocks[0]).toMatchObject({ type: 'quote', text: '引用内容' });
  });

  it('合并连续普通行为段落', () => {
    const blocks = parseMarkdown('第一行\n第二行');
    expect(blocks[0]).toMatchObject({ type: 'paragraph', text: '第一行 第二行' });
  });
});

describe('parseInline', () => {
  it('解析粗体 / 斜体 / 行内代码', () => {
    const segs = parseInline('这是 **粗体** 和 `代码` 与 *斜体*');
    expect(segs).toContainEqual({ type: 'bold', content: '粗体' });
    expect(segs).toContainEqual({ type: 'code', content: '代码' });
    expect(segs).toContainEqual({ type: 'italic', content: '斜体' });
  });
});

describe('extractCodeLanguage', () => {
  it('提取语言标识', () => {
    expect(extractCodeLanguage('```typescript')).toBe('typescript');
    expect(extractCodeLanguage('```')).toBe('');
  });
});
