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
  keybindings: Record<string, string>;
  window: WindowSettings;
}

/**
 * 应用设置
 */
export interface AppSettings {
  language: 'zh-CN' | 'en-US';
  theme: string;
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
  lineHeight: number;
  cursorStyle: 'block' | 'underline' | 'bar';
  cursorBlink: boolean;
  scrollback: number;
  copyOnSelect: boolean;
  rightClickPaste: boolean;
  bellStyle: 'none' | 'sound' | 'visual';
  enableWebLinks: boolean;
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
    autoUpdate: true,
    checkUpdateOnStartup: true,
    minimizeToTray: false,
    closeToTray: false,
  },

  terminal: {
    fontSize: 14,
    fontFamily: 'JetBrains Mono, Consolas, "Courier New", monospace',
    lineHeight: 1.2,
    cursorStyle: 'bar',
    cursorBlink: true,
    scrollback: 10000,
    copyOnSelect: false,
    rightClickPaste: true,
    bellStyle: 'none',
    enableWebLinks: true,
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

  keybindings: {
    'terminal:new': 'Ctrl+Shift+T',
    'terminal:close': 'Ctrl+Shift+W',
    'terminal:split': 'Ctrl+Shift+D',
    'terminal:find': 'Ctrl+Shift+F',
    'terminal:clear': 'Ctrl+Shift+K',
    'tab:next': 'Ctrl+Tab',
    'tab:prev': 'Ctrl+Shift+Tab',
    'view:toggle-sidebar': 'Ctrl+B',
    'view:settings': 'Ctrl+,',
    'view:fullscreen': 'F11',
  },

  window: {
    width: 1200,
    height: 800,
    maximized: false,
  },
};
