/**
 * MCP AI 服务器对话框 — 含 12 个工具能力展示
 */

import React, { useEffect, useState } from 'react';
import { useMcpStore } from '@/stores/mcp';

interface ToolDef {
  name: string;
  description: string;
  inputs: string;
  idempotent: boolean;
  sideEffect: boolean;
  category: 'connection' | 'data' | 'state' | 'discover' | 'share' | 'capture';
}

const MCP_TOOLS: ToolDef[] = [
  // 连接管理 (4)
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
    description: '列出所有活跃连接。传 id 返回指定连接完整详情（含连接参数）。',
    inputs: 'id/connectionId?（可选，传则返回详情）',
    idempotent: true, sideEffect: false,
  },
  // 数据交互 (3)
  {
    name: 'connection_write', category: 'data',
    description: '向指定连接发送数据或命令。支持发送前延迟和条件等待。终端命令末尾需 \\n 换行符。',
    inputs: 'data(必填), id/connectionId, delay_ms?, wait_before?',
    idempotent: false, sideEffect: true,
  },
  {
    name: 'connection_read', category: 'data',
    description: '读取连接输出。默认读后清空 (consume=true)；consume=false 预览不清空（配合 max_bytes）；consume=true+max_bytes=0 仅清空。',
    inputs: 'id/connectionId, consume?(默认true), max_bytes?(默认4096)',
    idempotent: false, sideEffect: true,
  },
  {
    name: 'connection_expect', category: 'data',
    description: '等待连接输出中出现指定模式。支持子串匹配和正则表达式匹配，带超时。',
    inputs: 'pattern(必填), id/connectionId, regex?(默认false), timeout?(默认30s)',
    idempotent: true, sideEffect: false,
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
  // 发现 (2)
  {
    name: 'serial_list', category: 'discover',
    description: '列出系统中所有可用的串口设备（路径、厂商、VID:PID 等）。',
    inputs: '(无参数)',
    idempotent: true, sideEffect: false,
  },
  {
    name: 'session_list', category: 'discover',
    description: '列出用户已保存的所有终端会话配置（串口、SSH、Telnet 等），含完整连接参数。',
    inputs: '(无参数)',
    idempotent: true, sideEffect: false,
  },
  // 连接共享 (1)
  {
    name: 'connection_share', category: 'share',
    description: '管理连接共享服务。action=start 启动 TCP Telnet 共享；action=stop 停止共享；action=list 列出所有活跃共享。',
    inputs: 'action(必填: start/stop/list), connection_id?, local_port?, listen_address?, password?, share_id?',
    idempotent: false, sideEffect: true,
  },
  // 截图 (1)
  {
    name: 'window_screenshot', category: 'capture',
    description: '抓取当前窗口。mode=html(默认,快速) 返回DOM，compact=true去掉样式减体积；mode=image 返回SVG截图。',
    inputs: 'mode?(默认html: html/image), compact?(默认true), scope?(仅image)',
    idempotent: true, sideEffect: false,
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  connection: '连接管理',
  data: '数据交互',
  state: '状态感知',
  discover: '发现',
  share: '连接共享',
  capture: '截图',
};

const CATEGORY_ORDER = ['connection', 'data', 'state', 'discover', 'share', 'capture'];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  connection: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v4M8 10v4M2 8h4M10 8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/></svg>,
  data: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M5 8h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="5" cy="11" r="1" fill="currentColor" opacity="0.5"/><circle cx="8" cy="11" r="1" fill="currentColor" opacity="0.5"/><circle cx="11" cy="11" r="1" fill="currentColor" opacity="0.5"/></svg>,
  state: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="8" r="1" fill="currentColor"/></svg>,
  discover: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/><line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2"/><line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>,
  share: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/><circle cx="11" cy="4" r="2" stroke="currentColor" strokeWidth="1.2"/><circle cx="11" cy="12" r="2" stroke="currentColor" strokeWidth="1.2"/><line x1="6.5" y1="7" x2="9.5" y2="5" stroke="currentColor" strokeWidth="1.2"/><line x1="6.5" y1="9" x2="9.5" y2="11" stroke="currentColor" strokeWidth="1.2"/></svg>,
  capture: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.2"/><rect x="5" y="2" width="6" height="2" rx="0.5" stroke="currentColor" strokeWidth="1.2"/></svg>,
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
  const [localPort, setLocalPort] = useState(config.port || 9800);
  const [localIp, setLocalIp] = useState('127.0.0.1');
  const [localListenAddress, setLocalListenAddress] = useState(config.listenAddress);
  const [localAuthPassword, setLocalAuthPassword] = useState(config.authPassword);
  const [selectedCategory, setSelectedCategory] = useState('connection');
  const [expandedToolParams, setExpandedToolParams] = useState<Set<string>>(new Set());
  const [selectedClient, setSelectedClient] = useState<'claude' | 'codebuddy'>('claude');

  useEffect(() => {
    setLocalPort(config.port || 9800);
    setLocalListenAddress(config.listenAddress);
    setLocalAuthPassword(config.authPassword);
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

  const handleListenAddressChange = (value: string) => {
    setLocalListenAddress(value);
    updateConfig({ listenAddress: value });
  };

  const handleAuthPasswordChange = (value: string) => {
    setLocalAuthPassword(value);
    updateConfig({ authPassword: value });
  };

  const handleStart = async () => {
    updateConfig({ port: localPort, listenAddress: localListenAddress, authPassword: localAuthPassword });
    await startServer();
  };

  const handleStop = async () => {
    await stopServer();
  };

  const toggleParams = (name: string) => {
    setExpandedToolParams((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
      <div className="bg-surface rounded-xl shadow-md w-[640px] max-h-[88vh] flex flex-col border border-border/80">
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

          {/* 监听地址 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">监听地址</label>
            <select
              value={localListenAddress}
              onChange={(e) => handleListenAddressChange(e.target.value)}
              disabled={running}
              className="dialog-input"
            >
              <option value="127.0.0.1">127.0.0.1 (仅本机)</option>
              <option value="0.0.0.0">0.0.0.0 (所有网络接口，可远程访问)</option>
            </select>
          </div>

          {/* 认证密码 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Bearer Token 认证 <span className="text-text-secondary/50 font-normal">(可选，建议启用)</span>
            </label>
            <input
              type="password"
              value={localAuthPassword}
              onChange={(e) => handleAuthPasswordChange(e.target.value)}
              disabled={running}
              placeholder="留空则不启用认证"
              className="dialog-input"
            />
            {localAuthPassword && (
              <p className="text-[10px] text-warning mt-1">MCP 客户端需在 HTTP Header 中携带 Authorization: Bearer {localAuthPassword}</p>
            )}
          </div>

          {/* 状态 + 操作 */}
          <div className="bg-background/40 rounded-lg border border-border/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-[9px] h-[9px] rounded-full ${running ? 'bg-green-400 service-dot-active' : starting || stopping ? 'bg-yellow-400 animate-pulse' : 'bg-text-secondary/20'}`}
                />
                <span className="text-sm font-medium">
                  {running
                    ? `运行中 — ${config.listenAddress}:${config.port}${config.listenAddress === '0.0.0.0' ? ' (可远程)' : ' (仅本机)'}${config.authPassword ? ' · 已认证' : ''}`
                    : starting ? '启动中...' : stopping ? '停止中...' : '已停止'}
                </span>
              </div>
              <div className="flex gap-2">
                {running ? (
                  <button
                    onClick={handleStop}
                    disabled={stopping}
                    className="dialog-btn bg-error text-white hover:bg-error/80 rounded-md text-sm disabled:opacity-50"
                    style={{ padding: '6px 16px' }}
                  >
                    {stopping ? '停止中...' : '停止'}
                  </button>
                ) : (
                  <button
                    onClick={handleStart}
                    disabled={starting}
                    className="dialog-btn dialog-btn-primary text-sm disabled:opacity-50"
                    style={{ padding: '6px 16px' }}
                  >
                    {starting ? '启动中...' : '启动'}
                  </button>
                )}
              </div>
            </div>
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

              <div className="border border-border/50 rounded-lg overflow-hidden">
                {/* 客户端切换 */}
                <div className="flex bg-background/50 border-b border-border/50">
                  {(['claude', 'codebuddy'] as const).map((client) => (
                    <button
                      key={client}
                      onClick={() => setSelectedClient(client)}
                      className={`flex-1 text-xs py-2 px-3 transition-colors ${
                        selectedClient === client
                          ? 'bg-surface text-primary font-medium border-b-2 border-primary -mb-[1px]'
                          : 'text-text-secondary hover:text-text hover:bg-hover/50'
                      }`}
                    >
                      {client === 'claude' ? 'Claude Code' : 'CodeBuddy'}
                    </button>
                  ))}
                </div>

                {/* 配置内容 */}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-text-secondary">.mcp.json</span>
                    <button
                      onClick={() => {
                        const tokenSuffix = config.authPassword ? `?token=${config.authPassword}` : '';
                        const headersBlock = config.authPassword ? `,\n      "headers": {\n        "Authorization": "Bearer ${config.authPassword}"\n      }` : '';
                        const cfg = selectedClient === 'claude'
                          ? `{"mcpServers":{"qserial":{"type":"streamable-http","url":"http://${localIp}:${config.port}/mcp"${headersBlock}}}}`
                          : `{"mcpServers":{"qserial":{"type":"sse","url":"http://${localIp}:${config.port}/sse${tokenSuffix}"}}}`;
                        const ta = document.createElement('textarea');
                        ta.value = cfg;
                        ta.style.position = 'fixed';
                        ta.style.opacity = '0';
                        document.body.appendChild(ta);
                        ta.select();
                        try { document.execCommand('copy'); } catch { /* ignore */ }
                        ta.remove();
                      }}
                      className="text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      复制
                    </button>
                  </div>
                  <pre className="text-[11px] bg-background rounded p-2.5 overflow-x-auto border border-border/50 whitespace-pre-wrap break-all">
                    {(() => {
                      const tokenSuffix = config.authPassword ? `?token=${config.authPassword}` : '';
                      const headersBlock = config.authPassword ? `,\n      "headers": {\n        "Authorization": "Bearer ${config.authPassword}"\n      }` : '';
                      return selectedClient === 'claude'
                        ? `{\n  "mcpServers": {\n    "qserial": {\n      "type": "streamable-http",\n      "url": "http://${localIp}:${config.port}/mcp"${headersBlock}\n    }\n  }\n}`
                        : `{\n  "mcpServers": {\n    "qserial": {\n      "type": "sse",\n      "url": "http://${localIp}:${config.port}/sse${tokenSuffix}"\n    }\n  }\n}`;
                    })()}
                  </pre>
                </div>
              </div>

              <p className="text-xs text-text-secondary/60">
                · {localIp}:{config.port} — 支持 13 个工具，覆盖连接管理、数据交互、状态感知、设备发现、连接共享、截图
              </p>
            </div>
          )}

          {/* 工具能力展示 */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              工具能力 ({MCP_TOOLS.length})
            </h4>

            {/* 分类标签页 */}
            <div className="flex gap-1 flex-wrap">
              {CATEGORY_ORDER.map((cat) => {
                const tools = MCP_TOOLS.filter((t) => t.category === cat);
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-all ${
                      isActive
                        ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
                        : 'bg-background/50 text-text-secondary border border-border/50 hover:bg-hover/50 hover:text-text'
                    }`}
                  >
                    <span className={isActive ? 'text-primary' : 'text-text-secondary/60'}>{CATEGORY_ICONS[cat]}</span>
                    <span>{CATEGORY_LABELS[cat]}</span>
                    <span className={`text-[10px] ml-0.5 ${isActive ? 'text-primary/60' : 'text-text-secondary/40'}`}>{tools.length}</span>
                  </button>
                );
              })}
            </div>

            {/* 当前分类下的工具列表 */}
            <div className="border border-border/50 rounded-lg divide-y divide-border/50">
              {MCP_TOOLS.filter((t) => t.category === selectedCategory).map((tool) => {
                const paramsExpanded = expandedToolParams.has(tool.name);
                const isIdempotent = tool.idempotent && !tool.sideEffect;
                return (
                  <div key={tool.name}>
                    <div className="px-3 py-2.5">
                      <div className="flex items-start gap-2.5">
                        {/* 工具名 - 固定宽度对齐 */}
                        <span className="text-xs font-mono font-medium text-primary flex-shrink-0 mt-0.5 w-[140px] truncate" title={tool.name}>{tool.name}</span>
                        {/* 幂等标签 */}
                        {isIdempotent && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-medium border border-green-500/20 flex-shrink-0 mt-0.5">幂等</span>
                        )}
                        {/* 描述 - 占满剩余空间 */}
                        <span className="text-xs text-text-secondary leading-relaxed flex-1 min-w-0">{tool.description}</span>
                        {/* 参数展开按钮 */}
                        {tool.inputs !== '(无参数)' && (
                          <button
                            onClick={() => toggleParams(tool.name)}
                            className="flex-shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center rounded hover:bg-hover text-text-secondary/40 hover:text-text-secondary transition-colors"
                            title="查看参数"
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transform transition-transform ${paramsExpanded ? 'rotate-180' : ''}`}>
                              <path d="M2.5 3.5L5 6L7.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        )}
                      </div>
                      {/* 展开参数 */}
                      {paramsExpanded && (
                        <div className="mt-1.5 ml-[18px]">
                          <span className="text-[10px] text-text-secondary/60">
                            <span className="font-medium text-text-secondary/40">参数:</span> {tool.inputs}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
