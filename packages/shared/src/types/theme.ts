/**
 * 主题类型定义
 */

/**
 * xterm.js 主题配置
 */
export interface XtermTheme {
  foreground?: string;
  background?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionForeground?: string;
  selectionBackground?: string;
  selectionInactiveBackground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
  extendedAnsi?: string[];
}

/**
 * UI 主题颜色
 */
export interface UIColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  hover: string;
  active: string;
  error: string;
  warning: string;
  success: string;
}

/**
 * UI 主题字体
 */
export interface UIFonts {
  sans: string;
  mono: string;
  sizes: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
  };
}

/**
 * UI 主题配置
 */
export interface UITheme {
  colors: UIColors;
  fonts: UIFonts;
  radius: {
    none: string;
    sm: string;
    md: string;
    lg: string;
    full: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
  };
  transitions: {
    fast: string;
    normal: string;
    slow: string;
  };
  /**
   * 背景纹理 (CSS background 值)
   * 例如: "url('data:image/svg+xml,...')"
   */
  texture?: string;
}

/**
 * 完整主题
 */
export interface Theme {
  id: string;
  name: string;
  author?: string;
  version?: string;
  type: 'light' | 'dark';
  xterm: XtermTheme;
  ui: UITheme;
}

// 基础字体配置
const BASE_FONTS: UIFonts = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: 'JetBrains Mono, Consolas, monospace',
  sizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
  },
};

// 基础圆角配置
const BASE_RADIUS = {
  none: '0',
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  full: '9999px',
};

// 基础过渡配置
const BASE_TRANSITIONS = {
  fast: '150ms ease',
  normal: '250ms ease',
  slow: '350ms ease',
};

/**
 * 默认暗色主题
 */
export const DEFAULT_DARK_THEME: Theme = {
  id: 'default-dark',
  name: 'Default Dark',
  type: 'dark',
  xterm: {
    foreground: '#D4D4D4',
    background: '#1E1E1E',
    cursor: '#FFFFFF',
    cursorAccent: '#000000',
    selectionBackground: '#264F78',
    black: '#000000',
    red: '#CD3131',
    green: '#0DBC79',
    yellow: '#E5E510',
    blue: '#2472C8',
    magenta: '#BC3FBC',
    cyan: '#11A8CD',
    white: '#E5E5E5',
    brightBlack: '#666666',
    brightRed: '#F14C4C',
    brightGreen: '#23D18B',
    brightYellow: '#F5F543',
    brightBlue: '#3B8EEA',
    brightMagenta: '#D670D6',
    brightCyan: '#29B8DB',
    brightWhite: '#E5E5E5',
  },
  ui: {
    colors: {
      primary: '#0078D4',
      secondary: '#6C757D',
      accent: '#17A2B8',
      background: '#1E1E1E',
      surface: '#252526',
      text: '#CCCCCC',
      textSecondary: '#A0A0A0',
      border: '#3C3C3C',
      hover: '#2A2D2E',
      active: '#37373D',
      error: '#F44747',
      warning: '#D19A66',
      success: '#89D185',
    },
    fonts: BASE_FONTS,
    radius: BASE_RADIUS,
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
      md: '0 4px 6px rgba(0, 0, 0, 0.3)',
      lg: '0 10px 15px rgba(0, 0, 0, 0.3)',
    },
    transitions: BASE_TRANSITIONS,
  },
};

/**
 * 默认亮色主题
 */
export const DEFAULT_LIGHT_THEME: Theme = {
  id: 'default-light',
  name: 'Default Light',
  type: 'light',
  xterm: {
    foreground: '#333333',
    background: '#FFFFFF',
    cursor: '#000000',
    cursorAccent: '#FFFFFF',
    selectionBackground: '#ADD6FF',
    black: '#000000',
    red: '#CD3131',
    green: '#00BC00',
    yellow: '#949800',
    blue: '#0451A5',
    magenta: '#BC05BC',
    cyan: '#0598BC',
    white: '#555555',
    brightBlack: '#666666',
    brightRed: '#CD3131',
    brightGreen: '#14CE14',
    brightYellow: '#B5BA00',
    brightBlue: '#0451A5',
    brightMagenta: '#BC05BC',
    brightCyan: '#0598BC',
    brightWhite: '#A5A5A5',
  },
  ui: {
    colors: {
      primary: '#0078D4',
      secondary: '#6C757D',
      accent: '#17A2B8',
      background: '#F3F3F3',
      surface: '#FFFFFF',
      text: '#333333',
      textSecondary: '#505050',
      border: '#E5E5E5',
      hover: '#E8E8E8',
      active: '#D4D4D4',
      error: '#D32F2F',
      warning: '#F57C00',
      success: '#388E3C',
    },
    fonts: BASE_FONTS,
    radius: BASE_RADIUS,
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.1)',
      md: '0 4px 6px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    },
    transitions: BASE_TRANSITIONS,
  },
};

/**
 * One Dark 主题
 */
export const ONE_DARK_THEME: Theme = {
  id: 'one-dark',
  name: 'One Dark',
  author: 'Atom',
  type: 'dark',
  xterm: {
    foreground: '#ABB2BF',
    background: '#282C34',
    cursor: '#528BFF',
    cursorAccent: '#282C34',
    selectionBackground: '#3E4451',
    black: '#282C34',
    red: '#E06C75',
    green: '#98C379',
    yellow: '#E5C07B',
    blue: '#61AFEF',
    magenta: '#C678DD',
    cyan: '#56B6C2',
    white: '#ABB2BF',
    brightBlack: '#5C6370',
    brightRed: '#E06C75',
    brightGreen: '#98C379',
    brightYellow: '#E5C07B',
    brightBlue: '#61AFEF',
    brightMagenta: '#C678DD',
    brightCyan: '#56B6C2',
    brightWhite: '#FFFFFF',
  },
  ui: {
    colors: {
      primary: '#61AFEF',
      secondary: '#5C6370',
      accent: '#C678DD',
      background: '#282C34',
      surface: '#21252B',
      text: '#ABB2BF',
      textSecondary: '#8B9298',
      border: '#181A1F',
      hover: '#2C313A',
      active: '#3E4451',
      error: '#E06C75',
      warning: '#E5C07B',
      success: '#98C379',
    },
    fonts: BASE_FONTS,
    radius: BASE_RADIUS,
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
      md: '0 4px 6px rgba(0, 0, 0, 0.4)',
      lg: '0 10px 15px rgba(0, 0, 0, 0.4)',
    },
    transitions: BASE_TRANSITIONS,
  },
};

/**
 * Dracula 主题
 */
export const DRACULA_THEME: Theme = {
  id: 'dracula',
  name: 'Dracula',
  author: 'Dracula Theme',
  type: 'dark',
  xterm: {
    foreground: '#F8F8F2',
    background: '#282A36',
    cursor: '#F8F8F2',
    cursorAccent: '#282A36',
    selectionBackground: '#44475A',
    black: '#21222C',
    red: '#FF5555',
    green: '#50FA7B',
    yellow: '#F1FA8C',
    blue: '#BD93F9',
    magenta: '#FF79C6',
    cyan: '#8BE9FD',
    white: '#F8F8F2',
    brightBlack: '#6272A4',
    brightRed: '#FF6E6E',
    brightGreen: '#69FF94',
    brightYellow: '#FFFFA5',
    brightBlue: '#D6ACFF',
    brightMagenta: '#FF92DF',
    brightCyan: '#A4FFFF',
    brightWhite: '#FFFFFF',
  },
  ui: {
    colors: {
      primary: '#BD93F9',
      secondary: '#6272A4',
      accent: '#FF79C6',
      background: '#282A36',
      surface: '#44475A',
      text: '#F8F8F2',
      textSecondary: '#9CA0C5',
      border: '#191A21',
      hover: '#44475A',
      active: '#44475A',
      error: '#FF5555',
      warning: '#F1FA8C',
      success: '#50FA7B',
    },
    fonts: BASE_FONTS,
    radius: BASE_RADIUS,
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
      md: '0 4px 6px rgba(0, 0, 0, 0.4)',
      lg: '0 10px 15px rgba(0, 0, 0, 0.4)',
    },
    transitions: BASE_TRANSITIONS,
  },
};

/**
 * Monokai 主题
 */
export const MONOKAI_THEME: Theme = {
  id: 'monokai',
  name: 'Monokai',
  author: 'Wimer Hazenberg',
  type: 'dark',
  xterm: {
    foreground: '#F8F8F2',
    background: '#272822',
    cursor: '#F8F8F0',
    cursorAccent: '#272822',
    selectionBackground: '#49483E',
    black: '#272822',
    red: '#F92672',
    green: '#A6E22E',
    yellow: '#F4BF75',
    blue: '#66D9EF',
    magenta: '#AE81FF',
    cyan: '#A1EFE4',
    white: '#F8F8F2',
    brightBlack: '#75715E',
    brightRed: '#F92672',
    brightGreen: '#A6E22E',
    brightYellow: '#F4BF75',
    brightBlue: '#66D9EF',
    brightMagenta: '#AE81FF',
    brightCyan: '#A1EFE4',
    brightWhite: '#F9F8F5',
  },
  ui: {
    colors: {
      primary: '#A6E22E',
      secondary: '#75715E',
      accent: '#AE81FF',
      background: '#272822',
      surface: '#3E3D32',
      text: '#F8F8F2',
      textSecondary: '#A8A190',
      border: '#1E1F1C',
      hover: '#3E3D32',
      active: '#49483E',
      error: '#F92672',
      warning: '#F4BF75',
      success: '#A6E22E',
    },
    fonts: BASE_FONTS,
    radius: BASE_RADIUS,
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
      md: '0 4px 6px rgba(0, 0, 0, 0.4)',
      lg: '0 10px 15px rgba(0, 0, 0, 0.4)',
    },
    transitions: BASE_TRANSITIONS,
  },
};

/**
 * Nord 主题
 */
export const NORD_THEME: Theme = {
  id: 'nord',
  name: 'Nord',
  author: 'Arctic Ice Studio',
  type: 'dark',
  xterm: {
    foreground: '#D8DEE9',
    background: '#2E3440',
    cursor: '#D8DEE9',
    cursorAccent: '#2E3440',
    selectionBackground: '#434C5E',
    black: '#3B4252',
    red: '#BF616A',
    green: '#A3BE8C',
    yellow: '#EBCB8B',
    blue: '#81A1C1',
    magenta: '#B48EAD',
    cyan: '#88C0D0',
    white: '#E5E9F0',
    brightBlack: '#4C566A',
    brightRed: '#BF616A',
    brightGreen: '#A3BE8C',
    brightYellow: '#EBCB8B',
    brightBlue: '#81A1C1',
    brightMagenta: '#B48EAD',
    brightCyan: '#8FBCBB',
    brightWhite: '#ECEFF4',
  },
  ui: {
    colors: {
      primary: '#88C0D0',
      secondary: '#4C566A',
      accent: '#B48EAD',
      background: '#2E3440',
      surface: '#3B4252',
      text: '#D8DEE9',
      textSecondary: '#9CA3B8',
      border: '#242933',
      hover: '#3B4252',
      active: '#434C5E',
      error: '#BF616A',
      warning: '#EBCB8B',
      success: '#A3BE8C',
    },
    fonts: BASE_FONTS,
    radius: BASE_RADIUS,
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
      md: '0 4px 6px rgba(0, 0, 0, 0.3)',
      lg: '0 10px 15px rgba(0, 0, 0, 0.3)',
    },
    transitions: BASE_TRANSITIONS,
  },
};

/**
 * Solarized Dark 主题
 */
export const SOLARIZED_DARK_THEME: Theme = {
  id: 'solarized-dark',
  name: 'Solarized Dark',
  author: 'Ethan Schoonover',
  type: 'dark',
  xterm: {
    foreground: '#839496',
    background: '#002B36',
    cursor: '#839496',
    cursorAccent: '#002B36',
    selectionBackground: '#073642',
    black: '#073642',
    red: '#DC322F',
    green: '#859900',
    yellow: '#B58900',
    blue: '#268BD2',
    magenta: '#D33682',
    cyan: '#2AA198',
    white: '#EEE8D5',
    brightBlack: '#002B36',
    brightRed: '#CB4B16',
    brightGreen: '#586E75',
    brightYellow: '#657B83',
    brightBlue: '#839496',
    brightMagenta: '#6C71C4',
    brightCyan: '#93A1A1',
    brightWhite: '#FDF6E3',
  },
  ui: {
    colors: {
      primary: '#268BD2',
      secondary: '#586E75',
      accent: '#D33682',
      background: '#002B36',
      surface: '#073642',
      text: '#839496',
      textSecondary: '#7A8B8C',
      border: '#001E26',
      hover: '#073642',
      active: '#094B5A',
      error: '#DC322F',
      warning: '#B58900',
      success: '#859900',
    },
    fonts: BASE_FONTS,
    radius: BASE_RADIUS,
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
      md: '0 4px 6px rgba(0, 0, 0, 0.4)',
      lg: '0 10px 15px rgba(0, 0, 0, 0.4)',
    },
    transitions: BASE_TRANSITIONS,
  },
};

/**
 * 纸质书主题
 * 模拟泛黄旧书页的真实质感，带有岁月痕迹
 */
export const PAPER_BOOK_THEME: Theme = {
  id: 'paper-book',
  name: 'Paper Book',
  author: 'QSerial',
  type: 'light',
  xterm: {
    // 墨水色 - 模拟钢笔墨迹
    foreground: '#2C2416',
    // 泛黄旧纸背景
    background: '#F4ECD8',
    // 光标像蘸水笔
    cursor: '#1A1408',
    cursorAccent: '#F4ECD8',
    // 选区像荧光笔划过
    selectionBackground: '#C9B896',
    // ANSI 颜色 - 复古墨水调
    black: '#1A1408',
    red: '#8B3A2F',
    green: '#3D5C3A',
    yellow: '#7A6324',
    blue: '#2B4A6B',
    magenta: '#6B3A5C',
    cyan: '#2B5C5C',
    white: '#E8DFC8',
    // 高亮色 - 稍鲜艳的墨水
    brightBlack: '#4A4035',
    brightRed: '#A84A3D',
    brightGreen: '#4A7C45',
    brightYellow: '#9A8334',
    brightBlue: '#3B5C7B',
    brightMagenta: '#7B4A6C',
    brightCyan: '#3B7C7C',
    brightWhite: '#F8F0DC',
  },
  ui: {
    colors: {
      // 主色调 - 深棕墨色
      primary: '#4A3728',
      // 次要色 - 旧皮革色
      secondary: '#8B7355',
      // 强调色 - 古铜色
      accent: '#6B4423',
      // 背景 - 泛黄书页
      background: '#F4ECD8',
      // 表面 - 更深的纸张，形成层次感
      surface: '#DDD4BC',
      // 文字 - 墨水黑
      text: '#2C2416',
      // 次要文字 - 深墨色，确保清晰可读
      textSecondary: '#3D3528',
      // 边框 - 书页折痕
      border: '#C9B896',
      // 悬停 - 纸张阴影
      hover: '#E5DCC4',
      // 激活 - 书页翻动
      active: '#D8CDB0',
      // 错误 - 朱砂红
      error: '#8B3A2F',
      // 警告 - 赭石黄
      warning: '#7A6324',
      // 成功 - 松烟绿
      success: '#3D5C3A',
    },
    fonts: {
      // 衬线字体更有书卷气
      sans: 'Georgia, "Noto Serif SC", "Source Han Serif SC", "Times New Roman", serif',
      mono: '"Fira Code", "Source Code Pro", Consolas, monospace',
      sizes: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
      },
    },
    radius: BASE_RADIUS,
    // 柔和的纸张阴影
    shadows: {
      sm: '0 1px 2px rgba(44, 36, 22, 0.06)',
      md: '0 3px 8px rgba(44, 36, 22, 0.08), 0 1px 2px rgba(44, 36, 22, 0.04)',
      lg: '0 8px 24px rgba(44, 36, 22, 0.1), 0 2px 6px rgba(44, 36, 22, 0.06)',
    },
    transitions: BASE_TRANSITIONS,
    // 纸张纹理 - 模拟旧书页的纤维质感
    texture: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
  },
};

/**
 * 预设主题列表
 */
export const PRESET_THEMES: Theme[] = [
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  ONE_DARK_THEME,
  DRACULA_THEME,
  MONOKAI_THEME,
  NORD_THEME,
  SOLARIZED_DARK_THEME,
  PAPER_BOOK_THEME,
];
