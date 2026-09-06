import { describe, it, expect } from 'vitest';
import {
  keywordSimilarity,
  combineScores,
  rankCandidates,
  hashEmbedding,
} from '@qserial/shared';

describe('keywordSimilarity', () => {
  it('完全匹配得分高于部分匹配', () => {
    const full = keywordSimilarity('Modbus CRC', 'Modbus CRC 校验计算');
    const partial = keywordSimilarity('Modbus CRC', 'Modbus 协议功能码');
    expect(full).toBeGreaterThan(partial);
  });
  it('无关文本得分为 0', () => {
    expect(keywordSimilarity('Modbus', 'AT 指令')).toBe(0);
  });
  it('空查询得分为 0', () => {
    expect(keywordSimilarity('', '任意内容')).toBe(0);
  });
});

describe('combineScores', () => {
  it('按权重融合', () => {
    expect(combineScores(0.8, 0.4, 0.5)).toBeCloseTo(0.6, 5);
    expect(combineScores(0.8, 0.4, 1)).toBeCloseTo(0.8, 5);
    expect(combineScores(0.8, 0.4, 0)).toBeCloseTo(0.4, 5);
  });
});

describe('rankCandidates', () => {
  const query = '串口乱码怎么排查';
  const qVec = hashEmbedding(query);

  it('按分数降序返回', () => {
    const candidates = [
      { text: '串口通信出现乱码通常由波特率不一致导致', vector: hashEmbedding('串口通信出现乱码通常由波特率不一致导致') },
      { text: 'Modbus 功能码 03 读寄存器', vector: hashEmbedding('Modbus 功能码 03 读寄存器') },
      { text: '串口乱码排查步骤：检查波特率、数据位、校验位', vector: hashEmbedding('串口乱码排查步骤：检查波特率、数据位、校验位') },
    ];
    const ranked = rankCandidates(query, qVec, candidates, { topK: 3 });
    expect(ranked).toHaveLength(3);
    expect(ranked[0].item.text).toContain('乱码');
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });

  it('限制 topK', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      text: `文档 ${i}`,
      vector: hashEmbedding(`文档 ${i}`),
    }));
    expect(rankCandidates(query, qVec, candidates, { topK: 3 })).toHaveLength(3);
  });

  it('无向量候选退化为纯关键词检索（语义分为 0）', () => {
    const candidates = [{ text: '串口乱码' }, { text: '完全无关内容' }];
    const ranked = rankCandidates(query, qVec, candidates);
    expect(ranked[0].item.text).toBe('串口乱码');
    expect(ranked[0].semanticScore).toBe(0);
    expect(ranked[0].keywordScore).toBeGreaterThan(0);
  });

  it('alpha=0 时仅按语义分排序', () => {
    const good = { text: 'xxx', vector: qVec.slice() }; // 与查询向量相同
    const bad = { text: '乱码乱码乱码', vector: hashEmbedding('完全不相关的话题') };
    const ranked = rankCandidates(query, qVec, [bad, good], { alpha: 0, topK: 2 });
    expect(ranked[0].item).toBe(good);
  });
});
