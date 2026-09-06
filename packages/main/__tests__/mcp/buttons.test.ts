/**
 * buttons.* MCP 工具测试
 * 覆盖：buttons.groups.list/list/get（查询）+ buttons.create/update/delete 与
 * buttons.groups.create/update/delete（写入，含 confirm/cascade 语义）。
 * 通过有状态的伪造 mainWindow 模拟 localStorage 持久化与 webContents.send 事件。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  app: { getPath: vi.fn(() => '/tmp'), commandLine: { appendSwitch: vi.fn() } },
}));

/** ConnectionFactory 全量 mock：run 测试需要可控的连接对象 */
vi.mock('../../src/services/connection/factory.js', () => ({
  ConnectionFactory: {
    get: vi.fn(),
    getAll: vi.fn(() => []),
    create: vi.fn(),
    destroy: vi.fn(async () => {}),
    initialize: vi.fn(),
    onCreate: vi.fn(() => () => {}),
    onDestroy: vi.fn(() => () => {}),
  },
}));

import { buttonsHandlers } from '../../src/services/mcp/tools/buttons.ts';
import {
  QUICK_BUTTONS_STORAGE_KEY,
  TERMINAL_MACROS_STORAGE_KEY,
} from '../../src/services/mcp/quick-buttons.ts';
import { ConnectionFactory } from '../../src/services/connection/factory.js';

/** 从注入脚本中提取 write 脚本的 groups JSON（var groups = [...]） */
function extractGroupsFromScript(script: string): unknown[] | null {
  const m = script.match(/var groups = (\[.*?\]);/s);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

interface FakeWindow {
  isDestroyed: () => boolean;
  webContents: {
    executeJavaScript: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
  /** 读取当前内存中的快照数据（测试断言用） */
  snapshotGroups: () => unknown[];
  storage: Record<string, string>;
}

/** 有状态伪造窗口：executeJavaScript 区分读/写脚本，send 记录事件 */
function makeLiveCtx(seedStorage: Record<string, string>): { mainWindow: FakeWindow } {
  const storage: Record<string, string> = { ...seedStorage };
  const sent: Array<{ channel: string; payload: unknown }> = [];

  const readGroups = (): unknown[] => {
    const raw = storage[QUICK_BUTTONS_STORAGE_KEY];
    if (!raw) return [];
    const data = JSON.parse(raw);
    return data.state ? data.state.groups : data.groups || [];
  };
  const persistGroups = (groups: unknown[]): void => {
    // 保持与原形态一致：统一写为 {state:{groups}}
    storage[QUICK_BUTTONS_STORAGE_KEY] = JSON.stringify({ state: { groups }, version: 0 });
  };

  const executeJavaScript = vi.fn(async (script: string) => {
    if (script.includes('localStorage.setItem')) {
      const groups = extractGroupsFromScript(script);
      if (groups === null) return false;
      persistGroups(groups);
      return true;
    }
    // 区分读宏脚本与读按钮脚本
    if (script.includes(TERMINAL_MACROS_STORAGE_KEY)) {
      const raw = storage[TERMINAL_MACROS_STORAGE_KEY];
      if (!raw) return [];
      const data = JSON.parse(raw);
      return data.state ? data.state.savedMacros : data.savedMacros || [];
    }
    return readGroups();
  });
  const send = vi.fn((channel: string, payload: unknown) => {
    sent.push({ channel, payload });
  });

  const mainWindow: FakeWindow = {
    isDestroyed: () => false,
    webContents: { executeJavaScript, send },
    snapshotGroups: () => readGroups(),
    storage,
  };
  return { mainWindow };
}

function sampleStorage(): Record<string, string> {
  return {
    [QUICK_BUTTONS_STORAGE_KEY]: JSON.stringify({
      state: {
        groups: [
          {
            id: 'g1',
            name: 'AT 指令',
            buttons: [
              { id: 'b1', name: '重启', command: 'AT+RST', delay: 100 },
              {
                id: 'b2',
                name: '查询',
                command: 'AT+GMR',
                commands: ['AT+GMR', 'AT+VER'],
                noNewline: true,
              },
            ],
          },
          {
            id: 'g2',
            name: '巡检',
            buttons: [{ id: 'b3', name: 'ifconfig', command: 'ifconfig' }],
          },
        ],
      },
      version: 0,
    }),
  };
}

/** 简易 ctx（只读查询用，不支持写入） */
function makeReadonlyCtx(localStorageData: Record<string, string>): {
  mainWindow: {
    isDestroyed: () => boolean;
    webContents: {
      executeJavaScript: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
    };
  };
} {
  const storage = { ...localStorageData };
  const exec = vi.fn(async () => {
    const raw = storage[QUICK_BUTTONS_STORAGE_KEY];
    if (!raw) return [];
    const data = JSON.parse(raw);
    return data.state ? data.state.groups : data.groups || [];
  });
  return {
    mainWindow: {
      isDestroyed: () => false,
      webContents: { executeJavaScript: exec, send: vi.fn() },
    },
  };
}

type JsonResult = { ok: boolean; code?: string; detail?: string; data?: unknown };

function parseResult(text: string): JsonResult {
  return JSON.parse(text) as JsonResult;
}

describe('buttons.groups.list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('应返回所有分组及按钮数量摘要', async () => {
    const ctx = makeReadonlyCtx(sampleStorage());
    const out = parseResult(await buttonsHandlers['buttons.groups.list']({}, ctx));
    expect(out.ok).toBe(true);
    const data = out.data as {
      groups: Array<{ id: string; name: string; button_count: number; buttons: unknown[] }>;
      total: number;
    };
    expect(data.total).toBe(2);
    expect(data.groups[0]).toMatchObject({ id: 'g1', name: 'AT 指令', button_count: 2 });
    expect(data.groups[1]).toMatchObject({ id: 'g2', name: '巡检', button_count: 1 });
  });

  it('无窗口时返回 NO_WINDOW', async () => {
    const out = parseResult(await buttonsHandlers['buttons.groups.list']({}, { mainWindow: null }));
    expect(out.ok).toBe(false);
    expect(out.code).toBe('NO_WINDOW');
  });

  it('无数据时返回空列表', async () => {
    const ctx = makeReadonlyCtx({});
    const out = parseResult(await buttonsHandlers['buttons.groups.list']({}, ctx));
    expect(out.ok).toBe(true);
    expect((out.data as { groups: unknown[] }).groups).toEqual([]);
  });
});

describe('buttons.list', () => {
  it('不传 group_id 时返回所有分组的完整按钮', async () => {
    const ctx = makeReadonlyCtx(sampleStorage());
    const out = parseResult(await buttonsHandlers['buttons.list']({}, ctx));
    expect(out.ok).toBe(true);
    const data = out.data as { groups: Array<{ buttons: unknown[] }>; total: number };
    expect(data.groups).toHaveLength(2);
    expect(data.total).toBe(3);
    // 完整字段保留
    expect(data.groups[0].buttons[0]).toMatchObject({ id: 'b1', command: 'AT+RST', delay: 100 });
  });

  it('传 group_id 时只返回指定分组', async () => {
    const ctx = makeReadonlyCtx(sampleStorage());
    const out = parseResult(await buttonsHandlers['buttons.list']({ group_id: 'g2' }, ctx));
    expect(out.ok).toBe(true);
    const data = out.data as { group: { id: string }; buttons: unknown[]; total: number };
    expect(data.group.id).toBe('g2');
    expect(data.buttons).toHaveLength(1);
    expect(data.total).toBe(1);
  });

  it('group_id 不存在返回 NOT_FOUND', async () => {
    const ctx = makeReadonlyCtx(sampleStorage());
    const out = parseResult(await buttonsHandlers['buttons.list']({ group_id: 'nope' }, ctx));
    expect(out.ok).toBe(false);
    expect(out.code).toBe('NOT_FOUND');
  });
});

describe('buttons.get', () => {
  it('按 id 返回单个按钮详情与所属分组', async () => {
    const ctx = makeReadonlyCtx(sampleStorage());
    const out = parseResult(await buttonsHandlers['buttons.get']({ id: 'b3' }, ctx));
    expect(out.ok).toBe(true);
    const data = out.data as {
      button: { id: string; name: string };
      group_id: string;
      group_name: string;
    };
    expect(data.button).toMatchObject({ id: 'b3', name: 'ifconfig', command: 'ifconfig' });
    expect(data.group_id).toBe('g2');
    expect(data.group_name).toBe('巡检');
  });

  it('缺 id 返回 MISSING_PARAM', async () => {
    const ctx = makeReadonlyCtx(sampleStorage());
    const out = parseResult(await buttonsHandlers['buttons.get']({}, ctx));
    expect(out.ok).toBe(false);
    expect(out.code).toBe('MISSING_PARAM');
  });

  it('id 不存在返回 NOT_FOUND', async () => {
    const ctx = makeReadonlyCtx(sampleStorage());
    const out = parseResult(await buttonsHandlers['buttons.get']({ id: 'ghost' }, ctx));
    expect(out.ok).toBe(false);
    expect(out.code).toBe('NOT_FOUND');
  });
});

describe('buttons.create', () => {
  it('应在指定分组创建单行按钮并返回 id', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.create'](
        { group_id: 'g1', name: '深度重启', command: 'AT+NRST' },
        { mainWindow }
      )
    );
    expect(out.ok).toBe(true);
    const data = out.data as { id: string; button: { name: string; command: string } };
    expect(typeof data.id).toBe('string');
    expect(data.id).toHaveLength(36); // uuid
    expect(data.button).toMatchObject({ name: '深度重启', command: 'AT+NRST' });
    // 已持久化
    const groups = mainWindow.snapshotGroups() as Array<{ id: string; buttons: unknown[] }>;
    const g1 = groups.find((g) => g.id === 'g1')!;
    expect(g1.buttons).toHaveLength(3);
    // 触发 GUI 刷新事件
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      expect.stringContaining('quickButtons:changed'),
      expect.objectContaining({ groups: expect.any(Array) })
    );
  });

  it('应支持多行 commands 规范化（command=首行, commands 保留, delay 默认 100）', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.create'](
        { group_id: 'g1', name: '批量', commands: ['AT+CFUN=1', 'AT+CSQ'], delay: 500 },
        { mainWindow }
      )
    );
    expect(out.ok).toBe(true);
    const button = (out.data as { button: { command: string; commands: string[]; delay: number } })
      .button;
    expect(button.command).toBe('AT+CFUN=1');
    expect(button.commands).toEqual(['AT+CFUN=1', 'AT+CSQ']);
    expect(button.delay).toBe(500);
  });

  it('缺 name 或 command 返回 INVALID_PARAM', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out1 = parseResult(
      await buttonsHandlers['buttons.create']({ group_id: 'g1', command: 'AT' }, { mainWindow })
    );
    expect(out1.ok).toBe(false);
    expect(out1.code).toBe('INVALID_PARAM');

    const out2 = parseResult(
      await buttonsHandlers['buttons.create']({ group_id: 'g1', name: 'x' }, { mainWindow })
    );
    expect(out2.code).toBe('INVALID_PARAM');
  });

  it('缺 group_id 返回 MISSING_PARAM', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.create']({ name: 'x', command: 'AT' }, { mainWindow })
    );
    expect(out.code).toBe('MISSING_PARAM');
  });

  it('group_id 不存在返回 NOT_FOUND', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.create'](
        { group_id: 'ghost', name: 'x', command: 'AT' },
        { mainWindow }
      )
    );
    expect(out.code).toBe('NOT_FOUND');
  });
});

describe('buttons.update', () => {
  it('应按 id 局部更新字段', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.update'](
        { id: 'b1', command: 'AT+RST', delay: 500 },
        { mainWindow }
      )
    );
    expect(out.ok).toBe(true);
    const btn = (
      out.data as { button: { id: string; command: string; delay: number; name: string } }
    ).button;
    expect(btn.name).toBe('重启'); // 未更新字段保留
    expect(btn.delay).toBe(500);
    const groups = mainWindow.snapshotGroups() as Array<{
      id: string;
      buttons: Array<{ id: string }>;
    }>;
    expect(groups[0].buttons.find((b) => b.id === 'b1')?.id).toBe('b1');
  });

  it('不存在 id 返回 NOT_FOUND', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.update']({ id: 'ghost', name: 'x' }, { mainWindow })
    );
    expect(out.code).toBe('NOT_FOUND');
  });

  it('缺 id 返回 MISSING_PARAM', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(await buttonsHandlers['buttons.update']({ name: 'x' }, { mainWindow }));
    expect(out.code).toBe('MISSING_PARAM');
  });
});

describe('buttons.delete', () => {
  it('无 confirm 时拒绝执行返回 CONFIRM_REQUIRED', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(await buttonsHandlers['buttons.delete']({ id: 'b1' }, { mainWindow }));
    expect(out.ok).toBe(false);
    expect(out.code).toBe('CONFIRM_REQUIRED');
    // 数据未被删除
    expect(mainWindow.snapshotGroups()).toHaveLength(2);
  });

  it('confirm=true 时删除按钮', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.delete']({ id: 'b2', confirm: true }, { mainWindow })
    );
    expect(out.ok).toBe(true);
    const groups = mainWindow.snapshotGroups() as Array<{ id: string; buttons: unknown[] }>;
    expect(groups.find((g) => g.id === 'g1')!.buttons).toHaveLength(1);
  });

  it('不存在 id 返回 NOT_FOUND（即使 confirm）', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.delete']({ id: 'ghost', confirm: true }, { mainWindow })
    );
    expect(out.code).toBe('NOT_FOUND');
  });
});

describe('buttons.groups.create', () => {
  it('应创建空分组', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.groups.create']({ name: '新组' }, { mainWindow })
    );
    expect(out.ok).toBe(true);
    const id = (out.data as { id: string }).id;
    const groups = mainWindow.snapshotGroups() as Array<{ id: string; buttons: unknown[] }>;
    expect(groups).toHaveLength(3);
    expect(groups.find((g) => g.id === id)).toMatchObject({ name: '新组', buttons: [] });
  });

  it('重名返回 INVALID_PARAM', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.groups.create']({ name: 'AT 指令' }, { mainWindow })
    );
    expect(out.code).toBe('INVALID_PARAM');
  });
});

describe('buttons.groups.update', () => {
  it('应重命名分组', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.groups.update']({ id: 'g1', name: 'AT 大全' }, { mainWindow })
    );
    expect(out.ok).toBe(true);
    const groups = mainWindow.snapshotGroups() as Array<{ id: string; name: string }>;
    expect(groups.find((g) => g.id === 'g1')!.name).toBe('AT 大全');
  });

  it('重名返回 INVALID_PARAM', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.groups.update']({ id: 'g1', name: '巡检' }, { mainWindow })
    );
    expect(out.code).toBe('INVALID_PARAM');
  });
});

describe('buttons.groups.delete', () => {
  it('无 confirm 拒绝', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.groups.delete']({ id: 'g2' }, { mainWindow })
    );
    expect(out.code).toBe('CONFIRM_REQUIRED');
  });

  it('组非空且无 cascade 返回 GROUP_NOT_EMPTY', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.groups.delete']({ id: 'g1', confirm: true }, { mainWindow })
    );
    expect(out.code).toBe('GROUP_NOT_EMPTY');
  });

  it('confirm+cascade 级联删除非空分组', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.groups.delete'](
        { id: 'g1', confirm: true, cascade: true },
        { mainWindow }
      )
    );
    expect(out.ok).toBe(true);
    const groups = mainWindow.snapshotGroups() as Array<{ id: string }>;
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('g2');
  });

  it('confirm 删除空分组', async () => {
    const storage = {
      [QUICK_BUTTONS_STORAGE_KEY]: JSON.stringify({
        state: { groups: [{ id: 'g-empty', name: '空组', buttons: [] }] },
        version: 0,
      }),
    };
    const { mainWindow } = makeLiveCtx(storage);
    const out = parseResult(
      await buttonsHandlers['buttons.groups.delete'](
        { id: 'g-empty', confirm: true },
        { mainWindow }
      )
    );
    expect(out.ok).toBe(true);
    expect(mainWindow.snapshotGroups()).toEqual([]);
  });
});

describe('buttons.run', () => {
  const connection = { state: 'connected', write: vi.fn(), type: 'serial' };

  beforeEach(() => {
    vi.clearAllMocks();
    (ConnectionFactory.get as ReturnType<typeof vi.fn>).mockReset();
    (ConnectionFactory.get as ReturnType<typeof vi.fn>).mockReturnValue(connection);
    connection.write.mockClear();
  });

  it('应在已连接连接上发送单条命令并追加 \\r\\n', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.run']({ id: 'b1', connection_id: 'conn-1' }, { mainWindow })
    );
    expect(out.ok).toBe(true);
    expect(connection.write).toHaveBeenCalledTimes(1);
    expect(connection.write).toHaveBeenCalledWith(Buffer.from('AT+RST\r\n', 'utf-8'));
    expect(out.data).toMatchObject({ triggered: 'commands', count: 1 });
  });

  it('noNewline 按钮不追加换行', async () => {
    const storage = {
      [QUICK_BUTTONS_STORAGE_KEY]: JSON.stringify({
        state: {
          groups: [
            {
              id: 'g1',
              name: 'G',
              buttons: [{ id: 'b1', name: '原始', command: '\\x02', noNewline: true }],
            },
          ],
        },
        version: 0,
      }),
    };
    const { mainWindow } = makeLiveCtx(storage);
    const out = parseResult(
      await buttonsHandlers['buttons.run']({ id: 'b1', connection_id: 'conn-1' }, { mainWindow })
    );
    expect(out.ok).toBe(true);
    // \x02 → 0x02 字节（Ctrl+B），不追加 \r\n
    expect(connection.write).toHaveBeenCalledWith(Buffer.from([0x02]));
  });

  it('多行按钮按 delay 逐条发送', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage()); // b2 多行，delay 未设 → 默认100
    const out = parseResult(
      await buttonsHandlers['buttons.run']({ id: 'b2', connection_id: 'conn-1' }, { mainWindow })
    );
    expect(out.ok).toBe(true);
    expect(out.data).toMatchObject({ triggered: 'commands', count: 2, delay_ms: 100 });
    expect(connection.write).toHaveBeenCalledTimes(2);
  });

  it('macroId 按钮按宏步骤回放（批量单次发送）', async () => {
    const storage = {
      [QUICK_BUTTONS_STORAGE_KEY]: JSON.stringify({
        state: {
          groups: [
            {
              id: 'g1',
              name: 'G',
              buttons: [{ id: 'b-macro', name: '跑宏', command: '', macroId: 'm1' }],
            },
          ],
        },
        version: 0,
      }),
      [TERMINAL_MACROS_STORAGE_KEY]: JSON.stringify({
        state: {
          savedMacros: [
            { id: 'm1', name: '启动', steps: [{ data: 'cmd1\n' }, { data: 'cmd2\n', delay: 30 }] },
          ],
        },
        version: 0,
      }),
    };
    const { mainWindow } = makeLiveCtx(storage);
    const out = parseResult(
      await buttonsHandlers['buttons.run'](
        { id: 'b-macro', connection_id: 'conn-1' },
        { mainWindow }
      )
    );
    expect(out.ok).toBe(true);
    expect(out.data).toMatchObject({ triggered: 'macro', macro_id: 'm1' });
    // 批量合并单次发送
    expect(connection.write).toHaveBeenCalledTimes(1);
    const sentBuf = connection.write.mock.calls[0][0] as Buffer;
    expect(sentBuf.toString('utf-8')).toBe('cmd1\ncmd2\n');
  });

  it('连接未打开返回 CONN_NOT_CONNECTED', async () => {
    (ConnectionFactory.get as ReturnType<typeof vi.fn>).mockReturnValue({
      state: 'disconnected',
      write: vi.fn(),
    });
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.run']({ id: 'b1', connection_id: 'conn-x' }, { mainWindow })
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe('CONN_NOT_CONNECTED');
    expect(connection.write).not.toHaveBeenCalled();
  });

  it('连接不存在返回 CONN_NOT_FOUND', async () => {
    (ConnectionFactory.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.run']({ id: 'b1', connection_id: 'nope' }, { mainWindow })
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe('CONN_NOT_FOUND');
  });

  it('按钮不存在返回 NOT_FOUND', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(
      await buttonsHandlers['buttons.run']({ id: 'ghost', connection_id: 'conn-1' }, { mainWindow })
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe('NOT_FOUND');
  });

  it('缺 connection_id 返回 MISSING_PARAM', async () => {
    const { mainWindow } = makeLiveCtx(sampleStorage());
    const out = parseResult(await buttonsHandlers['buttons.run']({ id: 'b1' }, { mainWindow }));
    expect(out.code).toBe('MISSING_PARAM');
  });
});
