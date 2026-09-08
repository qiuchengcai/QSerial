/**
 * 轻量 Markdown 解析（纯函数，零依赖）。
 * 覆盖标题、段落、列表、代码块、表格、引用，供渲染进程渐进渲染。
 * 不做完整 CommonMark 实现，只满足助手回答的常见格式。
 */

export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'quote'; text: string };

export type InlineSegment =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'code'; content: string };

/** 从围栏行提取语言标识，如 ```js → js。 */
export function extractCodeLanguage(fence: string): string {
  const m = /^`{3,}\s*(\S*)/.exec(fence);
  return m ? m[1] : '';
}

/** 解析行内片段：`code`、**bold**、*italic*。 */
export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  // 依次匹配 code / bold / italic
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'text', content: text.slice(last, m.index) });
    if (m[1]) segments.push({ type: 'code', content: m[1].slice(1, -1) });
    else if (m[2]) segments.push({ type: 'bold', content: m[2].slice(2, -2) });
    else if (m[3]) segments.push({ type: 'italic', content: m[3].slice(1, -1) });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', content: text.slice(last) });
  return segments;
}

/** 解析表格行：| a | b | → ['a','b']（去除首尾空单元格）。 */
function parseTableRow(line: string): string[] {
  const cells = line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
  return cells;
}

/** 判断是否为表格分隔行（如 | --- | --- |）。 */
function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');
}

/** 将 Markdown 文本解析为块序列。 */
export function parseMarkdown(text: string): MarkdownBlock[] {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 围栏代码块
    if (/^`{3,}/.test(line.trim())) {
      const language = extractCodeLanguage(line.trim());
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^`{3,}\s*$/.test(lines[i].trim())) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过结束围栏
      blocks.push({ type: 'code', language, code: code.join('\n') });
      continue;
    }

    // 标题
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, '').trim());
        i += 1;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }

    // 有序列表
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '').trim());
        i += 1;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    }

    // 引用
    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', text: quoteLines.join('\n') });
      continue;
    }

    // 表格：当前行含 | 且下一行是分隔行
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = parseTableRow(line);
      const rows: string[][] = [];
      i += 2; // 跳过表头与分隔行
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    // 段落（合并连续普通行）
    if (line.trim() !== '') {
      const para: string[] = [line.trim()];
      i += 1;
      while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|`{3,}|\s*[-*+]\s|\s*\d+[.)]\s|\s*>) /.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))) {
        para.push(lines[i].trim());
        i += 1;
      }
      blocks.push({ type: 'paragraph', text: para.join(' ') });
      continue;
    }

    // 空行
    i += 1;
  }

  return blocks;
}
