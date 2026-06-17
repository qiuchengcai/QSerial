/**
 * MCP AI 服务器对话框 — 28 个工具 + Resources + Prompts + Notifications + Sampling + 控制面板
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMcpStore } from "@/stores/mcp";

const ALL_TOOLS = [
  // conn.* — 连接生命周期 (6)
  { name: "conn.create", cat: "conn", desc: "Create serial/SSH/Telnet/PTY connection (supports jumpHost)", inputs: "type, path/port, baudRate, host, username, password, jumpHost?" },
  { name: "conn.disconnect", cat: "conn", desc: "Disconnect and destroy a connection", inputs: "id" },
  { name: "conn.reconnect", cat: "conn", desc: "Reconnect a disconnected connection", inputs: "id" },
  { name: "conn.update", cat: "conn", desc: "Resize terminal cols/rows or change baud rate", inputs: "id, cols?, rows?, baudRate?" },
  { name: "conn.list", cat: "conn", desc: "List all active connections or get detailed info by id", inputs: "id?" },
  { name: "conn.share", cat: "conn", desc: "Start/stop/list TCP connection shares", inputs: "action, connection_id?, local_port?" },
  // conn.data.* — 数据交互 (7)
  { name: "conn.data.write", cat: "data", desc: "Send text data/command to connection", inputs: "data, id" },
  { name: "conn.data.write_hex", cat: "data", desc: "Send hex data (e.g. Modbus frames)", inputs: "hex, id" },
  { name: "conn.data.read", cat: "data", desc: "Read output buffer (consume or peek)", inputs: "id, consume?, max_bytes?" },
  { name: "conn.data.expect", cat: "data", desc: "Wait for pattern in output (substring or regex)", inputs: "pattern, id, regex?, timeout?" },
  { name: "conn.data.clear", cat: "data", desc: "Clear output buffer", inputs: "id" },
  { name: "conn.data.send", cat: "data", desc: "Send command + wait for response, auto-strip echo/prompt", inputs: "command, id, timeout_ms?" },
  { name: "conn.data.history", cat: "data", desc: "Get recent send/receive history", inputs: "id, max_entries?" },
  // conn.hw.* — 硬件控制 (2)
  { name: "conn.hw.dtr_rts", cat: "hw", desc: "Control DTR/RTS serial signals", inputs: "id, dtr?, rts?" },
  { name: "conn.hw.break", cat: "hw", desc: "Send break signal to serial port", inputs: "id, duration_ms?" },
  // conn.script.* — 脚本自动化 (2)
  { name: "conn.script.run", cat: "script", desc: "Execute multi-step {send, expect} script with Sampling on failure", inputs: "steps[], id, stop_on_error?" },
  { name: "conn.script.login", cat: "script", desc: "Automated login flow with Sampling for unknown prompts", inputs: "username, password, id, loginPrompt?, passwordPrompt?, shellPrompt?" },
  // conn.watch.* — 模式监控 (2)
  { name: "conn.watch.start", cat: "watch", desc: "Monitor connection for patterns, sends data_alert notifications", inputs: "id, rules[], duration_ms?" },
  { name: "conn.watch.stop", cat: "watch", desc: "Stop a running watch", inputs: "watch_id" },
  // conn.analyze.* — 连接分析 (3)
  { name: "conn.analyze.state", cat: "analyze", desc: "Analyze connection state (login/shell/booting/idle)", inputs: "id" },
  { name: "conn.analyze.probe", cat: "analyze", desc: "Auto-detect device type (ESP32/STM32/RPi/Cisco/Arduino/BusyBox)", inputs: "id, timeout_ms?" },
  { name: "conn.analyze.report", cat: "analyze", desc: "Generate session summary (duration, commands, bytes)", inputs: "id" },
  // conn.file.* — 文件传输 (1)
  { name: "conn.file.send", cat: "file", desc: "Send file via XMODEM/YMODEM protocol", inputs: "id, file_path, protocol?" },
  // device.* — 设备发现 (1)
  { name: "device.ports", cat: "discover", desc: "List available serial ports on this machine", inputs: "(none)" },
  // session.* — 会话管理 (3)
  { name: "session.list", cat: "session", desc: "List saved connection sessions with full config", inputs: "(none)" },
  { name: "session.save", cat: "session", desc: "Save current connection as a session (auto-detect type from id)", inputs: "id, name" },
  { name: "session.delete", cat: "session", desc: "Delete a saved session", inputs: "session_id" },
  // conn.watch.* (3)
  { name: "conn.watch.start", cat: "watch", desc: "Monitor connection for patterns, sends data_alert notifications", inputs: "id, rules[], duration_ms?" },
  { name: "conn.watch.stop", cat: "watch", desc: "Stop a running watch", inputs: "watch_id" },
  { name: "conn.watch.results", cat: "watch", desc: "Get persisted watch alerts with timestamps", inputs: "watch_id?" },
  // conn.record.* (4)
  { name: "conn.record.start", cat: "record", desc: "Start recording terminal output with timestamps", inputs: "id" },
  { name: "conn.record.stop", cat: "record", desc: "Stop recording and return captured frames", inputs: "id" },
  { name: "conn.record.list", cat: "record", desc: "List all active recordings", inputs: "(none)" },
  { name: "conn.record.replay", cat: "record", desc: "Replay recorded session at specified speed", inputs: "id, speed?" },
  // sftp.* (8)
  { name: "sftp.connect", cat: "sftp", desc: "Open SFTP session over existing SSH connection", inputs: "id" },
  { name: "sftp.disconnect", cat: "sftp", desc: "Close an SFTP session", inputs: "sftp_id" },
  { name: "sftp.list", cat: "sftp", desc: "List directory contents on remote host", inputs: "sftp_id, path?" },
  { name: "sftp.download", cat: "sftp", desc: "Download file from remote host", inputs: "sftp_id, remote_path, local_path" },
  { name: "sftp.upload", cat: "sftp", desc: "Upload file to remote host", inputs: "sftp_id, local_path, remote_path" },
  { name: "sftp.mkdir", cat: "sftp", desc: "Create directory on remote host", inputs: "sftp_id, path" },
  { name: "sftp.stat", cat: "sftp", desc: "Get file metadata (size, permissions)", inputs: "sftp_id, path" },
  { name: "sftp.rm", cat: "sftp", desc: "Delete file or directory on remote host", inputs: "sftp_id, path" },
    // app.* — 应用工具 (1)
  { name: "app.screenshot", cat: "app", desc: "Capture terminal window screenshot", inputs: "id?" },
];

const CATEGORIES: Record<string, { label: string; icon: string }> = {
  conn: { label: "连接管理", icon: "🔌" },
  data: { label: "数据交互", icon: "📡" },
  hw: { label: "硬件控制", icon: "⚙️" },
  script: { label: "脚本自动化", icon: "⚡" },
  watch: { label: "模式监控", icon: "👁️" },
  analyze: { label: "连接分析", icon: "🔍" },
  file: { label: "文件传输", icon: "📁" },
  discover: { label: "设备发现", icon: "📋" },
  session: { label: "会话管理", icon: "💾" },
  record: { label: "Terminal Record", icon: "rec" },
  sftp: { label: "SFTP Files", icon: "sftp" },
    app: { label: "应用工具", icon: "🖥️" },
};

const CAT_ORDER = ["conn", "data", "hw", "script", "watch", "analyze", "file", "discover", "session", "app"];

const RESOURCES_INFO = [
  { uri: "qserial://connections/active", desc: "Active connections with status" },
  { uri: "qserial://connections/{id}", desc: "Detailed connection info" },
  { uri: "qserial://serial/ports", desc: "Available serial ports" },
  { uri: "qserial://sessions/list", desc: "Saved sessions" },
  { uri: "qserial://screenshot/latest", desc: "Latest terminal screenshot" },
  { uri: "qserial://notifications/pending", desc: "Pending notifications" },
  { uri: "qserial://docs/*", desc: "Plugin-contributed device docs" },
];

const PROMPTS_INFO = [
  "esp32-at — ESP32 AT command guide",
  "uboot-flash — U-Boot firmware flashing",
  "cisco-config — Cisco IOS configuration",
  "linux-diag — Linux device diagnostic",
  "serial-debug — Serial debugging workflow",
  "modbus-query — Modbus RTU register read",
];

const NOTIFICATIONS_INFO = [
  "connection/connected, disconnected",
  "connection/data_alert (watch patterns)",
  "session/saved, deleted",
  "script/step_completed",
  "share/started, stopped",
];

interface ClientTemplate {
  id: string;
  name: string;
  description: string;
  configFile: string;
  type: "streamable-http" | "sse";
  configKey: string;
  extraField?: string;
}

const CLIENT_TEMPLATES: ClientTemplate[] = [
  { id: "codebuddy", name: "CodeBuddy", description: "腾讯 AI 编程", configFile: "IDE 设置面板", type: "sse", configKey: "mcpServers" },
  { id: "claude-code", name: "Claude Code", description: "Anthropic CLI", configFile: ".mcp.json 或 ~/.claude.json", type: "streamable-http", configKey: "mcpServers" },
  { id: "claude-desktop", name: "Claude Desktop", description: "Anthropic 桌面版", configFile: "claude_desktop_config.json", type: "streamable-http", configKey: "mcpServers" },
  { id: "codex", name: "Codex", description: "OpenAI Codex CLI", configFile: ".codex/mcp.json", type: "streamable-http", configKey: "mcpServers" },
  { id: "gemini", name: "Gemini", description: "Google Gemini CLI", configFile: ".gemini/mcp.json", type: "streamable-http", configKey: "mcpServers" },
  { id: "opencode", name: "OpenCode", description: "OpenCode CLI", configFile: ".opencode/mcp.json", type: "streamable-http", configKey: "mcpServers" },
  { id: "openclaw", name: "OpenClaw", description: "OpenClaw CLI", configFile: ".openclaw/mcp.json", type: "streamable-http", configKey: "mcpServers" },
  { id: "hermes", name: "Hermes", description: "Hermes CLI", configFile: ".hermes/mcp.json", type: "streamable-http", configKey: "mcpServers" },
];

function generateClientConfig(client: ClientTemplate, ip: string, port: number, authPassword: string, pretty: boolean = false): string {
  const baseUrl = `http://${ip}:${port}`;
  const indent = pretty ? 2 : 0;

  const serverConfig: Record<string, unknown> = { type: client.type === "sse" ? "sse" : "streamable-http" };
  if (client.type === "sse") {
    serverConfig.type = "sse";
    serverConfig.url = baseUrl + "/sse" + (authPassword ? "?token=" + authPassword : "");
  } else {
    serverConfig.url = baseUrl + "/mcp";
    if (authPassword) { serverConfig.headers = { Authorization: "Bearer " + authPassword }; }
  }
  const obj: Record<string, unknown> = {};
  obj[client.configKey] = { qserial: serverConfig };
  return JSON.stringify(obj, null, indent);
}

interface McpDialogProps { isOpen: boolean; onClose: () => void; }

export const McpDialog: React.FC<McpDialogProps> = ({ isOpen, onClose }) => {
  useTranslation();
  const {
    config,
    running,
    starting,
    stopping,
    error,
    connections,
    activeToken,
    updateConfig,
    startServer,
    stopServer,
    loadStatus,
  } = useMcpStore();
  const [selectedCat, setSelectedCat] = useState("conn");
  const [expandedParams, setExpandedParams] = useState<Set<string>>(new Set());
  const [localPort, setLocalPort] = useState(config.port || 9800);
  const [localListenAddress, setLocalListenAddress] = useState(config.listenAddress);
  const [localAuthPassword, setLocalAuthPassword] = useState(config.authPassword);
  const [localCorsOrigins, setLocalCorsOrigins] = useState(config.corsOrigins || '');
  const [selectedClient, setSelectedClient] = useState("codebuddy");
  const [localIp, setLocalIp] = useState("127.0.0.1");

  useEffect(() => {
    setLocalPort(config.port || 9800);
    setLocalListenAddress(config.listenAddress);
    setLocalAuthPassword(config.authPassword);
    setLocalCorsOrigins(config.corsOrigins || '');
  }, [config]);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      window.qserial.getLocalIp().then(setLocalIp).catch(() => setLocalIp("127.0.0.1"));
      const interval = setInterval(() => {
        if (useMcpStore.getState().running) {
          loadStatus();
        }
      }, 3000);
      return () => clearInterval(interval);
    }
    return;
  }, [isOpen, loadStatus]);

  const toggleParams = (name: string) => {
    setExpandedParams((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const handlePortChange = (value: string) => {
    const port = parseInt(value, 10);
    if (!isNaN(port) && port > 0 && port <= 65535) {
      setLocalPort(port);
      updateConfig({ port });
    }
  };

  const handleListenAddressChange = (value: string) => {
    setLocalListenAddress(value);
    updateConfig({ listenAddress: value });
  };

  const handleAuthPasswordChange = (value: string) => {
    setLocalAuthPassword(value);
    updateConfig({ authPassword: value });
  };

  const handleCorsOriginsChange = (value: string) => {
    setLocalCorsOrigins(value);
    updateConfig({ corsOrigins: value });
  };

  const handleStart = async () => {
    updateConfig({ port: localPort, listenAddress: localListenAddress, authPassword: localAuthPassword, corsOrigins: localCorsOrigins });
    await startServer();
  };

  const handleStop = async () => {
    await stopServer();
  };

  if (!isOpen) return null;

  const filteredTools = ALL_TOOLS.filter((t) => t.cat === selectedCat);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-[720px] max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold">MCP AI 服务器</h2>
            <p className="text-xs text-text-secondary/60 mt-0.5">
              {config.listenAddress}:{config.port} · {ALL_TOOLS.length} 工具 · 7 资源 · 6 提示模板 · SSE 通知
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 1l12 12M13 1L1 13"/>
            </svg>
          </button>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* 控制面板 */}
          <div className="bg-background/40 rounded-lg border border-border/50 p-4 space-y-3">
            {/* 端口 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">端口</label>
                <input
                  type="number"
                  value={localPort}
                  onChange={(e) => handlePortChange(e.target.value)}
                  disabled={running}
                  className="dialog-input"
                  min={1024}
                  max={65535}
                />
              </div>
              {/* 监听地址 */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">监听地址</label>
                <select
                  value={localListenAddress}
                  onChange={(e) => handleListenAddressChange(e.target.value)}
                  disabled={running}
                  className="dialog-input"
                >
                  <option value="127.0.0.1">127.0.0.1 (仅本机)</option>
                  <option value="0.0.0.0">0.0.0.0 (可远程访问)</option>
                </select>
              </div>
            </div>
            {/* 认证密码 */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Bearer Token 认证 <span className="text-text-secondary/50 font-normal">(可选)</span>
              </label>
              <input
                type="password"
                value={localAuthPassword}
                onChange={(e) => handleAuthPasswordChange(e.target.value)}
                disabled={running}
                placeholder="留空则不启用认证"
                className="dialog-input"
              />
            </div>
            {/* CORS 域名 */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                CORS 允许域名 <span className="text-text-secondary/50 font-normal">(可选，逗号分隔)</span>
              </label>
              <input
                type="text"
                value={localCorsOrigins}
                onChange={(e) => handleCorsOriginsChange(e.target.value)}
                disabled={running}
                placeholder="留空则允许所有来源"
                className="dialog-input"
              />
            </div>
            {/* 状态 + 操作 */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-[9px] h-[9px] rounded-full ${running ? "bg-green-500" : starting || stopping ? "bg-yellow-400 animate-pulse" : "bg-text-secondary/20"}`}
                />
                <span className="text-sm font-medium">
                  {running
                    ? `运行中 — ${config.listenAddress}:${config.port}${config.listenAddress === "0.0.0.0" ? " (可远程)" : " (仅本机)"}${activeToken ? " · 已认证" : ""}`
                    : starting ? "启动中..." : stopping ? "停止中..." : "已停止"}
                </span>
              </div>
              <div className="flex gap-2">
                {running ? (
                  <button
                    onClick={handleStop}
                    disabled={stopping}
                    className="bg-error text-white hover:bg-error/80 rounded-md text-xs px-3.5 py-1.5 font-medium disabled:opacity-50 transition-colors"
                  >
                    {stopping ? "停止中..." : "停止"}
                  </button>
                ) : (
                  <button
                    onClick={handleStart}
                    disabled={starting}
                    className="dialog-btn dialog-btn-primary text-xs disabled:opacity-50"
                    style={{ padding: "6px 14px" }}
                  >
                    {starting ? "启动中..." : "启动"}
                  </button>
                )}
              </div>
            </div>
            {/* Token 提示 */}
            {running && activeToken && !config.authPassword && (
              <div className="flex items-center gap-2 text-xs bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 mt-2">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="flex-shrink-0 text-yellow-500">
                  <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM7.75 4v3.5a.75.75 0 01-1.5 0V4a.75.75 0 011.5 0z"/>
                </svg>
                <span className="text-yellow-700 dark:text-yellow-300">
                  监听地址非本机，已自动生成 Token（请在 MCP 客户端配置时使用）
                </span>
                <code className="text-[11px] font-mono bg-yellow-500/20 px-1.5 py-0.5 rounded">{activeToken}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(activeToken).catch(() => {})}
                  className="text-xs text-primary hover:text-primary/80 flex-shrink-0"
                >
                  复制
                </button>
              </div>
            )}
            {/* 错误信息 */}
            {error && (
              <div className="flex items-center gap-2 text-xs text-error bg-error/10 border-l-2 border-error px-3 py-2 rounded-r">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="flex-shrink-0">
                  <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM7.75 4v3.5a.75.75 0 01-1.5 0V4a.75.75 0 011.5 0z"/>
                </svg>
                {error}
              </div>
            )}
          </div>

          {/* 活跃连接列表 */}
          {running && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">可用设备</h4>
                <span className="text-xs text-text-secondary">{connections.length} 个连接</span>
              </div>
              <div className="border border-border/50 rounded-lg bg-background/50 max-h-36 overflow-y-auto">
                {connections.length === 0 ? (
                  <div className="text-sm text-text-secondary/50 p-3 text-center">
                    暂无可用连接
                    <p className="text-xs mt-1">创建终端连接后会显示在此处</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {connections.map((conn) => (
                      <div key={conn.id} className="p-2.5 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-green-500" />
                            <span className="truncate">{conn.name || conn.id.slice(0, 8)}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-text-secondary">{conn.type}</span>
                            <span className={`text-xs ${conn.state === "connected" ? "text-green-400" : "text-yellow-400"}`}>
                              {conn.state}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MCP 配置示例 */}
          {running && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">MCP 配置</h4>
              <div className="border border-border/50 rounded-lg overflow-hidden">
                <div className="flex bg-background/50 border-b border-border/50 overflow-x-auto">
                  {CLIENT_TEMPLATES.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => setSelectedClient(client.id)}
                      className={`flex-shrink-0 text-xs py-2 px-2.5 transition-colors ${
                        selectedClient === client.id
                          ? "bg-surface text-primary font-medium border-b-2 border-primary -mb-[1px]"
                          : "text-text-secondary hover:text-text hover:bg-hover/50"
                      }`}
                      title={client.description}
                    >
                      {client.name}
                    </button>
                  ))}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary">
                        {CLIENT_TEMPLATES.find(c => c.id === selectedClient)?.configFile || '.mcp.json'}
                      </span>
                      <span className="text-[10px] text-text-secondary/40">
                        {CLIENT_TEMPLATES.find(c => c.id === selectedClient)?.description || ''}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const client = CLIENT_TEMPLATES.find(c => c.id === selectedClient) || CLIENT_TEMPLATES[0];
                        const token = config.authPassword || activeToken || '';
                        const cfg = generateClientConfig(client, localIp, config.port, token);
                        navigator.clipboard.writeText(cfg).catch(() => {});
                      }}
                      className="text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      复制
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-text bg-background/60 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                    {(() => {
                      const client = CLIENT_TEMPLATES.find(c => c.id === selectedClient) || CLIENT_TEMPLATES[0];
                      const token = config.authPassword || activeToken || '';
                      return generateClientConfig(client, localIp, config.port, token, true);
                    })()}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* 分隔线 */}
          <div className="border-t border-border/50" />

          {/* Tools */}
          <div>
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              工具能力 ({ALL_TOOLS.length})
            </h4>
            <div className="flex gap-1 flex-wrap mb-2">
              {CAT_ORDER.map((cat) => {
                const count = ALL_TOOLS.filter((t) => t.cat === cat).length;
                const isActive = selectedCat === cat;
                return (
                  <button key={cat} onClick={() => setSelectedCat(cat)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
                      isActive ? "bg-primary/10 text-primary border border-primary/20" : "bg-background/50 text-text-secondary border border-border/50 hover:bg-hover/50"}`}>
                    <span>{CATEGORIES[cat].icon}</span>
                    <span>{CATEGORIES[cat].label}</span>
                    <span className="text-[10px] opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="border border-border/50 rounded-lg divide-y divide-border/50">
              {filteredTools.map((tool) => (
                <div key={tool.name} className="px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-mono font-medium text-primary w-[170px] flex-shrink-0 truncate" title={tool.name}>{tool.name}</span>
                    <span className="text-xs text-text-secondary flex-1">{tool.desc}</span>
                    {tool.inputs !== "(none)" && (
                      <button onClick={() => toggleParams(tool.name)}
                        className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-hover text-text-secondary/40 hover:text-text-secondary">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transform transition-transform ${expandedParams.has(tool.name) ? "rotate-180" : ""}`}>
                          <path d="M2.5 3.5L5 6L7.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  {expandedParams.has(tool.name) && (
                    <div className="mt-1 ml-[170px]">
                      <span className="text-[10px] text-text-secondary/60">参数: {tool.inputs}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              资源 ({RESOURCES_INFO.length})
            </h4>
            <div className="border border-border/50 rounded-lg divide-y divide-border/50">
              {RESOURCES_INFO.map((r) => (
                <div key={r.uri} className="px-3 py-2 flex items-start gap-2">
                  <span className="text-xs font-mono text-primary w-[220px] flex-shrink-0 truncate">{r.uri}</span>
                  <span className="text-xs text-text-secondary">{r.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Prompts */}
          <div>
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              提示模板 ({PROMPTS_INFO.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {PROMPTS_INFO.map((p) => (
                <span key={p} className="text-[11px] px-2 py-1 rounded bg-primary/5 text-primary/80 border border-primary/10 font-mono">{p}</span>
              ))}
            </div>
          </div>

          {/* Notifications + Sampling */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                通知 ({NOTIFICATIONS_INFO.length})
              </h4>
              <div className="space-y-1">
                {NOTIFICATIONS_INFO.map((n) => (
                  <div key={n} className="text-[11px] text-text-secondary/80 font-mono">{n}</div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Sampling
              </h4>
              <div className="text-[11px] text-text-secondary/80 space-y-1">
                <div>连接登录 未知提示符 → AI 决策</div>
                <div>脚本步骤失败 → AI 决策 (重试/跳过/终止)</div>
                <div>通用 sampling/response 端点</div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-border bg-background/30 flex-shrink-0">
          <button onClick={onClose} className="dialog-btn dialog-btn-secondary">关闭</button>
        </div>
      </div>
    </div>
  );
};