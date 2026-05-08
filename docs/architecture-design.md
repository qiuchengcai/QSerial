# QSerial 架构设计文档

> 版本: 3.2.0
> 日期: 2026-05-08
> 作者: QSerial Team

## 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-04-20 | 3.0.0 | 新增 ConnectionServer、快捷按钮系统、TELNET 协议协商；标注 SerialServer 已废弃；校验位补充 mark/space |
| 2026-04-21 | 3.1.0 | TFTP 传输参数优化；新增 AI 设备操控架构说明 |
| 2026-05-08 | 3.2.0 | 新增 FTP/NFS 模块设计说明；补充 IPC 通道列表（FTP/NFS/Log/Window/Network）；AI 设备操控章节标记为待开发；更新架构图；更新配置说明 |

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术选型](#2-技术选型)
3. [系统架构](#3-系统架构)
4. [模块设计](#4-模块设计)
5. [连接共享功能设计](#5-连接共享功能设计)
6. [安全性设计](#6-安全性设计)
7. [部署与发布](#7-部署与发布)

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
| 连接共享 | TCP 共享任意连接 + 密码认证 + SSH 隧道 |
| 串口共享 | TCP 共享串口 + 密码认证 + SSH 隧道（已废弃，由连接共享替代） |
| SFTP 文件传输 | SSH 连接内置文件浏览器 |
| TFTP 服务器 | 内置 TFTP 服务器，传输参数优化（blockSize=65464、windowSize=64） |
| FTP 服务器 | 内置 FTP 服务器，支持用户名密码认证 |
| NFS 服务器 | 内置 NFS 服务器（Windows 使用 WinNFSd，Linux 使用 exportfs） |
| 多标签管理 | 支持拖拽排序、分组管理 |
| 主题定制 | 8 套预设主题，支持自定义 |
| 快捷按钮 | 终端下方可配置快捷命令按钮，支持多行命令 + 行间延迟 |
| 会话管理 | 保存连接配置，快速重连 |
| 跨平台 | Windows、macOS、Linux |

---

## 2. 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron 28+ | Node.js 生态成熟，串口/SSH 功能支持好 |
| 前端框架 | React 18 + TypeScript 5.3 | 组件化开发，类型安全 |
| 终端渲染 | xterm.js 5.x | 成熟稳定，社区活跃 |
| 状态管理 | Zustand | 轻量、API 简洁，persist 中间件持久化 |
| UI 样式 | Tailwind CSS | 原子化 CSS，开发效率高 |
| PTY 管理 | node-pty | 微软官方 PTY 库 |
| 串口通信 | serialport 12.x | Node.js 串口标准库 |
| SSH 协议 | ssh2 1.15+ | 纯 JS 实现，支持 SFTP |
| Telnet 协议 | net (Node 内置) | TCP socket 原生支持 |
| FTP 服务 | ftp-srv 4.x | 纯 JS FTP 服务器 |
| 构建工具 | Vite 5 + electron-builder | 快速构建 + 跨平台打包 |
| 包管理 | pnpm 8.15 (Monorepo) | 节省磁盘空间，严格依赖管理 |

---

## 3. 系统架构

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                  Renderer Process (UI)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ Terminal  │ │ Sidebar  │ │ Settings │              │
│  │ Component │ │(Sessions)│ │   UI     │              │
│  └──────────┘ └──────────┘ └──────────┘              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │QuickBtn  │ │   SFTP   │ │TFTP/FTP/ │              │
│  │   Bar    │ │  Panel   │ │ NFS Dialog│             │
│  └──────────┘ └──────────┘ └──────────┘              │
│  ┌──────────────────────────────────────────────────┐│
│  │           State Management (Zustand)             ││
│  └──────────────────────────────────────────────────┘│
└────────────────────────┬────────────────────────────┘
                         ↕ IPC
┌────────────────────────┴────────────────────────────┐
│                   Main Process                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │   PTY    │ │  Serial  │ │   SSH    │              │
│  │Connection│ │Connection│ │Connection│              │
│  └──────────┘ └──────────┘ └──────────┘              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │  Telnet  │ │ Connection│ │  Config  │              │
│  │Connection│ │  Server   │ │ Manager  │              │
│  └──────────┘ └──────────┘ └──────────┘              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │   SFTP   │ │   TFTP   │ │   FTP    │              │
│  │ Manager  │ │ Manager  │ │ Manager  │              │
│  └──────────┘ └──────────┘ └──────────┘              │
│  ┌──────────┐                                        │
│  │   NFS    │                                        │
│  │ Manager  │                                        │
│  └──────────┘                                        │
└────────────────────────┬────────────────────────────┘
                         ↕
┌────────────────────────┴────────────────────────────┐
│                   Native Layer                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ node-pty │ │serialport│ │   ssh2   │              │
│  └──────────┘ └──────────┘ └──────────┘              │
│  ┌──────────┐ ┌──────────┐                          │
│  │ ftp-srv  │ │WinNFSd/  │                          │
│  │          │ │ exportfs │                          │
│  └──────────┘ └──────────┘                          │
└─────────────────────────────────────────────────────┘
```

### 3.2 数据流

**用户输入**: xterm.js onData → IPC → Main Process Connection.write() → PTY/Serial/SSH

**终端输出**: PTY/Serial/SSH onData → Main Process → IPC (Base64 编码) → xterm.js write()

---

## 4. 模块设计

### 4.1 连接抽象接口

所有连接类型实现 `IConnection` 接口（定义在 `packages/shared/src/types/connection.ts`）：

```typescript
interface IConnection {
  readonly id: string;
  readonly type: ConnectionType;    // PTY | SERIAL | SSH | TELNET | SERIAL_SERVER | CONNECTION_SERVER
  readonly state: ConnectionState;  // DISCONNECTED | CONNECTING | CONNECTED | RECONNECTING | ERROR
  readonly options: ConnectionOptions;
  open(): Promise<void>;
  close(): Promise<void>;
  destroy(): void;
  write(data: Buffer | string): void;
  writeHex(hex: string): void;
  resize(cols: number, rows: number): void;
  onData(callback: (data: Buffer) => void): () => void;
  onStateChange(callback: (state: ConnectionState) => void): () => void;
  onError(callback: (error: Error) => void): () => void;
  onClose(callback: (code?: number) => void): () => void;
}
```

### 4.2 连接工厂

`ConnectionFactory`（`packages/main/src/connection/factory.ts`）统一管理所有连接实例：
- `create(options)` — 创建连接
- `get(id)` — 获取连接
- `destroy(id)` — 销毁连接

### 4.3 连接类型

| 类型 | 实现类 | 原生依赖 | 说明 |
|------|--------|----------|------|
| PTY | `PtyConnection` | node-pty | 本地终端，支持 resize |
| Serial | `SerialConnection` | serialport | 串口连接，支持自动重连和连接复用 |
| SSH | `SshConnection` | ssh2 | SSH 连接，支持密钥/密码认证，兼容旧设备算法 |
| Telnet | `TelnetConnection` | net (Node 内置) | Telnet 协议连接 |
| SerialServer | `SerialServerConnection` | net + ssh2 | 串口共享（已废弃，由 ConnectionServer 替代） |
| ConnectionServer | `ConnectionServerConnection` | net + ssh2 | 通用连接共享，TCP 共享任意活跃连接 |

### 4.4 IPC 通信

IPC 通道定义在 `packages/shared/src/types/ipc.ts`，处理器在 `packages/main/src/ipc/handlers.ts`。

主要通道分类：
- **连接管理**: create / open / close / destroy / write / resize
- **串口**: list (端口列表)
- **串口共享**: start / stop / status
- **连接共享**: start / stop / status
- **SFTP**: create / destroy / list / download / upload / mkdir / rmdir / rm / rename / stat / readlink / symlink / realpath
- **TFTP**: start / stop / status
- **FTP**: start / stop / status / getClients
- **NFS**: start / stop / status / getMountHint
- **配置**: get / set / delete
- **会话**: save / load / list / delete
- **窗口**: minimize / maximize / close / setTitle
- **日志**: start / stop / write / pickFile
- **网络**: getLocalIp
- **文件操作**: readFile

### 4.5 配置系统

配置结构定义在 `packages/shared/src/types/config.ts`，管理器在 `packages/main/src/config/manager.ts`。

主要配置分区：
- `app` — 语言、主题、自动更新、最小化到托盘
- `terminal` — 字体、scrollback、选中即复制、右键粘贴
- `serial` — 默认波特率、数据位、停止位、校验位（none/even/odd/mark/space）、自动重连、时间戳、十六进制显示
- `ssh` — keepalive、超时
- `serialShare` — 默认端口、监听地址（**已废弃**，使用 connectionShare）
- `connectionShare` — 默认端口、监听地址、最近 SSH 隧道配置
- `window` — 窗口大小和位置

配置采用深度合并策略：默认配置 + 用户配置，支持点号路径访问（如 `serial.defaultBaudRate`）。

### 4.6 主题系统

主题结构定义在 `packages/shared/src/types/theme.ts`：

```typescript
interface Theme {
  id: string;
  name: string;
  author?: string;
  version?: string;
  type: 'light' | 'dark';
  xterm: XtermTheme;   // xterm.js 终端颜色
  ui: UITheme;          // UI 颜色、字体、圆角、阴影、背景纹理
}
```

内置 8 套预设主题：Default Dark、Default Light、One Dark、Dracula、Monokai、Nord、Solarized Dark、Paper Book。

### 4.7 快捷按钮系统

快捷按钮定义在 `packages/renderer/src/stores/quickButtons.ts`，UI 组件在 `packages/renderer/src/components/terminal/QuickButtonBar.tsx`。

- **分组管理**：创建/编辑/删除/排序分组，下拉切换
- **自定义按钮**：名称、多行命令（逐条发送）、行间延迟、描述、颜色
- **预设颜色**：10 种预设 + 自定义颜色
- **持久化**：通过 Zustand persist 中间件保存到 localStorage

### 4.8 FTP 服务器

FTP 服务器定义在 `packages/main/src/ftp/manager.ts`，基于 `ftp-srv` 库实现。

- **匿名/用户认证**：支持匿名访问和用户名密码认证
- **目录共享**：指定本地目录作为 FTP 根目录
- **状态管理**：`packages/renderer/src/stores/ftp.ts` — 启动/停止/状态/客户端列表
- **UI 对话框**：`packages/renderer/src/components/dialogs/FtpDialog.tsx`

### 4.9 NFS 服务器

NFS 服务器定义在 `packages/main/src/nfs/manager.ts`，支持 Windows 和 Linux 双平台：

- **Windows**: 通过 WinNFSd 子进程实现 NFS 共享
- **Linux**: 通过系统 exportfs / nfs-kernel-server 管理 NFS 共享
- **客户端监控**: 定时检测 NFS 客户端连接状态，推送连接/断开事件
- **状态管理**: `packages/renderer/src/stores/nfs.ts` — 启动/停止/状态/客户端列表/挂载提示
- **UI 对话框**: `packages/renderer/src/components/dialogs/NfsDialog.tsx`

---

## 5. 连接共享功能设计

> 串口共享（SerialServer）功能已废弃，由连接共享（ConnectionServer）替代。ConnectionServer 支持共享任意类型的活跃连接。

### 5.1 功能概述

- **局域网共享**: 通过 TCP Socket 将任意连接暴露给局域网内的其他设备
- **SSH 反向隧道**: 通过 SSH 隧道将连接共享到远程服务器
- **密码认证**: 可选的访问密码，防止未授权连接
- **写入队列**: 多客户端写入串行化，防止数据帧交错
- **TELNET 协议协商**: 服务端主动协商 WILL ECHO + SUPPRESS-GA + DO NAWS + DO TTYPE，确保远程客户端的 Tab 补全、方向键等交互功能正常

### 5.2 架构

```
远程设备 ──telnet──→ [TCP/SSH] ──→ 本地 TCP Server ──→ 写入队列 ──→ Connection
                                               ↓
Connection.onData ──→ 广播给已认证客户端 ──→ 远程设备
```

### 5.3 核心选项

```typescript
interface ConnectionServerOptions extends BaseConnectionOptions {
  type: ConnectionType.CONNECTION_SERVER;
  // 数据源配置
  sourceType: 'existing' | 'new';         // 复用已有连接或创建新连接
  existingConnectionId?: string;           // 复用已有连接的ID
  newConnectionOptions?: ConnectionOptions; // 新建连接的配置
  // 共享服务配置
  localPort: number;                       // 本地TCP监听端口
  listenAddress?: string;                  // 默认 '0.0.0.0'
  accessPassword?: string;                 // 为空则无需认证
  // SSH反向隧道
  sshTunnel?: {
    host: string;
    port: number;
    username: string;
    remotePort: number;
    privateKey?: string;
    password?: string;
  };
}
```

### 5.4 密码认证协议

1. 客户端连接后，服务端发送 `PASSWORD: ` 提示
2. 客户端需在 **10 秒内**发送密码（支持 `PASSWORD:xxx\n` 前缀或直接输入），回显星号
3. 认证成功返回 `OK\n`，失败返回 `AUTH_FAILED\n`，超时返回 `AUTH_TIMEOUT\n`
4. 最多 3 次认证尝试，超过后断开连接
5. 未认证客户端不会收到连接数据，发送的数据也被忽略

### 5.5 SSH 反向隧道

- 自动尝试 `~/.ssh` 下的默认密钥 (id_ed25519, id_rsa, id_ecdsa, id_dsa)
- 断线自动重连 (指数退避，基础延迟 3 秒，最多 5 次)
- SSH `tcp connection` 事件转发到本地 TCP 端口

### 5.6 客户端连接方式

```bash
# 局域网连接（无密码）
telnet <本机IP> 8888

# 局域网连接（有密码）
telnet <本机IP> 8888
# 连接后直接输入密码回车即可认证

# SSH 隧道模式（在远程服务器上）
telnet localhost <远程端口>

# Windows（需先启用 Telnet 客户端）
dism /online /Enable-Feature /FeatureName:TelnetClient
telnet <本机IP> 8888

# 也可使用 socat 交互操作
socat - localhost:8888
```

> 推荐使用 telnet 客户端连接，支持完整的终端交互功能（Tab 补全、方向键等）。

### 5.7 安全考虑

1. 密码认证防止未授权连接，10 秒超时自动断开
2. 未认证客户端数据隔离（不收不发）
3. 密码仅保存在内存中，不写入配置文件
4. 支持 `127.0.0.1` 限制仅本机访问
5. 写入队列串行化，防止多客户端数据混乱

---

## 6. 安全性设计

### 6.1 敏感数据存储

- SSH 密码和访问密码仅保存在内存中，不持久化
- 使用 Electron `safeStorage` API 加密存储凭证（如需持久化）
- Electron 安全配置：`contextIsolation: true`，`nodeIntegration: false`

### 6.2 输入验证

所有连接选项通过验证器（`packages/shared/src/utils/validation.ts`）校验：
- 串口路径、波特率、数据位、停止位、校验位（none/even/odd/mark/space）验证
- SSH 主机、端口、认证方式验证
- Telnet 主机、端口验证

### 6.3 SSH 算法兼容

扩展支持旧算法（包括 diffie-hellman-group1-sha1, ssh-dss 等），兼容老旧嵌入式设备。

---

## 7. 部署与发布

### 7.1 构建命令

```bash
pnpm install              # 安装依赖
pnpm build:shared         # 构建共享包
pnpm build                # 构建所有包
pnpm dev                  # 启动开发模式
pnpm package:win          # 打包 Windows
pnpm package:linux        # 打包 Linux
pnpm package:mac          # 打包 macOS
```

### 7.2 打包配置

打包配置在 `electron-builder.config.cjs`，支持：
- **Windows**: 目录格式输出
- **Linux**: AppImage + deb
- **macOS**: DMG，x64 + arm64 双架构

### 7.3 原生模块

项目包含原生模块（node-pty、serialport）需编译，ftp-srv/ssh2 为纯 JS 实现无需编译：

```bash
pnpm rebuild node-pty @serialport/bindings-cpp
```

---

## 附录

### 术语表

| 术语 | 说明 |
|------|------|
| PTY | 伪终端 (Pseudo Terminal) |
| IPC | 进程间通信 (Inter-Process Communication) |
| SSH | 安全外壳协议 (Secure Shell) |
| SFTP | SSH 文件传输协议 |
| TFTP | 简单文件传输协议 (Trivial File Transfer Protocol) |
| NAWS | Telnet 窗口大小协商 (Negotiate About Window Size) |
| TTYPE | Telnet 终端类型 (Terminal Type) |
| Skill | Codebuddy 技能模块，Markdown + Python 脚本实现 |
| MCP | Model Context Protocol，AI 工具调用协议 |

---

## 8. AI 设备操控架构（规划中）

> ⚠️ **本章节为设计规划，当前代码中尚未实现。**

### 8.1 架构概述

QSerial 的终端共享功能为 AI 操控设备提供了天然通道。计划采用 Skill 方案直连设备，无需 MCP 中间层。

```
AI → execute_command → Python脚本 → TELNET → QSerial共享 → 串口 → 设备
```

### 8.2 Skill 方案 vs MCP（规划中）

| 维度 | Skill 方案 | MCP |
|------|-----------|-----|
| 执行链路 | 最短，无中间层 | 多一层进程间通信 |
| 响应速度 | 快，2-3 秒/命令 | 慢，JSON-RPC 封装/解析有额外耗时 |
| 资源开销 | 按需执行，零常驻 | Server 长驻进程 |
| Agent 搭建 | 即插即用，放入 skills 目录即可 | 需注册配置、启动参数 |
| Skill 维护 | 修改即时生效 | 需重启 Server |
| Skill 分发 | 随仓库提交，clone 即可用 | 每台机器单独配置 |

### 8.3 Skill 实现（规划中）

Skill 由两部分组成：
- **SKILL.md**：Markdown 描述触发规则和使用说明
- **scripts/**：Python 脚本实现连接和命令执行逻辑

```
.codebuddy/skills/uniview-ipc-connect/
├── SKILL.md              # 触发规则 + 使用说明
└── scripts/
    ├── shell.py          # Layer 1：CLI 命令执行
    ├── root.py           # Layer 2：Root shell 命令执行
    ├── connect.py        # 连接管理
    └── status.py         # 连接状态查询
```
