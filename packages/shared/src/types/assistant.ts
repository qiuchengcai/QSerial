/**
 * 智能助手插件共享类型
 * 跨进程（主进程插件 / 渲染进程 UI）可序列化。
 * 纯逻辑（分块 / 向量化 / 检索 / prompt 组装）见 utils/assistant-*.ts。
 */

/** AI 服务提供方。`disabled` 表示完全离线（仅本地检索）。 */
export type AssistantProvider = 'openai-compatible' | 'ollama' | 'disabled';

/** 助手插件配置（宿主 configSchema 渲染，键与 configSchema 一致）。 */
export interface AssistantConfig {
  ai: {
    provider: AssistantProvider;
    baseUrl: string;
    apiKey: string;
    model: string;
    embeddingModel: string;
  };
  rag: {
    topK: number;
    chunkSize: number;
    chunkOverlap: number;
  };
}

/** 知识模块类型：内置模块不可删除，可禁用；自定义模块可增删改。 */
export type KnowledgeModuleType = 'builtin' | 'custom';

/** 文档类型（支持 .md / .txt）。 */
export type KnowledgeDocType = 'md' | 'txt';

/** 知识模块元信息（可序列化，不含文档正文）。 */
export interface KnowledgeModuleMeta {
  id: string;
  name: string;
  description: string;
  type: KnowledgeModuleType;
  version: string;
  tags: string[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  /** 文档总数 */
  docCount: number;
  /** 已完成向量化的文档数（用于索引进度反馈） */
  indexedDocCount: number;
}

/** 文档元信息（可序列化，不含正文）。 */
export interface KnowledgeDocumentMeta {
  id: string;
  moduleId: string;
  title: string;
  type: KnowledgeDocType;
  createdAt: number;
  updatedAt: number;
  /** 正文字符数 */
  charCount: number;
}

/** 分块结果（含来源与标题层级信息）。 */
export interface KnowledgeChunk {
  id: string;
  moduleId: string;
  documentId: string;
  documentTitle: string;
  /** 块序号（从 0 开始） */
  index: number;
  text: string;
  /** 所属标题层级（继承自最近的 Markdown 标题，无则空串） */
  heading: string;
  /** 原文起始/结束字符偏移 */
  start: number;
  end: number;
}

/** 单条检索命中（含来源信息与评分）。 */
export interface SearchHit {
  chunk: KnowledgeChunk;
  moduleName: string;
  score: number;
  keywordScore: number;
  semanticScore: number;
}

/** 检索结果。 */
export interface SearchResult {
  query: string;
  hits: SearchHit[];
  elapsedMs: number;
}

/** 向量索引条目（持久化到本地）。 */
export interface VectorIndexEntry {
  chunkId: string;
  vector: number[];
}

/** 对话消息。 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  /** 回答末尾引用的来源（模块 / 文档 / 标题 / 片段） */
  references?: ChatReference[];
}

/** 引用来源。 */
export interface ChatReference {
  moduleName: string;
  documentTitle: string;
  heading: string;
  snippet: string;
}
