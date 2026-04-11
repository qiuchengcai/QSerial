/**
 * 串口连接对话框组件
 */

import React, { useState, useEffect } from 'react';
import { ConnectionType, type SerialPortInfo } from '@qserial/shared';

interface SerialConnectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (options: SerialConnectOptions & { saveConfig?: boolean; configName?: string }) => void;
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl w-[400px] max-h-[90vh] overflow-auto">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium">串口连接</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-hover"
          >
            ×
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4">
          {/* 串口选择 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">串口</label>
            <div className="flex gap-2">
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                className="flex-1 px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-primary"
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
                className="px-3 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
                title="刷新"
              >
                {loading ? '...' : '刷新'}
              </button>
            </div>
          </div>

          {/* 波特率 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">波特率</label>
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-primary"
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
              <label className="block text-sm text-text-secondary mb-1">数据位</label>
              <select
                value={dataBits}
                onChange={(e) => setDataBits(Number(e.target.value) as 5 | 6 | 7 | 8)}
                className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-primary"
              >
                {DATA_BITS.map((bits) => (
                  <option key={bits} value={bits}>
                    {bits}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1">停止位</label>
              <select
                value={stopBits}
                onChange={(e) => setStopBits(Number(e.target.value) as 1 | 2)}
                className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-primary"
              >
                {STOP_BITS.map((bits) => (
                  <option key={bits} value={bits}>
                    {bits}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1">校验位</label>
              <select
                value={parity}
                onChange={(e) => setParity(e.target.value as typeof parity)}
                className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-primary"
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
          <div className="p-3 bg-background rounded border border-border">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveConfig}
                onChange={(e) => setSaveConfig(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">保存此配置</span>
            </label>
            {saveConfig && (
              <input
                type="text"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="输入配置名称，如：Arduino、ESP32..."
                className="w-full mt-2 px-3 py-2 bg-surface border border-border rounded focus:outline-none focus:border-primary text-sm"
              />
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          {/* 选中串口信息 */}
          {selectedPort && (
            <div className="text-xs text-text-secondary p-2 bg-background rounded">
              {(() => {
                const port = ports.find(p => p.path === selectedPort);
                if (!port) return null;
                return (
                  <>
                    {port.manufacturer && <div>制造商: {port.manufacturer}</div>}
                    {port.serialNumber && <div>序列号: {port.serialNumber}</div>}
                    {port.vendorId && <div>VID: {port.vendorId}</div>}
                    {port.productId && <div>PID: {port.productId}</div>}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded hover:bg-hover"
          >
            取消
          </button>
          <button
            onClick={handleConnect}
            disabled={!selectedPort || loading}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
          >
            连接
          </button>
        </div>
      </div>
    </div>
  );
};
