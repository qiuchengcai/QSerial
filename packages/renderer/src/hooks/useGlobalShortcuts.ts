/**
 * 全局快捷键注册 — 在 Layout 中调用一次即可
 */

import { useEffect } from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { useQuickButtonsStore } from '@/stores/quickButtons';
import { useSftpStore } from '@/stores/sftp';
import { useConfigStore } from '@/stores/config';

function dispatch(event: string) {
  window.dispatchEvent(new CustomEvent(event));
}

export function useGlobalShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // Ctrl+N — 新建本地终端
      if (ctrl && !shift && e.key === 'n') {
        e.preventDefault();
        dispatch('qserial:open-pty');
        return;
      }

      // Ctrl+Shift+N — 新建串口
      if (ctrl && shift && e.key === 'N') {
        e.preventDefault();
        dispatch('qserial:open-serial');
        return;
      }

      // Ctrl+Shift+S — 新建 SSH
      if (ctrl && shift && e.key === 'S') {
        e.preventDefault();
        dispatch('qserial:open-ssh');
        return;
      }

      // Ctrl+T — 新建标签 (打开 PTY)
      if (ctrl && !shift && e.key === 't') {
        e.preventDefault();
        dispatch('qserial:open-pty');
        return;
      }

      // Ctrl+W — 关闭当前标签
      if (ctrl && !shift && e.key === 'w') {
        e.preventDefault();
        const { activeTabId, closeTab } = useTerminalStore.getState();
        if (activeTabId) closeTab(activeTabId);
        return;
      }

      // Ctrl+Shift+W — 关闭所有标签
      if (ctrl && shift && e.key === 'W') {
        e.preventDefault();
        const { tabs, closeTab } = useTerminalStore.getState();
        for (let i = tabs.length - 1; i >= 0; i--) {
          closeTab(tabs[i].id);
        }
        return;
      }

      // Ctrl+B — 切换侧边栏
      if (ctrl && !shift && e.key === 'b') {
        e.preventDefault();
        dispatch('qserial:toggle-sidebar');
        return;
      }

      // Ctrl+Shift+B — 切换快捷按钮方向
      if (ctrl && shift && e.key === 'B') {
        e.preventDefault();
        const d = useQuickButtonsStore.getState().direction;
        useQuickButtonsStore.getState().setDirection(d === 'horizontal' ? 'vertical' : 'horizontal');
        return;
      }

      // Ctrl+, — 打开设置
      if (ctrl && !shift && e.key === ',') {
        e.preventDefault();
        dispatch('qserial:open-settings');
        return;
      }

      // Ctrl+D — 断开当前连接
      if (ctrl && !shift && e.key === 'd') {
        e.preventDefault();
        const { tabs, activeTabId, sessions } = useTerminalStore.getState();
        const activeTab = tabs.find((t) => t.id === activeTabId);
        const activeSession = activeTab?.activeSessionId ? sessions[activeTab.activeSessionId] : null;
        if (activeSession?.connectionId) {
          window.qserial.connection.close(activeSession.connectionId).catch(() => {});
        }
        return;
      }

      // Ctrl+R — 重连
      if (ctrl && !shift && e.key === 'r') {
        e.preventDefault();
        const { tabs, activeTabId, sessions } = useTerminalStore.getState();
        const activeTab = tabs.find((t) => t.id === activeTabId);
        const activeSession = activeTab?.activeSessionId ? sessions[activeTab.activeSessionId] : null;
        if (activeSession?.connectionId) {
          window.qserial.connection.open(activeSession.connectionId).catch(() => {});
        }
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — 切换标签
      if (ctrl && !shift && e.key === 'Tab') {
        e.preventDefault();
        const { tabs, activeTabId, setActiveTab } = useTerminalStore.getState();
        const idx = tabs.findIndex((t: { id: string }) => t.id === activeTabId);
        if (tabs.length > 0) {
          setActiveTab(tabs[(idx + 1) % tabs.length].id);
        }
        return;
      }

      // Ctrl+= / Ctrl+- — 字体缩放
      if (ctrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const { config, updateConfig } = useConfigStore.getState();
        const newSize = Math.min(config.terminal.fontSize + 1, 24);
        updateConfig('terminal', { ...config.terminal, fontSize: newSize });
        return;
      }
      if (ctrl && e.key === '-') {
        e.preventDefault();
        const { config, updateConfig } = useConfigStore.getState();
        const newSize = Math.max(config.terminal.fontSize - 1, 10);
        updateConfig('terminal', { ...config.terminal, fontSize: newSize });
        return;
      }

      // F5 — 刷新 SFTP
      if (e.key === 'F5') {
        const { activeSftpId, refresh } = useSftpStore.getState();
        if (activeSftpId) {
          e.preventDefault();
          refresh(activeSftpId);
        }
        return;
      }

      // Ctrl+1~9 — 切换标签
      if (ctrl && !shift && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        const { tabs, setActiveTab } = useTerminalStore.getState();
        if (tabs[idx]) setActiveTab(tabs[idx].id);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
