/**
 * QSerial Main Process Entry
 * 启动优化：窗口立即显示，重模块延迟加载
 */

import { app, BrowserWindow, Menu, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { ConfigManager } from './config/manager.js';

// 尽早注册未处理异常处理器，确保能捕获模块加载阶段的崩溃
process.on('uncaughtException', (error) => {
  console.error(`\n[FATAL] Uncaught Exception: ${error?.message}\n${error?.stack}\n`);
  process.exit(3);
});
process.on('unhandledRejection', (reason) => {
  console.error(`\n[FATAL] Unhandled Rejection: ${reason}\n`);
});

// 通用 process.dlopen 补丁：拦截所有 .node 文件加载，网络驱动器场景下自动复制到本地临时目录
import { ensureNativePatch } from './connection/native-patch.js';
ensureNativePatch();

// ESM imports 已执行完毕，node-pty 模块已加载。
import { ensurePtyPatch } from './connection/pty-patch.js';
ensurePtyPatch();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 崩溃日志文件
function crashLog(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(crashLogPath, line);
  } catch { /* ignore */ }
  console.log(line.trimEnd());
}
let crashLogPath: string;
try {
  crashLogPath = path.join(app.getPath('userData'), 'crash.log');
} catch {
  crashLogPath = path.join(process.cwd?.() || __dirname, 'crash.log');
}
crashLog('=== QSerial starting ===');

// 兼容旧设备：启用 OpenSSL legacy provider
app.commandLine.appendSwitch('openssl-legacy-provider', '');

// 支持从网络磁盘（UNC路径）运行
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-features', 'RendererCodeIntegrity');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.qserial.app');
}

let mainWindow: BrowserWindow | null = null;

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('Another instance is already running, quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow(): void {
  const config = ConfigManager.get('window');

  mainWindow = new BrowserWindow({
    width: config.width,
    height: config.height,
    x: config.x,
    y: config.y,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false,
    },
    show: false,
    backgroundColor: '#1E1E1E',
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDev = process.env.NODE_ENV === 'development';
    const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;" + (isDev ? " connect-src 'self' ws://localhost:5173 wss://localhost:5173" : "");
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/dist/index.html'));
  }

  mainWindow.webContents.on('did-start-loading', async () => {
    console.log('Renderer reloading, cleaning up connections...');
    try {
      const { ConnectionFactory } = await import('./connection/factory.js');
      await ConnectionFactory.destroyAll();
    } catch (error) {
      console.error('Error cleaning up connections:', error);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (config.maximized) {
      mainWindow?.maximize();
    }
  });

  mainWindow.on('close', () => {
    const bounds = mainWindow?.getBounds();
    if (bounds) {
      ConfigManager.set('window', {
        ...config,
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        maximized: mainWindow?.isMaximized() || false,
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    crashLog(`[CRASH] Renderer process gone: ${JSON.stringify(details)}`);
  });

  mainWindow.on('unresponsive', () => {
    crashLog('[CRASH] Window unresponsive');
  });

  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log('[Renderer]', message);
  });
}

// 初始化：窗口显示后再执行重量级初始化
app.whenReady().then(async () => {
  console.log('App ready');

  // 第一步：加载配置（读取小 JSON 文件，很快）
  await ConfigManager.initialize();
  console.log('Config initialized');

  // 第二步：立即创建并显示窗口（用户看到窗口）
  createWindow();

  // 第三步：后台初始化其余模块（不阻塞 UI）
  initBackgroundServices();

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'toggleDevTools', accelerator: 'F12' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', accelerator: 'CmdOrCtrl+R' },
        { role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+R' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((_err) => {
});

// 后台初始化重量级服务
async function initBackgroundServices(): Promise<void> {
  try {
    console.log('Initializing background services...');

    // 设置 IPC 处理器（handlers 内部使用动态 import）
    const { setupIpcHandlers } = await import('./ipc/index.js');
    setupIpcHandlers();
    console.log('IPC handlers setup');

    // ConnectionFactory 现在是轻量的（内部动态 import）
    const { ConnectionFactory } = await import('./connection/factory.js');
    ConnectionFactory.initialize();
    console.log('ConnectionFactory initialized');

    // NFS manager 延迟加载
    const { initNfsManager } = await import('./nfs/manager.js');
    initNfsManager();
    console.log('NFS manager initialized');

    // MCP 自动启动（如果已启用）
    const mcpConfig = ConfigManager.get('mcp');
    if (mcpConfig?.enabled) {
      try {
        const { startMcpServer } = await import('./mcp/manager.js');
        const port = mcpConfig.port || 9800;
        const listenAddress = mcpConfig.listenAddress || '0.0.0.0';
        const authPassword = mcpConfig.authPassword || '';
        await startMcpServer(port, listenAddress, authPassword);
        ConfigManager.set('mcp', { enabled: true, port, listenAddress, authPassword });
        console.log('MCP server auto-started on port', port);
      } catch (err) {
        console.error('MCP auto-start failed:', err);
      }
    }

    console.log('Background services initialized');
  } catch (err) {
    crashLog('[FATAL] init failed: ' + (err instanceof Error ? err.message : String(err)) + '\n' + (err instanceof Error ? err.stack || '' : ''));
    process.exit(3);
  }
}

// 所有窗口关闭时退出 (macOS 除外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前清理 - 使用动态 import 避免启动时加载
app.on('before-quit', () => {
  // NFS 清理（同步，确保 WinNFSd 进程终止）
  import('./nfs/manager.js').then(m => m.destroyNfsManager()).catch(() => {});
  // TFTP 清理
  import('./tftp/manager.js').then(m => m.destroyTftpManager()).catch(() => {});
  // FTP 清理
  import('./ftp/manager.js').then(m => m.destroyFtpManager()).catch(() => {});
});

app.on('before-quit', async () => {
  await import('./mcp/manager.js').then(m => m.destroyMcpManager()).catch(() => {});
});

app.on('before-quit', async () => {
  try {
    const { ConnectionFactory } = await import('./connection/factory.js');
    await ConnectionFactory.destroyAll();
  } catch (error) {
    console.error('Error cleaning up connections:', error);
  }
});

// 监控 GPU 进程和子进程崩溃
app.on('gpu-process-crashed', (_event, killed) => {
  crashLog(`[CRASH] GPU process crashed, killed: ${killed}`);
});

app.on('child-process-gone', (_event, details) => {
  crashLog(`[CRASH] Child process gone: ${JSON.stringify(details)}`);
});
