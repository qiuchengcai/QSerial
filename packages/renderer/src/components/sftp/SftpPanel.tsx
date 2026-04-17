/**
 * SFTP 文件浏览器面板
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSftpStore } from '@/stores/sftp';
import { useTerminalStore } from '@/stores/terminal';
import type { SftpFileInfo } from '@qserial/shared';

// ============ SVG 图标组件 ============

const IconArrowLeft: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const IconArrowRight: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const IconRefresh: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
  </svg>
);

const IconUpload: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

const IconFolderPlus: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);

const IconDownload: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

const IconRename: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

const IconTrash: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconOpenFolder: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1M5 19h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2z" />
  </svg>
);

const IconFolder: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconFile: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14,2 14,8 20,8" />
  </svg>
);

const IconLink: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const IconChevronRight: React.FC<{ size?: number }> = ({ size = 10 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9,18 15,12 9,6" />
  </svg>
);

const IconX: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconSort: React.FC<{ size?: number; direction?: 'asc' | 'desc' }> = ({ size = 10, direction }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    {direction === 'asc' ? (
      <path d="M12 5l7 7H5z" />
    ) : direction === 'desc' ? (
      <path d="M12 19l7-7H5z" />
    ) : (
      <path d="M12 5l5 5H7zM12 19l5-5H7z" opacity="0.4" />
    )}
  </svg>
);

// ============ 工具函数 ============

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString().slice(0, 5);
}

// 按文件扩展名获取文件类型图标颜色
function getFileIconColor(name: string, type: string): string {
  if (type === 'directory') return '#e8a838';
  if (type === 'symlink') return '#6cb6ff';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const colorMap: Record<string, string> = {
    // 代码
    js: '#f0db4f', ts: '#3178c6', tsx: '#3178c6', jsx: '#61dafb',
    py: '#3776ab', rs: '#dea584', go: '#00add8', c: '#555555', cpp: '#f34b7d',
    h: '#555555', java: '#b07219', rb: '#701516', php: '#4f5d95',
    // Web
    html: '#e34c26', css: '#563d7c', scss: '#c6538c', less: '#1d365d',
    // 配置/数据
    json: '#89d185', yaml: '#cb171e', yml: '#cb171e', toml: '#9c4221',
    xml: '#e37933', ini: '#89d185', env: '#89d185',
    // Shell
    sh: '#89e051', bash: '#89e051', zsh: '#89e051', fish: '#89e051',
    // 文档
    md: '#519aba', txt: '#cccccc', log: '#cccccc', doc: '#2b579a', docx: '#2b579a',
    pdf: '#cc2027', xls: '#207245', xlsx: '#207245', ppt: '#d24726',
    // 图片
    png: '#a074c4', jpg: '#a074c4', jpeg: '#a074c4', gif: '#a074c4',
    svg: '#f7931e', ico: '#a074c4', webp: '#a074c4',
    // 压缩
    zip: '#f0c040', tar: '#f0c040', gz: '#f0c040', bz2: '#f0c040',
    '7z': '#f0c040', rar: '#f0c040', xz: '#f0c040',
    // 可执行
    exe: '#e06c75', bin: '#e06c75',
    // 数据库
    sql: '#e38c00', db: '#e38c00', sqlite: '#e38c00',
  };
  return colorMap[ext] || '#9da5b4';
}

// ============ 自定义确认对话框 ============

const ConfirmDialog: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ isOpen, title, message, confirmLabel = '确认', danger, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-surface border border-border rounded-lg p-4 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-medium mb-2">{title}</h3>
        <p className="text-sm text-text-secondary mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border border-border hover:bg-hover transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              danger
                ? 'bg-error text-white hover:bg-error/80'
                : 'bg-primary text-white hover:bg-primary/80'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ 自定义输入对话框 ============

const InputDialog: React.FC<{
  isOpen: boolean;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}> = ({ isOpen, title, placeholder, defaultValue = '', onConfirm, onCancel }) => {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) setValue(defaultValue);
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-surface border border-border rounded-lg p-4 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-medium mb-3">{title}</h3>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary"
          placeholder={placeholder}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border border-border hover:bg-hover transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/80 disabled:opacity-50 transition-colors"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ 文件图标组件 ============

const FileIcon: React.FC<{ name: string; type: string; size?: number }> = ({ name, type, size = 14 }) => {
  const color = getFileIconColor(name, type);
  if (type === 'directory') {
    return <IconFolder size={size} />;
  }
  if (type === 'symlink') {
    return <IconLink size={size} />;
  }
  return <span style={{ color }}><IconFile size={size} /></span>;
};

// ============ 排序类型 ============

type SortField = 'name' | 'size' | 'modifyTime';
type SortDirection = 'asc' | 'desc';

// ============ 主组件 ============

export const SftpPanel: React.FC = () => {
  const {
    sessions,
    activeSftpId,
    panelVisible,
    panelWidth,
    setPanelVisible,
    setPanelWidth,
    navigateTo,
    refresh,
    goBack,
    goForward,
    selectFile,
    clearSelection,
    downloadFile,
    uploadFile,
  } = useSftpStore();

  const { sessions: terminalSessions, tabs, activeTabId } = useTerminalStore();

  const [isResizing, setIsResizing] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: string;
    type: 'file' | 'directory' | 'symlink';
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [inputDialog, setInputDialog] = useState<{
    title: string;
    placeholder?: string;
    defaultValue?: string;
    onConfirm: (value: string) => void;
  } | null>(null);

  // 监听进度事件
  useEffect(() => {
    const unsub = window.qserial.sftp.onProgress((event) => {
      useSftpStore.getState().updateProgress(event);
    });
    return unsub;
  }, []);

  // 获取当前活动的 SSH 会话
  const activeSession = activeSftpId ? sessions[activeSftpId] : null;

  // 获取会话显示名称（用关联的终端会话名）
  const getSessionLabel = useCallback((connectionId: string) => {
    const terminalSession = Object.values(terminalSessions).find(
      (s) => s.connectionId === connectionId
    );
    if (terminalSession) {
      const tab = tabs.find((t) => t.sessions.includes(terminalSession.id));
      if (tab) return tab.name;
    }
    // 从 connectionId 尝试提取 host
    return connectionId.length > 8 ? connectionId.slice(0, 8) + '...' : connectionId;
  }, [terminalSessions, tabs]);

  // 排序后的文件列表
  const sortedFiles = useMemo(() => {
    if (!activeSession) return [];
    const files = [...activeSession.files];
    // 目录始终在前
    files.sort((a, b) => {
      // 目录优先
      const aIsDir = a.type === 'directory';
      const bIsDir = b.type === 'directory';
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;

      // 按排序字段
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'size':
          cmp = a.size - b.size;
          break;
        case 'modifyTime':
          cmp = a.modifyTime - b.modifyTime;
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return files;
  }, [activeSession, sortField, sortDirection]);

  // 切换排序
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // 处理拖拽调整宽度
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector('.main-content-container');
      if (container) {
        const rect = container.getBoundingClientRect();
        const newWidth = rect.right - e.clientX;
        setPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setPanelWidth]);

  // 双击进入目录或下载文件
  const handleDoubleClick = async (file: { name: string; type: string }) => {
    if (!activeSession) return;

    if (file.type === 'directory') {
      const newPath = activeSession.currentPath === '/'
        ? `/${file.name}`
        : `${activeSession.currentPath}/${file.name}`;
      await navigateTo(activeSftpId!, newPath);
    } else {
      const localPath = await window.qserial.sftp.pickLocalDir();
      if (localPath) {
        const remotePath = activeSession.currentPath === '/'
          ? `/${file.name}`
          : `${activeSession.currentPath}/${file.name}`;
        await downloadFile(activeSftpId!, remotePath, `${localPath}/${file.name}`);
      }
    }
  };

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent, file: { name: string; type: 'file' | 'directory' | 'symlink' }) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file: file.name, type: file.type });
  };

  const closeContextMenu = () => setContextMenu(null);

  // 上传文件
  const handleUpload = async () => {
    if (!activeSession || !activeSftpId) return;
    const localPath = await window.qserial.sftp.pickLocalFile();
    if (localPath) {
      const fileName = localPath.split('/').pop() || 'file';
      const remotePath = activeSession.currentPath === '/'
        ? `/${fileName}`
        : `${activeSession.currentPath}/${fileName}`;
      await uploadFile(activeSftpId, localPath, remotePath);
    }
  };

  // 新建文件夹
  const handleMkdir = () => {
    if (!activeSession || !activeSftpId) return;
    setInputDialog({
      title: '新建文件夹',
      placeholder: '输入文件夹名称',
      onConfirm: async (name) => {
        const remotePath = activeSession.currentPath === '/'
          ? `/${name}`
          : `${activeSession.currentPath}/${name}`;
        try {
          await window.qserial.sftp.mkdir(activeSftpId!, remotePath);
          await refresh(activeSftpId!);
        } catch (error) {
          console.error('Failed to create directory:', error);
        }
        setInputDialog(null);
      },
    });
  };

  // 重命名
  const handleRename = (fileName: string) => {
    if (!activeSession || !activeSftpId) return;
    closeContextMenu();
    setInputDialog({
      title: '重命名',
      placeholder: '输入新名称',
      defaultValue: fileName,
      onConfirm: async (newName) => {
        const oldRemotePath = activeSession.currentPath === '/'
          ? `/${fileName}`
          : `${activeSession.currentPath}/${fileName}`;
        const newRemotePath = activeSession.currentPath === '/'
          ? `/${newName}`
          : `${activeSession.currentPath}/${newName}`;
        try {
          await window.qserial.sftp.rename(activeSftpId!, oldRemotePath, newRemotePath);
          await refresh(activeSftpId!);
        } catch (error) {
          console.error('Failed to rename:', error);
        }
        setInputDialog(null);
      },
    });
  };

  // 删除文件/文件夹
  const handleDelete = (fileName: string, type: 'file' | 'directory' | 'symlink') => {
    if (!activeSession || !activeSftpId) return;
    closeContextMenu();
    setConfirmDialog({
      title: '确认删除',
      message: `确定要删除 "${fileName}" 吗？${type === 'directory' ? '该文件夹下的所有内容也将被删除。' : ''}`,
      onConfirm: async () => {
        const remotePath = activeSession.currentPath === '/'
          ? `/${fileName}`
          : `${activeSession.currentPath}/${fileName}`;
        try {
          if (type === 'directory') {
            await window.qserial.sftp.rmdir(activeSftpId!, remotePath);
          } else {
            await window.qserial.sftp.rm(activeSftpId!, remotePath);
          }
          await refresh(activeSftpId!);
        } catch (error) {
          console.error('Failed to delete:', error);
        }
        setConfirmDialog(null);
      },
    });
  };

  // 面包屑路径
  const breadcrumbs = useMemo(() => {
    if (!activeSession) return [];
    const path = activeSession.currentPath;
    const homePath = activeSession.homePath || '/';

    // 如果路径就是 home 目录
    if (path === homePath) return [{ name: '~', path: homePath }];

    // 如果路径在 home 目录下，用 ~ 替换 home 前缀
    if (path.startsWith(homePath + '/')) {
      const relativePart = path.slice(homePath.length + 1);
      const parts = relativePart.split('/').filter(Boolean);
      return [
        { name: '~', path: homePath },
        ...parts.map((part, i) => ({
          name: part,
          path: homePath + '/' + parts.slice(0, i + 1).join('/'),
        })),
      ];
    }

    // 不在 home 下，正常显示
    if (path === '/') return [{ name: '/', path: '/' }];
    const parts = path.split('/').filter(Boolean);
    return [
      { name: '/', path: '/' },
      ...parts.map((part, i) => ({
        name: part,
        path: '/' + parts.slice(0, i + 1).join('/'),
      })),
    ];
  }, [activeSession]);

  if (!panelVisible) return null;

  return (
    <>
      {/* 拖拽分隔条 */}
      <div
        className={`w-1 bg-border hover:bg-primary cursor-col-resize transition-colors flex-shrink-0 ${
          isResizing ? 'bg-primary' : ''
        }`}
        onMouseDown={handleMouseDown}
      />

      {/* SFTP 面板 */}
      <div
        className="flex flex-col bg-surface border-l border-border flex-shrink-0 animate-slideIn"
        style={{ width: panelWidth }}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-3 h-8 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <IconFolder size={14} />
            <span className="text-xs font-medium text-text-secondary">远程文件</span>
            {Object.keys(sessions).length > 1 && activeSession && (
              <select
                value={activeSftpId || ''}
                onChange={(e) => useSftpStore.getState().setActiveSession(e.target.value)}
                className="text-xs bg-background border border-border rounded px-1 py-0.5 max-w-[100px] truncate"
              >
                {Object.values(sessions).map((s) => (
                  <option key={s.sftpId} value={s.sftpId}>
                    {getSessionLabel(s.connectionId)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <button
            onClick={() => setPanelVisible(false)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-hover text-text-secondary"
            title="关闭面板"
          >
            <IconX size={12} />
          </button>
        </div>

        {activeSession ? (
          <>
            {/* 工具栏 */}
            <div className="flex items-center gap-0.5 px-2 h-7 border-b border-border flex-shrink-0">
              <button
                onClick={() => goBack(activeSftpId!)}
                disabled={activeSession.historyIndex <= 0}
                className="w-6 h-5 flex items-center justify-center rounded hover:bg-hover disabled:opacity-30 transition-colors"
                title="后退"
              >
                <IconArrowLeft size={13} />
              </button>
              <button
                onClick={() => goForward(activeSftpId!)}
                disabled={activeSession.historyIndex >= activeSession.history.length - 1}
                className="w-6 h-5 flex items-center justify-center rounded hover:bg-hover disabled:opacity-30 transition-colors"
                title="前进"
              >
                <IconArrowRight size={13} />
              </button>
              <button
                onClick={() => refresh(activeSftpId!)}
                className="w-6 h-5 flex items-center justify-center rounded hover:bg-hover transition-colors"
                title="刷新"
              >
                <IconRefresh size={13} />
              </button>
              <div className="w-px h-3.5 bg-border mx-1" />
              <button
                onClick={handleUpload}
                className="w-6 h-5 flex items-center justify-center rounded hover:bg-hover transition-colors"
                title="上传文件"
              >
                <IconUpload size={13} />
              </button>
              <button
                onClick={handleMkdir}
                className="w-6 h-5 flex items-center justify-center rounded hover:bg-hover transition-colors"
                title="新建文件夹"
              >
                <IconFolderPlus size={13} />
              </button>
            </div>

            {/* 面包屑路径栏 */}
            <div className="flex items-center px-2 h-6 border-b border-border text-xs overflow-x-auto scrollbar-hide flex-shrink-0">
              {breadcrumbs.map((crumb, i) => (
                <React.Fragment key={crumb.path}>
                  {i > 0 && <IconChevronRight size={8} />}
                  <button
                    onClick={() => navigateTo(activeSftpId!, crumb.path)}
                    className={`px-1 py-0.5 rounded hover:bg-hover transition-colors whitespace-nowrap ${
                      i === breadcrumbs.length - 1
                        ? 'text-text'
                        : 'text-text-secondary hover:text-text'
                    }`}
                  >
                    {crumb.name === '/' ? '/' : crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* 文件列表表头 */}
            <div className="flex items-center px-2 h-6 border-b border-border text-xs text-text-secondary flex-shrink-0 select-none">
              <button
                onClick={() => handleSort('name')}
                className="flex items-center gap-1 flex-1 min-w-0 hover:text-text transition-colors"
              >
                <span>名称</span>
                <IconSort size={8} direction={sortField === 'name' ? sortDirection : undefined} />
              </button>
              <button
                onClick={() => handleSort('size')}
                className="flex items-center gap-1 w-16 justify-end hover:text-text transition-colors"
              >
                <span>大小</span>
                <IconSort size={8} direction={sortField === 'size' ? sortDirection : undefined} />
              </button>
              <button
                onClick={() => handleSort('modifyTime')}
                className="flex items-center gap-1 w-28 justify-end hover:text-text transition-colors"
              >
                <span>修改时间</span>
                <IconSort size={8} direction={sortField === 'modifyTime' ? sortDirection : undefined} />
              </button>
            </div>

            {/* 文件列表 */}
            <div className="flex-1 overflow-y-auto min-h-0" onClick={() => activeSftpId && clearSelection(activeSftpId)}>
              {activeSession.loading ? (
                <div className="flex items-center justify-center h-20 text-text-secondary text-xs">
                  <IconRefresh size={14} />
                  <span className="ml-2">加载中...</span>
                </div>
              ) : activeSession.error ? (
                <div className="flex items-center justify-center h-20 text-error text-xs">
                  {activeSession.error}
                </div>
              ) : sortedFiles.length === 0 ? (
                <div className="flex items-center justify-center h-20 text-text-secondary text-xs">
                  空目录
                </div>
              ) : (
                <div className="py-0.5">
                  {/* 返回上级 */}
                  {activeSession.currentPath !== '/' && (
                    <div
                      className="flex items-center gap-2 px-2 py-1 hover:bg-hover cursor-pointer"
                      onClick={async () => {
                        const parentPath = activeSession.currentPath.split('/').slice(0, -1).join('/') || '/';
                        await navigateTo(activeSftpId!, parentPath);
                      }}
                    >
                      <IconOpenFolder size={14} />
                      <span className="text-xs text-text-secondary">..</span>
                    </div>
                  )}

                  {/* 文件列表 */}
                  {sortedFiles.map((file) => {
                    const isSelected = activeSession.selectedFiles.includes(file.name);
                    return (
                    <div
                      key={file.name}
                      className={`flex items-center gap-2 px-2 py-1 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-primary/20 border-l-2 border-primary text-text'
                          : 'hover:bg-hover border-l-2 border-transparent'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectFile(activeSftpId!, file.name, e.ctrlKey || e.metaKey);
                      }}
                      onDoubleClick={() => handleDoubleClick(file)}
                      onContextMenu={(e) =>
                        handleContextMenu(e, {
                          name: file.name,
                          type: file.type as 'file' | 'directory' | 'symlink',
                        })
                      }
                    >
                      <FileIcon name={file.name} type={file.type} size={14} />
                      <span className="flex-1 text-xs truncate">{file.name}</span>
                      <span className="text-xs text-text-secondary w-16 text-right flex-shrink-0">
                        {file.type === 'file' ? formatSize(file.size) : ''}
                      </span>
                      <span className="text-xs text-text-secondary w-28 text-right flex-shrink-0">
                        {formatTime(file.modifyTime)}
                      </span>
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          /* 无活动会话 */
          <div className="flex-1 flex flex-col items-center justify-center text-text-secondary">
            <IconFolder size={32} />
            <p className="text-xs mt-3 mb-1">SFTP 文件浏览器</p>
            <p className="text-xs text-center px-4 text-text-secondary">
              连接 SSH 后，点击状态栏上的 SFTP 按钮打开
            </p>
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} />
          <div
            className="fixed z-50 bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.type === 'file' && (
              <button
                onClick={async () => {
                  if (!activeSession || !activeSftpId) return;
                  const localDir = await window.qserial.sftp.pickLocalDir();
                  if (localDir) {
                    const remotePath = activeSession.currentPath === '/'
                      ? `/${contextMenu.file}`
                      : `${activeSession.currentPath}/${contextMenu.file}`;
                    await downloadFile(activeSftpId, remotePath, `${localDir}/${contextMenu.file}`);
                  }
                  closeContextMenu();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-hover transition-colors"
              >
                <IconDownload size={12} />
                <span>下载</span>
              </button>
            )}
            {contextMenu.type === 'directory' && (
              <button
                onClick={async () => {
                  if (!activeSession || !activeSftpId) return;
                  const newPath = activeSession.currentPath === '/'
                    ? `/${contextMenu.file}`
                    : `${activeSession.currentPath}/${contextMenu.file}`;
                  await navigateTo(activeSftpId, newPath);
                  closeContextMenu();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-hover transition-colors"
              >
                <IconOpenFolder size={12} />
                <span>打开</span>
              </button>
            )}
            <button
              onClick={() => handleRename(contextMenu.file)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-hover transition-colors"
            >
              <IconRename size={12} />
              <span>重命名</span>
            </button>
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => handleDelete(contextMenu.file, contextMenu.type)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-hover text-error transition-colors"
            >
              <IconTrash size={12} />
              <span>删除</span>
            </button>
          </div>
        </>
      )}

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={!!confirmDialog}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        confirmLabel="删除"
        danger
        onConfirm={confirmDialog?.onConfirm || (() => {})}
        onCancel={() => setConfirmDialog(null)}
      />

      {/* 输入对话框 */}
      <InputDialog
        isOpen={!!inputDialog}
        title={inputDialog?.title || ''}
        placeholder={inputDialog?.placeholder}
        defaultValue={inputDialog?.defaultValue}
        onConfirm={inputDialog?.onConfirm || (() => {})}
        onCancel={() => setInputDialog(null)}
      />
    </>
  );
};
