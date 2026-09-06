/**
 * 快捷按钮 MCP 工具处理函数 (buttons.*)
 *
 * 数据源遵循方案 B：权威数据在渲染进程 zustand store（persist → localStorage）。
 * 查询工具读渲染进程 localStorage 快照；写/执行工具经 quick-buttons 数据桥
 * 完成"读快照 → 内存改/执行 → 写回 + QUICK_BUTTONS_CHANGED 通知"。
 *
 * 错误返回统一使用 formatError({ok:false, code, detail})，成功用 formatOk({ok:true, data})。
 */

import * as crypto from 'node:crypto';
import { formatOk, formatError } from '../ai-helpers.js';
import { ConnectionFactory } from '../../connection/factory.js';
import { ConnectionState } from '@qserial/shared';
import * as qb from '../quick-buttons.js';
import * as ctx2 from '../context.js';
import type { ToolHandler } from '../types';
import type { BrowserWindow } from 'electron';

/** 获取当前主窗口，不可用时返回 null（由调用方转为结构化错误） */
function getWindow(ctx: { mainWindow: BrowserWindow | null }): BrowserWindow | null {
  if (!ctx.mainWindow || ctx.mainWindow.isDestroyed()) return null;
  return ctx.mainWindow;
}

/** 从 args 读字符串参数，非 string/空串返回 undefined */
function strArg(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** 规范化按钮入参 → 与 GUI 保存语义一致的按钮数据（不含 id）。非法返回 null。 */
function normalizeButtonInput(
  args: Record<string, unknown>
): Omit<qb.QuickButtonData, 'id'> | null {
  const name = strArg(args, 'name');
  // command 与 commands 至少一项非空
  const commandRaw = strArg(args, 'command') ?? '';
  let commands: string[] | undefined;
  if (Array.isArray(args.commands)) {
    commands = args.commands
      .map((c) => (typeof c === 'string' ? c.trim() : ''))
      .filter((c) => c.length > 0);
    if (commands.length === 0) commands = undefined;
  }
  // 多行语义：commands 存在且多于 1 行时用 commands；否则退化为单行 command
  const multiLineCommands = Array.isArray(commands) && commands.length > 1 ? commands : undefined;
  const effectiveCommand = multiLineCommands
    ? multiLineCommands[0]
    : commandRaw || (Array.isArray(commands) && commands.length === 1 ? commands[0] : '');

  if (!name || !effectiveCommand) return null;

  const button: Omit<qb.QuickButtonData, 'id'> = {
    name,
    command: effectiveCommand,
  };
  if (multiLineCommands) {
    button.commands = multiLineCommands;
    button.delay = typeof args.delay === 'number' ? args.delay : 100;
  }
  if (typeof args.noNewline === 'boolean') button.noNewline = args.noNewline;
  if (strArg(args, 'macroId')) button.macroId = strArg(args, 'macroId');
  if (strArg(args, 'description')) button.description = strArg(args, 'description');
  if (strArg(args, 'color')) button.color = strArg(args, 'color');
  if (strArg(args, 'textColor')) button.textColor = strArg(args, 'textColor');
  return button;
}

/** 在分组数组内查找按钮，返回 [group, groupIndex, buttonIndex] */
function findButton(
  groups: qb.QuickButtonGroupData[],
  buttonId: string
): [qb.QuickButtonGroupData, number, number] | null {
  for (let gi = 0; gi < groups.length; gi++) {
    const bi = groups[gi].buttons.findIndex((b) => b.id === buttonId);
    if (bi >= 0) return [groups[gi], gi, bi];
  }
  return null;
}

/** 每个工具返回 MCP 文本，本工具集统一为 formatOk/formatError 的 JSON 字符串 */

export const buttonsHandlers: Record<string, ToolHandler> = {
  /**
   * buttons.groups.list — 列出所有分组（含组内按钮数量与首屏摘要）。
   * 无参。返回 { groups: [{id,name,button_count,buttons?: 摘要}] }。
   */
  'buttons.groups.list': async (_args, ctx) => {
    const win = getWindow(ctx);
    if (!win) return formatError('NO_WINDOW', 'Main window is not available');
    try {
      const groups = await qb.readQuickButtonGroups(win);
      const list = groups.map((g) => ({
        id: g.id,
        name: g.name,
        button_count: g.buttons.length,
        buttons: g.buttons.map((b) => ({ id: b.id, name: b.name })),
      }));
      return formatOk({ groups: list, total: list.length });
    } catch (e) {
      return formatError('INTERNAL', (e as Error).message || String(e));
    }
  },

  /**
   * buttons.list — 按分组列出按钮（完整字段）。可传 group_id 限定分组，缺省返回全部分组。
   */
  'buttons.list': async (args, ctx) => {
    const win = getWindow(ctx);
    if (!win) return formatError('NO_WINDOW', 'Main window is not available');
    const groupId = typeof args.group_id === 'string' && args.group_id ? args.group_id : undefined;
    try {
      const groups = await qb.readQuickButtonGroups(win);
      if (groupId) {
        const group = groups.find((g) => g.id === groupId);
        if (!group) return formatError('NOT_FOUND', 'Group not found: ' + groupId);
        return formatOk({
          group: { id: group.id, name: group.name },
          buttons: group.buttons,
          total: group.buttons.length,
        });
      }
      const out = groups.map((g) => ({ id: g.id, name: g.name, buttons: g.buttons }));
      return formatOk({ groups: out, total: out.reduce((s, g) => s + g.buttons.length, 0) });
    } catch (e) {
      return formatError('INTERNAL', (e as Error).message || String(e));
    }
  },

  /**
   * buttons.get — 按按钮 id 获取单个按钮详情。
   */
  'buttons.get': async (args, ctx) => {
    const win = getWindow(ctx);
    if (!win) return formatError('NO_WINDOW', 'Main window is not available');
    const id = typeof args.id === 'string' ? args.id : '';
    if (!id) return formatError('MISSING_PARAM', 'id is required');
    try {
      const groups = await qb.readQuickButtonGroups(win);
      for (const g of groups) {
        const button = g.buttons.find((b) => b.id === id);
        if (button) {
          return formatOk({ button, group_id: g.id, group_name: g.name });
        }
      }
      return formatError('NOT_FOUND', 'Button not found: ' + id);
    } catch (e) {
      return formatError('INTERNAL', (e as Error).message || String(e));
    }
  },

  /**
   * buttons.create — 在指定分组创建按钮。
   * 必填：group_id / name / command（或 commands）。id 由服务端生成。
   */
  'buttons.create': async (args, ctx) => {
    const win = getWindow(ctx);
    if (!win) return formatError('NO_WINDOW', 'Main window is not available');
    const groupId = strArg(args, 'group_id');
    if (!groupId) return formatError('MISSING_PARAM', 'group_id is required');
    const normalized = normalizeButtonInput(args);
    if (!normalized) {
      return formatError('INVALID_PARAM', 'name and command (or non-empty commands) are required');
    }
    try {
      const groups = await qb.readQuickButtonGroups(win);
      const group = groups.find((g) => g.id === groupId);
      if (!group) return formatError('NOT_FOUND', 'Group not found: ' + groupId);

      const id = crypto.randomUUID();
      const button: qb.QuickButtonData = { id, ...normalized };
      group.buttons.push(button);
      await qb.writeQuickButtonGroups(win, groups);
      return formatOk({ id, button });
    } catch (e) {
      return formatError('INTERNAL', (e as Error).message || String(e));
    }
  },

  /**
   * buttons.update — 按按钮 id 局部更新任意字段。
   * 仅更新传入字段；name/command/commands/delay 等按 GUI 语义联动规范化。
   */
  'buttons.update': async (args, ctx) => {
    const win = getWindow(ctx);
    if (!win) return formatError('NO_WINDOW', 'Main window is not available');
    const id = strArg(args, 'id');
    if (!id) return formatError('MISSING_PARAM', 'id is required');
    try {
      const groups = await qb.readQuickButtonGroups(win);
      const found = findButton(groups, id);
      if (!found) return formatError('NOT_FOUND', 'Button not found: ' + id);
      const target = found[0].buttons[found[2]];

      // 显式提供了 name/description/color/textColor/macroId/noNewline → 直接覆盖（undefined 保留原值）
      const updated: qb.QuickButtonData = { ...target };
      if (args.name !== undefined) {
        const name = strArg(args, 'name');
        if (!name) return formatError('INVALID_PARAM', 'name cannot be empty');
        updated.name = name;
      }
      if (args.description !== undefined)
        updated.description = strArg(args, 'description') || undefined;
      if (args.color !== undefined) updated.color = strArg(args, 'color') || undefined;
      if (args.textColor !== undefined) updated.textColor = strArg(args, 'textColor') || undefined;
      if (args.macroId !== undefined) updated.macroId = strArg(args, 'macroId') || undefined;
      if (args.noNewline !== undefined) updated.noNewline = args.noNewline === true;

      // command / commands 联动：任一显式提供则按 GUI 语义重算（command=首行, commands 多行保留）
      const commandProvided = args.command !== undefined;
      const commandsProvided = Array.isArray(args.commands);
      if (commandProvided || commandsProvided) {
        const rawCommand =
          typeof args.command === 'string' ? args.command.trim() : updated.command || '';
        let cmdLines: string[] = [];
        if (Array.isArray(args.commands)) {
          cmdLines = args.commands
            .map((c) => (typeof c === 'string' ? c.trim() : ''))
            .filter((c) => c.length > 0);
        } else {
          cmdLines = rawCommand
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
        }
        if (cmdLines.length === 0) {
          return formatError(
            'INVALID_PARAM',
            'command (or commands) must contain at least one non-empty line'
          );
        }
        updated.command = cmdLines[0];
        if (cmdLines.length > 1) {
          updated.commands = cmdLines;
          // delay 显式提供时覆盖，否则沿用现有/默认 100
          updated.delay = typeof args.delay === 'number' ? args.delay : (target.delay ?? 100);
        } else {
          delete updated.commands;
          // 单行按钮：显式给了 delay 则保留（尊重用户意图），否则清除（多行转单行的清理）
          if (typeof args.delay === 'number') {
            updated.delay = args.delay;
          } else {
            delete updated.delay;
          }
        }
      } else if (args.delay !== undefined) {
        updated.delay = args.delay as number;
      }

      found[0].buttons[found[2]] = updated;
      await qb.writeQuickButtonGroups(win, groups);
      return formatOk({ id, button: updated });
    } catch (e) {
      return formatError('INTERNAL', (e as Error).message || String(e));
    }
  },

  /**
   * buttons.delete — 按按钮 id 删除。必须携带 confirm=true，否则拒绝。
   */
  'buttons.delete': async (args, ctx) => {
    const win = getWindow(ctx);
    if (!win) return formatError('NO_WINDOW', 'Main window is not available');
    const id = strArg(args, 'id');
    if (!id) return formatError('MISSING_PARAM', 'id is required');
    if (args.confirm !== true) {
      return formatError(
        'CONFIRM_REQUIRED',
        'This will delete the button. Re-invoke with confirm=true to proceed.'
      );
    }
    try {
      const groups = await qb.readQuickButtonGroups(win);
      const found = findButton(groups, id);
      if (!found) return formatError('NOT_FOUND', 'Button not found: ' + id);
      found[0].buttons.splice(found[2], 1);
      await qb.writeQuickButtonGroups(win, groups);
      return formatOk({ id, deleted: true });
    } catch (e) {
      return formatError('INTERNAL', (e as Error).message || String(e));
    }
  },

  /**
   * buttons.groups.create — 创建空分组。返回新分组 id。
   */
  'buttons.groups.create': async (args, ctx) => {
    const win = getWindow(ctx);
    if (!win) return formatError('NO_WINDOW', 'Main window is not available');
    const name = strArg(args, 'name');
    if (!name) return formatError('MISSING_PARAM', 'name is required');
    try {
      const groups = await qb.readQuickButtonGroups(win);
      const nameError = qb.validateGroupName(groups, name);
      if (nameError) return formatError('INVALID_PARAM', nameError);
      const id = crypto.randomUUID();
      const group: qb.QuickButtonGroupData = { id, name, buttons: [] };
      groups.push(group);
      await qb.writeQuickButtonGroups(win, groups);
      return formatOk({ id, group });
    } catch (e) {
      return formatError('INTERNAL', (e as Error).message || String(e));
    }
  },

  /**
   * buttons.groups.update — 重命名分组。仅更新 name。
   */
  'buttons.groups.update': async (args, ctx) => {
    const win = getWindow(ctx);
    if (!win) return formatError('NO_WINDOW', 'Main window is not available');
    const id = strArg(args, 'id');
    if (!id) return formatError('MISSING_PARAM', 'id is required');
    const name = strArg(args, 'name');
    if (!name) return formatError('MISSING_PARAM', 'name is required');
    try {
      const groups = await qb.readQuickButtonGroups(win);
      const group = groups.find((g) => g.id === id);
      if (!group) return formatError('NOT_FOUND', 'Group not found: ' + id);
      const nameError = qb.validateGroupName(groups, name, id);
      if (nameError) return formatError('INVALID_PARAM', nameError);
      group.name = name;
      await qb.writeQuickButtonGroups(win, groups);
      return formatOk({ id, group });
    } catch (e) {
      return formatError('INTERNAL', (e as Error).message || String(e));
    }
  },

  /**
   * buttons.groups.delete — 删除分组。组内有按钮时需 cascade=true + confirm=true 级联删除；
   * 组为空只需 confirm=true。组内按钮不会被移到别处（GUI 语义一致：分组删除即整组移除）。
   */
  'buttons.groups.delete': async (args, ctx) => {
    const win = getWindow(ctx);
    if (!win) return formatError('NO_WINDOW', 'Main window is not available');
    const id = strArg(args, 'id');
    if (!id) return formatError('MISSING_PARAM', 'id is required');
    if (args.confirm !== true) {
      return formatError(
        'CONFIRM_REQUIRED',
        'This will delete the group. Re-invoke with confirm=true to proceed.'
      );
    }
    try {
      const groups = await qb.readQuickButtonGroups(win);
      const index = groups.findIndex((g) => g.id === id);
      if (index < 0) return formatError('NOT_FOUND', 'Group not found: ' + id);
      const group = groups[index];
      if (group.buttons.length > 0 && args.cascade !== true) {
        return formatError(
          'GROUP_NOT_EMPTY',
          'Group contains ' +
            group.buttons.length +
            ' buttons. Pass cascade=true to delete the group and all its buttons.'
        );
      }
      groups.splice(index, 1);
      await qb.writeQuickButtonGroups(win, groups);
      return formatOk({ id, deleted: true });
    } catch (e) {
      return formatError('INTERNAL', (e as Error).message || String(e));
    }
  },

  /**
   * buttons.run — 在指定已打开连接上执行按钮（等价用户在 GUI 点击该按钮）。
   * 参数：id=按钮 id；connection_id（或 connectionId）= 目标连接 id。
   * 语义：
   *  - 无 macroId：commands||[command] 逐条经转义解析后发送，行间延迟 delay(默认100)ms，
   *    noNewline=true 时不追加 \r\n（与 QuickButtonBar.handleSendCommand 等价）。
   *  - 有 macroId：加载该宏并按其 steps 回放（与 QuickButtonBar.playMacro 等价：
   *    合并各步 data 批量发送，步骤延迟封顶 50ms/步、总 200ms，发送前等待累计延迟）。
   */
  'buttons.run': async (args, ctx) => {
    const win = getWindow(ctx);
    if (!win) return formatError('NO_WINDOW', 'Main window is not available');
    const id = strArg(args, 'id');
    if (!id) return formatError('MISSING_PARAM', 'id is required');
    const connectionId =
      (typeof args.connection_id === 'string' && args.connection_id
        ? args.connection_id
        : undefined) ||
      (typeof args.connectionId === 'string' && args.connectionId ? args.connectionId : undefined);
    if (!connectionId) return formatError('MISSING_PARAM', 'connection_id is required');

    const conn = ConnectionFactory.get(connectionId);
    if (!conn) return formatError('CONN_NOT_FOUND', 'Connection not found: ' + connectionId);
    if (conn.state !== ConnectionState.CONNECTED) {
      return formatError(
        'CONN_NOT_CONNECTED',
        `Connection ${connectionId} is not open (state: ${conn.state})`
      );
    }

    try {
      const groups = await qb.readQuickButtonGroups(win);
      const found = findButton(groups, id);
      if (!found) return formatError('NOT_FOUND', 'Button not found: ' + id);
      const button = found[0].buttons[found[2]];

      if (button.macroId) {
        const macros = await qb.readSavedMacros(win);
        const macro = macros.find((m) => m.id === button.macroId);
        if (!macro) {
          return formatError('MACRO_NOT_FOUND', 'Referenced macro not found: ' + button.macroId);
        }
        // 复刻 QuickButtonBar.playMacro：合并各步为 batch，延迟封顶后一次写入
        let cumulative = 0;
        let capped = 0;
        const parts: string[] = [];
        for (let i = 0; i < macro.steps.length; i++) {
          const step = macro.steps[i];
          if (step.type !== undefined && step.type !== 'send') continue; // 仅处理录制型 send 步
          const text = typeof step.data === 'string' ? step.data : '';
          if (!text) continue;
          let d = typeof step.delay === 'number' && step.delay > 0 ? step.delay : 5;
          if (i === 0 && d > 10) d = 10;
          if (d > 50) {
            capped += d - 50;
            d = 50;
          }
          cumulative += d;
          if (cumulative > 200) {
            capped += cumulative - 200;
            cumulative = 200;
          }
          parts.push(qb.parseEscapeSequences(text));
        }
        const batch = parts.join('');
        if (!batch) return formatError('EMPTY_MACRO', 'Macro has no sendable steps');
        if (cumulative > 0) await ctx2.sleep(cumulative);
        conn.write(Buffer.from(batch, 'utf-8'));
        return formatOk({
          triggered: 'macro',
          macro_id: macro.id,
          macro_name: macro.name,
          bytes: Buffer.byteLength(batch, 'utf-8'),
          delay_ms: cumulative,
          saved_delay_ms: capped,
        });
      }

      // 普通按钮：逐条 commands 发送
      const commands = button.commands || [button.command];
      const delay = button.delay ?? 100;
      const noNewline = button.noNewline ?? false;
      const sent: string[] = [];
      for (let i = 0; i < commands.length; i++) {
        if (i > 0 && delay > 0) await ctx2.sleep(delay);
        const parsed = qb.parseEscapeSequences(commands[i]);
        const suffix = noNewline ? '' : '\r\n';
        conn.write(Buffer.from(parsed + suffix, 'utf-8'));
        sent.push(parsed);
      }
      return formatOk({
        triggered: 'commands',
        count: sent.length,
        commands: sent,
        delay_ms: (sent.length - 1) * delay,
        newline: !noNewline,
      });
    } catch (e) {
      return formatError('INTERNAL', (e as Error).message || String(e));
    }
  },
};
