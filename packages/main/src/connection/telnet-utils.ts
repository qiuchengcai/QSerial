/**
 * TELNET 协议常量与工具函数
 * 由 serialServer 和 connectionServer 共享
 */

import * as net from 'node:net';

// Telnet 命令
export const IAC = 255;
export const WILL = 251;
export const WONT = 252;
export const DO = 253;
export const DONT = 254;
export const SB = 250;
export const SE = 240;
export const NOP = 241;

// Telnet 选项
export const OPT_ECHO = 1;
export const OPT_SUPPRESS_GA = 3;
export const OPT_NAWS = 31;
export const OPT_TTYPE = 24;
export const OPT_LINEMODE = 34;

export const AUTH_TIMEOUT = 10000;

/** TELNET 协商所需的客户端状态字段 */
export interface TelnetClientState {
  socket: net.Socket;
  telnetNegotiated: boolean;
  telnetBuf: Buffer;
  terminalCols: number;
  terminalRows: number;
}

export function findIACSE(data: Buffer, offset: number): number {
  for (let i = offset; i < data.length - 1; i++) {
    if (data[i] === IAC && data[i + 1] === SE) {
      return i;
    }
  }
  return -1;
}

export function sendTelnetNegotiation(socket: net.Socket): void {
  const cmds: number[] = [];
  cmds.push(IAC, WILL, OPT_ECHO);
  cmds.push(IAC, WILL, OPT_SUPPRESS_GA);
  cmds.push(IAC, DO, OPT_SUPPRESS_GA);
  cmds.push(IAC, DO, OPT_NAWS);
  cmds.push(IAC, DO, OPT_TTYPE);
  cmds.push(IAC, DONT, OPT_LINEMODE);
  socket.write(Buffer.from(cmds));
}

export function handleTelnetCommand(socket: net.Socket, cmd: number, opt: number): void {
  if (cmd === WILL) {
    if (opt === OPT_NAWS || opt === OPT_TTYPE || opt === OPT_SUPPRESS_GA) {
      socket.write(Buffer.from([IAC, DO, opt]));
    } else {
      socket.write(Buffer.from([IAC, DONT, opt]));
    }
  } else if (cmd === WONT) {
    socket.write(Buffer.from([IAC, DONT, opt]));
  } else if (cmd === DO) {
    if (opt === OPT_ECHO || opt === OPT_SUPPRESS_GA) {
      socket.write(Buffer.from([IAC, WILL, opt]));
    } else {
      socket.write(Buffer.from([IAC, WONT, opt]));
    }
  } else if (cmd === DONT) {
    socket.write(Buffer.from([IAC, WONT, opt]));
  }
}

/** 处理 NAWS 子协商，提取终端窗口大小 */
export function handleNawsSubnegotiation(
  clientInfo: { terminalCols: number; terminalRows: number },
  subData: Buffer,
): void {
  if (subData.length >= 4) {
    clientInfo.terminalCols = (subData[0] << 8) | subData[1];
    clientInfo.terminalRows = (subData[2] << 8) | subData[3];
  }
}

/**
 * 处理 TELNET 协议数据，剥离 TELNET 命令、提取纯用户数据。
 *
 * @param onSubnegotiation 可选回调，用于处理额外的子协商（如 TTYPE）
 */
export function processTelnetData(
  data: Buffer,
  clientInfo: TelnetClientState,
  onSubnegotiation?: (opt: number, subData: Buffer) => void,
  isReentry = false,
): Buffer {
  const userData: number[] = [];
  let i = 0;

  while (i < data.length) {
    if (data[i] !== IAC) {
      if (data[i] === 0x0D && i + 1 < data.length && (data[i + 1] === 0x0A || data[i + 1] === 0x00)) {
        userData.push(0x0D);
        i += 2;
        continue;
      }
      userData.push(data[i]);
      i++;
      continue;
    }

    // 检测到 IAC → 触发协商
    if (!clientInfo.telnetNegotiated) {
      clientInfo.telnetNegotiated = true;
      sendTelnetNegotiation(clientInfo.socket);
    }

    if (i + 1 >= data.length) break;

    const cmd = data[i + 1];

    if (cmd === IAC) {
      userData.push(255);
      i += 2;
      continue;
    }

    if (cmd === NOP || cmd === SE) {
      i += 2;
      continue;
    }

    if (cmd === WILL || cmd === WONT || cmd === DO || cmd === DONT) {
      if (i + 2 >= data.length) break;
      handleTelnetCommand(clientInfo.socket, cmd, data[i + 2]);
      i += 3;
      continue;
    }

    if (cmd === SB) {
      if (i + 2 >= data.length) break;
      const opt = data[i + 2];
      const sePos = findIACSE(data, i + 3);
      if (sePos === -1) {
        clientInfo.telnetBuf = Buffer.concat([clientInfo.telnetBuf, data.slice(i)]);
        break;
      }
      const subData = data.slice(i + 3, sePos);
      handleNawsSubnegotiation(clientInfo, subData);
      onSubnegotiation?.(opt, subData);
      i = sePos + 2;
      continue;
    }

    i += 2;
  }

  if (clientInfo.telnetBuf.length > 0 && !isReentry) {
    const combined = Buffer.concat([clientInfo.telnetBuf, data]);
    clientInfo.telnetBuf = Buffer.alloc(0);
    return processTelnetData(combined, clientInfo, onSubnegotiation, true);
  }

  return Buffer.from(userData);
}

/**
 * 处理密码认证。
 * 在客户端未认证前，从数据流中逐字符提取密码，验证通过后将 clientInfo 标记为已认证。
 *
 * @returns 认证后返回 null（表示此函数已处理完毕），否则返回剩余数据
 */
export function processPasswordAuth(
  userData: Buffer,
  clientInfo: {
    authBuffer: string;
    authAttempts: number;
    authenticated: boolean;
    authTimer: ReturnType<typeof setTimeout> | null;
  },
  socket: net.Socket,
  accessPassword: string,
  onRemoveClient: () => void,
): void {
  const resetAuthTimer = () => {
    if (clientInfo.authTimer) clearTimeout(clientInfo.authTimer);
    clientInfo.authTimer = setTimeout(() => {
      if (!clientInfo.authenticated) {
        socket.write('\r\nAUTH_TIMEOUT\r\n');
        socket.destroy();
        onRemoveClient();
      }
    }, AUTH_TIMEOUT);
  };

  for (const byte of userData) {
    if (byte === 0x0D || byte === 0x0A) {
      const text = clientInfo.authBuffer.trim();
      clientInfo.authBuffer = '';
      if (!text) continue;
      const pwd = text.startsWith('PASSWORD:') ? text.slice('PASSWORD:'.length) : text;
      if (pwd === accessPassword) {
        clientInfo.authenticated = true;
        if (clientInfo.authTimer) {
          clearTimeout(clientInfo.authTimer);
          clientInfo.authTimer = null;
        }
        socket.write('\r\nOK\r\n');
      } else {
        clientInfo.authAttempts++;
        if (clientInfo.authAttempts >= 3) {
          socket.write('\r\nAUTH_FAILED\r\n');
          socket.destroy();
          onRemoveClient();
        } else {
          resetAuthTimer();
          socket.write('\r\nAUTH_FAILED, retry:\r\nPASSWORD: ');
        }
      }
    } else if (byte === 0x7F || byte === 0x08) {
      clientInfo.authBuffer = clientInfo.authBuffer.slice(0, -1);
      socket.write('\b \b');
    } else if (byte >= 32 && byte < 127) {
      clientInfo.authBuffer += String.fromCharCode(byte);
      socket.write('*');
    }
  }
}
