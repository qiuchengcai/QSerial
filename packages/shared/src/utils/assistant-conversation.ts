/**
 * 对话历史纯逻辑（会话 CRUD 的校验、标题降级、搜索、排序、裁剪）。
 * 文件持久化在插件 conversation.mjs 中完成。
 */

import type {
  ChatMessage,
  Conversation,
  ConversationMeta,
} from '../types/assistant.js';

/** 生成降级标题：「新对话 YYYY-MM-DD」。 */
export function fallbackConversationTitle(now: number | Date = Date.now()): string {
  const d = typeof now === 'number' ? new Date(now) : now;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `新对话 ${y}-${m}-${day}`;
}

/** 创建会话对象（时间戳补齐）。 */
export function createConversation(id?: string, now = Date.now()): Conversation {
  const ts = now;
  return {
    id: id || `conv-${ts.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: fallbackConversationTitle(ts),
    createdAt: ts,
    updatedAt: ts,
    messages: [],
  };
}

/** 从会话提取列表元信息。 */
export function toConversationMeta(conversation: Conversation): ConversationMeta {
  const messages = conversation.messages || [];
  const last = messages[messages.length - 1];
  const lastPreview = last
    ? last.content.replace(/\s+/g, ' ').slice(0, 40)
    : '';
  return {
    id: conversation.id,
    title: conversation.title || fallbackConversationTitle(conversation.createdAt),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: messages.length,
    lastPreview,
  };
}

/** 按 updatedAt 降序排序。 */
export function sortConversationsByUpdated(
  list: ConversationMeta[],
  asc = false
): ConversationMeta[] {
  const sorted = [...list].sort((a, b) => a.updatedAt - b.updatedAt);
  return asc ? sorted : sorted.reverse();
}

/** 按标题 / 内容关键词过滤（标题优先，其次预览）。 */
export function searchConversations(
  list: ConversationMeta[],
  keyword: string
): ConversationMeta[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return list;
  return list.filter(
    (c) => c.title.toLowerCase().includes(kw) || c.lastPreview.toLowerCase().includes(kw)
  );
}

/** 保留最新 maxCount 个会话（按 updatedAt），返回需要删除的 id 列表。 */
export function pruneConversationIds(list: ConversationMeta[], maxCount: number): string[] {
  if (maxCount <= 0) return [];
  const sorted = sortConversationsByUpdated(list);
  return sorted.slice(maxCount).map((c) => c.id);
}

/** 构建一条消息对象（时间戳与元数据补齐）。 */
export function buildMessage(
  id: string,
  role: ChatMessage['role'],
  content: string,
  metadata?: ChatMessage['metadata']
): ChatMessage {
  return {
    id,
    role,
    content,
    createdAt: Date.now(),
    ...(metadata ? { metadata } : {}),
  };
}

/** 校验会话对象是否合法（用于损坏数据降级）。 */
export function isValidConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.id === 'string' && Array.isArray(o.messages);
}
