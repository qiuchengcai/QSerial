/**
 * 快捷按钮状态管理
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface QuickButton {
  id: string;
  name: string;
  command: string;
  commands?: string[]; // 多行命令，优先于 command 使用
  delay?: number; // 多行命令之间的延迟(ms)，默认 100
  noNewline?: boolean; // 为 true 时不自动追加 \r\n，需在命令中用 \n 显式换行
  macroId?: string; // 关联的终端宏 ID，存在时点击回放宏而非发送文本
  description?: string;
  color?: string; // 按钮颜色
  textColor?: string; // 文字颜色
}

export interface ButtonGroup {
  id: string;
  name: string;
  buttons: QuickButton[];
}

export type ButtonBarDirection = 'horizontal' | 'vertical';

interface QuickButtonsState {
  groups: ButtonGroup[];
  direction: ButtonBarDirection;
  addGroup: (name: string) => string;
  updateGroup: (id: string, name: string) => void;
  removeGroup: (id: string) => void;
  addButton: (groupId: string, button: Omit<QuickButton, 'id'>) => void;
  updateButton: (groupId: string, buttonId: string, button: Partial<QuickButton>) => void;
  removeButton: (groupId: string, buttonId: string) => void;
  reorderGroups: (fromIndex: number, toIndex: number) => void;
  moveButton: (fromGroupId: string, toGroupId: string, buttonId: string, toIndex?: number) => void;
  importGroups: (groups: ButtonGroup[]) => void;
  setDirection: (direction: ButtonBarDirection) => void;
  /** 整体替换分组（MCP/主进程变更入口）：以传入分组覆盖当前状态并持久化 */
  setGroups: (groups: ButtonGroup[]) => void;
}

export const useQuickButtonsStore = create<QuickButtonsState>()(
  persist(
    (set) => ({
      groups: [],
      direction: 'horizontal' as ButtonBarDirection,

      addGroup: (name) => {
        const id = crypto.randomUUID();
        set((state) => ({
          groups: [...state.groups, { id, name, buttons: [] }],
        }));
        return id;
      },

      updateGroup: (id, name) => {
        set((state) => ({
          groups: state.groups.map((g) => (g.id === id ? { ...g, name } : g)),
        }));
      },

      removeGroup: (id) => {
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== id),
        }));
      },

      addButton: (groupId, button) => {
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId
              ? { ...g, buttons: [...g.buttons, { ...button, id: crypto.randomUUID() }] }
              : g
          ),
        }));
      },

      updateButton: (groupId, buttonId, button) => {
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  buttons: g.buttons.map((b) => (b.id === buttonId ? { ...b, ...button } : b)),
                }
              : g
          ),
        }));
      },

      removeButton: (groupId, buttonId) => {
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId ? { ...g, buttons: g.buttons.filter((b) => b.id !== buttonId) } : g
          ),
        }));
      },

      reorderGroups: (fromIndex, toIndex) => {
        set((state) => {
          const newGroups = [...state.groups];
          const [removed] = newGroups.splice(fromIndex, 1);
          newGroups.splice(toIndex, 0, removed);
          return { groups: newGroups };
        });
      },

      moveButton: (fromGroupId, toGroupId, buttonId, toIndex) => {
        set((state) => {
          const newGroups = [...state.groups];
          const fromGroup = newGroups.find((g) => g.id === fromGroupId);
          const toGroup = newGroups.find((g) => g.id === toGroupId);

          if (!fromGroup || !toGroup) return state;

          const buttonIndex = fromGroup.buttons.findIndex((b) => b.id === buttonId);
          if (buttonIndex === -1) return state;

          const [button] = fromGroup.buttons.splice(buttonIndex, 1);

          if (fromGroupId === toGroupId) {
            fromGroup.buttons.splice(toIndex ?? fromGroup.buttons.length, 0, button);
          } else {
            toGroup.buttons.splice(toIndex ?? toGroup.buttons.length, 0, button);
          }

          return { groups: newGroups };
        });
      },

      importGroups: (groups) => {
        set({ groups });
      },

      setDirection: (direction) => {
        set({ direction });
      },

      setGroups: (groups) => {
        set({ groups });
      },
    }),
    {
      name: 'qserial-quick-buttons',
      merge: (persisted, current) => {
        const persistedState = persisted as Record<string, unknown> | null | undefined;
        if (!persistedState || typeof persistedState !== 'object') {
          return current;
        }
        return {
          ...current,
          ...persistedState,
          groups: Array.isArray(persistedState.groups) ? persistedState.groups : current.groups,
        };
      },
    }
  )
);

// 预设颜色
export const PRESET_COLORS = [
  { name: '默认', value: '', textColor: '' },
  { name: '红色', value: '#EF4444', textColor: '#FFFFFF' },
  { name: '橙色', value: '#F97316', textColor: '#FFFFFF' },
  { name: '黄色', value: '#EAB308', textColor: '#000000' },
  { name: '绿色', value: '#22C55E', textColor: '#FFFFFF' },
  { name: '青色', value: '#06B6D4', textColor: '#FFFFFF' },
  { name: '蓝色', value: '#3B82F6', textColor: '#FFFFFF' },
  { name: '紫色', value: '#8B5CF6', textColor: '#FFFFFF' },
  { name: '粉色', value: '#EC4899', textColor: '#FFFFFF' },
  { name: '灰色', value: '#6B7280', textColor: '#FFFFFF' },
];

/**
 * 校验主进程下发的分组数据是否为合法 ButtonGroup[]
 * 宽松校验：只要求结构与字段类型基本正确，避免把脏数据写入 store。
 */
function isButtonGroupArray(value: unknown): value is ButtonGroup[] {
  if (!Array.isArray(value)) return false;
  return value.every((g) => {
    if (!g || typeof g !== 'object') return false;
    const group = g as Record<string, unknown>;
    if (typeof group.id !== 'string' || typeof group.name !== 'string') return false;
    if (!Array.isArray(group.buttons)) return false;
    return group.buttons.every((b) => {
      if (!b || typeof b !== 'object') return false;
      const btn = b as Record<string, unknown>;
      return (
        typeof btn.id === 'string' &&
        typeof btn.name === 'string' &&
        typeof btn.command === 'string'
      );
    });
  });
}

/**
 * 初始化"主进程 → 快捷按钮 store"变更桥（在 App 启动时调用一次）。
 * MCP 工具（buttons.*）对按钮配置的任何写操作，最终都会以 QUICK_BUTTONS_CHANGED
 * 事件把变更后的完整分组数组送回渲染进程，这里用 setGroups 覆盖刷新，
 * zustand set() 会触发 React 重渲染并同步持久化到 localStorage。
 */
let quickButtonBridgeInitialized = false;

export function initQuickButtonBridge(): void {
  if (quickButtonBridgeInitialized) return;
  quickButtonBridgeInitialized = true;

  window.qserial.quickButtons.onChanged((groups) => {
    if (isButtonGroupArray(groups)) {
      useQuickButtonsStore.getState().setGroups(groups);
    }
  });
}
