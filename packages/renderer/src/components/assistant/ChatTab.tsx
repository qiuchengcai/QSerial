/**
 * 对话 Tab：快速 prompt、消息流、输入框、AI 生成命令。
 */

import React, { useEffect, useRef } from 'react';
import { useAssistantStore } from '@/stores/assistant';
import type { ChatMessage } from '@qserial/shared';

export const ChatTab: React.FC = () => {
  const {
    messages,
    streaming,
    input,
    setInput,
    sendMessage,
    quickPrompts,
    config,
    error,
    generateMode,
    setGenerateMode,
    generatedCommand,
    generateCommand,
    sendGeneratedCommand,
    clearChat,
  } = useAssistantStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      // 拉取快速 prompt 与配置
      useAssistantStore.getState().loadConfig();
      useAssistantStore.getState().loadModules().then(() => {});
      window.qserial.plugin
        .invoke('qserial-plugin-assistant', 'quickPrompts')
        .then((r) => useAssistantStore.setState({ quickPrompts: (r as { id: string; label: string; prompt: string }[]) || [] }))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming, generatedCommand]);

  const notConfigured = config && !config.configured;

  const onSend = () => {
    if (generateMode) generateCommand();
    else sendMessage();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 快速 prompt */}
      {quickPrompts.length > 0 && (
        <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1.5">
          {quickPrompts.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setInput(p.prompt);
                sendMessage(p.prompt);
              }}
              className="px-2 py-0.5 text-[11px] rounded-full border border-border hover:bg-hover text-text-secondary transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* 消息区 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-xs text-text-tertiary mt-10 opacity-70">
            输入问题，助手将基于本地知识库回答
            <br />
            支持 Modbus、AT 指令、串口排障等
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {/* 生成命令结果 */}
        {generatedCommand && (
          <div className="rounded-lg border border-accent/40 bg-accent/5 p-2.5">
            <div className="text-[11px] text-accent font-medium mb-1.5">生成的命令</div>
            <pre className="text-xs font-mono whitespace-pre-wrap text-text bg-background/50 rounded p-2 max-h-40 overflow-y-auto">
              {generatedCommand}
            </pre>
            <div className="flex gap-2 mt-2">
              <button
                onClick={sendGeneratedCommand}
                className="px-2 py-1 text-[11px] rounded bg-accent text-white hover:brightness-110"
              >
                发送到终端
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(generatedCommand)}
                className="px-2 py-1 text-[11px] rounded border border-border hover:bg-hover"
              >
                复制
              </button>
            </div>
          </div>
        )}

        {error && <div className="text-xs text-error px-1">{error}</div>}
        <div ref={bottomRef} />
      </div>

      {/* 未配置提示 */}
      {notConfigured && (
        <div className="px-3 py-1.5 text-[11px] text-warning bg-warning/10 border-t border-warning/20">
          尚未配置 AI 服务：请到「设置 → 插件 → 智能助手」配置模型（Ollama / OpenAI 兼容接口）
        </div>
      )}

      {/* 输入区 */}
      <div className="border-t border-border p-2.5 space-y-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={2}
            placeholder={generateMode ? '用自然语言描述你想要的命令…' : '输入问题，Enter 发送'}
            className="flex-1 resize-none text-xs bg-background border border-border rounded-lg px-2.5 py-2 outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGenerateMode(!generateMode)}
            className={`px-2 py-1 text-[11px] rounded border transition-colors ${
              generateMode ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-secondary hover:bg-hover'
            }`}
          >
            AI 生成命令
          </button>
          <button
            onClick={clearChat}
            className="px-2 py-1 text-[11px] rounded border border-border text-text-secondary hover:bg-hover"
          >
            清空
          </button>
          <button
            onClick={onSend}
            disabled={streaming || !input.trim()}
            className="ml-auto px-3 py-1.5 text-xs rounded bg-primary text-white disabled:opacity-40 hover:brightness-110"
          >
            {streaming ? '生成中…' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
};

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
          isUser ? 'bg-primary/15 text-text' : 'bg-background border border-border text-text'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content || '…'}</div>
        {!isUser && message.references && message.references.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
            <div className="text-[10px] text-text-tertiary font-medium">引用来源</div>
            {message.references.map((r, i) => (
              <div key={i} className="text-[10px] text-text-secondary">
                · {r.moduleName} / {r.documentTitle}
                {r.heading ? ` / ${r.heading}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
