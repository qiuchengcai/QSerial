/**
 * IPC 处理器
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@qserial/shared';
import { ConnectionFactory } from '../connection/factory.js';
import { SerialConnection } from '../connection/serial.js';
import { ConfigManager } from '../config/manager.js';
import { bufferToBase64 } from '@qserial/shared';

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
