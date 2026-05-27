/**
 * MCP AI 服务器对话框 — 28 个工具 + Resources + Prompts + Notifications + Sampling
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMcpStore } from "@/stores/mcp";

const ALL_TOOLS = [
  // Connection (5)
  { name: "connection_create", cat: "conn", desc: "Create serial/SSH/Telnet/PTY connection (supports jumpHost)", inputs: "type, path/port, baudRate, host, username, password, jumpHost?" },
  { name: "connection_disconnect", cat: "conn", desc: "Disconnect and destroy a connection", inputs: "id" },
  { name: "connection_reconnect", cat: "conn", desc: "Reconnect a disconnected connection", inputs: "id" },
  { name: "connection_update", cat: "conn", desc: "Resize terminal cols/rows or change baud rate", inputs: "id, cols?, rows?, baudRate?" },
  { name: "connection_list", cat: "conn", desc: "List all active connections or get detailed info by id", inputs: "id?" },
  // Data (7)
  { name: "connection_write", cat: "data", desc: "Send text data/command to connection", inputs: "data, id" },
  { name: "connection_write_hex", cat: "data", desc: "Send hex data (e.g. Modbus frames)", inputs: "hex, id" },
  { name: "connection_read", cat: "data", desc: "Read output buffer (consume or peek)", inputs: "id, consume?, max_bytes?" },
  { name: "connection_expect", cat: "data", desc: "Wait for pattern in output (substring or regex)", inputs: "pattern, id, regex?, timeout?" },
  { name: "connection_clear_buffer", cat: "data", desc: "Clear output buffer", inputs: "id" },
  { name: "connection_send_command", cat: "data", desc: "Send command + wait for response, auto-strip echo/prompt", inputs: "command, id, timeout_ms?" },
  { name: "connection_get_history", cat: "data", desc: "Get recent send/receive history", inputs: "id, max_entries?" },
  // Script (1)
  { name: "connection_run_script", cat: "script", desc: "Execute multi-step {send, expect} script with Sampling on failure", inputs: "steps[], id, stop_on_error?" },
  // State (2)
  { name: "connection_state", cat: "state", desc: "Analyze connection state (login/shell/booting/idle)", inputs: "id" },
  { name: "connection_login", cat: "state", desc: "Automated login flow with Sampling for unknown prompts", inputs: "username, password, id, loginPrompt?, passwordPrompt?, shellPrompt?" },
  // Hardware (2)
  { name: "connection_set_dtr_rts", cat: "hw", desc: "Control DTR/RTS serial signals", inputs: "id, dtr?, rts?" },
  { name: "connection_set_break", cat: "hw", desc: "Send break signal to serial port", inputs: "id, duration_ms?" },
  // Discover (2)
  { name: "serial_list", cat: "discover", desc: "List available serial ports on this machine", inputs: "(none)" },
  { name: "session_list", cat: "discover", desc: "List saved connection sessions with full config", inputs: "(none)" },
  { name: "session_save", cat: "discover", desc: "Save current connection as a session", inputs: "id, name" },
  { name: "session_delete", cat: "discover", desc: "Delete a saved session", inputs: "session_id" },
  // Share (1)
  { name: "connection_share", cat: "share", desc: "Start/stop/list TCP connection shares", inputs: "action, connection_id?, local_port?" },
  // File (2)
  { name: "connection_send_file", cat: "file", desc: "Send file via XMODEM/YMODEM protocol", inputs: "id, file_path, protocol?" },
  { name: "window_screenshot", cat: "file", desc: "Capture terminal window screenshot", inputs: "id?" },
  // v0.3.x AI (3)
  { name: "connection_probe", cat: "ai", desc: "Auto-detect device type (ESP32/STM32/RPi/Cisco/Arduino/BusyBox)", inputs: "id, timeout_ms?" },
  { name: "connection_watch", cat: "ai", desc: "Monitor connection for patterns, sends data_alert notifications", inputs: "id, rules[], duration_ms?" },
  { name: "connection_unwatch", cat: "ai", desc: "Stop a running watch", inputs: "watch_id" },
  { name: "connection_summarize", cat: "ai", desc: "Generate session summary (duration, commands, bytes)", inputs: "id" },
];

const CATEGORIES: Record<string, { label: string; icon: string }> = {
  conn: { label: "连接管理", icon: "🔌" },
  data: { label: "数据交互", icon: "📡" },
  script: { label: "脚本执行", icon: "⚡" },
  state: { label: "状态感知", icon: "🔍" },
  hw: { label: "硬件控制", icon: "⚙️" },
  discover: { label: "设备发现", icon: "📋" },
  share: { label: "连接共享", icon: "🔗" },
  file: { label: "文件传输", icon: "📁" },
  ai: { label: "AI 智能", icon: "🤖" },
};

const CAT_ORDER = ["conn", "data", "script", "state", "ai", "hw", "discover", "share", "file"];

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

interface McpDialogProps { isOpen: boolean; onClose: () => void; }

export const McpDialog: React.FC<McpDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { running, config } = useMcpStore();
  const [selectedCat, setSelectedCat] = useState("conn");
  const [expandedParams, setExpandedParams] = useState<Set<string>>(new Set());

  const toggleParams = (name: string) => {
    setExpandedParams((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
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
          <div className="flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${running ? "bg-green-500" : "bg-red-500"}`} />
            <span className={`text-xs font-medium ${running ? "text-green-500" : "text-red-500"}`}>
              {running ? "运行中" : "已停止"}
            </span>
          </div>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

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
