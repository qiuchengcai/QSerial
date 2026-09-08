/**
 * 智能助手面板：对话（含会话列表）/ 知识库 两个 Tab。
 */

import React from 'react';
import { useAssistantStore } from '@/stores/assistant';
import { ChatTab } from './ChatTab';
import { KnowledgeBaseTab } from './KnowledgeBaseTab';
import { ConversationList } from './ConversationList';

const PANEL_WIDTH = 640;

export const AssistantPanel: React.FC = () => {
  const open = useAssistantStore((s) => s.open);
  const activeTab = useAssistantStore((s) => s.activeTab);
  const sidebarCollapsed = useAssistantStore((s) => s.sidebarCollapsed);
  const setTab = useAssistantStore((s) => s.setTab);
  const closePanel = useAssistantStore((s) => s.closePanel);

  if (!open) return null;

  return (
    <div
      className="flex-shrink-0 border-l border-border bg-surface flex flex-col min-h-0"
      style={{ width: PANEL_WIDTH }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-primary">
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
            <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="8" cy="8" r="1.4" fill="currentColor" opacity="0.4" />
          </svg>
          <span className="text-sm font-medium">智能助手</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setTab('chat')}
              className={`px-3 py-1 text-xs ${activeTab === 'chat' ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-hover'}`}
            >
              对话
            </button>
            <button
              onClick={() => setTab('knowledge')}
              className={`px-3 py-1 text-xs ${activeTab === 'knowledge' ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-hover'}`}
            >
              知识库
            </button>
          </div>
          <button
            onClick={closePanel}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-hover text-text-secondary"
            title="关闭"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === 'chat' ? (
          <div className="flex-1 min-h-0 flex">
            {!sidebarCollapsed && <ConversationList />}
            <div className="flex-1 min-w-0 flex flex-col">
              <ChatTab />
            </div>
          </div>
        ) : (
          <KnowledgeBaseTab />
        )}
      </div>
    </div>
  );
};
