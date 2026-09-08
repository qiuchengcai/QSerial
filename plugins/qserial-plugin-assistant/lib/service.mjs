/**
 * 智能助手服务：编排知识库、向量索引、检索、对话、结构化日志分析与命令生成。
 * 通过 ctx.ipc.register 暴露方法给渲染进程，通过 ctx.ipc.emit 推送流式/进度事件。
 */

import * as path from 'node:path';
import {
  rankCandidates,
  hashEmbedding,
  buildPrompt,
  filterEnabledModules,
  searchDocuments,
  sortDocuments,
  exportModuleBundle,
  importModuleBundle,
  inferDocType,
  createModuleMeta,
  DEFAULT_QUICK_PROMPTS,
  buildLogAnalysisPrompt,
  buildCommandPrompt,
  parseAnalysisResult,
  parseCommandResult,
  toConversationMeta,
  fallbackConversationTitle,
} from '@qserial/shared';
import { KnowledgeStore } from './store.mjs';
import {
  loadIndex,
  saveIndex,
  removeIndex,
  buildDocEntries,
} from './vector-store.mjs';
import { ConversationStore } from './conversation.mjs';
import { chatStream, chatOnce, isConfigured } from './llm.mjs';
import { BUILTIN_MODULES } from './builtin.mjs';

export class AssistantService {
  constructor({ ctx, pluginId, pluginDir, dataDir }) {
    this.ctx = ctx;
    this.pluginId = pluginId;
    this.pluginDir = pluginDir;
    this.dataDir = dataDir;
    this.store = new KnowledgeStore(dataDir);
    this.conversations = new ConversationStore(dataDir);
    this._streamTasks = new Set();
    this._cancelTokens = new Set();
  }

  getConfig() {
    const all = this.ctx.config.getAll() || {};
    const ai = all.ai || {};
    const rag = all.rag || {};
    return {
      provider: ai.provider || 'disabled',
      baseUrl: ai.baseUrl || '',
      apiKey: ai.apiKey || '',
      model: ai.model || '',
      embeddingModel: ai.embeddingModel || '',
      topK: Number(rag.topK ?? 5),
      chunkSize: Number(rag.chunkSize ?? 500),
      chunkOverlap: 50,
      maxConversations: Number(all.maxConversations ?? 50),
    };
  }

  getQuickPrompts() {
    const saved = this.ctx.config.get('quickPrompts');
    if (Array.isArray(saved) && saved.length > 0) {
      return saved
        .filter((p) => p && typeof p.label === 'string' && typeof p.prompt === 'string')
        .map((p, i) => ({
          id: p.id || `q-${i}`,
          label: p.label,
          prompt: p.prompt,
          category: p.category || 'query',
        }));
    }
    return DEFAULT_QUICK_PROMPTS;
  }

  async init() {
    await this._seedBuiltinModules();
    await this._ensureIndexes();
  }

  async shutdown() {
    this._streamTasks.clear();
  }

  // ==================== 内置模块播种与索引 ====================

  async _seedBuiltinModules() {
    const existing = this.store.loadModules();
    for (const builtin of BUILTIN_MODULES) {
      if (existing.some((m) => m.id === builtin.id)) continue;
      const meta = createModuleMeta(
        { id: builtin.id, name: builtin.name, description: builtin.description, version: builtin.version, tags: builtin.tags, type: 'builtin' },
        Date.now()
      );
      existing.push(meta);
      this.store.saveModules(existing);
      for (const doc of builtin.docs) {
        this.store.createDoc(builtin.id, { title: doc.title, type: 'md', content: doc.content });
      }
    }
  }

  async _ensureIndexes() {
    for (const m of this.store.loadModules()) {
      if (loadIndex(this.dataDir, m.id) === null) {
        await this.rebuildIndex(m.id);
      }
    }
  }

  async rebuildIndex(moduleId, options = {}) {
    const cfg = this.getConfig();
    const { onProgress, isCancelled } = options;
    const docs = this.store.listDocsWithContent(moduleId);
    const entries = [];
    for (let i = 0; i < docs.length; i++) {
      if (isCancelled && isCancelled()) break;
      const d = docs[i];
      entries.push(...buildDocEntries(moduleId, d.meta, d.content, {
        chunkSize: cfg.chunkSize,
        chunkOverlap: cfg.chunkOverlap,
      }));
      if (onProgress) {
        onProgress({ moduleId, current: i + 1, total: docs.length, docId: d.meta.id, docTitle: d.meta.title });
      }
    }
    if (!(isCancelled && isCancelled())) {
      saveIndex(this.dataDir, moduleId, entries);
      this._setIndexedCount(moduleId, docs.length);
    }
    return { moduleId, indexedDocs: entries.length ? docs.length : 0, chunks: entries.length, cancelled: !!(isCancelled && isCancelled()) };
  }

  _setIndexedCount(moduleId, count) {
    const modules = this.store.loadModules();
    const idx = modules.findIndex((m) => m.id === moduleId);
    if (idx !== -1) {
      modules[idx] = { ...modules[idx], indexedDocCount: count };
      this.store.saveModules(modules);
    }
  }

  // ==================== 检索 ====================

  _embedQuery(query) {
    return hashEmbedding(query);
  }

  async search(query, moduleIds, topK) {
    const cfg = this.getConfig();
    const k = topK ?? cfg.topK;
    const start = Date.now();
    const queryVector = this._embedQuery(query);

    const modules = filterEnabledModules(this.store.loadModules());
    const selected = moduleIds && moduleIds.length > 0
      ? modules.filter((m) => moduleIds.includes(m.id))
      : modules;

    const nameById = new Map(modules.map((m) => [m.id, m.name]));
    const candidates = [];
    for (const m of selected) {
      let entries = loadIndex(this.dataDir, m.id);
      if (!entries) {
        await this.rebuildIndex(m.id);
        entries = loadIndex(this.dataDir, m.id) || [];
      }
      for (const e of entries) {
        candidates.push({ text: e.text, vector: e.vector, _entry: e, _moduleId: m.id });
      }
    }

    const ranked = rankCandidates(query, queryVector, candidates, { topK: k, alpha: 0.5 });
    const hits = ranked.map((r) => ({
      chunk: {
        id: r.item._entry.chunkId,
        moduleId: r.item._moduleId,
        documentId: r.item._entry.documentId,
        documentTitle: r.item._entry.documentTitle,
        index: r.item._entry.index,
        text: r.item._entry.text,
        heading: r.item._entry.heading,
        start: r.item._entry.start,
        end: r.item._entry.end,
      },
      moduleName: nameById.get(r.item._moduleId) || r.item._moduleId,
      score: r.score,
      keywordScore: r.keywordScore,
      semanticScore: r.semanticScore,
    }));

    return { query, hits, elapsedMs: Date.now() - start };
  }

  // ==================== 对话 ====================

  _toPromptChunks(hits) {
    return hits.map((h) => ({
      moduleName: h.moduleName,
      documentTitle: h.chunk.documentTitle,
      heading: h.chunk.heading,
      snippet: h.chunk.text,
    }));
  }

  _toReferences(hits) {
    return hits.slice(0, 5).map((h) => ({
      moduleName: h.moduleName,
      documentTitle: h.chunk.documentTitle,
      heading: h.chunk.heading,
      snippet: h.chunk.text.slice(0, 120),
      moduleId: h.chunk.moduleId,
      documentId: h.chunk.documentId,
    }));
  }

  async chatSync(query, history, deviceContext) {
    const cfg = this.getConfig();
    if (!isConfigured(cfg)) {
      throw new Error('NOT_CONFIGURED: 尚未配置 AI 服务，请到插件设置中配置模型');
    }
    const result = await this.search(query, null, cfg.topK);
    const prompt = buildPrompt({
      query,
      chunks: this._toPromptChunks(result.hits),
      history: history || [],
      context: deviceContext || undefined,
    });
    const messages = [
      { role: 'system', content: prompt.system },
      ...(history || []).map((t) => ({ role: t.role, content: t.content })),
      { role: 'user', content: prompt.user },
    ];
    const content = await chatOnce({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages,
    });
    return { content, references: this._toReferences(result.hits) };
  }

  async _generateTitle(query) {
    const cfg = this.getConfig();
    if (!isConfigured(cfg)) return fallbackConversationTitle();
    try {
      const title = await chatOnce({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        messages: [
          { role: 'system', content: '你是标题生成器。把用户的问题概括为不超过 15 个字的简短标题，只输出标题本身，不要引号。' },
          { role: 'user', content: query },
        ],
      });
      const t = String(title || '').trim().replace(/\s+/g, ' ').slice(0, 15);
      return t || fallbackConversationTitle();
    } catch {
      return fallbackConversationTitle();
    }
  }

  async _runChatStream(requestId, query, history, deviceContext, conversationId) {
    const cfg = this.getConfig();
    const emit = (event, payload) => this.ctx.ipc.emit(event, { requestId, ...payload });

    if (!isConfigured(cfg)) {
      emit('chat.error', { code: 'not_configured', message: '尚未配置 AI 服务，请到插件设置中配置模型' });
      return;
    }

    try {
      const result = await this.search(query, null, cfg.topK);
      const prompt = buildPrompt({
        query,
        chunks: this._toPromptChunks(result.hits),
        history: history || [],
        context: deviceContext || undefined,
      });
      const messages = [
        { role: 'system', content: prompt.system },
        ...(history || []).map((t) => ({ role: t.role, content: t.content })),
        { role: 'user', content: prompt.user },
      ];

      const content = await chatStream({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        messages,
        onDelta: (delta) => emit('chat.delta', { delta }),
      });

      const references = this._toReferences(result.hits);
      let conversation = null;
      if (conversationId) {
        const existing = this.conversations.get(conversationId);
        const isFirst = !existing || existing.messages.length === 0;
        this.conversations.appendMessage(conversationId, {
          id: `${requestId}-u`, role: 'user', content: query, createdAt: Date.now(),
        });
        this.conversations.appendMessage(conversationId, {
          id: `${requestId}-a`, role: 'assistant', content, createdAt: Date.now(), references,
        });
        if (isFirst) {
          const title = await this._generateTitle(query);
          this.conversations.setTitle(conversationId, title);
        }
        this.conversations.prune(cfg.maxConversations);
        conversation = toConversationMeta(this.conversations.get(conversationId));
      }
      emit('chat.done', { content, references, conversation });
    } catch (err) {
      emit('chat.error', { code: 'llm_error', message: err.message || String(err) });
    }
  }

  // ==================== 日志分析与命令生成 ====================

  analyzeLogLocal(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    const atLines = lines.filter((l) => /^\s*AT/i.test(l)).length;
    const hexLines = lines.filter((l) => /^[0-9a-fA-F]{2}(\s[0-9a-fA-F]{2})+/.test(l)).length;
    const errKeywords = lines.filter((l) => /error|fail|timeout|CRC|checksum/i.test(l)).length;
    const parts = [];
    if (atLines > 0) parts.push(`检测到 ${atLines} 行 AT 指令交互`);
    if (hexLines > 0) parts.push(`检测到 ${hexLines} 行十六进制帧（疑似 Modbus 等二进制协议）`);
    if (errKeywords > 0) parts.push(`发现 ${errKeywords} 行包含错误/超时/校验类关键词`);
    parts.push(`共 ${lines.length} 行日志`);
    return parts.length ? '本地分析结果：\n' + parts.join('\n') + '\n\n（配置 AI 服务后可获得更详细的协议解析与异常定位）' : '未识别到明显的协议特征';
  }

  async analyzeLogSync(text, deviceContext) {
    const cfg = this.getConfig();
    if (!isConfigured(cfg)) {
      return { raw: this.analyzeLogLocal(text), parsed: null };
    }
    const { system, user } = buildLogAnalysisPrompt(text, deviceContext || undefined);
    const content = await chatOnce({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    return { raw: content, parsed: parseAnalysisResult(content) };
  }

  async generateCommandSync(description, deviceContext) {
    const cfg = this.getConfig();
    if (!isConfigured(cfg)) {
      throw new Error('NOT_CONFIGURED: 尚未配置 AI 服务，请到插件设置中配置模型');
    }
    const { system, user } = buildCommandPrompt(description, deviceContext || undefined);
    const content = await chatOnce({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    return { raw: content, parsed: parseCommandResult(content) };
  }

  // ==================== IPC 注册 ====================

  registerIpc() {
    const reg = (method, handler) => this.ctx.ipc.register(method, handler);

    reg('config', () => {
      const cfg = this.getConfig();
      return {
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKeySet: !!cfg.apiKey,
        model: cfg.model,
        embeddingModel: cfg.embeddingModel,
        topK: cfg.topK,
        chunkSize: cfg.chunkSize,
        configured: isConfigured(cfg),
      };
    });

    // 快捷指令
    reg('quickPrompts.list', () => this.getQuickPrompts());
    reg('quickPrompts.save', (args) => {
      const { list } = args || {};
      if (!Array.isArray(list)) throw new Error('快捷指令列表不合法');
      this.ctx.config.set('quickPrompts', list);
      return this.getQuickPrompts();
    });
    reg('quickPrompts.reset', () => {
      this.ctx.config.delete('quickPrompts');
      return DEFAULT_QUICK_PROMPTS;
    });

    reg('deviceContext', () => {
      try {
        return this.ctx.connection.list();
      } catch {
        return [];
      }
    });

    // 模块
    reg('modules.list', () => this.store.listModules());
    reg('modules.create', (args) => this.store.createModule(args || {}));
    reg('modules.update', (args) => {
      const { id, ...patch } = args || {};
      return this.store.updateModule(id, patch);
    });
    reg('modules.delete', (args) => {
      const { id } = args || {};
      this.store.deleteModule(id);
      removeIndex(this.dataDir, id);
      return { ok: true };
    });
    reg('modules.setEnabled', (args) => {
      const { id, enabled } = args || {};
      return this.store.setModuleEnabled(id, enabled);
    });
    reg('modules.export', (args) => {
      const { id } = args || {};
      const module = this.store.getModule(id);
      if (!module) throw new Error(`模块不存在: ${id}`);
      const docs = this.store.listDocsWithContent(id);
      return exportModuleBundle(module, docs);
    });
    reg('modules.import', (args) => {
      const { json } = args || {};
      const { module, docs } = importModuleBundle(json);
      if (this.store.getModule(module.id)) throw new Error(`模块已存在: ${module.id}`);
      const created = this.store.createModule({
        id: module.id,
        name: module.name,
        description: module.description,
        version: module.version,
        tags: module.tags,
        type: 'custom',
      });
      for (const d of docs) {
        this.store.createDoc(created.id, { id: d.meta.id, title: d.meta.title, type: d.meta.type, content: d.content });
      }
      return created;
    });

    // 文档
    reg('docs.list', (args) => {
      const { moduleId, keyword, sortBy } = args || {};
      let docs = this.store.listDocs(moduleId);
      if (keyword) docs = searchDocuments(docs, keyword);
      return sortDocuments(docs, sortBy || 'updatedAt');
    });
    reg('docs.get', (args) => {
      const { moduleId, docId } = args || {};
      const meta = this.store.getDoc(moduleId, docId);
      if (!meta) throw new Error(`文档不存在: ${docId}`);
      return { meta, content: this.store.readDocContent(meta) };
    });
    reg('docs.create', async (args) => {
      const { moduleId, title, content, type } = args || {};
      const meta = this.store.createDoc(moduleId, { title, content, type: type || 'md' });
      await this._reindexModule(moduleId);
      return meta;
    });
    reg('docs.update', async (args) => {
      const { moduleId, docId, title, content } = args || {};
      const meta = this.store.updateDoc(moduleId, docId, { title, content });
      await this._reindexModule(moduleId);
      return meta;
    });
    reg('docs.delete', async (args) => {
      const { moduleId, docId } = args || {};
      this.store.deleteDoc(moduleId, docId);
      await this._reindexModule(moduleId);
      return { ok: true };
    });
    reg('docs.upload', async (args) => {
      const { moduleId, filename, content } = args || {};
      const type = inferDocType(filename || '');
      const title = String(filename || '未命名文档').replace(/\.(md|txt|markdown)$/i, '');
      const meta = this.store.createDoc(moduleId, { title, content, type });
      await this._reindexModule(moduleId);
      return meta;
    });

    // 索引
    reg('index.rebuild', async (args) => {
      const { moduleId, token } = args || {};
      const emitProgress = (p) => this.ctx.ipc.emit('index.progress', { token, ...p });
      const isCancelled = () => (token ? this._cancelTokens.has(token) : false);
      if (moduleId) {
        return this.rebuildIndex(moduleId, { onProgress: emitProgress, isCancelled });
      }
      const results = [];
      for (const m of this.store.loadModules()) {
        results.push(await this.rebuildIndex(m.id, { onProgress: emitProgress, isCancelled }));
        if (isCancelled()) break;
      }
      return results;
    });
    reg('index.cancelRebuild', (args) => {
      const { token } = args || {};
      if (token) this._cancelTokens.add(token);
      return { ok: true };
    });
    reg('index.status', () => {
      return this.store.listModules().map((m) => ({
        id: m.id,
        name: m.name,
        docCount: m.docCount,
        indexedDocCount: m.indexedDocCount,
        hasIndex: loadIndex(this.dataDir, m.id) !== null,
      }));
    });
    reg('index.docs', (args) => {
      const { moduleId } = args || {};
      const docs = this.store.listDocs(moduleId);
      const entries = loadIndex(this.dataDir, moduleId) || [];
      const indexedIds = new Set(entries.map((e) => e.documentId));
      return docs.map((d) => ({
        docId: d.id,
        title: d.title,
        charCount: d.charCount,
        indexed: indexedIds.has(d.id),
      }));
    });

    // 检索 / 对话
    reg('search', (args) => {
      const { query, moduleIds, topK } = args || {};
      return this.search(query || '', moduleIds, topK);
    });
    reg('chat', (args) => {
      const { requestId, query, history, deviceContext, conversationId } = args || {};
      if (!query) throw new Error('问题不能为空');
      const p = this._runChatStream(requestId, query, history, deviceContext, conversationId);
      this._streamTasks.add(p);
      p.finally(() => this._streamTasks.delete(p));
      return { ok: true, requestId, streaming: true };
    });
    reg('chatSync', async (args) => {
      const { query, history, deviceContext } = args || {};
      return this.chatSync(query, history, deviceContext);
    });
    reg('analyzeLog', (args) => {
      const { text, deviceContext } = args || {};
      return this.analyzeLogSync(text || '', deviceContext);
    });
    reg('generateCommand', (args) => {
      const { description, deviceContext } = args || {};
      return this.generateCommandSync(description || '', deviceContext);
    });

    // 命令模板
    reg('templates.list', () => {
      const saved = this.ctx.config.get('templates');
      return Array.isArray(saved) ? saved : [];
    });
    reg('templates.save', (args) => {
      const { name, command } = args || {};
      if (!name || !command) throw new Error('模板名称与命令不能为空');
      const list = Array.isArray(this.ctx.config.get('templates')) ? this.ctx.config.get('templates') : [];
      const next = list.filter((t) => t.name !== name).concat({ name, command, createdAt: Date.now() });
      this.ctx.config.set('templates', next);
      return next;
    });
    reg('templates.delete', (args) => {
      const { name } = args || {};
      const list = Array.isArray(this.ctx.config.get('templates')) ? this.ctx.config.get('templates') : [];
      const next = list.filter((t) => t.name !== name);
      this.ctx.config.set('templates', next);
      return next;
    });

    // 对话历史
    reg('conversations.list', () => this.conversations.list());
    reg('conversations.get', (args) => {
      const { id } = args || {};
      const conv = this.conversations.get(id);
      return conv || null;
    });
    reg('conversations.create', () => this.conversations.create());
    reg('conversations.rename', (args) => {
      const { id, title } = args || {};
      return this.conversations.rename(id, title);
    });
    reg('conversations.delete', (args) => {
      const { id } = args || {};
      this.conversations.delete(id);
      return { ok: true };
    });
    reg('conversations.clear', (args) => {
      const { id } = args || {};
      const conv = this.conversations.clearMessages(id);
      return conv ? toConversationMeta(conv) : { ok: true };
    });
    reg('conversations.search', (args) => {
      const { keyword } = args || {};
      const list = this.conversations.list();
      if (!keyword) return list;
      const kw = String(keyword).toLowerCase();
      return list.filter((c) => c.title.toLowerCase().includes(kw) || c.lastPreview.toLowerCase().includes(kw));
    });
  }

  async _reindexModule(moduleId) {
    try {
      await this.rebuildIndex(moduleId);
    } catch (err) {
      this.ctx.log.warn(`reindex failed for ${moduleId}: ${err.message}`);
    }
  }
}
