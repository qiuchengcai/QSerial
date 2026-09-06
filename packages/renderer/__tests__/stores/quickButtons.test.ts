/**
 * 快捷按钮 store：setGroups 与 MCP 变更桥测试
 */
/** @vitest-environment jsdom */
/// <reference types="vitest" />
import '../setup';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useQuickButtonsStore,
  type QuickButton,
  type ButtonGroup,
} from '../../src/stores/quickButtons';

const makeButton = (overrides: Partial<QuickButton> = {}): QuickButton => ({
  id: 'btn-1',
  name: '测试按钮',
  command: 'AT\r',
  ...overrides,
});

const makeGroup = (overrides: Partial<ButtonGroup> = {}): ButtonGroup => ({
  id: 'grp-1',
  name: '分组一',
  buttons: [makeButton()],
  ...overrides,
});

describe('useQuickButtonsStore setGroups', () => {
  beforeEach(() => {
    useQuickButtonsStore.setState({ groups: [], direction: 'horizontal' });
    window.localStorage.clear();
  });

  it('setGroups 应整体替换分组数据', () => {
    const groups = [makeGroup()];
    useQuickButtonsStore.getState().setGroups(groups);
    expect(useQuickButtonsStore.getState().groups).toEqual(groups);
  });

  it('setGroups 为空数组时清空分组', () => {
    useQuickButtonsStore.getState().setGroups([makeGroup()]);
    useQuickButtonsStore.getState().setGroups([]);
    expect(useQuickButtonsStore.getState().groups).toEqual([]);
  });

  it('setGroups 不改变 direction 状态', () => {
    useQuickButtonsStore.getState().setDirection('vertical');
    useQuickButtonsStore.getState().setGroups([makeGroup()]);
    expect(useQuickButtonsStore.getState().direction).toBe('vertical');
  });
});

describe('initQuickButtonBridge（MCP 变更 → store 同步）', () => {
  // initQuickButtonBridge 有模块级单次订阅标志，因此每个用例用 resetModules + 动态 import
  // 重建模块，模拟独立进程首次启动。动态导入得到该用例私有的 store 与 bridge。
  async function loadFreshStore() {
    vi.resetModules();
    const mod = await import('../../src/stores/quickButtons');
    return mod as typeof import('../../src/stores/quickButtons');
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // 清空持久化数据，避免上一用例的 persist 写残留污染（resetModules 后 hydrate 会回放）
    window.localStorage.clear();
  });

  it('应订阅 window.qserial.quickButtons.onChanged', async () => {
    const mod = await loadFreshStore();
    mod.initQuickButtonBridge();
    expect(window.qserial.quickButtons.onChanged).toHaveBeenCalledTimes(1);
  });

  it('收到合法分组事件时以 setGroups 刷新 store', async () => {
    const mod = await loadFreshStore();
    mod.initQuickButtonBridge();
    const onChanged = (window.qserial.quickButtons.onChanged as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as (groups: unknown[]) => void;

    const groups = [makeGroup({ id: 'grp-ext', buttons: [makeButton({ id: 'btn-ext' })] })];
    onChanged(groups);
    expect(mod.useQuickButtonsStore.getState().groups).toEqual(groups);
  });

  it('收到非法数据时忽略，不污染 store', async () => {
    const mod = await loadFreshStore();
    mod.initQuickButtonBridge();
    const onChanged = (window.qserial.quickButtons.onChanged as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as (groups: unknown[]) => void;

    // 非法分组：缺 name
    onChanged([{ id: 'bad' }]);
    // 非法按钮：缺 command
    onChanged([{ id: 'grp-ok', name: 'g', buttons: [{ id: 'b', name: 'x' }] }]);
    // 非数组
    onChanged({ groups: [] } as unknown);

    expect(mod.useQuickButtonsStore.getState().groups).toEqual([]);
  });

  it('重复调用 initQuickButtonBridge 只订阅一次', async () => {
    const mod = await loadFreshStore();
    mod.initQuickButtonBridge();
    mod.initQuickButtonBridge();
    expect(window.qserial.quickButtons.onChanged).toHaveBeenCalledTimes(1);
  });
});
