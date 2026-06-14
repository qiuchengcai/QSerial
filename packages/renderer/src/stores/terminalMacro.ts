/**
 * 终端宏录制 Store
 * 录制用户在终端中的输入序列，保存为可回放的宏
 * 支持颜色标记、描述、编辑、导入导出
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ??????????????? {data,delay} ???
export type MacroStepType = 'send' | 'wait' | 'expect' | 'loop' | 'if' | 'set';

export interface BaseMacroStep {
  /** ???? */
  type: MacroStepType;
  /** ?????? */
  comment?: string;
}

/** ???????????? */
export interface SendStep extends BaseMacroStep {
  type: 'send';
  data: string;
  /** ??????????? 0? */
  delay?: number;
}

/** ??????????? */
export interface WaitStep extends BaseMacroStep {
  type: 'wait';
  ms: number;
}

/** ?????????????????? */
export interface ExpectStep extends BaseMacroStep {
  type: 'expect';
  pattern: string;
  /** ??????? 5000? */
  timeout?: number;
  /** ???????????? false??????????? */
  regex?: boolean;
}

/** ???????????? count ? */
export interface LoopStep extends BaseMacroStep {
  type: 'loop';
  count: number;
  steps: MacroStep[];
}

/** ??????????????? */
export interface IfStep extends BaseMacroStep {
  type: 'if';
  /** ??????? "retry < 3"?"count == 0" */
  condition: string;
  steps: MacroStep[];
  elseSteps?: MacroStep[];
}

/** ?????? */
export interface SetStep extends BaseMacroStep {
  type: 'set';
  variable: string;
  value: string;
}

/** ??????? */
export type MacroStep =
  | SendStep
  | WaitStep
  | ExpectStep
  | LoopStep
  | IfStep
  | SetStep;

export interface SavedMacro {
  id: string;
  name: string;
  /** ????????????? */
  steps: MacroStep[];
  /** ??????????? set ????? */
  variables?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
  description?: string;
  color?: string;
  textColor?: string;
}

interface TerminalMacroState {
  isRecording: boolean;
  recordingStartTime: number;
  recordingSteps: MacroStep[];
  lastStepTime: number;
  savedMacros: SavedMacro[];

  startRecording: () => void;
  stopRecording: () => MacroStep[];
  addStep: (data: string) => void;
  saveMacro: (name: string, description?: string, color?: string, textColor?: string) => SavedMacro;
  updateMacro: (id: string, updates: Partial<Pick<SavedMacro, 'name' | 'description' | 'color' | 'textColor'>>) => void;
  deleteMacro: (id: string) => void;
  getMacro: (id: string) => SavedMacro | undefined;
  importMacros: (macros: SavedMacro[]) => void;
  exportMacros: () => SavedMacro[];
  reorderMacros: (fromIndex: number, toIndex: number) => void;
}

export const PRESET_MACRO_COLORS = [
  { name: '默认', value: '', textColor: '' },
  { name: '红色', value: '#EF4444', textColor: '#FFFFFF' },
  { name: '橙色', value: '#F97316', textColor: '#FFFFFF' },
  { name: '黄色', value: '#EAB308', textColor: '#000000' },
  { name: '绿色', value: '#22C55E', textColor: '#FFFFFF' },
  { name: '青色', value: '#06B6D4', textColor: '#FFFFFF' },
  { name: '蓝色', value: '#3B82F6', textColor: '#FFFFFF' },
  { name: '紫色', value: '#8B5CF6', textColor: '#FFFFFF' },
  { name: '粉色', value: '#EC4899', textColor: '#FFFFFF' },
];

export const useTerminalMacroStore = create<TerminalMacroState>()(
  persist(
    (set, get) => ({
      isRecording: false,
      recordingStartTime: 0,
      recordingSteps: [],
      lastStepTime: 0,
      savedMacros: [],

      startRecording: () => {
        const now = Date.now();
        set({
          isRecording: true,
          recordingStartTime: now,
          recordingSteps: [],
          lastStepTime: now,
        });
      },

      stopRecording: () => {
        const steps = get().recordingSteps;
        set({ isRecording: false });
        return steps;
      },

      addStep: (data: string) => {
        if (!get().isRecording) return;
        // 过滤 ANSI 转义序列和控制序列
        if (data.includes("\u001b")) return;
        // 过滤 xterm 窗口大小命令
        if (data.startsWith('COLUMNS=') || data.startsWith('LINES=') || data.includes('export COLUMNS') || data.includes('export LINES')) return;
        // 过滤 xterm 窗口大小请求
        if (data.length > 20 && (data.includes('COLUMNS') || data.includes('LINES'))) return;

        const now = Date.now();
        const delay = now - get().lastStepTime;
        set((state) => ({
          recordingSteps: [...state.recordingSteps, { data, delay }],
          lastStepTime: now,
        }));
      },

      saveMacro: (name: string, description?: string, color?: string, textColor?: string) => {
        const steps = get().recordingSteps;
        const now = Date.now();
        const macro: SavedMacro = {
          id: crypto.randomUUID(),
          name,
          steps: [...steps],
          createdAt: now,
          updatedAt: now,
          description: description || undefined,
          color: color || undefined,
          textColor: textColor || undefined,
        };
        set((state) => ({
          savedMacros: [...state.savedMacros, macro],
          isRecording: false,
          recordingSteps: [],
        }));
        return macro;
      },

      updateMacro: (id: string, updates) => {
        set((state) => ({
          savedMacros: state.savedMacros.map((m) =>
            m.id === id ? { ...m, ...updates, updatedAt: Date.now() } : m
          ),
        }));
      },

      deleteMacro: (id: string) => {
        set((state) => ({
          savedMacros: state.savedMacros.filter((m) => m.id !== id),
        }));
      },

      getMacro: (id: string) => {
        return get().savedMacros.find((m) => m.id === id);
      },

      importMacros: (macros: SavedMacro[]) => {
        set((state) => {
          const existingIds = new Set(state.savedMacros.map((m) => m.id));
          const newMacros = macros.filter((m) => !existingIds.has(m.id));
          return { savedMacros: [...state.savedMacros, ...newMacros] };
        });
      },

      exportMacros: () => {
        return get().savedMacros;
      },

      reorderMacros: (fromIndex: number, toIndex: number) => {
        set((state) => {
          const newList = [...state.savedMacros];
          const [removed] = newList.splice(fromIndex, 1);
          newList.splice(toIndex, 0, removed);
          return { savedMacros: newList };
        });
      },
    }),
    {
      name: "qserial-terminal-macros",
      partialize: (state) => ({
        savedMacros: state.savedMacros,
      }),
      merge: (persisted, current) => {
        const p = persisted as Record<string, unknown> | null | undefined;
        if (!p || typeof p !== 'object') return current;
        return {
          ...current,
          savedMacros: Array.isArray(p.savedMacros) ? p.savedMacros as SavedMacro[] : current.savedMacros,
        };
      },
    }
  )
);
