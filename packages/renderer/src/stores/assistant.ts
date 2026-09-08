/**
 * 智能助手状态管理。
 * 与主进程插件 qserial-plugin-assistant 通过 plugin.invoke / plugin.onEvent 通信。
 */

import { create } from 'zustand';
import type {
  ChatMessage,
  ChatReference,
  ConversationMeta,
  KnowledgeModuleMeta,
  KnowledgeDocumentMeta,
  QuickPrompt,
  CommandResult,
  LogAnalysisResult,
} from '@qserial/shared';
import { useTerminalStore } from './terminal';

const PLUGIN_ID = 'qserial-plugin-assistant';

export interface AssistantRuntimeConfig {
  provider: string;
  baseUrl: string;
  apiKeySet: boolean;
  model: string;
  embeddingModel: string;
  topK: number;
  chunkSize: number;
  configured: boolean;
}

export interface IndexStatus {
  id: string;
  name: string;
  docCount: number;
  indexedDocCount: number;
  hasIndex: boolean;
}

export interface IndexDocStatus {
  docId: string;
  title: string;
  charCount: number;
  indexed: boolean;
}

export interface CommandTemplate {
  name: string;
  command: string;
  createdAt: number;
}

export type StreamingStatus = 'idle' | 'searching' | 'generating';
export type DocSortBy = 'updatedAt' | 'createdAt' | 'title' | 'charCount';

interface AssistantState {
  open: boolean;
  activeTab: 'chat' | 'knowledge';
  // 会话
  conversations: ConversationMeta[];
  activeConversationId: string | null;
  sidebarCollapsed: boolean;
  conversationKeyword: string;
  // 对话
  messages: ChatMessage[];
  streaming: boolean;
  streamingStatus: StreamingStatus;
  input: string;
  lastQuery: string;
  generateMode: boolean;
  commandResult: CommandResult | null;
  commandRaw: string | null;
  quickPrompts: QuickPrompt[];
  templates: CommandTemplate[];
  config: AssistantRuntimeConfig | null;
  // 知识库
  modules: KnowledgeModuleMeta[];
  currentModuleId: string | null;
  docs: KnowledgeDocumentMeta[];
  currentDoc: { meta: KnowledgeDocumentMeta; content: string } | null;
  docKeyword: string;
  docSortBy: DocSortBy;
  indexStatus: IndexStatus[];
  indexDocs: IndexDocStatus[];
  indexing: boolean;
  indexProgress: { current: number; total: number; docTitle: string } | null;
  loading: boolean;
  error: string | null;

  toggle: () => void;
  openPanel: (tab?: 'chat' | 'knowledge') => void;
  closePanel: () => void;
  setTab: (tab: 'chat' | 'knowledge') => void;
  toggleSidebar: () => void;

  init: () => Promise<void>;
  loadConfig: () => Promise<void>;
  loadConversations: () => Promise<void>;
  newConversation: () => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  clearConversation: (id: string) => Promise<void>;
  setConversationKeyword: (kw: string) => void;

  loadQuickPrompts: () => Promise<void>;
  saveQuickPrompts: (list: QuickPrompt[]) => Promise<void>;
  resetQuickPrompts: () => Promise<void>;
  loadTemplates: () => Promise<void>;
  saveTemplate: (name: string, command: string) => Promise<void>;
  deleteTemplate: (name: string) => Promise<void>;

  loadModules: () => Promise<void>;
  loadDocs: (moduleId: string) => Promise<void>;
  loadDoc: (moduleId: string, docId: string) => Promise<void>;
  saveDoc: (content: string, title: string) => Promise<void>;
  createDoc: (title: string) => Promise<void>;
  deleteDoc: (docId: string) => Promise<void>;
  createModule: (name: string, description: string) => Promise<void>;
  deleteModule: (id: string) => Promise<void>;
  setModuleEnabled: (id: string, enabled: boolean) => Promise<void>;
  rebuildIndex: (moduleId?: string) => Promise<void>;
  cancelRebuild: () => void;
  loadIndexStatus: () => Promise<void>;
  loadIndexDocs: (moduleId: string) => Promise<void>;
  setDocKeyword: (kw: string) => void;
  setDocSortBy: (by: DocSortBy) => void;

  setInput: (v: string) => void;
  setGenerateMode: (v: boolean) => void;
  sendMessage: (queryOverride?: string) => Promise<void>;
  analyzeText: (text: string) => Promise<void>;
  generateCommand: () => Promise<void>;
  sendCommand: (command: string) => Promise<void>;
  stopGeneration: () => void;
  retryLast: () => Promise<void>;
  clearChat: () => Promise<void>;

  onChatDelta: (payload: { requestId?: string; delta?: string }) => void;
  onChatDone: (payload: {
    requestId?: string;
    content?: string;
    references?: ChatReference[];
    conversation?: ConversationMeta;
  }) => void;
  onChatError: (payload: { code?: string; message?: string }) => void;
  onIndexProgress: (payload: {
    token?: string;
    moduleId?: string;
    current?: number;
    total?: number;
    docTitle?: string;
  }) => void;
}

async function invoke<T = unknown>(method: string, args?: unknown): Promise<T> {
  return (await window.qserial.plugin.invoke(PLUGIN_ID, method, args)) as T;
}

function buildDeviceContext(): Record<string, unknown> | undefined {
  try {
    const state = useTerminalStore.getState();
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    const sessionId = activeTab?.activeSessionId;
    const session = sessionId ? state.sessions[sessionId] : undefined;
    if (!session) return undefined;
    return {
      type: String(session.connectionType),
      name: session.name,
      serialPath: session.serialPath,
      host: session.host,
    };
  } catch {
    return undefined;
  }
}

export const useAssistantStore = create<AssistantState>()((set, get) => ({
  open: false,
  activeTab: 'chat',
  conversations: [],
  activeConversationId: null,
  sidebarCollapsed: false,
  conversationKeyword: '',
  messages: [],
  streaming: false,
  streamingStatus: 'idle',
  input: '',
  lastQuery: '',
  generateMode: false,
  commandResult: null,
  commandRaw: null,
  quickPrompts: [],
  templates: [],
  config: null,
  modules: [],
  currentModuleId: null,
  docs: [],
  currentDoc: null,
  docKeyword: '',
  docSortBy: 'updatedAt',
  indexStatus: [],
  indexDocs: [],
  indexing: false,
  indexProgress: null,
  loading: false,
  error: null,

  toggle: () => set((s) => ({ open: !s.open })),
  openPanel: (tab) => set({ open: true, activeTab: tab ?? 'chat' }),
  closePanel: () => set({ open: false }),
  setTab: (tab) => set({ activeTab: tab }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  init: async () => {
    await Promise.all([
      get().loadConfig(),
      get().loadModules(),
      get().loadConversations(),
      get().loadQuickPrompts(),
      get().loadTemplates(),
    ]);
    await get().loadIndexStatus();
  },

  loadConfig: async () => {
    try {
      const config = await invoke<AssistantRuntimeConfig>('config');
      set({ config });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  // ==================== 会话 ====================

  loadConversations: async () => {
    try {
      const list = await invoke<ConversationMeta[]>('conversations.list');
      const conversations = Array.isArray(list) ? list : [];
      set({ conversations });
      // 无活跃会话则打开最近一个（或新建）
      if (!get().activeConversationId && conversations.length > 0) {
        await get().switchConversation(conversations[0].id);
      }
    } catch {
      /* ignore */
    }
  },

  newConversation: async () => {
    try {
      const conv = await invoke<{ id: string }>('conversations.create');
      set({ activeConversationId: conv.id, messages: [], input: '', generateMode: false, commandResult: null });
      await get().loadConversations();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  switchConversation: async (id) => {
    try {
      const conv = await invoke<{ id: string; messages: ChatMessage[] } | null>('conversations.get', { id });
      set({
        activeConversationId: id,
        messages: conv?.messages || [],
        input: '',
        streaming: false,
        streamingStatus: 'idle',
        generateMode: false,
        commandResult: null,
      });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  renameConversation: async (id, title) => {
    try {
      await invoke('conversations.rename', { id, title });
      await get().loadConversations();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  deleteConversation: async (id) => {
    try {
      await invoke('conversations.delete', { id });
      await get().loadConversations();
      if (get().activeConversationId === id) {
        const remaining = get().conversations;
        if (remaining.length > 0) await get().switchConversation(remaining[0].id);
        else await get().newConversation();
      }
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  clearConversation: async (id) => {
    try {
      await invoke('conversations.clear', { id });
      if (get().activeConversationId === id) set({ messages: [] });
      await get().loadConversations();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  setConversationKeyword: (kw) => {
    set({ conversationKeyword: kw });
    invoke<ConversationMeta[]>('conversations.search', { keyword: kw })
      .then((list) => set({ conversations: Array.isArray(list) ? list : [] }))
      .catch(() => {});
  },

  // ==================== 快捷指令 / 模板 ====================

  loadQuickPrompts: async () => {
    try {
      const list = await invoke<QuickPrompt[]>('quickPrompts.list');
      if (Array.isArray(list)) set({ quickPrompts: list });
    } catch {
      /* ignore */
    }
  },
  saveQuickPrompts: async (list) => {
    try {
      const saved = await invoke<QuickPrompt[]>('quickPrompts.save', { list });
      set({ quickPrompts: saved });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
  resetQuickPrompts: async () => {
    try {
      const defaults = await invoke<QuickPrompt[]>('quickPrompts.reset');
      set({ quickPrompts: defaults });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
  loadTemplates: async () => {
    try {
      const list = await invoke<CommandTemplate[]>('templates.list');
      if (Array.isArray(list)) set({ templates: list });
    } catch {
      /* ignore */
    }
  },
  saveTemplate: async (name, command) => {
    try {
      const list = await invoke<CommandTemplate[]>('templates.save', { name, command });
      set({ templates: list });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
  deleteTemplate: async (name) => {
    try {
      const list = await invoke<CommandTemplate[]>('templates.delete', { name });
      set({ templates: list });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  // ==================== 知识库 ====================

  loadModules: async () => {
    try {
      const modules = await invoke<KnowledgeModuleMeta[]>('modules.list');
      set({ modules });
      const cur = get().currentModuleId;
      if ((!cur || !modules.some((m) => m.id === cur)) && modules.length > 0) {
        set({ currentModuleId: modules[0].id });
        await get().loadDocs(modules[0].id);
        await get().loadIndexDocs(modules[0].id);
      }
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadDocs: async (moduleId) => {
    set({ currentModuleId: moduleId, docs: [], currentDoc: null, docKeyword: '' });
    try {
      const docs = await invoke<KnowledgeDocumentMeta[]>('docs.list', {
        moduleId,
        sortBy: get().docSortBy,
      });
      set({ docs });
      await get().loadIndexDocs(moduleId);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadDoc: async (moduleId, docId) => {
    try {
      const doc = await invoke<{ meta: KnowledgeDocumentMeta; content: string }>('docs.get', {
        moduleId,
        docId,
      });
      set({ currentDoc: doc });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  saveDoc: async (content, title) => {
    const cur = get().currentDoc;
    const moduleId = get().currentModuleId;
    if (!cur || !moduleId) return;
    try {
      const meta = await invoke<KnowledgeDocumentMeta>('docs.update', {
        moduleId,
        docId: cur.meta.id,
        title,
        content,
      });
      set({ currentDoc: { meta, content } });
      await get().loadDocs(moduleId);
      await get().loadIndexStatus();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  createDoc: async (title) => {
    const moduleId = get().currentModuleId;
    if (!moduleId) return;
    try {
      const meta = await invoke<KnowledgeDocumentMeta>('docs.create', {
        moduleId,
        title,
        content: '',
        type: 'md',
      });
      await get().loadDocs(moduleId);
      await get().loadDoc(moduleId, meta.id);
      await get().loadIndexStatus();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  deleteDoc: async (docId) => {
    const moduleId = get().currentModuleId;
    if (!moduleId) return;
    try {
      await invoke('docs.delete', { moduleId, docId });
      set({ currentDoc: null });
      await get().loadDocs(moduleId);
      await get().loadIndexStatus();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  createModule: async (name, description) => {
    try {
      await invoke('modules.create', { name, description });
      await get().loadModules();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  deleteModule: async (id) => {
    try {
      await invoke('modules.delete', { id });
      if (get().currentModuleId === id) set({ currentModuleId: null, docs: [], currentDoc: null });
      await get().loadModules();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  setModuleEnabled: async (id, enabled) => {
    try {
      await invoke('modules.setEnabled', { id, enabled });
      await get().loadModules();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  rebuildIndex: async (moduleId) => {
    set({ indexing: true, indexProgress: null, error: null });
    const token = crypto.randomUUID();
    try {
      await invoke('index.rebuild', moduleId ? { moduleId, token } : { token });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ indexing: false, indexProgress: null });
      await get().loadIndexStatus();
      if (get().currentModuleId) await get().loadIndexDocs(get().currentModuleId as string);
    }
  },

  cancelRebuild: () => {
    // 取消通过新建请求 token 失效实现；此处简单置空进度
    set({ indexing: false, indexProgress: null });
    get().loadIndexStatus();
  },

  loadIndexStatus: async () => {
    try {
      const status = await invoke<IndexStatus[]>('index.status');
      set({ indexStatus: status });
    } catch {
      /* ignore */
    }
  },

  loadIndexDocs: async (moduleId) => {
    try {
      const docs = await invoke<IndexDocStatus[]>('index.docs', { moduleId });
      set({ indexDocs: Array.isArray(docs) ? docs : [] });
    } catch {
      /* ignore */
    }
  },

  setDocKeyword: (kw) => {
    set({ docKeyword: kw });
    const moduleId = get().currentModuleId;
    if (moduleId) {
      invoke<KnowledgeDocumentMeta[]>('docs.list', {
        moduleId,
        keyword: kw,
        sortBy: get().docSortBy,
      })
        .then((docs) => set({ docs }))
        .catch(() => {});
    }
  },

  setDocSortBy: async (by) => {
    set({ docSortBy: by });
    const moduleId = get().currentModuleId;
    if (moduleId) {
      const docs = await invoke<KnowledgeDocumentMeta[]>('docs.list', { moduleId, sortBy: by });
      set({ docs });
    }
  },

  // ==================== 对话 ====================

  setInput: (v) => set({ input: v }),
  setGenerateMode: (v) => set({ generateMode: v, commandResult: null, commandRaw: null }),

  sendMessage: async (queryOverride) => {
    const query = (queryOverride ?? get().input).trim();
    if (!query || get().streaming) return;
    let conversationId = get().activeConversationId;
    if (!conversationId) {
      const conv = await invoke<{ id: string }>('conversations.create');
      conversationId = conv.id;
      set({ activeConversationId: conversationId });
      get().loadConversations();
    }
    const requestId = crypto.randomUUID();
    const history = get().messages.map((m) => ({ role: m.role, content: m.content }));
    const userMsg: ChatMessage = { id: `${requestId}-u`, role: 'user', content: query, createdAt: Date.now() };
    const assistantMsg: ChatMessage = { id: `${requestId}-a`, role: 'assistant', content: '', createdAt: Date.now() };
    set({
      messages: [...get().messages, userMsg, assistantMsg],
      input: '',
      streaming: true,
      streamingStatus: 'searching',
      lastQuery: query,
      error: null,
    });
    const res = await invoke<{ ok?: boolean; code?: string; message?: string }>('chat', {
      requestId,
      query,
      history,
      deviceContext: buildDeviceContext(),
      conversationId,
    });
    if (!res || res.ok !== true) {
      get().onChatError({ code: res?.code, message: res?.message || '调用失败' });
    }
  },

  analyzeText: async (text) => {
    set({ open: true, activeTab: 'chat' });
    const requestId = crypto.randomUUID();
    const userMsg: ChatMessage = { id: `${requestId}-u`, role: 'user', content: `分析日志：\n${text.slice(0, 6000)}`, createdAt: Date.now() };
    const assistantMsg: ChatMessage = { id: `${requestId}-a`, role: 'assistant', content: '', createdAt: Date.now() };
    set({
      messages: [...get().messages, userMsg, assistantMsg],
      streaming: true,
      streamingStatus: 'searching',
      error: null,
    });
    try {
      const res = await invoke<{ raw: string; parsed: unknown }>('analyzeLog', {
        text,
        deviceContext: buildDeviceContext(),
      });
      const parsed = res?.parsed as LogAnalysisResult | null;
      set((s) => {
        const messages = [...s.messages];
        const last = messages[messages.length - 1];
        if (last && last.role === 'assistant') {
          last.content = res.raw;
          if (parsed) last.metadata = { ...(last.metadata || {}), analysis: parsed, logText: text };
        }
        return { messages, streaming: false, streamingStatus: 'idle' };
      });
    } catch (e) {
      get().onChatError({ message: (e as Error).message });
    }
  },

  generateCommand: async () => {
    const description = get().input.trim();
    if (!description || get().streaming) return;
    set({ streaming: true, error: null });
    try {
      const res = await invoke<{ raw: string; parsed: CommandResult | null }>('generateCommand', {
        description,
        deviceContext: buildDeviceContext(),
      });
      if (res?.parsed) {
        set({ commandResult: res.parsed, commandRaw: res.raw, input: '', streaming: false });
      } else {
        set({
          commandResult: { hex: '', ascii: res?.raw || '', explanation: '' },
          commandRaw: res?.raw || '',
          input: '',
          streaming: false,
        });
      }
    } catch (e) {
      set({ streaming: false, error: (e as Error).message });
    }
  },

  sendCommand: async (command) => {
    if (!command) return;
    try {
      const state = useTerminalStore.getState();
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
      const sessionId = activeTab?.activeSessionId;
      const session = sessionId ? state.sessions[sessionId] : undefined;
      if (!session) throw new Error('请先连接串口');
      await window.qserial.connection.write(session.connectionId, command);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  stopGeneration: () => {
    set({ streaming: false, streamingStatus: 'idle' });
  },

  retryLast: async () => {
    const query = get().lastQuery;
    if (!query) return;
    // 移除上一条失败的助手消息
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant' && last.content.startsWith('⚠')) messages.pop();
      return { messages };
    });
    await get().sendMessage(query);
  },

  clearChat: async () => {
    const id = get().activeConversationId;
    if (id) {
      try {
        await invoke('conversations.clear', { id });
      } catch {
        /* ignore */
      }
    }
    set({ messages: [], commandResult: null, commandRaw: null });
  },

  onChatDelta: (payload) => {
    const delta = payload.delta || '';
    if (!delta) return;
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') last.content += delta;
      return { messages, streamingStatus: 'generating' };
    });
  },

  onChatDone: (payload) => {
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        last.content = payload.content || last.content;
        last.references = payload.references;
      }
      return { messages, streaming: false, streamingStatus: 'idle' };
    });
    if (payload.conversation) {
      set((s) => ({
        activeConversationId: payload.conversation?.id ?? s.activeConversationId,
        conversations: s.conversations
          .filter((c) => c.id !== payload.conversation?.id)
          .concat(payload.conversation ? [payload.conversation] : [])
          .sort((a, b) => b.updatedAt - a.updatedAt),
      }));
    } else {
      get().loadConversations();
    }
  },

  onChatError: (payload) => {
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant' && !last.content) {
        last.content = `⚠ ${payload.message || '调用失败'}`;
        last.metadata = { ...(last.metadata || {}), error: true };
      } else {
        messages.push({
          id: `${Date.now()}-err`,
          role: 'assistant',
          content: `⚠ ${payload.message || '调用失败'}`,
          createdAt: Date.now(),
          metadata: { error: true },
        });
      }
      return { messages, streaming: false, streamingStatus: 'idle' };
    });
  },

  onIndexProgress: (payload) => {
    set({
      indexing: true,
      indexProgress: {
        current: payload.current ?? 0,
        total: payload.total ?? 0,
        docTitle: payload.docTitle || '',
      },
    });
  },
}));

let bridgeInitialized = false;

/** 初始化主进程 → 助手 store 的事件桥（App 启动时调用一次）。 */
export function initAssistantBridge(): void {
  if (bridgeInitialized) return;
  bridgeInitialized = true;
  window.qserial.plugin.onEvent(({ pluginId, event, payload }) => {
    if (pluginId !== PLUGIN_ID) return;
    const store = useAssistantStore.getState();
    if (event === 'chat.delta') store.onChatDelta(payload as { delta?: string });
    else if (event === 'chat.done')
      store.onChatDone(payload as { content?: string; references?: ChatReference[]; conversation?: ConversationMeta });
    else if (event === 'chat.error') store.onChatError(payload as { message?: string });
    else if (event === 'index.progress')
      store.onIndexProgress(payload as { current?: number; total?: number; docTitle?: string });
  });
}
