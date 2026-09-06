import { describe, it, expect } from 'vitest';
import {
  fnv1a,
  tokenize,
  ngrams,
  hashEmbedding,
  normalize,
  cosineSimilarity,
} from '@qserial/shared';

describe('fnv1a', () => {
  it('确定性哈希', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'));
    expect(fnv1a('hello')).not.toBe(fnv1a('world'));
  });
});

describe('tokenize', () => {
  it('拆分英文单词并保留中文字符', () => {
    const tokens = tokenize('Hello 世界 foo123');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('foo123');
    expect(tokens).toContain('世');
    expect(tokens).toContain('界');
  });
});

describe('ngrams', () => {
  it('生成 bigram', () => {
    expect(ngrams(['a', 'b', 'c'], 2)).toEqual(['a|b', 'b|c']);
  });
  it('n=1 时返回原 token', () => {
    expect(ngrams(['a', 'b'], 1)).toEqual(['a', 'b']);
  });
});

describe('hashEmbedding', () => {
  it('输出维度正确且已归一化', () => {
    const vec = hashEmbedding('串口调试 Modbus', 128);
    expect(vec).toHaveLength(128);
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('相同文本向量一致', () => {
    expect(hashEmbedding('abc')).toEqual(hashEmbedding('abc'));
  });
});

describe('cosineSimilarity', () => {
  it('相同向量相似度为 1', () => {
    const v = normalize([1, 2, 3]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });
  it('正交向量相似度为 0', () => {
    expect(cosineSimilarity(normalize([1, 0]), normalize([0, 1]))).toBeCloseTo(0, 5);
  });
  it('语义相近文本相似度高于无关文本', () => {
    const q = hashEmbedding('Modbus CRC 校验');
    const related = hashEmbedding('Modbus 协议 CRC16 计算方法');
    const unrelated = hashEmbedding('AT 指令 波特率 设置');
    expect(cosineSimilarity(q, related)).toBeGreaterThan(cosineSimilarity(q, unrelated));
  });
});
