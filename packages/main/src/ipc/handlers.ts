/**
 * IPC 处理器
 */

import { app, ipcMain, BrowserWindow, dialog } from 'electron';
import { IPC_CHANNELS } from '@qserial/shared';
import type { IConnection } from '@qserial/shared';
import { ConnectionFactory } from '../connection/factory.js';
import { SerialConnection } from '../connection/serial.js';
import { ConfigManager } from '../config/manager.js';
import { bufferToBase64 } from '@qserial/shared';
import {
  startTftpServer,
  stopTftpServer,
  getTftpStatus,
  setTftpMainWindow,
} from '../tftp/manager.js';
import * as fs from 'fs';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

/**
 * 安全发送消息到渲染进程
 */
function safeSend(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * 设置 IPC 处理器
 */
export function setupIpcHandlers(): void {
  // 获取主窗口
  mainWindow = BrowserWindow.getAllWindows()[0];

  // 监听窗口创建
  app.on('browser-window-created', (_, window) => {
    mainWindow = window;
  });

  // 连接管理
  setupConnectionHandlers();

  // 配置管理
  setupConfigHandlers();

  // 窗口管理
  setupWindowHandlers();

  // 应用信息
  setupAppHandlers();

  // TFTP 服务器
  setupTftpHandlers();

  // 日志保存
  setupLogHandlers();

  // 串口共享服务
  setupSerialServerHandlers();

  // 网络相关
  setupNetworkHandlers();

  // 文件操作
  setupFileHandlers();

  console.log('IPC handlers registered');
}

/**
 * 连接相关处理器
 */
function setupConnectionHandlers(): void {
  // 创建连接
  ipcMain.handle(IPC_CHANNELS.CONNECTION_CREATE, async (_, { options }) => {
    console.log('Creating connection:', options.type, options.id);
    try {
      const connection = await ConnectionFactory.create(options);
      console.log('Connection created:', connection.id);

      // 设置事件转发
      connection.onData((data) => {
        const base64Data = bufferToBase64(data);
        console.log('Data received for', connection.id, ':', base64Data.length, 'bytes');
        safeSend(IPC_CHANNELS.CONNECTION_DATA, {
          id: connection.id,
          data: base64Data,
        });
      });

      connection.onStateChange((state) => {
        console.log('Connection state changed:', connection.id, state);
        safeSend(IPC_CHANNELS.CONNECTION_STATE, {
          id: connection.id,
          state,
        });
      });

      connection.onError((error) => {
        console.error('Connection error:', connection.id, error);
        safeSend(IPC_CHANNELS.CONNECTION_ERROR, {
          id: connection.id,
          error: error.message,
        });
      });

      return { id: connection.id };
    } catch (error) {
      console.error('Failed to create connection:', error);
      throw error;
    }
  });

  // 打开连接
  ipcMain.handle(IPC_CHANNELS.CONNECTION_OPEN, async (_, { id }) => {
    console.log('Opening connection:', id);
    const connection = ConnectionFactory.get(id);
    if (!connection) throw new Error(`Connection ${id} not found`);
    try {
      // 检查是否是串口连接，如果是则查找是否有共享服务已打开该串口
      const { ConnectionType } = await import('@qserial/shared');
      if (connection.type === ConnectionType.SERIAL) {
        const serialOpts = connection.options as { path?: string };
        const serialPath = serialOpts.path?.toLowerCase();

        if (serialPath) {
          // 查找是否有 SerialServerConnection 已打开该串口
          const allConnections = ConnectionFactory.getAll();
          const serverConnection = allConnections.find((c) => {
            if (c.type !== ConnectionType.SERIAL_SERVER) return false;
            const serverOpts = c.options as { serialPath?: string };
            return serverOpts.serialPath?.toLowerCase() === serialPath;
          });

          if (serverConnection) {
            // 检查服务器连接是否有可用的串口
            const server = serverConnection as unknown as {
              serialPort?: { isOpen: boolean };
              sharedConnection?: IConnection;
            };
            const hasOwnPort = server.serialPort?.isOpen;
            const hasSharedConnection = !!server.sharedConnection;

            if (hasOwnPort || hasSharedConnection) {
              console.log(`[Connection] Found SerialServerConnection for ${serialPath}, will share connection`);
              // 获取服务器的底层连接用于共享
              const sharedConn = hasSharedConnection
                ? server.sharedConnection
                : serverConnection;
              // 调用 SerialConnection 的 openWithShared 方法
              await (connection as unknown as { openWithShared: (shared: IConnection) => Promise<void> }).openWithShared(sharedConn as IConnection);
              console.log('Connection opened with shared serial:', id);
              return;
            }
          }
        }
      }

      await connection.open();
      console.log('Connection opened:', id);
    } catch (error) {
      console.error('Failed to open connection:', id, error);
      throw error;
    }
  });

  // 关闭连接
  ipcMain.handle(IPC_CHANNELS.CONNECTION_CLOSE, async (_, { id }) => {
    console.log('Closing connection:', id);
    const connection = ConnectionFactory.get(id);
    if (!connection) throw new Error(`Connection ${id} not found`);
    await connection.close();
  });

  // 销毁连接
  ipcMain.handle(IPC_CHANNELS.CONNECTION_DESTROY, async (_, { id }) => {
    await ConnectionFactory.destroy(id);
  });

  // 写入数据
  ipcMain.handle(IPC_CHANNELS.CONNECTION_WRITE, async (_, { id, data }) => {
    const connection = ConnectionFactory.get(id);
    if (!connection) throw new Error(`Connection ${id} not found`);
    connection.write(data);
  });

  // 调整大小
  ipcMain.handle(IPC_CHANNELS.CONNECTION_RESIZE, async (_, { id, cols, rows }) => {
    const connection = ConnectionFactory.get(id);
    if (!connection) throw new Error(`Connection ${id} not found`);
    connection.resize(cols, rows);
  });

  // 获取连接状态
  ipcMain.handle(IPC_CHANNELS.CONNECTION_GET_STATE, async (_, { id }) => {
    const connection = ConnectionFactory.get(id);
    if (!connection) throw new Error(`Connection ${id} not found`);
    return { state: connection.state };
  });

  // 获取串口列表
  ipcMain.handle(IPC_CHANNELS.SERIAL_LIST, async () => {
    console.log('Listing serial ports...');
    const ports = await SerialConnection.listPorts();
    console.log('Found ports:', ports.length);
    return ports;
  });
}

/**
 * 配置相关处理器
 */
function setupConfigHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, (_, { key }) => {
    return ConfigManager.get(key);
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, (_, { key, value }) => {
    ConfigManager.set(key, value);
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_DELETE, (_, { key }) => {
    ConfigManager.delete(key);
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_ALL, () => {
    return ConfigManager.getAll();
  });
}

/**
 * 窗口相关处理器
 */
function setupWindowHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    mainWindow?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    mainWindow?.close();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_TITLE, (_, { title }) => {
    mainWindow?.setTitle(title);
  });
}

/**
 * 应用相关处理器
 */
function setupAppHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.APP_QUIT, () => {
    app.quit();
  });
}

/**
 * TFTP 相关处理器
 */
function setupTftpHandlers(): void {
  // 设置主窗口引用
  setTftpMainWindow(mainWindow);
  app.on('browser-window-created', (_, window) => {
    if (window === mainWindow) {
      setTftpMainWindow(window);
    }
  });

  // 启动 TFTP 服务器
  ipcMain.handle(IPC_CHANNELS.TFTP_START, async (_, { port, rootDir }) => {
    console.log('Starting TFTP server on port', port, 'root:', rootDir);
    try {
      startTftpServer(port, rootDir);
    } catch (error) {
      console.error('Failed to start TFTP server:', error);
      throw error;
    }
  });

  // 停止 TFTP 服务器
  ipcMain.handle(IPC_CHANNELS.TFTP_STOP, () => {
    console.log('Stopping TFTP server');
    stopTftpServer();
  });

  // 获取 TFTP 状态
  ipcMain.handle(IPC_CHANNELS.TFTP_GET_STATUS, () => {
    return getTftpStatus();
  });

  // 选择目录
  ipcMain.handle(IPC_CHANNELS.TFTP_PICK_DIR, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择 TFTP 共享目录',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
}

/**
 * 日志保存相关处理器
 */
function setupLogHandlers(): void {
  // 活跃的日志文件写入流
  const logStreams = new Map<string, fs.WriteStream>();

  // 选择保存文件路径
  ipcMain.handle(IPC_CHANNELS.LOG_PICK_FILE, async (_, { defaultName }) => {
    const result = await dialog.showSaveDialog({
      title: '选择日志保存位置',
      defaultPath: defaultName || `terminal-log-${new Date().toISOString().slice(0, 10)}.txt`,
      filters: [
        { name: '文本文件', extensions: ['txt'] },
        { name: '日志文件', extensions: ['log'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    return result.filePath;
  });

  // 开始记录日志
  ipcMain.handle(IPC_CHANNELS.LOG_START, async (_, { sessionId, filePath }) => {
    try {
      // 如果已有该 session 的日志流，先关闭
      const existingStream = logStreams.get(sessionId);
      if (existingStream) {
        existingStream.end();
      }

      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 创建写入流
      const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf-8' });
      logStreams.set(sessionId, stream);

      // 写入开始标记
      const timestamp = new Date().toLocaleString();
      stream.write(`\n========== 日志开始 [${timestamp}] ==========\n`);

      console.log('Log started for session:', sessionId, 'file:', filePath);
    } catch (error) {
      console.error('Failed to start log:', error);
      throw error;
    }
  });

  // 停止记录日志
  ipcMain.handle(IPC_CHANNELS.LOG_STOP, async (_, { sessionId }) => {
    const stream = logStreams.get(sessionId);
    if (stream) {
      // 写入结束标记
      const timestamp = new Date().toLocaleString();
      stream.write(`\n========== 日志结束 [${timestamp}] ==========\n`);
      stream.end();
      logStreams.delete(sessionId);
      console.log('Log stopped for session:', sessionId);
    }
  });

  // 写入日志数据
  ipcMain.handle(IPC_CHANNELS.LOG_WRITE, async (_, { sessionId, data }) => {
    const stream = logStreams.get(sessionId);
    if (stream && stream.writable) {
      stream.write(data);
    }
  });

  // 应用退出时关闭所有日志流
  app.on('before-quit', () => {
    for (const [, stream] of logStreams) {
      try {
        const timestamp = new Date().toLocaleString();
        stream.write(`\n========== 日志结束 [${timestamp}] ==========\n`);
        stream.end();
      } catch (e) {
        // 忽略错误
      }
    }
    logStreams.clear();
  });
}

/**
 * 串口共享服务相关处理器
 */
function setupSerialServerHandlers(): void {
  // 调试日志发送到渲染进程（使用模块级的 mainWindow）
  const sendDebugLog = (msg: string) => {
    console.log(msg);
    // 使用 safeSend 的方式发送到渲染进程
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.DEBUG_LOG, { message: msg, timestamp: Date.now() });
    }
  };

  ipcMain.handle(IPC_CHANNELS.SERIAL_SERVER_START, async (_, options) => {
    // 最开始就输出原始参数
    console.log('[SerialShare] RAW OPTIONS RECEIVED:', JSON.stringify(options, null, 2));

    const { ConnectionType } = await import('@qserial/shared');
    const { id, serialPath, baudRate, dataBits, stopBits, parity, localPort, sshTunnel } = options;

    const log = sendDebugLog;

    log(`[SerialShare] ========== START REQUEST ==========`);

    // 如果相同ID的服务器已存在，先销毁它
    const existingServer = ConnectionFactory.get(id);
    if (existingServer) {
      console.log(`[SerialShare] Destroying existing server: ${id}`);
      await ConnectionFactory.destroy(id);
    }

    // 始终查找是否已有该串口的连接（自动检测，不依赖前端参数）
    const allConnections = ConnectionFactory.getAll();
    log(`[SerialShare] Looking for existing connection on ${serialPath}`);
    log(`[SerialShare] Total connections in factory: ${allConnections.length}`);
    allConnections.forEach((c, i) => {
      const opts = c.options as { path?: string; serialPath?: string };
      log(`[SerialShare] Connection ${i}: type=${c.type}, path=${opts.path}, serialPath=${opts.serialPath}, id=${c.id}`);
    });

    // 查找该串口的现有连接
    const existingConnection = allConnections.find(
      (c) => {
        const opts = c.options as { path?: string; serialPath?: string };
        const matchPath = opts.path?.toLowerCase() === serialPath.toLowerCase();
        const matchSerialPath = opts.serialPath?.toLowerCase() === serialPath.toLowerCase();
        log(`[SerialShare] Checking connection ${c.id}: path=${opts.path}, matchPath=${matchPath}, matchSerialPath=${matchSerialPath}`);
        return c.type === ConnectionType.SERIAL && (matchPath || matchSerialPath);
      }
    );

    if (existingConnection) {
      log(`[SerialShare] ✓ Found existing connection for ${serialPath}, id=${existingConnection.id}, will reuse`);
    } else {
      log(`[SerialShare] ✗ No existing connection found for ${serialPath}, will create new serial connection`);
    }

    const connection = await ConnectionFactory.create({
      id,
      type: ConnectionType.SERIAL_SERVER,
      name: `串口共享-${serialPath}`,
      serialPath,
      baudRate,
      dataBits,
      stopBits,
      parity,
      localPort,
      sshTunnel,
      autoReconnect: false,
    });

    // 如果有现有连接，共享它；否则打开新串口
    await (connection as unknown as { open: (shared?: IConnection) => Promise<void> }).open(existingConnection);

    connection.onData((data) => {
      safeSend(IPC_CHANNELS.CONNECTION_DATA, {
        id: connection.id,
        data: bufferToBase64(data),
      });
    });

    connection.onStateChange((state) => {
      safeSend(IPC_CHANNELS.CONNECTION_STATE, { id: connection.id, state });
    });

    connection.onError((error) => {
      safeSend(IPC_CHANNELS.CONNECTION_ERROR, {
        id: connection.id,
        error: error.message,
      });
    });

    return { id: connection.id };
  });

  ipcMain.handle(IPC_CHANNELS.SERIAL_SERVER_STOP, async (_, { id }) => {
    await ConnectionFactory.destroy(id);
  });

  ipcMain.handle(IPC_CHANNELS.SERIAL_SERVER_STATUS, async (_, { id }) => {
    const connection = ConnectionFactory.get(id);
    if (!connection) return { running: false, serialPath: '', localPort: 0, clientCount: 0, sshTunnelConnected: false };
    return (connection as unknown as { getStatus: () => unknown }).getStatus();
  });
}

/**
 * 网络相关处理器
 */
function setupNetworkHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_LOCAL_IP, () => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];

    // 遍历所有网络接口
    Object.keys(interfaces).forEach((name) => {
      const nets = interfaces[name];
      if (!nets) return;

      nets.forEach((net: { family: string; internal: boolean; address: string }) => {
        // 只获取 IPv4 地址，跳过内部地址
        if (net.family === 'IPv4' && !net.internal) {
          addresses.push(net.address);
        }
      });
    });

    // 返回第一个非内部 IPv4 地址，如果没有则返回 localhost
    return addresses.length > 0 ? addresses[0] : '127.0.0.1';
  });
}

/**
 * 文件操作相关处理器
 */
function setupFileHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.READ_FILE, async (_, { path: filePath }) => {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      console.error('Failed to read file:', filePath, error);
      throw error;
    }
  });
}
