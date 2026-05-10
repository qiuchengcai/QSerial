/**
 * MCP AI 服务器对话框
 */

import React, { useEffect, useState } from 'react';
import { useMcpStore } from '@/stores/mcp';

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

  useEffect(() => {
    setLocalPort(config.port);
  }, [config]);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      // 定期刷新连接列表
      const interval = setInterval(() => {
        if (useMcpStore.getState().running) {
          loadStatus();
        }
      }, 3000);
      return () => clearInterval(interval);
    }
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
      <div className="dialog-content bg-surface rounded-xl w-[480px] max-h-[80vh] flex flex-col border border-white/5">
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

        <div className="space-y-4 flex-shrink-0 p-5">
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
        </div>

        {/* 连接列表 */}
        {running && (
          <div className="px-5 pb-3 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">可用设备</h4>
              <span className="text-xs text-text-secondary">{connections.length} 个连接</span>
            </div>
            <div className="flex-1 overflow-y-auto border border-border/50 rounded-lg bg-background/50 max-h-48">
              {connections.length === 0 ? (
                <div className="text-sm text-text-secondary/50 p-4 text-center">
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

        {/* 提示 */}
        <div className="text-xs text-text-secondary/60 px-5 pb-2 flex-shrink-0 space-y-0.5">
          <p>· MCP (Model Context Protocol) 供 AI Agent 操作 QSerial 设备</p>
          <p>· 端点：POST http://0.0.0.0:{config.port}/mcp (JSON-RPC)</p>
          <p>· SSE 事件推送：GET http://0.0.0.0:{config.port}/sse</p>
          <p>· 支持 7 个工具：连接列表、读写、预期匹配等</p>
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
