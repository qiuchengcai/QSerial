/**
 * 设置对话框组件 — 侧边导航 + 内容双栏布局
 */

import React, { useState, useEffect } from 'react';
import { useThemeStore } from '@/stores/theme';
import { useConfigStore } from '@/stores/config';
import { useSavedSessionsStore, type SavedSession } from '@/stores/sessions';
import { useQuickButtonsStore } from '@/stores/quickButtons';
import { useTftpStore } from '@/stores/tftp';
import type { AppConfig, Theme } from '@qserial/shared';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ExportedConfig {
  version: string;
  exportedAt: string;
  theme: { themeId: string };
  config: AppConfig;
  sessions: unknown[];
  quickButtons: unknown[];
  tftp: { port: number; rootDir: string };
}

type SectionId = 'appearance' | 'behavior' | 'terminal' | 'serial' | 'ssh' | 'share' | 'mcp' | 'tftp' | 'window' | 'manage';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'appearance', label: '外观' },
  { id: 'behavior', label: '应用行为' },
  { id: 'terminal', label: '终端' },
  { id: 'serial', label: '串口' },
  { id: 'ssh', label: 'SSH' },
  { id: 'share', label: '连接共享' },
  { id: 'mcp', label: 'MCP' },
  { id: 'tftp', label: 'TFTP' },
  { id: 'window', label: '窗口' },
  { id: 'manage', label: '配置管理' },
];

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const { currentTheme, themes, setTheme } = useThemeStore();
  const { config, updateConfig } = useConfigStore();
  const savedSessionsState = useSavedSessionsStore();
  const sessions = savedSessionsState?.sessions || [];
  const quickButtonsState = useQuickButtonsStore();
  const groups = quickButtonsState?.groups || [];
  const { config: tftpConfig, updateConfig: updateTftpConfig } = useTftpStore();

  const [activeSection, setActiveSection] = useState<SectionId>('appearance');

  // ── 本地编辑状态 ──
  const [fontSize, setFontSize] = useState(config.terminal.fontSize);
  const [fontFamily, setFontFamily] = useState(config.terminal.fontFamily);
  const [scrollback, setScrollback] = useState(config.terminal.scrollback);
  const [autoReconnect, setAutoReconnect] = useState(config.terminal.autoReconnect);
  const [reconnectInterval, setReconnectInterval] = useState(config.terminal.reconnectInterval);
  const [reconnectAttempts, setReconnectAttempts] = useState(config.terminal.reconnectAttempts);
  const [bellStyle, setBellStyle] = useState(config.terminal.bellStyle);
  const [copyOnSelect, setCopyOnSelect] = useState(config.terminal.copyOnSelect);
  const [rightClickPaste, setRightClickPaste] = useState(config.terminal.rightClickPaste);
  const [enableWebLinks, setEnableWebLinks] = useState(config.terminal.enableWebLinks);

  const [uiFontFamily, setUiFontFamily] = useState(config.app.uiFontFamily);
  const [language, setLanguage] = useState(config.app.language);
  const [autoUpdate, setAutoUpdate] = useState(config.app.autoUpdate);
  const [minimizeToTray, setMinimizeToTray] = useState(config.app.minimizeToTray);
  const [closeToTray, setCloseToTray] = useState(config.app.closeToTray);

  const [defaultBaudRate, setDefaultBaudRate] = useState(config.serial.defaultBaudRate);
  const [defaultDataBits, setDefaultDataBits] = useState(config.serial.defaultDataBits);
  const [defaultStopBits, setDefaultStopBits] = useState(config.serial.defaultStopBits);
  const [defaultParity, setDefaultParity] = useState(config.serial.defaultParity);
  const [showTimestamp, setShowTimestamp] = useState(config.serial.showTimestamp);
  const [hexDisplay, setHexDisplay] = useState(config.serial.hexDisplay);

  const [sshKeepalive, setSshKeepalive] = useState(config.ssh.keepaliveInterval);
  const [sshKeepaliveMax, setSshKeepaliveMax] = useState(config.ssh.keepaliveCountMax);
  const [sshTimeout, setSshTimeout] = useState(config.ssh.readyTimeout);
  const [sshPort, setSshPort] = useState(config.ssh.defaultPort);

  const [sharePort, setSharePort] = useState(config.connectionShare.defaultLocalPort);
  const [shareApiPort, setShareApiPort] = useState(config.connectionShare.defaultApiPort ?? config.connectionShare.defaultLocalPort + 1);
  const [shareAddress, setShareAddress] = useState(config.connectionShare.defaultListenAddress ?? '0.0.0.0');

  const [mcpEnabled, setMcpEnabled] = useState(config.mcp.enabled);
  const [mcpPort, setMcpPort] = useState(config.mcp.port);

  const [tftpPort, setTftpPort] = useState(tftpConfig.port);
  const [tftpRootDir, setTftpRootDir] = useState(tftpConfig.rootDir);

  const [windowMaximized, setWindowMaximized] = useState(config.window.maximized);

  const [importError, setImportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  // 同步 store → local state
  useEffect(() => {
    const c = config;
    setFontSize(c.terminal.fontSize);
    setFontFamily(c.terminal.fontFamily);
    setScrollback(c.terminal.scrollback);
    setAutoReconnect(c.terminal.autoReconnect);
    setReconnectInterval(c.terminal.reconnectInterval);
    setReconnectAttempts(c.terminal.reconnectAttempts);
    setBellStyle(c.terminal.bellStyle);
    setCopyOnSelect(c.terminal.copyOnSelect);
    setRightClickPaste(c.terminal.rightClickPaste);
    setEnableWebLinks(c.terminal.enableWebLinks);
    setUiFontFamily(c.app.uiFontFamily);
    setLanguage(c.app.language);
    setAutoUpdate(c.app.autoUpdate);
    setMinimizeToTray(c.app.minimizeToTray);
    setCloseToTray(c.app.closeToTray);
    setDefaultBaudRate(c.serial.defaultBaudRate);
    setDefaultDataBits(c.serial.defaultDataBits);
    setDefaultStopBits(c.serial.defaultStopBits);
    setDefaultParity(c.serial.defaultParity);
    setShowTimestamp(c.serial.showTimestamp);
    setHexDisplay(c.serial.hexDisplay);
    setSshKeepalive(c.ssh.keepaliveInterval);
    setSshKeepaliveMax(c.ssh.keepaliveCountMax);
    setSshTimeout(c.ssh.readyTimeout);
    setSshPort(c.ssh.defaultPort);
    setSharePort(c.connectionShare.defaultLocalPort);
    setShareApiPort(c.connectionShare.defaultApiPort ?? c.connectionShare.defaultLocalPort + 1);
    setShareAddress(c.connectionShare.defaultListenAddress ?? '0.0.0.0');
    setMcpEnabled(c.mcp.enabled);
    setMcpPort(c.mcp.port);
    setTftpPort(tftpConfig.port);
    setTftpRootDir(tftpConfig.rootDir);
    setWindowMaximized(c.window.maximized);
  }, [config, tftpConfig]);

  if (!isOpen) return null;

  const handleSave = () => {
    updateConfig('terminal', {
      ...config.terminal,
      fontSize, fontFamily, scrollback,
      autoReconnect, reconnectInterval, reconnectAttempts,
      bellStyle, copyOnSelect, rightClickPaste, enableWebLinks,
    });
    updateConfig('app', {
      ...config.app,
      uiFontFamily, language, autoUpdate, minimizeToTray, closeToTray,
    });
    updateConfig('serial', {
      ...config.serial,
      defaultBaudRate, defaultDataBits, defaultStopBits, defaultParity,
      showTimestamp, hexDisplay,
    });
    updateConfig('ssh', {
      ...config.ssh,
      keepaliveInterval: sshKeepalive, keepaliveCountMax: sshKeepaliveMax,
      readyTimeout: sshTimeout, defaultPort: sshPort,
    });
    updateConfig('connectionShare', {
      ...config.connectionShare,
      defaultLocalPort: sharePort, defaultApiPort: shareApiPort, defaultListenAddress: shareAddress,
    });
    updateConfig('mcp', { ...config.mcp, enabled: mcpEnabled, port: mcpPort });
    updateTftpConfig({ port: tftpPort, rootDir: tftpRootDir });
    updateConfig('window', { ...config.window, maximized: windowMaximized });
    onClose();
  };

  const handleExport = async () => {
    try {
      const exportData: ExportedConfig = {
        version: '0.3.0',
        exportedAt: new Date().toISOString(),
        theme: { themeId: currentTheme.id },
        config: config,
        sessions,
        quickButtons: groups,
        tftp: { port: tftpConfig.port, rootDir: tftpConfig.rootDir },
      };
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qserial-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportSuccess(true);
      setImportError(null);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      setImportError(`导出失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleImport = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.version) throw new Error('无效的配置文件');

        if (data.theme?.themeId) setTheme(data.theme.themeId);

        if (data.config) {
          const c = data.config as AppConfig;
          if (c.app) updateConfig('app', { ...config.app, ...c.app });
          if (c.terminal) updateConfig('terminal', { ...config.terminal, ...c.terminal });
          if (c.serial) updateConfig('serial', { ...config.serial, ...c.serial });
          if (c.ssh) updateConfig('ssh', { ...config.ssh, ...c.ssh });
          if (c.connectionShare) updateConfig('connectionShare', { ...config.connectionShare, ...c.connectionShare });
        } else if (data.terminal) {
          updateConfig('terminal', { ...config.terminal, ...data.terminal });
        }

        if (data.quickButtons && Array.isArray(data.quickButtons)) {
          useQuickButtonsStore.getState().importGroups(data.quickButtons);
        }
        if (data.sessions && Array.isArray(data.sessions)) {
          useSavedSessionsStore.getState().importSessions(data.sessions as SavedSession[]);
        }
        if (data.tftp) {
          updateTftpConfig({ port: data.tftp.port, rootDir: data.tftp.rootDir });
        }
        setImportError(null);
      };
      input.click();
    } catch (err) {
      setImportError(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ── 工具组件 ──
  const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
    <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">{title}</h3>
  );

  const Toggle: React.FC<{
    label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
  }> = ({ label, hint, checked, onChange }) => (
    <div className="flex items-center justify-between">
      <div>
        <label className="text-xs font-medium text-text">{label}</label>
        {hint && <p className="text-[11px] text-text-secondary mt-0.5">{hint}</p>}
      </div>
      <button
        type="button" role="switch" aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-[var(--color-primary)]' : 'bg-border'}`}
      >
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[4px]'}`} />
      </button>
    </div>
  );

  const Select: React.FC<{
    label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
  }> = ({ label, value, onChange, options }) => (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="dialog-select">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const NumberInput: React.FC<{
    label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
  }> = ({ label, value, onChange, min, max }) => (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      <input
        type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="dialog-input w-24"
      />
    </div>
  );

  // ── 渲染当前 section 内容 ──
  const renderSection = () => {
    switch (activeSection) {
      case 'appearance':
        return (
          <div className="space-y-4">
            <SectionTitle title="外观" />
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">主题</label>
              <div className="grid grid-cols-2 gap-2">
                {themes.map((theme: Theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setTheme(theme.id)}
                    className={`p-3 rounded-lg border text-left transition-all duration-150 ${
                      currentTheme.id === theme.id
                        ? 'border-primary ring-1 ring-primary/50 bg-primary/5'
                        : 'border-border hover:border-text-secondary/50 hover:bg-hover/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: theme.xterm.background }} />
                      <span className="text-sm font-medium">{theme.name}</span>
                      <span className="text-[10px] text-text-secondary">{theme.type === 'dark' ? '深色' : '浅色'}</span>
                    </div>
                    <div className="flex gap-1">
                      {['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'].map((color) => (
                        <div key={color} className="w-3 h-3 rounded-sm" style={{ backgroundColor: theme.xterm[color as keyof typeof theme.xterm] as string }} />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <Select label="UI 字体" value={uiFontFamily}
              onChange={setUiFontFamily}
              options={[
                { value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', label: '系统默认（推荐）' },
                { value: '"Microsoft YaHei", "PingFang SC", sans-serif', label: '微软雅黑 / 苹方' },
                { value: '"Source Han Sans CN", "Noto Sans SC", sans-serif', label: '思源黑体' },
              ]}
            />
            <Select label="语言" value={language} onChange={setLanguage}
              options={[
                { value: 'zh-CN', label: '简体中文' },
                { value: 'en-US', label: 'English' },
              ]}
            />
          </div>
        );

      case 'behavior':
        return (
          <div className="space-y-4">
            <SectionTitle title="应用行为" />
            <Toggle label="自动更新" checked={autoUpdate} onChange={setAutoUpdate} />
            <Toggle label="最小化到托盘" hint="关闭窗口时隐藏到系统托盘而非退出" checked={minimizeToTray} onChange={setMinimizeToTray} />
            <Toggle label="关闭到托盘" hint="点击关闭按钮时隐藏到托盘" checked={closeToTray} onChange={setCloseToTray} />
          </div>
        );

      case 'terminal':
        return (
          <div className="space-y-4">
            <SectionTitle title="终端" />
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">字体大小: {fontSize}px</label>
              <input type="range" min="10" max="24" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
            </div>
            <Select label="字体" value={fontFamily} onChange={setFontFamily}
              options={[
                { value: 'JetBrains Mono, Consolas, monospace', label: 'JetBrains Mono（推荐）' },
                { value: 'Consolas, monospace', label: 'Consolas' },
                { value: 'Monaco, monospace', label: 'Monaco' },
                { value: 'Source Code Pro, monospace', label: 'Source Code Pro' },
                { value: 'Fira Code, monospace', label: 'Fira Code（连字符）' },
              ]}
            />
            <NumberInput label="回滚行数" value={scrollback} onChange={setScrollback} min={100} max={100000} />
            <Toggle label="选中即复制" checked={copyOnSelect} onChange={setCopyOnSelect} />
            <Toggle label="右键粘贴" checked={rightClickPaste} onChange={setRightClickPaste} />
            <Toggle label="启用链接检测" hint="自动识别终端中的 URL 和文件路径" checked={enableWebLinks} onChange={setEnableWebLinks} />
            <Select label="铃声" value={bellStyle} onChange={setBellStyle}
              options={[{ value: 'none', label: '无' }, { value: 'sound', label: '声音' }, { value: 'visual', label: '闪烁' }]}
            />
            <Toggle label="自动重连" hint="断开后自动尝试重新连接" checked={autoReconnect} onChange={setAutoReconnect} />
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="重连间隔 (ms)" value={reconnectInterval} onChange={setReconnectInterval} min={1000} max={30000} />
              <NumberInput label="最大重连次数" value={reconnectAttempts} onChange={setReconnectAttempts} min={1} max={100} />
            </div>
          </div>
        );

      case 'serial':
        return (
          <div className="space-y-4">
            <SectionTitle title="串口默认参数" />
            <div className="grid grid-cols-2 gap-3">
              <Select label="波特率" value={String(defaultBaudRate)} onChange={(v) => setDefaultBaudRate(Number(v))}
                options={[
                  { value: '9600', label: '9600' }, { value: '19200', label: '19200' },
                  { value: '38400', label: '38400' }, { value: '57600', label: '57600' },
                  { value: '115200', label: '115200' }, { value: '230400', label: '230400' },
                  { value: '460800', label: '460800' }, { value: '921600', label: '921600' },
                ]}
              />
              <Select label="数据位" value={String(defaultDataBits)} onChange={(v) => setDefaultDataBits(Number(v) as 5 | 6 | 7 | 8)}
                options={[{ value: '8', label: '8' }, { value: '7', label: '7' }, { value: '6', label: '6' }, { value: '5', label: '5' }]}
              />
              <Select label="停止位" value={String(defaultStopBits)} onChange={(v) => setDefaultStopBits(Number(v) as 1 | 1.5 | 2)}
                options={[{ value: '1', label: '1' }, { value: '1.5', label: '1.5' }, { value: '2', label: '2' }]}
              />
              <Select label="校验位" value={defaultParity} onChange={(v) => setDefaultParity(v as 'none' | 'even' | 'odd')}
                options={[{ value: 'none', label: '无' }, { value: 'even', label: '偶校验' }, { value: 'odd', label: '奇校验' }]}
              />
            </div>
            <Toggle label="显示时间戳" hint="每行数据前显示接收时间" checked={showTimestamp} onChange={setShowTimestamp} />
            <Toggle label="十六进制显示" hint="以 HEX 格式显示串口数据" checked={hexDisplay} onChange={setHexDisplay} />
          </div>
        );

      case 'ssh':
        return (
          <div className="space-y-4">
            <SectionTitle title="SSH" />
            <NumberInput label="默认端口" value={sshPort} onChange={setSshPort} min={1} max={65535} />
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Keepalive 间隔 (ms)" value={sshKeepalive} onChange={setSshKeepalive} min={5000} max={300000} />
              <NumberInput label="Keepalive 最大次数" value={sshKeepaliveMax} onChange={setSshKeepaliveMax} min={1} max={20} />
            </div>
            <NumberInput label="连接超时 (ms)" value={sshTimeout} onChange={setSshTimeout} min={5000} max={120000} />
          </div>
        );

      case 'share':
        return (
          <div className="space-y-4">
            <SectionTitle title="连接共享" />
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="默认 TCP 端口" value={sharePort} onChange={setSharePort} min={1024} max={65535} />
              <NumberInput label="JSON API 端口" value={shareApiPort} onChange={setShareApiPort} min={1024} max={65535} />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">监听地址</label>
              <select value={shareAddress} onChange={(e) => setShareAddress(e.target.value)} className="dialog-select">
                <option value="0.0.0.0">0.0.0.0 (所有接口 — 局域网可访问)</option>
                <option value="127.0.0.1">127.0.0.1 (仅本机)</option>
              </select>
            </div>
          </div>
        );

      case 'mcp':
        return (
          <div className="space-y-4">
            <SectionTitle title="MCP AI 服务器" />
            <Toggle label="启动时自动启用" hint="应用启动时自动启动 MCP 服务器" checked={mcpEnabled} onChange={setMcpEnabled} />
            <NumberInput label="端口" value={mcpPort} onChange={setMcpPort} min={1024} max={65535} />
            <p className="text-xs text-text-secondary/60">提供 13 个工具，支持 streamableHttp (Claude Code) 和 SSE (CodeBuddy) 双传输方式。</p>
          </div>
        );

      case 'tftp':
        return (
          <div className="space-y-4">
            <SectionTitle title="TFTP 服务器" />
            <NumberInput label="端口" value={tftpPort} onChange={setTftpPort} min={1} max={65535} />
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">根目录</label>
              <div className="flex gap-2">
                <input
                  type="text" value={tftpRootDir} onChange={(e) => setTftpRootDir(e.target.value)}
                  className="dialog-input flex-1" placeholder="选择或输入目录路径"
                />
                <button
                  onClick={async () => {
                    const dir = await window.qserial.dialog.pickDir('选择 TFTP 根目录');
                    if (dir) setTftpRootDir(dir);
                  }}
                  className="dialog-btn dialog-btn-secondary px-3"
                >
                  浏览
                </button>
              </div>
            </div>
          </div>
        );

      case 'window':
        return (
          <div className="space-y-4">
            <SectionTitle title="窗口" />
            <Toggle label="启动时最大化" checked={windowMaximized} onChange={setWindowMaximized} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">默认宽度</label>
                <input type="number" value={config.window.width} disabled className="dialog-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">默认高度</label>
                <input type="number" value={config.window.height} disabled className="dialog-input" />
              </div>
            </div>
            <p className="text-xs text-text-secondary/60">窗口尺寸和位置在关闭时自动保存。</p>
          </div>
        );

      case 'manage':
        return (
          <div className="space-y-4">
            <SectionTitle title="配置管理" />
            <div className="flex gap-2">
              <button onClick={handleExport} id="settings-export-btn" className="dialog-btn dialog-btn-secondary flex-1 flex items-center justify-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                导出配置
              </button>
              <button onClick={handleImport} id="settings-import-btn" className="dialog-btn dialog-btn-secondary flex-1 flex items-center justify-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                导入配置
              </button>
            </div>
            {exportSuccess && (
              <div className="flex items-center gap-2 text-sm text-success bg-success/10 border-l-2 border-success px-3 py-2.5 rounded-r-lg">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="flex-shrink-0"><path d="M7 0a7 7 0 100 14A7 7 0 007 0zm3.03 5.03a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 011.06-1.06L6 7.94l2.97-2.97a.75.75 0 011.06 0z"/></svg>
                配置已导出
              </div>
            )}
            {importError && (
              <div className="flex items-center gap-2 text-sm text-error bg-error/10 border-l-2 border-error px-3 py-2.5 rounded-r-lg">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="flex-shrink-0"><path d="M7 0a7 7 0 100 14A7 7 0 007 0zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM7.75 4v3.5a.75.75 0 01-1.5 0V4a.75.75 0 011.5 0z"/></svg>
                {importError}
              </div>
            )}
            <p className="text-xs text-text-secondary/70">导出包含：全部配置、主题、会话列表、快捷按钮、TFTP 设置</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
      <div className="dialog-content bg-surface rounded-xl w-[660px] max-h-[88vh] overflow-hidden border border-white/5 flex">
        {/* 左侧导航 */}
        <div className="w-28 flex-shrink-0 border-r border-border bg-background/30 py-3">
          <div className="px-3 mb-2">
            <h2 className="text-sm font-semibold">设置</h2>
          </div>
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                activeSection === section.id
                  ? 'bg-primary/10 text-primary border-r-2 border-primary font-medium'
                  : 'text-text-secondary hover:bg-hover hover:text-text'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
            <h3 className="text-sm font-medium">{SECTIONS.find((s) => s.id === activeSection)?.label}</h3>
            <button onClick={onClose} className="dialog-close w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 1l12 12M13 1L1 13"/>
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {renderSection()}
          </div>

          {/* 底部按钮 */}
          <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-border bg-background/30 flex-shrink-0">
            <button onClick={onClose} className="dialog-btn dialog-btn-secondary">取消</button>
            <button onClick={handleSave} className="dialog-btn dialog-btn-primary">保存</button>
          </div>
        </div>
      </div>
    </div>
  );
};
