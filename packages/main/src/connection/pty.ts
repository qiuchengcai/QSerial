/**
 * PTY 连接实现
 */

import * as pty from 'node-pty';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  ConnectionType,
  ConnectionState,
  type IConnection,
  type PtyConnectionOptions,
} from '@qserial/shared';
import { EventEmitter } from 'events';

/**
 * 在 Windows 上解析 shell 可执行文件的完整路径。
 * Electron 主进程在 Windows 环境下运行，其 PATH 不包含通过 Git Bash/MSYS2
 * 安装的工具路径（如 C:\Program Files\Git\bin）。node-pty 内部使用
 * child_process.spawn()，只在 Windows PATH 中搜索。
 */
function resolveShellPath(shell: string): string {
  // 已经是绝对路径，直接返回
  if (path.isAbsolute(shell)) {
    if (fs.existsSync(shell)) return shell;
    throw new Error(`Shell not found: ${shell}`);
  }

  // 带路径分隔符（相对路径），转为绝对路径检查
  if (shell.includes('/') || shell.includes('\\')) {
    const resolved = path.resolve(shell);
    if (fs.existsSync(resolved)) return resolved;
    throw new Error(`Shell not found: ${shell} (resolved: ${resolved})`);
  }

  if (process.platform === 'win32') {
    const basename = shell.toLowerCase();

    // Git Bash: 尝试常见安装路径
    if (basename === 'bash' || basename === 'bash.exe') {
      const gitBashPaths = [
        'C:\\Program Files\\Git\\bin\\bash.exe',
        'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
        'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
        'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
      ];
      // 尝试从注册表读取 Git 安装路径
      try {
        const regPath = execSync(
          'reg query "HKLM\\SOFTWARE\\GitForWindows" /v InstallPath 2>nul',
          { encoding: 'utf8', timeout: 3000 }
        );
        const match = regPath.match(/REG_SZ\s+(.+)/);
        if (match) {
          const gitRoot = match[1].trim();
          gitBashPaths.unshift(path.join(gitRoot, 'bin', 'bash.exe'));
          gitBashPaths.unshift(path.join(gitRoot, 'usr', 'bin', 'bash.exe'));
        }
      } catch { /* 注册表无 Git 信息 */ }

      for (const candidate of gitBashPaths) {
        if (fs.existsSync(candidate)) return candidate;
      }

      // 如果还是找不到，尝试在 PATH 中搜索（通过 where 命令，但排除 MSYS2 虚拟路径）
      try {
        const result = execSync(`where ${shell}`, {
          encoding: 'utf8',
          timeout: 3000,
        });
        const lines = result.trim().split('\r\n').filter(Boolean);
        if (lines.length > 0) return lines[0].trim();
      } catch { /* PATH 中也未找到 */ }

      throw new Error(
        `bash.exe 未找到。请确认 Git for Windows 已安装。` +
        `尝试的路径: ${gitBashPaths.slice(0, 4).join(', ')}`
      );
    }

    // WSL: 尝试常见路径
    if (basename === 'wsl' || basename === 'wsl.exe') {
      const wslPath = 'C:\\Windows\\System32\\wsl.exe';
      if (fs.existsSync(wslPath)) return wslPath;
      const wslSysPath = 'C:\\Windows\\Sysnative\\wsl.exe';
      if (fs.existsSync(wslSysPath)) return wslSysPath;
      throw new Error('wsl.exe 未找到，请确认 WSL 已安装');
    }

    // PowerShell / CMD: 在 System32 中
    if (basename === 'powershell.exe' || basename === 'powershell') {
      const psPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      if (fs.existsSync(psPath)) return psPath;
      const psSysPath = 'C:\\Windows\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe';
      if (fs.existsSync(psSysPath)) return psSysPath;
      // fall through to generic resolution
    }
    if (basename === 'cmd.exe' || basename === 'cmd') {
      const cmdPath = 'C:\\Windows\\System32\\cmd.exe';
      if (fs.existsSync(cmdPath)) return cmdPath;
      const cmdSysPath = 'C:\\Windows\\Sysnative\\cmd.exe';
      if (fs.existsSync(cmdSysPath)) return cmdSysPath;
      // fall through to generic resolution
    }
  }

  // 通用解析：直接尝试 spawn 寻找。如果 node-pty 找不到，让原始错误自然抛出
  return shell;
}

export class PtyConnection implements IConnection {
  private ptyProcess: pty.IPty | null = null;
  private eventEmitter = new EventEmitter();
  private _state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectCount = 0;
  private isClosing = false;

  readonly id: string;
  readonly type = ConnectionType.PTY;
  readonly options: PtyConnectionOptions;

  constructor(options: PtyConnectionOptions) {
    this.id = options.id;
    this.options = options;
  }

  get state(): ConnectionState {
    return this._state;
  }

  async open(): Promise<void> {
    if (this.ptyProcess) {
      throw new Error('Connection already open');
    }

    this.isClosing = false;
    this._state = ConnectionState.CONNECTING;
    this.emitStateChange();

    try {
      const shell = resolveShellPath(this.options.shell || this.getDefaultShell());

      this.ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: this.options.cols || 80,
        rows: this.options.rows || 24,
        cwd: this.options.cwd || process.env.HOME || process.cwd(),
        env: { ...process.env, ...this.options.env },
      });

      this.ptyProcess.onData((data) => {
        this.eventEmitter.emit('data', Buffer.from(data));
      });

      this.ptyProcess.onExit(({ exitCode }) => {
        this.ptyProcess = null;
        this.eventEmitter.emit('close', exitCode);
        this.handleReconnect();
      });

      this.cancelReconnect();
      this._state = ConnectionState.CONNECTED;
      this.emitStateChange();
    } catch (error) {
      this._state = ConnectionState.ERROR;
      this.emitStateChange();
      this.eventEmitter.emit('error', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.isClosing = true;
    this.cancelReconnect();
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
    this._state = ConnectionState.DISCONNECTED;
    this.emitStateChange();
  }

  destroy(): void {
    this.isClosing = true;
    this.close();
    this.eventEmitter.removeAllListeners();
  }

  write(data: Buffer | string): void {
    if (this.ptyProcess) {
      this.ptyProcess.write(typeof data === 'string' ? data : data.toString());
    }
  }

  writeHex(hex: string): void {
    this.write(Buffer.from(hex, 'hex'));
  }

  resize(cols: number, rows: number): void {
    if (this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  onData(callback: (data: Buffer) => void): () => void {
    this.eventEmitter.on('data', callback);
    return () => this.eventEmitter.off('data', callback);
  }

  onStateChange(callback: (state: ConnectionState) => void): () => void {
    this.eventEmitter.on('stateChange', callback);
    return () => this.eventEmitter.off('stateChange', callback);
  }

  onError(callback: (error: Error) => void): () => void {
    this.eventEmitter.on('error', callback);
    return () => this.eventEmitter.off('error', callback);
  }

  onClose(callback: (code?: number) => void): () => void {
    this.eventEmitter.on('close', callback);
    return () => this.eventEmitter.off('close', callback);
  }

  private emitStateChange(): void {
    this.eventEmitter.emit('stateChange', this._state);
  }

  private handleReconnect(): void {
    if (!this.options.autoReconnect || this.isClosing) {
      this.ptyProcess = null;
      this._state = ConnectionState.DISCONNECTED;
      this.emitStateChange();
      return;
    }

    const maxAttempts = this.options.reconnectAttempts || 5;
    const interval = this.options.reconnectInterval || 3000;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.reconnectCount >= maxAttempts) {
      this._state = ConnectionState.DISCONNECTED;
      this.emitStateChange();
      this.eventEmitter.emit('error', new Error(`重连失败，已达最大重试次数 (${maxAttempts})`));
      return;
    }

    this._state = ConnectionState.RECONNECTING;
    this.emitStateChange();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectCount++;
      this.ptyProcess = null;
      this.open().catch(() => {
        this.handleReconnect();
      });
    }, interval);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectCount = 0;
  }

  private getDefaultShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }
}
