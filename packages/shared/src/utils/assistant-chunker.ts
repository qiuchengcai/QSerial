/**
 * 文档分块策略（纯函数，无副作用）。
 * 按段落 + 字符数双重分割，保留标题层级信息，chunk 之间重叠避免上下文断裂。
 */

export interface ChunkOptions {
  /** 目标 chunk 字符数（默认 500） */
  chunkSize?: number;
  /** 相邻 chunk 重叠字符数（默认 50） */
  overlap?: number;
}

/** 分块草稿（不含 id/文档元信息，由调用方补全）。 */
export interface ChunkDraft {
  text: string;
  heading: string;
  start: number;
  end: number;
}

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_OVERLAP = 50;

/** 判断一行是否为 Markdown 标题，返回标题文本；否则返回 null。 */
export function parseHeadingLine(line: string): string | null {
  const m = /^\s*(#{1,6})\s+(.*?)\s*$/.exec(line);
  if (!m) return null;
  return m[2].trim();
}

/**
 * 将文本切分为带标题层级与字符偏移的 chunk。
 * 规则：
 *  1. 按空行切分为「逻辑块」，标题行独立成块并作为后续块的 heading；
 *  2. 相同 heading 的相邻块按 chunkSize 合并；
 *  3. 超过 chunkSize 的单块按字符硬切；
 *  4. 相邻 chunk 保留 overlap 个字符的重叠。
 */
export function chunkText(text: string, options: ChunkOptions = {}): ChunkDraft[] {
  const chunkSize = Math.max(50, options.chunkSize ?? DEFAULT_CHUNK_SIZE);
  const overlap = Math.max(0, Math.min(options.overlap ?? DEFAULT_OVERLAP, Math.floor(chunkSize / 2)));
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');

  // 第一遍：切逻辑块
  const blocks: ChunkDraft[] = [];
  let heading = '';
  let buf: string[] = [];
  let bufStart = -1;
  let offset = 0;

  const flush = (endOffset: number) => {
    const joined = buf.join('\n').trim();
    if (joined) {
      blocks.push({ text: joined, heading, start: bufStart, end: endOffset });
    }
    buf = [];
    bufStart = -1;
  };

  for (const line of lines) {
    const nextOffset = offset + line.length + 1;
    const title = parseHeadingLine(line);
    if (title !== null) {
      flush(offset);
      heading = title;
      offset = nextOffset;
      continue;
    }
    if (line.trim() === '') {
      flush(offset);
      offset = nextOffset;
      continue;
    }
    if (bufStart === -1) bufStart = offset;
    buf.push(line);
    offset = nextOffset;
  }
  flush(offset);

  // 第二遍：按字符数合并/硬切
  const chunks: ChunkDraft[] = [];
  let cur: ChunkDraft | null = null;

  for (const b of blocks) {
    if (b.text.length > chunkSize) {
      if (cur) {
        chunks.push(cur);
        cur = null;
      }
      let pos = 0;
      while (pos < b.text.length) {
        const end = Math.min(b.text.length, pos + chunkSize);
        chunks.push({
          text: b.text.slice(pos, end).trim(),
          heading: b.heading,
          start: b.start + pos,
          end: b.start + end,
        });
        pos = end;
      }
      continue;
    }
    if (!cur) {
      cur = { ...b };
      continue;
    }
    if (cur.heading === b.heading && cur.text.length + 2 + b.text.length <= chunkSize) {
      cur.text = cur.text + '\n\n' + b.text;
      cur.end = b.end;
      continue;
    }
    chunks.push(cur);
    cur = { ...b };
  }
  if (cur) chunks.push(cur);

  // 第三遍：重叠（把上一 chunk 尾部拼到下一 chunk 头部）
  if (overlap > 0 && chunks.length > 1) {
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      if (prev.text.length <= overlap) continue;
      const tail = prev.text.slice(-overlap);
      chunks[i].text = tail + '\n' + chunks[i].text;
      chunks[i].start = Math.max(0, chunks[i].start - overlap);
    }
  }

  return chunks;
}
