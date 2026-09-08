/**
 * 会话列表侧边栏：新建 / 切换 / 重命名 / 删除 / 清空 / 搜索。
 */

import React, { useState } from 'react';
import { useAssistantStore } from '@/stores/assistant';
import type { ConversationMeta } from '@qserial/shared';

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export const ConversationList: React.FC = () => {
  const {
    conversations,
    activeConversationId,
    conversationKeyword,
    setConversationKeyword,
    newConversation,
    switchConversation,
    renameConversation,
    deleteConversation,
    clearConversation,
  } = useAssistantStore();

  const [menu, setMenu] = useState<{ x: number; y: number; conv: ConversationMeta } | null>(null);

  const handleRename = (conv: ConversationMeta) => {
    const title = prompt('会话标题', conv.title);
    if (title && title.trim()) renameConversation(conv.id, title.trim());
    setMenu(null);
  };

  return (
    <div className="w-56 flex-shrink-0 border-r border-border flex flex-col min-h-0">
      {/* 新建 */}
      <div className="p-2 border-b border-border">
        <button
          onClick={newConversation}
          className="w-full px-2 py-1.5 text-xs rounded border border-primary/40 text-primary hover:bg-primary/10 transition-colors flex items-center justify-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          新建会话
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="text-[11px] text-text-tertiary text-center py-6 opacity-70">暂无会话</div>
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => switchConversation(c.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, conv: c });
              }}
              className={`px-2.5 py-2 cursor-pointer border-b border-border/40 transition-colors ${
                c.id === activeConversationId ? 'bg-primary/10' : 'hover:bg-hover'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={`text-xs truncate ${c.id === activeConversationId ? 'text-primary' : ''}`}>
                  {c.title}
                </span>
                <span className="text-[9px] text-text-tertiary flex-shrink-0">{formatTime(c.updatedAt)}</span>
              </div>
              <div className="text-[10px] text-text-secondary truncate mt-0.5">
                {c.lastPreview || '（空对话）'}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 搜索 */}
      <div className="p-2 border-t border-border">
        <input
          value={conversationKeyword}
          onChange={(e) => setConversationKeyword(e.target.value)}
          placeholder="搜索会话…"
          className="w-full text-[11px] bg-background border border-border rounded px-2 py-1 outline-none focus:border-primary"
        />
      </div>

      {/* 右键菜单 */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 bg-surface border border-border rounded shadow-lg py-1 min-w-[120px]"
            style={{ left: menu.x, top: menu.y }}
          >
            <button onClick={() => handleRename(menu.conv)} className="w-full px-3 py-1.5 text-xs text-left hover:bg-hover">
              重命名
            </button>
            <button
              onClick={() => {
                clearConversation(menu.conv.id);
                setMenu(null);
              }}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-hover"
            >
              清空对话
            </button>
            <button
              onClick={() => {
                deleteConversation(menu.conv.id);
                setMenu(null);
              }}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-hover text-error"
            >
              删除
            </button>
          </div>
        </>
      )}
    </div>
  );
};
