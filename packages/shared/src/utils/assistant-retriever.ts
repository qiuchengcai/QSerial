/**
 * RAG 检索（关键词 + 语义混合，纯函数）。
 * 调用方（插件 service）负责构建候选集（含向量）并传入，本模块仅做打分与排序。
 */

import { cosineSimilarity, tokenize, ngrams } from './assistant-embedding.js';

export interface RetrievalCandidate {
  text: string;
  /** 预计算的向量（可选；缺省时语义分记 0，退化为纯关键词检索） */
  vector?: number[];
}

export interface RankedHit<T extends RetrievalCandidate> {
  item: T;
  score: number;
  keywordScore: number;
  semanticScore: number;
}

export interface RankOptions {
  /** 关键词与语义的权重系数（0~1，默认 0.5） */
  alpha?: number;
  topK?: number;
}

/**
 * 关键词相似度（0~1）：查询与文档 token/gram 的重叠度。
 * 对英文单词 + 中文字符 + bigram 做重叠统计，缓解「词序不同但语义接近」的情况。
 */
export function keywordSimilarity(query: string, text: string): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;
  const qGrams = new Set([...qTokens, ...ngrams(qTokens, 2)]);
  const tTokens = tokenize(text);
  const tGrams = new Set([...tTokens, ...ngrams(tTokens, 2)]);

  let hits = 0;
  for (const g of qGrams) {
    if (tGrams.has(g)) hits += 1;
  }
  const coverage = hits / qGrams.size;
  return Math.min(1, coverage);
}

/** 融合关键词分与语义分。 */
export function combineScores(keyword: number, semantic: number, alpha = 0.5): number {
  return alpha * keyword + (1 - alpha) * semantic;
}

/**
 * 混合排序：对候选集按关键词 + 语义融合分降序返回 topK。
 */
export function rankCandidates<T extends RetrievalCandidate>(
  query: string,
  queryVector: number[],
  candidates: T[],
  options: RankOptions = {}
): RankedHit<T>[] {
  const alpha = Math.max(0, Math.min(1, options.alpha ?? 0.5));
  const topK = Math.max(1, options.topK ?? 5);

  const ranked = candidates.map((item) => {
    const keywordScore = keywordSimilarity(query, item.text);
    const semanticScore =
      item.vector && queryVector.length > 0
        ? Math.max(0, cosineSimilarity(queryVector, item.vector))
        : 0;
    const score = combineScores(keywordScore, semanticScore, alpha);
    return { item, score, keywordScore, semanticScore };
  });

  ranked.sort((a, b) => b.score - a.score || b.keywordScore - a.keywordScore);
  return ranked.slice(0, topK);
}
