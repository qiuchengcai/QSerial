/**
 * 知识库 Tab：模块列表 / 文档列表 / 文档编辑与预览。
 */

import React, { useEffect, useRef, useState } from 'react';
import { useAssistantStore } from '@/stores/assistant';
import type { KnowledgeModuleMeta } from '@qserial/shared';

export const KnowledgeBaseTab: React.FC = () => {
  const {
    modules,
    currentModuleId,
    docs,
    currentDoc,
    docKeyword,
    setDocKeyword,
    loadModules,
    loadDocs,
    loadDoc,
    saveDoc,
    createDoc,
    deleteDoc,
    createModule,
    deleteModule,
    setModuleEnabled,
    rebuildIndex,
    indexStatus,
    loading,
    error,
  } = useAssistantStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [showNewModule, setShowNewModule] = useState(false);
  const [newModuleName, setNewModuleName] = useState('');
  const [newModuleDesc, setNewModuleDesc] = useState('');

  useEffect(() => {
    loadModules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同步编辑器状态
  useEffect(() => {
    if (currentDoc) {
      setEditingTitle(currentDoc.meta.title);
      setEditingContent(currentDoc.content);
    } else {
      setEditingTitle('');
      setEditingContent('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDoc?.meta.id, currentDoc?.content]);

  const builtinModules = modules.filter((m) => m.type === 'builtin');
  const customModules = modules.filter((m) => m.type === 'custom');

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !currentModuleId) return;
    for (const file of Array.from(files)) {
      const content = await file.text();
      try {
        await window.qserial.plugin.invoke('qserial-plugin-assistant', 'docs.upload', {
          moduleId: currentModuleId,
          filename: file.name,
          content,
        });
      } catch (e) {
        useAssistantStore.setState({ error: (e as Error).message });
      }
    }
    await loadDocs(currentModuleId);
    await useAssistantStore.getState().loadIndexStatus();
  };

  const indexStatusForCurrent = indexStatus.find((s) => s.id === currentModuleId);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 顶部操作栏 */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!currentModuleId}
          className="px-2 py-1 text-[11px] rounded border border-border hover:bg-hover text-text-secondary disabled:opacity-40"
        >
          上传文档
        </button>
        <button
          onClick={() => currentModuleId && createDoc('新建文档')}
          disabled={!currentModuleId}
          className="px-2 py-1 text-[11px] rounded border border-border hover:bg-hover text-text-secondary disabled:opacity-40"
        >
          新建文档
        </button>
        <button
          onClick={() => setShowNewModule(true)}
          className="px-2 py-1 text-[11px] rounded border border-border hover:bg-hover text-text-secondary"
        >
          新建模块
        </button>
        <button
          onClick={() => rebuildIndex(currentModuleId || undefined)}
          disabled={loading}
          className="px-2 py-1 text-[11px] rounded border border-border hover:bg-hover text-text-secondary disabled:opacity-40"
        >
          {loading ? '重建中…' : '重建索引'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {/* 三栏 */}
      <div className="flex-1 min-h-0 flex">
        {/* 左：模块列表 */}
        <div className="w-32 flex-shrink-0 border-r border-border overflow-y-auto">
          <ModuleGroup title="内置" modules={builtinModules} currentId={currentModuleId} onSelect={loadDocs} onToggle={setModuleEnabled} onDelete={deleteModule} />
          <ModuleGroup title="自定义" modules={customModules} currentId={currentModuleId} onSelect={loadDocs} onToggle={setModuleEnabled} onDelete={deleteModule} />
        </div>

        {/* 中：文档列表 */}
        <div className="w-36 flex-shrink-0 border-r border-border flex flex-col">
          <div className="p-1.5 border-b border-border">
            <input
              value={docKeyword}
              onChange={(e) => setDocKeyword(e.target.value)}
              placeholder="搜索文档…"
              className="w-full text-[11px] bg-background border border-border rounded px-1.5 py-1 outline-none focus:border-primary"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {docs.length === 0 ? (
              <div className="text-[11px] text-text-tertiary text-center py-4 opacity-70">暂无文档</div>
            ) : (
              docs.map((d) => (
                <div
                  key={d.id}
                  onClick={() => currentModuleId && loadDoc(currentModuleId, d.id)}
                  className={`px-2 py-1.5 text-[11px] cursor-pointer truncate border-b border-border/40 transition-colors ${
                    currentDoc?.meta.id === d.id ? 'bg-primary/10 text-primary' : 'hover:bg-hover'
                  }`}
                  title={d.title}
                >
                  {d.title}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右：编辑器/预览 */}
        <div className="flex-1 min-w-0 flex flex-col">
          {currentDoc ? (
            <>
              <div className="px-2.5 py-2 border-b border-border flex items-center gap-2">
                <input
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  className="flex-1 text-xs bg-transparent outline-none border-b border-transparent focus:border-primary"
                />
                <button
                  onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
                  className="px-1.5 py-0.5 text-[10px] rounded border border-border text-text-secondary hover:bg-hover"
                >
                  {mode === 'edit' ? '预览' : '编辑'}
                </button>
                <button
                  onClick={() => saveDoc(editingContent, editingTitle)}
                  className="px-2 py-0.5 text-[11px] rounded bg-primary text-white hover:brightness-110"
                >
                  保存
                </button>
                <button
                  onClick={() => currentModuleId && deleteDoc(currentDoc.meta.id)}
                  className="px-1.5 py-0.5 text-[10px] rounded border border-border text-error hover:bg-hover"
                >
                  删除
                </button>
              </div>
              {indexStatusForCurrent && (
                <div className="px-2.5 py-1 text-[10px] text-text-tertiary border-b border-border/50">
                  索引进度 {indexStatusForCurrent.indexedDocCount}/{indexStatusForCurrent.docCount} 篇文档
                </div>
              )}
              <div className="flex-1 min-h-0">
                {mode === 'edit' ? (
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    className="w-full h-full resize-none text-xs font-mono bg-background p-2.5 outline-none"
                    placeholder="Markdown 内容…"
                  />
                ) : (
                  <pre className="w-full h-full overflow-auto text-xs font-mono whitespace-pre-wrap bg-background p-2.5">
                    {editingContent}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-text-tertiary opacity-70">
              {currentModuleId ? '选择或新建一篇文档' : '先选择知识模块'}
            </div>
          )}
        </div>
      </div>

      {error && <div className="px-3 py-1.5 text-[11px] text-error border-t border-error/20">{error}</div>}

      {/* 新建模块弹窗 */}
      {showNewModule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewModule(false)}>
          <div className="bg-surface border border-border rounded-lg w-72 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium">新建知识模块</h3>
            <input
              value={newModuleName}
              onChange={(e) => setNewModuleName(e.target.value)}
              placeholder="模块名称"
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 outline-none focus:border-primary"
            />
            <input
              value={newModuleDesc}
              onChange={(e) => setNewModuleDesc(e.target.value)}
              placeholder="描述（可选）"
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewModule(false)} className="px-2.5 py-1 text-xs rounded border border-border hover:bg-hover">
                取消
              </button>
              <button
                onClick={async () => {
                  if (!newModuleName.trim()) return;
                  await createModule(newModuleName.trim(), newModuleDesc.trim());
                  setShowNewModule(false);
                  setNewModuleName('');
                  setNewModuleDesc('');
                }}
                className="px-2.5 py-1 text-xs rounded bg-primary text-white disabled:opacity-50"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function ModuleGroup({
  title,
  modules,
  currentId,
  onSelect,
  onToggle,
  onDelete,
}: {
  title: string;
  modules: KnowledgeModuleMeta[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  if (modules.length === 0) return null;
  return (
    <div className="py-1">
      <div className="px-2 py-1 text-[10px] text-text-tertiary font-medium">{title}</div>
      {modules.map((m) => (
        <div
          key={m.id}
          onClick={() => onSelect(m.id)}
          className={`px-2 py-1.5 cursor-pointer transition-colors ${currentId === m.id ? 'bg-primary/10' : 'hover:bg-hover'}`}
          title={m.description}
        >
          <div className="flex items-center justify-between gap-1">
            <span className={`text-[11px] truncate ${currentId === m.id ? 'text-primary' : ''}`}>{m.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle(m.id, !m.enabled);
              }}
              className={`w-6 h-3.5 rounded-full relative transition-colors ${m.enabled ? 'bg-primary' : 'bg-border'}`}
              title={m.enabled ? '禁用' : '启用'}
            >
              <span
                className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${m.enabled ? 'left-3' : 'left-0.5'}`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-text-tertiary">{m.docCount} 篇</span>
            {m.type === 'custom' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(m.id);
                }}
                className="text-[9px] text-error/70 hover:text-error"
              >
                删除
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
