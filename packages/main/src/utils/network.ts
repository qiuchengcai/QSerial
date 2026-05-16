import * as os from 'node:os';

let cachedIp: string | null = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 秒

export function getLocalIp(): string {
  const now = Date.now();
  if (cachedIp !== null && now - cacheTime < CACHE_TTL) {
    return cachedIp;
  }

  let ip = '127.0.0.1';
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets) continue;
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        ip = net.address;
        break;
      }
    }
  }

  cachedIp = ip;
  cacheTime = now;
  return ip;
}
