/**
 * 侧边栏按钮排序管理
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SidebarButtonType = 'pty' | 'serial' | 'ssh' | 'telnet' | 'tftp' | 'nfs' | 'ftp' | 'mcp';

interface SidebarButtonConfig {
  type: SidebarButtonType;
  order: number;
}

interface SidebarButtonsState {
  buttons: SidebarButtonConfig[];
  reorderButtons: (fromIndex: number, toIndex: number) => void;
  getOrderedTypes: () => SidebarButtonType[];
}

const DEFAULT_BUTTONS: SidebarButtonConfig[] = [
  { type: 'pty', order: 0 },
  { type: 'serial', order: 1 },
  { type: 'ssh', order: 2 },
  { type: 'telnet', order: 3 },
  { type: 'tftp', order: 4 },
  { type: 'nfs', order: 5 },
  { type: 'ftp', order: 6 },
  { type: 'mcp', order: 7 },
];

export const useSidebarButtonsStore = create<SidebarButtonsState>()(
  persist(
    (set, get) => ({
      buttons: DEFAULT_BUTTONS,

      reorderButtons: (fromIndex, toIndex) => {
        set((state) => {
          const buttons = [...state.buttons];
          const [removed] = buttons.splice(fromIndex, 1);
          buttons.splice(toIndex, 0, removed);
          return { buttons: buttons.map((b, i) => ({ ...b, order: i })) };
        });
      },

      getOrderedTypes: () => {
        return get().buttons.map((b) => b.type);
      },
    }),
    {
      name: 'qserial-sidebar-buttons',
      merge: (persisted, current) => {
        const persistedState = persisted as Record<string, unknown> | null | undefined;
        if (!persistedState || typeof persistedState !== 'object') {
          return current;
        }
        const persistedButtons = persistedState.buttons;
        if (!Array.isArray(persistedButtons)) {
          return current;
        }
        // 确保包含所有按钮类型（新增的按钮类型可能不在旧数据中）
        const persistedTypes = new Set(
          (persistedButtons as SidebarButtonConfig[]).map((b) => b.type)
        );
        const missingButtons = DEFAULT_BUTTONS.filter((b) => !persistedTypes.has(b.type));
        const buttons = [
          ...(persistedButtons as SidebarButtonConfig[]),
          ...missingButtons.map((b, i) => ({ ...b, order: persistedButtons.length + i })),
        ];
        return { ...current, buttons };
      },
    }
  )
);
