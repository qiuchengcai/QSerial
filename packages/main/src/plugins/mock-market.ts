/**
 * 开发联调用 Mock 市场数据（仅在 mock 开关开启时生效，生产默认关闭）。
 *
 * 开关：config `pluginMarket.mock`（默认 true）或环境变量 `QSERIAL_MOCK_MARKET=0` 关闭。
 * 生产环境应在 config 中显式设置 false 或移除本模块依赖。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MarketIndex, MarketPluginItem } from '@qserial/shared';
import { ConfigManager } from '../config/manager.js';

export function isMockMarketEnabled(): boolean {
  const fromConfig = ConfigManager.get<boolean>('pluginMarket.mock');
  if (fromConfig !== undefined) return fromConfig;
  return process.env.QSERIAL_MOCK_MARKET === '1';
}

/** 8 个 mock 插件，覆盖工具/协议/MCP/设备识别 + 未安装/已安装有更新/不兼容。 */
export const MOCK_MARKET_INDEX: MarketIndex = {
  meta: { version: '1', updatedAt: '2026-09-06T00:00:00Z', sourceName: 'QSerial Mock 源' },
  plugins: [
    {
      id: 'serial-debug-helper',
      name: '串口调试助手',
      version: '1.2.0',
      author: 'QSerial Team',
      description: '增强串口调试体验：自动记录收发帧、时间戳标注、十六进制与 ASCII 双视图切换。',
      tags: ['工具'],
      downloadUrl: 'https://mock.local/serial-debug-helper.zip',
      hash: 'mock',
      size: 245760,
      releaseDate: '2026-08-20T00:00:00Z',
      homepage: 'https://example.com/serial-debug-helper',
      downloads: 18320,
      rating: 4.7,
    },
    {
      id: 'log-analyzer',
      name: '终端日志分析器',
      version: '0.9.5',
      author: 'DataOps',
      description: '实时解析终端输出，高亮错误/警告，按关键字聚合统计，一键导出分析报告。',
      tags: ['工具'],
      downloadUrl: 'https://mock.local/log-analyzer.zip',
      hash: 'mock',
      size: 189440,
      releaseDate: '2026-07-15T00:00:00Z',
      downloads: 9053,
      rating: 4.2,
    },
    {
      id: 'modbus-tools',
      name: 'Modbus 协议工具',
      version: '2.0.1',
      author: 'IoT Factory',
      description: 'Modbus RTU/TCP 主从站模拟、寄存器读写、报文解析与 CRC 校验。',
      tags: ['协议'],
      downloadUrl: 'https://mock.local/modbus-tools.zip',
      hash: 'mock',
      size: 512000,
      releaseDate: '2026-08-30T00:00:00Z',
      downloads: 12480,
      rating: 4.5,
    },
    {
      id: 'mqtt-client',
      name: 'MQTT 客户端',
      version: '1.1.0',
      author: 'CloudLink',
      description: 'MQTT 3.1.1/5.0 订阅发布、主题过滤、QoS 配置与消息日志。',
      tags: ['协议'],
      downloadUrl: 'https://mock.local/mqtt-client.zip',
      hash: 'mock',
      size: 301056,
      releaseDate: '2026-06-10T00:00:00Z',
      downloads: 7621,
      rating: 4.1,
    },
    {
      id: 'qserial-plugin-device-profiles',
      name: '设备识别扩展（内置升级）',
      version: '1.1.0',
      author: 'QSerial Team',
      description: '内置设备识别插件的市场版本，新增更多嵌入式设备指纹。',
      tags: ['MCP', '设备识别'],
      downloadUrl: 'https://mock.local/device-profiles.zip',
      hash: 'mock',
      size: 81920,
      releaseDate: '2026-09-01T00:00:00Z',
      downloads: 25001,
      rating: 4.8,
    },
    {
      id: 'ai-command-gen',
      name: 'AI 命令生成器',
      version: '0.8.0',
      author: 'AI Lab',
      description: '基于自然语言描述自动生成终端命令序列，支持常用嵌入式设备运维场景。',
      tags: ['MCP'],
      downloadUrl: 'https://mock.local/ai-command-gen.zip',
      hash: 'mock',
      size: 423936,
      releaseDate: '2026-08-01T00:00:00Z',
      downloads: 5310,
      rating: 4.4,
    },
    {
      id: 'network-device-profiles',
      name: '网络设备指纹库',
      version: '1.0.0',
      author: 'NetSec',
      description: '路由器/交换机/防火墙设备识别指纹，覆盖主流厂商命令行特征。',
      tags: ['设备识别'],
      downloadUrl: 'https://mock.local/network-device-profiles.zip',
      hash: 'mock',
      size: 147456,
      releaseDate: '2026-05-20T00:00:00Z',
      downloads: 3876,
      rating: 3.9,
    },
    {
      id: 'automotive-profiles',
      name: '车载设备识别',
      version: '2.5.0',
      author: 'AutoDev',
      description: '车载 ECU / 车机调试接口识别（需要更高宿主版本）。',
      tags: ['设备识别'],
      downloadUrl: 'https://mock.local/automotive-profiles.zip',
      hash: 'mock',
      size: 204800,
      releaseDate: '2026-09-05T00:00:00Z',
      downloads: 1204,
      rating: 4.0,
      minHostVersion: '9.0.0',
    },
  ],
};

/**
 * 生成一个 mock 插件目录（package.json + index.mjs），供 mock 安装模拟使用。
 */
export function generateMockPluginDir(item: MarketPluginItem, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    name: item.id,
    version: item.version,
    author: item.author,
    description: item.description,
    main: 'index.mjs',
    qserial: {
      id: item.id,
      permissions: ['log'],
      builtin: false,
    },
  };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(dir, 'index.mjs'),
    `export function activate(ctx) {\n  ctx.log.info('mock plugin ${item.name} activated');\n}\nexport function deactivate() {}\n`
  );
}
