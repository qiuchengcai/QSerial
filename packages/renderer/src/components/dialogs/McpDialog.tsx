/**
 * MCP AI 服务器对话框 — 含 13 个工具能力展示
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useMcpStore } from '@/stores/mcp';

interface ToolDef {
  name: string;
  description: string;
  inputs: string;
  idempotent: boolean;
  sideEffect: boolean;
  category: 'connection' | 'data' | 'state' | 'help';
}

const MCP_TOOLS: ToolDef[] = [
  // 连接管理 (5)
  {
    name: 'connection_create', category: 'connection',
    description: '创建并连接新设备 (serial/ssh/telnet/pty)，传入类型和相关参数即可建立连接。',
    inputs: 'type(必填), name?, path?, baudRate?, dataBits?, stopBits?, parity?, host?, port?, username?, password?, shell?',
    idempotent: false, sideEffect: true,
  },
  {
    name: 'connection_disconnect', category: 'connection',
    description: '断开并销毁指定连接，释放资源。',
    inputs: 'id/connectionId(必填)',
    idempotent: false, sideEffect: true,
  },
  {
    name: 'connection_update', category: 'connection',
    description: '调整终端尺寸 (cols/rows) 或串口波特率。注意：修改波特率会触发断开重连。',
    inputs: 'id/connectionId, cols?, rows?, baudRate?',
    idempotent: false, sideEffect: true,
  },
  {
    name: 'connection_list', category: 'connection',
    description: '列出 QSerial 中所有活跃的连接（串口、SSH、本地终端等）及其当前状态。',
    inputs: '(无参数)',
    idempotent: true, sideEffect: false,
  },
  {
    name: 'connection_info', category: 'connection',
    description: '获取指定连接的详细信息，包括类型、状态、完整连接参数等。',
    inputs: 'id/connectionId',
    idempotent: true, sideEffect: false,
  },
  // 数据交互 (5)
  {
    name: 'connection_write', category: 'data',
    description: '向指定连接发送数据或命令。支持发送前延迟和条件等待。终端命令末尾需 \\n 换行符。',
    inputs: 'data(必填), id/connectionId, delay_ms?, wait_before?',
    idempotent: false, sideEffect: true,
  },
  {
    name: 'connection_read', category: 'data',
    description: '读取指定连接的输出缓冲区，读取后清空缓冲区。返回内容、字节数和时间戳。',
    inputs: 'id/connectionId',
    idempotent: false, sideEffect: true,
  },
  {
    name: 'connection_peek', category: 'data',
    description: '预览输出缓冲区内容，不清空。可指定 max_bytes 限制返回长度（默认 4096）。',
    inputs: 'id/connectionId, max_bytes?(默认4096)',
    idempotent: true, sideEffect: false,
  },
  {
    name: 'connection_expect', category: 'data',
    description: '等待连接输出中出现指定模式。支持普通子串匹配和正则表达式匹配，带超时。',
    inputs: 'pattern(必填), id/connectionId, regex?(默认false), timeout?(默认30s)',
    idempotent: true, sideEffect: false,
  },
  {
    name: 'connection_clear', category: 'data',
    description: '清空指定连接的输出缓冲区，丢弃所有未读数据。',
    inputs: 'id/connectionId',
    idempotent: false, sideEffect: true,
  },
  // 状态感知 (2)
  {
    name: 'connection_state', category: 'state',
    description: '分析连接的交互状态。检测终端处于：login_prompt / password_prompt / shell(root/user) / booting / program_running / idle。分析最近 64KB 输出。',
    inputs: 'id/connectionId',
    idempotent: true, sideEffect: false,
  },
  {
    name: 'connection_login', category: 'state',
    description: '自动化登录流程：检测 Login 提示 → 发送用户名 → 检测 Password 提示 → 发送密码 → 等待 Shell 就绪。支持正则模式匹配，提供每步调试输出。',
    inputs: 'username(必填), password(必填), id/connectionId, loginPrompt?, passwordPrompt?, shellPrompt?, timeout?(默认30), debug?(默认true)',
    idempotent: false, sideEffect: true,
  },
  // 帮助 (1)
  {
    name: 'help', category: 'help',
    description: '获取 QSerial AI 使用说明和完整操作指南，包含典型操作流程和注意事项。',
    inputs: '(无参数)',
    idempotent: true, sideEffect: false,
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  connection: '连接管理',
  data: '数据交互',
  state: '状态感知',
  help: '帮助',
};

const Badge: React.FC<{ idempotent: boolean; sideEffect: boolean }> = ({ idempotent, sideEffect }) => {
  if (idempotent && !sideEffect) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-medium border border-green-500/20">幂等</span>;
  }
  if (sideEffect) {
    const isRead = sideEffect && !idempotent;
    return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
      isRead
        ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
        : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
    }`}>有副作用</span>;
  }
  return null;
};

interface McpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const McpDialog: React.FC<McpDialogProps> = ({ isOpen, onClose }) => {
  const {
    config,
    running,
    starting,
    stopping,
    error,
    connections,
    updateConfig,
    startServer,
    stopServer,
    loadStatus,
  } = useMcpStore();
  const [localPort, setLocalPort] = useState(config.port);
  const [localIp, setLocalIp] = useState('127.0.0.1');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['connection']));
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLocalPort(config.port);
  }, [config]);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      window.qserial.getLocalIp().then(setLocalIp).catch(() => setLocalIp('127.0.0.1'));
      const interval = setInterval(() => {
        if (useMcpStore.getState().running) {
          loadStatus();
        }
      }, 3000);
      return () => clearInterval(interval);
    }
    return;
  }, [isOpen, loadStatus]);

  const handlePortChange = (value: string) => {
    const port = parseInt(value, 10);
    if (!isNaN(port) && port > 0 && port <= 65535) {
      setLocalPort(port);
      updateConfig({ port });
    }
  };

  const handleStart = async () => {
    updateConfig({ port: localPort });
    await startServer();
  };

  const handleStop = async () => {
    await stopServer();
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const toggleTool = (name: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const groupedTools = useMemo(() => {
    const groups: Record<string, ToolDef[]> = {};
    for (const tool of MCP_TOOLS) {
      if (!groups[tool.category]) groups[tool.category] = [];
      groups[tool.category].push(tool);
    }
    return groups;
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
      <div className="dialog-content bg-surface rounded-xl w-[640px] max-h-[88vh] flex flex-col border border-white/5">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M9.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 01-4.96.32 7.34 7.34 0 01-.04-.82v-15A2.5 2.5 0 019.5 2z"/>
              <path d="M14.5 2A2.5 2.5 0 0012 4.5v15a2.5 2.5 0 004.96.32 7.34 7.34 0 00.04-.82v-15A2.5 2.5 0 0014.5 2z"/>
            </svg>
            <h3 className="text-base font-semibold">MCP AI 服务器</h3>
          </div>
          <button
            onClick={onClose}
            className="dialog-close w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 1l12 12M13 1L1 13"/>
            </svg>
          </button>
        </div>

        {/* 可滚动内容区 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
          {/* 端口 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">端口</label>
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

          {/* 状态 */}
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${running ? 'bg-green-500' : starting || stopping ? 'bg-yellow-500 animate-pulse' : 'bg-gray-500'}`}
            />
            <span className="text-sm">
              {running
                ? `运行中 — 0.0.0.0:${config.port} (可远程访问)`
                : starting
                ? '启动中...'
                : stopping
                ? '停止中...'
                : '已停止'}
            </span>
          </div>

          {/* 错误信息 */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-error bg-error/10 border-l-2 border-error px-3 py-2.5 rounded-r-lg">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="flex-shrink-0">
                <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM7.75 4v3.5a.75.75 0 01-1.5 0V4a.75.75 0 011.5 0z"/>
              </svg>
              {error}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2">
            {running ? (
              <button
                onClick={handleStop}
                disabled={stopping}
                className="dialog-btn flex-1 bg-error text-white hover:bg-error/80 rounded-md disabled:opacity-50"
              >
                {stopping ? '停止中...' : '停止'}
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={starting}
                className="dialog-btn dialog-btn-primary flex-1 disabled:opacity-50"
              >
                {starting ? '启动中...' : '启动'}
              </button>
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
                    {connections.map((conn: { id: string; type: string; name: string; state: string }) => (
                      <div key={conn.id} className="p-2.5 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-green-500" />
                            <span className="truncate">{conn.name || conn.id.slice(0, 8)}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-text-secondary">{conn.type}</span>
                            <span className={`text-xs ${
                              conn.state === 'connected' ? 'text-green-400' : 'text-yellow-400'
                            }`}>
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

              {/* Claude Code 配置 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-secondary">Claude Code — .mcp.json</span>
                  <button
                    onClick={() => {
                      const text = `{"mcpServers":{"qserial":{"transport":"streamableHttp","url":"http://${localIp}:${config.port}/mcp"}}}`;
                      navigator.clipboard.writeText(text).catch(() => {});
                    }}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    复制
                  </button>
                </div>
                <pre className="text-[11px] bg-background rounded p-2 overflow-x-auto border border-border/50 whitespace-pre-wrap break-all">
{`{
  "mcpServers": {
    "qserial": {
      "transport": "streamableHttp",
      "url": "http://${localIp}:${config.port}/mcp"
    }
  }
}`}
                </pre>
              </div>

              {/* CodeBuddy 配置 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-secondary">CodeBuddy — mcp.json</span>
                  <button
                    onClick={() => {
                      const text = `{"mcpServers":{"qserial":{"transport":"sse","url":"http://${localIp}:${config.port}/sse"}}}`;
                      navigator.clipboard.writeText(text).catch(() => {});
                    }}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    复制
                  </button>
                </div>
                <pre className="text-[11px] bg-background rounded p-2 overflow-x-auto border border-border/50 whitespace-pre-wrap break-all">
{`{
  "mcpServers": {
    "qserial": {
      "transport": "sse",
      "url": "http://${localIp}:${config.port}/sse"
    }
  }
}`}
                </pre>
              </div>

              <p className="text-xs text-text-secondary/60">
                · {localIp}:{config.port} — 支持 13 个工具，覆盖连接管理、数据交互、状态感知
              </p>
            </div>
          )}

          {/* 工具能力展示 */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              工具能力 ({MCP_TOOLS.length})
            </h4>
            {Object.entries(groupedTools).map(([category, tools]) => (
              <div key={category} className="border border-border/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-background/50 hover:bg-hover/50 transition-colors text-left"
                >
                  <span className="text-sm font-medium">
                    {CATEGORY_LABELS[category] || category}
                    <span className="text-xs text-text-secondary ml-2">({tools.length} 个工具)</span>
                  </span>
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    className={`transform transition-transform ${expandedCategories.has(category) ? 'rotate-180' : ''}`}
                  >
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {expandedCategories.has(category) && (
                  <div className="divide-y divide-border/50 border-t border-border/50">
                    {tools.map((tool) => (
                      <div key={tool.name}>
                        <button
                          onClick={() => toggleTool(tool.name)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-hover/30 transition-colors text-left"
                        >
                          <span className="text-xs font-mono font-medium text-primary min-w-0 truncate">{tool.name}</span>
                          <span className="text-xs text-text-secondary truncate hidden sm:inline">{tool.description.slice(0, 40)}...</span>
                          <span className="flex-shrink-0 ml-auto"><Badge idempotent={tool.idempotent} sideEffect={tool.sideEffect} /></span>
                          <svg
                            width="10" height="10" viewBox="0 0 10 10" fill="none"
                            className={`transform transition-transform flex-shrink-0 ${expandedTools.has(tool.name) ? 'rotate-180' : ''}`}
                          >
                            <path d="M2.5 3.5L5 6L7.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        {expandedTools.has(tool.name) && (
                          <div className="px-3 pb-2.5 pt-0.5 space-y-1">
                            <p className="text-xs text-text-secondary leading-relaxed">{tool.description}</p>
                            <p className="text-[10px] text-text-secondary/70">
                              <span className="font-medium text-text-secondary/50">输入参数:</span> {tool.inputs}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 关闭按钮 */}
        <div className="flex justify-end px-5 py-4 border-t border-border bg-background/30 flex-shrink-0">
          <button onClick={onClose} className="dialog-btn dialog-btn-secondary">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
