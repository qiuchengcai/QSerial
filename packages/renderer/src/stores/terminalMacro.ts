/**
 * 终端宏录制 Store
 * 录制用户在终端中的输入序列，保存为可回放的宏
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface MacroStep {
  data: string;
  delay: number; // ms since previous step
}

export interface SavedMacro {
  id: string;
  name: string;
  steps: MacroStep[];
  createdAt: number;
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
  saveMacro: (name: string) => SavedMacro;
  deleteMacro: (id: string) => void;
  getMacro: (id: string) => SavedMacro | undefined;
}

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
        set({ isRecording: false, recordingSteps: [] });
        return steps;
      },

      addStep: (data: string) => {
        if (!get().isRecording) return;
        const now = Date.now();
        const delay = now - get().lastStepTime;
        set((state) => ({
          recordingSteps: [...state.recordingSteps, { data, delay }],
          lastStepTime: now,
        }));
      },

      saveMacro: (name: string) => {
        const steps = get().recordingSteps;
        const macro: SavedMacro = {
          id: crypto.randomUUID(),
          name,
          steps: [...steps],
          createdAt: Date.now(),
        };
        set((state) => ({
          savedMacros: [...state.savedMacros, macro],
          isRecording: false,
          recordingSteps: [],
        }));
        return macro;
      },

      deleteMacro: (id: string) => {
        set((state) => ({
          savedMacros: state.savedMacros.filter((m) => m.id !== id),
        }));
      },

      getMacro: (id: string) => {
        return get().savedMacros.find((m) => m.id === id);
      },
    }),
    {
      name: "qserial-terminal-macros",
      partialize: (state) => ({
        savedMacros: state.savedMacros,
      }),
    }
  )
);
