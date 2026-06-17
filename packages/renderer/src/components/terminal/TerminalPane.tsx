/**
 * 终端面板组件
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { useTerminalStore } from '@/stores/terminal';
import { useThemeStore } from '@/stores/theme';
import { useTerminalMacroStore, PRESET_MACRO_COLORS } from '@/stores/terminalMacro';
import { useQuickButtonsStore } from '@/stores/quickButtons';
import { useConfigStore } from '@/stores/config';
import { base64ToUint8Array, ConnectionType, ConnectionState } from '@qserial/shared';
import 'xterm/css/xterm.css';

import { ConnectionShareDialog } from '../dialogs/ConnectionShareDialog';
import { globalError } from '../common/ErrorToast';

interface TerminalPaneProps {
  sessionId: string;
  connectionId: string;
  isActive: boolean;
  activeTabId?: string | null;
}

export const TerminalPane: React.FC<TerminalPaneProps> = React.memo(({
  sessionId,
  connectionId,
  isActive,
  activeTabId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const unsubscribersRef = useRef<(() => void)[]>([]);
  const messageShownRef = useRef(false);
  const wasDisconnectedRef = useRef(false);
  const isComposingRef = useRef(false);
  const compositionDataRef = useRef<string>('');
  const [logStarting, setLogStarting] = useState(false);
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showMacroSave, setShowMacroSave] = useState(false);
  const [macroName, setMacroName] = useState('');
  const [macroDesc, setMacroDesc] = useState('');
  const [macroColor, setMacroColor] = useState('');
  const initializedRef = useRef(false);
  const disposedRef = useRef(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [filterText, setFilterText] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchPosRef = useRef(-1);
  const [showSerialShareDialog, setShowSerialShareDialog] = useState(false);
  const timeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mountCountRef = useRef(0);

  // 使用 selector 精准订阅，避免其他 session 变更导致本组件重渲染
  const session = useTerminalStore(state => state.sessions[sessionId]);
  const updateSessionSize = useTerminalStore(state => state.updateSessionSize);
  const updateSessionState = useTerminalStore(state => state.updateSessionState);
  const startLog = useTerminalStore(state => state.startLog);
  const stopLog = useTerminalStore(state => state.stopLog);
  const { currentTheme } = useThemeStore();
  const { config } = useConfigStore();

  // 调整终端尺寸 - 使用 FitAddon
  const resizeTerminal = useCallback(() => {
    if (!xtermRef.current || !fitAddonRef.current || !containerRef.current) return;

    try {
      fitAddonRef.current.fit();
      const { cols, rows } = xtermRef.current;
      window.qserial.connection.resize(connectionId, cols, rows).catch(() => {});
       updateSessionSize(sessionId, cols, rows);
    } catch {
      // 忽略 resize 错误
    }
  }, [connectionId, sessionId, updateSessionSize]);

  // 初始化终端（只执行一次，组件卸载时才销毁）
  useEffect(() => {
    // 防止重复初始化
    if (initializedRef.current) return;
    if (!containerRef.current) return;

    initializedRef.current = true;
    disposedRef.current = false;
    mountCountRef.current += 1;
    const mountId = mountCountRef.current;
    const openedRef = { current: false }; // 追踪 xterm.open() 是否已调用
    console.log('[TerminalPane] INIT xterm mountId:', mountId, 'sessionId:', sessionId.slice(0, 8), 'connectionId:', connectionId.slice(0, 8));

    const xterm = new XTerm({
      theme: currentTheme.xterm,
      fontFamily: config.terminal.fontFamily,
      fontSize: config.terminal.fontSize,
      cursorBlink: true,
      scrollback: config.terminal.scrollback,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    // 不在 open 前 loadAddon：xterm-addon-fit 会 wrap open() 在内
    // 部异步 Viewport 初始化完成前调用 fit()，导致 _renderService 未定义

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // 显示连接成功消息的函数
    const showConnectionSuccessMessage = (terminal: XTerm) => {
      if (messageShownRef.current) return;
      messageShownRef.current = true;

      const now = new Date();
      const time = now.toLocaleTimeString();
      const date = now.toLocaleDateString();

      const getDisplayWidth = (str: string) => {
        let width = 0;
        for (const char of str) {
          if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(char)) {
            width += 2;
          } else {
            width += 1;
          }
        }
        return width;
      };

      const makeLine = (content: string) => {
        // eslint-disable-next-line no-control-regex
        const visibleLen = getDisplayWidth(content.replace(/\x1b\[[0-9;]*m/g, ''));
        const padding = ' '.repeat(39 - visibleLen);
        return `  \x1b[1;36m|\x1b[0m ${content}${padding}\x1b[1;36m|\x1b[0m`;
      };

      terminal.write('\r\n');
      terminal.write('  \x1b[1;36m╔════════════════════════════════════════╗\x1b[0m\r\n');
      terminal.write(makeLine('') + '\r\n');
      terminal.write(makeLine('  \x1b[1;32m★ 串口连接成功 ★\x1b[0m') + '\r\n');
      terminal.write(makeLine('') + '\r\n');
      terminal.write(makeLine('  \x1b[33m●\x1b[0m 日期: ' + date) + '\r\n');
      terminal.write(makeLine('  \x1b[33m●\x1b[0m 时间: ' + time) + '\r\n');
      terminal.write(makeLine('') + '\r\n');
      terminal.write('  \x1b[1;36m╚════════════════════════════════════════╝\x1b[0m\r\n');
      terminal.write('\r\n');
    };

    // 等待容器有实际尺寸后再 open xterm
    const openXterm = () => {
      // mountId 守卫：只处理当前 mount 的调用，防止旧 mount 残留的 setTimeout/ResizeObserver
      if (mountCountRef.current !== mountId) return;
      if (disposedRef.current || !xtermRef.current || !containerRef.current) return;

      const container = containerRef.current;
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        // 容器尺寸还没就绪，使用 ResizeObserver 继续等待
        const ro = new ResizeObserver(() => {
          if (mountCountRef.current !== mountId) { ro.disconnect(); return; }
          if (container.clientWidth > 0 && container.clientHeight > 0) {
            ro.disconnect();
            openXterm();
          }
        });
        ro.observe(container);
        unsubscribersRef.current.push(() => ro.disconnect());
        return;
      }

      try {
        xterm.open(container);
        // 安全化 Viewport 的异步回调：xterm 内部 Viewport 构造函数会
        // setTimeout(() => this.syncScrollArea())，且 dispose 时不清除该 timeout；
        // syncScrollArea 内部还会 _refresh → rAF(_innerRefresh) 异步链路。
        // 必须用 mountCountRef 而非 disposedRef（后者会被新 mount 重置为 false）
        try {
          const core = (xterm as any)._core;
          if (core?.viewport) {
            const capturedMountId = mountId;
            // 方案1：patch RenderService.dimensions getter — 从根源消除异常
            // 当 _renderer.value 为 undefined（Renderer 未就绪或已 dispose）时，
            // 返回 null 而非抛 TypeError。这是最可靠的方案，因为所有
            // Viewport 异步回调最终都会访问这个 getter。
            try {
              const renderService = core._renderService;
              if (renderService) {
                const desc = Object.getOwnPropertyDescriptor(
                  Object.getPrototypeOf(renderService), 'dimensions'
                );
                if (desc?.get) {
                  const origGetter = desc.get;
                  Object.defineProperty(renderService, 'dimensions', {
                    get: function () {
                      try { return origGetter.call(this); } catch { return null; }
                    },
                    configurable: true,
                  });
                }
              }
            } catch { /* dimensions patch 失败 */ }

            // 方案2：同时 patch Viewport 三个关键方法，
            // 提供双重保护 + mountId 守卫防止已 dispose 实例的回调
            const vp = core.viewport;
            const origSync = vp.syncScrollArea.bind(vp);
            const origRefresh = vp._refresh?.bind(vp);
            const origInnerRefresh = vp._innerRefresh?.bind(vp);
            vp.syncScrollArea = function (...args: any[]) {
              if (mountCountRef.current !== capturedMountId) return;
              try { return origSync(...args); } catch { /* dimensions 未就绪/已 dispose */ }
            };
            if (origRefresh) {
              vp._refresh = function (e3: boolean) {
                if (mountCountRef.current !== capturedMountId) return;
                try { return origRefresh(e3); } catch { /* dimensions 未就绪/已 dispose */ }
              };
            }
            if (origInnerRefresh) {
              vp._innerRefresh = function (...args: any[]) {
                if (mountCountRef.current !== capturedMountId) return;
                try { return origInnerRefresh(...args); } catch { /* dimensions 未就绪/已 dispose */ }
              };
            }
          }
        } catch { /* patch 失败不影响核心功能 */ }

        openedRef.current = true;
        // open 之后再加载 FitAddon，避免 addon wrap open() 后 Viewport 异步初始化竞态
        xterm.loadAddon(fitAddon);
        const searchAddon = new SearchAddon();
        searchAddonRef.current = searchAddon;
        xterm.loadAddon(searchAddon);
        // 延迟一帧 fit，确保 Viewport 内部异步初始化(setTimeout→rAF)完成
        requestAnimationFrame(() => {
          if (mountCountRef.current !== mountId) return;
          try { fitAddon.fit(); } catch { /* ignore */ }
        });
      } catch (e) {
        console.error('[TerminalPane] Failed to open terminal:', e);
        return;
      }

      // 确保 textarea 元素正确配置以支持中文输入法
      const textarea = xterm.textarea;
      if (textarea) {
        textarea.setAttribute('autocomplete', 'off');
        textarea.setAttribute('autocorrect', 'off');
        textarea.setAttribute('autocapitalize', 'off');
        textarea.setAttribute('spellcheck', 'false');
        textarea.style.fontFamily = config.terminal.fontFamily;
        textarea.style.fontSize = `${config.terminal.fontSize}px`;

        // 立即绑定 composition 事件（在 xterm.open 之后）
        const handleCompositionStart = () => {
          isComposingRef.current = true;
          compositionDataRef.current = '';
        };
        const handleCompositionEnd = (e: CompositionEvent) => {
          // composition 结束后，记录最终的中文数据
          // 不在这里发送，让 onData 来发送，避免重复
          const finalData = e.data;
          compositionDataRef.current = finalData;
          // 立即重置 isComposing，让 onData 可以发送数据
          isComposingRef.current = false;
        };

        textarea.addEventListener('compositionstart', handleCompositionStart);
        textarea.addEventListener('compositionend', handleCompositionEnd);

        // 添加到清理列表
        unsubscribersRef.current.push(() => {
          textarea.removeEventListener('compositionstart', handleCompositionStart);
          textarea.removeEventListener('compositionend', handleCompositionEnd);
        });
      }

      // 延迟调度（自动追踪，cleanup 时统一清除）
      const schedule = (fn: () => void, ms: number) => {
        const id = setTimeout(fn, ms);
        timeoutIdsRef.current.push(id);
        return id;
      };

      // 多次延迟调整尺寸，确保布局稳定
      const resizeMultiple = () => {
        resizeTerminal();
        schedule(resizeTerminal, 50);
        schedule(resizeTerminal, 100);
        schedule(resizeTerminal, 200);
        schedule(resizeTerminal, 500);
      };

      // 延迟初始化后调整尺寸
      schedule(async () => {
        resizeMultiple();

        // 主动查询当前连接状态（因为可能错过了 connected 事件）
        try {
          const { state } = await window.qserial.connection.getState(connectionId);
          console.log('[TerminalPane] Queried state:', state, 'mountId:', mountId);

          // 更新 session 状态
          updateSessionState(sessionId, state as any);

          if (state === 'connected') {
            const session = useTerminalStore.getState().sessions[sessionId];
            console.log('[TerminalPane] Session connectionType:', session?.connectionType, 'mountId:', mountId);
            if (session?.connectionType === ConnectionType.SERIAL) {
              console.log('[TerminalPane] Showing connection success message! mountId:', mountId);
              showConnectionSuccessMessage(xterm);
            }
          }
        } catch (err) {
          console.error('[TerminalPane] Failed to get state:', err);
        }
      }, 50);
    };

    // 启动
    openXterm();

    // 添加复制粘贴和搜索支持
    xterm.attachCustomKeyEventHandler((event) => {
      if (event.ctrlKey && event.key === 'f') {
        openSearch();
        return false;
      }
      if (event.ctrlKey && event.key === 'c') {
        const selection = xterm.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          return false;
        }
        return true;
      }
      if (event.ctrlKey && event.key === 'v') {
        // 阻止默认行为，通过 onData 事件处理粘贴
        return false;
      }
      return true;
    });

    // 用户输入（包括粘贴）
    xterm.onData((data) => {
      console.log('[TerminalPane] onData received:', JSON.stringify(data), 'connectionId:', connectionId.slice(0, 8));
      // 如果在 composition 过程中，不发送数据
      if (isComposingRef.current) {
        console.log('[TerminalPane] onData blocked by composition');
        return;
      }
      // 如果数据与 composition 结束时的数据相同，发送后清空标记
      if (data === compositionDataRef.current) {
        console.log('[TerminalPane] onData sending (composition end)');
        window.qserial.connection.write(connectionId, data);
        console.log('[Macro] Record step:', JSON.stringify(data));
        addStep(data);
        compositionDataRef.current = ''; // 清空标记，防止重复
        return;
      }
      console.log('[TerminalPane] onData sending');
      window.qserial.connection.write(connectionId, data);
      console.log('[Macro] Record step:', JSON.stringify(data));
      addStep(data);
    });

    // 监听后端数据
    const unsubscribeData = window.qserial.connection.onData(
      connectionId,
      (base64Data: string) => {
        // 终端已销毁时不再写入数据，防止触发 xterm 内部异步回调链崩溃
        if (disposedRef.current) return;
        try {
          const data = base64ToUint8Array(base64Data);
          // 直接写入 Uint8Array，避免 TextDecoder 对非 UTF-8 数据解码产生无效字符
          xterm.write(data);

          // 实时写入日志（日志需要文本）
          const currentSession = useTerminalStore.getState().sessions[sessionId];
          if (currentSession?.logEnabled && currentSession?.logFilePath) {
            const text = new TextDecoder().decode(data);
            window.qserial.log.write(sessionId, text).catch((err) => {
              console.error('Failed to write log:', err);
            });
          }
        } catch (error) {
          console.error('Failed to write terminal data:', error);
        }
      }
    );
    unsubscribersRef.current.push(unsubscribeData);

    // 监听连接状态
    const unsubscribeState = window.qserial.connection.onStateChange(
      connectionId,
      (state: string) => {
        if (disposedRef.current) return;
        console.log('[TerminalPane] State changed:', state, 'sessionId:', sessionId.slice(0, 8), 'mountId:', mountId);
        updateSessionState(sessionId, state as any);

        if (state === 'connected') {
          const currentSession = useTerminalStore.getState().sessions[sessionId];
          if (currentSession?.connectionType === ConnectionType.SERIAL) {
            showConnectionSuccessMessage(xterm);
          }
          if (wasDisconnectedRef.current && currentSession) {
            xterm.write('\r\n\x1b[32m--- 连接已恢复 ---\x1b[0m\r\n');
          }
          wasDisconnectedRef.current = false;
        } else if (state === 'disconnected') {
          wasDisconnectedRef.current = true;
          messageShownRef.current = false;
          const currentSession = useTerminalStore.getState().sessions[sessionId];
          if (currentSession) {
            xterm.write('\r\n\x1b[33m--- 连接已断开，点击右上角"重连"按钮重新连接 ---\x1b[0m\r\n');
          }
        } else if (state === 'reconnecting') {
          wasDisconnectedRef.current = true;
          xterm.write('\r\n\x1b[33m--- 连接已断开，正在重连... ---\x1b[0m\r\n');
        }
      }
    );
    unsubscribersRef.current.push(unsubscribeState);

    // 监听连接错误
    const unsubscribeError = window.qserial.connection.onError(
      connectionId,
      (error: string) => {
        console.error('[TerminalPane] Connection error:', error, 'connectionId:', connectionId.slice(0, 8));
        xterm.write(`\x1b[31m错误: ${error}\x1b[0m\r\n`);
      }
    );
    unsubscribersRef.current.push(unsubscribeError);

    // 窗口大小变化时自适应
    const resizeObserver = new ResizeObserver(() => {
      resizeTerminal();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      console.log('[TerminalPane] DISPOSE xterm mountId:', mountId, 'sessionId:', sessionId.slice(0, 8));
      disposedRef.current = true;
      // 清除所有未完成的 timeout
      timeoutIdsRef.current.forEach(clearTimeout);
      timeoutIdsRef.current = [];
      resizeObserver.disconnect();
      unsubscribersRef.current.forEach((unsub) => unsub());
      unsubscribersRef.current = [];
      // 同步 dispose，避免 rAF 延迟导致 StrictMode 双挂载时新旧实例冲突
      try { xterm.dispose(); } catch { /* ignore */ }
      xtermRef.current = null;
      fitAddonRef.current = null;
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, sessionId]);

  // 主题和配置变化
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = currentTheme.xterm;
      xtermRef.current.options.fontFamily = config.terminal.fontFamily;
      xtermRef.current.options.fontSize = config.terminal.fontSize;
    }
  }, [currentTheme, config.terminal.fontFamily, config.terminal.fontSize]);

  // 激活时聚焦和调整尺寸
  useEffect(() => {
    if (isActive && xtermRef.current) {
      // 延迟调整尺寸，确保容器已显示
      setTimeout(() => {
        if (xtermRef.current && fitAddonRef.current) {
          try {
            fitAddonRef.current.fit();
          } catch {
            // 忽略错误
          }
        }
      }, 50);
      xtermRef.current.focus();
    }
  }, [isActive, activeTabId]);

  // 搜索状态管理 — 使用 ref 避免闭包陈旧问题
  const searchStateRef = useRef({ text: '', filterText: '', caseSensitive: false });

  // 转义正则特殊字符
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const bufferSearch = useCallback((forward: boolean) => {
    const term = xtermRef.current;
    if (!term) return;
    const { text, filterText: ft, caseSensitive } = searchStateRef.current;
    if (!text.trim()) return;
    const buffer = term.buffer.active;
    const flags = caseSensitive ? '' : 'i';
    const primaryRe = new RegExp(escapeRegex(text), flags);
    const hasFilter = ft.trim().length > 0;
    const filterRe = hasFilter ? new RegExp(escapeRegex(ft), flags) : null;
    const total = buffer.length;
    const start = searchPosRef.current;

    // 从当前匹配位置的下一行开始，初始为 -1 时从 buffer 首行/末行开始
    const startIdx = forward
      ? (start >= 0 ? (start + 1) % total : 0)
      : (start >= 0 ? ((start - 1) % total + total) % total : total - 1);

    for (let i = 0; i < total; i++) {
      const idx = forward
        ? (startIdx + i) % total
        : ((startIdx - i) % total + total) % total;
      const line = buffer.getLine(idx);
      if (!line) continue;
      const lineText = line.translateToString();
      if (filterRe && !filterRe.test(lineText)) continue;
      const m = primaryRe.exec(lineText);
      if (m) {
        const col = m.index;
        searchPosRef.current = idx;
        term.select(idx - buffer.baseY, col, text.length);
        term.scrollToLine(idx - buffer.baseY);
        return;
      }
    }
  }, []);

  const findNext = useCallback(() => {
    const state = searchStateRef.current;
    if (state.filterText.trim() || !searchAddonRef.current) {
      bufferSearch(true);
    } else {
      searchAddonRef.current!.findNext(state.text, { caseSensitive: state.caseSensitive, incremental: false });
    }
  }, [bufferSearch]);

  const findPrevious = useCallback(() => {
    const state = searchStateRef.current;
    if (state.filterText.trim() || !searchAddonRef.current) {
      bufferSearch(false);
    } else {
      searchAddonRef.current!.findPrevious(state.text, { caseSensitive: state.caseSensitive, incremental: false });
    }
  }, [bufferSearch]);

  const doSearch = useCallback((text: string, filter: string, caseSensitive: boolean) => {
    searchStateRef.current = { text, caseSensitive, filterText: filter };
    searchPosRef.current = -1;
    if (!text.trim()) return;
    if (filter.trim()) {
      bufferSearch(true);
    } else {
      try { searchAddonRef.current?.findNext(text, { caseSensitive, incremental: false }); } catch { /* ignore */ }
    }
  }, [bufferSearch]);

  const handleSearchInput = useCallback((value: string) => {
    setSearchText(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      doSearch(value, searchStateRef.current.filterText, searchStateRef.current.caseSensitive);
    }, 150);
  }, [doSearch]);

  const handleFilterInput = useCallback((value: string) => {
    setFilterText(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      doSearch(searchStateRef.current.text, value, searchStateRef.current.caseSensitive);
    }, 150);
  }, [doSearch]);

  const toggleSearchCase = useCallback(() => {
    const next = !searchStateRef.current.caseSensitive;
    setSearchCaseSensitive(next);
    searchStateRef.current.caseSensitive = next;
    doSearch(searchStateRef.current.text, searchStateRef.current.filterText, next);
  }, [doSearch]);

  const toggleFilter = useCallback(() => {
    setFilterEnabled((prev) => {
      if (prev) {
        setFilterText('');
        doSearch(searchStateRef.current.text, '', searchStateRef.current.caseSensitive);
      }
      return !prev;
    });
    setTimeout(() => filterInputRef.current?.focus(), 50);
  }, [doSearch]);

  const openSearch = useCallback(() => {
    setSearchVisible(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchText('');
    setSearchCaseSensitive(false);
    setFilterEnabled(false);
    setFilterText('');
    searchPosRef.current = -1;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    try { searchAddonRef.current?.findNext(''); } catch { /* ignore */ }
  }, []);

  // 监听 Ctrl+F 快捷键（全局快捷键可能被终端 textarea 拦截，所以在此额外监听）
  useEffect(() => {
    const handler = () => {
      if (isActive) openSearch();
    };
    window.addEventListener('qserial:open-search', handler);
    return () => window.removeEventListener('qserial:open-search', handler);
  }, [isActive, openSearch]);

  // 开始实时日志记录
  const handleStartLog = async () => {
    setLogStarting(true);
    try {
      const defaultName = session
        ? `${session.connectionType}-log-${new Date().toISOString().slice(0, 10)}.txt`
        : `terminal-log-${new Date().toISOString().slice(0, 10)}.txt`;

      const filePath = await window.qserial.log.pickFile(defaultName);
      if (!filePath) {
        setLogStarting(false);
        return;
      }

      await window.qserial.log.start(sessionId, filePath);
      startLog(sessionId, filePath);
    } catch (error) {
      console.error('Failed to start log:', error);
      globalError.show('启动日志记录失败: ' + (error as Error).message);
    }
    setLogStarting(false);
  };

  // 停止日志记录
  const handleStopLog = async () => {
    try {
      await window.qserial.log.stop(sessionId);
      stopLog(sessionId);
    } catch (error) {
      console.error('Failed to stop log:', error);
    }
  };

  // 手动重连
  const handleReconnect = useCallback(async () => {
    if (reconnectLoading) return;
    setReconnectLoading(true);
    try {
      await window.qserial.connection.open(connectionId);
    } catch (error) {
      console.error('Failed to reconnect:', error);
      globalError.show('重连失败: ' + (error as Error).message);
    } finally {
      setReconnectLoading(false);
    }
  }, [connectionId, reconnectLoading]);

  const macroStore = useTerminalMacroStore;
  const { startRecording, stopRecording, saveMacro, addStep } = useTerminalMacroStore.getState();
  const handleStartRecord = useCallback(() => { startRecording(); setIsRecording(true); }, [startRecording]);
  const handleStopRecord = useCallback(() => { stopRecording(); setIsRecording(false); setShowMacroSave(true); setMacroDesc(''); setMacroColor(''); }, [stopRecording]);
  const handleSaveMacro = useCallback(() => { if (!macroName.trim()) return; const colorObj = PRESET_MACRO_COLORS.find(c => c.value === macroColor); const saved = saveMacro(macroName.trim(), macroDesc.trim() || undefined, macroColor || undefined, colorObj?.textColor || undefined); setShowMacroSave(false); setMacroName(''); setMacroDesc(''); setMacroColor(''); const qbs = useQuickButtonsStore.getState(); if (qbs.groups.length === 0) { qbs.addGroup('默认分组'); } qbs.addButton(qbs.groups[0].id, { name: saved.name, command: '', macroId: saved.id, description: saved.description, color: saved.color, textColor: saved.textColor }); }, [macroName, macroDesc, macroColor, saveMacro]);

  const isLogging = session?.logEnabled ?? false;
  const isConnected = session?.connectionState === ConnectionState.CONNECTED;
  const isReconnecting = session?.connectionState === ConnectionState.RECONNECTING;
  const isDisconnected = session?.connectionState === ConnectionState.DISCONNECTED;
  const isError = session?.connectionState === ConnectionState.ERROR;
  const isConnectionActive = isConnected || isReconnecting;
  // 所有活跃连接都可共享（排除本身就是共享服务端的连接）
  // 重连中的连接也保持可共享状态，共享服务会在源连接恢复后自动继续
  const canShare = isConnectionActive && session?.connectionType !== ConnectionType.CONNECTION_SERVER && session?.connectionType !== ConnectionType.SERIAL_SERVER;

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        visibility: isActive ? 'visible' : 'hidden',
      }}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    >
      {/* 控制按钮组 */}
      {isActive && (
        <div className="absolute top-2 right-2 z-10 flex gap-2">
          {/* 搜索栏 / 搜索按钮 */}
          {searchVisible ? (
            <div className="flex flex-col bg-surface/90 border border-primary/40 rounded">
              <div className="flex items-center gap-1.5 px-2 py-1">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-primary flex-shrink-0">
                  <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M7.5 7.5L10.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchText}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (e.shiftKey) findPrevious(); else findNext();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      closeSearch();
                    }
                  }}
                  className="bg-transparent text-xs text-text outline-none w-36 placeholder:text-text-tertiary/50"
                  placeholder="搜索..."
                />
                <button
                  onClick={findPrevious}
                  className="text-text-secondary/60 hover:text-text transition-colors p-0.5"
                  title="上一个 (Shift+Enter)"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 7.5L6 4.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button
                  onClick={findNext}
                  className="text-text-secondary/60 hover:text-text transition-colors p-0.5"
                  title="下一个 (Enter)"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button
                  onClick={toggleSearchCase}
                  className={`text-[11px] leading-none px-1 py-0.5 rounded transition-colors ${
                    searchCaseSensitive ? 'bg-primary/30 text-primary' : 'text-text-secondary/50 hover:text-text-secondary'
                  }`}
                  title="大小写敏感"
                >
                  Aa
                </button>
                <button
                  onClick={toggleFilter}
                  className={`p-0.5 rounded transition-colors ${
                    filterEnabled ? 'bg-accent/30 text-accent' : 'text-text-secondary/50 hover:text-text-secondary'
                  }`}
                  title="二次筛选 — 只匹配同时包含筛选词的行"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1 2h10L7 6.5V10l-2 1V6.5L1 2z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button
                  onClick={closeSearch}
                  className="text-text-secondary/50 hover:text-text transition-colors p-0.5"
                  title="关闭 (Esc)"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                </button>
              </div>
              {filterEnabled && (
                <div className="flex items-center gap-1.5 px-2 pb-1 border-t border-border/50">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-accent flex-shrink-0 ml-0.5">
                    <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <input
                    ref={filterInputRef}
                    type="text"
                    value={filterText}
                    onChange={(e) => handleFilterInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (e.shiftKey) findPrevious(); else findNext();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        closeSearch();
                      }
                    }}
                    className="bg-transparent text-xs text-text outline-none w-36 placeholder:text-text-tertiary/50"
                    placeholder="筛选词..."
                  />
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={openSearch}
              className="px-2 py-1 border rounded text-xs transition-colors bg-surface/80 border-border hover:bg-hover flex items-center gap-1.5"
              title="搜索 (Ctrl+F)"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-text-secondary">
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M7.5 7.5L10.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              搜索
            </button>
          )}

          {/* 日志控制按钮 */}
          <button
            onClick={isLogging ? handleStopLog : handleStartLog}
            disabled={logStarting}
            className={`px-2 py-1 border rounded text-xs transition-colors flex items-center gap-1.5 ${
              isLogging
                ? 'bg-red-500/80 border-red-400 text-white hover:bg-red-600/80'
                : 'bg-surface/80 border-border hover:bg-hover'
            }`}
            title={isLogging ? '停止日志记录' : '开始日志记录'}
          >
            {logStarting ? (
              <><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>启动中...</>
            ) : isLogging ? (
              <><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 2.5v7" stroke="currentColor" strokeWidth="0.8"/><path d="M7.5 2.5v7" stroke="currentColor" strokeWidth="0.8"/></svg>停止日志</>
            ) : (
              <><svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-primary"><path d="M2 2.5h6l2 2v6H2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M2 10.5v-8h4l.5 1.5H10" stroke="currentColor" strokeWidth="1.2"/><path d="M4 8l1.5 1.5L8 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>开始日志</>
            )}
          </button>

          {/* 连接共享按钮 - 所有活跃连接可共享 */}
          {canShare && (
            <button
              onClick={() => setShowSerialShareDialog(true)}
              className="px-2 py-1 border rounded text-xs transition-colors bg-surface/80 border-border hover:bg-hover flex items-center gap-1.5"
              title="连接共享"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-accent"><path d="M7 2.5l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 5.5H5a2 2 0 00-2 2v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="3" cy="9.5" r="1.2" stroke="currentColor" strokeWidth="0.8"/></svg>共享
            </button>
          )}

          {/* 宏录制按钮 */}
          <button
            onClick={isRecording ? handleStopRecord : handleStartRecord}
            className={`px-2 py-1 border rounded text-xs transition-colors flex items-center gap-1.5 ${isRecording ? 'bg-red-500/80 border-red-400 text-white hover:bg-red-600/80' : 'bg-surface/80 border-border hover:bg-hover'}`}
            title={isRecording ? '停止录制 (' + macroStore.getState().recordingSteps.length + ' 步)' : '开始录制宏'}
          >
            {isRecording ? (
              <><span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>REC {macroStore.getState().recordingSteps.length > 0 ? '(' + macroStore.getState().recordingSteps.length + ')' : ''}</>
            ) : (
              <><svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-error"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.2"/></svg>录制</>
            )}
          </button>

          {/* 重连按钮 - 手动重连（断开或出错时显示，服务端连接除外） */}
          {(isDisconnected || isError) &&
            session?.connectionType !== ConnectionType.CONNECTION_SERVER &&
            session?.connectionType !== ConnectionType.SERIAL_SERVER && (
            <button
              onClick={handleReconnect}
              disabled={reconnectLoading}
              className={`px-2 py-1 border rounded text-xs transition-colors flex items-center gap-1.5 ${
                reconnectLoading
                  ? 'bg-surface/80 border-border opacity-50'
                  : 'bg-blue-500/80 border-blue-400 text-white hover:bg-blue-600/80'
              }`}
              title="重新连接"
            >
              {reconnectLoading ? (
                <><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>连接中...</>
              ) : (
                <><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 5A4 4 0 019 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M9.5 7A4 4 0 013 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M9 1.5l1.5 2-2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 10.5l-1.5-2 2-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>重连</>
              )}
            </button>
          )}
        </div>
      )}
      {/* 日志文件路径提示 */}
      {isActive && isLogging && session?.logFilePath && (
        <div className="absolute top-10 right-2 z-10 px-2 py-1 bg-success/90 text-white rounded text-xs max-w-[200px] truncate">
          📄 {session.logFilePath.split(/[/\\]/).pop()}
        </div>
      )}

            {/* 宏保存对话框 */}
      {showMacroSave && (
        <div className="dialog-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border/80 rounded-xl shadow-md w-[360px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-medium">保存录制宏</h3>
              <span className="text-xs text-text-secondary">{macroStore.getState().recordingSteps.length} 步</span>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">名称</label>
                <input type="text" value={macroName} onChange={e => setMacroName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveMacro(); else if (e.key === 'Escape') { setShowMacroSave(false); setMacroName(''); setMacroDesc(''); setMacroColor(''); } }} className="dialog-input" placeholder="输入宏名称..." autoFocus />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">描述（可选）</label>
                <input type="text" value={macroDesc} onChange={e => setMacroDesc(e.target.value)} className="dialog-input" placeholder="用途说明..." />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">颜色标记（可选）</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_MACRO_COLORS.map((c) => (
                    <button
                      key={c.value || 'default'}
                      onClick={() => setMacroColor(c.value)}
                      className={`w-5 h-5 rounded border-2 transition-all ${macroColor === c.value ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c.value || '#6B7280' }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowMacroSave(false); setMacroName(''); setMacroDesc(''); setMacroColor(''); }} className="px-3 py-1.5 text-xs rounded border border-border hover:bg-hover">取消</button>
                <button onClick={handleSaveMacro} disabled={!macroName.trim()} className="px-3 py-1.5 text-xs rounded bg-primary text-white disabled:opacity-50">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

{/* 串口共享对话框 */}
      <ConnectionShareDialog
        isOpen={showSerialShareDialog}
        onClose={() => setShowSerialShareDialog(false)}
        defaultSessionId={sessionId}
      />
    </div>
  );
});

TerminalPane.displayName = 'TerminalPane';
