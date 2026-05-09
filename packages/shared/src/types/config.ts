/**
 * 配置类型定义
 */

/**
 * 应用配置
 */
export interface AppConfig {
  app: AppSettings;
  terminal: TerminalSettings;
  serial: SerialSettings;
  ssh: SshSettings;
  serialShare: SerialShareSettings; // @deprecated 使用 connectionShare
  connectionShare: ConnectionShareSettings;
  window: WindowSettings;
}

/**
 * 应用设置
 */
export interface AppSettings {
  language: 'zh-CN' | 'en-US';
  theme: string;
  uiFontFamily: string;
  autoUpdate: boolean;
  checkUpdateOnStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
}

/**
 * 终端设置
 */
export interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
  scrollback: number;
  copyOnSelect: boolean;
  rightClickPaste: boolean;
  bellStyle: 'none' | 'sound' | 'visual';
  enableWebLinks: boolean;
  autoReconnect: boolean;
  reconnectInterval: number;
  reconnectAttempts: number;
}

/**
 * 串口设置
 */
export interface SerialSettings {
  defaultBaudRate: number;
  defaultDataBits: 5 | 6 | 7 | 8;
  defaultStopBits: 1 | 1.5 | 2;
  defaultParity: 'none' | 'even' | 'odd';
  autoReconnect: boolean;
  reconnectInterval: number;
  reconnectAttempts: number;
  showTimestamp: boolean;
  hexDisplay: boolean;
}

/**
 * SSH 设置
 */
export interface SshSettings {
  keepaliveInterval: number;
  keepaliveCountMax: number;
  readyTimeout: number;
  defaultPort: number;
}

/**
 * 串口共享设置
 * @deprecated 使用 ConnectionShareSettings 替代
 */
export interface SerialShareSettings {
  defaultLocalPort: number;
  // 最近使用的SSH隧道配置
  recentSshTunnel?: {
    host: string;
    port: number;
    username: string;
    remotePort: number;
    savePassword: boolean;
  };
}

/**
 * 连接共享设置
 */
export interface ConnectionShareSettings {
  defaultLocalPort: number;
  defaultListenAddress?: string;
  recentSshTunnel?: {
    host: string;
    port: number;
    username: string;
    remotePort: number;
    savePassword: boolean;
  };
}

/**
 * 窗口设置
 */
export interface WindowSettings {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: AppConfig = {
  app: {
    language: 'zh-CN',
    theme: 'default-dark',
    uiFontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    autoUpdate: true,
    checkUpdateOnStartup: true,
    minimizeToTray: false,
    closeToTray: false,
  },

  terminal: {
    fontSize: 14,
    fontFamily: 'JetBrains Mono, Consolas, "Courier New", monospace',
    scrollback: 10000,
    copyOnSelect: false,
    rightClickPaste: true,
    bellStyle: 'none',
    enableWebLinks: true,
    autoReconnect: true,
    reconnectInterval: 3000,
    reconnectAttempts: 5,
  },

  serial: {
    defaultBaudRate: 9600,
    defaultDataBits: 8,
    defaultStopBits: 1,
    defaultParity: 'none',
    autoReconnect: true,
    reconnectInterval: 3000,
    reconnectAttempts: 5,
    showTimestamp: false,
    hexDisplay: false,
  },

  ssh: {
    keepaliveInterval: 30000,
    keepaliveCountMax: 3,
    readyTimeout: 20000,
    defaultPort: 22,
  },

  serialShare: {
    defaultLocalPort: 8888,
  },

  connectionShare: {
    defaultLocalPort: 8888,
    defaultListenAddress: '0.0.0.0',
  },

  window: {
    width: 1200,
    height: 800,
    maximized: false,
  },
};
