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
      <div className="dialog-content bg-surface border border-border rounded-xl p-4 w-80">
        <h3 className="text-sm font-medium mb-4">
          {editingButton ? '编辑按钮' : '添加按钮'}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">名称</label>
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
            <label className="block text-xs text-text-secondary mb-1">命令（每行一条，支持多行）</label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="dialog-input min-h-[60px] resize-y"
              placeholder={"要发送的命令\n支持 \\xHH \\n \\r 转义序列"}
              rows={3}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={noNewline}
              onChange={(e) => setNoNewline(e.target.checked)}
              className="w-3.5 h-3.5 accent-primary"
            />
            <span>不自动追加换行（手动用 \n 控制换行）</span>
          </label>
          {command.includes('\n') && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">行间延迟 (ms)</label>
              <input
                type="number"
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value) || 100)}
                className="dialog-input w-20"
                min={0}
                step={50}
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-text-secondary mb-1">描述 (可选)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="dialog-input"
              placeholder="按钮描述"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-2">按钮颜色</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.value || 'default'}
                  type="button"
                  onClick={() => {
                    setColor(c.value);
                    setTextColor(c.textColor);
                    setCustomColor('');
                  }}
                  className={`w-6 h-6 rounded-md border-2 transition-all ${
                    color === c.value && !customColor ? 'border-primary scale-110' : 'border-transparent'
                  }`}
                  style={{
                    backgroundColor: c.value || 'var(--color-surface)',
                    border: c.value ? undefined : '1px solid var(--color-border)',
                  }}
                  title={c.name}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-secondary">自定义:</label>
              <input
                type="color"
                value={customColor || color || '#3B82F6'}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  setColor('');
                }}
                className="w-8 h-6 rounded cursor-pointer"
              />
              {customColor && (
                <span className="text-xs text-text-secondary">{customColor}</span>
              )}
            </div>
          </div>
          {/* 预览 */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">预览</label>
            <button
              type="button"
              className="h-6 px-2 text-xs rounded-md border border-border whitespace-nowrap"
              style={{
                backgroundColor: customColor || color || undefined,
                color: customColor
                  ? (isLightColor(customColor) ? '#000000' : '#FFFFFF')
                  : (textColor || undefined),
              }}
            >
              {name || '按钮名称'}
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="dialog-btn dialog-btn-secondary text-xs">取消</button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !command.trim()}
            className="dialog-btn dialog-btn-primary text-xs"
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
      <div className="dialog-content bg-surface border border-border rounded-xl p-4 w-72">
        <h3 className="text-sm font-medium mb-4">{editingGroup ? '编辑分组' : '新建分组'}</h3>
        <div>
          <label className="block text-xs text-text-secondary mb-1">分组名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="dialog-input"
            placeholder="分组名称"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="dialog-btn dialog-btn-secondary text-xs">取消</button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="dialog-btn dialog-btn-primary text-xs"
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
        // 垂直模式：右侧面板
        <div className="w-[var(--buttonbar-width)] flex flex-col py-1.5 gap-1 overflow-y-auto scrollbar-hide flex-1 min-h-0">
          {/* 分组选择 + 方向切换 */}
          <div className="flex items-center gap-1 px-1.5 flex-shrink-0">
            <select
              value={activeGroupIndex}
              onChange={(e) => setActiveGroupIndex(Number(e.target.value))}
              onContextMenu={(e) => {
                if (groups[activeGroupIndex]) {
                  handleContextMenu(e, 'group', groups[activeGroupIndex].id, undefined, undefined, activeGroupIndex);
                }
              }}
              className="h-6 px-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:border-primary hover:border-text-secondary transition-colors cursor-pointer flex-1 min-w-0"
            >
              {groups.map((group: ButtonGroup, index: number) => (
                <option key={group.id} value={index}>{group.name}</option>
              ))}
            </select>
            <button
              onClick={() => setDirection?.('horizontal')}
              className="h-6 w-6 text-xs rounded-md border border-border hover:bg-hover hover:border-text-secondary transition-colors flex items-center justify-center flex-shrink-0 text-text-secondary"
              title="切换为水平布局"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 5h8M5 1v8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* 当前分组的按钮（垂直排列） */}
          {groups[activeGroupIndex] && (
            <>
              <div className="h-px bg-border mx-1.5 flex-shrink-0" />
              <div className="flex flex-col gap-1 px-1.5">
                {groups[activeGroupIndex].buttons.map((button: QuickButton, btnIndex: number) => (
                  <button
                    key={button.id}
                    onClick={(e) => { handleSendCommand(button); (e.target as HTMLButtonElement).blur(); }}
                    onContextMenu={(e) => handleContextMenu(e, 'button', groups[activeGroupIndex].id, button.id, btnIndex, activeGroupIndex)}
                    disabled={!isConnected}
                    className="h-6 px-2.5 text-xs rounded-md border border-border hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap transition-all w-full text-left"
                    style={{
                      backgroundColor: button.color || undefined,
                      color: button.textColor || undefined,
                    }}
                    title={button.description || (button.commands?.length ? `发送 ${button.commands.length} 条命令` : `发送: ${button.command}`)}
                  >
                    {button.name}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setActiveGroupId(groups[activeGroupIndex].id);
                    setEditingButton(null);
                    setShowButtonDialog(true);
                  }}
                  className="h-6 w-full text-xs rounded-md border border-dashed border-border hover:bg-hover hover:border-text-secondary transition-colors flex items-center justify-center gap-1"
                  title="添加按钮"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <span>添加</span>
                </button>
              </div>
            </>
          )}

          {/* 添加分组 */}
          <div className="px-1.5 flex-shrink-0 mt-auto">
            <button
              onClick={() => {
                setEditingGroup(null);
                setShowGroupDialog(true);
              }}
              className="h-6 w-full text-xs rounded-md border border-dashed border-border hover:bg-hover hover:border-text-secondary whitespace-nowrap transition-colors flex items-center justify-center gap-1"
              title="添加分组"
            >
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              分组
            </button>
          </div>
        </div>
      ) : (
        // 水平模式：底部栏（原有布局）
        <div className="h-[var(--buttonbar-height)] flex items-center px-2 gap-1.5 overflow-x-auto scrollbar-hide flex-1 min-w-0">
          {/* 分组下拉选择 */}
          <select
            value={activeGroupIndex}
            onChange={(e) => setActiveGroupIndex(Number(e.target.value))}
            onContextMenu={(e) => {
              if (groups[activeGroupIndex]) {
                handleContextMenu(e, 'group', groups[activeGroupIndex].id, undefined, undefined, activeGroupIndex);
              }
            }}
            className="h-6 px-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:border-primary hover:border-text-secondary transition-colors cursor-pointer"
          >
            {groups.map((group: ButtonGroup, index: number) => (
              <option key={group.id} value={index}>{group.name}</option>
            ))}
          </select>

          {/* 当前分组的按钮 */}
          {groups[activeGroupIndex] && (
            <>
              <div className="w-px h-4 bg-border" />
              {groups[activeGroupIndex].buttons.map((button: QuickButton, btnIndex: number) => (
                <button
                  key={button.id}
                  onClick={(e) => { handleSendCommand(button); (e.target as HTMLButtonElement).blur(); }}
                  onContextMenu={(e) => handleContextMenu(e, 'button', groups[activeGroupIndex].id, button.id, btnIndex, activeGroupIndex)}
                  disabled={!isConnected}
                  className="h-6 px-2.5 text-xs rounded-md border border-border hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap transition-all"
                  style={{
                    backgroundColor: button.color || undefined,
                    color: button.textColor || undefined,
                  }}
                  title={button.description || (button.commands?.length ? `发送 ${button.commands.length} 条命令` : `发送: ${button.command}`)}
                >
                  {button.name}
                </button>
              ))}
              <button
                onClick={() => {
                  setActiveGroupId(groups[activeGroupIndex].id);
                  setEditingButton(null);
                  setShowButtonDialog(true);
                }}
                className="h-6 w-6 text-xs rounded-md border border-dashed border-border hover:bg-hover hover:border-text-secondary transition-colors flex items-center justify-center"
                title="添加按钮"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </>
          )}

          {/* 方向切换 + 添加分组 */}
          <button
            onClick={() => setDirection?.('vertical')}
            className="h-6 w-6 text-xs rounded-md border border-border hover:bg-hover hover:border-text-secondary transition-colors flex items-center justify-center flex-shrink-0 text-text-secondary"
            title="切换为垂直布局"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1" />
              <line x1="7" y1="1" x2="7" y2="9" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            onClick={() => {
              setEditingGroup(null);
              setShowGroupDialog(true);
            }}
            className="h-6 px-2 text-xs rounded-md border border-dashed border-border hover:bg-hover hover:border-text-secondary whitespace-nowrap transition-colors flex-shrink-0 flex items-center gap-1"
            title="添加分组"
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
              <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            分组
          </button>
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
