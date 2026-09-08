/**
 * 对话历史持久化（每个会话一个 JSON 文件，本地存储）。
 * 兼容旧版「裸数组」格式：读取时自动迁移为会话对象。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createConversation,
  toConversationMeta,
  sortConversationsByUpdated,
  pruneConversationIds,
  isValidConversation,
} from '@qserial/shared';

const MAX_MESSAGES = 200;
const DEFAULT_MAX_CONVERSATIONS = 50;

export class ConversationStore {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'conversations');
  }

  _file(id) {
    return path.join(this.dir, `${id}.json`);
  }

  _ensure() {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  _readRaw(id) {
    try {
      const raw = fs.readFileSync(this._file(id), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** 读取会话；旧版裸数组自动迁移。损坏返回 null。 */
  get(id) {
    const raw = this._readRaw(id);
    if (Array.isArray(raw)) {
      // 旧版裸数组格式
      const now = Date.now();
      return {
        id,
        title: '历史对话',
        createdAt: now,
        updatedAt: now,
        messages: raw,
      };
    }
    if (isValidConversation(raw)) return raw;
    return null;
  }

  save(conversation) {
    this._ensure();
    const target = this._file(conversation.id);
    const tmp = target + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(conversation, null, 2), 'utf-8');
    fs.renameSync(tmp, target);
  }

  create(id) {
    const conv = createConversation(id);
    this.save(conv);
    return conv;
  }

  list() {
    let files;
    try {
      files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    const metas = [];
    for (const f of files) {
      const id = f.replace(/\.json$/, '');
      const conv = this.get(id);
      if (conv) metas.push(toConversationMeta(conv));
    }
    return sortConversationsByUpdated(metas);
  }

  rename(id, title) {
    const conv = this.get(id);
    if (!conv) throw new Error(`会话不存在: ${id}`);
    const next = { ...conv, title: String(title || '').trim() || conv.title, updatedAt: Date.now() };
    this.save(next);
    return next;
  }

  delete(id) {
    try {
      fs.rmSync(this._file(id), { force: true });
    } catch {
      /* ignore */
    }
  }

  clearMessages(id) {
    const conv = this.get(id);
    if (!conv) return;
    const next = { ...conv, messages: [], updatedAt: Date.now() };
    this.save(next);
    return next;
  }

  appendMessage(id, message) {
    let conv = this.get(id);
    if (!conv) conv = this.create(id);
    const messages = [...conv.messages, message];
    const trimmed = messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages;
    const next = { ...conv, messages: trimmed, updatedAt: Date.now() };
    this.save(next);
    return next;
  }

  setTitle(id, title) {
    return this.rename(id, title);
  }

  /** 清理超出 maxCount 的最旧会话，返回被删除的 id。 */
  prune(maxCount = DEFAULT_MAX_CONVERSATIONS) {
    const ids = pruneConversationIds(this.list(), maxCount);
    for (const id of ids) this.delete(id);
    return ids;
  }
}
