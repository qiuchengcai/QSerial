/**
 * 智能助手状态管理。
 * 与主进程插件 qserial-plugin-assistant 通过 plugin.invoke / plugin.onEvent 通信。
 */

import { create } from 'zustand';
import type {
  ChatMessage,
  ChatReference,
  KnowledgeModuleMeta,
  KnowledgeDocumentMeta,
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

export interface QuickPrompt {
  id: string;
  label: string;
  prompt: string;
}

export interface IndexStatus {
  id: string;
  name: string;
  docCount: number;
  indexedDocCount: number;
  hasIndex: boolean;
}

interface AssistantState {
  open: boolean;
  activeTab: 'chat' | 'knowledge';
  // 对话
  messages: ChatMessage[];
  streaming: boolean;
  input: string;
  generateMode: boolean;
  generatedCommand: string;
  quickPrompts: QuickPrompt[];
  config: AssistantRuntimeConfig | null;
  // 知识库
  modules: KnowledgeModuleMeta[];
  currentModuleId: string | null;
  docs: KnowledgeDocumentMeta[];
  currentDoc: { meta: KnowledgeDocumentMeta; content: string } | null;
  docKeyword: string;
  indexStatus: IndexStatus[];
  loading: boolean;
  error: string | null;

  toggle: () => void;
  openPanel: (tab?: 'chat' | 'knowledge') => void;
  closePanel: () => void;
  setTab: (tab: 'chat' | 'knowledge') => void;

  init: () => Promise<void>;
  loadConfig: () => Promise<void>;
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
  loadIndexStatus: () => Promise<void>;
  setDocKeyword: (kw: string) => void;
  setInput: (v: string) => void;
  setGenerateMode: (v: boolean) => void;

  sendMessage: (queryOverride?: string) => Promise<void>;
  analyzeText: (text: string) => Promise<void>;
  generateCommand: () => Promise<void>;
  sendGeneratedCommand: () => Promise<void>;
  clearChat: () => Promise<void>;
  loadConversation: () => Promise<void>;

  onChatDelta: (payload: { requestId?: string; delta?: string }) => void;
  onChatDone: (payload: { requestId?: string; content?: string; references?: ChatReference[] }) => void;
  onChatError: (payload: { code?: string; message?: string }) => void;
}

async function invoke<T = unknown>(method: string, args?: unknown): Promise<T> {
  return (await window.qserial.plugin.invoke(PLUGIN_ID, method, args)) as T;
}

function buildDeviceContext(): Record<string, unknown> | undefined {
  // 从激活会话取最小上下文（串口路径/主机），连接参数由插件侧 connection.list 补齐
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
  messages: [],
  streaming: false,
  input: '',
  generateMode: false,
  generatedCommand: '',
  quickPrompts: [],
  config: null,
  modules: [],
  currentModuleId: null,
  docs: [],
  currentDoc: null,
  docKeyword: '',
  indexStatus: [],
  loading: false,
  error: null,

  toggle: () => set((s) => ({ open: !s.open })),
  openPanel: (tab) => set({ open: true, activeTab: tab ?? 'chat' }),
  closePanel: () => set({ open: false }),
  setTab: (tab) => set({ activeTab: tab }),

  init: async () => {
    await Promise.all([get().loadConfig(), get().loadModules(), get().loadConversation()]);
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

  loadModules: async () => {
    try {
      const modules = await invoke<KnowledgeModuleMeta[]>('modules.list');
      set({ modules });
      const cur = get().currentModuleId;
      if ((!cur || !modules.some((m) => m.id === cur)) && modules.length > 0) {
        set({ currentModuleId: modules[0].id });
        await get().loadDocs(modules[0].id);
      }
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadDocs: async (moduleId) => {
    set({ currentModuleId: moduleId, docs: [], currentDoc: null, docKeyword: '' });
    try {
      const docs = await invoke<KnowledgeDocumentMeta[]>('docs.list', { moduleId, sortBy: 'updatedAt' });
      set({ docs });
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
    set({ loading: true });
    try {
      await invoke('index.rebuild', moduleId ? { moduleId } : {});
      await get().loadIndexStatus();
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  loadIndexStatus: async () => {
    try {
      const status = await invoke<IndexStatus[]>('index.status');
      set({ indexStatus: status });
    } catch {
      /* ignore */
    }
  },

  setDocKeyword: (kw) => {
    set({ docKeyword: kw });
    const moduleId = get().currentModuleId;
    if (moduleId) {
      invoke<KnowledgeDocumentMeta[]>('docs.list', { moduleId, keyword: kw, sortBy: 'updatedAt' })
        .then((docs) => set({ docs }))
        .catch(() => {});
    }
  },

  setInput: (v) => set({ input: v }),
  setGenerateMode: (v) => set({ generateMode: v, generatedCommand: '' }),

  sendMessage: async (queryOverride) => {
    const query = (queryOverride ?? get().input).trim();
    if (!query || get().streaming) return;
    const requestId = crypto.randomUUID();
    const history = get().messages.map((m) => ({ role: m.role, content: m.content }));
    const userMsg: ChatMessage = { id: `${requestId}-u`, role: 'user', content: query, createdAt: Date.now() };
    const assistantMsg: ChatMessage = { id: `${requestId}-a`, role: 'assistant', content: '', createdAt: Date.now() };
    set({
      messages: [...get().messages, userMsg, assistantMsg],
      input: '',
      streaming: true,
      error: null,
    });
    const res = await invoke<{ ok?: boolean; code?: string; message?: string }>('chat', {
      requestId,
      query,
      history,
      deviceContext: buildDeviceContext(),
      conversationId: 'default',
    });
    if (!res || res.ok !== true) {
      get().onChatError({ code: res?.code, message: res?.message || '调用失败' });
    }
  },

  analyzeText: async (text) => {
    set({ open: true, activeTab: 'chat' });
    const query = `请分析这段串口日志，识别协议类型、解析关键字段并指出可能的异常：\n\n\`\`\`\n${text.slice(0, 6000)}\n\`\`\``;
    await get().sendMessage(query);
  },

  generateCommand: async () => {
    const description = get().input.trim();
    if (!description || get().streaming) return;
    set({ streaming: true, error: null });
    try {
      const result = await invoke<{ content: string; references?: ChatReference[] }>('generateCommand', {
        description,
        deviceContext: buildDeviceContext(),
      });
      set({ generatedCommand: result.content, input: '', streaming: false });
    } catch (e) {
      set({ streaming: false, error: (e as Error).message });
    }
  },

  sendGeneratedCommand: async () => {
    const cmd = get().generatedCommand.trim();
    if (!cmd) return;
    try {
      const state = useTerminalStore.getState();
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
      const sessionId = activeTab?.activeSessionId;
      const session = sessionId ? state.sessions[sessionId] : undefined;
      if (!session) throw new Error('没有活跃的终端会话');
      await window.qserial.connection.write(session.connectionId, cmd);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  clearChat: async () => {
    try {
      await invoke('conversations.clear', { id: 'default' });
    } catch {
      /* ignore */
    }
    set({ messages: [], generatedCommand: '' });
  },

  loadConversation: async () => {
    try {
      const messages = await invoke<ChatMessage[]>('conversations.get', { id: 'default' });
      if (Array.isArray(messages)) set({ messages });
    } catch {
      /* ignore */
    }
  },

  onChatDelta: (payload) => {
    const delta = payload.delta || '';
    if (!delta) return;
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') last.content += delta;
      return { messages };
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
      return { messages, streaming: false };
    });
  },

  onChatError: (payload) => {
    // 只写一处：错误写入对话气泡；不再重复写 error 字段，避免同一提示出现两次
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant' && !last.content) {
        last.content = `⚠ ${payload.message || '调用失败'}`;
      } else {
        messages.push({ id: `${Date.now()}-err`, role: 'assistant', content: `⚠ ${payload.message || '调用失败'}`, createdAt: Date.now() });
      }
      return { messages, streaming: false };
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
    else if (event === 'chat.done') store.onChatDone(payload as { content?: string; references?: ChatReference[] });
    else if (event === 'chat.error') store.onChatError(payload as { message?: string });
  });
}
