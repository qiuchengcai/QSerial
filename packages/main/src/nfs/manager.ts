/**
 * NFS 服务器管理器
 * Linux: 通过系统 nfs-kernel-server (exportfs) 管理 NFS 共享
 * Windows: 通过 WinNFSd 子进程管理 NFS 共享
 */

import { BrowserWindow, app } from 'electron';
import { execSync, execFileSync, spawnSync, spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { getLocalIp } from '../utils/network.js';
import {
  IPC_CHANNELS,
  type NfsServerStatus,
  type NfsStatusEvent,
  type NfsClientEvent,
} from '@qserial/shared';

const isWindows = process.platform === 'win32';

let mainWindow: BrowserWindow | null = null;
let serverRunning = false;
let currentStatus: NfsServerStatus = {
  running: false,
  exportDir: '',
  allowedClients: '*',
  options: 'rw,sync,no_subtree_check,no_root_squash',
};

// Windows: WinNFSd 子进程
let nfsdProcess: ChildProcess | null = null;
let nfsdPid: number | null = null;
let nfsdLastError: string = ''; // 最近一次启动的输出/错误信息

// Linux: 客户端监控定时器
let monitorTimer: ReturnType<typeof setInterval> | null = null;

// Linux: exports 备份路径
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
  console.log('[NFS] sendStatusEvent:', JSON.stringify(event), 'serverRunning:', serverRunning);
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

function sudo(args: string[]): string {
  try {
    return execFileSync('sudo', args, { encoding: 'utf-8', timeout: 10000 }).trim();
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    throw new Error(err.stderr?.trim() || err.message || `sudo ${args.join(' ')} failed`);
  }
}

// ==================== Windows: WinNFSd ====================

let nfsTempDir = '';

function getNfsTempDir(): string {
  if (!nfsTempDir) {
    nfsTempDir = path.join(app.getPath('temp'), 'qserial-nfs');
    fs.mkdirSync(nfsTempDir, { recursive: true });
  }
  return nfsTempDir;
}

/**
 * 查找 WinNFSd 可执行文件路径
 */
function findWinnfsdPath(): string | null {
  // 1. 打包后的 extraResources 目录
  //    electron-builder extraResources: from 'resources' to 'resources'
  //    实际路径: process.resourcesPath/resources/nfs/winnfsd.exe
  const packedPath = path.join(process.resourcesPath || '', 'resources', 'nfs', 'winnfsd.exe');
  if (fs.existsSync(packedPath)) return packedPath;

  // 2. 开发模式: 项目 resources 目录
  const devPath = path.join(app.getAppPath(), 'resources', 'nfs', 'winnfsd.exe');
  if (fs.existsSync(devPath)) return devPath;

  // 3. 可执行文件同目录
  const exeDir = path.dirname(app.getPath('exe'));
  const exePath = path.join(exeDir, 'winnfsd.exe');
  if (fs.existsSync(exePath)) return exePath;

  // 4. PATH 环境变量
  try {
    const whichResult = run('where winnfsd.exe');
    if (whichResult) return whichResult.split('\n')[0].trim();
  } catch {
    // not in PATH
  }

  return null;
}

/**
 * 复制 WinNFSd 到本地临时目录，解决网络驱动器执行限制
 */
function copyWinnfsdToTemp(srcPath: string): string {
  const destPath = path.join(getNfsTempDir(), 'winnfsd.exe');
  try {
    const srcStat = fs.statSync(srcPath);
    const destStat = fs.statSync(destPath, { throwIfNoEntry: false });
    if (!destStat || srcStat.mtimeMs > destStat.mtimeMs || srcStat.size !== destStat.size) {
      fs.copyFileSync(srcPath, destPath);
      console.log('[NFS] Copied winnfsd.exe to temp:', destPath);
    }
  } catch {
    fs.copyFileSync(srcPath, destPath);
    console.log('[NFS] Copied winnfsd.exe to temp:', destPath);
  }
  return destPath;
}

/**
 * Windows: 启动 WinNFSd
 */
async function startWinnfsd(exportDir: string, _allowedClients: string, options: string): Promise<void> {
  const originalPath = findWinnfsdPath();
  if (!originalPath) {
    throw new Error(
      '未找到 WinNFSd.exe，请下载 WinNFSd 并放到以下任一位置：\n' +
      `1. ${path.join(process.resourcesPath || '', 'resources', 'nfs', 'winnfsd.exe')}\n` +
      `2. ${path.join(app.getAppPath(), 'resources', 'nfs', 'winnfsd.exe')}\n` +
      `3. 与应用同目录\n` +
      '下载地址: https://github.com/winnfsd/winnfsd/releases'
    );
  }

  // 复制到本地临时目录执行，解决 Windows 网络驱动器执行限制 (spawn EPERM)
  const winnfsdPath = copyWinnfsdToTemp(originalPath);

  // 检查目录是否存在
  if (!fs.existsSync(exportDir)) {
    throw new Error(`共享目录不存在: ${exportDir}`);
  }

  // WinNFSd 需要使用正斜杠或转义的路径
  const normalizedDir = exportDir.replace(/\\/g, '/');

  // 构建 WinNFSd 参数
  // WinNFSd.exe [options] <export_dir> [<alias>] [<export_dir> [<alias>] ...]
  // 选项必须在路径之前，否则可能被误解析
  // 路径和别名成对出现，如果不提供别名，后续选项参数可能被误认为别名
  // 因此必须为每个导出路径提供一个 NFS 挂载别名
  // 别名使用路径的最后一节目录名（如 C:/Users/test/share -> /share）
  const dirName = path.basename(exportDir) || 'export';
  const nfsAlias = '/' + dirName;

  const args: string[] = [];

  // 解析 NFS 选项中的 uid/gid（选项必须放在路径之前）
  const uidMatch = options.match(/no_root_squash|anonuid=(\d+)/);
  const gidMatch = options.match(/anongid=(\d+)/);
  if (uidMatch || gidMatch) {
    const uid = uidMatch?.[1] ? parseInt(uidMatch[1], 10) : 0;
    const gid = gidMatch?.[1] ? parseInt(gidMatch[1], 10) : 0;
    args.push('-id', String(uid), String(gid));
  }

  // 路径和别名放在选项之后
  args.push(normalizedDir, nfsAlias);

  console.log('[NFS] Starting WinNFSd:', winnfsdPath, args.join(' '));

  // 启动子进程
  const proc = spawn(winnfsdPath, args, {
    windowsHide: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  nfsdProcess = proc;

  // 保存 PID 用于后续停止
  nfsdPid = proc.pid ?? null;

  let lastError = '';
  let allOutput = ''; // 收集所有输出用于调试
  nfsdLastError = ''; // 重置上次错误
  let processExited = false;
  let exitCode: number | null = null;

  proc.stdout!.on('data', (data: Buffer) => {
    const msg = data.toString();
    allOutput += msg;
    console.log('[NFS] stdout:', msg.trim());
  });

  proc.stderr!.on('data', (data: Buffer) => {
    const msg = data.toString();
    allOutput += msg;
    console.log('[NFS] stderr:', msg.trim());
    if (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('fail')) {
      lastError = msg.trim();
    }
  });

  proc.on('error', (err) => {
    console.log('[NFS] process error:', err.message);
    processExited = true;
  });

  proc.on('exit', (code) => {
    processExited = true;
    exitCode = code;
    console.log('[NFS] process exit: code=', code, 'nfsdProcess===proc=', nfsdProcess === proc, 'serverRunning=', serverRunning);
  });

  // WinNFSd 2.4.0 在管道模式下可能不输出 "listening on" 等就绪信号
  // 采用轮询策略：每 500ms 检查进程是否存活 + NFS 端口 2049 是否可连接
  // 最多等待 10 秒
  const NFS_PORT = 2049;
  const MAX_WAIT_MS = 10000;
  const CHECK_INTERVAL_MS = 500;

  const checkPort = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 1000);
      socket.connect(port, '127.0.0.1', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(false);
      });
    });
  };

  const startTime = Date.now();
  while (Date.now() - startTime < MAX_WAIT_MS) {
    // 进程已退出，启动失败
    if (processExited) {
      const detail = allOutput ? `\n输出:\n${allOutput.trim()}` : '';
      nfsdLastError = `WinNFSd 异常退出，退出码: ${exitCode}${lastError ? ` (${lastError})` : ''}${detail}`;
      killWinnfsd();
      throw new Error(nfsdLastError);
    }

    // 检查 NFS 端口是否已开放
    const portOpen = await checkPort(NFS_PORT);
    if (portOpen) {
      console.log('[NFS] Port 2049 is open, WinNFSd is ready');
      break;
    }

    // 等待后重试
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));
  }

  // 最终检查：进程是否仍在运行
  if (processExited) {
    const detail = allOutput ? `\n输出:\n${allOutput.trim()}` : '';
    nfsdLastError = `WinNFSd 启动后退出，退出码: ${exitCode}${lastError ? ` (${lastError})` : ''}${detail}`;
    killWinnfsd();
    throw new Error(nfsdLastError);
  }

  // 设置运行中进程的 exit 监听（用于后续异常退出通知）
  proc.on('exit', (code) => {
    // 防止重复处理（上面已经注册了 exit 监听）
    // 这里只处理服务运行中的异常退出
    console.log('[NFS] running process exit: code=', code, 'nfsdProcess===proc=', nfsdProcess === proc, 'serverRunning=', serverRunning);
    if (nfsdProcess === proc) {
      const detail = allOutput ? `\n输出:\n${allOutput.trim()}` : '';
      nfsdLastError = `退出码: ${code}${lastError ? ` (${lastError})` : ''}${detail}`;
      if (!serverRunning) return;
      serverRunning = false;
      currentStatus = {
        running: false,
        exportDir: '',
        allowedClients: '*',
        options: 'rw,sync,no_subtree_check,no_root_squash',
      };
      const errMsg = lastError
        ? `WinNFSd 异常退出 (退出码: ${code}): ${lastError}`
        : `WinNFSd 异常退出，退出码: ${code}`;
      sendStatusEvent({ running: false, error: errMsg });
    }
  });
}

/**
 * Windows: 停止 WinNFSd
 */
function killWinnfsd(): void {
  if (isWindows && nfsdPid) {
    // Windows: 使用 taskkill 强制结束进程树
    try {
      execSync(`taskkill /pid ${nfsdPid} /T /F 2>nul`, { timeout: 3000 });
    } catch {
      // 忽略
    }
  }
  if (nfsdProcess && !nfsdProcess.killed) {
    try {
      nfsdProcess.kill();
    } catch {
      // 忽略
    }
  }
  nfsdProcess = null;
  nfsdPid = null;
}

// ==================== Linux: exportfs ====================

function writeExports(content: string): void {
  try {
    spawnSync('sudo', ['tee', '/etc/exports'], { input: content, encoding: 'utf-8', timeout: 10000 });
  } catch {
    fs.writeFileSync('/etc/exports', content);
  }
}

function restoreExports(): void {
  try {
    if (fs.existsSync(EXPORTS_BACKUP)) {
      const backup = fs.readFileSync(EXPORTS_BACKUP, 'utf-8');
      writeExports(backup);
      fs.unlinkSync(EXPORTS_BACKUP);
    } else {
      if (fs.existsSync('/etc/exports')) {
        const content = fs.readFileSync('/etc/exports', 'utf-8');
        const lines = content.split('\n').filter(
          line => !line.includes('# QSerial-NFS')
        );
        writeExports(lines.join('\n').trim() + '\n');
      }
    }
  } catch {
    // 忽略恢复错误
  }
}

/**
 * Linux: 启动 NFS 服务器
 */
function startLinuxNfs(exportDir: string, allowedClients: string, options: string): void {
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
    // 确保 /etc/exports 存在
    if (!fs.existsSync('/etc/exports')) {
      try {
        run('sudo touch /etc/exports');
      } catch {
        try {
          fs.writeFileSync('/etc/exports', '# NFS exports\n');
        } catch {
          throw new Error('无法创建 /etc/exports，请使用 sudo 运行或手动创建该文件');
        }
      }
    }

    // 构建 exports 条目
    const exportEntry = `${exportDir} ${allowedClients}(${options})`;

    // 读取现有 /etc/exports，移除旧的 QSerial 条目
    let exportsContent = fs.readFileSync('/etc/exports', 'utf-8');
    const lines = exportsContent.split('\n').filter(
      line => !line.includes('# QSerial-NFS')
    );
    exportsContent = lines.join('\n').trim();

    // 添加 QSerial 条目
    exportsContent += `\n${exportEntry}  # QSerial-NFS\n`;

    // 写入 /etc/exports
    try {
      spawnSync('sudo', ['tee', '/etc/exports'], { input: exportsContent, encoding: 'utf-8', timeout: 10000 });
    } catch {
      fs.writeFileSync('/etc/exports', exportsContent);
    }

    // 导出共享
    sudo(['exportfs', '-ra']);

    // 确保 NFS 服务运行
    try {
      run('sudo systemctl start nfs-kernel-server 2>/dev/null || true');
    } catch {
      try {
        run('sudo rpc.nfsd 8');
        run('sudo rpc.mountd');
      } catch {
        // 忽略，可能已经在运行
      }
    }
  } catch (error) {
    restoreExports();
    throw error;
  }
}

/**
 * Linux: 停止 NFS 服务器
 */
function stopLinuxNfs(): void {
  try {
    if (currentStatus.exportDir) {
      try {
        sudo(['exportfs', '-u', `${currentStatus.allowedClients}:${currentStatus.exportDir}`]);
      } catch {
        try {
          sudo(['exportfs', '-ra']);
        } catch {
          // 忽略
        }
      }
    }

    restoreExports();

    try {
      sudo(['exportfs', '-ra']);
    } catch {
      // 忽略
    }
  } catch (error) {
    console.error('Error stopping NFS server:', error);
  }
}

// ==================== 公共接口 ====================

/**
 * 启动 NFS 服务器
 */
export async function startNfsServer(exportDir: string, allowedClients: string, options: string): Promise<void> {
  console.log('[NFS] startNfsServer called, serverRunning:', serverRunning, 'isWindows:', isWindows, 'nfsdProcess:', !!nfsdProcess);
  // 先静默清理已有服务（不发送状态事件，避免渲染进程竞态）
  if (serverRunning || (isWindows && nfsdProcess)) {
    console.log('[NFS] silently stopping existing server before start');
    if (isWindows) {
      killWinnfsd();
    } else {
      stopLinuxNfs();
    }
    stopClientMonitor();
    serverRunning = false;
    currentStatus = {
      running: false,
      exportDir: '',
      allowedClients: '*',
      options: 'rw,sync,no_subtree_check,no_root_squash',
    };
    // 注意：不调用 sendStatusEvent，避免发送 running:false 造成竞态
  }

  // Windows: 确保没有残留的 WinNFSd 进程占用端口
  if (isWindows) {
    try {
      execSync('taskkill /F /IM winnfsd.exe 2>nul', { timeout: 3000 });
    } catch {
      // 没有残留进程，忽略
    }
    // 等待进程完全退出
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (isWindows) {
    await startWinnfsd(exportDir, allowedClients, options);

    // WinNFSd 输出就绪信号后，再等待 1 秒确认进程没有立即退出
    // 避免发送 running:true 后立刻又发 running:false 造成渲染端状态混乱
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 检查进程是否在稳定性验证期间退出
    if (!nfsdProcess || nfsdProcess.killed || nfsdProcess.exitCode !== null) {
      serverRunning = false;
      // 收集退出码和输出信息
      const exitInfo = nfsdProcess?.exitCode !== null && nfsdProcess?.exitCode !== undefined
        ? `（退出码: ${nfsdProcess.exitCode}）` : '';
      const outputInfo = nfsdLastError ? `\n进程输出: ${nfsdLastError}` : '';
      // 清理进程引用
      nfsdProcess = null;
      nfsdPid = null;
      throw new Error(
        `WinNFSd 启动后立即退出${exitInfo}，可能原因：\n` +
        '1. 端口 2049 被其他程序占用\n' +
        '2. 共享目录路径包含特殊字符\n' +
        '3. WinNFSd 版本不兼容' +
        outputInfo
      );
    }
  } else {
    startLinuxNfs(exportDir, allowedClients, options);
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
}

/**
 * 停止 NFS 服务器
 */
export function stopNfsServer(): void {
  if (!serverRunning && !(isWindows && nfsdProcess)) return;

  if (isWindows) {
    killWinnfsd();
  } else {
    stopLinuxNfs();
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
 * 获取 NFS 服务器状态
 */
export function getNfsStatus(): NfsServerStatus {
  console.log('[NFS] getNfsStatus: serverRunning=', serverRunning, 'currentStatus=', JSON.stringify(currentStatus), 'nfsdProcess=', !!nfsdProcess, 'nfsdPid=', nfsdPid);
  return { ...currentStatus };
}

/**
 * 获取挂载命令提示
 */
export function getMountHint(): { localIp: string; exportDir: string; mountCmd: string } | null {
  if (!serverRunning || !currentStatus.exportDir) return null;

  const localIp = getLocalIp();

  // WinNFSd 使用别名作为 NFS 导出路径
  // 例如: C:\Users\test\share 别名 /share -> 客户端挂载 /share
  // 如果没有别名，则使用完整路径如 /C:/Users/test/share
  let exportPath: string;
  if (isWindows) {
    const dirName = path.basename(currentStatus.exportDir) || 'export';
    exportPath = '/' + dirName;
  } else {
    exportPath = currentStatus.exportDir;
  }

  return {
    localIp,
    exportDir: exportPath,
    mountCmd: `mkdir -p /mnt/nfs\nmount -t nfs -o nolock ${localIp}:${exportPath} /mnt/nfs`,
  };
}

/**
 * 获取 NFS 客户端连接信息
 */
export function getNfsClients(): NfsClientEvent[] {
  try {
    if (isWindows) {
      // Windows: 通过 netstat 检测 NFS 端口 2049 的 TCP 连接
      const output = run('netstat -an -p tcp 2>nul');
      const clients: NfsClientEvent[] = [];
      const seen = new Set<string>();
      const lines = output.split('\n');
      for (const line of lines) {
        // 匹配 ESTABLISHED 状态且本地端口为 2049 的连接
        // 格式: TCP    0.0.0.0:2049    192.168.1.100:12345    ESTABLISHED
        const match = line.match(/^\s*TCP\s+\S+:2049\s+(\d+\.\d+\.\d+\.\d+):(\d+)\s+ESTABLISHED/i);
        if (match) {
          const addr = match[1];
          if (addr === '0.0.0.0' || addr === '127.0.0.1') continue;
          if (seen.has(addr)) continue;
          seen.add(addr);
          clients.push({
            address: addr,
            port: parseInt(match[2], 10),
            mountedPath: currentStatus.exportDir,
            action: 'connected',
          });
        }
      }
      return clients;
    } else {
      // Linux: 通过 nfsstat 或 ss 检测
      const output = run('sudo nfsstat -l 2>/dev/null || ss -tn state established \'( dport = :2049 or sport = :2049 )\' 2>/dev/null');
      const clients: NfsClientEvent[] = [];
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
    }
  } catch {
    return [];
  }
}

/**
 * 启动客户端监控
 */
// 上一次检测到的客户端 IP 集合，用于检测新连接和断开
let lastKnownClients = new Set<string>();

function startClientMonitor(): void {
  stopClientMonitor();
  lastKnownClients.clear();
  monitorTimer = setInterval(() => {
    if (!serverRunning) return;

    const clients = getNfsClients();
    const currentIps = new Set(clients.map(c => c.address));

    // 新连接：上次没有，这次有
    for (const client of clients) {
      if (!lastKnownClients.has(client.address)) {
        sendClientEvent({
          ...client,
          action: 'connected',
        });
      }
    }

    // 断开连接：上次有，这次没有
    for (const ip of lastKnownClients) {
      if (!currentIps.has(ip)) {
        sendClientEvent({
          address: ip,
          mountedPath: currentStatus.exportDir,
          action: 'disconnected',
        });
      }
    }

    lastKnownClients = currentIps;
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
 * 初始化 NFS 管理器：清理上次残留的 WinNFSd 进程
 * 应用重启后主进程内存变量重置，但系统中的 WinNFSd 进程可能仍在运行
 */
export function initNfsManager(): void {
  if (isWindows) {
    try {
      execSync('taskkill /F /IM winnfsd.exe 2>nul', { timeout: 3000 });
      console.log('[NFS] Cleaned up residual WinNFSd process on startup');
    } catch {
      // 没有残留进程，忽略
    }
  }
}

/**
 * 销毁 NFS 管理器
 */
export function destroyNfsManager(): void {
  stopNfsServer();
}
