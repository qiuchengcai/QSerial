/**
 * NFS 服务器管理器
 * 通过系统 nfs-kernel-server (exportfs) 管理 NFS 共享
 */

import { BrowserWindow } from 'electron';
import { execSync } from 'child_process';
import * as fs from 'fs';
import {
  IPC_CHANNELS,
  type NfsServerStatus,
  type NfsStatusEvent,
  type NfsClientEvent,
} from '@qserial/shared';

let mainWindow: BrowserWindow | null = null;
let serverRunning = false;
let currentStatus: NfsServerStatus = {
  running: false,
  exportDir: '',
  allowedClients: '*',
  options: 'rw,sync,no_subtree_check,no_root_squash',
};

// 客户端监控定时器
let monitorTimer: ReturnType<typeof setInterval> | null = null;

// exports 备份路径
const EXPORTS_BACKUP = '/tmp/qserial-exports-backup';

/**
 * 设置主窗口引用
 */
export function setNfsMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

/**
 * 安全发送状态事件到渲染进程
 */
function sendStatusEvent(event: NfsStatusEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.NFS_STATUS_EVENT, event);
  }
}

/**
 * 安全发送客户端事件到渲染进程
 */
function sendClientEvent(event: NfsClientEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.NFS_CLIENT_EVENT, event);
  }
}

/**
 * 执行命令
 */
function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 10000 }).trim();
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    throw new Error(err.stderr?.trim() || err.message || `Command failed: ${cmd}`);
  }
}

/**
 * 检查 NFS 服务器是否已安装
 */
export function isNfsAvailable(): boolean {
  try {
    run('which exportfs');
    return true;
  } catch {
    return false;
  }
}

/**
 * 启动 NFS 服务器
 */
export function startNfsServer(exportDir: string, allowedClients: string, options: string): void {
  // 如果已经在运行，先停止
  if (serverRunning) {
    stopNfsServer();
  }

  // 检查目录是否存在
  if (!fs.existsSync(exportDir)) {
    throw new Error(`共享目录不存在: ${exportDir}`);
  }

  // 备份原始 exports
  try {
    if (fs.existsSync('/etc/exports')) {
      const currentContent = fs.readFileSync('/etc/exports', 'utf-8');
      if (!fs.existsSync(EXPORTS_BACKUP)) {
        fs.writeFileSync(EXPORTS_BACKUP, currentContent);
      }
    }
  } catch {
    // 忽略备份错误
  }

  try {
    // 构建 exports 条目
    const exportEntry = `${exportDir} ${allowedClients}(${options})`;

    // 读取现有 /etc/exports，移除旧的 QSerial 条目（以 # QSerial 标记的）
    let exportsContent = '';
    if (fs.existsSync('/etc/exports')) {
      exportsContent = fs.readFileSync('/etc/exports', 'utf-8');
      // 移除旧的 QSerial 条目
      const lines = exportsContent.split('\n').filter(
        line => !line.includes('# QSerial-NFS')
      );
      exportsContent = lines.join('\n').trim();
    }

    // 添加 QSerial 条目
    exportsContent += `\n${exportEntry}  # QSerial-NFS\n`;

    // 写入 /etc/exports
    fs.writeFileSync('/etc/exports', exportsContent);

    // 导出共享
    run('sudo exportfs -ra');

    // 确保 NFS 服务运行
    try {
      run('sudo systemctl start nfs-kernel-server 2>/dev/null || true');
    } catch {
      // 某些系统可能用 rpc.nfsd
      try {
        run('sudo rpc.nfsd 8');
        run('sudo rpc.mountd');
      } catch {
        // 忽略，可能已经在运行
      }
    }

    serverRunning = true;
    currentStatus = {
      running: true,
      exportDir,
      allowedClients,
      options,
    };

    sendStatusEvent({ running: true });

    // 启动客户端监控
    startClientMonitor();

  } catch (error) {
    // 回滚 exports
    restoreExports();
    throw error;
  }
}

/**
 * 停止 NFS 服务器
 */
export function stopNfsServer(): void {
  if (!serverRunning) return;

  try {
    // 取消导出 QSerial 添加的共享
    if (currentStatus.exportDir) {
      try {
        run(`sudo exportfs -u ${currentStatus.allowedClients}:${currentStatus.exportDir}`);
      } catch {
        // 尝试强制取消所有导出
        try {
          run('sudo exportfs -ra');
        } catch {
          // 忽略
        }
      }
    }

    // 恢复原始 exports
    restoreExports();

    // 重新加载 exports
    try {
      run('sudo exportfs -ra');
    } catch {
      // 忽略
    }
  } catch (error) {
    console.error('Error stopping NFS server:', error);
  }

  stopClientMonitor();
  serverRunning = false;
  currentStatus = {
    running: false,
    exportDir: '',
    allowedClients: '*',
    options: 'rw,sync,no_subtree_check,no_root_squash',
  };
  sendStatusEvent({ running: false });
}

/**
 * 恢复原始 /etc/exports
 */
function restoreExports(): void {
  try {
    if (fs.existsSync(EXPORTS_BACKUP)) {
      const backup = fs.readFileSync(EXPORTS_BACKUP, 'utf-8');
      fs.writeFileSync('/etc/exports', backup);
      fs.unlinkSync(EXPORTS_BACKUP);
    } else {
      // 没有备份，移除 QSerial 条目
      if (fs.existsSync('/etc/exports')) {
        const content = fs.readFileSync('/etc/exports', 'utf-8');
        const lines = content.split('\n').filter(
          line => !line.includes('# QSerial-NFS')
        );
        fs.writeFileSync('/etc/exports', lines.join('\n').trim() + '\n');
      }
    }
  } catch {
    // 忽略恢复错误
  }
}

/**
 * 获取当前已导出的 NFS 共享列表
 */
export function getNfsExports(): string[] {
  try {
    const output = run('sudo exportfs -v 2>/dev/null || exportfs -v 2>/dev/null');
    return output.split('\n').filter(line => line.trim());
  } catch {
    return [];
  }
}

/**
 * 获取 NFS 客户端连接信息
 */
export function getNfsClients(): NfsClientEvent[] {
  try {
    const output = run('sudo nfsstat -l 2>/dev/null || ss -tn state established \'( dport = :2049 or sport = :2049 )\' 2>/dev/null');
    const clients: NfsClientEvent[] = [];

    // 解析 ss 输出
    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
      if (match) {
        clients.push({
          address: match[1],
          port: parseInt(match[2], 10),
          mountedPath: currentStatus.exportDir,
          action: 'connected',
        });
      }
    }

    return clients;
  } catch {
    return [];
  }
}

/**
 * 启动客户端监控
 */
function startClientMonitor(): void {
  stopClientMonitor();
  monitorTimer = setInterval(() => {
    if (!serverRunning) return;

    const clients = getNfsClients();
    for (const client of clients) {
      sendClientEvent({
        ...client,
        action: 'connected',
      });
    }
  }, 5000);
}

/**
 * 停止客户端监控
 */
function stopClientMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

/**
 * 获取 NFS 服务器状态
 */
export function getNfsStatus(): NfsServerStatus {
  return { ...currentStatus };
}

/**
 * 获取挂载命令提示
 */
export function getMountHint(): { localIp: string; exportDir: string; mountCmd: string } | null {
  if (!serverRunning || !currentStatus.exportDir) return null;

  const os = require('os');
  const interfaces = os.networkInterfaces();
  let localIp = '127.0.0.1';

  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets) continue;
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        localIp = net.address;
        break;
      }
    }
  }

  return {
    localIp,
    exportDir: currentStatus.exportDir,
    mountCmd: `mount -t nfs -o nolock ${localIp}:${currentStatus.exportDir} /mnt/nfs`,
  };
}

/**
 * 销毁 NFS 管理器
 */
export function destroyNfsManager(): void {
  stopNfsServer();
}
