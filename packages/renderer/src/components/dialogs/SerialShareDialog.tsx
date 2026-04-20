/**
 * 串口共享对话框
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { SerialPortInfo } from '@qserial/shared';
import { useTerminalStore } from '@/stores/terminal';
import { useConfigStore } from '@/stores/config';
import { ConnectionType, ConnectionState } from '@qserial/shared';

interface SerialShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSerialPath?: string;
  defaultBaudRate?: number;
}

interface SshTunnelConfig {
  host: string;
  port: number;
  username: string;
  remotePort: number;
  password?: string; // 可选，留空使用 ~/.ssh 下的默认密钥
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

export const SerialShareDialog: React.FC<SerialShareDialogProps> = ({
  isOpen,
  onClose,
  defaultSerialPath,
  defaultBaudRate,
}) => {
  const { sessions } = useTerminalStore();
  const { config, updateConfig } = useConfigStore();
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [status, setStatus] = useState<{
    running: boolean;
    serialPath: string;
    localPort: number;
    listenAddress: string;
    clientCount: number;
    clients: string[];
    sshTunnelConnected: boolean;
    hasPassword: boolean;
  } | null>(null);

  // 串口配置 - 使用配置文件中的默认值
  const [selectedPort, setSelectedPort] = useState(defaultSerialPath || '');
  const [baudRate, setBaudRate] = useState(defaultBaudRate || 115200);
  const [localPort, setLocalPort] = useState(config.serialShare?.defaultLocalPort || 8888);
  const [listenAddress, setListenAddress] = useState(config.serialShare?.defaultListenAddress || '0.0.0.0');
  const [accessPassword, setAccessPassword] = useState('');

  // 是否复用现有连接（由后端自动检测）
  const [shareExistingInfo, setShareExistingInfo] = useState<{ available: boolean; sessionName?: string }>({ available: false });

  // 自动检测是否有现有连接
  useEffect(() => {
    if (!selectedPort) {
      setShareExistingInfo({ available: false });
      return;
    }

    // 查找使用该串口的活跃会话
    const existingSession = Object.values(sessions).find(
      (s) => s.connectionType === ConnectionType.SERIAL &&
             s.serialPath?.toLowerCase() === selectedPort.toLowerCase() &&
             (s.connectionState === ConnectionState.CONNECTED ||
              s.connectionState === ConnectionState.CONNECTING)
    );

    if (existingSession) {
      setShareExistingInfo({
        available: true,
        sessionName: existingSession.name || existingSession.serialPath
      });
    } else {
      setShareExistingInfo({ available: false });
    }
  }, [selectedPort, sessions]);

  // SSH隧道配置 - 从配置文件加载最近使用的值
  const [enableSshTunnel, setEnableSshTunnel] = useState(false);
  const [sshConfig, setSshConfig] = useState<SshTunnelConfig>({
    host: config.serialShare?.recentSshTunnel?.host || '',
    port: config.serialShare?.recentSshTunnel?.port || 22,
    username: config.serialShare?.recentSshTunnel?.username || 'root',
    remotePort: config.serialShare?.recentSshTunnel?.remotePort || 8888,
    password: '',
  });

  // 根据选中的串口生成唯一的服务ID
  const serverId = selectedPort ? `serial-server-${selectedPort.replace(/[^a-zA-Z0-9]/g, '-')}` : '';

  // 加载串口列表
  const loadPorts = useCallback(async () => {
    setLoading(true);
    try {
      const portList = await window.qserial.serial.list();
      setPorts(portList);
    } catch (err) {
      setError(`加载串口列表失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPorts();
    }
  }, [isOpen, loadPorts]);

  // 轮询状态
  useEffect(() => {
    if (!isOpen || !serverId) return;
    const pollStatus = async () => {
      try {
        const s = await window.qserial.serialServer.getStatus(serverId);
        setStatus(s);
      } catch {
        setStatus(null);
      }
    };
    pollStatus();
    const timer = setInterval(pollStatus, 2000);
    return () => clearInterval(timer);
  }, [isOpen, serverId]);

  const handleStart = async () => {
    setError(null);
    setIsStarting(true);
    if (!serverId) {
      setError('请选择一个串口');
      setIsStarting(false);
      return;
    }
    try {
      const options: {
        id: string;
        serialPath: string;
        baudRate: number;
        dataBits: 5 | 6 | 7 | 8;
        stopBits: 1 | 1.5 | 2;
        parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
        localPort: number;
        listenAddress?: string;
        accessPassword?: string;
        sshTunnel?: {
          host: string;
          port: number;
          username: string;
          remotePort: number;
          privateKey?: string;
          password?: string;
        };
      } = {
        id: serverId,
        serialPath: selectedPort,
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        localPort,
        listenAddress,
        ...(accessPassword ? { accessPassword } : {}),
      };

      if (enableSshTunnel && sshConfig.host) {
        options.sshTunnel = {
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          remotePort: sshConfig.remotePort,
          ...(sshConfig.password ? { password: sshConfig.password } : {}),
        };
      }

      // 后端会自动检测现有连接并复用
      await window.qserial.serialServer.start(options);

      // 保存配置到配置文件
      updateConfig('serialShare', {
        defaultLocalPort: localPort,
        defaultListenAddress: listenAddress,
        recentSshTunnel: enableSshTunnel && sshConfig.host ? {
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          remotePort: sshConfig.remotePort,
          savePassword: false, // 不保存密码到配置文件
        } : undefined,
      });

      // 启动成功，显示提示对话框
      setShowSuccessDialog(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await window.qserial.serialServer.stop(serverId);
      setStatus(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const isRunning = status?.running ?? false;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
      <div className="dialog-content bg-surface rounded-xl w-[540px] max-h-[85vh] flex flex-col overflow-hidden border border-white/5">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            <h3 className="text-base font-semibold">串口共享</h3>
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

        <div className="space-y-4 flex-1 overflow-y-auto min-h-0 p-5">
          {/* 串口选择 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">本地串口</label>
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              disabled={isRunning}
              className="dialog-select"
            >
              <option value="">选择串口...</option>
              {ports.map((port) => (
                <option key={port.path} value={port.path}>
                  {port.path} - {port.manufacturer || port.serialNumber || 'Unknown'}
                </option>
              ))}
            </select>

            {/* 复用状态显示 */}
            <div className="mt-2 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${shareExistingInfo.available ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="text-xs text-text-secondary">
                {shareExistingInfo.available
                  ? `检测到现有连接: ${shareExistingInfo.sessionName || selectedPort}`
                  : '未检测到现有连接'}
              </span>
            </div>
            <p className="text-xs text-text-secondary/50 mt-1 ml-4">
              共享服务会自动检测并复用该串口的现有连接
            </p>
          </div>

          {/* 波特率 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">波特率</label>
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              disabled={isRunning}
              className="dialog-select"
            >
              {BAUD_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}
                </option>
              ))}
            </select>
          </div>

          {/* 本地监听端口 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">本地监听端口</label>
            <input
              type="number"
              value={localPort}
              onChange={(e) => setLocalPort(Number(e.target.value))}
              disabled={isRunning}
              className="dialog-input"
              min={1}
              max={65535}
            />
          </div>

          {/* 监听地址 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">监听地址</label>
            <select
              value={listenAddress}
              onChange={(e) => setListenAddress(e.target.value)}
              disabled={isRunning}
              className="dialog-select"
            >
              <option value="0.0.0.0">0.0.0.0 (所有接口 - 局域网可访问)</option>
              <option value="127.0.0.1">127.0.0.1 (仅本机)</option>
            </select>
            <p className="text-xs text-text-secondary/50 mt-1">
              选择 0.0.0.0 允许局域网内其他设备连接；选择 127.0.0.1 仅限本机访问
            </p>
          </div>

          {/* 访问密码 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              访问密码 <span className="text-text-secondary/50 font-normal">(可选，留空则无需认证)</span>
            </label>
            <input
              type="password"
              value={accessPassword}
              onChange={(e) => setAccessPassword(e.target.value)}
              disabled={isRunning}
              className="dialog-input"
              placeholder="留空则任何人可连接"
            />
            <p className="text-xs text-text-secondary/50 mt-1">
              设置密码后，客户端连接时需输入密码进行认证
            </p>
          </div>

          {/* SSH反向隧道 */}
          <div className="border-t border-border/50 pt-4">
            <label className="flex items-center gap-2.5 cursor-pointer mb-3">
              <input
                type="checkbox"
                id="sshTunnel"
                checked={enableSshTunnel}
                onChange={(e) => setEnableSshTunnel(e.target.checked)}
                disabled={isRunning}
                className="dialog-checkbox"
              />
              <span className="text-sm font-medium">启用SSH反向隧道</span>
            </label>

            {enableSshTunnel && (
              <div className="space-y-3 ml-6">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">远程服务器</label>
                    <input
                      type="text"
                      value={sshConfig.host}
                      onChange={(e) => setSshConfig((p) => ({ ...p, host: e.target.value }))}
                      disabled={isRunning}
                      className="dialog-input text-sm"
                      placeholder="192.168.1.100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">SSH端口</label>
                    <input
                      type="number"
                      value={sshConfig.port}
                      onChange={(e) => setSshConfig((p) => ({ ...p, port: Number(e.target.value) }))}
                      disabled={isRunning}
                      className="dialog-input text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">用户名</label>
                    <input
                      type="text"
                      value={sshConfig.username}
                      onChange={(e) => setSshConfig((p) => ({ ...p, username: e.target.value }))}
                      disabled={isRunning}
                      className="dialog-input text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">远程端口</label>
                    <input
                      type="number"
                      value={sshConfig.remotePort}
                      onChange={(e) => setSshConfig((p) => ({ ...p, remotePort: Number(e.target.value) }))}
                      disabled={isRunning}
                      className="dialog-input text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    密码 <span className="text-text-secondary/50 font-normal">(可选)</span>
                  </label>
                  <input
                    type="password"
                    value={sshConfig.password || ''}
                    onChange={(e) => setSshConfig((p) => ({ ...p, password: e.target.value }))}
                    disabled={isRunning}
                    className="dialog-input text-sm"
                    placeholder="留空则使用 ~/.ssh 下的默认密钥"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 状态 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500' : 'bg-gray-500'}`} />
              <span className="text-sm">
                {isRunning
                  ? `运行中 - ${selectedPort} -> ${status?.listenAddress || '0.0.0.0'}:${localPort}${status?.sshTunnelConnected ? ` (SSH隧道已连接)` : ''}${status?.hasPassword ? ' [已设密码]' : ''}`
                  : '已停止'}
              </span>
            </div>
            {isRunning && status && status.clients.length > 0 && (
              <div className="ml-5 text-xs text-text-secondary space-y-0.5">
                <p className="font-medium text-text-secondary/80">已连接客户端 ({status.clientCount})：</p>
                {status.clients.map((addr) => (
                  <p key={addr} className="ml-2 font-mono">{addr}</p>
                ))}
              </div>
            )}
            {isRunning && status && status.clientCount > 1 && (
              <p className="ml-5 text-xs text-yellow-500">
                多客户端同时操作可能导致数据混乱，建议同时只有一个客户端发送指令
              </p>
            )}
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
            {isRunning ? (
              <button
                onClick={handleStop}
                className="dialog-btn flex-1 bg-error text-white hover:bg-error/80 rounded-md"
              >
                停止共享
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={!selectedPort || isStarting}
                className="dialog-btn dialog-btn-primary flex-1 disabled:opacity-50"
              >
                {isStarting ? '启动中...' : '启动共享'}
              </button>
            )}
          </div>

          {/* 使用说明 */}
          <div className="text-xs text-text-secondary bg-background/50 rounded-lg p-3 space-y-1">
            <p className="font-medium text-text-secondary/80">使用方式：</p>
            <p>1. 远程Linux服务器执行: telnet localhost {'{远程端口}'} 即可操作串口</p>
            <p>2. 如启用SSH隧道，远程服务器需安装ssh并监听</p>
            <p>3. Windows需先启用Telnet客户端: dism /online /Enable-Feature /FeatureName:TelnetClient</p>
            <p>4. 也可使用 socat - localhost:{'{远程端口}'} 交互操作</p>
          </div>
        </div>

        {/* 关闭按钮 */}
        <div className="flex justify-end px-5 py-4 border-t border-border bg-background/30 flex-shrink-0">
          <button onClick={onClose} className="dialog-btn dialog-btn-secondary">
            关闭
          </button>
        </div>
      </div>

      {/* 启动成功提示对话框 */}
      {showSuccessDialog && (
        <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-[60]">
          <div className="dialog-content bg-surface rounded-xl p-5 w-[480px] max-h-[80vh] flex flex-col border border-white/5">
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2 text-success">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              串口共享已启动
            </h3>

            <div className="space-y-4 flex-1 overflow-y-auto">
              <div className="bg-background/50 rounded p-3">
                <p className="text-sm text-text-secondary mb-2">连接信息：</p>
                <div className="space-y-1 text-sm">
                  <p><span className="text-text-secondary">串口：</span>{selectedPort}</p>
                  <p><span className="text-text-secondary">波特率：</span>{baudRate}</p>
                  <p><span className="text-text-secondary">监听地址：</span>{listenAddress}:{localPort}</p>
                  {accessPassword && (
                    <p><span className="text-text-secondary">访问密码：</span>已设置</p>
                  )}
                  {enableSshTunnel && sshConfig.host && (
                    <p><span className="text-text-secondary">远程服务器：</span>{sshConfig.host}</p>
                  )}
                </div>
              </div>

              {enableSshTunnel && sshConfig.host ? (
                <>
                  <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
                    <p className="text-sm font-medium mb-2">在远程服务器 {sshConfig.host} 上执行：</p>
                    <div className="bg-background rounded-md p-2 font-mono text-sm">
                      telnet localhost {sshConfig.remotePort}
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(`telnet localhost ${sshConfig.remotePort}`)}
                      className="mt-2 px-3 py-1.5 text-sm bg-primary/20 hover:bg-primary/30 rounded-md transition-colors"
                    >
                      复制命令
                    </button>
                    {accessPassword && (
                      <p className="text-xs text-yellow-500 mt-2">
                        连接后直接输入密码 {accessPassword} 回车即可认证
                      </p>
                    )}
                  </div>

                  <div className="text-xs text-text-secondary bg-background/50 rounded-lg p-3">
                    <p className="font-medium text-text-secondary/80 mb-1">SSH反向隧道说明：</p>
                    <p>已建立从远程服务器端口 {sshConfig.remotePort} 到本地端口 {localPort} 的反向隧道。</p>
                    <p className="mt-1">在远程服务器上执行上述命令即可操作本地串口。</p>
                    <p className="mt-1 text-yellow-500">推荐使用 telnet 客户端连接，支持完整的终端交互功能。</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
                    <p className="text-sm font-medium mb-2">在同一局域网的设备上执行：</p>
                    <div className="bg-background rounded-md p-2 font-mono text-sm">
                      telnet {'<本机IP>'} {localPort}
                    </div>
                    <p className="text-xs text-text-secondary mt-2">
                      请将 {'<本机IP>'} 替换为本机的局域网 IP 地址
                    </p>
                    <button
                      onClick={async () => {
                        try {
                          const ip = await window.qserial.getLocalIp();
                          await navigator.clipboard.writeText(`telnet ${ip} ${localPort}`);
                        } catch {
                          await navigator.clipboard.writeText(`telnet <本机IP> ${localPort}`);
                        }
                      }}
                      className="mt-2 px-3 py-1.5 text-sm bg-primary/20 hover:bg-primary/30 rounded-md transition-colors"
                    >
                      复制命令
                    </button>
                    {accessPassword && (
                      <p className="text-xs text-yellow-500 mt-2">
                        连接后直接输入密码 {accessPassword} 回车即可认证
                      </p>
                    )}
                  </div>

                  <div className="text-xs text-text-secondary bg-background/50 rounded-lg p-3">
                    <p className="font-medium text-text-secondary/80 mb-1">本地局域网连接说明：</p>
                    <p>同一局域网内的其他设备可通过上述命令连接串口。</p>
                    <p className="mt-1">可在命令行执行 <code className="bg-background px-1 rounded">ipconfig</code> (Windows) 或 <code className="bg-background px-1 rounded">ifconfig</code> (Linux/Mac) 查看本机 IP。</p>
                    <p className="mt-1 text-yellow-500">推荐使用 telnet 客户端连接，支持完整的终端交互功能。Windows 需先启用: dism /online /Enable-Feature /FeatureName:TelnetClient</p>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end mt-4 pt-4 border-t border-border">
              <button
                onClick={() => setShowSuccessDialog(false)}
                className="dialog-btn dialog-btn-primary"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
