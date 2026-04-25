/**
 * FTP 服务器管理器
 * 使用 ftp-srv 库提供 FTP 服务
 */

import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';
import {
  IPC_CHANNELS,
  type FtpServerStatus,
  type FtpStatusEvent,
  type FtpClientInfo,
  type FtpClientEvent,
} from '@qserial/shared';

// ESM 环境下需要 createRequire 来使用 require/require.resolve
const nodeRequire = createRequire(import.meta.url);

// ftp-srv 依赖链较深（yargs/bunyan/glob 等），打包到 asar 中无法正确解析
// 因此通过 extraResources 打平安装，运行时动态加载
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let FtpSrv: any = null;

/**
 * 获取 ftp-srv 入口文件的加载路径
 */
function getFtpSrvEntryPath(): string {
  // 开发环境：直接从 node_modules 加载（pnpm 的符号链接可以正常工作）
  try {
    const pkgPath = nodeRequire.resolve('ftp-srv/package.json');
    const pkgDir = path.dirname(pkgPath);
    const entryPath = path.join(pkgDir, 'ftp-srv.js');
    if (fs.existsSync(entryPath)) return entryPath;
  } catch {
    // 忽略，尝试其他路径
  }
  const devEntry = path.join(process.cwd(), 'node_modules', 'ftp-srv', 'ftp-srv.js');
  if (fs.existsSync(devEntry)) {
    return devEntry;
  }
  // 生产环境：从 extraResources 加载（尝试多种路径结构）
  const candidates = [
    path.join(process.resourcesPath, 'resources', 'ftp-node-modules', 'node_modules', 'ftp-srv', 'ftp-srv.js'),
    path.join(process.resourcesPath, 'ftp-node-modules', 'node_modules', 'ftp-srv', 'ftp-srv.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('找不到 ftp-srv 模块');
}

/**
 * 动态加载 ftp-srv
 */
function loadFtpSrv(): void {
  if (FtpSrv) return;

  // 先设置 NODE_PATH，确保 ftp-srv 内部的 require('lodash') 等可以正确解析
  const ftpNodeModulesCandidates = [
    // extraResources: { from: 'resources', to: 'resources' }
    path.join(process.resourcesPath, 'resources', 'ftp-node-modules', 'node_modules'),
    // 直接放在 resources 下
    path.join(process.resourcesPath, 'ftp-node-modules', 'node_modules'),
  ];
  for (const ftpNodeModules of ftpNodeModulesCandidates) {
    if (fs.existsSync(ftpNodeModules) && !process.env.NODE_PATH?.includes(ftpNodeModules)) {
      process.env.NODE_PATH = ftpNodeModules + (process.env.NODE_PATH ? path.delimiter + process.env.NODE_PATH : '');
      nodeRequire('module')._initPaths();
      break;
    }
  }

  try {
    const ftpSrvEntryPath = getFtpSrvEntryPath();
    // 在 ftp-srv 所在目录创建 require，确保 ftp-srv 内部的相对 require 能正确解析
    const localRequire = createRequire(ftpSrvEntryPath);
    const mod = localRequire(ftpSrvEntryPath);
    // ftp-srv 导出: module.exports = FtpSrv (构造函数)
    // 同时有 module.exports.FtpSrv = FtpSrv
    FtpSrv = typeof mod === 'function' ? mod : mod.FtpSrv || mod.default;
    if (typeof FtpSrv !== 'function') {
      throw new Error(`模块导出类型异常: ${typeof mod}, keys: ${Object.keys(mod).join(',')}`);
    }
  } catch (err) {
    console.error('[FTP] Failed to load ftp-srv:', err);
    throw new Error(`加载 ftp-srv 失败: ${(err as Error).message}`);
  }
}

let mainWindow: BrowserWindow | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let server: any = null;
let serverRunning = false;
let currentStatus: FtpServerStatus = {
  running: false,
  port: 2121,
  rootDir: '',
  username: 'anonymous',
  hasPassword: false,
};

// 客户端连接跟踪
const connectedClients = new Map<string, FtpClientInfo>();

/**
 * 设置主窗口引用
 */
export function setFtpMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

/**
 * 安全发送状态事件到渲染进程
 */
function sendStatusEvent(event: FtpStatusEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.FTP_STATUS_EVENT, event);
  }
}

/**
 * 安全发送客户端事件到渲染进程
 */
function sendClientEvent(event: FtpClientEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.FTP_CLIENT_EVENT, event);
  }
}

/**
 * 获取本机非内部 IPv4 地址
 */
function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets) continue;
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * 启动 FTP 服务器
 */
export async function startFtpServer(port: number, rootDir: string, username: string, password: string): Promise<void> {
  // 如果已在运行，先停止
  if (serverRunning || server) {
    await stopFtpServer();
  }

  // 检查目录是否存在
  if (!rootDir || !fs.existsSync(rootDir)) {
    throw new Error(`共享目录不存在: ${rootDir}`);
  }

  // 动态加载 ftp-srv
  try {
    loadFtpSrv();
  } catch (err) {
    throw new Error(`加载 FTP 服务模块失败: ${(err as Error).message}`);
  }

  if (!FtpSrv) {
    throw new Error('FTP 服务模块加载失败');
  }

  try {
    const localIp = getLocalIp();
    server = new FtpSrv({
      url: `ftp://0.0.0.0:${port}`,
      anonymous: username === 'anonymous',
      pasv_url: localIp,
    });

    // 处理登录
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.on('login', (data: any, resolve: any, reject: any) => {
      try {
        const connection = data?.connection;
        const user = data?.username;
        const pass = data?.password;

        // 记录客户端连接
        const clientIp = connection?.ip || 'unknown';
        const clientKey = connection?.id || String(Date.now());
        connectedClients.set(clientKey, {
          address: clientIp,
          userName: user,
        });
        sendClientEvent({
          address: clientIp,
          userName: user,
          action: 'connected',
        });

        // 验证用户名密码
        if (username !== 'anonymous' && user !== username) {
          reject(new Error('用户名错误'));
          return;
        }
        if (username !== 'anonymous' && password && pass !== password) {
          reject(new Error('密码错误'));
          return;
        }

        // 设置根目录
        resolve({ root: rootDir });
      } catch (err) {
        console.error('[FTP] Login handler error:', err);
        reject(new Error('内部错误'));
      }
    });

    // 监听客户端断开
    server.on('disconnect', ({ connection }: { connection: { id?: string } }) => {
      try {
        const clientKey = connection?.id;
        if (clientKey) {
          const info = connectedClients.get(clientKey);
          connectedClients.delete(clientKey);
          if (info) {
            sendClientEvent({
              address: info.address,
              userName: info.userName,
              action: 'disconnected',
            });
          }
        }
      } catch (err) {
        console.error('[FTP] Disconnect handler error:', err);
      }
    });

    // 监听客户端错误
    server.on('client-error', ({ error }: { error: Error }) => {
      console.error('[FTP] Client error:', error?.message || error);
    });

    // 启动服务器
    await server.listen();

    serverRunning = true;
    currentStatus = {
      running: true,
      port,
      rootDir,
      username,
      hasPassword: !!password,
    };

    sendStatusEvent({ running: true });
  } catch (error) {
    server = null;
    serverRunning = false;
    throw new Error(`FTP 服务器启动失败: ${(error as Error).message}`);
  }
}

/**
 * 停止 FTP 服务器
 */
export async function stopFtpServer(): Promise<void> {
  if (server) {
    try {
      await server.close();
    } catch (error) {
      console.error('[FTP] Error stopping server:', error);
    }
    server = null;
  }

  serverRunning = false;
  connectedClients.clear();
  currentStatus = {
    running: false,
    port: 2121,
    rootDir: '',
    username: 'anonymous',
    hasPassword: false,
  };

  sendStatusEvent({ running: false });
}

/**
 * 获取 FTP 服务器状态
 */
export function getFtpStatus(): FtpServerStatus {
  return { ...currentStatus };
}

/**
 * 获取 FTP 客户端列表
 */
export function getFtpClients(): FtpClientInfo[] {
  return Array.from(connectedClients.values());
}

/**
 * 销毁 FTP 管理器
 */
export async function destroyFtpManager(): Promise<void> {
  await stopFtpServer();
}
