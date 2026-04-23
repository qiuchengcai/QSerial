/**
 * QSerial Main Process Entry
 */

import { app, BrowserWindow, Menu } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { setupIpcHandlers } from './ipc/index.js';
import { ConfigManager } from './config/manager.js';
import { ConnectionFactory } from './connection/factory.js';
import { destroyTftpManager } from './tftp/manager.js';
import { destroyNfsManager } from './nfs/manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 兼容旧设备：启用 OpenSSL legacy provider 以支持 SHA1 签名和短密钥
// 必须在 app.ready 之前设置
app.commandLine.appendSwitch('openssl-legacy-provider', '');

// 支持从网络磁盘（UNC路径）运行：禁用沙箱限制
// Chromium 默认阻止从网络共享路径启动，添加以下开关可绕过此限制
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

let mainWindow: BrowserWindow | null = null;

// 单实例锁 - 确保一次只能运行一个 QSerial 程序
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 如果已经有实例在运行，退出当前实例
  console.log('Another instance is already running, quitting...');
  app.quit();
} else {
  // 当第二个实例启动时，聚焦到已有窗口
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

/**
 * 创建主窗口
 */
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

  // 开发环境加载 dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/dist/index.html'));
  }

  // 渲染进程重新加载时清理所有连接
  mainWindow.webContents.on('did-start-loading', async () => {
    console.log('Renderer reloading, cleaning up connections...');
    try {
      await ConnectionFactory.destroyAll();
    } catch (error) {
      console.error('Error cleaning up connections:', error);
    }
  });

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (config.maximized) {
      mainWindow?.maximize();
    }
  });

  // 保存窗口状态
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

  // 监听控制台消息
  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log('[Renderer]', message);
  });
}

/**
 * 应用初始化
 */
async function initialize(): Promise<void> {
  console.log('Initializing QSerial...');

  // 初始化配置
  await ConfigManager.initialize();
  console.log('Config initialized');

  // 初始化连接工厂
  ConnectionFactory.initialize();
  console.log('ConnectionFactory initialized');

  // 设置 IPC 处理器
  setupIpcHandlers();
  console.log('IPC handlers setup');
}

// 应用就绪
app.whenReady().then(async () => {
  console.log('App ready');
  await initialize();
  createWindow();

  // 注册 F12 快捷键切换开发者工具
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'toggleDevTools', accelerator: 'F12' },
      ],
    },
  ]));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出 (macOS 除外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前清理
app.on('before-quit', async () => {
  try {
    // 关闭所有连接
    await ConnectionFactory.destroyAll();
    // 停止 TFTP 服务器
    destroyTftpManager();
    // 停止 NFS 服务器
    destroyNfsManager();
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
});

// 捕获未处理的错误
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
