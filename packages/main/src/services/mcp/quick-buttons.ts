/**
 * 快捷按钮数据桥（主进程侧）
 *
 * 数据源约定（方案 B，见 AI-Vault 进展文档）：
 * - 权威数据在渲染进程 zustand store（persist → localStorage['qserial-quick-buttons']）。
 * - 主进程**不做权威存储**：
 *   - 读：直接读取渲染进程 localStorage 快照（persist 为同步写，快照与内存态一致）。
 *   - 写：在渲染进程内对快照做规范化修改后写回 localStorage，并向渲染进程发送
 *     QUICK_BUTTONS_CHANGED 事件；渲染进程桥（initQuickButtonBridge）用 setGroups
 *     覆盖 store，触发 GUI 刷新与持久化。主进程自身不持有副本。
 *
 * 本模块把"读快照 / 写快照 / 变更通知"收敛为纯函数，便于 tools/buttons.ts 复用与单元测试。
 */

import { IPC_CHANNELS } from '@qserial/shared';
import type { BrowserWindow } from 'electron';

/** persist 存储的 key（与 renderer quickButtons.ts persist name 一致） */
export const QUICK_BUTTONS_STORAGE_KEY = 'qserial-quick-buttons';

/** 单个快捷按钮（与 renderer QuickButton 结构镜像，宽松字段） */
export interface QuickButtonData {
  id: string;
  name: string;
  command: string;
  commands?: string[];
  delay?: number;
  noNewline?: boolean;
  macroId?: string;
  description?: string;
  color?: string;
  textColor?: string;
}

/** 按钮分组（与 renderer ButtonGroup 结构镜像） */
export interface QuickButtonGroupData {
  id: string;
  name: string;
  buttons: QuickButtonData[];
}

/** 从任意值安全解析为按钮对象（宽松解析，解析失败返回 null） */
export function parseButton(value: unknown): QuickButtonData | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  const button: QuickButtonData = {
    id: v.id,
    name: v.name,
    command: typeof v.command === 'string' ? v.command : '',
  };
  if (Array.isArray(v.commands)) {
    const cmds = v.commands.filter((c): c is string => typeof c === 'string');
    if (cmds.length > 0) button.commands = cmds;
  }
  if (typeof v.delay === 'number') button.delay = v.delay;
  if (typeof v.noNewline === 'boolean') button.noNewline = v.noNewline;
  if (typeof v.macroId === 'string' && v.macroId) button.macroId = v.macroId;
  if (typeof v.description === 'string' && v.description) button.description = v.description;
  if (typeof v.color === 'string' && v.color) button.color = v.color;
  if (typeof v.textColor === 'string' && v.textColor) button.textColor = v.textColor;
  return button;
}

/** 从任意值安全解析为分组对象（宽松解析，解析失败返回 null） */
export function parseGroup(value: unknown): QuickButtonGroupData | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  const buttons: QuickButtonData[] = [];
  if (Array.isArray(v.buttons)) {
    for (const b of v.buttons) {
      const parsed = parseButton(b);
      if (parsed) buttons.push(parsed);
    }
  }
  return { id: v.id, name: v.name, buttons };
}

/**
 * 从渲染进程读取全部按钮分组。
 * localStorage 快照结构兼容两种形态（zustand persist）：
 *   { "state": { "groups": [...] }, "version": 0 }   新形态
 *   { "groups": [...] }                               旧形态
 * 无数据时返回空数组。
 */
export async function readQuickButtonGroups(
  window: BrowserWindow | null
): Promise<QuickButtonGroupData[]> {
  if (!window || window.isDestroyed()) return [];
  const raw = await window.webContents.executeJavaScript(
    `(function() {
      try {
        var raw = localStorage.getItem('${QUICK_BUTTONS_STORAGE_KEY}');
        if (!raw) return [];
        var data = JSON.parse(raw);
        var groups = data && data.state ? data.state.groups : (data.groups || []);
        return Array.isArray(groups) ? groups : [];
      } catch(e) { return []; }
    })()`
  );
  if (!Array.isArray(raw)) return [];
  const groups: QuickButtonGroupData[] = [];
  for (const g of raw) {
    const parsed = parseGroup(g);
    if (parsed) groups.push(parsed);
  }
  return groups;
}

/**
 * 把整组按钮分组写回渲染进程，并通知 store 刷新。
 * groups 需为已按最终形态规范化好的数组（调用方负责增删改逻辑）。
 */
export async function writeQuickButtonGroups(
  window: BrowserWindow | null,
  groups: QuickButtonGroupData[]
): Promise<void> {
  if (!window || window.isDestroyed()) return;
  const payload = JSON.stringify(groups).replace(/</g, '\\u003c');
  await window.webContents.executeJavaScript(
    `(function() {
      try {
        var groups = ${payload};
        var key = '${QUICK_BUTTONS_STORAGE_KEY}';
        var raw = localStorage.getItem(key);
        var data = raw ? JSON.parse(raw) : { state: {} };
        if (data && data.state) {
          data.state.groups = groups;
        } else {
          data = { state: { groups: groups } };
        }
        localStorage.setItem(key, JSON.stringify(data));
        return true;
      } catch(e) { return false; }
    })()`
  );
  window.webContents.send(IPC_CHANNELS.QUICK_BUTTONS_CHANGED, { groups });
}

/** 校验分组名是否可用（非空且未与其他分组重名；id 不同可同名则忽略）。返回错误消息或 null。 */
export function validateGroupName(
  groups: QuickButtonGroupData[],
  name: string,
  excludeId?: string
): string | null {
  const trimmed = (name || '').trim();
  if (!trimmed) return '分组名称不能为空';
  if (groups.some((g) => g.name === trimmed && g.id !== excludeId)) {
    return `分组名称 "${trimmed}" 已存在`;
  }
  return null;
}

/**
 * 解析命令文本中的转义序列（与 GUI QuickButtonBar.parseEscapeSequences 等价）：
 *   \xHH → 实际字节（如 \x02 = Ctrl+B）
 *   \n → 换行符，\r → 回车符，\0 → NUL，\\ → 反斜杠
 */
export function parseEscapeSequences(cmd: string): string {
  return cmd
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\0/g, '\0')
    .replace(/\\\\/g, '\\');
}

/** 终端宏存储 key（与 renderer terminalMacro.ts persist name 一致） */
export const TERMINAL_MACROS_STORAGE_KEY = 'qserial-terminal-macros';

/** 宏步骤：录制态为 {data, delay}，编辑器宏含 type/send/wait/expect 等 */
export interface MacroStepData {
  type?: string;
  data?: string;
  delay?: number;
  [key: string]: unknown;
}

export interface SavedMacroData {
  id: string;
  name: string;
  steps: MacroStepData[];
  [key: string]: unknown;
}

/** 从渲染进程读取全部已保存宏。无数据返回空数组。 */
export async function readSavedMacros(window: BrowserWindow | null): Promise<SavedMacroData[]> {
  if (!window || window.isDestroyed()) return [];
  const raw = await window.webContents.executeJavaScript(
    `(function() {
      try {
        var raw = localStorage.getItem('${TERMINAL_MACROS_STORAGE_KEY}');
        if (!raw) return [];
        var data = JSON.parse(raw);
        var macros = data && data.state ? data.state.savedMacros : (data.savedMacros || []);
        return Array.isArray(macros) ? macros : [];
      } catch(e) { return []; }
    })()`
  );
  if (!Array.isArray(raw)) return [];
  const macros: SavedMacroData[] = [];
  for (const m of raw) {
    if (m && typeof m === 'object' && typeof (m as { id?: unknown }).id === 'string') {
      const mm = m as Record<string, unknown>;
      macros.push({
        id: mm.id as string,
        name: typeof mm.name === 'string' ? mm.name : '',
        steps: Array.isArray(mm.steps)
          ? mm.steps.filter((s): s is MacroStepData => !!s && typeof s === 'object')
          : [],
      });
    }
  }
  return macros;
}
