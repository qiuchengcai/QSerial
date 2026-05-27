# 第二阶段：现代化（Modernize）

> 预计工时：2-4 周 | 目标：工具链统一 + 依赖升级 + 技术债清理

---

## 2.1 Electron 渐进升级（28 → 35）

### 升级路径

```
28.2.0 ──→ 31.x ──→ 35.x
(Chromium 120)   (124)    (134)
```

不逐版本升（29→30→...），每跳 3 个大版本减少验证成本。

### 每个里程碑的检查清单

#### 28 → 31

| 检查项 | 说明 |
|--------|------|
| `app.commandLine.appendSwitch` | v29 开始部分开关被移除 |
| `webContents` API | `setWindowOpenHandler` 行为变更 |
| `BrowserWindow` 构造选项 | 部分选项 deprecated |
| 原生模块兼容性 | `serialport`/`node-pty`/`ssh2` 在 Node.js 20 下重新编译 |
| `native-patch.ts` 劫持逻辑 | `process.dlopen` 在 V8 新版本可能行为不同 |

#### 31 → 35

| 检查项 | 说明 |
|--------|------|
| `ipcRenderer` API | v33+ 推荐 `contextBridge` + `invoke/handle` 模式 |
| `protocol` API | `registerFileProtocol` 在 v34 被移除 |
| Chromium 安全策略 | 更严格的 CSP 限制 |
| `.node` 文件 ABI | 可能需要重新编译原生模块 |

### 升级步骤

```bash
# 1. 升级 Electron
pnpm add -D electron@31

# 2. 重新编译原生模块
pnpm rebuild

# 3. 测试启动
pnpm build:shared && pnpm dev

# 4. 功能回归
# - PTY 本地终端
# - 串口连接
# - SSH 连接 + SFTP
# - Telnet 连接
# - FTP/TFTP/NFS 服务
# - MCP 服务

# 5. 确认无误后升 35
pnpm add -D electron@35
pnpm rebuild
pnpm dev
```

### 验证标准

- [ ] Electron 35 下所有连接类型正常工作
- [ ] 原生模块无 ABI 兼容性问题
- [ ] 打包后安装包体积无明显增长
- [ ] Windows/macOS 双平台验证

---

## 2.2 构建工具统一到 Vite

### 现状

| 进程 | 构建工具 | 配置 |
|------|---------|------|
| renderer | Vite 5 | `packages/renderer/vite.config.ts` |
| main | esbuild（通过 `scripts/build.js` 调用） | 无独立配置，脚本内联 |
| shared | tsc | `packages/shared/tsconfig.json` |

问题：
- main 的 tsconfig 写 `moduleResolution: "node"` 但 esbuild 实际按 `"bundler"` 处理
- 开发时 `pnpm dev` 调用 `scripts/build.js --dev`，无法利用 Vite HMR
- 三套体系维护成本高

### 方案

引入 `vite-plugin-electron`，统一三包到 Vite。

#### 新增依赖

```json
// devDependencies
{
  "vite-plugin-electron": "^0.28.0",
  "vite-plugin-electron-renderer": "^0.14.0"
}
```

#### 根目录 vite.config.ts（新增）

```typescript
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'packages/main/src/index.ts',
        vite: {
          build: {
            outDir: 'packages/main/dist',
            rollupOptions: {
              external: ['electron', 'node-pty', 'serialport', 'ssh2', 'ftp-srv'],
            },
          },
        },
      },
      {
        entry: 'packages/main/src/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'packages/main/dist',
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'packages/renderer/src'),
    },
  },
});
```

#### 统一 tsconfig

删除 `packages/main/tsconfig.json` 中对 `moduleResolution` 的覆盖，统一使用根 `tsconfig.base.json` 的 `"bundler"`。

#### 简化 package.json scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "pnpm run build:shared && vite build",
    "build:shared": "pnpm --filter @qserial/shared build",
    "start": "electron .",
    "package": "pnpm build && electron-builder -c electron-builder.config.cjs"
  }
}
```

删除：
- `scripts/build.js`（不再需要）
- `dev:main` / `dev:renderer`（统一到 `dev`）
- `build:main` / `build:renderer`（统一到 `build`）

### 验证标准

- [ ] `pnpm dev` 一键启动 main + renderer
- [ ] renderer 有 HMR 热更新
- [ ] main 进程修改后自动重启
- [ ] `pnpm build` 构建产物与之前一致
- [ ] 打包流程不受影响

---

## 2.3 移除废弃代码

### 清理清单

| 文件 | 操作 | 原因 |
|------|------|------|
| `packages/main/src/connection/serialServer.ts` | 删除 | 已被 connectionServer.ts 替代 |
| `packages/shared/src/types/connection.ts` 中 `SerialServerOptions` | 删除 | 对应类型 |
| `packages/shared/src/types/connection.ts` 中 `ConnectionType.SERIAL_SERVER` | 标记 @deprecated 或删除 | 枚举值 |
| `connection/index.ts` 中 `SerialServerConnection` export | 删除 | 不再暴露 |

### 影响范围检查

```bash
# 确认无其他文件引用 serialServer
rg "serialServer|SerialServer" packages/ --include "*.ts" --include "*.tsx"
```

如果 renderer 中有创建该类型连接的入口，需同步移除 UI 选项。

### 验证标准

- [ ] `rg serialServer` 无引用（除 docs/optimization 文档外）
- [ ] 所有连接类型测试通过
