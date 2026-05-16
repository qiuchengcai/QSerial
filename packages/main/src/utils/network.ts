import * as os from 'node:os';

let cachedIp: string | null = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 秒

// 已知的虚拟网卡关键词（不向外部设备暴露这些 IP）
const VIRTUAL_KEYWORDS = [
  'vEthernet', 'VMware', 'VMnet', 'VirtualBox',
  'Bluetooth', 'Meta', 'Loopback', 'docker',
  'Hyper-V', 'Default Switch',
];

function isVirtualInterface(name: string): boolean {
  return VIRTUAL_KEYWORDS.some((kw) => name.toLowerCase().includes(kw.toLowerCase()));
}

export function getLocalIp(): string {
  const now = Date.now();
  if (cachedIp !== null && now - cacheTime < CACHE_TTL) {
    return cachedIp;
  }

  let fallbackIp = '127.0.0.1';
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets || isVirtualInterface(name)) continue;
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        // 跳过 169.254.x.x（链路本地地址，通常是无 DHCP 时的自动分配）
        if (net.address.startsWith('169.254.')) continue;
        cachedIp = net.address;
        cacheTime = now;
        return cachedIp;
      }
    }
  }

  // 没有找到物理网卡 IP，用第一个可用的非内网地址
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets) continue;
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        fallbackIp = net.address;
        break;
      }
    }
  }

  cachedIp = fallbackIp;
  cacheTime = now;
  return fallbackIp;
}
