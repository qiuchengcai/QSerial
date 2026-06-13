# QSerial 开发指南

## 项目结构

```
QSerial/
├── packages/
│   ├── shared/          # 共享类型、配置、IPC 通道定义
│   ├── main/            # Electron 主进程
│   │   └── src/
│   │       ├── services/
│   │       │   ├── connection/   # 连接层 (Serial/SSH/Telnet/PTY)
│   │       │   ├── mcp/          # MCP 服务器、工具、通知、Resources
│   │       │   ├── sftp/         # SFTP 文件传输（基于 SSH）
│   │       │   ├── ftp/          # FTP 服务器
│   │       │   ├── nfs/          # NFS 服务器（WinNFSd / nfs-kernel-server）
│   │       │   └── tftp/         # TFTP 服务器（嵌入式设备部署）
│   │       ├── ipc/              # IPC 通道处理器
│   │       ├── config/           # 配置管理（原子写入+备份恢复）
│   │       ├── cli/              # 硬件 CI/CD CLI
│   │       └── index.ts          # 入口 + 窗口创建 + 后台服务初始化
│   └── renderer/        # Electron 渲染进程 (React)
│       └── src/
│           ├── components/       # UI 组件
│           ├── stores/           # Zustand 状态管理
│           └── hooks/            # 自定义 Hooks
├── plugins/             # 社区插件（ESPat 示例）
├── website/             # 官网主页
├── scripts/             # 构建/部署脚本
├── docs/                # 项目文档
├── resources/           # 打包资源（WinNFSd.exe 等）
└── electron-builder.config.cjs
```

### 关键文件

| 文件 | 说明 |
|------|------|
| `packages/main/src/services/mcp/manager.ts` | MCP 工具定义+执行（~2400 行） |
| `packages/main/src/services/mcp/tools.ts` | MCP 工具输入验证 |
| `packages/main/src/services/mcp/notifications.ts` | MCP 通知系统（8 种） |
| `packages/main/src/services/mcp/resources.ts` | MCP Resources（6 个 URI） |
| `packages/main/src/services/mcp/sampling.ts` | MCP Sampling（反向 AI 请求） |
| `packages/main/src/services/mcp/prompts.ts` | MCP 提示模板 |
| `packages/main/src/services/mcp/plugin-loader.ts` | 社区插件加载器 |
| `packages/main/src/services/connection/factory.ts` | 连接生命周期管理 |

## 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

## 常用命令

```bash
pnpm install              # 安装依赖
pnpm build:shared         # 构建共享包
pnpm dev                  # 开发模式（热重载）
pnpm build                # 构建所有包
pnpm package:win          # 打包 Windows
pnpm package:win:ci       # CI 模式打包（nsis + portable）
pnpm package:linux        # 打包 Linux
pnpm package:mac          # 打包 macOS
npx vitest run            # 运行单元测试
```

## 添加 Node 依赖到打包配置

由于 pnpm 的 hoisted 模式，electron-builder 需要显式声明要打包的依赖。在 `electron-builder.config.cjs` 的 `files` 数组中添加：

```javascript
{
  from: 'node_modules/<package-name>',
  to: 'node_modules/<package-name>',
  filter: ['**/*'],
}
```

## IPC 通信

- 通道名定义在 `packages/shared/src/ipc-channels.ts`
- 主进程处理在 `packages/main/src/ipc/handlers.ts`
- 渲染进程通过 `preload.ts` 暴露的 API 调用

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 35 + React 18 |
| 终端 | xterm.js 5.x |
| 状态管理 | Zustand (persist) |
| 样式 | Tailwind CSS |
| 构建 | Vite 5 + electron-builder |
| 原生模块 | node-pty, serialport, ssh2, ftp-srv |
| MCP | @modelcontextprotocol/sdk v1.29 |
