/**
 * MCP 类型定义
 */

/** 终端类型 */
export type TerminalType = 'serial' | 'ssh';

/** 终端连接配置 */
export interface TerminalConnectConfig {
    type: TerminalType;
    // 串口参数
    path?: string;
    baudRate?: number;
    dataBits?: 5 | 6 | 7 | 8;
    stopBits?: 1 | 2;
    parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
    encoding?: string;
    // SSH 参数
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
}

/** 终端信息 */
export interface TerminalInfo {
    id: string;
    type: TerminalType;
    path?: string;
    baudRate?: number;
    host?: string;
    port?: number;
    username?: string;
    connected: boolean;
    connectedAt: Date;
    encoding: string;
}

/** 读取模式 */
export type ReadMode = 'new' | 'all' | 'lines' | 'screen';

/** 读取选项 */
export interface ReadOptions {
    mode?: ReadMode;
    lines?: number;
    bytes?: number;
    clear?: boolean;
}

/** 等待模式类型 */
export type PatternType = 'regex' | 'string';

/** 等待选项 */
export interface WaitOptions {
    pattern: string;
    patternType?: PatternType;
    timeout?: number;
}

/** 串口信息 */
export interface PortInfo {
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    vendorId?: string;
    productId?: string;
}

/** 快捷按钮 */
export interface CustomButton {
    id: string;
    label: string;
    commands: CommandItem[];
    icon?: string;
    color?: string;
    target: 'serial' | 'ssh' | 'both';
    keybinding?: string;
}

/** 命令项 */
export interface CommandItem {
    id: string;
    command: string;
    delay?: number;
    description?: string;
}