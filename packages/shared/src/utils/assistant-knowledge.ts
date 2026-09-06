/**
 * 知识库纯逻辑（模块/文档 CRUD 的校验、过滤、排序、导入导出）。
 * 文件 I/O 与索引在插件 store.mjs / vector-store.mjs 中完成。
 */

import type {
  KnowledgeModuleMeta,
  KnowledgeDocumentMeta,
  KnowledgeDocType,
} from '../types/assistant.js';

export interface ModuleInput {
  id?: string;
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
  type?: 'builtin' | 'custom';
}

export interface DocInput {
  id?: string;
  title: string;
  type?: KnowledgeDocType;
  content: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const MODULE_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** 从名称生成合法模块 ID（小写 + 连字符）。 */
export function slugifyModuleId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || `module-${Date.now().toString(36)}`;
}

/** 校验模块元信息。 */
export function validateModule(input: ModuleInput): ValidationResult {
  const errors: string[] = [];
  if (!input.name || !input.name.trim()) errors.push('模块名称不能为空');
  if (input.id && !MODULE_ID_RE.test(input.id)) {
    errors.push('模块 ID 只能包含小写字母、数字和连字符，且以字母/数字开头');
  }
  return { ok: errors.length === 0, errors };
}

/** 校验文档元信息。 */
export function validateDocument(input: DocInput): ValidationResult {
  const errors: string[] = [];
  if (!input.title || !input.title.trim()) errors.push('文档标题不能为空');
  if (typeof input.content !== 'string') errors.push('文档内容必须为字符串');
  return { ok: errors.length === 0, errors };
}

/** 新建模块元信息（时间戳补齐）。 */
export function createModuleMeta(input: ModuleInput, now = Date.now()): KnowledgeModuleMeta {
  return {
    id: input.id || slugifyModuleId(input.name),
    name: input.name.trim(),
    description: input.description?.trim() || '',
    type: input.type ?? 'custom',
    version: input.version || '1.0.0',
    tags: Array.isArray(input.tags) ? input.tags.map((t) => t.trim()).filter(Boolean) : [],
    enabled: true,
    createdAt: now,
    updatedAt: now,
    docCount: 0,
    indexedDocCount: 0,
  };
}

/** 新建文档元信息（时间戳补齐，字数统计）。 */
export function createDocumentMeta(
  moduleId: string,
  input: DocInput,
  now = Date.now()
): KnowledgeDocumentMeta {
  return {
    id: input.id || `doc-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    moduleId,
    title: input.title.trim(),
    type: input.type ?? 'md',
    createdAt: now,
    updatedAt: now,
    charCount: input.content.length,
  };
}

/** 从文件名推断文档类型（.md / .txt）。 */
export function inferDocType(filename: string): KnowledgeDocType {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
  return 'txt';
}

/** 仅保留启用的模块。 */
export function filterEnabledModules(modules: KnowledgeModuleMeta[]): KnowledgeModuleMeta[] {
  return modules.filter((m) => m.enabled);
}

/** 按关键词过滤文档（标题匹配）。 */
export function searchDocuments(
  docs: KnowledgeDocumentMeta[],
  keyword: string
): KnowledgeDocumentMeta[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return docs;
  return docs.filter((d) => d.title.toLowerCase().includes(kw));
}

export type DocSortBy = 'updatedAt' | 'createdAt' | 'title';

/** 文档排序。 */
export function sortDocuments(
  docs: KnowledgeDocumentMeta[],
  by: DocSortBy = 'updatedAt',
  asc = false
): KnowledgeDocumentMeta[] {
  const sorted = [...docs];
  sorted.sort((a, b) => {
    if (by === 'title') return a.title.localeCompare(b.title);
    return a[by] - b[by];
  });
  return asc ? sorted : sorted.reverse();
}

/** 模块/文档导出为 JSON 字符串（标准格式，便于导入与备份）。 */
export function exportModuleBundle(
  module: KnowledgeModuleMeta,
  docs: Array<{ meta: KnowledgeDocumentMeta; content: string }>
): string {
  return JSON.stringify(
    {
      format: 'qserial-knowledge-module',
      version: 1,
      module,
      documents: docs.map((d) => ({ meta: d.meta, content: d.content })),
    },
    null,
    2
  );
}

/** 解析导入的 JSON 字符串，非法输入抛错。 */
export function importModuleBundle(
  json: string
): { module: KnowledgeModuleMeta; docs: Array<{ meta: KnowledgeDocumentMeta; content: string }> } {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object') throw new Error('导入文件不是有效的 JSON 对象');
  const obj = parsed as Record<string, unknown>;
  if (obj.format !== 'qserial-knowledge-module') {
    throw new Error('导入文件缺少 format 标记，不是标准知识模块');
  }
  const module = obj.module as KnowledgeModuleMeta;
  const docs = (Array.isArray(obj.documents) ? obj.documents : []) as Array<{
    meta: KnowledgeDocumentMeta;
    content: string;
  }>;
  if (!module || typeof module.id !== 'string' || typeof module.name !== 'string') {
    throw new Error('导入文件缺少合法的模块元信息');
  }
  return { module, docs };
}
