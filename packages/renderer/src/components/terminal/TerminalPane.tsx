/**
 * 终端面板组件
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useTerminalStore } from '@/stores/terminal';
import { useThemeStore } from '@/stores/theme';
import { useConfigStore } from '@/stores/config';
import { base64ToUint8Array, ConnectionType, ConnectionState } from '@qserial/shared';
import 'xterm/css/xterm.css';

import { ConnectionShareDialog } from '../dialogs/ConnectionShareDialog';

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
  const isComposingRef = useRef(false);
  const compositionDataRef = useRef<string>('');
  const [logStarting, setLogStarting] = useState(false);
  const initializedRef = useRef(false);
  const [showSerialShareDialog, setShowSerialShareDialog] = useState(false);

  const terminalState = useTerminalStore();
  const updateSessionSize = terminalState?.updateSessionSize;
  const updateSessionState = terminalState?.updateSessionState;
  const sessions = terminalState?.sessions || {};
  const startLog = terminalState?.startLog;
  const stopLog = terminalState?.stopLog;
  const { currentTheme } = useThemeStore();
  const { config } = useConfigStore();

  // 使用 ref 存储最新的 sessions，避免闭包问题
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

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

    const xterm = new XTerm({
      theme: currentTheme.xterm,
      fontFamily: config.terminal.fontFamily,
      fontSize: config.terminal.fontSize,
      cursorBlink: true,
      scrollback: config.terminal.scrollback,
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

      const container = containerRef.current;

      try {
        xterm.open(container);
      } catch (e) {
        console.error('Failed to open terminal:', e);
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
        // 阻止默认行为，通过 onData 事件处理粘贴
        return false;
      }
      return true;
    });

    // 用户输入（包括粘贴）
    xterm.onData((data) => {
      // 如果在 composition 过程中，不发送数据
      if (isComposingRef.current) {
        return;
      }
      // 如果数据与 composition 结束时的数据相同，发送后清空标记
      if (data === compositionDataRef.current) {
        window.qserial.connection.write(connectionId, data);
        compositionDataRef.current = ''; // 清空标记，防止重复
        return;
      }
      window.qserial.connection.write(connectionId, data);
    });

    // 监听后端数据
    const unsubscribeData = window.qserial.connection.onData(
      connectionId,
      (base64Data: string) => {
        try {
          const data = base64ToUint8Array(base64Data);
          // 直接写入 Uint8Array，避免 TextDecoder 对非 UTF-8 数据解码产生无效字符
          xterm.write(data);

          // 实时写入日志（日志需要文本）
          const currentSession = sessionsRef.current[sessionId];
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
        console.log('[TerminalPane] State changed:', state);
        updateSessionState(sessionId, state as any);

        if (state === 'connected') {
          const currentSession = sessionsRef.current[sessionId];
          if (currentSession?.connectionType === ConnectionType.SERIAL) {
            showConnectionSuccessMessage(xterm);
          } else if (currentSession?.connectionType === ConnectionType.SSH ||
                     currentSession?.connectionType === ConnectionType.TELNET) {
            xterm.write('\r\n\x1b[32m--- 连接已恢复 ---\x1b[0m\r\n');
          }
        } else if (state === 'disconnected') {
          // 断开连接时重置标志，以便下次连接时可以再次显示
          messageShownRef.current = false;
        } else if (state === 'reconnecting') {
          xterm.write('\r\n\x1b[33m--- 连接已断开，正在重连... ---\x1b[0m\r\n');
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
  }, [isActive]);

  // 开始实时日志记录
  const handleStartLog = async () => {
    setLogStarting(true);
    try {
      const session = sessions[sessionId];
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
      alert('启动日志记录失败: ' + (error as Error).message);
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

  const session = sessions[sessionId];
  const isLogging = session?.logEnabled ?? false;
  const isConnected = session?.connectionState === ConnectionState.CONNECTED;
  const isReconnecting = session?.connectionState === ConnectionState.RECONNECTING;
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
          {/* 日志控制按钮 */}
          <button
            onClick={isLogging ? handleStopLog : handleStartLog}
            disabled={logStarting}
            className={`px-2 py-1 border rounded text-xs transition-colors ${
              isLogging
                ? 'bg-red-500/80 border-red-400 text-white hover:bg-red-600/80'
                : 'bg-surface/80 border-border hover:bg-hover'
            }`}
            title={isLogging ? '停止日志记录' : '开始日志记录'}
          >
            {logStarting ? '⏳ 启动中...' : isLogging ? '⏹ 停止日志' : '📝 开始日志'}
          </button>

          {/* 连接共享按钮 - 所有活跃连接可共享 */}
          {canShare && (
            <button
              onClick={() => setShowSerialShareDialog(true)}
              className="px-2 py-1 border rounded text-xs transition-colors bg-surface/80 border-border hover:bg-hover"
              title="连接共享"
            >
              🔗 共享
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

      {/* 串口共享对话框 */}
      <ConnectionShareDialog
        isOpen={showSerialShareDialog}
        onClose={() => setShowSerialShareDialog(false)}
        defaultSessionId={sessionId}
      />
    </div>
  );
};
