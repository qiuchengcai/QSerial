# QSerial 项目目录结构

> 版本: 1.0.0
> 更新日期: 2026-04-11

---

## 完整目录结构

```
QSerial/
├── .github/                          # GitHub 配置
│   ├── workflows/                    # CI/CD 工作流
│   │   ├── build.yml                 # 构建流程
│   │   ├── test.yml                  # 测试流程
│   │   └── release.yml               # 发布流程
│   ├── ISSUE_TEMPLATE/               # Issue 模板
│   └── PULL_REQUEST_TEMPLATE.md      # PR 模板
│
├── .vscode/                          # VS Code 配置
│   ├── launch.json                   # 调试配置
│   ├── settings.json                 # 工作区设置
│   ├── extensions.json               # 推荐扩展
│   └── tasks.json                    # 任务配置
│
├── build/                            # 构建资源
│   ├── icon.ico                      # Windows 图标
│   ├── icon.icns                     # macOS 图标
│   ├── icons/                        # Linux 图标
│   │   ├── 16x16.png
│   │   ├── 32x32.png
│   │   ├── 48x48.png
│   │   ├── 128x128.png
│   │   └── 512x512.png
│   ├── installer.nsh                 # NSIS 安装脚本
│   └── entitlements.mac.plist        # macOS 权限配置
│
├── docs/                             # 文档目录
│   ├── architecture.md               # 架构设计文档
│   ├── directory-structure.md        # 目录结构文档
│   ├── development-guide.md          # 开发指南
│   ├── api/                          # API 文档
│   │   ├── plugin-api.md             # 插件 API
│   │   ├── ipc-api.md                # IPC API
│   │   └── config-api.md             # 配置 API
│   └── user-guide/                   # 用户指南
│       ├── getting-started.md
│       ├── serial-connection.md
│       └── ssh-connection.md
│
├── packages/                         # Monorepo 包目录
│   │
│   ├── main/                         # Electron 主进程
│   │   ├── src/
│   │   │   ├── index.ts              # 入口文件
│   │   │   ├── app.ts                # 应用生命周期
│   │   │   ├── window.ts             # 窗口管理
│   │   │   │
│   │   │   ├── connection/           # 连接管理
│   │   │   │   ├── index.ts          # 导出
│   │   │   │   ├── factory.ts        # 连接工厂
│   │   │   │   ├── base.ts           # 基类
│   │   │   │   ├── pty.ts            # PTY 连接
│   │   │   │   ├── serial.ts         # 串口连接
│   │   │   │   ├── ssh.ts            # SSH 连接
│   │   │   │   └── telnet.ts         # Telnet 连接
│   │   │   │
│   │   │   ├── ipc/                  # IPC 通信
│   │   │   │   ├── index.ts          # 导出
│   │   │   │   ├── handlers.ts       # 处理器注册
│   │   │   │   ├── connection.ts     # 连接相关
│   │   │   │   ├── config.ts         # 配置相关
│   │   │   │   ├── session.ts        # 会话相关
│   │   │   │   └── plugin.ts         # 插件相关
│   │   │   │
│   │   │   ├── config/               # 配置管理
│   │   │   │   ├── index.ts
│   │   │   │   ├── manager.ts        # 配置管理器
│   │   │   │   └── schema.ts         # 配置 Schema
│   │   │   │
│   │   │   ├── session/              # 会话管理
│   │   │   │   ├── index.ts
│   │   │   │   ├── manager.ts        # 会话管理器
│   │   │   │   └── storage.ts        # 会话存储
│   │   │   │
│   │   │   ├── plugin/               # 插件系统
│   │   │   │   ├── index.ts
│   │   │   │   ├── manager.ts        # 插件管理器
│   │   │   │   ├── loader.ts         # 插件加载器
│   │   │   │   ├── sandbox.ts        # 插件沙箱
│   │   │   │   └── api/              # 插件 API
│   │   │   │       ├── terminal.ts
│   │   │   │       ├── config.ts
│   │   │   │       └── ui.ts
│   │   │   │
│   │   │   ├── security/             # 安全模块
│   │   │   │   ├── index.ts
│   │   │   │   ├── credential.ts     # 凭证管理
│   │   │   │   └── validation.ts     # 输入验证
│   │   │   │
│   │   │   ├── update/               # 自动更新
│   │   │   │   ├── index.ts
│   │   │   │   └── updater.ts
│   │   │   │
│   │   │   ├── tray/                 # 系统托盘
│   │   │   │   ├── index.ts
│   │   │   │   └── menu.ts
│   │   │   │
│   │   │   └── utils/                # 工具函数
│   │   │       ├── logger.ts
│   │   │       ├── path.ts
│   │   │       └── platform.ts
│   │   │
│   │   ├── tests/                    # 测试文件
│   │   │   ├── connection.test.ts
│   │   │   └── config.test.ts
│   │   │
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   │
│   ├── renderer/                     # 渲染进程 (UI)
│   │   ├── src/
│   │   │   ├── index.tsx             # 入口文件
│   │   │   ├── App.tsx               # 根组件
│   │   │   │
│   │   │   ├── components/           # UI 组件
│   │   │   │   ├── layout/           # 布局组件
│   │   │   │   │   ├── Header.tsx
│   │   │   │   │   ├── Sidebar.tsx
│   │   │   │   │   ├── MainContent.tsx
│   │   │   │   │   └── StatusBar.tsx
│   │   │   │   │
│   │   │   │   ├── terminal/         # 终端组件
│   │   │   │   │   ├── Terminal.tsx
│   │   │   │   │   ├── TerminalTab.tsx
│   │   │   │   │   ├── TerminalPane.tsx
│   │   │   │   │   ├── SearchBar.tsx
│   │   │   │   │   └── ContextMenu.tsx
│   │   │   │   │
│   │   │   │   ├── tabs/             # 标签组件
│   │   │   │   │   ├── TabBar.tsx
│   │   │   │   │   ├── Tab.tsx
│   │   │   │   │   └── TabContextMenu.tsx
│   │   │   │   │
│   │   │   │   ├── split/            # 分屏组件
│   │   │   │   │   ├── SplitPane.tsx
│   │   │   │   │   └── Resizer.tsx
│   │   │   │   │
│   │   │   │   ├── settings/         # 设置组件
│   │   │   │   │   ├── SettingsPanel.tsx
│   │   │   │   │   ├── GeneralSettings.tsx
│   │   │   │   │   ├── TerminalSettings.tsx
│   │   │   │   │   ├── SerialSettings.tsx
│   │   │   │   │   ├── SSHSettings.tsx
│   │   │   │   │   ├── KeybindingsSettings.tsx
│   │   │   │   │   └── ThemeSettings.tsx
│   │   │   │   │
│   │   │   │   ├── connection/       # 连接组件
│   │   │   │   │   ├── ConnectionDialog.tsx
│   │   │   │   │   ├── SerialConfig.tsx
│   │   │   │   │   ├── SSHConfig.tsx
│   │   │   │   │   └── SessionList.tsx
│   │   │   │   │
│   │   │   │   └── common/           # 通用组件
│   │   │   │       ├── Button.tsx
│   │   │   │       ├── Input.tsx
│   │   │   │       ├── Select.tsx
│   │   │   │       ├── Modal.tsx
│   │   │   │       ├── Dropdown.tsx
│   │   │   │       ├── Tooltip.tsx
│   │   │   │       └── Notification.tsx
│   │   │   │
│   │   │   ├── hooks/                # React Hooks
│   │   │   │   ├── useTerminal.ts
│   │   │   │   ├── useConnection.ts
│   │   │   │   ├── useConfig.ts
│   │   │   │   ├── useTheme.ts
│   │   │   │   ├── useKeybinding.ts
│   │   │   │   └── useNotification.ts
│   │   │   │
│   │   │   ├── stores/               # Zustand 状态管理
│   │   │   │   ├── index.ts
│   │   │   │   ├── terminal.ts       # 终端状态
│   │   │   │   ├── connection.ts     # 连接状态
│   │   │   │   ├── config.ts         # 配置状态
│   │   │   │   ├── theme.ts          # 主题状态
│   │   │   │   └── ui.ts             # UI 状态
│   │   │   │
│   │   │   ├── ipc/                  # IPC 客户端
│   │   │   │   ├── index.ts
│   │   │   │   ├── client.ts         # IPC 客户端
│   │   │   │   └── events.ts         # 事件处理
│   │   │   │
│   │   │   ├── themes/               # 主题样式
│   │   │   │   ├── index.ts
│   │   │   │   ├── presets.ts        # 预设主题
│   │   │   │   └── types.ts          # 主题类型
│   │   │   │
│   │   │   ├── styles/               # 全局样式
│   │   │   │   ├── index.css
│   │   │   │   ├── variables.css
│   │   │   │   └── animations.css
│   │   │   │
│   │   │   └── utils/                # 工具函数
│   │   │       ├── format.ts
│   │   │       ├── clipboard.ts
│   │   │       └── keyboard.ts
│   │   │
│   │   ├── tests/                    # 测试文件
│   │   │   ├── components/
│   │   │   └── hooks/
│   │   │
│   │   ├── index.html                # HTML 模板
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.js
│   │   └── postcss.config.js
│   │
│   ├── terminal-core/                # 终端核心库
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   │
│   │   │   ├── parser/               # ANSI 解析器
│   │   │   │   ├── index.ts
│   │   │   │   ├── AnsiParser.ts
│   │   │   │   ├── EscapeSequences.ts
│   │   │   │   └── SgrParser.ts
│   │   │   │
│   │   │   ├── buffer/               # 缓冲区管理
│   │   │   │   ├── index.ts
│   │   │   │   ├── Buffer.ts
│   │   │   │   ├── BufferLine.ts
│   │   │   │   └── CircularList.ts
│   │   │   │
│   │   │   ├── renderer/             # 渲染引擎
│   │   │   │   ├── index.ts
│   │   │   │   ├── Renderer.ts
│   │   │   │   ├── TextRenderer.ts
│   │   │   │   ├── CursorRenderer.ts
│   │   │   │   └── SelectionRenderer.ts
│   │   │   │
│   │   │   ├── input/                # 输入处理
│   │   │   │   ├── index.ts
│   │   │   │   ├── Keyboard.ts
│   │   │   │   └── Mouse.ts
│   │   │   │
│   │   │   └── utils/                # 工具函数
│   │   │       ├── CharWidth.ts
│   │   │       └── Unicode.ts
│   │   │
│   │   ├── tests/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   │
│   └── shared/                       # 共享代码
│       ├── src/
│       │   ├── index.ts
│       │   │
│       │   ├── types/                # 类型定义
│       │   │   ├── index.ts
│       │   │   ├── connection.ts
│       │   │   ├── config.ts
│       │   │   ├── theme.ts
│       │   │   ├── plugin.ts
│       │   │   ├── ipc.ts
│       │   │   └── session.ts
│       │   │
│       │   ├── constants/            # 常量定义
│       │   │   ├── index.ts
│       │   │   ├── connection.ts
│       │   │   ├── ipc.ts
│       │   │   └── keybindings.ts
│       │   │
│       │   └── utils/                # 工具函数
│       │       ├── index.ts
│       │       ├── validation.ts
│       │       ├── encoding.ts
│       │       └── uuid.ts
│       │
│       ├── package.json
│       └── tsconfig.json
│
├── plugins/                          # 官方插件
│   ├── serial-monitor/               # 串口监视器插件
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── SerialMonitor.ts
│   │   │   ├── HexView.tsx
│   │   │   └── HistoryPanel.tsx
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── theme-pack/                   # 主题包插件
│       ├── src/
│       │   ├── index.ts
│       │   └── themes/
│       │       ├── dracula.json
│       │       ├── monokai.json
│       │       └── solarized.json
│       └── package.json
│
├── resources/                        # 应用资源
│   ├── fonts/                        # 字体文件
│   │   ├── JetBrainsMono-Regular.ttf
│   │   └── JetBrainsMono-Bold.ttf
│   │
│   └── sounds/                       # 声音文件
│       └── bell.wav
│
├── scripts/                          # 构建脚本
│   ├── build.js                      # 构建脚本
│   ├── dev.js                        # 开发脚本
│   ├── postinstall.js                # 安装后脚本
│   └── generate-icons.js             # 图标生成脚本
│
├── .editorconfig                     # EditorConfig
├── .eslintrc.js                      # ESLint 配置
├── .gitignore                        # Git 忽略配置
├── .prettierrc                       # Prettier 配置
├── electron-builder.config.js        # electron-builder 配置
├── LICENSE                           # 许可证
├── package.json                      # 根 package.json
├── pnpm-workspace.yaml               # pnpm workspace 配置
├── README.md                         # 项目说明
├── README.zh-CN.md                   # 中文说明
└── tsconfig.base.json                # TypeScript 基础配置
```

---

## 核心目录说明

### packages/main (主进程)

Electron 主进程代码，负责：

- 窗口生命周期管理
- 原生功能调用 (PTY、串口、SSH)
- IPC 通信处理
- 配置持久化
- 插件系统管理

### packages/renderer (渲染进程)

前端 UI 代码，负责：

- 用户界面渲染
- 用户交互处理
- 状态管理
- 主题系统

### packages/terminal-core (终端核心)

可独立使用的终端核心库，负责：

- ANSI 转义序列解析
- 终端缓冲区管理
- 文本渲染
- 输入处理

### packages/shared (共享代码)

主进程和渲染进程共享的代码：

- 类型定义
- 常量定义
- 工具函数

---

## 配置文件说明

| 文件 | 用途 |
|------|------|
| `package.json` | 项目依赖、脚本定义 |
| `pnpm-workspace.yaml` | Monorepo 工作区配置 |
| `tsconfig.base.json` | TypeScript 基础配置 |
| `electron-builder.config.js` | 打包发布配置 |
| `.eslintrc.js` | 代码规范检查 |
| `.prettierrc` | 代码格式化 |
| `.editorconfig` | 编辑器配置 |

---

*文档结束*
