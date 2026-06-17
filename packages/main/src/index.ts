/**
 * QSerial Main Process Entry
 * 启动优化：窗口立即显示，重模块延迟加载
 */

import { app, BrowserWindow, nativeImage, Menu, session } from 'electron';
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
import { ensureNativePatch } from './services/connection/native-patch.js';
ensureNativePatch();

// ESM imports 已执行完毕，node-pty 模块已加载。
import { ensurePtyPatch } from './services/connection/pty-patch.js';
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
  app.setAppUserModelId('com.qserial.serialtool');
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
    icon: nativeImage.createFromPath(path.join(process.resourcesPath, 'icon.png')),
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

  // Register F12 devtools shortcut for production builds
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && !input.control && !input.alt && !input.meta && !input.shift) {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('did-start-loading', async () => {
    console.log('Renderer reloading, cleaning up connections...');
    try {
      const { ConnectionFactory } = await import('./services/connection/factory.js');
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

  function buildAppMenu(lang: string) {
    const t = (zh: string, en: string) => lang === 'en-US' ? en : zh;
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: t('文件(F)', '&File'),
        submenu: [
          { label: t('新建连接', 'New Connection'), accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:new-connection') },
          { type: 'separator' },
          { label: t('设置', 'Settings'), accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('menu:open-settings') },
          { type: 'separator' },
          { role: 'quit', label: t('退出', 'Quit') },
        ],
      },
      {
        label: t('编辑(E)', '&Edit'),
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: t('视图(V)', '&View'),
        submenu: [
          { role: 'reload', label: t('重新加载', 'Reload') },
          { role: 'forceReload' },
          { role: 'toggleDevTools', accelerator: 'F12' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: t('连接(C)', '&Connection'),
        submenu: [
          { label: t('串口...', 'Serial...'), click: () => mainWindow?.webContents.send('menu:open-serial') },
          { label: t('SSH...', 'SSH...'), click: () => mainWindow?.webContents.send('menu:open-ssh') },
          { label: t('Telnet...', 'Telnet...'), click: () => mainWindow?.webContents.send('menu:open-telnet') },
          { label: t('本地终端...', 'Local Terminal...'), click: () => mainWindow?.webContents.send('menu:open-pty') },
          { type: 'separator' },
          { label: t('断开连接', 'Disconnect'), accelerator: 'CmdOrCtrl+D', click: () => mainWindow?.webContents.send('menu:disconnect') },
        ],
      },
      {
        label: t('工具(T)', '&Tools'),
        submenu: [
          { label: 'TFTP', click: () => mainWindow?.webContents.send('menu:open-tftp') },
          { label: 'NFS', click: () => mainWindow?.webContents.send('menu:open-nfs') },
          { label: 'FTP', click: () => mainWindow?.webContents.send('menu:open-ftp') },
          { label: 'MCP', click: () => mainWindow?.webContents.send('menu:open-mcp') },
          { type: 'separator' },
          { label: t('连接共享...', 'Connection Share...'), click: () => mainWindow?.webContents.send('menu:open-share') },
        ],
      },
      {
        label: t('帮助(H)', '&Help'),
        submenu: [
          { label: t('关于 QSerial', 'About QSerial'), click: () => mainWindow?.webContents.send('menu:about') },
        ],
      },
    ]));
  }

  const lang = ConfigManager.get('app').language || 'zh-CN';
  buildAppMenu(lang);
  ConfigManager.onChange((key: string) => {
    if (key === 'app.language') {
      const newLang = ConfigManager.get('app').language || 'zh-CN';
      buildAppMenu(newLang);
    }
  });


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
    const { ConnectionFactory } = await import('./services/connection/factory.js');
    ConnectionFactory.initialize();
    console.log('ConnectionFactory initialized');

    // NFS manager 延迟加载
    const { initNfsManager } = await import('./services/nfs/manager.js');
    initNfsManager();
    console.log('NFS manager initialized');
    // MCP 延迟启动（窗口显示2秒后再启动，避免阻塞UI）
    const mcpConfig2 = ConfigManager.get("mcp");
    if (mcpConfig2?.enabled) {
      const port2 = mcpConfig2.port || 9800;
      const listenAddress2 = mcpConfig2.listenAddress || "127.0.0.1";
      const authPassword2 = mcpConfig2.authPassword || "";
      setTimeout(async () => {
        try {
          const { startMcpServer } = await import("./services/mcp/manager.js");
          await startMcpServer(port2, listenAddress2, authPassword2);
          ConfigManager.set("mcp", { enabled: true, port: port2, listenAddress: listenAddress2, authPassword: authPassword2 });
          console.log("MCP server started on port", port2, "(delayed)");
        } catch (err2) {
          console.error("MCP auto-start failed:", err2);
        }
      }, 2000);
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
  import('./services/nfs/manager.js').then(m => m.destroyNfsManager()).catch(() => {});
  // TFTP 清理
  import('./services/tftp/manager.js').then(m => m.destroyTftpManager()).catch(() => {});
  // FTP 清理
  import('./services/ftp/manager.js').then(m => m.destroyFtpManager()).catch(() => {});
});

app.on('before-quit', async () => {
  await import('./services/mcp/manager.js').then(m => m.destroyMcpManager()).catch(() => {});
});

app.on('before-quit', async () => {
  try {
    const { ConnectionFactory } = await import('./services/connection/factory.js');
    await ConnectionFactory.destroyAll();
  } catch (error) {
    console.error('Error cleaning up connections:', error);
  }
});

// 监控 GPU 进程和子进程崩溃

app.on('child-process-gone' as any, (_event: any, details: any) => {
  crashLog(`[CRASH] Child process gone: ${JSON.stringify(details)}`);
});
