/**
 * 向量索引持久化（纯文件 JSON，零依赖）。
 * 每个模块一个索引文件，损坏时由 service 检测并自动重建。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { chunkText, hashEmbedding } from '@qserial/shared';

export function indexDir(dataDir) {
  return path.join(dataDir, 'index');
}

export function indexFile(dataDir, moduleId) {
  return path.join(indexDir(dataDir), `${moduleId}.json`);
}

/** 读取模块索引；缺失或损坏返回 null（触发重建）。 */
export function loadIndex(dataDir, moduleId) {
  try {
    const raw = fs.readFileSync(indexFile(dataDir, moduleId), 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries)) throw new Error('bad index');
    return parsed.entries;
  } catch {
    return null;
  }
}

/** 原子写入索引文件。 */
export function saveIndex(dataDir, moduleId, entries) {
  const dir = indexDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const target = indexFile(dataDir, moduleId);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, moduleId, entries }, null, 2), 'utf-8');
  fs.renameSync(tmp, target);
}

/** 删除模块索引文件。 */
export function removeIndex(dataDir, moduleId) {
  try {
    fs.rmSync(indexFile(dataDir, moduleId), { force: true });
  } catch {
    /* ignore */
  }
}

/** 单篇文档分块 + 向量化。 */
export function buildDocEntries(moduleId, docMeta, content, options) {
  const chunks = chunkText(content, {
    chunkSize: options.chunkSize,
    overlap: options.chunkOverlap,
  });
  return chunks.map((c, i) => ({
    chunkId: `${docMeta.id}:${i}`,
    moduleId,
    documentId: docMeta.id,
    documentTitle: docMeta.title,
    heading: c.heading,
    index: i,
    text: c.text,
    start: c.start,
    end: c.end,
    vector: hashEmbedding(c.text),
  }));
}

/**
 * 构建整个模块的索引条目（哈希向量，纯同步，无外部服务）。
 * `embeddingModel` 配置在 v1 预留，后续版本可在此处接入真实 embedding。
 */
export function buildModuleEntries(moduleId, docs, options) {
  const flat = [];
  for (const d of docs) {
    flat.push(...buildDocEntries(moduleId, d.meta, d.content, options));
  }
  return flat;
}
