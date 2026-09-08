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

/** 结构化日志分析结果。 */
export interface AnalysisField {
  label: string;
  value: string;
}

export interface AnalysisAnomaly {
  type: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

export interface LogAnalysisResult {
  protocol: string;
  confidence: number;
  keyFields: AnalysisField[];
  anomalies: AnalysisAnomaly[];
  suggestions: string[];
}

/** 命令生成结果（hex / ASCII 双模式 + 字节解释）。 */
export interface CommandResult {
  hex: string;
  ascii: string;
  explanation: string;
}

/** 对话消息元数据（引用 / token / 结构化结果等）。 */
export interface ChatMessageMetadata {
  references?: ChatReference[];
  tokens?: number;
  analysis?: LogAnalysisResult;
  command?: CommandResult;
  error?: boolean;
  /** 结构化分析时的原始日志文本 */
  logText?: string;
}

/** 对话消息。 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  /** 回答末尾引用的来源（模块 / 文档 / 标题 / 片段） */
  references?: ChatReference[];
  metadata?: ChatMessageMetadata;
}

/** 引用来源。 */
export interface ChatReference {
  moduleName: string;
  documentTitle: string;
  heading: string;
  snippet: string;
  /** 跳转到知识库对应文档所需 */
  moduleId?: string;
  documentId?: string;
}

/** 会话元信息（列表展示，不含完整消息）。 */
export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  /** 最后一条消息预览 */
  lastPreview: string;
}

/** 完整会话（含消息列表）。 */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

/** 快捷指令。 */
export interface QuickPrompt {
  id: string;
  label: string;
  prompt: string;
  /** 分类：analysis / query / generate */
  category?: 'analysis' | 'query' | 'generate';
}
