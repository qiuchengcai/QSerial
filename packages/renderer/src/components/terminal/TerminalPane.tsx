/**
 * 终端面板组件
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useTerminalStore } from '@/stores/terminal';
import { useThemeStore } from '@/stores/theme';
import { base64ToUint8Array, ConnectionType } from '@qserial/shared';
import 'xterm/css/xterm.css';

interface TerminalPaneProps {
  sessionId: string;
  connectionId: string;
  isActive: boolean;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  sessionId,
  connectionId,
  isActive,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unsubscribersRef = useRef<(() => void)[]>([]);
  const messageShownRef = useRef(false);
  const [containerReady, setContainerReady] = useState(false);

  const { updateSessionSize, updateSessionState, sessions } = useTerminalStore();
  const { currentTheme } = useThemeStore();

  // 使用 ref 存储最新的 sessions，避免闭包问题
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // 检测容器是否准备好
  useEffect(() => {
    if (!containerRef.current || !isActive) return;

    const checkReady = () => {
      if (containerRef.current &&
          containerRef.current.offsetWidth > 0 &&
          containerRef.current.offsetHeight > 0) {
        setContainerReady(true);
      }
    };

    const timer = setTimeout(checkReady, 50);

    const resizeObserver = new ResizeObserver(() => {
      checkReady();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, [isActive]);

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

  // 初始化终端
  useEffect(() => {
    if (!containerReady || !containerRef.current) return;

    const container = containerRef.current;

    // 如果已经有终端实例，先清理
    if (xtermRef.current) {
      try {
        xtermRef.current.dispose();
      } catch {
        // 忽略 dispose 错误
      }
      xtermRef.current = null;
    }

    const xterm = new XTerm({
      theme: currentTheme.xterm,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // 显示连接成功消息的函数
    const showConnectionSuccessMessage = (terminal: XTerm) => {
      // 防止重复显示
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

    // 使用 requestAnimationFrame 确保 DOM 完全准备好
    requestAnimationFrame(() => {
      if (!xtermRef.current || !containerRef.current) return;

      try {
        xterm.open(container);
      } catch (e) {
        console.error('Failed to open terminal:', e);
        return;
      }

      // 多次延迟调整尺寸，确保布局稳定
      const resizeMultiple = () => {
        resizeTerminal();
        setTimeout(resizeTerminal, 50);
        setTimeout(resizeTerminal, 100);
        setTimeout(resizeTerminal, 200);
        setTimeout(resizeTerminal, 500);
      };

      // 延迟初始化后调整尺寸
      setTimeout(async () => {
        resizeMultiple();

        // 主动查询当前连接状态（因为可能错过了 connected 事件）
        try {
          const { state } = await window.qserial.connection.getState(connectionId);
          console.log('[TerminalPane] Queried state:', state);

          // 更新 session 状态
          updateSessionState(sessionId, state as any);

          if (state === 'connected') {
            const session = sessionsRef.current[sessionId];
            console.log('[TerminalPane] Session connectionType:', session?.connectionType);
            if (session?.connectionType === ConnectionType.SERIAL) {
              console.log('[TerminalPane] Showing connection success message!');
              showConnectionSuccessMessage(xterm);
            }
          }
        } catch (err) {
          console.error('[TerminalPane] Failed to get state:', err);
        }
      }, 50);
    });

    // 添加复制粘贴支持
    xterm.attachCustomKeyEventHandler((event) => {
      if (event.ctrlKey && event.key === 'c') {
        const selection = xterm.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          return false;
        }
        return true;
      }
      if (event.ctrlKey && event.key === 'v') {
        navigator.clipboard.readText().then((text) => {
          window.qserial.connection.write(connectionId, text);
        });
        return false;
      }
      return true;
    });

    // 用户输入
    xterm.onData((data) => {
      window.qserial.connection.write(connectionId, data);
    });

    // 监听后端数据
    const unsubscribeData = window.qserial.connection.onData(
      connectionId,
      (base64Data: string) => {
        try {
          const data = base64ToUint8Array(base64Data);
          const decoder = new TextDecoder();
          const text = decoder.decode(data);
          xterm.write(text);
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
        console.log('[TerminalPane] State changed:', state);
        updateSessionState(sessionId, state as any);

        if (state === 'connected') {
          const currentSession = sessionsRef.current[sessionId];
          if (currentSession?.connectionType === ConnectionType.SERIAL) {
            showConnectionSuccessMessage(xterm);
          }
        } else if (state === 'disconnected') {
          // 断开连接时重置标志，以便下次连接时可以再次显示
          messageShownRef.current = false;
        }
      }
    );
    unsubscribersRef.current.push(unsubscribeState);

    // 监听连接错误
    const unsubscribeError = window.qserial.connection.onError(
      connectionId,
      (error: string) => {
        console.error('[TerminalPane] Connection error:', error);
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
      resizeObserver.disconnect();
      unsubscribersRef.current.forEach((unsub) => unsub());
      unsubscribersRef.current = [];
      try {
        xterm.dispose();
      } catch {
        // 忽略 dispose 错误
      }
      xtermRef.current = null;
    };
  }, [connectionId, sessionId, updateSessionSize, updateSessionState, containerReady, currentTheme.xterm, resizeTerminal]);

  // 主题变化
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = currentTheme.xterm;
    }
  }, [currentTheme]);

  // 激活时聚焦
  useEffect(() => {
    if (isActive && xtermRef.current) {
      xtermRef.current.focus();
    }
  }, [isActive]);

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
        display: isActive ? 'block' : 'none',
      }}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    />
  );
};
