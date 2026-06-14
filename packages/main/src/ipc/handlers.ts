/**
 * IPC 处理器
 * 使用动态 import 延迟加载原生模块，避免启动时阻塞
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@qserial/shared';
import type { IConnection } from '@qserial/shared';
import { ConnectionFactory } from '../services/connection/factory.js';
import { ConfigManager } from '../config/manager.js';
import { getLocalIp } from '../utils/network.js';
import { bufferToBase64 } from '@qserial/shared';
import { pickFolder, pickFile, pickSaveFile } from '../native-dialog.js';
import * as fs from 'fs';
import * as path from 'path';

// 延迟加载重型模块的辅助函数
let _SerialConnection: typeof import('../services/connection/serial.js').SerialConnection | null = null;
async function getSerialConnection() {
  if (!_SerialConnection) {
    _SerialConnection = (await import('../services/connection/serial.js')).SerialConnection;
  }
  return _SerialConnection;
}

let _ConnectionServerConnection: typeof import('../services/connection/connectionServer.js').ConnectionServerConnection | null = null;
async function getConnectionServerConnection() {
  if (!_ConnectionServerConnection) {
    _ConnectionServerConnection = (await import('../services/connection/connectionServer.js')).ConnectionServerConnection;
  }
  return _ConnectionServerConnection;
}

let mainWindow: BrowserWindow | null = null;

function safeSend(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

export function setupIpcHandlers(): void {
  mainWindow = BrowserWindow.getAllWindows()[0];

  // 延迟初始化各模块的 mainWindow 引用
  setupMainWindowRefs();

  app.on('browser-window-created', (_, window) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = window;
      setupMainWindowRefs();
    }
  });

  setupConnectionHandlers();
  setupConfigHandlers();
  setupWindowHandlers();
  setupAppHandlers();
  setupTftpHandlers();
  setupDialogHandlers();
  setupNfsHandlers();
  setupFtpHandlers();
  setupLogHandlers();
  setupConnectionServerHandlers();
  setupNetworkHandlers();
  setupFileHandlers();
  setupMcpHandlers();
  setupSftpHandlers();

  console.log('IPC handlers registered');
}

function setupMainWindowRefs(): void {
  // 使用动态 import 避免启动时加载
  import('../services/tftp/manager.js').then(m => m.setTftpMainWindow(mainWindow)).catch(() => {});
  import('../services/nfs/manager.js').then(m => m.setNfsMainWindow(mainWindow)).catch(() => {});
  import('../services/ftp/manager.js').then(m => m.setFtpMainWindow(mainWindow)).catch(() => {});
  import('../services/mcp/manager.js').then(m => m.setMcpMainWindow(mainWindow)).catch(() => {});
  import('../services/sftp/manager.js').then(m => m.setSftpMainWindow(mainWindow)).catch(() => {});
}

/**
 * 连接相关处理器
 */
function setupConnectionHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CONNECTION_CREATE, async (_, { options }) => {
    const connection = await ConnectionFactory.create(options);

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
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_OPEN, async (_, { id }) => {
    const connection = ConnectionFactory.get(id);
    if (!connection) throw new Error(`Connection ${id} not found`);
    const { ConnectionType } = await import('@qserial/shared');
      if (connection.type === ConnectionType.SERIAL) {
        const serialOpts = connection.options as { path?: string };
        const serialPath = serialOpts.path?.toLowerCase();

        if (serialPath) {
          const allConnections = ConnectionFactory.getAll();
          const serverConnection = allConnections.find((c) => {
            if (c.type !== ConnectionType.SERIAL_SERVER) return false;
            const serverOpts = c.options as { serialPath?: string };
            return serverOpts.serialPath?.toLowerCase() === serialPath;
          });

          if (serverConnection) {
            const server = serverConnection as unknown as {
              serialPort?: { isOpen: boolean };
              sharedConnection?: IConnection;
            };
            const hasOwnPort = server.serialPort?.isOpen;
            const hasSharedConnection = !!server.sharedConnection;

            if (hasOwnPort || hasSharedConnection) {
              const sharedConn = hasSharedConnection
                ? server.sharedConnection
                : serverConnection;
              await (connection as unknown as { openWithShared: (shared: IConnection) => Promise<void> }).openWithShared(sharedConn as IConnection);
              return;
            }
          }
        }
      }

      await connection.open();
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_CLOSE, async (_, { id }) => {
    const connection = ConnectionFactory.get(id);
    if (!connection) throw new Error(`Connection ${id} not found`);
    await connection.close();
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_DESTROY, async (_, { id }) => {
    await ConnectionFactory.destroy(id);
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_WRITE, async (_, { id, data }) => {
    console.log('[IPC] CONNECTION_WRITE received:', JSON.stringify(data).slice(0, 80), 'id:', id?.slice(0, 8));
    const connection = ConnectionFactory.get(id);
    if (!connection) {
      console.error('[IPC] CONNECTION_WRITE connection not found:', id?.slice(0, 8));
      throw new Error(`Connection ${id} not found`);
    }
    connection.write(data);
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_RESIZE, async (_, { id, cols, rows }) => {
    const connection = ConnectionFactory.get(id);
    if (!connection) throw new Error(`Connection ${id} not found`);
    connection.resize(cols, rows);
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_GET_STATE, async (_, { id }) => {
    const connection = ConnectionFactory.get(id);
    if (!connection) throw new Error(`Connection ${id} not found`);
    return { state: connection.state };
  });

  ipcMain.handle(IPC_CHANNELS.SERIAL_LIST, async () => {
    const SerialConnection = await getSerialConnection();
    const ports = await SerialConnection.listPorts();
    return ports;
  });
}

/**
 * 配置相关处理器
 */
function setupConfigHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, (_, { key }) => ConfigManager.get(key));
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, (_, { key, value }) => { ConfigManager.set(key, value); });
  ipcMain.handle(IPC_CHANNELS.CONFIG_DELETE, (_, { key }) => { ConfigManager.delete(key); });
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_ALL, () => ConfigManager.getAll());
}

/**
 * 窗口相关处理器
 */
function setupWindowHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => { mainWindow?.minimize(); });
  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => { mainWindow?.close(); });
  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_TITLE, (_, { title }) => { mainWindow?.setTitle(title); });
}

/**
 * 应用相关处理器
 */
function setupAppHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => app.getVersion());
  ipcMain.handle(IPC_CHANNELS.APP_QUIT, () => { app.quit(); });
}

/**
 * TFTP 相关处理器
 */
function setupTftpHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.TFTP_START, async (_, { port, rootDir }) => {
    const { startTftpServer } = await import('../services/tftp/manager.js');
    startTftpServer(port, rootDir);
  });

  ipcMain.handle(IPC_CHANNELS.TFTP_STOP, async () => {
    const { stopTftpServer } = await import('../services/tftp/manager.js');
    stopTftpServer();
  });

  ipcMain.handle(IPC_CHANNELS.TFTP_GET_STATUS, async () => {
    const { getTftpStatus } = await import('../services/tftp/manager.js');
    return getTftpStatus();
  });

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
  ipcMain.handle(IPC_CHANNELS.NFS_START, async (_, { exportDir, allowedClients, options }) => {
    const { startNfsServer } = await import('../services/nfs/manager.js');
    await startNfsServer(exportDir, allowedClients, options);
  });

  ipcMain.handle(IPC_CHANNELS.NFS_STOP, async () => {
    const { stopNfsServer } = await import('../services/nfs/manager.js');
    stopNfsServer();
  });

  ipcMain.handle(IPC_CHANNELS.NFS_GET_STATUS, async () => {
    const { getNfsStatus } = await import('../services/nfs/manager.js');
    return getNfsStatus();
  });

  ipcMain.handle(IPC_CHANNELS.NFS_PICK_DIR, async () => {
    return pickFolder('选择 NFS 共享目录');
  });

  ipcMain.handle(IPC_CHANNELS.NFS_GET_MOUNT_HINT, async () => {
    const { getMountHint } = await import('../services/nfs/manager.js');
    return getMountHint();
  });
}

/**
 * FTP 相关处理器
 */
function setupFtpHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FTP_START, async (_, { port, rootDir, username, password }) => {
    const { startFtpServer } = await import('../services/ftp/manager.js');
    await startFtpServer(port, rootDir, username, password);
  });

  ipcMain.handle(IPC_CHANNELS.FTP_STOP, async () => {
    const { stopFtpServer } = await import('../services/ftp/manager.js');
    await stopFtpServer();
  });

  ipcMain.handle(IPC_CHANNELS.FTP_GET_STATUS, async () => {
    const { getFtpStatus } = await import('../services/ftp/manager.js');
    return getFtpStatus();
  });

  ipcMain.handle(IPC_CHANNELS.FTP_PICK_DIR, async () => {
    return pickFolder('选择 FTP 共享目录');
  });

  ipcMain.handle(IPC_CHANNELS.FTP_GET_CLIENTS, async () => {
    const { getFtpClients } = await import('../services/ftp/manager.js');
    return getFtpClients();
  });
}

/**
 * 日志保存相关处理器
 */
function setupLogHandlers(): void {
  const logStreams = new Map<string, fs.WriteStream>();

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

  ipcMain.handle(IPC_CHANNELS.LOG_START, async (_, { sessionId, filePath }) => {
    const existingStream = logStreams.get(sessionId);
    if (existingStream) { existingStream.end(); }

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }

    const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf-8' });
    logStreams.set(sessionId, stream);

    const timestamp = new Date().toLocaleString();
    stream.write(`\n========== 日志开始 [${timestamp}] ==========\n`);
  });

  ipcMain.handle(IPC_CHANNELS.LOG_STOP, async (_, { sessionId }) => {
    const stream = logStreams.get(sessionId);
    if (stream) {
      const timestamp = new Date().toLocaleString();
      stream.write(`\n========== 日志结束 [${timestamp}] ==========\n`);
      stream.end();
      logStreams.delete(sessionId);
    }
  });

  ipcMain.handle(IPC_CHANNELS.LOG_WRITE, async (_, { sessionId, data }) => {
    const stream = logStreams.get(sessionId);
    if (!stream || !stream.writable) return;
    if (!stream.write(data)) {
      await new Promise<void>((resolve) => stream.once('drain', resolve));
    }
  });

  app.on('before-quit', () => {
    for (const [, stream] of logStreams) {
      try {
        const timestamp = new Date().toLocaleString();
        stream.write(`\n========== 日志结束 [${timestamp}] ==========\n`);
        stream.end();
      } catch { /* ignore */ }
    }
    logStreams.clear();
  });
}

/**
 * 网络相关处理器
 */
function setupNetworkHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_LOCAL_IP, () => getLocalIp());
}

/**
 * 连接共享服务相关处理器（通用版）
 */
function setupConnectionServerHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CONNECTION_SERVER_START, async (_, options) => {
    const { ConnectionType } = await import('@qserial/shared');
    const {
      id, sourceType, existingConnectionId, newConnectionOptions,
      localPort, listenAddress, accessPassword,
    } = options;

    const existingServer = ConnectionFactory.get(id);
    if (existingServer) { await ConnectionFactory.destroy(id); }

    if (sourceType === 'existing' && !existingConnectionId) {
      throw new Error('复用已有连接模式需要指定 existingConnectionId');
    }
    if (sourceType === 'new' && !newConnectionOptions) {
      throw new Error('新建连接模式需要指定 newConnectionOptions');
    }

    if (sourceType === 'existing') {
      const existingConn = ConnectionFactory.get(existingConnectionId);
      if (!existingConn) { throw new Error(`找不到已有连接: ${existingConnectionId}`); }
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
    });

    await connection.open();

    connection.onData((data) => {
      safeSend(IPC_CHANNELS.CONNECTION_DATA, { id: connection.id, data: bufferToBase64(data) });
    });

    connection.onStateChange((state) => {
      safeSend(IPC_CHANNELS.CONNECTION_STATE, { id: connection.id, state });
    });

    connection.onError((error) => {
      safeSend(IPC_CHANNELS.CONNECTION_ERROR, { id: connection.id, error: error.message });
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
        running: false, sourceType: 'existing', sourceDescription: '',
        localPort: 0, listenAddress: '0.0.0.0', clientCount: 0, clients: [], hasPassword: false,
      };
    }
    const ConnServer = await getConnectionServerConnection();
    return (connection as InstanceType<typeof ConnServer>).getStatus();
  });
}

/**
 * MCP 服务器处理器
 */
function setupMcpHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.MCP_START, async (_, { port, listenAddress, authPassword, autoStart, corsOrigins }) => {
    const { startMcpServer } = await import('../services/mcp/manager.js');
    await startMcpServer(port, listenAddress, authPassword, corsOrigins);
    if (autoStart) {
      ConfigManager.set('mcp', {
        enabled: true, port,
        listenAddress: listenAddress || '0.0.0.0',
        authPassword: authPassword || '',
        corsOrigins: corsOrigins || [],
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.MCP_STOP, async (_, { autoStart }) => {
    const { stopMcpServer } = await import('../services/mcp/manager.js');
    await stopMcpServer();
    if (autoStart === false) {
      const mcpConfig = ConfigManager.get('mcp');
      if (mcpConfig) { ConfigManager.set('mcp', { ...mcpConfig, enabled: false }); }
    }
  });

  ipcMain.handle(IPC_CHANNELS.MCP_GET_STATUS, async () => {
    const { getMcpStatus } = await import('../services/mcp/manager.js');
    return getMcpStatus();
  });
}

/**
 * SFTP 文件传输处理器
 * 所有 handler 通过动态 import 延迟加载 ssh2 原生模块
 */
function setupSftpHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SFTP_CREATE, async (_, { connectionId }) => {
    const { createSftp } = await import('../services/sftp/manager.js');
    return createSftp(connectionId).then((sftpId: string) => ({ sftpId }));
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_DESTROY, async (_, { sftpId }) => {
    const { destroySftp } = await import('../services/sftp/manager.js');
    return destroySftp(sftpId);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_LIST, async (_, { sftpId, path }) => {
    const { listDirectory } = await import('../services/sftp/manager.js');
    return listDirectory(sftpId, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_DOWNLOAD, async (_, { sftpId, remotePath, localPath }) => {
    const { downloadFile } = await import('../services/sftp/manager.js');
    return downloadFile(sftpId, remotePath, localPath);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_UPLOAD, async (_, { sftpId, localPath, remotePath }) => {
    const { uploadFile } = await import('../services/sftp/manager.js');
    return uploadFile(sftpId, localPath, remotePath);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_MKDIR, async (_, { sftpId, path }) => {
    const { mkdir } = await import('../services/sftp/manager.js');
    return mkdir(sftpId, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_RMDIR, async (_, { sftpId, path }) => {
    const { rmdir } = await import('../services/sftp/manager.js');
    return rmdir(sftpId, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_RM, async (_, { sftpId, path }) => {
    const { rm } = await import('../services/sftp/manager.js');
    return rm(sftpId, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_RENAME, async (_, { sftpId, oldPath, newPath }) => {
    const { rename } = await import('../services/sftp/manager.js');
    return rename(sftpId, oldPath, newPath);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_STAT, async (_, { sftpId, path }) => {
    const { stat } = await import('../services/sftp/manager.js');
    return stat(sftpId, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_READLINK, async (_, { sftpId, path }) => {
    const { readlink } = await import('../services/sftp/manager.js');
    return readlink(sftpId, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_SYMLINK, async (_, { sftpId, target, path }) => {
    const { symlink } = await import('../services/sftp/manager.js');
    return symlink(sftpId, target, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_REALPATH, async (_, { sftpId, path }) => {
    const { realpath } = await import('../services/sftp/manager.js');
    return realpath(sftpId, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_PICK_LOCAL, async () => {
    return pickFile('选择本地文件');
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_PICK_LOCAL_DIR, async () => {
    return pickFolder('选择本地目录');
  });
}

/**
 * 文件操作相关处理器
 */
function setupFileHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.READ_FILE, async (_, { path: filePath }) => {
    if (!filePath || typeof filePath !== 'string') { throw new Error('无效的文件路径'); }
    const resolved = path.resolve(filePath);
    const userData = app.getPath('userData');
    if (!resolved.startsWith(userData) && !resolved.startsWith(path.join(userData, '..', 'QSerial'))) {
      throw new Error('不允许的路径');
    }
    return fs.promises.readFile(resolved, 'utf-8');
  });
}
