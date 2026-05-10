/**
 * IPC 处理器
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@qserial/shared';
import type { IConnection } from '@qserial/shared';
import { ConnectionFactory } from '../connection/factory.js';
import { SerialConnection } from '../connection/serial.js';
import { ConnectionServerConnection } from '../connection/connectionServer.js';
import { ConfigManager } from '../config/manager.js';
import { getLocalIp } from '../utils/network.js';
import { bufferToBase64 } from '@qserial/shared';
import {
  startTftpServer,
  stopTftpServer,
  getTftpStatus,
  setTftpMainWindow,
} from '../tftp/manager.js';
import {
  startNfsServer,
  stopNfsServer,
  getNfsStatus,
  setNfsMainWindow,
  getMountHint,
} from '../nfs/manager.js';
import {
  startFtpServer,
  stopFtpServer,
  getFtpStatus,
  setFtpMainWindow,
  getFtpClients,
} from '../ftp/manager.js';
import {
  startMcpServer,
  stopMcpServer,
  getMcpStatus,
  setMcpMainWindow,
} from '../mcp/manager.js';
import {
  setupSftpHandlers,
  setSftpMainWindow,
} from '../sftp/manager.js';
import { pickFolder, pickSaveFile } from '../native-dialog.js';
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

  // 初始化所有主窗口引用
  setSftpMainWindow(mainWindow);
  setTftpMainWindow(mainWindow);
  setNfsMainWindow(mainWindow);
  setFtpMainWindow(mainWindow);
  setMcpMainWindow(mainWindow);

  // 监听窗口创建（所有子模块共享一个监听器）
  app.on('browser-window-created', (_, window) => {
    // 只在 mainWindow 未设置或已销毁时更新引用
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = window;
      setSftpMainWindow(window);
      setTftpMainWindow(window);
      setNfsMainWindow(window);
      setFtpMainWindow(window);
      setMcpMainWindow(window);
    }
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

  // 通用对话框
  setupDialogHandlers();

  // NFS 服务器
  setupNfsHandlers();

  // FTP 服务器
  setupFtpHandlers();

  // 日志保存
  setupLogHandlers();

  // 串口共享服务
  setupSerialServerHandlers();

  // 连接共享服务（通用版）
  setupConnectionServerHandlers();

  // 网络相关
  setupNetworkHandlers();

  // 文件操作
  setupFileHandlers();

  // MCP 服务器
  setupMcpHandlers();

  // SFTP 文件传输
  setupSftpHandlers();

  console.log('IPC handlers registered');
}

/**
 * 连接相关处理器
 */
function setupConnectionHandlers(): void {
  // 创建连接
  ipcMain.handle(IPC_CHANNELS.CONNECTION_CREATE, async (_, { options }) => {
    try {
      const connection = await ConnectionFactory.create(options);

      // 设置事件转发
      connection.onData((data) => {
        const base64Data = bufferToBase64(data);
        safeSend(IPC_CHANNELS.CONNECTION_DATA, {
          id: connection.id,
          data: base64Data,
        });
      });

      connection.onStateChange((state) => {
        safeSend(IPC_CHANNELS.CONNECTION_STATE, {
          id: connection.id,
          state,
        });
      });

      connection.onError((error) => {
        safeSend(IPC_CHANNELS.CONNECTION_ERROR, {
          id: connection.id,
          error: error.message,
        });
      });

      return { id: connection.id };
    } catch (error) {
      throw error;
    }
  });

  // 打开连接
  ipcMain.handle(IPC_CHANNELS.CONNECTION_OPEN, async (_, { id }) => {
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
              // 获取服务器的底层连接用于共享
              const sharedConn = hasSharedConnection
                ? server.sharedConnection
                : serverConnection;
              // 调用 SerialConnection 的 openWithShared 方法
              await (connection as unknown as { openWithShared: (shared: IConnection) => Promise<void> }).openWithShared(sharedConn as IConnection);
              return;
            }
          }
        }
      }

      await connection.open();
    } catch (error) {
      throw error;
    }
  });

  // 关闭连接
  ipcMain.handle(IPC_CHANNELS.CONNECTION_CLOSE, async (_, { id }) => {
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
    console.log('[IPC] CONNECTION_WRITE received:', JSON.stringify(data).slice(0, 80), 'id:', id?.slice(0, 8));
    const connection = ConnectionFactory.get(id);
    if (!connection) {
      console.error('[IPC] CONNECTION_WRITE connection not found:', id?.slice(0, 8));
      throw new Error(`Connection ${id} not found`);
    }
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
    const ports = await SerialConnection.listPorts();
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
  // 启动 TFTP 服务器
  ipcMain.handle(IPC_CHANNELS.TFTP_START, async (_, { port, rootDir }) => {
    try {
      startTftpServer(port, rootDir);
    } catch (error) {
      throw error;
    }
  });

  // 停止 TFTP 服务器
  ipcMain.handle(IPC_CHANNELS.TFTP_STOP, () => {
    stopTftpServer();
  });

  // 获取 TFTP 状态
  ipcMain.handle(IPC_CHANNELS.TFTP_GET_STATUS, () => {
    return getTftpStatus();
  });

  // 选择目录（使用 PowerShell FolderBrowserDialog，避免 Electron 原生对话框崩溃）
  ipcMain.handle(IPC_CHANNELS.TFTP_PICK_DIR, async () => {
    return pickFolder('选择 TFTP 共享目录');
  });
}

/**
 * 通用对话框处理器
 */
function setupDialogHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DIALOG_PICK_DIR, async (_, { title }) => {
    return pickFolder(title || '选择目录');
  });
}

/**
 * NFS 相关处理器
 */
function setupNfsHandlers(): void {
  // 启动 NFS 服务器
  ipcMain.handle(IPC_CHANNELS.NFS_START, async (_, { exportDir, allowedClients, options }) => {
    try {
      await startNfsServer(exportDir, allowedClients, options);
    } catch (error) {
      throw error;
    }
  });

  // 停止 NFS 服务器
  ipcMain.handle(IPC_CHANNELS.NFS_STOP, () => {
    stopNfsServer();
  });

  // 获取 NFS 状态
  ipcMain.handle(IPC_CHANNELS.NFS_GET_STATUS, () => {
    return getNfsStatus();
  });

  // 选择目录
  ipcMain.handle(IPC_CHANNELS.NFS_PICK_DIR, async () => {
    return pickFolder('选择 NFS 共享目录');
  });

  // 获取挂载提示
  ipcMain.handle(IPC_CHANNELS.NFS_GET_MOUNT_HINT, () => {
    return getMountHint();
  });
}

/**
 * FTP 相关处理器
 */
function setupFtpHandlers(): void {
  // 启动 FTP 服务器
  ipcMain.handle(IPC_CHANNELS.FTP_START, async (_, { port, rootDir, username, password }) => {
    try {
      await startFtpServer(port, rootDir, username, password);
    } catch (error) {
      console.error('[FTP] Start error:', error);
      throw error;
    }
  });

  // 停止 FTP 服务器
  ipcMain.handle(IPC_CHANNELS.FTP_STOP, async () => {
    await stopFtpServer();
  });

  // 获取 FTP 状态
  ipcMain.handle(IPC_CHANNELS.FTP_GET_STATUS, () => {
    return getFtpStatus();
  });

  // 选择目录
  ipcMain.handle(IPC_CHANNELS.FTP_PICK_DIR, async () => {
    return pickFolder('选择 FTP 共享目录');
  });

  // 获取客户端列表
  ipcMain.handle(IPC_CHANNELS.FTP_GET_CLIENTS, () => {
    return getFtpClients();
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
    return pickSaveFile(
      '选择日志保存位置',
      defaultName || `terminal-log-${new Date().toISOString().slice(0, 10)}.txt`,
      [
        { name: '文本文件', extensions: ['txt'] },
        { name: '日志文件', extensions: ['log'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    );
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

    } catch (error) {
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
    }
  });

  // 写入日志数据
  ipcMain.handle(IPC_CHANNELS.LOG_WRITE, async (_, { sessionId, data }) => {
    const stream = logStreams.get(sessionId);
    if (!stream || !stream.writable) return;
    if (!stream.write(data)) {
      await new Promise<void>((resolve) => stream.once('drain', resolve));
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
  ipcMain.handle(IPC_CHANNELS.SERIAL_SERVER_START, async (_, options) => {
    const { ConnectionType } = await import('@qserial/shared');
    const { id, serialPath, baudRate, dataBits, stopBits, parity, localPort, listenAddress, accessPassword } = options;

    // 如果相同ID的服务器已存在，先销毁它
    const existingServer = ConnectionFactory.get(id);
    if (existingServer) {
      await ConnectionFactory.destroy(id);
    }

    // 查找该串口的现有连接（自动检测复用）
    const allConnections = ConnectionFactory.getAll();
    const existingConnection = allConnections.find((c) => {
      const opts = c.options as { path?: string; serialPath?: string };
      const matchPath = opts.path?.toLowerCase() === serialPath.toLowerCase();
      const matchSerialPath = opts.serialPath?.toLowerCase() === serialPath.toLowerCase();
      return c.type === ConnectionType.SERIAL && (matchPath || matchSerialPath);
    });

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
      listenAddress,
      accessPassword,
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
    if (!connection) return { running: false, serialPath: '', localPort: 0, clientCount: 0 };
    return (connection as unknown as { getStatus: () => unknown }).getStatus();
  });
}

/**
 * 网络相关处理器
 */
function setupNetworkHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_LOCAL_IP, () => getLocalIp());
}

/**
 * 连接共享服务相关处理器（通用版，支持任意连接类型）
 */
function setupConnectionServerHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CONNECTION_SERVER_START, async (_, options) => {
    const { ConnectionType } = await import('@qserial/shared');
    const {
      id,
      sourceType,
      existingConnectionId,
      newConnectionOptions,
      localPort,
      listenAddress,
      accessPassword,
      apiPort,
      apiProtocol,
    } = options;

    // 如果相同ID的服务器已存在，先销毁它
    const existingServer = ConnectionFactory.get(id);
    if (existingServer) {
      await ConnectionFactory.destroy(id);
    }

    // 验证数据源
    if (sourceType === 'existing' && !existingConnectionId) {
      throw new Error('复用已有连接模式需要指定 existingConnectionId');
    }
    if (sourceType === 'new' && !newConnectionOptions) {
      throw new Error('新建连接模式需要指定 newConnectionOptions');
    }

    // 验证已有连接是否存在且已连接
    if (sourceType === 'existing') {
      const existingConn = ConnectionFactory.get(existingConnectionId);
      if (!existingConn) {
        throw new Error(`找不到已有连接: ${existingConnectionId}`);
      }
      const { ConnectionState } = await import('@qserial/shared');
      if (existingConn.state !== ConnectionState.CONNECTED) {
        throw new Error(`已有连接未处于连接状态: ${existingConnectionId}`);
      }
    }

    const connection = await ConnectionFactory.create({
      id,
      type: ConnectionType.CONNECTION_SERVER,
      name: `连接共享-${id.slice(-8)}`,
      sourceType,
      existingConnectionId,
      newConnectionOptions,
      localPort,
      listenAddress,
      accessPassword,
      autoReconnect: false,
      ...(apiPort ? { apiPort, apiProtocol: apiProtocol || 'json-tcp' } : {}),
    });

    await connection.open();

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

  ipcMain.handle(IPC_CHANNELS.CONNECTION_SERVER_STOP, async (_, { id }) => {
    await ConnectionFactory.destroy(id);
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_SERVER_STATUS, async (_, { id }) => {
    const connection = ConnectionFactory.get(id);
    if (!connection) {
      return {
        running: false,
        sourceType: 'existing',
        sourceDescription: '',
        localPort: 0,
        listenAddress: '0.0.0.0',
        clientCount: 0,
        clients: [],
        hasPassword: false,
        apiPort: undefined,
        apiClientCount: 0,
        apiClients: [],
      };
    }
    return (connection as ConnectionServerConnection).getStatus();
  });
}

/**
 * MCP 服务器处理器
 */
function setupMcpHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.MCP_START, async (_, { port }) => {
    try {
      await startMcpServer(port);
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.MCP_STOP, async () => {
    await stopMcpServer();
  });

  ipcMain.handle(IPC_CHANNELS.MCP_GET_STATUS, () => {
    return getMcpStatus();
  });
}

/**
 * 文件操作相关处理器
 */
function setupFileHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.READ_FILE, async (_, { path: filePath }) => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('无效的文件路径');
    }
    const resolved = path.resolve(filePath);
    const userData = app.getPath('userData');
    if (!resolved.startsWith(userData) && !resolved.startsWith(path.join(userData, '..', 'QSerial'))) {
      throw new Error('不允许的路径');
    }
    return fs.promises.readFile(resolved, 'utf-8');
  });
}
