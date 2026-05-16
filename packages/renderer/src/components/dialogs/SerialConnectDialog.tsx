/**
 * 串口连接对话框组件
 */

import React, { useState, useEffect } from 'react';
import { ConnectionType, type SerialPortInfo } from '@qserial/shared';
import type { SavedSession } from '@/stores/sessions';

interface SerialConnectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (options: SerialConnectOptions & { saveConfig?: boolean; configName?: string }) => void;
  editSession?: SavedSession | null;
}

export interface SerialConnectOptions {
  path: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const DATA_BITS = [5, 6, 7, 8] as const;
const STOP_BITS = [1, 2] as const;
const PARITY_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'even', label: '偶校验' },
  { value: 'odd', label: '奇校验' },
] as const;

export const SerialConnectDialog: React.FC<SerialConnectDialogProps> = ({
  isOpen,
  onClose,
  onConnect,
  editSession,
}) => {
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedPort, setSelectedPort] = useState<string>('');
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [dataBits, setDataBits] = useState<5 | 6 | 7 | 8>(8);
  const [stopBits, setStopBits] = useState<1 | 2>(1);
  const [parity, setParity] = useState<'none' | 'even' | 'odd' | 'mark' | 'space'>('none');
  const [saveConfig, setSaveConfig] = useState(false);
  const [configName, setConfigName] = useState('');

  // 加载串口列表
  useEffect(() => {
    if (isOpen) {
      loadPorts();
    }
  }, [isOpen]);

  // 编辑模式：加载已有配置
  useEffect(() => {
    if (editSession?.serialConfig) {
      setSelectedPort(editSession.serialConfig.path);
      setBaudRate(editSession.serialConfig.baudRate);
      setDataBits(editSession.serialConfig.dataBits);
      setStopBits(editSession.serialConfig.stopBits);
      setParity(editSession.serialConfig.parity);
      setConfigName(editSession.name);
      setSaveConfig(true);
    }
  }, [editSession]);

  const loadPorts = async () => {
    setLoading(true);
    setError(null);
    try {
      const portList = await window.qserial.serial.list();
      setPorts(portList);
      if (portList.length > 0 && !selectedPort) {
        setSelectedPort(portList[0].path);
      }
    } catch (err) {
      setError('获取串口列表失败: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    if (!selectedPort) {
      setError('请选择串口');
      return;
    }

    if (saveConfig && !configName.trim()) {
      setError('请输入配置名称');
      return;
    }

    onConnect({
      path: selectedPort,
      baudRate,
      dataBits,
      stopBits,
      parity,
      saveConfig,
      configName: configName.trim() || undefined,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 dialog-overlay flex items-center justify-center z-50">
      <div className="dialog-content bg-surface rounded-xl w-[420px] max-h-[90vh] overflow-hidden border border-white/5">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z"/>
              <path d="M19 10v2a7 7 0 01-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="8" y1="22" x2="16" y2="22"/>
            </svg>
            <h2 className="text-base font-semibold">{editSession ? '编辑串口配置' : '串口连接'}</h2>
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

        {/* 内容 */}
        <div className="p-5 space-y-4">
          {/* 串口选择 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">串口</label>
            <div className="flex gap-2">
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                className="dialog-select flex-1"
                disabled={loading || ports.length === 0}
              >
                {ports.length === 0 ? (
                  <option value="">未检测到串口</option>
                ) : (
                  ports.map((port) => (
                    <option key={port.path} value={port.path}>
                      {port.path}
                      {port.manufacturer ? ` - ${port.manufacturer}` : ''}
                    </option>
                  ))
                )}
              </select>
              <button
                onClick={loadPorts}
                disabled={loading}
                className="dialog-btn dialog-btn-secondary px-3 flex items-center gap-1.5 disabled:opacity-50"
                title="刷新串口列表"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.3"/>
                </svg>
                {loading ? '' : '刷新'}
              </button>
            </div>
          </div>

          {/* 波特率 */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">波特率</label>
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              className="dialog-select"
            >
              {BAUD_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}
                </option>
              ))}
            </select>
          </div>

          {/* 数据位、停止位、校验位 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">数据位</label>
              <select
                value={dataBits}
                onChange={(e) => setDataBits(Number(e.target.value) as 5 | 6 | 7 | 8)}
                className="dialog-select"
              >
                {DATA_BITS.map((bits) => (
                  <option key={bits} value={bits}>
                    {bits}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">停止位</label>
              <select
                value={stopBits}
                onChange={(e) => setStopBits(Number(e.target.value) as 1 | 2)}
                className="dialog-select"
              >
                {STOP_BITS.map((bits) => (
                  <option key={bits} value={bits}>
                    {bits}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">校验位</label>
              <select
                value={parity}
                onChange={(e) => setParity(e.target.value as typeof parity)}
                className="dialog-select"
              >
                {PARITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 保存配置 */}
          <div className="p-3 bg-background/50 rounded-lg border border-border/50">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={saveConfig}
                onChange={(e) => setSaveConfig(e.target.checked)}
                className="dialog-checkbox"
              />
              <span className="text-sm">保存此配置</span>
            </label>
            {saveConfig && (
              <input
                type="text"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="配置名称，如：Arduino、ESP32..."
                className="dialog-input mt-2.5"
              />
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-error bg-error/10 border-l-2 border-error px-3 py-2.5 rounded-r-lg">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="flex-shrink-0">
                <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM7.75 4v3.5a.75.75 0 01-1.5 0V4a.75.75 0 011.5 0z"/>
              </svg>
              {error}
            </div>
          )}

          {/* 选中串口信息 */}
          {selectedPort && (() => {
            const port = ports.find(p => p.path === selectedPort);
            if (!port) return null;
            return (
              <div className="text-xs text-text-secondary p-2.5 bg-background/50 rounded-lg space-y-0.5">
                {port.manufacturer && <div>制造商: {port.manufacturer}</div>}
                {port.serialNumber && <div>序列号: {port.serialNumber}</div>}
                {port.vendorId && <div>VID: {port.vendorId}</div>}
                {port.productId && <div>PID: {port.productId}</div>}
              </div>
            );
          })()}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-border bg-background/30">
          <button
            onClick={onClose}
            className="dialog-btn dialog-btn-secondary"
          >
            取消
          </button>
          <button
            onClick={handleConnect}
            disabled={!selectedPort || loading}
            className="dialog-btn dialog-btn-primary disabled:opacity-50"
          >
            {editSession ? '保存' : '连接'}
          </button>
        </div>
      </div>
    </div>
  );
};
