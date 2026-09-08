/**
 * 对话 Tab：会话切换、快速 prompt、Markdown 消息流、结构化结果、输入框。
 */

import React, { useEffect, useRef, useState } from 'react';
import { useAssistantStore } from '@/stores/assistant';
import { Markdown } from './Markdown';
import { AnalysisCard } from './AnalysisCard';
import { CommandCard } from './CommandCard';
import type { ChatMessage, ChatReference, QuickPrompt } from '@qserial/shared';

const CATEGORY_COLOR: Record<string, string> = {
  analysis: 'text-accent border-accent/40',
  query: 'text-primary border-primary/40',
  generate: 'text-success border-success/40',
};

export const ChatTab: React.FC = () => {
  const {
    messages,
    streaming,
    streamingStatus,
    input,
    setInput,
    sendMessage,
    quickPrompts,
    config,
    error,
    generateMode,
    setGenerateMode,
    commandResult,
    generateCommand,
    sendCommand,
    stopGeneration,
    clearChat,
    sidebarCollapsed,
    toggleSidebar,
  } = useAssistantStore();

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPromptManager, setShowPromptManager] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming, commandResult]);

  const notConfigured = config && !config.configured;

  const onSend = () => {
    if (generateMode) generateCommand();
    else sendMessage();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    } else if (e.key === 'ArrowUp' && !input) {
      // 编辑上一条用户消息
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          setInput(messages[i].content);
          break;
        }
      }
    }
  };

  const openReference = (ref: ChatReference) => {
    const modules = useAssistantStore.getState().modules;
    const m = modules.find((x) => x.id === ref.moduleId) || modules.find((x) => x.name === ref.moduleName);
    if (m) {
      useAssistantStore.getState().setTab('knowledge');
      useAssistantStore.getState().loadDocs(m.id).then(() => {
        const docs = useAssistantStore.getState().docs;
        const d = docs.find((x) => x.id === ref.documentId) || docs.find((x) => x.title === ref.documentTitle);
        if (d) useAssistantStore.getState().loadDoc(m.id, d.id);
      });
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 工具栏：会话侧栏开关 + 清空 */}
      <div className="px-2.5 py-1.5 border-b border-border flex items-center gap-1.5">
        <button
          onClick={toggleSidebar}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-hover text-text-secondary"
          title={sidebarCollapsed ? '展开会话列表' : '收起会话列表'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2v8M9 2v8M4 2H2v8h2M9 2h1v8H9" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={clearChat}
          className="px-2 py-0.5 text-[11px] rounded border border-border text-text-secondary hover:bg-hover"
        >
          清空
        </button>
      </div>

      {/* 快速 prompt（横向滚动） */}
      {!generateMode && (
        <div className="px-2.5 py-1.5 border-b border-border flex items-center gap-1.5">
          <div className="flex-1 overflow-x-auto flex gap-1.5">
            {quickPrompts.map((p) => (
              <button
                key={p.id}
                onClick={() => sendMessage(p.prompt)}
                title={p.prompt}
                className={`px-2 py-0.5 text-[11px] rounded-full border whitespace-nowrap hover:bg-hover transition-colors ${
                  CATEGORY_COLOR[p.category || 'query'] || CATEGORY_COLOR.query
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowPromptManager(true)}
            className="flex-shrink-0 px-1.5 py-0.5 text-[10px] rounded border border-border text-text-secondary hover:bg-hover"
            title="管理快捷指令"
          >
            管理
          </button>
        </div>
      )}

      {/* 消息区 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-xs text-text-tertiary mt-10 opacity-70">
            输入问题，助手将基于本地知识库回答
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onOpenReference={openReference} />
        ))}

        {/* 状态反馈 */}
        {streaming && (
          <div className="flex items-center gap-2 text-xs text-text-secondary px-1">
            {streamingStatus === 'searching' ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
                正在检索知识库…
              </>
            ) : (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-primary animate-ping" />
                正在生成…
              </>
            )}
            <button onClick={stopGeneration} className="ml-2 px-2 py-0.5 text-[11px] rounded border border-border hover:bg-hover">
              停止
            </button>
          </div>
        )}

        {/* 命令生成结果 */}
        {commandResult && <CommandCard result={commandResult} onSend={sendCommand} />}

        {error && <div className="text-xs text-error px-1">{error}</div>}
        <div ref={bottomRef} />
      </div>

      {/* 未配置提示 */}
      {notConfigured && (
        <div className="px-3 py-1.5 text-[11px] text-warning bg-warning/10 border-t border-warning/20">
          尚未配置 AI 服务：请到「设置 → 插件 → 智能助手」配置模型
        </div>
      )}

      {/* 输入区 */}
      <div className="border-t border-border p-2.5 space-y-2">
        {generateMode && (
          <div className="flex items-center justify-between text-[11px] text-accent px-0.5">
            <span>✨ 用自然语言描述你想要的命令</span>
            <button onClick={() => setGenerateMode(false)} className="text-text-secondary hover:text-text">
              取消
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={() => setGenerateMode(!generateMode)}
            className={`w-7 h-7 flex items-center justify-center rounded border transition-colors ${
              generateMode ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-secondary hover:bg-hover'
            }`}
            title="AI 生成命令"
          >
            ✨
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder={generateMode ? '例如：读取从站 1 的保持寄存器 0x0000' : '输入问题，Enter 发送，Shift+Enter 换行'}
            className="flex-1 resize-none text-xs bg-background border border-border rounded-lg px-2.5 py-2 outline-none focus:border-primary max-h-32"
          />
          <button
            onClick={onSend}
            disabled={streaming || !input.trim()}
            className="px-3 py-1.5 text-xs rounded bg-primary text-white disabled:opacity-40 hover:brightness-110 flex-shrink-0"
          >
            {generateMode ? '生成' : '发送'}
          </button>
        </div>
      </div>

      {showPromptManager && (
        <PromptManager
          onClose={() => setShowPromptManager(false)}
        />
      )}
    </div>
  );
};

function MessageBubble({
  message,
  onOpenReference,
}: {
  message: ChatMessage;
  onOpenReference: (ref: ChatReference) => void;
}) {
  const isUser = message.role === 'user';
  const analysis = message.metadata?.analysis;
  const isError = message.metadata?.error;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] min-w-0 ${isUser ? '' : 'flex-1'}`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1 text-[10px] text-text-tertiary">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-primary">
              <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1" />
              <circle cx="6" cy="6" r="1.6" fill="currentColor" opacity="0.5" />
            </svg>
            助手
            <span className="ml-auto">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}

        <div
          className={`rounded-lg px-3 py-2 text-xs ${
            isUser ? 'bg-primary/15 text-text' : 'bg-background border border-border text-text'
          } ${isError ? 'border-error/40 bg-error/5' : ''}`}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : analysis ? (
            <AnalysisCard
              result={analysis}
              rawLog={message.metadata?.logText}
              onReanalyze={
                message.metadata?.logText
                  ? () => useAssistantStore.getState().analyzeText(message.metadata?.logText as string)
                  : undefined
              }
            />
          ) : (
            <Markdown text={message.content || '…'} />
          )}
        </div>

        {/* 引用来源 */}
        {!isUser && !analysis && message.references && message.references.length > 0 && (
          <div className="mt-1.5 px-2 py-1.5 rounded-lg bg-background/60 border border-border/60 space-y-1">
            <div className="text-[10px] text-text-tertiary font-medium">引用来源</div>
            {message.references.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] text-text-secondary">
                <span className="text-primary font-mono flex-shrink-0">[{i + 1}]</span>
                <span className="truncate">{r.moduleName} / {r.documentTitle}{r.heading ? ` / ${r.heading}` : ''}</span>
                <button onClick={() => onOpenReference(r)} className="ml-auto text-primary hover:underline flex-shrink-0">
                  查看
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 错误重试 */}
        {isError && (
          <div className="mt-1">
            <button
              onClick={() => useAssistantStore.getState().retryLast()}
              className="px-2 py-0.5 text-[11px] rounded border border-border text-error hover:bg-error/10"
            >
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PromptManager({ onClose }: { onClose: () => void }) {
  const { quickPrompts, saveQuickPrompts, resetQuickPrompts } = useAssistantStore();
  const [draft, setDraft] = useState<QuickPrompt[]>(quickPrompts.map((p) => ({ ...p })));

  const update = (i: number, patch: Partial<QuickPrompt>) => {
    setDraft((d) => d.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };
  const add = () =>
    setDraft((d) => [...d, { id: `q-${Date.now()}`, label: '新指令', prompt: '', category: 'query' }]);
  const remove = (i: number) => setDraft((d) => d.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const next = [...d];
      const j = i + dir;
      if (j < 0 || j >= next.length) return next;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg w-[480px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium">快捷指令管理</span>
          <button onClick={onClose} className="text-text-secondary hover:text-text">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {draft.map((p, i) => (
            <div key={p.id} className="border border-border rounded-lg p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  value={p.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="名称"
                  className="flex-1 text-xs bg-background border border-border rounded px-2 py-1 outline-none focus:border-primary"
                />
                <select
                  value={p.category || 'query'}
                  onChange={(e) => update(i, { category: e.target.value as QuickPrompt['category'] })}
                  className="text-xs bg-background border border-border rounded px-1 py-1"
                >
                  <option value="analysis">分析</option>
                  <option value="query">查询</option>
                  <option value="generate">生成</option>
                </select>
                <button onClick={() => move(i, -1)} className="w-6 h-6 text-xs rounded border border-border hover:bg-hover">↑</button>
                <button onClick={() => move(i, 1)} className="w-6 h-6 text-xs rounded border border-border hover:bg-hover">↓</button>
                <button onClick={() => remove(i)} className="w-6 h-6 text-xs rounded border border-border text-error hover:bg-error/10">✕</button>
              </div>
              <textarea
                value={p.prompt}
                onChange={(e) => update(i, { prompt: e.target.value })}
                placeholder="提示词内容"
                rows={2}
                className="w-full text-xs bg-background border border-border rounded px-2 py-1 outline-none focus:border-primary resize-none"
              />
            </div>
          ))}
        </div>
        <div className="px-3 py-2.5 border-t border-border flex items-center gap-2">
          <button onClick={add} className="px-2 py-1 text-xs rounded border border-border hover:bg-hover">添加</button>
          <button onClick={() => resetQuickPrompts().then(() => onClose())} className="px-2 py-1 text-xs rounded border border-border hover:bg-hover">
            重置默认
          </button>
          <button
            onClick={() => saveQuickPrompts(draft.filter((p) => p.label && p.prompt)).then(() => onClose())}
            className="ml-auto px-3 py-1 text-xs rounded bg-primary text-white hover:brightness-110"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
