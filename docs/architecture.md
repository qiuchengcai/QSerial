# QSerial 终端工具架构设计文档

> 版本: 1.0.0
> 日期: 2026-04-11
> 作者: QSerial Team

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术选型](#2-技术选型)
3. [系统架构](#3-系统架构)
4. [模块详细设计](#4-模块详细设计)
5. [数据流设计](#5-数据流设计)
6. [插件系统设计](#6-插件系统设计)
7. [配置系统设计](#7-配置系统设计)
8. [串口共享功能设计](#8-串口共享功能设计)
9. [主题系统设计](#9-主题系统设计)
10. [安全性设计](#10-安全性设计)
11. [性能优化策略](#11-性能优化策略)
12. [测试策略](#12-测试策略)
13. [部署与发布](#13-部署与发布)
14. [开发路线图](#14-开发路线图)

---

## 1. 项目概述

### 1.1 项目定位

QSerial 是一款现代化的跨平台终端工具，主要面向：

- **嵌入式开发者**: 提供强大的串口调试功能
- **运维工程师**: 提供 SSH/Telnet 远程连接管理
- **开发者**: 提供本地终端和多标签管理

### 1.2 核心特性

| 特性 | 描述 |
|------|------|
| 多协议支持 | 本地 Shell、串口、SSH、Telnet |
| 多标签管理 | 支持拖拽排序、分组管理 |
| 分屏功能 | 水平/垂直分屏，支持嵌套 |
| 主题定制 | 丰富的主题系统，支持自定义 |
| 插件扩展 | 完善的插件 API，可扩展性强 |
| 会话管理 | 保存连接配置，快速重连 |
| 跨平台 | Windows、macOS、Linux |

### 1.3 参考产品分析

| 产品 | 优点 | 可借鉴点 |
|------|------|----------|
| **Windows Terminal** | 现代化 UI、GPU 加速渲染 | 标签管理、主题系统 |
| **Tabby** | 插件生态丰富、SSH 管理强大 | 插件架构、连接管理 |
| **CRT (SecureCRT)** | 功能全面、企业级稳定性 | 会话管理、脚本支持 |
| **MobaXterm** | 功能集成度高 | 工具箱设计 |
| **PuTTY** | 轻量、稳定 | 简洁架构 |

---

## 2. 技术选型

### 2.1 技术栈总览

```
┌─────────────────────────────────────────────────────────┐
│                    技术栈全景图                          │
├─────────────────────────────────────────────────────────┤
│  前端框架     React 18 + TypeScript                      │
│  状态管理     Zustand / Jotai (轻量级)                   │
│  UI 组件      Tailwind CSS + Headless UI                 │
│  终端渲染     xterm.js + Canvas 自定义渲染               │
│  桌面框架     Electron 28+ / Tauri 2.0 (可选)            │
│  后端运行时   Node.js 20 LTS                             │
│  PTY 管理     node-pty                                   │
│  串口通信     serialport                                 │
│  SSH 协议     ssh2                                       │
│  构建工具     Vite + electron-builder                    │
│  包管理       pnpm (Monorepo)                            │
│  测试框架     Vitest + Playwright                        │
│  代码质量     ESLint + Prettier + Husky                  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 框架选型对比

#### 2.2.1 桌面框架对比

| 特性 | Electron | Tauri |
|------|----------|-------|
| 包体积 | 较大 (~150MB) | 小 (~10MB) |
| 内存占用 | 较高 | 低 |
| 开发体验 | 成熟、生态丰富 | 较新、Rust 学习曲线 |
| 跨平台 | 优秀 | 优秀 |
| 原生集成 | Node.js 生态 | Rust 生态 |
| 热更新 | 支持 | 支持 |
| **推荐** | ✅ 功能复杂项目 | 轻量级项目 |

**结论**: 考虑到串口通信、SSH 等复杂功能，以及 Node.js 生态成熟度，**推荐使用 Electron**。

#### 2.2.2 终端渲染方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **xterm.js** | 成熟稳定、社区活跃、兼容性好 | 定制性有限 |
| **自研 Canvas** | 完全可控、性能极致 | 开发成本高 |
| **WebGL 渲染** | 性能最佳 | 复杂度高 |

**结论**: 初期使用 **xterm.js**，后期可逐步替换为自研渲染引擎以提升性能。

#### 2.2.3 状态管理对比

| 方案 | 特点 | 适用场景 |
|------|------|----------|
| Redux | 生态成熟、中间件丰富 | 大型复杂应用 |
| Zustand | 轻量、API 简洁 | 中小型应用 |
| Jotai | 原子化、细粒度更新 | 性能敏感场景 |
| MobX | 响应式、学习曲线低 | 传统 OOP 风格 |

**结论**: 推荐 **Zustand**，轻量且足够满足需求。

### 2.3 依赖清单

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0",
    "xterm-addon-search": "^0.13.0",
    "xterm-addon-web-links": "^0.9.0",
    "xterm-addon-serialize": "^0.11.0",
    "electron": "^28.0.0",
    "node-pty": "^1.0.0",
    "serialport": "^12.0.0",
    "ssh2": "^1.15.0",
    "zustand": "^4.5.0",
    "immer": "^10.0.0",
    "dayjs": "^1.11.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "electron-builder": "^24.0.0",
    "vitest": "^1.0.0",
    "@playwright/test": "^1.40.0",
    "eslint": "^8.56.0",
    "prettier": "^3.2.0",
    "tailwindcss": "^3.4.0"
  }
}
```

---

## 3. 系统架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           QSerial Terminal                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        Renderer Process (UI)                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │ │
│  │  │  Tab Manager │  │ Split Pane  │  │ Settings UI │                 │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │ │
│  │  │  Terminal   │  │  Sidebar    │  │  Status Bar │                 │ │
│  │  │  Component  │  │  (Sessions) │  │             │                 │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │ │
│  │  ┌──────────────────────────────────────────────────────────────┐  │ │
│  │  │                    State Management (Zustand)                │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    ↕ IPC                                 │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         Main Process                                │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │ │
│  │  │   PTY       │  │   Serial    │  │    SSH      │                 │ │
│  │  │   Manager   │  │   Manager   │  │   Manager   │                 │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │ │
│  │  │   Config    │  │   Plugin    │  │   Session   │                 │ │
│  │  │   Manager   │  │   System    │  │   Manager   │                 │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    ↕                                    │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         Native Layer                                │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │ │
│  │  │  node-pty   │  │ serialport  │  │    ssh2     │                 │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 进程模型

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron 进程模型                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│    ┌─────────────────┐                                       │
│    │   Main Process  │  ← 管理原生功能、窗口生命周期          │
│    │   (Node.js)     │                                       │
│    └────────┬────────┘                                       │
│             │                                                │
│             │ BrowserWindow                                  │
│             │                                                │
│    ┌────────┴────────┐                                       │
│    │                 │                                       │
│    ▼                 ▼                                       │
│ ┌──────────┐    ┌──────────┐                                 │
│ │Renderer  │    │Renderer  │  ← 多窗口支持                   │
│ │Window 1  │    │Window 2  │                                 │
│ └──────────┘    └──────────┘                                 │
│                                                              │
│    ┌─────────────────┐                                       │
│    │ Utility Process │  ← 后台任务 (可选)                    │
│    │ (数据处理)       │                                       │
│    └─────────────────┘                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 模块依赖关系

```
                    ┌─────────────┐
                    │     UI      │
                    │  Components │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   State     │
                    │  Management │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │   Config    │  │   Plugin    │  │    IPC      │
   │   Service   │  │   Service   │  │   Client    │
   └─────────────┘  └─────────────┘  └──────┬──────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │    Main     │
                                    │   Process   │
                                    └──────┬──────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    ▼                      ▼                      ▼
             ┌─────────────┐        ┌─────────────┐        ┌─────────────┐
             │   PTY       │        │   Serial    │        │    SSH      │
             │   Service   │        │   Service   │        │   Service   │
             └─────────────┘        └─────────────┘        └─────────────┘
```

---

## 4. 模块详细设计

### 4.1 连接管理模块

#### 4.1.1 连接抽象接口

```typescript
// packages/shared/src/types/connection.ts

/**
 * 连接类型枚举
 */
export enum ConnectionType {
  PTY = 'pty',           // 本地终端
  SERIAL = 'serial',     // 串口
  SSH = 'ssh',           // SSH 连接
  TELNET = 'telnet',     // Telnet 连接
}

/**
 * 连接状态枚举
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

/**
 * 基础连接选项
 */
export interface BaseConnectionOptions {
  id: string;
  name: string;
  type: ConnectionType;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  reconnectAttempts?: number;
}

/**
 * PTY 连接选项
 */
export interface PtyConnectionOptions extends BaseConnectionOptions {
  type: ConnectionType.PTY;
  shell: string;           // shell 路径
  cwd?: string;            // 工作目录
  env?: Record<string, string>;  // 环境变量
  cols?: number;
  rows?: number;
}

/**
 * 串口连接选项
 */
export interface SerialConnectionOptions extends BaseConnectionOptions {
  type: ConnectionType.SERIAL;
  path: string;            // 串口路径 (COM1, /dev/ttyUSB0)
  baudRate: number;        // 波特率
  dataBits: 5 | 6 | 7 | 8; // 数据位
  stopBits: 1 | 1.5 | 2;   // 停止位
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space';  // 校验位
  flowControl?: 'none' | 'hardware' | 'software';      // 流控制
  encoding?: string;       // 编码格式
}

/**
 * SSH 连接选项
 */
export interface SshConnectionOptions extends BaseConnectionOptions {
  type: ConnectionType.SSH;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  keepaliveInterval?: number;
}

/**
 * 连接选项联合类型
 */
export type ConnectionOptions =
  | PtyConnectionOptions
  | SerialConnectionOptions
  | SshConnectionOptions;

/**
 * 连接接口 - 所有连接类型必须实现
 */
export interface IConnection {
  // 基本信息
  readonly id: string;
  readonly type: ConnectionType;
  readonly state: ConnectionState;
  readonly options: ConnectionOptions;

  // 生命周期方法
  open(): Promise<void>;
  close(): Promise<void>;
  destroy(): void;

  // 数据传输
  write(data: Buffer | string): void;
  writeHex(hex: string): void;  // 串口专用

  // 终端控制
  resize(cols: number, rows: number): void;

  // 事件监听
  onData(callback: (data: Buffer) => void): () => void;
  onStateChange(callback: (state: ConnectionState) => void): () => void;
  onError(callback: (error: Error) => void): () => void;
  onClose(callback: (code?: number) => void): () => void;
}
```

#### 4.1.2 连接工厂

```typescript
// packages/main/src/connection/factory.ts

import { IConnection, ConnectionOptions, ConnectionType } from '@qserial/shared';
import { PtyConnection } from './pty';
import { SerialConnection } from './serial';
import { SshConnection } from './ssh';

export class ConnectionFactory {
  private static instances = new Map<string, IConnection>();

  /**
   * 创建连接实例
   */
  static async create(options: ConnectionOptions): Promise<IConnection> {
    if (this.instances.has(options.id)) {
      throw new Error(`Connection ${options.id} already exists`);
    }

    let connection: IConnection;

    switch (options.type) {
      case ConnectionType.PTY:
        connection = new PtyConnection(options);
        break;
      case ConnectionType.SERIAL:
        connection = new SerialConnection(options);
        break;
      case ConnectionType.SSH:
        connection = new SshConnection(options);
        break;
      default:
        throw new Error(`Unsupported connection type: ${options.type}`);
    }

    this.instances.set(options.id, connection);
    return connection;
  }

  /**
   * 获取已存在的连接
   */
  static get(id: string): IConnection | undefined {
    return this.instances.get(id);
  }

  /**
   * 销毁连接
   */
  static async destroy(id: string): Promise<void> {
    const connection = this.instances.get(id);
    if (connection) {
      await connection.close();
      connection.destroy();
      this.instances.delete(id);
    }
  }

  /**
   * 获取所有连接
   */
  static getAll(): IConnection[] {
    return Array.from(this.instances.values());
  }
}
```

#### 4.1.3 PTY 连接实现

```typescript
// packages/main/src/connection/pty.ts

import * as pty from 'node-pty';
import { IConnection, ConnectionState, PtyConnectionOptions } from '@qserial/shared';
import { EventEmitter } from 'events';

export class PtyConnection implements IConnection {
  private ptyProcess: pty.IPty | null = null;
  private eventEmitter = new EventEmitter();
  private _state: ConnectionState = ConnectionState.DISCONNECTED;

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

    this._state = ConnectionState.CONNECTING;
    this.emitStateChange();

    try {
      this.ptyProcess = pty.spawn(this.options.shell, [], {
        name: 'xterm-256color',
        cols: this.options.cols || 80,
        rows: this.options.rows || 24,
        cwd: this.options.cwd || process.env.HOME,
        env: { ...process.env, ...this.options.env },
      });

      this.ptyProcess.onData((data) => {
        this.eventEmitter.emit('data', Buffer.from(data));
      });

      this.ptyProcess.onExit(({ exitCode }) => {
        this._state = ConnectionState.DISCONNECTED;
        this.emitStateChange();
        this.eventEmitter.emit('close', exitCode);
      });

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
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
    this._state = ConnectionState.DISCONNECTED;
    this.emitStateChange();
  }

  destroy(): void {
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
}
```

#### 4.1.4 串口连接实现

```typescript
// packages/main/src/connection/serial.ts

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { IConnection, ConnectionState, SerialConnectionOptions } from '@qserial/shared';
import { EventEmitter } from 'events';

export class SerialConnection implements IConnection {
  private port: SerialPort | null = null;
  private eventEmitter = new EventEmitter();
  private _state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectCount = 0;

  readonly id: string;
  readonly type = ConnectionType.SERIAL;
  readonly options: SerialConnectionOptions;

  constructor(options: SerialConnectionOptions) {
    this.id = options.id;
    this.options = options;
  }

  get state(): ConnectionState {
    return this._state;
  }

  async open(): Promise<void> {
    if (this.port?.isOpen) {
      throw new Error('Connection already open');
    }

    this._state = ConnectionState.CONNECTING;
    this.emitStateChange();

    try {
      this.port = new SerialPort({
        path: this.options.path,
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        autoOpen: false,
      });

      await new Promise<void>((resolve, reject) => {
        this.port!.open((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // 数据监听
      this.port.on('data', (data: Buffer) => {
        this.eventEmitter.emit('data', data);
      });

      // 错误监听
      this.port.on('error', (error: Error) => {
        this._state = ConnectionState.ERROR;
        this.emitStateChange();
        this.eventEmitter.emit('error', error);
        this.handleReconnect();
      });

      // 关闭监听
      this.port.on('close', () => {
        this._state = ConnectionState.DISCONNECTED;
        this.emitStateChange();
        this.eventEmitter.emit('close');
      });

      this._state = ConnectionState.CONNECTED;
      this.reconnectCount = 0;
      this.emitStateChange();
    } catch (error) {
      this._state = ConnectionState.ERROR;
      this.emitStateChange();
      this.eventEmitter.emit('error', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.cancelReconnect();
    if (this.port?.isOpen) {
      await new Promise<void>((resolve) => {
        this.port!.close(() => resolve());
      });
    }
    this._state = ConnectionState.DISCONNECTED;
    this.emitStateChange();
  }

  destroy(): void {
    this.close();
    this.eventEmitter.removeAllListeners();
  }

  write(data: Buffer | string): void {
    if (this.port?.isOpen) {
      this.port.write(data);
    }
  }

  writeHex(hex: string): void {
    this.write(Buffer.from(hex, 'hex'));
  }

  resize(_cols: number, _rows: number): void {
    // 串口不支持 resize
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
    if (!this.options.autoReconnect) return;

    const maxAttempts = this.options.reconnectAttempts || 5;
    const interval = this.options.reconnectInterval || 3000;

    if (this.reconnectCount >= maxAttempts) {
      this.eventEmitter.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this._state = ConnectionState.RECONNECTING;
    this.emitStateChange();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectCount++;
      this.open().catch(() => {});
    }, interval);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectCount = 0;
  }

  /**
   * 获取可用串口列表
   */
  static async listPorts(): Promise<string[]> {
    const ports = await SerialPort.list();
    return ports.map(p => p.path);
  }
}
```

### 4.2 终端渲染模块

#### 4.2.1 终端组件结构

```typescript
// packages/renderer/src/components/Terminal/Terminal.tsx

import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SerializeAddon } from 'xterm-addon-serialize';
import { useTerminalStore } from '@/stores/terminal';
import { useThemeStore } from '@/stores/theme';
import { ipcClient } from '@/ipc/client';
import 'xterm/css/xterm.css';

interface TerminalProps {
  sessionId: string;
  connectionId: string;
}

export const Terminal: React.FC<TerminalProps> = ({ sessionId, connectionId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const { sessions, updateSessionSize } = useTerminalStore();
  const { currentTheme } = useThemeStore();

  // 初始化终端
  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      theme: currentTheme.xterm,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();
    const serializeAddon = new SerializeAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(searchAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.loadAddon(serializeAddon);

    xterm.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // 用户输入 -> 发送到后端
    xterm.onData((data) => {
      ipcClient.connectionWrite(connectionId, data);
    });

    // 终端大小变化
    xterm.onResize(({ cols, rows }) => {
      ipcClient.connectionResize(connectionId, cols, rows);
      updateSessionSize(sessionId, cols, rows);
    });

    // 监听后端数据
    const unsubscribe = ipcClient.onConnectionData(connectionId, (data) => {
      xterm.write(data);
    });

    // 窗口大小变化时自适应
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      unsubscribe();
      xterm.dispose();
    };
  }, [connectionId]);

  // 主题变化
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = currentTheme.xterm;
    }
  }, [currentTheme]);

  // 处理粘贴
  const handlePaste = useCallback(async () => {
    const text = await navigator.clipboard.readText();
    if (xtermRef.current) {
      xtermRef.current.paste(text);
    }
  }, []);

  // 处理复制
  const handleCopy = useCallback(() => {
    if (xtermRef.current) {
      const selection = xtermRef.current.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
      }
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="terminal-container h-full w-full"
      onContextMenu={(e) => {
        e.preventDefault();
        // 显示右键菜单
      }}
    />
  );
};
```

#### 4.2.2 终端状态管理

```typescript
// packages/renderer/src/stores/terminal.ts

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { ConnectionType, ConnectionState } from '@qserial/shared';

interface Session {
  id: string;
  name: string;
  connectionId: string;
  connectionType: ConnectionType;
  connectionState: ConnectionState;
  cols: number;
  rows: number;
  createdAt: Date;
  lastActiveAt: Date;
}

interface Tab {
  id: string;
  name: string;
  sessions: string[];  // session ids
  activeSessionId: string | null;
  splitDirection?: 'horizontal' | 'vertical';
}

interface TerminalState {
  tabs: Tab[];
  activeTabId: string | null;
  sessions: Record<string, Session>;

  // Tab 操作
  createTab: (name?: string) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => void;

  // Session 操作
  createSession: (connectionId: string, type: ConnectionType) => string;
  closeSession: (sessionId: string) => void;
  updateSessionState: (sessionId: string, state: ConnectionState) => void;
  updateSessionSize: (sessionId: string, cols: number, rows: number) => void;

  // Split 操作
  splitSession: (sessionId: string, direction: 'horizontal' | 'vertical') => string;
}

export const useTerminalStore = create<TerminalState>()(
  immer((set, get) => ({
    tabs: [],
    activeTabId: null,
    sessions: {},

    createTab: (name) => {
      const tabId = crypto.randomUUID();
      set((state) => {
        state.tabs.push({
          id: tabId,
          name: name || `Tab ${state.tabs.length + 1}`,
          sessions: [],
          activeSessionId: null,
        });
        state.activeTabId = tabId;
      });
      return tabId;
    },

    closeTab: (tabId) => {
      set((state) => {
        const tabIndex = state.tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return;

        // 关闭该 Tab 下的所有 Session
        const tab = state.tabs[tabIndex];
        tab.sessions.forEach(sessionId => {
          delete state.sessions[sessionId];
        });

        state.tabs.splice(tabIndex, 1);

        // 切换到相邻 Tab
        if (state.activeTabId === tabId) {
          const newActiveTab = state.tabs[Math.min(tabIndex, state.tabs.length - 1)];
          state.activeTabId = newActiveTab?.id || null;
        }
      });
    },

    setActiveTab: (tabId) => {
      set((state) => {
        state.activeTabId = tabId;
      });
    },

    renameTab: (tabId, name) => {
      set((state) => {
        const tab = state.tabs.find(t => t.id === tabId);
        if (tab) {
          tab.name = name;
        }
      });
    },

    createSession: (connectionId, type) => {
      const sessionId = crypto.randomUUID();
      set((state) => {
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        if (!activeTab) return sessionId;

        state.sessions[sessionId] = {
          id: sessionId,
          name: `${type}-${sessionId.slice(0, 4)}`,
          connectionId,
          connectionType: type,
          connectionState: ConnectionState.CONNECTING,
          cols: 80,
          rows: 24,
          createdAt: new Date(),
          lastActiveAt: new Date(),
        };

        activeTab.sessions.push(sessionId);
        activeTab.activeSessionId = sessionId;
      });
      return sessionId;
    },

    closeSession: (sessionId) => {
      set((state) => {
        delete state.sessions[sessionId];
        state.tabs.forEach(tab => {
          const index = tab.sessions.indexOf(sessionId);
          if (index !== -1) {
            tab.sessions.splice(index, 1);
            if (tab.activeSessionId === sessionId) {
              tab.activeSessionId = tab.sessions[0] || null;
            }
          }
        });
      });
    },

    updateSessionState: (sessionId, connectionState) => {
      set((state) => {
        const session = state.sessions[sessionId];
        if (session) {
          session.connectionState = connectionState;
          session.lastActiveAt = new Date();
        }
      });
    },

    updateSessionSize: (sessionId, cols, rows) => {
      set((state) => {
        const session = state.sessions[sessionId];
        if (session) {
          session.cols = cols;
          session.rows = rows;
        }
      });
    },

    splitSession: (sessionId, direction) => {
      const state = get();
      const session = state.sessions[sessionId];
      if (!session) return sessionId;

      // 创建新的 Session (复用相同连接配置)
      const newSessionId = state.createSession(
        session.connectionId,
        session.connectionType
      );

      set((s) => {
        const tab = s.tabs.find(t => t.sessions.includes(sessionId));
        if (tab) {
          tab.splitDirection = direction;
        }
      });

      return newSessionId;
    },
  }))
);
```

### 4.3 IPC 通信模块

#### 4.3.1 IPC 通道定义

```typescript
// packages/shared/src/types/ipc.ts

/**
 * IPC 通道名称定义
 */
export const IPC_CHANNELS = {
  // 连接管理
  CONNECTION_CREATE: 'connection:create',
  CONNECTION_OPEN: 'connection:open',
  CONNECTION_CLOSE: 'connection:close',
  CONNECTION_DESTROY: 'connection:destroy',
  CONNECTION_WRITE: 'connection:write',
  CONNECTION_RESIZE: 'connection:resize',
  CONNECTION_DATA: 'connection:data',
  CONNECTION_STATE: 'connection:state',
  CONNECTION_ERROR: 'connection:error',

  // 串口特有
  SERIAL_LIST: 'serial:list',

  // 配置管理
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_DELETE: 'config:delete',

  // 会话管理
  SESSION_SAVE: 'session:save',
  SESSION_LOAD: 'session:load',
  SESSION_LIST: 'session:list',
  SESSION_DELETE: 'session:delete',

  // 插件管理
  PLUGIN_LIST: 'plugin:list',
  PLUGIN_ENABLE: 'plugin:enable',
  PLUGIN_DISABLE: 'plugin:disable',
  PLUGIN_INSTALL: 'plugin:install',
  PLUGIN_UNINSTALL: 'plugin:uninstall',

  // 窗口管理
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_SET_TITLE: 'window:set-title',

  // 应用信息
  APP_VERSION: 'app:version',
  APP_QUIT: 'app:quit',
} as const;

/**
 * IPC 请求/响应类型映射
 */
export interface IpcRequestMap {
  [IPC_CHANNELS.CONNECTION_CREATE]: { options: ConnectionOptions };
  [IPC_CHANNELS.CONNECTION_OPEN]: { id: string };
  [IPC_CHANNELS.CONNECTION_CLOSE]: { id: string };
  [IPC_CHANNELS.CONNECTION_WRITE]: { id: string; data: string | Buffer };
  [IPC_CHANNELS.CONNECTION_RESIZE]: { id: string; cols: number; rows: number };
  [IPC_CHANNELS.SERIAL_LIST]: void;
  [IPC_CHANNELS.CONFIG_GET]: { key: string };
  [IPC_CHANNELS.CONFIG_SET]: { key: string; value: unknown };
}

export interface IpcResponseMap {
  [IPC_CHANNELS.CONNECTION_CREATE]: { id: string };
  [IPC_CHANNELS.CONNECTION_OPEN]: void;
  [IPC_CHANNELS.CONNECTION_CLOSE]: void;
  [IPC_CHANNELS.CONNECTION_WRITE]: void;
  [IPC_CHANNELS.CONNECTION_RESIZE]: void;
  [IPC_CHANNELS.SERIAL_LIST]: string[];
  [IPC_CHANNELS.CONFIG_GET]: unknown;
  [IPC_CHANNELS.CONFIG_SET]: void;
}
```

#### 4.3.2 渲染进程 IPC 客户端

```typescript
// packages/renderer/src/ipc/client.ts

import { ipcRenderer } from 'electron';
import { IPC_CHANNELS, IpcRequestMap, IpcResponseMap } from '@qserial/shared';

type IpcChannel = keyof IpcRequestMap;

class IpcClient {
  private dataCallbacks = new Map<string, Set<(data: Buffer) => void>>();
  private stateCallbacks = new Map<string, Set<(state: string) => void>>();
  private errorCallbacks = new Map<string, Set<(error: Error) => void>>();

  constructor() {
    // 监听连接数据
    ipcRenderer.on(IPC_CHANNELS.CONNECTION_DATA, (_, { id, data }) => {
      const callbacks = this.dataCallbacks.get(id);
      if (callbacks) {
        callbacks.forEach(cb => cb(Buffer.from(data)));
      }
    });

    // 监听连接状态变化
    ipcRenderer.on(IPC_CHANNELS.CONNECTION_STATE, (_, { id, state }) => {
      const callbacks = this.stateCallbacks.get(id);
      if (callbacks) {
        callbacks.forEach(cb => cb(state));
      }
    });

    // 监听连接错误
    ipcRenderer.on(IPC_CHANNELS.CONNECTION_ERROR, (_, { id, error }) => {
      const callbacks = this.errorCallbacks.get(id);
      if (callbacks) {
        callbacks.forEach(cb => cb(new Error(error)));
      }
    });
  }

  /**
   * 发送请求并等待响应
   */
  async invoke<K extends IpcChannel>(
    channel: K,
    ...args: IpcRequestMap[K] extends void ? [] : [IpcRequestMap[K]]
  ): Promise<IpcResponseMap[K]> {
    return ipcRenderer.invoke(channel, ...args);
  }

  /**
   * 创建连接
   */
  async createConnection(options: ConnectionOptions): Promise<string> {
    const { id } = await this.invoke(IPC_CHANNELS.CONNECTION_CREATE, { options });
    return id;
  }

  /**
   * 打开连接
   */
  async openConnection(id: string): Promise<void> {
    await this.invoke(IPC_CHANNELS.CONNECTION_OPEN, { id });
  }

  /**
   * 关闭连接
   */
  async closeConnection(id: string): Promise<void> {
    await this.invoke(IPC_CHANNELS.CONNECTION_CLOSE, { id });
  }

  /**
   * 写入数据
   */
  async connectionWrite(id: string, data: string | Buffer): Promise<void> {
    await this.invoke(IPC_CHANNELS.CONNECTION_WRITE, { id, data });
  }

  /**
   * 调整终端大小
   */
  async connectionResize(id: string, cols: number, rows: number): Promise<void> {
    await this.invoke(IPC_CHANNELS.CONNECTION_RESIZE, { id, cols, rows });
  }

  /**
   * 获取串口列表
   */
  async listSerialPorts(): Promise<string[]> {
    return this.invoke(IPC_CHANNELS.SERIAL_LIST);
  }

  /**
   * 监听连接数据
   */
  onConnectionData(id: string, callback: (data: Buffer) => void): () => void {
    if (!this.dataCallbacks.has(id)) {
      this.dataCallbacks.set(id, new Set());
    }
    this.dataCallbacks.get(id)!.add(callback);
    return () => {
      this.dataCallbacks.get(id)?.delete(callback);
    };
  }

  /**
   * 监听连接状态变化
   */
  onConnectionStateChange(id: string, callback: (state: string) => void): () => void {
    if (!this.stateCallbacks.has(id)) {
      this.stateCallbacks.set(id, new Set());
    }
    this.stateCallbacks.get(id)!.add(callback);
    return () => {
      this.stateCallbacks.get(id)?.delete(callback);
    };
  }

  /**
   * 监听连接错误
   */
  onConnectionError(id: string, callback: (error: Error) => void): () => void {
    if (!this.errorCallbacks.has(id)) {
      this.errorCallbacks.set(id, new Set());
    }
    this.errorCallbacks.get(id)!.add(callback);
    return () => {
      this.errorCallbacks.get(id)?.delete(callback);
    };
  }
}

export const ipcClient = new IpcClient();
```

#### 4.3.3 主进程 IPC 处理器

```typescript
// packages/main/src/ipc/handlers.ts

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@qserial/shared';
import { ConnectionFactory } from '../connection/factory';
import { SerialConnection } from '../connection/serial';
import { ConfigManager } from '../config/manager';
import { SessionManager } from '../session/manager';
import { PluginManager } from '../plugin/manager';

export function registerIpcHandlers(mainWindow: Electron.BrowserWindow) {
  // 连接管理
  ipcMain.handle(IPC_CHANNELS.CONNECTION_CREATE, async (_, { options }) => {
    const connection = await ConnectionFactory.create(options);
    return { id: connection.id };
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_OPEN, async (_, { id }) => {
    const connection = ConnectionFactory.get(id);
    if (!connection) throw new Error(`Connection ${id} not found`);
    await connection.open();
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_CLOSE, async (_, { id }) => {
    const connection = ConnectionFactory.get(id);
    if (!connection) throw new Error(`Connection ${id} not found`);
    await connection.close();
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_DESTROY, async (_, { id }) => {
    await ConnectionFactory.destroy(id);
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_WRITE, async (_, { id, data }) => {
    const connection = ConnectionFactory.get(id);
    if (!connection) throw new Error(`Connection ${id} not found`);
    connection.write(data);
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_RESIZE, async (_, { id, cols, rows }) => {
    const connection = ConnectionFactory.get(id);
    if (!connection) throw new Error(`Connection ${id} not found`);
    connection.resize(cols, rows);
  });

  // 串口列表
  ipcMain.handle(IPC_CHANNELS.SERIAL_LIST, async () => {
    return SerialConnection.listPorts();
  });

  // 配置管理
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async (_, { key }) => {
    return ConfigManager.get(key);
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_, { key, value }) => {
    ConfigManager.set(key, value);
  });

  // 会话管理
  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, async () => {
    return SessionManager.list();
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_SAVE, async (_, { session }) => {
    return SessionManager.save(session);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_LOAD, async (_, { id }) => {
    return SessionManager.load(id);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_DELETE, async (_, { id }) => {
    SessionManager.delete(id);
  });

  // 插件管理
  ipcMain.handle(IPC_CHANNELS.PLUGIN_LIST, async () => {
    return PluginManager.list();
  });

  ipcMain.handle(IPC_CHANNELS.PLUGIN_ENABLE, async (_, { id }) => {
    await PluginManager.enable(id);
  });

  ipcMain.handle(IPC_CHANNELS.PLUGIN_DISABLE, async (_, { id }) => {
    await PluginManager.disable(id);
  });

  // 窗口管理
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    mainWindow.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    mainWindow.close();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_TITLE, (_, title) => {
    mainWindow.setTitle(title);
  });

  // 应用信息
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => {
    return app.getVersion();
  });

  // 设置连接事件转发
  setupConnectionEventForwarding(mainWindow);
}

function setupConnectionEventForwarding(mainWindow: Electron.BrowserWindow) {
  // 当有新连接创建时，设置事件转发
  ConnectionFactory.onCreate((connection) => {
    connection.onData((data) => {
      mainWindow.webContents.send(IPC_CHANNELS.CONNECTION_DATA, {
        id: connection.id,
        data: data.toString('base64'),
      });
    });

    connection.onStateChange((state) => {
      mainWindow.webContents.send(IPC_CHANNELS.CONNECTION_STATE, {
        id: connection.id,
        state,
      });
    });

    connection.onError((error) => {
      mainWindow.webContents.send(IPC_CHANNELS.CONNECTION_ERROR, {
        id: connection.id,
        error: error.message,
      });
    });
  });
}
```

---

## 5. 数据流设计

### 5.1 用户输入数据流

```
┌─────────────────────────────────────────────────────────────┐
│                      用户输入数据流                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  用户键盘输入                                                 │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────┐                                             │
│  │   xterm.js  │  ← 键盘事件监听                             │
│  │  onData()   │                                             │
│  └──────┬──────┘                                             │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐                                             │
│  │  IPC Client │  → connection:write { id, data }           │
│  └──────┬──────┘                                             │
│         │ IPC                                                │
│         ▼                                                    │
│  ┌─────────────┐                                             │
│  │  IPC Main   │  ← 主进程处理器                             │
│  │  Handler    │                                             │
│  └──────┬──────┘                                             │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐                                             │
│  │ Connection  │  → write(data)                              │
│  │ (PTY/Serial)│                                             │
│  └──────┬──────┘                                             │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐                                             │
│  │  PTY/Port   │  → 发送到目标进程/设备                      │
│  └─────────────┘                                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 终端输出数据流

```
┌─────────────────────────────────────────────────────────────┐
│                      终端输出数据流                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  PTY/串口输出数据                                             │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────┐                                             │
│  │ Connection  │  ← onData 回调                              │
│  │  Instance   │                                             │
│  └──────┬──────┘                                             │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐                                             │
│  │ Event       │  → emit('data', buffer)                    │
│  │ Emitter     │                                             │
│  └──────┬──────┘                                             │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐                                             │
│  │ Main Window │  → webContents.send()                      │
│  │ (Forwarder) │                                             │
│  └──────┬──────┘                                             │
│         │ IPC                                                │
│         ▼                                                    │
│  ┌─────────────┐                                             │
│  │ Renderer    │  ← ipcRenderer.on()                        │
│  │ IPC Client  │                                             │
│  └──────┬──────┘                                             │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐                                             │
│  │   xterm.js  │  → write(data) 渲染到屏幕                  │
│  │ Terminal    │                                             │
│  └─────────────┘                                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 状态同步流程

```
┌─────────────────────────────────────────────────────────────┐
│                      状态同步流程                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    Zustand Store                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │   Tabs      │  │  Sessions   │  │   Config    │  │  │
│  │  │   State     │  │   State     │  │   State     │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │                                   │
│                         │ subscribe()                       │
│                         ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 Persistence Layer                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │   Local     │  │   Sync      │  │   Export    │  │  │
│  │  │   Storage   │  │   to Main   │  │   /Import   │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  状态变更触发:                                               │
│  1. UI 操作 → Store Action → State 更新 → UI 重渲染        │
│  2. IPC 事件 → Store Action → State 更新 → UI 重渲染       │
│  3. 热重载 → Store Rehydrate → State 恢复                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 插件系统设计

### 6.1 插件架构

```
┌─────────────────────────────────────────────────────────────┐
│                      插件系统架构                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Plugin Host                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │   Plugin    │  │   Plugin    │  │   Plugin    │  │  │
│  │  │   Loader    │  │   Registry  │  │   Sandbox   │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                   │
│                         │ API Layer                         │
│                         ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Plugin API                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │   Terminal  │  │   Config    │  │    IPC      │  │  │
│  │  │   API       │  │   API       │  │    API      │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │   UI        │  │   Command   │  │   Theme     │  │  │
│  │  │   API       │  │   API       │  │   API       │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                   │
│                         ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Plugin Instance                     │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │  {                                                │ │  │
│  │  │    name: "my-plugin",                            │ │  │
│  │  │    version: "1.0.0",                             │ │  │
│  │  │    main: "./dist/index.js",                      │ │  │
│  │  │    activate(context) { ... },                    │ │  │
│  │  │    deactivate() { ... }                          │ │  │
│  │  │  }                                                │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 插件接口定义

```typescript
// packages/shared/src/types/plugin.ts

/**
 * 插件元数据
 */
export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  main: string;
  icon?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  engines?: {
    qserial: string;
  };
  contributes?: {
    commands?: CommandContribution[];
    themes?: ThemeContribution[];
    settings?: SettingContribution[];
    menus?: MenuContribution[];
    keybindings?: KeybindingContribution[];
  };
  activationEvents?: string[];
}

/**
 * 命令贡献
 */
export interface CommandContribution {
  id: string;
  title: string;
  category?: string;
  icon?: string;
  when?: string;  // 条件表达式
}

/**
 * 主题贡献
 */
export interface ThemeContribution {
  id: string;
  label: string;
  path: string;
  uiTheme?: 'vs' | 'vs-dark' | 'hc-black';
}

/**
 * 设置贡献
 */
export interface SettingContribution {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  default: unknown;
  description: string;
  enum?: string[];
}

/**
 * 菜单贡献
 */
export interface MenuContribution {
  id: string;
  location: 'tabbar' | 'sidebar' | 'terminal' | 'statusbar';
  order?: number;
  group?: string;
}

/**
 * 快捷键贡献
 */
export interface KeybindingContribution {
  command: string;
  key: string;
  mac?: string;
  when?: string;
}

/**
 * 插件上下文 - 提供给插件的 API
 */
export interface PluginContext {
  // 订阅管理
  subscriptions: Disposable[];

  // 命令 API
  commands: {
    registerCommand(command: string, callback: (...args: any[]) => any): Disposable;
    executeCommand<T>(command: string, ...args: any[]): Promise<T>;
  };

  // 终端 API
  terminal: {
    getActiveTerminal(): TerminalInfo | undefined;
    getAllTerminals(): TerminalInfo[];
    createTerminal(options: TerminalCreateOptions): Promise<TerminalInfo>;
    sendText(terminalId: string, text: string): void;
    show(terminalId: string): void;
    hide(terminalId: string): void;
    onDidOpenTerminal: Event<TerminalInfo>;
    onDidCloseTerminal: Event<TerminalInfo>;
    onDidChangeActiveTerminal: Event<TerminalInfo | undefined>;
  };

  // 配置 API
  config: {
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): Promise<void>;
    onDidChangeConfiguration: Event<ConfigurationChangeEvent>;
  };

  // UI API
  ui: {
    showMessage(message: string, type: 'info' | 'warning' | 'error'): Promise<void>;
    showConfirm(message: string): Promise<boolean>;
    showInput(prompt: string, defaultValue?: string): Promise<string | undefined>;
    showQuickPick(items: string[]): Promise<string | undefined>;
  };

  // 日志 API
  logger: {
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
  };

  // 工作区 API
  workspace: {
    getWorkspaceFolder(): string | undefined;
    onDidChangeWorkspaceFolders: Event<void>;
  };
}

/**
 * 插件接口
 */
export interface IPlugin {
  /**
   * 插件激活时调用
   */
  activate(context: PluginContext): void | Promise<void>;

  /**
   * 插件停用时调用
   */
  deactivate?(): void | Promise<void>;
}

/**
 * 事件接口
 */
export interface Event<T> {
  (listener: (e: T) => any): Disposable;
}

/**
 * 可释放资源接口
 */
export interface Disposable {
  dispose(): void;
}
```

### 6.3 插件管理器实现

```typescript
// packages/main/src/plugin/manager.ts

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import {
  PluginManifest,
  PluginContext,
  IPlugin,
  Disposable,
} from '@qserial/shared';

interface PluginInstance {
  manifest: PluginManifest;
  plugin: IPlugin;
  context: PluginContext;
  isActive: boolean;
}

export class PluginManager {
  private plugins = new Map<string, PluginInstance>();
  private pluginDir: string;

  constructor() {
    this.pluginDir = path.join(app.getPath('userData'), 'plugins');
    this.ensurePluginDir();
  }

  private ensurePluginDir(): void {
    if (!fs.existsSync(this.pluginDir)) {
      fs.mkdirSync(this.pluginDir, { recursive: true });
    }
  }

  /**
   * 扫描并加载所有插件
   */
  async loadAll(): Promise<void> {
    const entries = fs.readdirSync(this.pluginDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = path.join(this.pluginDir, entry.name);
        await this.load(pluginPath);
      }
    }
  }

  /**
   * 加载单个插件
   */
  async load(pluginPath: string): Promise<void> {
    const manifestPath = path.join(pluginPath, 'package.json');

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Plugin manifest not found: ${manifestPath}`);
    }

    const manifest: PluginManifest = JSON.parse(
      fs.readFileSync(manifestPath, 'utf-8')
    );

    // 验证插件
    this.validateManifest(manifest);

    // 加载插件主模块
    const mainPath = path.join(pluginPath, manifest.main);
    const pluginModule = require(mainPath);
    const plugin: IPlugin = pluginModule.default || pluginModule;

    // 创建插件上下文
    const context = this.createContext(manifest);

    // 存储插件实例
    this.plugins.set(manifest.name, {
      manifest,
      plugin,
      context,
      isActive: false,
    });
  }

  /**
   * 激活插件
   */
  async activate(pluginName: string): Promise<void> {
    const instance = this.plugins.get(pluginName);
    if (!instance) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    if (instance.isActive) {
      return;
    }

    try {
      await instance.plugin.activate(instance.context);
      instance.isActive = true;
    } catch (error) {
      console.error(`Failed to activate plugin ${pluginName}:`, error);
      throw error;
    }
  }

  /**
   * 停用插件
   */
  async deactivate(pluginName: string): Promise<void> {
    const instance = this.plugins.get(pluginName);
    if (!instance || !instance.isActive) {
      return;
    }

    try {
      if (instance.plugin.deactivate) {
        await instance.plugin.deactivate();
      }

      // 清理订阅
      instance.context.subscriptions.forEach(d => d.dispose());
      instance.context.subscriptions = [];
      instance.isActive = false;
    } catch (error) {
      console.error(`Failed to deactivate plugin ${pluginName}:`, error);
      throw error;
    }
  }

  /**
   * 卸载插件
   */
  async uninstall(pluginName: string): Promise<void> {
    await this.deactivate(pluginName);
    this.plugins.delete(pluginName);
  }

  /**
   * 获取插件列表
   */
  list(): Array<{ name: string; version: string; isActive: boolean }> {
    return Array.from(this.plugins.values()).map(instance => ({
      name: instance.manifest.name,
      version: instance.manifest.version,
      isActive: instance.isActive,
    }));
  }

  /**
   * 验证插件清单
   */
  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.name) {
      throw new Error('Plugin manifest missing "name" field');
    }
    if (!manifest.version) {
      throw new Error('Plugin manifest missing "version" field');
    }
    if (!manifest.main) {
      throw new Error('Plugin manifest missing "main" field');
    }
  }

  /**
   * 创建插件上下文
   */
  private createContext(manifest: PluginManifest): PluginContext {
    return {
      subscriptions: [],

      commands: {
        registerCommand: (command, callback) => {
          const fullCommand = `${manifest.name}.${command}`;
          // 注册命令到命令系统
          return { dispose: () => {} };
        },
        executeCommand: async (command, ...args) => {
          // 执行命令
          return undefined;
        },
      },

      terminal: {
        getActiveTerminal: () => undefined,
        getAllTerminals: () => [],
        createTerminal: async () => ({ id: '', name: '' }),
        sendText: () => {},
        show: () => {},
        hide: () => {},
        onDidOpenTerminal: () => ({ dispose: () => {} }),
        onDidCloseTerminal: () => ({ dispose: () => {} }),
        onDidChangeActiveTerminal: () => ({ dispose: () => {} }),
      },

      config: {
        get: (key, defaultValue) => defaultValue,
        update: async () => {},
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
      },

      ui: {
        showMessage: async () => {},
        showConfirm: async () => false,
        showInput: async () => undefined,
        showQuickPick: async () => undefined,
      },

      logger: {
        info: (message, ...args) => console.log(`[${manifest.name}] ${message}`, ...args),
        warn: (message, ...args) => console.warn(`[${manifest.name}] ${message}`, ...args),
        error: (message, ...args) => console.error(`[${manifest.name}] ${message}`, ...args),
      },

      workspace: {
        getWorkspaceFolder: () => undefined,
        onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
      },
    };
  }
}
```

### 6.4 插件示例

```typescript
// plugins/serial-monitor/src/index.ts

import { IPlugin, PluginContext, TerminalInfo } from '@qserial/shared';

/**
 * 串口监视器插件
 * 提供串口数据的 HEX/ASCII 显示、发送历史等功能
 */
export default class SerialMonitorPlugin implements IPlugin {
  private context!: PluginContext;
  private history: string[] = [];
  private hexMode = false;

  activate(context: PluginContext): void {
    this.context = context;

    // 注册命令
    context.subscriptions.push(
      context.commands.registerCommand('toggleHexMode', () => {
        this.hexMode = !this.hexMode;
        context.ui.showMessage(
          `HEX mode: ${this.hexMode ? 'ON' : 'OFF'}`,
          'info'
        );
      }),

      context.commands.registerCommand('showSendHistory', () => {
        context.ui.showQuickPick(this.history).then(selected => {
          if (selected) {
            const terminal = context.terminal.getActiveTerminal();
            if (terminal) {
              context.terminal.sendText(terminal.id, selected);
            }
          }
        });
      }),

      context.commands.registerCommand('clearHistory', () => {
        this.history = [];
        context.ui.showMessage('History cleared', 'info');
      })
    );

    // 监听终端数据
    context.terminal.onDidOpenTerminal((terminal) => {
      context.logger.info('Terminal opened:', terminal.name);
    });

    context.logger.info('Serial Monitor plugin activated');
  }

  deactivate(): void {
    this.context.logger.info('Serial Monitor plugin deactivated');
  }
}
```

---

## 7. 配置系统设计

### 7.1 配置结构

```typescript
// packages/shared/src/types/config.ts

/**
 * 应用配置结构
 */
export interface AppConfig {
  // 应用设置
  app: {
    language: 'zh-CN' | 'en-US';
    theme: string;
    autoUpdate: boolean;
    checkUpdateOnStartup: boolean;
    minimizeToTray: boolean;
    closeToTray: boolean;
  };

  // 终端设置
  terminal: {
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
  };

  // 串口设置
  serial: {
    defaultBaudRate: number;
    defaultDataBits: 5 | 6 | 7 | 8;
    defaultStopBits: 1 | 1.5 | 2;
    defaultParity: 'none' | 'even' | 'odd';
    autoReconnect: boolean;
    reconnectInterval: number;
    reconnectAttempts: number;
    showTimestamp: boolean;
    hexDisplay: boolean;
  };

  // SSH 设置
  ssh: {
    keepaliveInterval: number;
    keepaliveCountMax: number;
    readyTimeout: number;
    defaultPort: number;
  };

  // 串口共享设置
  serialShare: {
    defaultLocalPort: number;
    recentSshTunnel?: {
      host: string;
      port: number;
      username: string;
      remotePort: number;
      savePassword: boolean;
    };
  };

  // 窗口设置
  window: {
    width: number;
    height: number;
    x?: number;
    y?: number;
    maximized: boolean;
  };
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

  serialShare: {
    defaultLocalPort: 8888,
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
```

### 7.2 配置管理器

```typescript
// packages/main/src/config/manager.ts

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { AppConfig, DEFAULT_CONFIG } from '@qserial/shared';
import { EventEmitter } from 'events';

type ConfigChangeCallback = (key: string, value: unknown) => void;

class ConfigManagerImpl {
  private config: AppConfig;
  private configPath: string;
  private eventEmitter = new EventEmitter();

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'config.json');
    this.config = this.load();
  }

  /**
   * 加载配置
   */
  private load(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const userConfig = JSON.parse(data);
        return this.mergeConfig(DEFAULT_CONFIG, userConfig);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * 深度合并配置
   */
  private mergeConfig(defaults: any, user: any): AppConfig {
    const result = { ...defaults };
    for (const key in user) {
      if (user.hasOwnProperty(key)) {
        if (
          typeof user[key] === 'object' &&
          !Array.isArray(user[key]) &&
          user[key] !== null
        ) {
          result[key] = this.mergeConfig(defaults[key] || {}, user[key]);
        } else {
          result[key] = user[key];
        }
      }
    }
    return result as AppConfig;
  }

  /**
   * 保存配置
   */
  private save(): void {
    try {
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  /**
   * 获取配置值
   */
  get<K extends keyof AppConfig>(key: K): AppConfig[K];
  get<T = unknown>(key: string): T | undefined;
  get(key: string): unknown {
    const keys = key.split('.');
    let value: any = this.config;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * 设置配置值
   */
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void;
  set(key: string, value: unknown): void;
  set(key: string, value: unknown): void {
    const keys = key.split('.');
    let obj: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in obj)) {
        obj[k] = {};
      }
      obj = obj[k];
    }

    obj[keys[keys.length - 1]] = value;
    this.save();
    this.eventEmitter.emit('change', key, value);
  }

  /**
   * 删除配置值
   */
  delete(key: string): void {
    const keys = key.split('.');
    let obj: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]];
      if (!obj) return;
    }

    delete obj[keys[keys.length - 1]];
    this.save();
  }

  /**
   * 获取完整配置
   */
  getAll(): AppConfig {
    return { ...this.config };
  }

  /**
   * 重置配置
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.save();
  }

  /**
   * 监听配置变化
   */
  onChange(callback: ConfigChangeCallback): () => void {
    this.eventEmitter.on('change', callback);
    return () => this.eventEmitter.off('change', callback);
  }
}

export const ConfigManager = new ConfigManagerImpl();
```

---

## 8. 串口共享功能设计

### 8.1 功能概述

串口共享功能允许用户将本地串口通过网络共享给远程设备使用，支持以下场景：

- **局域网共享**: 通过 TCP Socket 将串口暴露给局域网内的其他设备
- **SSH 反向隧道**: 通过 SSH 隧道将串口共享到远程服务器

### 8.2 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    串口共享架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   远程设备                            │   │
│  │  ┌─────────────┐                                     │   │
│  │  │   nc /     │  ← 执行: nc localhost {remotePort}  │   │
│  │  │   socat    │                                     │   │
│  │  └─────────────┘                                     │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │ SSH 隧道 / TCP                    │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  远程服务器 (可选)                    │   │
│  │  ┌─────────────┐  ┌─────────────┐                   │   │
│  │  │ SSH Server  │  │ TCP Port    │                   │   │
│  │  │ (sshd)      │  │ {remotePort}│                   │   │
│  │  └─────────────┘  └─────────────┘                   │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │ SSH 反向隧道                      │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   本地应用 (QSerial)                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │  TCP Server │  │ SSH Client  │  │   Serial    │  │   │
│  │  │  :{localPort}│  │ (ssh2)      │  │   Port      │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │   │
│  │         │                │                │         │   │
│  │         └────────────────┴────────────────┘         │   │
│  │                          │                          │   │
│  │                   数据流转发                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 8.3 核心组件

#### 8.3.1 串口共享服务器

```typescript
// packages/main/src/connection/serialServer.ts

import { Server as NetServer, Socket } from 'net';
import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { Client as SSHClient } from 'ssh2';

export interface SerialServerOptions {
  id: string;
  serialPath: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
  localPort: number;
  sshTunnel?: {
    host: string;
    port: number;
    username: string;
    remotePort: number;
    privateKey?: string;
    password?: string;
  };
}

export class SerialServer extends EventEmitter {
  private server: NetServer | null = null;
  private sshClient: SSHClient | null = null;
  private serialPort: SerialPort | null = null;
  private clients = new Set<Socket>();
  private options: SerialServerOptions;
  private running = false;

  constructor(options: SerialServerOptions) {
    super();
    this.options = options;
  }

  async start(): Promise<void> {
    // 1. 打开串口
    await this.openSerialPort();

    // 2. 启动 TCP 服务器
    await this.startTcpServer();

    // 3. 建立 SSH 隧道（可选）
    if (this.options.sshTunnel) {
      await this.setupSshTunnel();
    }

    this.running = true;
    this.emit('started');
  }

  async stop(): Promise<void> {
    // 关闭所有客户端连接
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();

    // 关闭 TCP 服务器
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    // 关闭 SSH 隧道
    if (this.sshClient) {
      this.sshClient.end();
      this.sshClient = null;
    }

    // 关闭串口
    if (this.serialPort) {
      await new Promise<void>((resolve) => {
        this.serialPort!.close(() => resolve());
      });
      this.serialPort = null;
    }

    this.running = false;
    this.emit('stopped');
  }

  private async openSerialPort(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serialPort = new SerialPort({
        path: this.options.serialPath,
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        autoOpen: false,
      });

      this.serialPort.open((err) => {
        if (err) reject(err);
        else resolve();
      });

      // 串口数据广播给所有客户端
      this.serialPort.on('data', (data: Buffer) => {
        for (const client of this.clients) {
          client.write(data);
        }
      });
    });
  }

  private async startTcpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = new NetServer((socket) => {
        this.clients.add(socket);
        this.emit('client-connected', socket.remoteAddress);

        // 客户端数据发送到串口
        socket.on('data', (data) => {
          this.serialPort?.write(data);
        });

        socket.on('close', () => {
          this.clients.delete(socket);
          this.emit('client-disconnected', socket.remoteAddress);
        });
      });

      this.server.listen(this.options.localPort, () => {
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  private async setupSshTunnel(): Promise<void> {
    const tunnel = this.options.sshTunnel!;

    return new Promise((resolve, reject) => {
      this.sshClient = new SSHClient();

      this.sshClient.on('ready', () => {
        // 创建反向隧道：远程端口 -> 本地端口
        this.sshClient!.forwardIn(
          '127.0.0.1',
          tunnel.remotePort,
          (err) => {
            if (err) reject(err);
            else {
              this.emit('ssh-tunnel-connected');
              resolve();
            }
          }
        );
      });

      this.sshClient.on('error', reject);

      // 连接 SSH 服务器
      this.sshClient.connect({
        host: tunnel.host,
        port: tunnel.port,
        username: tunnel.username,
        password: tunnel.password,
        privateKey: tunnel.privateKey,
      });
    });
  }

  getStatus(): { running: boolean; clientCount: number; sshTunnelConnected: boolean } {
    return {
      running: this.running,
      clientCount: this.clients.size,
      sshTunnelConnected: this.sshClient !== null,
    };
  }
}
```

#### 8.3.2 配置持久化

```typescript
// packages/shared/src/types/config.ts

export interface SerialShareSettings {
  // 默认本地监听端口
  defaultLocalPort: number;

  // 最近使用的 SSH 隧道配置
  recentSshTunnel?: {
    host: string;
    port: number;
    username: string;
    remotePort: number;
    savePassword: boolean;  // 不实际保存密码，仅记录用户偏好
  };
}

// 默认配置
export const DEFAULT_CONFIG: AppConfig = {
  // ...
  serialShare: {
    defaultLocalPort: 8888,
  },
  // ...
};
```

### 8.4 UI 设计

#### 8.4.1 串口共享对话框

```
┌─────────────────────────────────────────┐
│ 串口共享                            [X] │
├─────────────────────────────────────────┤
│                                          │
│ 本地串口                                 │
│ ┌────────────────────────────────────┐  │
│ │ COM3 - USB Serial Port           ▼│  │
│ └────────────────────────────────────┘  │
│ ● 检测到现有连接: COM3                  │
│   共享服务会自动复用该串口的现有连接     │
│                                          │
│ 波特率                                   │
│ ┌────────────────────────────────────┐  │
│ │ 115200                          ▼ │  │
│ └────────────────────────────────────┘  │
│                                          │
│ 本地监听端口                             │
│ ┌────────────────────────────────────┐  │
│ │ 8888                               │  │
│ └────────────────────────────────────┘  │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │ [✓] 启用 SSH 反向隧道              │  │
│ └────────────────────────────────────┘  │
│                                          │
│   远程服务器          SSH端口            │
│   ┌───────────────┐  ┌────────────┐    │
│   │ 192.168.1.100 │  │ 22         │    │
│   └───────────────┘  └────────────┘    │
│                                          │
│   用户名            远程端口             │
│   ┌───────────────┐  ┌────────────┐    │
│   │ root          │  │ 8888       │    │
│   └───────────────┘  └────────────┘    │
│                                          │
│   密码 (可选，留空使用本地密钥)          │
│   ┌────────────────────────────────────┐│
│   │ ••••••••                          ││
│   └────────────────────────────────────┘│
│                                          │
│ ● 运行中 - COM3 -> :8888 (SSH隧道已连接) │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │           停止共享                  │  │
│ └────────────────────────────────────┘  │
│                                          │
│ 使用方式：                               │
│ 1. 远程Linux服务器执行: nc localhost    │
│    {远程端口} 即可操作串口               │
│ 2. 如启用SSH隧道，远程服务器需安装ssh    │
│    并监听                                │
│ 3. 也可使用 socat - localhost:{端口}    │
│    交互操作                               │
│                                          │
│                           [ 关闭 ]       │
└─────────────────────────────────────────┘
```

### 8.5 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                      串口共享数据流                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  上行数据 (远程 → 串口):                                      │
│                                                              │
│  远程设备                                                    │
│      │ nc localhost:8888                                    │
│      ▼                                                       │
│  SSH 隧道 (可选)                                             │
│      │ 加密传输                                              │
│      ▼                                                       │
│  本地 TCP Server (QSerial)                                   │
│      │ Socket 接收                                          │
│      ▼                                                       │
│  SerialPort.write()                                          │
│      │                                                       │
│      ▼                                                       │
│  串口设备                                                    │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  下行数据 (串口 → 远程):                                      │
│                                                              │
│  串口设备                                                    │
│      │ 输出数据                                              │
│      ▼                                                       │
│  SerialPort.on('data')                                       │
│      │ 广播给所有客户端                                      │
│      ▼                                                       │
│  TCP Server → Socket.write()                                 │
│      │                                                       │
│      ▼                                                       │
│  SSH 隧道 (可选)                                             │
│      │ 加密传输                                              │
│      ▼                                                       │
│  远程设备                                                    │
│      │ 接收并显示                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 8.6 安全考虑

1. **密码存储**: SSH 密码仅保存在内存中，不写入配置文件
2. **访问控制**: 仅监听本地端口，外部访问需通过 SSH 隧道
3. **连接隔离**: 每个串口共享服务使用独立的服务器实例
4. **资源清理**: 服务停止时自动关闭所有连接和资源

### 8.7 配置向后兼容

```typescript
// 读取配置时使用可选链，兼容旧版本配置文件
const localPort = config.serialShare?.defaultLocalPort || 8888;
const sshHost = config.serialShare?.recentSshTunnel?.host || '';
```

---

## 9. 主题系统设计

### 8.1 主题结构

```typescript
// packages/shared/src/types/theme.ts

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
 * UI 主题配置
 */
export interface UITheme {
  // 颜色
  colors: {
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
  };

  // 字体
  fonts: {
    sans: string;
    mono: string;
    sizes: {
      xs: string;
      sm: string;
      base: string;
      lg: string;
      xl: string;
    };
  };

  // 圆角
  radius: {
    none: string;
    sm: string;
    md: string;
    lg: string;
    full: string;
  };

  // 阴影
  shadows: {
    sm: string;
    md: string;
    lg: string;
  };

  // 动画
  transitions: {
    fast: string;
    normal: string;
    slow: string;
  };
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
```

### 8.2 预设主题示例

```typescript
// packages/renderer/src/themes/presets.ts

import { Theme } from '@qserial/shared';

export const themes: Theme[] = [
  {
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
        textSecondary: '#808080',
        border: '#3C3C3C',
        hover: '#2A2D2E',
        active: '#37373D',
        error: '#F44747',
        warning: '#D19A66',
        success: '#89D185',
      },
      fonts: {
        sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        mono: 'JetBrains Mono, Consolas, monospace',
        sizes: {
          xs: '0.75rem',
          sm: '0.875rem',
          base: '1rem',
          lg: '1.125rem',
          xl: '1.25rem',
        },
      },
      radius: {
        none: '0',
        sm: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        full: '9999px',
      },
      shadows: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
        md: '0 4px 6px rgba(0, 0, 0, 0.3)',
        lg: '0 10px 15px rgba(0, 0, 0, 0.3)',
      },
      transitions: {
        fast: '150ms ease',
        normal: '250ms ease',
        slow: '350ms ease',
      },
    },
  },

  {
    id: 'dracula',
    name: 'Dracula',
    type: 'dark',
    xterm: {
      foreground: '#F8F8F2',
      background: '#282A36',
      cursor: '#F8F8F0',
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
        accent: '#8BE9FD',
        background: '#282A36',
        surface: '#44475A',
        text: '#F8F8F2',
        textSecondary: '#6272A4',
        border: '#44475A',
        hover: '#3B3B4F',
        active: '#44475A',
        error: '#FF5555',
        warning: '#F1FA8C',
        success: '#50FA7B',
      },
      fonts: {
        sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        mono: 'JetBrains Mono, Fira Code, monospace',
        sizes: {
          xs: '0.75rem',
          sm: '0.875rem',
          base: '1rem',
          lg: '1.125rem',
          xl: '1.25rem',
        },
      },
      radius: {
        none: '0',
        sm: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        full: '9999px',
      },
      shadows: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
        md: '0 4px 6px rgba(0, 0, 0, 0.4)',
        lg: '0 10px 15px rgba(0, 0, 0, 0.4)',
      },
      transitions: {
        fast: '150ms ease',
        normal: '250ms ease',
        slow: '350ms ease',
      },
    },
  },

  // 更多主题...
];

export const defaultTheme = themes[0];
```

---

## 10. 安全性设计

### 9.1 敏感数据存储

```typescript
// packages/main/src/security/credential.ts

import { safeStorage } from 'electron';

/**
 * 凭证管理器
 * 使用系统级加密存储敏感信息
 */
export class CredentialManager {
  private static readonly SERVICE_NAME = 'QSerial';

  /**
   * 保存密码
   */
  static async savePassword(key: string, password: string): Promise<void> {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(password);
      // 存储到安全存储
      localStorage.setItem(`cred:${key}`, encrypted.toString('base64'));
    } else {
      // 降级处理：警告用户
      console.warn('Encryption not available, storing in plain text');
      localStorage.setItem(`cred:${key}`, password);
    }
  }

  /**
   * 获取密码
   */
  static async getPassword(key: string): Promise<string | null> {
    const encrypted = localStorage.getItem(`cred:${key}`);
    if (!encrypted) return null;

    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } else {
      return encrypted;
    }
  }

  /**
   * 删除密码
   */
  static async deletePassword(key: string): Promise<void> {
    localStorage.removeItem(`cred:${key}`);
  }

  /**
   * 保存 SSH 私钥
   */
  static async saveSSHKey(name: string, privateKey: string, passphrase?: string): Promise<void> {
    await this.savePassword(`ssh:${name}:key`, privateKey);
    if (passphrase) {
      await this.savePassword(`ssh:${name}:passphrase`, passphrase);
    }
  }

  /**
   * 获取 SSH 私钥
   */
  static async getSSHKey(name: string): Promise<{ privateKey: string; passphrase?: string }> {
    const privateKey = await this.getPassword(`ssh:${name}:key`);
    const passphrase = await this.getPassword(`ssh:${name}:passphrase`);

    if (!privateKey) {
      throw new Error(`SSH key not found: ${name}`);
    }

    return { privateKey, passphrase: passphrase || undefined };
  }
}
```

### 9.2 输入验证

```typescript
// packages/shared/src/utils/validation.ts

/**
 * 连接选项验证器
 */
export class ConnectionValidator {
  /**
   * 验证串口配置
   */
  static validateSerialOptions(options: SerialConnectionOptions): string[] {
    const errors: string[] = [];

    // 路径验证
    if (!options.path) {
      errors.push('Serial port path is required');
    }

    // 波特率验证
    const validBaudRates = [300, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
    if (!validBaudRates.includes(options.baudRate)) {
      errors.push(`Invalid baud rate: ${options.baudRate}`);
    }

    // 数据位验证
    if (![5, 6, 7, 8].includes(options.dataBits)) {
      errors.push(`Invalid data bits: ${options.dataBits}`);
    }

    // 停止位验证
    if (![1, 1.5, 2].includes(options.stopBits)) {
      errors.push(`Invalid stop bits: ${options.stopBits}`);
    }

    return errors;
  }

  /**
   * 验证 SSH 配置
   */
  static validateSshOptions(options: SshConnectionOptions): string[] {
    const errors: string[] = [];

    // 主机验证
    if (!options.host) {
      errors.push('Host is required');
    } else if (!this.isValidHost(options.host)) {
      errors.push(`Invalid host: ${options.host}`);
    }

    // 端口验证
    if (options.port < 1 || options.port > 65535) {
      errors.push(`Invalid port: ${options.port}`);
    }

    // 用户名验证
    if (!options.username) {
      errors.push('Username is required');
    }

    // 认证验证
    if (!options.password && !options.privateKey) {
      errors.push('Either password or private key is required');
    }

    return errors;
  }

  /**
   * 验证主机名/IP
   */
  private static isValidHost(host: string): boolean {
    // IPv4
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(host)) {
      const parts = host.split('.').map(Number);
      return parts.every(part => part >= 0 && part <= 255);
    }

    // IPv6 (简化验证)
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    if (ipv6Regex.test(host)) {
      return true;
    }

    // 域名
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
    return domainRegex.test(host);
  }
}
```

---

## 11. 性能优化策略

### 10.1 终端渲染优化

```
┌─────────────────────────────────────────────────────────────┐
│                    终端渲染优化策略                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 数据节流 (Throttling)                                    │
│     ┌─────────────────────────────────────────────────┐     │
│     │  高频数据 → 节流器 → 批量写入 xterm              │     │
│     │  (1000+ 行/秒)   (16ms 间隔)                    │     │
│     └─────────────────────────────────────────────────┘     │
│                                                              │
│  2. 虚拟滚动 (Virtual Scroll)                                │
│     ┌─────────────────────────────────────────────────┐     │
│     │  只渲染可见区域 + 缓冲区                        │     │
│     │  scrollback: 10000 → 实际渲染: ~100 行         │     │
│     └─────────────────────────────────────────────────┘     │
│                                                              │
│  3. GPU 加速                                                 │
│     ┌─────────────────────────────────────────────────┐     │
│     │  Canvas 2D → WebGL Renderer                     │     │
│     │  CSS transform: translateZ(0)                   │     │
│     └─────────────────────────────────────────────────┘     │
│                                                              │
│  4. Web Worker                                               │
│     ┌─────────────────────────────────────────────────┐     │
│     │  ANSI 解析 → Web Worker                         │     │
│     │  主线程不阻塞                                   │     │
│     └─────────────────────────────────────────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 内存管理

```typescript
// packages/renderer/src/utils/buffer-manager.ts

/**
 * 环形缓冲区
 * 用于管理终端输出历史，限制内存使用
 */
export class CircularBuffer<T> {
  private buffer: T[];
  private head = 0;
  private tail = 0;
  private count = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.tail = (this.tail + 1) % this.capacity;
    }
  }

  pop(): T | undefined {
    if (this.count === 0) return undefined;

    this.head = (this.head - 1 + this.capacity) % this.capacity;
    const item = this.buffer[this.head];
    this.count--;
    return item;
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      result.push(this.buffer[(this.tail + i) % this.capacity]);
    }
    return result;
  }

  get length(): number {
    return this.count;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
}

/**
 * 数据节流器
 */
export class DataThrottler {
  private buffer: Buffer[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly interval: number;

  constructor(
    private onFlush: (data: Buffer) => void,
    interval = 16  // ~60fps
  ) {
    this.interval = interval;
  }

  write(data: Buffer): void {
    this.buffer.push(data);

    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.interval);
    }
  }

  private flush(): void {
    if (this.buffer.length > 0) {
      const combined = Buffer.concat(this.buffer);
      this.onFlush(combined);
      this.buffer = [];
    }
    this.timer = null;
  }

  destroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.buffer = [];
  }
}
```

---

## 12. 测试策略

### 11.1 测试金字塔

```
                    ┌─────────┐
                    │   E2E   │  ← Playwright
                    │  Tests  │    关键用户流程
                    └─────────┘
                  ┌─────────────┐
                  │ Integration │  ← Vitest
                  │    Tests    │    模块集成
                  └─────────────┘
              ┌───────────────────┐
              │     Unit Tests    │  ← Vitest
              │   (Functions,     │    纯函数、工具类
              │    Components)    │
              └───────────────────┘
```

### 11.2 测试示例

```typescript
// packages/terminal-core/src/__tests__/parser.test.ts

import { describe, it, expect } from 'vitest';
import { AnsiParser } from '../parser';

describe('AnsiParser', () => {
  it('should parse plain text', () => {
    const parser = new AnsiParser();
    const result = parser.parse('Hello World');

    expect(result).toEqual([
      { type: 'text', content: 'Hello World' }
    ]);
  });

  it('should parse ANSI color codes', () => {
    const parser = new AnsiParser();
    const result = parser.parse('\x1b[31mRed Text\x1b[0m');

    expect(result).toEqual([
      { type: 'style', fg: 'red' },
      { type: 'text', content: 'Red Text' },
      { type: 'reset' }
    ]);
  });

  it('should parse cursor movement', () => {
    const parser = new AnsiParser();
    const result = parser.parse('\x1b[5;10H');

    expect(result).toEqual([
      { type: 'cursor', action: 'move', row: 5, col: 10 }
    ]);
  });
});
```

```typescript
// packages/renderer/src/components/Terminal/__tests__/Terminal.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Terminal } from '../Terminal';

// Mock xterm
vi.mock('xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    write: vi.fn(),
    onData: vi.fn(),
    onResize: vi.fn(),
    dispose: vi.fn(),
    options: {},
  })),
}));

describe('Terminal Component', () => {
  it('should render terminal container', () => {
    render(<Terminal sessionId="test" connectionId="conn-1" />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should handle paste event', async () => {
    const { container } = render(
      <Terminal sessionId="test" connectionId="conn-1" />
    );

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        readText: vi.fn().mockResolvedValue('test paste'),
      },
    });

    fireEvent.contextMenu(container.firstChild!);
    // 验证右键菜单显示
  });
});
```

---

## 13. 部署与发布

### 12.1 构建配置

```javascript
// electron-builder.config.js

module.exports = {
  appId: 'com.qserial.app',
  productName: 'QSerial',
  copyright: 'Copyright © 2026 QSerial Team',

  directories: {
    output: 'dist',
    buildResources: 'build',
  },

  files: [
    'packages/main/dist/**/*',
    'packages/renderer/dist/**/*',
    'packages/shared/dist/**/*',
    'package.json',
  ],

  extraResources: [
    {
      from: 'resources',
      to: 'resources',
    },
  ],

  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64', 'ia32'],
      },
      {
        target: 'portable',
        arch: ['x64'],
      },
    ],
    icon: 'build/icon.ico',
  },

  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64'],
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64'],
      },
    ],
    icon: 'build/icon.icns',
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false,
  },

  linux: {
    target: [
      'AppImage',
      'deb',
      'rpm',
    ],
    icon: 'build/icons',
    category: 'Development',
    maintainer: 'qserial@example.com',
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'QSerial',
  },

  dmg: {
    contents: [
      {
        x: 130,
        y: 220,
      },
      {
        x: 410,
        y: 220,
        type: 'link',
        path: '/Applications',
      },
    ],
  },

  publish: {
    provider: 'github',
    owner: 'qserial',
    repo: 'qserial',
  },
};
```

### 12.2 CI/CD 配置

```yaml
# .github/workflows/build.yml

name: Build and Release

on:
  push:
    tags:
      - 'v*'
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ${{ matrix.os }}

    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install

      - name: Run tests
        run: pnpm test

      - name: Build application
        run: pnpm build

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.os }}-build
          path: dist/

  release:
    needs: build
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/')

    steps:
      - uses: actions/checkout@v4

      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: artifacts/**/*
          generate_release_notes: true
```

---

## 14. 开发路线图

### Phase 1: 基础框架 (第 1-3 周)

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 项目初始化 | Monorepo 结构、构建配置 | P0 |
| 主进程框架 | Electron 主进程、窗口管理 | P0 |
| 渲染进程框架 | React 应用、路由、状态管理 | P0 |
| IPC 通信层 | 双向通信、事件系统 | P0 |
| 本地终端 | PTY 管理、xterm.js 集成 | P0 |
| 基础 UI | 标签栏、侧边栏、状态栏 | P0 |

### Phase 2: 串口功能 (第 4-5 周)

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 串口连接 | serialport 集成、配置界面 | P0 |
| 串口监视 | HEX/ASCII 显示、时间戳 | P0 |
| 发送功能 | 发送历史、快捷发送 | P1 |
| 数据记录 | 日志保存、导出功能 | P1 |

### Phase 3: SSH 功能 (第 6-7 周)

| 任务 | 描述 | 优先级 |
|------|------|--------|
| SSH 连接 | ssh2 集成、认证管理 | P0 |
| SFTP 集成 | 文件传输功能 | P1 |
| SSH 隧道 | 端口转发功能 | P2 |

### Phase 4: 插件系统 (第 8-9 周)

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 插件框架 | 加载、生命周期管理 | P0 |
| 插件 API | 命令、配置、UI 扩展 | P0 |
| 官方插件 | 串口监视器、主题包 | P1 |

### Phase 5: 高级功能 (第 10-11 周)

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 分屏功能 | 水平/垂直分屏 | P1 |
| 同步输入 | 多终端同步 | P2 |
| 会话管理 | 保存/恢复会话 | P1 |
| 快捷键系统 | 自定义快捷键 | P1 |

### Phase 6: 优化与发布 (第 12 周)

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 性能优化 | 渲染优化、内存管理 | P0 |
| 测试完善 | 单元测试、集成测试 | P0 |
| 文档编写 | 用户文档、开发文档 | P1 |
| 发布准备 | 打包、签名、分发 | P0 |

---

## 附录

### A. 参考资料

- [Electron 官方文档](https://www.electronjs.org/docs)
- [xterm.js 文档](https://xtermjs.org/docs/)
- [node-pty 文档](https://github.com/microsoft/node-pty)
- [serialport 文档](https://serialport.io/docs/)
- [ssh2 文档](https://github.com/mscdex/ssh2)

### B. 术语表

| 术语 | 说明 |
|------|------|
| PTY | 伪终端 (Pseudo Terminal) |
| IPC | 进程间通信 (Inter-Process Communication) |
| ANSI | 美国国家标准协会，此处指终端转义序列标准 |
| SSH | 安全外壳协议 (Secure Shell) |
| SFTP | SSH 文件传输协议 |

---

*文档结束*
