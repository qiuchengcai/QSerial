/**
 * 布局组件
 */

import React, { useEffect } from 'react';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { MenuBar } from './MenuBar';
import type { MenuItem } from './MenuBar';
import { QuickButtonBar } from '../terminal/QuickButtonBar';
import { useQuickButtonsStore } from '@/stores/quickButtons';
import { useThemeStore } from '../../stores/theme';
import { useTerminalStore } from '../../stores/terminal';
import { useTftpStore } from '../../stores/tftp';
import { useSftpStore } from '../../stores/sftp';
import { useConfigStore } from '../../stores/config';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { ErrorToast, useGlobalError } from '../common/ErrorToast';
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts';
import { ConnectionState } from '@qserial/shared';
import type { TftpTransferEvent } from '@qserial/shared';

function dispatch(event: string) {
  window.dispatchEvent(new CustomEvent(event));
}

export const Layout: React.FC = () => {
  const { currentTheme } = useThemeStore();
  const hasTexture = Boolean(currentTheme.ui.texture);
  const [showSettings, setShowSettings] = React.useState(false);
  const quickButtonsState = useQuickButtonsStore();
  const isVertical = quickButtonsState?.direction === 'vertical';
  const { errorMessage, dismiss } = useGlobalError();

  // 获取当前活动会话用于菜单项状态
  const terminalState = useTerminalStore();
  const tabs = terminalState?.tabs || [];
  const activeTabId = terminalState?.activeTabId;
  const sessions = terminalState?.sessions || {};
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeSession = activeTab?.activeSessionId ? sessions[activeTab.activeSessionId] : null;
  const isConnected = activeSession?.connectionState === ConnectionState.CONNECTED;
  const isConnecting = activeSession?.connectionState === ConnectionState.CONNECTING;
  const isDisconnected = activeSession?.connectionState === ConnectionState.DISCONNECTED;
  const isError = activeSession?.connectionState === ConnectionState.ERROR;
  const isSshConnected = activeSession?.connectionType === 'ssh' && isConnected;
  const isLogging = activeSession?.logEnabled ?? false;
  const { config } = useConfigStore();

  // 菜单定义
  const menuItems: Array<{ label: string; items: MenuItem[] }> = [
    {
      label: '文件(&F)',
      items: [
        { label: '新建本地终端(&L)', shortcut: 'Ctrl+N', action: () => dispatch('qserial:open-pty') },
        { label: '新建串口连接(&S)', shortcut: 'Ctrl+Shift+N', action: () => dispatch('qserial:open-serial') },
        { label: '新建 SSH 连接(&H)', shortcut: 'Ctrl+Shift+S', action: () => dispatch('qserial:open-ssh') },
        { label: '新建 Telnet 连接(&T)', action: () => dispatch('qserial:open-telnet') },
        { separator: true },
        { label: '开始日志记录(&G)', enabled: !!activeSession && !isLogging, action: () => dispatch('qserial:start-log') },
        { label: '停止日志记录(&P)', enabled: !!activeSession && isLogging, action: () => dispatch('qserial:stop-log') },
        { separator: true },
        { label: '导入配置(&I)', shortcut: 'Ctrl+Shift+I', action: () => { setShowSettings(true); setTimeout(() => document.getElementById('settings-import-btn')?.click(), 100); } },
        { label: '导出配置(&E)', shortcut: 'Ctrl+Shift+E', action: () => { setShowSettings(true); setTimeout(() => document.getElementById('settings-export-btn')?.click(), 100); } },
        { separator: true },
        { label: '退出(&X)', shortcut: 'Alt+F4', action: () => window.qserial.window.close() },
      ],
    },
    {
      label: '编辑(&E)',
      items: [
        { label: '复制(&C)', shortcut: 'Ctrl+Shift+C', enabled: !!activeSession, action: () => { /* xterm 标准行为 */ } },
        { label: '粘贴(&P)', shortcut: 'Ctrl+Shift+V', enabled: !!activeSession && isConnected, action: () => { /* xterm 标准行为 */ } },
        { separator: true },
        { label: '查找(&F)', shortcut: 'Ctrl+Shift+F', enabled: !!activeSession, action: () => dispatch('qserial:search') },
        { label: '清空缓冲区(&L)', enabled: !!activeSession, action: () => dispatch('qserial:clear-buffer') },
        { separator: true },
        { label: '管理快捷按钮(&B)', action: () => dispatch('qserial:manage-buttons') },
      ],
    },
    {
      label: '视图(&V)',
      items: [
        { label: '显示/隐藏侧边栏(&B)', shortcut: 'Ctrl+B', action: () => dispatch('qserial:toggle-sidebar') },
        { label: '快捷按钮方向(&D)', shortcut: 'Ctrl+Shift+B', action: () => {
          const d = useQuickButtonsStore.getState().direction;
          useQuickButtonsStore.getState().setDirection(d === 'horizontal' ? 'vertical' : 'horizontal');
        }},
        { separator: true },
        { label: '增大字体(+)', shortcut: 'Ctrl+=', action: () => {
          const newSize = Math.min(config.terminal.fontSize + 1, 24);
          useConfigStore.getState().updateConfig('terminal', { ...config.terminal, fontSize: newSize });
        }},
        { label: '减小字体(-)', shortcut: 'Ctrl+-', action: () => {
          const newSize = Math.max(config.terminal.fontSize - 1, 10);
          useConfigStore.getState().updateConfig('terminal', { ...config.terminal, fontSize: newSize });
        }},
        { separator: true },
        { label: '进入全屏(&F)', shortcut: 'F11', action: () => dispatch('qserial:fullscreen') },
        { separator: true },
        { label: '开发者工具(&D)', shortcut: 'Ctrl+Shift+I', action: () => dispatch('qserial:devtools') },
      ],
    },
    {
      label: '连接(&C)',
      items: [
        { label: '断开当前连接(&D)', shortcut: 'Ctrl+D', enabled: isConnected || isConnecting, action: () => dispatch('qserial:disconnect') },
        { label: '重连(&R)', shortcut: 'Ctrl+R', enabled: isDisconnected || isError, action: () => dispatch('qserial:reconnect') },
        { separator: true },
        { label: '连接共享(&S)', enabled: isConnected, action: () => dispatch('qserial:open-share') },
        { label: 'MCP AI 服务器(&M)', shortcut: 'Ctrl+Shift+M', action: () => dispatch('qserial:open-mcp') },
        { separator: true },
        { label: 'SFTP 文件浏览器(&F)', enabled: isSshConnected, action: () => {
          if (isSshConnected && activeSession) {
            const sftpStore = useSftpStore.getState();
            const existingSession = Object.values(sftpStore.sessions).find(
              (s) => s.connectionId === activeSession.connectionId
            );
            if (existingSession) {
              sftpStore.setPanelVisible(true);
              sftpStore.setActiveSession(existingSession.sftpId);
            } else {
              sftpStore.createSession(activeSession.connectionId);
            }
          }
        }},
      ],
    },
    {
      label: '服务(&v)',
      items: [
        { label: 'TFTP 服务器(&T)', action: () => dispatch('qserial:open-tftp') },
        { label: 'FTP 服务器(&F)', action: () => dispatch('qserial:open-ftp') },
        { label: 'NFS 服务器(&N)', action: () => dispatch('qserial:open-nfs') },
        { separator: true },
        { label: 'MCP AI 服务器(&M)', shortcut: 'Ctrl+Shift+M', action: () => dispatch('qserial:open-mcp') },
      ],
    },
    {
      label: '设置(&t)',
      items: [
        { label: '打开设置(&O)', shortcut: 'Ctrl+,', action: () => setShowSettings(true) },
      ],
    },
    {
      label: '帮助(&H)',
      items: [
        { label: 'QSerial 帮助(&H)', shortcut: 'F1', action: () => dispatch('qserial:help') },
        { label: 'AI 使用指南(&A)', action: () => dispatch('qserial:open-mcp') },
        { separator: true },
        { label: '关于 QSerial(&A)', action: () => dispatch('qserial:about') },
      ],
    },
  ];

  // 全局快捷键
  useGlobalShortcuts();

  // 监听设置对话框事件
  useEffect(() => {
    const handler = () => setShowSettings(true);
    window.addEventListener('qserial:open-settings', handler);
    return () => window.removeEventListener('qserial:open-settings', handler);
  }, []);

  // 全局监听 TFTP 状态和传输事件
  useEffect(() => {
    if (!window.qserial?.tftp) return;
    const unsubStatus = window.qserial.tftp.onStatusChange((event) => {
      if (event.running) {
        useTftpStore.getState().setRunning(true);
      } else {
        useTftpStore.getState().setError(event.error);
      }
    });
    const unsubTransfer = window.qserial.tftp.onTransfer((event) => {
      useTftpStore.getState().handleTransferEvent(event as TftpTransferEvent);
    });
    return () => {
      unsubStatus();
      unsubTransfer();
    };
  }, []);

  return (
    <div className={`h-screen flex flex-col bg-background overflow-hidden ${hasTexture ? 'has-texture' : ''}`}>
      {/* 标题栏 */}
      <TitleBar />

      {/* 菜单栏 */}
      <MenuBar menus={menuItems} />

      {/* 主内容区 */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* 侧边栏 */}
        <Sidebar />

        {/* 终端区域 */}
        <MainContent />

        {/* 垂直模式的快捷按钮面板 */}
        {isVertical && (
          <div className="flex flex-col border-l border-border bg-surface flex-shrink-0" style={{ width: 'var(--buttonbar-width, 140px)' }}>
            <div className="h-[var(--buttonbar-height)] flex items-center gap-2 px-2 border-b border-border flex-shrink-0">
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 hover:bg-hover rounded-md px-1.5 py-0.5 transition-colors group"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-secondary group-hover:text-text flex-shrink-0">
                  <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M13.3 10a1.1 1.1 0 00.2 1.2l.04.04a1.35 1.35 0 11-1.9 1.9l-.04-.04a1.1 1.1 0 00-1.2-.2 1.1 1.1 0 00-.67 1.01v.11a1.35 1.35 0 11-2.7 0v-.06a1.1 1.1 0 00-.72-1.01 1.1 1.1 0 00-1.2.2l-.04.04a1.35 1.35 0 11-1.9-1.9l.04-.04a1.1 1.1 0 00.2-1.2 1.1 1.1 0 00-1.01-.67h-.11a1.35 1.35 0 110-2.7h.06a1.1 1.1 0 001.01-.72 1.1 1.1 0 00-.2-1.2l-.04-.04a1.35 1.35 0 111.9-1.9l.04.04a1.1 1.1 0 001.2.2h.05a1.1 1.1 0 00.67-1.01v-.11a1.35 1.35 0 012.7 0v.06a1.1 1.1 0 00.72 1.01 1.1 1.1 0 001.2-.2l.04-.04a1.35 1.35 0 111.9 1.9l-.04.04a1.1 1.1 0 00-.2 1.2v.05a1.1 1.1 0 001.01.67h.11a1.35 1.35 0 010 2.7h-.06a1.1 1.1 0 00-1.01.72z" stroke="currentColor" strokeWidth="1" />
                </svg>
                <span className="text-xs text-text-secondary group-hover:text-text">设置</span>
              </button>
            </div>
            <QuickButtonBar direction="vertical" />
          </div>
        )}
      </div>

      {/* 底部栏：设置 + 快捷按钮（仅水平模式） */}
      {!isVertical && (
        <div className="flex items-center border-t border-border bg-surface flex-shrink-0">
          <button
            onClick={() => setShowSettings(true)}
            className="flex-shrink-0 w-[var(--sidebar-width)] h-[var(--buttonbar-height)] flex items-center gap-2 px-3 border-r border-border hover:bg-hover transition-colors group"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-secondary group-hover:text-text flex-shrink-0">
              <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M13.3 10a1.1 1.1 0 00.2 1.2l.04.04a1.35 1.35 0 11-1.9 1.9l-.04-.04a1.1 1.1 0 00-1.2-.2 1.1 1.1 0 00-.67 1.01v.11a1.35 1.35 0 11-2.7 0v-.06a1.1 1.1 0 00-.72-1.01 1.1 1.1 0 00-1.2.2l-.04.04a1.35 1.35 0 11-1.9-1.9l.04-.04a1.1 1.1 0 00.2-1.2 1.1 1.1 0 00-1.01-.67h-.11a1.35 1.35 0 110-2.7h.06a1.1 1.1 0 001.01-.72 1.1 1.1 0 00-.2-1.2l-.04-.04a1.35 1.35 0 111.9-1.9l.04.04a1.1 1.1 0 001.2.2h.05a1.1 1.1 0 00.67-1.01v-.11a1.35 1.35 0 012.7 0v.06a1.1 1.1 0 00.72 1.01 1.1 1.1 0 001.2-.2l.04-.04a1.35 1.35 0 111.9 1.9l-.04.04a1.1 1.1 0 00-.2 1.2v.05a1.1 1.1 0 001.01.67h.11a1.35 1.35 0 010 2.7h-.06a1.1 1.1 0 00-1.01.72z" stroke="currentColor" strokeWidth="1" />
            </svg>
            <span className="text-xs text-text-secondary group-hover:text-text">设置</span>
          </button>
          <QuickButtonBar direction="horizontal" />
        </div>
      )}

      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      <ErrorToast message={errorMessage} onDismiss={dismiss} />
    </div>
  );
};
