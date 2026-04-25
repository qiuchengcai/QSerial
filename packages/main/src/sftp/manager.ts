/**
 * SFTP 管理器
 * 基于现有 SSH 连接提供 SFTP 文件传输功能
 */

import { Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS, SftpFileInfo, SftpFileStat, SftpProgressEvent } from '@qserial/shared';
import { ConnectionFactory } from '../connection/factory.js';
import { SshConnection } from '../connection/ssh.js';
import { ConnectionType } from '@qserial/shared';
import { pickFolder, pickFile } from '../native-dialog.js';

// SFTP 实例信息
interface SftpInstance {
  id: string;
  connectionId: string;
  sftp: unknown;
}

// SFTP 实例存储
const sftpInstances = new Map<string, SftpInstance>();

// 主窗口引用（用于发送进度事件）
let mainWindow: BrowserWindow | null = null;

/**
 * 设置主窗口引用
 */
export function setSftpMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

/**
 * 发送进度事件到渲染进程
 */
function sendProgressEvent(event: SftpProgressEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.SFTP_PROGRESS_EVENT, event);
  }
}

/**
 * 从 SSH 连接获取底层 Client 对象
 */
function getSshClient(connectionId: string): Client | null {
  const connection = ConnectionFactory.get(connectionId);
  if (!connection || connection.type !== ConnectionType.SSH) {
    return null;
  }

  // 通过反射获取 SSH 客户端
  const sshConn = connection as unknown as SshConnection;
  const client = (sshConn as unknown as { client: Client | null }).client;
  return client;
}

/**
 * 创建 SFTP 会话
 */
export async function createSftp(connectionId: string): Promise<string> {
  const client = getSshClient(connectionId);
  if (!client) {
    throw new Error('SSH 连接不存在或未连接');
  }

  const sftpId = `sftp-${connectionId}`;

  // 如果已存在，先销毁
  if (sftpInstances.has(sftpId)) {
    await destroySftp(sftpId);
  }

  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) {
        reject(err);
        return;
      }

      sftpInstances.set(sftpId, {
        id: sftpId,
        connectionId,
        sftp,
      });

      resolve(sftpId);
    });
  });
}

/**
 * 销毁 SFTP 会话
 */
export async function destroySftp(sftpId: string): Promise<void> {
  const instance = sftpInstances.get(sftpId);
  if (!instance) return;

  const sftp = instance.sftp as { end?: () => void };
  if (sftp.end) {
    sftp.end();
  }

  sftpInstances.delete(sftpId);
}

/**
 * 获取 SFTP 实例
 */
function getSftp(sftpId: string): unknown {
  const instance = sftpInstances.get(sftpId);
  if (!instance) {
    throw new Error('SFTP 会话不存在');
  }
  return instance.sftp;
}

/**
 * 列出目录内容
 */
export async function listDirectory(sftpId: string, remotePath: string): Promise<SftpFileInfo[]> {
  const sftp = getSftp(sftpId) as {
    readdir: (path: string, callback: (err: Error | null, list: unknown[]) => void) => void;
  };

  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) {
        reject(err);
        return;
      }

      const files: SftpFileInfo[] = list.map((item: unknown) => {
        const attrs = item as {
          filename: string;
          longname: string;
          attrs: {
            size: number;
            mode: number;
            mtime: number;
            atime: number;
            uid?: number;
            gid?: number;
          };
        };

        const mode = attrs.attrs.mode;
        const isDir = (mode & 0o040000) === 0o040000;
        const isLink = (mode & 0o120000) === 0o120000;

        let type: SftpFileInfo['type'] = 'file';
        if (isDir) type = 'directory';
        else if (isLink) type = 'symlink';

        return {
          name: attrs.filename,
          type,
          size: attrs.attrs.size,
          modifyTime: attrs.attrs.mtime * 1000,
          accessTime: attrs.attrs.atime * 1000,
          rights: {
            user: modeToString((mode >> 6) & 7),
            group: modeToString((mode >> 3) & 7),
            other: modeToString(mode & 7),
          },
          owner: attrs.attrs.uid,
          group: attrs.attrs.gid,
        };
      });

      // 排序：目录优先，然后按名称排序
      files.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });

      resolve(files);
    });
  });
}

/**
 * 权限数字转字符串
 */
function modeToString(mode: number): string {
  let str = '';
  str += (mode & 4) ? 'r' : '-';
  str += (mode & 2) ? 'w' : '-';
  str += (mode & 1) ? 'x' : '-';
  return str;
}

/**
 * 下载文件
 */
export async function downloadFile(
  sftpId: string,
  remotePath: string,
  localPath: string
): Promise<void> {
  const sftp = getSftp(sftpId) as {
    fastGet: (
      remote: string,
      local: string,
      options: { step?: (transferred: number, total: number) => void },
      callback: (err: Error | null) => void
    ) => void;
    stat: (path: string, callback: (err: Error | null, stats: { size: number }) => void) => void;
  };

  return new Promise((resolve, reject) => {
    // 确保本地目录存在
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    sftp.fastGet(
      remotePath,
      localPath,
      {
        step: (transferred, total) => {
          sendProgressEvent({
            sftpId,
            operation: 'download',
            localPath,
            remotePath,
            total,
            transferred,
            percent: total > 0 ? Math.round((transferred / total) * 100) : 0,
          });
        },
      },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * 上传文件
 */
export async function uploadFile(
  sftpId: string,
  localPath: string,
  remotePath: string
): Promise<void> {
  const sftp = getSftp(sftpId) as {
    fastPut: (
      local: string,
      remote: string,
      options: { step?: (transferred: number, total: number) => void },
      callback: (err: Error | null) => void
    ) => void;
  };

  return new Promise((resolve, reject) => {
    sftp.fastPut(
      localPath,
      remotePath,
      {
        step: (transferred, total) => {
          sendProgressEvent({
            sftpId,
            operation: 'upload',
            localPath,
            remotePath,
            total,
            transferred,
            percent: total > 0 ? Math.round((transferred / total) * 100) : 0,
          });
        },
      },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * 创建目录
 */
export async function mkdir(sftpId: string, remotePath: string): Promise<void> {
  const sftp = getSftp(sftpId) as {
    mkdir: (path: string, callback: (err: Error | null) => void) => void;
  };

  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * 删除目录
 */
export async function rmdir(sftpId: string, remotePath: string): Promise<void> {
  const sftp = getSftp(sftpId) as {
    rmdir: (path: string, callback: (err: Error | null) => void) => void;
  };

  return new Promise((resolve, reject) => {
    sftp.rmdir(remotePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * 删除文件
 */
export async function rm(sftpId: string, remotePath: string): Promise<void> {
  const sftp = getSftp(sftpId) as {
    unlink: (path: string, callback: (err: Error | null) => void) => void;
  };

  return new Promise((resolve, reject) => {
    sftp.unlink(remotePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * 重命名文件/目录
 */
export async function rename(
  sftpId: string,
  oldPath: string,
  newPath: string
): Promise<void> {
  const sftp = getSftp(sftpId) as {
    rename: (old: string, newP: string, callback: (err: Error | null) => void) => void;
  };

  return new Promise((resolve, reject) => {
    sftp.rename(oldPath, newPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * 获取文件状态
 */
export async function stat(sftpId: string, remotePath: string): Promise<SftpFileStat> {
  const sftp = getSftp(sftpId) as {
    stat: (path: string, callback: (err: Error | null, stats: unknown) => void) => void;
  };

  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }

      const s = stats as {
        size: number;
        mode: number;
        mtime: number;
        atime: number;
        isFile(): boolean;
        isDirectory(): boolean;
        isSymbolicLink(): boolean;
      };

      resolve({
        size: s.size,
        mode: s.mode,
        modifyTime: s.mtime * 1000,
        accessTime: s.atime * 1000,
        isFile: s.isFile(),
        isDirectory: s.isDirectory(),
        isSymbolicLink: s.isSymbolicLink(),
      });
    });
  });
}

/**
 * 读取符号链接
 */
export async function readlink(sftpId: string, remotePath: string): Promise<string> {
  const sftp = getSftp(sftpId) as {
    readlink: (path: string, callback: (err: Error | null, target: string) => void) => void;
  };

  return new Promise((resolve, reject) => {
    sftp.readlink(remotePath, (err, target) => {
      if (err) reject(err);
      else resolve(target);
    });
  });
}

/**
 * 创建符号链接
 */
export async function symlink(
  sftpId: string,
  target: string,
  remotePath: string
): Promise<void> {
  const sftp = getSftp(sftpId) as {
    symlink: (target: string, path: string, callback: (err: Error | null) => void) => void;
  };

  return new Promise((resolve, reject) => {
    sftp.symlink(target, remotePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * 解析远程路径（支持 ~ 等）
 */
export async function realpath(sftpId: string, remotePath: string): Promise<string> {
  const sftp = getSftp(sftpId) as {
    realpath: (path: string, callback: (err: Error | null, resolvedPath: string) => void) => void;
  };

  return new Promise((resolve, reject) => {
    sftp.realpath(remotePath, (err, resolvedPath) => {
      if (err) reject(err);
      else resolve(resolvedPath);
    });
  });
}

/**
 * 设置 SFTP IPC 处理器
 */
export function setupSftpHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SFTP_CREATE, async (_, { connectionId }) => {
    const sftpId = await createSftp(connectionId);
    return { sftpId };
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_DESTROY, async (_, { sftpId }) => {
    await destroySftp(sftpId);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_LIST, async (_, { sftpId, path }) => {
    return listDirectory(sftpId, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_DOWNLOAD, async (_, { sftpId, remotePath, localPath }) => {
    return downloadFile(sftpId, remotePath, localPath);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_UPLOAD, async (_, { sftpId, localPath, remotePath }) => {
    return uploadFile(sftpId, localPath, remotePath);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_MKDIR, async (_, { sftpId, path }) => {
    return mkdir(sftpId, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_RMDIR, async (_, { sftpId, path }) => {
    return rmdir(sftpId, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_RM, async (_, { sftpId, path }) => {
    return rm(sftpId, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_RENAME, async (_, { sftpId, oldPath, newPath }) => {
    return rename(sftpId, oldPath, newPath);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_STAT, async (_, { sftpId, path }) => {
    return stat(sftpId, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_READLINK, async (_, { sftpId, path }) => {
    return readlink(sftpId, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_SYMLINK, async (_, { sftpId, target, path }) => {
    return symlink(sftpId, target, path);
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_PICK_LOCAL, async () => {
    return pickFile('选择本地文件');
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_PICK_LOCAL_DIR, async () => {
    return pickFolder('选择本地目录');
  });

  ipcMain.handle(IPC_CHANNELS.SFTP_REALPATH, async (_, { sftpId, path }) => {
    return realpath(sftpId, path);
  });
}
