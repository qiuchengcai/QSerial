/**
 * TFTP 服务器管理器
 */

import tftp from 'tftp';
import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  IPC_CHANNELS,
  type TftpServerStatus,
  type TftpStatusEvent,
  type TftpTransferEvent,
  type TftpTransferDirection,
} from '@qserial/shared';

let mainWindow: BrowserWindow | null = null;
let server: ReturnType<typeof tftp.createServer> | null = null;
let currentStatus: TftpServerStatus = {
  running: false,
  port: 69,
  rootDir: '',
};

// 传输 ID 计数器
let transferIdCounter = 0;

// 活跃传输跟踪
const activeTransfers = new Map<
  string,
  {
    file: string;
    direction: TftpTransferDirection;
    remoteAddress: string;
    fileSize?: number;
    transferred: number;
    lastPercent: number;
    completed: boolean;
  }
>();

/**
 * 设置主窗口引用
 */
export function setTftpMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

/**
 * 安全发送状态事件到渲染进程
 */
function sendStatusEvent(event: TftpStatusEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.TFTP_STATUS_EVENT, event);
  }
}

/**
 * 安全发送传输事件到渲染进程
 */
function sendTransferEvent(event: TftpTransferEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.TFTP_TRANSFER_EVENT, event);
  }
}

/**
 * 启动 TFTP 服务器
 */
export function startTftpServer(port: number, rootDir: string): void {
  // 如果已经在运行，先停止
  if (server) {
    stopTftpServer();
  }

  try {
    // 创建服务器，不提供 requestListener，使用默认的
    server = tftp.createServer({
      host: '192.168.0.10',
      port: port,
      root: rootDir,
      denyPUT: false, // 允许上传
      denyGET: false, // 允许下载
      blockSize: 1468, // 避免 IP 分片，兼容嵌入式 TFTP 客户端
      windowSize: 64, // 增大窗口，减少等待ACK次数
      timeout: 5000, // 超时时间5s
      retries: 5, // 重试次数
    });

    server.on('error', (error: Error) => {
      currentStatus.running = false;
      sendStatusEvent({ running: false, error: error.message });
    });

    server.on('listening', () => {
      currentStatus = { running: true, port, rootDir };
      sendStatusEvent({ running: true });
    });

    server.on('close', () => {
      currentStatus.running = false;
      sendStatusEvent({ running: false });
      activeTransfers.clear();
    });

    // 监听请求事件来跟踪进度
    server.on('request', (req, res) => {
      const id = `transfer-${++transferIdCounter}`;
      const file = req.file;
      const method = req.method; // 'GET' 或 'PUT'
      const stats = req.stats;
      const remoteAddress = `${stats.remoteAddress}:${stats.remotePort}`;
      // GET = 客户端下载 = 服务器发送文件
      // PUT = 客户端上传 = 服务器接收文件
      const direction: TftpTransferDirection = method === 'GET' ? 'download' : 'upload';
      const fileSize = stats.size ?? undefined;

      // 初始化传输跟踪
      activeTransfers.set(id, {
        file,
        direction,
        remoteAddress,
        fileSize,
        transferred: 0,
        lastPercent: 0,
        completed: false,
      });

      // 发送开始事件
      sendTransferEvent({
        id,
        file,
        direction,
        status: 'started',
        remoteAddress,
        fileSize,
        transferred: 0,
        percent: 0,
      });

      // 辅助函数
      const getTransfer = () => activeTransfers.get(id);

      const updateProgress = (bytesTransferred: number) => {
        const transfer = getTransfer();
        if (!transfer || transfer.completed) return;
        transfer.transferred = bytesTransferred;
        const percent = transfer.fileSize
          ? Math.round((bytesTransferred / transfer.fileSize) * 10000) / 100
          : 0;
        // 每 5% 更新一次，或完成时
        if (!transfer.fileSize || percent - transfer.lastPercent >= 5 || percent >= 100) {
          transfer.lastPercent = percent;
          sendTransferEvent({
            id,
            file,
            direction,
            status: 'progress',
            remoteAddress,
            fileSize: transfer.fileSize,
            transferred: bytesTransferred,
            percent,
          });
        }
      };

      // 对于 GET 请求，我们需要读取文件并跟踪进度
      // 对于 PUT 请求，我们需要写入文件并跟踪进度
      if (method === 'GET') {
        // 下载：服务器发送文件给客户端
        const filePath = path.join(rootDir, file);
        fs.stat(filePath, (err, stat) => {
          if (!err && stat.size) {
            const transfer = getTransfer();
            if (transfer) {
              transfer.fileSize = stat.size;
            }
          }
        });

        // 包装 res 的 write 方法来跟踪进度
        const originalWrite = res.write?.bind(res) as ((chunk: Buffer) => boolean) | undefined;
        if (originalWrite) {
          res.write = function (chunk: Buffer): boolean {
            const transfer = getTransfer();
            if (transfer) {
              updateProgress(transfer.transferred + chunk.length);
            }
            return originalWrite(chunk);
          };
        }
      } else {
        // 上传：服务器接收客户端的文件
        // 监听 req 的 data 事件
        req.on('data', (chunk: Buffer) => {
          const transfer = getTransfer();
          if (transfer) {
            updateProgress(transfer.transferred + chunk.length);
          }
        });
      }

      // 监听完成事件
      // close 事件总是会触发，在 finish/end/error/abort 之前
      req.on('close', () => {
        const transfer = getTransfer();
        if (!transfer || transfer.completed) return;
        // 如果还没有完成，说明是正常结束
        transfer.completed = true;
        sendTransferEvent({
          id,
          file,
          direction,
          status: 'completed',
          remoteAddress,
          fileSize: transfer.fileSize,
          transferred: transfer.transferred,
          percent: 100,
        });
        activeTransfers.delete(id);
      });

      // 监听中止
      req.on('abort', () => {
        const transfer = getTransfer();
        if (transfer && !transfer.completed) {
          transfer.completed = true;
          sendTransferEvent({
            id,
            file,
            direction,
            status: 'aborted',
            remoteAddress,
          });
          activeTransfers.delete(id);
        }
      });

      // 监听错误
      req.on('error', (error: Error) => {
        const transfer = getTransfer();
        if (transfer && !transfer.completed) {
          transfer.completed = true;
          sendTransferEvent({
            id,
            file,
            direction,
            status: 'error',
            remoteAddress,
            error: error.message,
          });
          activeTransfers.delete(id);
        }
      });
    });

    server.listen();
  } catch (error) {
    throw error;
  }
}

/**
 * 停止 TFTP 服务器
 */
export function stopTftpServer(): void {
  if (server) {
    try {
      server.close();
    } catch {
      // ignore close errors
    }
    server = null;
    currentStatus.running = false;
  }
}

/**
 * 获取 TFTP 服务器状态
 */
export function getTftpStatus(): TftpServerStatus {
  return { ...currentStatus };
}

/**
 * 销毁 TFTP 管理器
 */
export function destroyTftpManager(): void {
  stopTftpServer();
}
