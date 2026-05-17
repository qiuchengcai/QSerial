/**
 * 快捷按钮栏组件 - 支持分组折叠和颜色自定义
 */

import React, { useState, useEffect } from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { useQuickButtonsStore, type QuickButton, type ButtonGroup, type ButtonBarDirection, PRESET_COLORS } from '@/stores/quickButtons';
import { ConnectionState } from '@qserial/shared';

interface ButtonDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editingButton?: QuickButton | null;
  onSave: (button: Omit<QuickButton, 'id'>) => void;
}

const ButtonDialog: React.FC<ButtonDialogProps> = ({
  isOpen,
  onClose,
  editingButton,
  onSave,
}) => {
  const [name, setName] = useState(editingButton?.name || '');
  const [command, setCommand] = useState(editingButton?.commands?.join('\n') || editingButton?.command || '');
  const [delay, setDelay] = useState(editingButton?.delay ?? 100);
  const [description, setDescription] = useState(editingButton?.description || '');
  const [color, setColor] = useState(editingButton?.color || '');
  const [textColor, setTextColor] = useState(editingButton?.textColor || '');
  const [customColor, setCustomColor] = useState(editingButton?.color || '');
  const [noNewline, setNoNewline] = useState(editingButton?.noNewline ?? false);

  // 编辑时同步已有数据
  useEffect(() => {
    if (isOpen) {
      setName(editingButton?.name || '');
      setCommand(editingButton?.commands?.join('\n') || editingButton?.command || '');
      setDelay(editingButton?.delay ?? 100);
      setDescription(editingButton?.description || '');
      setColor(editingButton?.color || '');
      setTextColor(editingButton?.textColor || '');
      setCustomColor(editingButton?.color || '');
      setNoNewline(editingButton?.noNewline ?? false);
    }
  }, [isOpen, editingButton]);

  const handleSave = () => {
    if (!name.trim() || !command.trim()) return;
    const lines = command.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    onSave({
      name: name.trim(),
      command: lines[0] || '',
      commands: lines.length > 1 ? lines : undefined,
      delay: lines.length > 1 ? delay : undefined,
      noNewline: noNewline || undefined,
      description: description.trim() || undefined,
      color: customColor || color,
      textColor: customColor ? (isLightColor(customColor) ? '#000000' : '#FFFFFF') : textColor,
    });
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setName('');
    setCommand('');
    setDelay(100);
    setDescription('');
    setColor('');
    setTextColor('');
    setCustomColor('');
    setNoNewline(false);
  };

  const isLightColor = (hex: string): boolean => {
    if (!hex) return false;
    const c = hex.substring(1);
    const rgb = parseInt(c, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma > 128;
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border/80 rounded-xl shadow-md w-[420px]">
        {/* 标题 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">
            {editingButton ? '编辑按钮' : '添加按钮'}
          </h3>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* 名称 + 描述 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="dialog-input"
                placeholder="按钮名称"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">描述</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="dialog-input"
                placeholder="可选"
              />
            </div>
          </div>

          {/* 命令 */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">命令</label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="dialog-input min-h-[72px] resize-y"
              placeholder={"要发送的命令（每行一条，支持 \\xHH \\n \\r 转义）"}
              rows={3}
            />
            <div className="flex items-center gap-3 mt-1.5">
              <label className="flex items-center gap-1.5 text-[11px] text-text-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={noNewline}
                  onChange={(e) => setNoNewline(e.target.checked)}
                  className="dialog-checkbox w-3.5 h-3.5"
                />
                不追加换行
              </label>
              {command.includes('\n') && (
                <label className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                  <span>延迟</span>
                  <input
                    type="number"
                    value={delay}
                    onChange={(e) => setDelay(Number(e.target.value) || 100)}
                    className="dialog-input w-16 h-6 text-[11px] px-1.5 py-0"
                    min={0}
                    step={50}
                  />
                  <span>ms</span>
                </label>
              )}
            </div>
          </div>

          {/* 颜色选择 */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">按钮颜色</label>
            <div className="flex flex-wrap gap-2.5 mb-2.5">
              {PRESET_COLORS.map((c) => {
                const isActive = color === c.value && !customColor;
                return (
                  <button
                    key={c.value || 'default'}
                    type="button"
                    onClick={() => {
                      setColor(c.value);
                      setTextColor(c.textColor);
                      setCustomColor('');
                    }}
                    className={`w-7 h-7 rounded-lg transition-all ${
                      isActive
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-[var(--color-surface)] scale-110'
                        : 'ring-1 ring-transparent hover:scale-105'
                    }`}
                    style={{
                      backgroundColor: c.value || 'var(--color-surface)',
                      border: c.value ? 'none' : '1px solid var(--color-border)',
                    }}
                    title={c.name}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-text-secondary">自定义</span>
              <div className="relative">
                <input
                  type="color"
                  value={customColor || color || '#3B82F6'}
                  onChange={(e) => {
                    setCustomColor(e.target.value);
                    setColor('');
                  }}
                  className="w-7 h-7 rounded-lg cursor-pointer border border-border"
                />
              </div>
              {customColor && (
                <span className="text-[11px] font-mono text-text-secondary/60">{customColor}</span>
              )}
            </div>
          </div>

          {/* 实时预览 */}
          <div className="bg-background/50 rounded-lg border border-border/50 p-3">
            <label className="block text-[11px] text-text-secondary/60 mb-2">预览</label>
            <button
              type="button"
              className="h-7 pl-2.5 pr-3 text-[11px] rounded-[5px] whitespace-nowrap transition-all flex items-center gap-1.5 font-mono tracking-tight"
              style={(() => {
                const activeColor = customColor || color;
                if (!activeColor) {
                  return {
                    backgroundColor: 'transparent',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                  };
                }
                return {
                  backgroundColor: `${activeColor}40`,
                  border: `1px solid ${activeColor}60`,
                  color: 'var(--color-text)',
                };
              })()}
            >
              {(() => {
                const activeColor = customColor || color;
                return activeColor ? <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ backgroundColor: activeColor }} /> : null;
              })()}
              {name || '按钮名称'}
            </button>
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-background/30">
          <button onClick={onClose} className="dialog-btn dialog-btn-secondary text-xs px-4 py-1.5">取消</button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !command.trim()}
            className="dialog-btn dialog-btn-primary text-xs px-4 py-1.5"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

interface GroupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editingGroup?: ButtonGroup | null;
  onSave: (name: string) => void;
}

const GroupDialog: React.FC<GroupDialogProps> = ({ isOpen, onClose, editingGroup, onSave }) => {
  const [name, setName] = useState(editingGroup?.name || '');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border/80 rounded-xl shadow-md w-[360px]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">{editingGroup ? '编辑分组' : '新建分组'}</h3>
        </div>
        <div className="p-4">
          <label className="block text-xs text-text-secondary mb-1.5 font-medium">分组名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="dialog-input"
            placeholder="分组名称"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-background/30">
          <button onClick={onClose} className="dialog-btn dialog-btn-secondary text-xs px-4 py-1.5">取消</button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="dialog-btn dialog-btn-primary text-xs px-4 py-1.5"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

interface QuickButtonBarProps {
  direction?: ButtonBarDirection;
}

export const QuickButtonBar: React.FC<QuickButtonBarProps> = ({ direction: directionProp }) => {
  const terminalState = useTerminalStore();
  const tabs = terminalState?.tabs || [];
  const activeTabId = terminalState?.activeTabId;
  const sessions = terminalState?.sessions || {};
  const quickButtonsState = useQuickButtonsStore();
  const groups = quickButtonsState?.groups || [];
  const addGroup = quickButtonsState?.addGroup;
  const updateGroup = quickButtonsState?.updateGroup;
  const removeGroup = quickButtonsState?.removeGroup;
  const addButton = quickButtonsState?.addButton;
  const updateButton = quickButtonsState?.updateButton;
  const removeButton = quickButtonsState?.removeButton;
  const reorderGroups = quickButtonsState?.reorderGroups;
  const moveButton = quickButtonsState?.moveButton;
  const setDirection = quickButtonsState?.setDirection;
  const storeDirection = quickButtonsState?.direction || 'horizontal';
  const direction = directionProp || storeDirection;
  const isVertical = direction === 'vertical';

  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [showButtonDialog, setShowButtonDialog] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [editingButton, setEditingButton] = useState<QuickButton | null>(null);
  const [editingGroup, setEditingGroup] = useState<ButtonGroup | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'button' | 'group'; groupId: string; buttonId?: string; buttonIndex?: number; groupIndex?: number } | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeSession = activeTab?.activeSessionId ? sessions[activeTab.activeSessionId] : null;
  const isConnected = activeSession?.connectionState === ConnectionState.CONNECTED;
  const connectionId = activeSession?.connectionId;

  const parseEscapeSequences = (cmd: string): string => {
    return cmd
      // \xHH -> 实际字节（如 \x02 = Ctrl+B）
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      )
      // \n -> 换行符
      .replace(/\\n/g, '\n')
      // \r -> 回车符
      .replace(/\\r/g, '\r')
      // \0 -> NUL
      .replace(/\\0/g, '\0')
      // \\ -> 反斜杠
      .replace(/\\\\/g, '\\');
  };

  const handleSendCommand = (button: QuickButton) => {
    if (!isConnected || !connectionId) return;
    const commands = button.commands || [button.command];
    const delay = button.delay ?? 100;
    const noNewline = button.noNewline ?? false;
    commands.forEach((cmd, i) => {
      setTimeout(() => {
        if (isConnected && connectionId) {
          const parsed = parseEscapeSequences(cmd);
          const suffix = noNewline ? '' : '\r\n';
          window.qserial.connection.write(connectionId, parsed + suffix);
        }
      }, i * delay);
    });
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'button' | 'group', groupId: string, buttonId?: string, buttonIndex?: number, groupIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, groupId, buttonId, buttonIndex, groupIndex });
  };

  // 点击 ⋯ 按钮打开分组操作菜单
  const handleGroupMenuClick = (e: React.MouseEvent) => {
    const group = groups[activeGroupIndex];
    if (!group) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ x: rect.right - 4, y: rect.bottom + 2, type: 'group', groupId: group.id, groupIndex: activeGroupIndex });
  };

  const handleEditButton = () => {
    if (!contextMenu) return;
    const group = groups.find((g) => g.id === contextMenu.groupId);
    const button = group?.buttons.find((b) => b.id === contextMenu.buttonId);
    if (button) {
      setEditingButton(button);
      setActiveGroupId(contextMenu.groupId);
      setShowButtonDialog(true);
    }
    setContextMenu(null);
  };

  const handleDeleteButton = () => {
    if (!contextMenu || !contextMenu.buttonId) return;
    removeButton(contextMenu.groupId, contextMenu.buttonId);
    setContextMenu(null);
  };

  const handleEditGroup = () => {
    if (!contextMenu) return;
    const group = groups.find((g) => g.id === contextMenu.groupId);
    if (group) {
      setEditingGroup(group);
      setShowGroupDialog(true);
    }
    setContextMenu(null);
  };

  const handleDeleteGroup = () => {
    if (!contextMenu) return;
    const group = groups.find((g) => g.id === contextMenu.groupId);
    if (!group) return;
    if (!window.confirm(`确定要删除分组「${group.name}」吗？\n分组内的所有按钮将被一并删除。`)) return;
    removeGroup(contextMenu.groupId);
    setContextMenu(null);
  };

  const handleSaveButton = (buttonData: Omit<QuickButton, 'id'>) => {
    if (editingButton && activeGroupId) {
      updateButton(activeGroupId, editingButton.id, buttonData);
    } else if (activeGroupId) {
      addButton(activeGroupId, buttonData);
    }
    setEditingButton(null);
  };

  const handleSaveGroup = (name: string) => {
    if (editingGroup) {
      updateGroup(editingGroup.id, name);
    } else {
      addGroup(name);
    }
    setEditingGroup(null);
  };

  return (
    <>
      {isVertical ? (
        // 垂直模式：右侧面板，三区布局（管理 | 按钮 | 工具）
        <div className="w-[var(--buttonbar-width)] flex flex-col overflow-y-auto scrollbar-hide flex-1 min-h-0">
          {/* 顶区 — 分组选择 + 切回水平 */}
          <div className="flex items-center gap-1 px-1.5 py-1.5 flex-shrink-0 border-b border-border">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="text-text-secondary/50 flex-shrink-0">
              <path d="M2 4h4l1.5-2h6.5v10H2V4z" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
            <select
              value={groups.length > 0 ? activeGroupIndex : -1}
              onChange={(e) => setActiveGroupIndex(Number(e.target.value))}
              onContextMenu={(e) => {
                if (groups[activeGroupIndex]) {
                  handleContextMenu(e, 'group', groups[activeGroupIndex].id, undefined, undefined, activeGroupIndex);
                }
              }}
              className="h-6 px-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:border-primary hover:border-text-secondary transition-colors cursor-pointer appearance-none flex-1 min-w-0"
              style={{ paddingRight: '16px', backgroundImage: 'url("data:image/svg+xml,%3Csvg width=%278%27 height=%275%27 viewBox=%270 0 8 5%27 fill=%27none%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cpath d=%27M1 1l3 3 3-3%27 stroke=%27%23888780%27 stroke-width=%271.2%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center' }}
            >
              {groups.length === 0 ? (
                <option value={-1} disabled>暂无分组</option>
              ) : (
                groups.map((group: ButtonGroup, index: number) => (
                  <option key={group.id} value={index}>{group.name}</option>
                ))
              )}
            </select>
            {groups.length > 0 && (
              <button
                onClick={handleGroupMenuClick}
                className="h-6 w-5 rounded hover:bg-hover transition-colors flex items-center justify-center flex-shrink-0 text-text-secondary/40 hover:text-text-secondary"
                title="分组操作"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <circle cx="5" cy="2" r="0.9" /><circle cx="5" cy="5" r="0.9" /><circle cx="5" cy="8" r="0.9" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setDirection?.('horizontal')}
              className="h-6 w-6 text-xs rounded-md border border-border hover:bg-hover hover:border-text-secondary transition-colors flex items-center justify-center flex-shrink-0 text-text-secondary"
              title="切换为水平布局"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1" y="1.5" width="10" height="2" rx="0.5" fill="currentColor" />
                <rect x="1" y="5" width="10" height="2" rx="0.5" fill="currentColor" />
                <rect x="1" y="8.5" width="10" height="2" rx="0.5" fill="currentColor" />
              </svg>
            </button>
          </div>

          {/* 中区 — 命令按钮 / 引导提示 */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
            {isConnected && groups[activeGroupIndex] ? (
              <div className="flex flex-col gap-1 p-1.5">
                {groups[activeGroupIndex].buttons.map((button: QuickButton, btnIndex: number) => {
                  const fc = button.color || '';
                  const isDefault = !fc;
                  return (
                    <button
                      key={button.id}
                      onClick={(e) => { handleSendCommand(button); (e.target as HTMLButtonElement).blur(); }}
                      onContextMenu={(e) => handleContextMenu(e, 'button', groups[activeGroupIndex].id, button.id, btnIndex, activeGroupIndex)}
                      className={`h-7 pl-2.5 pr-2.5 text-[11px] rounded-[5px] whitespace-nowrap transition-all w-full text-left truncate flex items-center gap-1.5 ${
                        isDefault ? 'hover:bg-hover text-text-secondary' : 'hover:-translate-y-[0.5px] active:translate-y-0'
                      }`}
                      style={isDefault ? {
                        backgroundColor: 'transparent',
                        border: '1px solid var(--color-border)',
                      } : {
                        backgroundColor: `${fc}40`,
                        border: `1px solid ${fc}60`,
                        color: 'var(--color-text)',
                      }}
                      title={button.description || (button.commands?.length ? `发送 ${button.commands.length} 条命令` : `发送: ${button.command}`)}
                      onMouseEnter={(e) => {
                        if (fc) {
                          const el = e.currentTarget;
                          el.style.borderColor = fc;
                          el.style.boxShadow = `0 0 0 1px ${fc}30, 0 0 14px ${fc}15`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (fc) {
                          e.currentTarget.style.borderColor = `${fc}60`;
                          e.currentTarget.style.boxShadow = 'none';
                        }
                      }}
                    >
                      {fc && <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ backgroundColor: fc }} />}
                      <span className="font-mono tracking-tight truncate">{button.name}</span>
                    </button>
                  );
                }                )}
                <button
                  onClick={() => {
                    setActiveGroupId(groups[activeGroupIndex].id);
                    setEditingButton(null);
                    setShowButtonDialog(true);
                  }}
                  className="h-7 w-full text-xs rounded-md border border-dashed border-border hover:bg-hover hover:border-text-secondary transition-colors flex items-center justify-center gap-1 text-text-tertiary"
                  title="添加按钮"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <span>添加</span>
                </button>
              </div>
            ) : (
              <div className="p-2">
                <span className="text-[11px] text-text-tertiary/60 italic leading-snug">创建终端连接后可发送快捷命令</span>
              </div>
            )}
          </div>

          {/* 底区 — 添加分组 */}
          <div className="p-1.5 flex-shrink-0 border-t border-border">
            <button
              onClick={() => {
                setEditingGroup(null);
                setShowGroupDialog(true);
              }}
              className="h-7 w-full text-xs rounded-md border border-dashed border-border hover:bg-hover hover:border-text-secondary transition-colors flex items-center justify-center gap-1 text-text-tertiary"
              title="添加分组"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              分组
            </button>
          </div>
        </div>
      ) : (
        // 水平模式：三区布局（分组管理 | 命令按钮 | 工具）
        <div className="h-[var(--buttonbar-height)] flex items-center px-2 gap-0 flex-1 min-w-0">
          {/* 左区 — 分组管理 */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-text-secondary/30 flex-shrink-0">
              <path d="M2 4h4l1.5-2h6.5v10H2V4z" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
            <span className="text-[11px] text-text-secondary/50 font-medium">组</span>
            <select
              value={groups.length > 0 ? activeGroupIndex : -1}
              onChange={(e) => setActiveGroupIndex(Number(e.target.value))}
              onContextMenu={(e) => {
                if (groups[activeGroupIndex]) {
                  handleContextMenu(e, 'group', groups[activeGroupIndex].id, undefined, undefined, activeGroupIndex);
                }
              }}
              className="h-6 px-2 text-[11px] bg-background border border-border rounded-md focus:outline-none focus:border-primary hover:border-text-secondary transition-colors cursor-pointer appearance-none min-w-[56px]"
              style={{ paddingRight: '18px', backgroundImage: 'url("data:image/svg+xml,%3Csvg width=%278%27 height=%275%27 viewBox=%270 0 8 5%27 fill=%27none%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cpath d=%27M1 1l3 3 3-3%27 stroke=%27%23888780%27 stroke-width=%271%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center' }}
            >
              {groups.length === 0 ? (
                <option value={-1} disabled>暂无分组</option>
              ) : (
                groups.map((group: ButtonGroup, index: number) => (
                  <option key={group.id} value={index}>{group.name}</option>
                ))
              )}
            </select>
            {groups.length > 0 && (
              <button
                onClick={handleGroupMenuClick}
                className="h-6 w-4 rounded hover:bg-hover transition-colors flex items-center justify-center flex-shrink-0 text-text-secondary/20 hover:text-text-secondary/50"
                title="分组操作"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <circle cx="5" cy="2" r="0.8" /><circle cx="5" cy="5" r="0.8" /><circle cx="5" cy="8" r="0.8" />
                </svg>
              </button>
            )}
            <div className="w-px h-4 bg-border/60 mx-1.5" />
          </div>

          {/* 中区 — 命令按钮 / 引导提示 */}
          {isConnected && groups[activeGroupIndex] ? (
            <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide min-w-0">
              {groups[activeGroupIndex].buttons.map((button: QuickButton, btnIndex: number) => {
                const fc = button.color || '';
                const isDefault = !fc;
                return (
                  <button
                    key={button.id}
                    onClick={(e) => { handleSendCommand(button); (e.target as HTMLButtonElement).blur(); }}
                    onContextMenu={(e) => handleContextMenu(e, 'button', groups[activeGroupIndex].id, button.id, btnIndex, activeGroupIndex)}
                    className={`h-[26px] pl-2 pr-2.5 text-[11px] rounded-[5px] whitespace-nowrap transition-all flex-shrink-0 flex items-center gap-1.5 ${
                      isDefault ? 'hover:bg-hover text-text-secondary' : 'hover:-translate-y-[0.5px] active:translate-y-0'
                    }`}
                    style={isDefault ? {
                      backgroundColor: 'transparent',
                      border: '1px solid var(--color-border)',
                    } : {
                      backgroundColor: `${fc}40`,
                      border: `1px solid ${fc}60`,
                      color: 'var(--color-text)',
                    }}
                    title={button.description || (button.commands?.length ? `发送 ${button.commands.length} 条命令` : `发送: ${button.command}`)}
                    onMouseEnter={(e) => {
                      if (fc) {
                        const el = e.currentTarget;
                        el.style.borderColor = fc;
                        el.style.boxShadow = `0 0 0 1px ${fc}30, 0 0 14px ${fc}15`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (fc) {
                        e.currentTarget.style.borderColor = `${fc}60`;
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    {fc && <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ backgroundColor: fc }} />}
                    <span className="font-mono tracking-tight">{button.name}</span>
                  </button>
                );
              })}
              <button
                onClick={() => {
                  setActiveGroupId(groups[activeGroupIndex].id);
                  setEditingButton(null);
                  setShowButtonDialog(true);
                }}
                className="h-[26px] w-[26px] text-xs rounded-md border border-dashed border-border hover:bg-hover hover:border-text-secondary transition-colors flex items-center justify-center flex-shrink-0 text-text-tertiary hover:text-text-secondary"
                title="添加按钮"
              >
                <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-text-tertiary/30 flex-shrink-0"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1"/><path d="M6 4v3M6 8.5v.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
              <span className="text-[11px] text-text-tertiary/50 px-0.5 truncate">连接终端后使用快捷命令</span>
            </div>
          )}

          {/* 右区 — 工具 */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-2 pl-2 border-l border-border">
            <button
              onClick={() => setDirection?.('vertical')}
              className="h-[26px] w-[26px] text-xs rounded-md border border-border hover:bg-hover hover:border-text-secondary transition-colors flex items-center justify-center flex-shrink-0 text-text-secondary/60 hover:text-text-secondary"
              title="切换为垂直布局"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="0.5" y="0.5" width="4" height="4" rx="0.5" fill="currentColor" />
                <rect x="7" y="0.5" width="4" height="4" rx="0.5" fill="currentColor" />
                <rect x="0.5" y="7" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.3" />
                <rect x="7" y="7" width="4" height="4" rx="0.5" fill="currentColor" />
              </svg>
            </button>
            <button
              onClick={() => {
                setEditingGroup(null);
                setShowGroupDialog(true);
              }}
              className="h-[26px] w-[26px] text-xs rounded-md border border-dashed border-border hover:bg-hover hover:border-text-secondary transition-colors flex items-center justify-center flex-shrink-0 text-text-tertiary hover:text-text-secondary"
              title="添加分组"
            >
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
                <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 按钮对话框 */}
      <ButtonDialog
        isOpen={showButtonDialog}
        onClose={() => {
          setShowButtonDialog(false);
          setEditingButton(null);
        }}
        editingButton={editingButton}
        onSave={handleSaveButton}
      />

      {/* 分组对话框 */}
      <GroupDialog
        isOpen={showGroupDialog}
        onClose={() => {
          setShowGroupDialog(false);
          setEditingGroup(null);
        }}
        editingGroup={editingGroup}
        onSave={handleSaveGroup}
      />

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div
            ref={(el) => {
              if (el) {
                // 确保菜单不超出屏幕
                const rect = el.getBoundingClientRect();
                const menuWidth = rect.width || 80;
                const menuHeight = rect.height || 60;
                let x = contextMenu.x;
                let y = contextMenu.y;

                if (x + menuWidth > window.innerWidth) {
                  x = window.innerWidth - menuWidth - 5;
                }
                if (y + menuHeight > window.innerHeight) {
                  y = window.innerHeight - menuHeight - 5;
                }

                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
              }
            }}
            className="fixed bg-surface border border-border rounded shadow-lg py-1 min-w-[80px] z-50"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.type === 'button' ? (
              <>
                <button onClick={handleEditButton} className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover">编辑</button>
                <button onClick={handleDeleteButton} className="w-full px-3 py-1.5 text-left text-sm text-error hover:bg-hover">删除</button>
                <div className="my-1 border-t border-border" />
                <button
                  onClick={() => {
                    if (contextMenu.buttonIndex !== undefined && contextMenu.buttonIndex > 0 && contextMenu.groupId) {
                      moveButton?.(contextMenu.groupId, contextMenu.groupId, contextMenu.buttonId!, contextMenu.buttonIndex - 1);
                    }
                    setContextMenu(null);
                  }}
                  disabled={contextMenu.buttonIndex === 0}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  左移
                </button>
                <button
                  onClick={() => {
                    if (contextMenu.buttonIndex !== undefined && contextMenu.groupId) {
                      const group = groups.find((g) => g.id === contextMenu.groupId);
                      if (group && contextMenu.buttonIndex < group.buttons.length - 1) {
                        moveButton?.(contextMenu.groupId, contextMenu.groupId, contextMenu.buttonId!, contextMenu.buttonIndex + 1);
                      }
                    }
                    setContextMenu(null);
                  }}
                  disabled={contextMenu.buttonIndex !== undefined && contextMenu.groupId ? contextMenu.buttonIndex >= (groups.find((g) => g.id === contextMenu.groupId)?.buttons.length ?? 0) - 1 : true}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  右移
                </button>
              </>
            ) : (
              <>
                <button onClick={handleEditGroup} className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover">编辑分组</button>
                <button onClick={handleDeleteGroup} className="w-full px-3 py-1.5 text-left text-sm text-error hover:bg-hover">删除分组</button>
                <div className="my-1 border-t border-border" />
                <button
                  onClick={() => {
                    if (contextMenu.groupIndex !== undefined && contextMenu.groupIndex > 0) {
                      reorderGroups?.(contextMenu.groupIndex, contextMenu.groupIndex - 1);
                    }
                    setContextMenu(null);
                  }}
                  disabled={contextMenu.groupIndex === 0}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  左移
                </button>
                <button
                  onClick={() => {
                    if (contextMenu.groupIndex !== undefined && contextMenu.groupIndex < groups.length - 1) {
                      reorderGroups?.(contextMenu.groupIndex, contextMenu.groupIndex + 1);
                    }
                    setContextMenu(null);
                  }}
                  disabled={contextMenu.groupIndex !== undefined ? contextMenu.groupIndex >= groups.length - 1 : true}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  右移
                </button>
              </>
            )}
          </div>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
        </>
      )}
    </>
  );
};
