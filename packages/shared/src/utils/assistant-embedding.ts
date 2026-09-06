/**
 * 轻量本地向量化（纯 JS，零依赖，无外部服务）。
 *
 * 选型理由（详见报告）：
 *  - 插件运行时无法可靠加载第三方 npm 依赖（插件目录无独立 node_modules）；
 *  - 隐私要求「默认不联网」，不能依赖远端 embedding 服务或下载模型；
 *  - 10 模块 / 100 文档 / 10 万字规模下，字符 n-gram 特征哈希 + 余弦相似度
 *    可在 <500ms 内完成检索，且无需训练。
 *
 * 实现：对英文单词 + 中文字符做 1/2/3-gram 特征哈希（signed hashing trick），
 * 得到稀疏向量后做 L2 归一化，余弦相似度即点积。
 * 若用户配置了 OpenAI 兼容的 embedding 端点，主进程会改用真实向量（见插件 llm.mjs）。
 */

/** 特征哈希（FNV-1a 32bit，确定性）。 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 分词：英文/数字单词 + 单个中文字符。 */
export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const tokens: string[] = [];
  const wordRe = /[a-z0-9_]+/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(normalized)) !== null) {
    tokens.push(m[0]);
  }
  for (const ch of normalized) {
    if (/[\u4e00-\u9fff]/.test(ch)) tokens.push(ch);
  }
  return tokens;
}

/** 由 token 序列生成 n-gram。 */
export function ngrams(tokens: string[], n: number): string[] {
  if (n <= 1) return tokens.slice();
  const result: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    result.push(tokens.slice(i, i + n).join('|'));
  }
  return result;
}

/** 生成文本的哈希向量（已 L2 归一化）。 */
export function hashEmbedding(text: string, dims = 512): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = tokenize(text);
  const grams = [...tokens.map((t) => `w:${t}`), ...ngrams(tokens, 2), ...ngrams(tokens, 3)];
  for (const g of grams) {
    const h = fnv1a(g);
    const idx = h % dims;
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[idx] += sign;
  }
  return normalize(vec);
}

/** L2 归一化（零向量返回原样，避免除零）。 */
export function normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/** 余弦相似度（向量需已归一化，则等于点积）。 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}
