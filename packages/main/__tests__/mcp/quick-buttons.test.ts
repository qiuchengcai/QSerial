/**
 * 快捷按钮数据桥（主进程侧）辅助函数测试
 * 覆盖：宽松解析（parseButton/parseGroup）、validateGroupName、以及
 * 渲染进程快照读取的兼容性（localStorage 两种 persist 形态）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron（BrowserWindow 供 executeJavaScript 相关路径使用）
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  app: { getPath: vi.fn(() => '/tmp'), commandLine: { appendSwitch: vi.fn() } },
}));

import {
  parseButton,
  parseGroup,
  validateGroupName,
  readQuickButtonGroups,
  QUICK_BUTTONS_STORAGE_KEY,
} from '../../src/services/mcp/quick-buttons.ts';

/** 构造一个可伪造 executeJavaScript 的 window 对象 */
function makeFakeWindow(localStorageData: Record<string, string>): {
  isDestroyed: () => boolean;
  webContents: { executeJavaScript: ReturnType<typeof vi.fn> };
} {
  return {
    isDestroyed: () => false,
    webContents: {
      executeJavaScript: vi.fn(async () => {
        const raw = localStorageData[QUICK_BUTTONS_STORAGE_KEY];
        if (!raw) return [];
        const data = JSON.parse(raw);
        return data.state ? data.state.groups : data.groups || [];
      }),
    },
  };
}

describe('parseButton / parseGroup（宽松解析）', () => {
  it('应解析完整按钮字段', () => {
    const btn = parseButton({
      id: 'b1',
      name: '重启',
      command: 'reboot',
      commands: ['cmd1', 'cmd2'],
      delay: 250,
      noNewline: true,
      macroId: 'm1',
      description: 'desc',
      color: '#FF0000',
      textColor: '#FFFFFF',
    });
    expect(btn).toEqual({
      id: 'b1',
      name: '重启',
      command: 'reboot',
      commands: ['cmd1', 'cmd2'],
      delay: 250,
      noNewline: true,
      macroId: 'm1',
      description: 'desc',
      color: '#FF0000',
      textColor: '#FFFFFF',
    });
  });

  it('应解析最小按钮并忽略非法字段', () => {
    const btn = parseButton({ id: 'b1', name: 'x', command: 'y', bogus: 1 });
    expect(btn).toEqual({ id: 'b1', name: 'x', command: 'y' });
  });

  it('缺 id 或 name 时返回 null', () => {
    expect(parseButton({ id: 'b1', command: 'y' })).toBeNull();
    expect(parseButton({ name: 'x', command: 'y' })).toBeNull();
    expect(parseButton(null)).toBeNull();
    expect(parseButton('str')).toBeNull();
  });

  it('should parse group with valid buttons only', () => {
    const grp = parseGroup({
      id: 'g1',
      name: '巡检',
      buttons: [
        { id: 'b1', name: 'a', command: 'x' },
        { id: 'bad' }, // 会被过滤
      ],
    });
    expect(grp).toEqual({
      id: 'g1',
      name: '巡检',
      buttons: [{ id: 'b1', name: 'a', command: 'x' }],
    });
  });
});

describe('validateGroupName', () => {
  const groups = [
    { id: 'g1', name: '分组一', buttons: [] },
    { id: 'g2', name: '分组二', buttons: [] },
  ];

  it('应拒绝空名称', () => {
    expect(validateGroupName(groups, '')).not.toBeNull();
    expect(validateGroupName(groups, '   ')).not.toBeNull();
  });

  it('应拒绝重名（不含自身）', () => {
    expect(validateGroupName(groups, '分组一')).not.toBeNull();
    expect(validateGroupName(groups, '分组一', 'g1')).toBeNull();
  });

  it('应接受合法新名称', () => {
    expect(validateGroupName(groups, '分组三')).toBeNull();
  });
});

describe('readQuickButtonGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('读取无数据时返回空数组', async () => {
    const fake = makeFakeWindow({});
    expect(await readQuickButtonGroups(fake as never)).toEqual([]);
  });

  it('读取新形态 persist 快照 {state:{groups}}', async () => {
    const fake = makeFakeWindow({
      [QUICK_BUTTONS_STORAGE_KEY]: JSON.stringify({
        state: {
          groups: [{ id: 'g1', name: 'G', buttons: [{ id: 'b1', name: 'B', command: 'c' }] }],
        },
        version: 0,
      }),
    });
    const groups = await readQuickButtonGroups(fake as never);
    expect(groups).toHaveLength(1);
    expect(groups[0].buttons[0].command).toBe('c');
  });

  it('读取旧形态快照 {groups} 兼容', async () => {
    const fake = makeFakeWindow({
      [QUICK_BUTTONS_STORAGE_KEY]: JSON.stringify({
        groups: [{ id: 'g1', name: 'G', buttons: [] }],
      }),
    });
    const groups = await readQuickButtonGroups(fake as never);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('g1');
  });

  it('读取损坏 JSON 返回空数组', async () => {
    const fake = makeFakeWindow({
      [QUICK_BUTTONS_STORAGE_KEY]: '{not-json',
    });
    // makeFakeWindow 的 executeJavaScript 不抛错（脚本内 try/catch 返回 []）
    const fake2 = {
      isDestroyed: () => false,
      webContents: { executeJavaScript: vi.fn(async () => []) },
    };
    expect(await readQuickButtonGroups(fake2 as never)).toEqual([]);
    void fake;
  });

  it('window 为空或已销毁时返回空数组', async () => {
    expect(await readQuickButtonGroups(null)).toEqual([]);
    expect(await readQuickButtonGroups({ isDestroyed: () => true } as never)).toEqual([]);
  });
});
