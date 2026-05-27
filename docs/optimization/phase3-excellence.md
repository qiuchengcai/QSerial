# 第三阶段：卓越（Excellence）

> 预计工时：4-8 周 | 目标：工程化完善 + 功能竞争力

---

## 3.1 CI/CD 流水线

### GitHub Actions 配置

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${"$"}{{ github.workflow }}-${"$"}{{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format --check

  test:
    needs: lint
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${"$"}{{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test -- --coverage
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-${"$"}{{ matrix.os }}
          path: coverage/

  build:
    needs: test
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${"$"}{{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm build:shared && pnpm build
```

### 验证标准

- [ ] PR 提交自动运行 lint + test + build
- [ ] 失败时 PR 被阻止合并
- [ ] 覆盖率报告自动上传

---

## 3.2 测试体系完善

### 目标分层

```
覆盖率目标：
├── packages/shared/    90%+   （纯类型/工具函数，易测）
├── packages/main/
│   ├── connection/     80%+   （核心逻辑，需 mock）
│   ├── mcp/            70%+   （工具 + 传输层）
│   ├── ftp/tftp/nfs/   50%+   （服务层）
│   └── ipc/            40%+   （通道注册）
└── packages/renderer/
    ├── stores/         70%+   （Zustand 状态流转）
    └── components/     30%+   （UI 交互，优先级低）
```

### 目录结构

```
packages/
├── main/
│   └── __tests__/
│       ├── connection/
│       │   ├── factory.test.ts
│       │   ├── pty.test.ts
│       │   ├── serial.test.ts
│       │   ├── ssh.test.ts
│       │   ├── telnet.test.ts
│       │   ├── serialServer.test.ts   # 若 2.3 已删则不需要
│       │   └── connectionServer.test.ts
│       ├── mcp/
│       │   ├── tools/
│       │   │   ├── connection.test.ts
│       │   │   ├── data.test.ts
│       │   │   ├── state.test.ts
│       │   │   └── xmodem.test.ts
│       │   └── transports.test.ts
│       ├── ftp/
│       │   └── manager.test.ts
│       ├── tftp/
│       │   └── manager.test.ts
│       ├── nfs/
│       │   └── manager.test.ts
│       └── config/
│           └── manager.test.ts
├── renderer/
│   └── __tests__/
│       └── stores/
│           ├── terminal.test.ts
│           ├── sessions.test.ts
│           ├── theme.test.ts
│           └── config.test.ts
└── shared/
    └── __tests__/
        ├── types/
        │   ├── connection.test.ts
        │   └── ipc.test.ts
        └── utils/
            └── buffer.test.ts
```

### vitest.config.ts 增强

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['packages/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/shared/src/**',
        'packages/main/src/**',
        'packages/renderer/src/stores/**',
      ],
      thresholds: {
        lines: 60,
        functions: 50,
        branches: 40,
        statements: 60,
      },
      reporter: ['text', 'lcov', 'html'],
    },
  },
});
```

### 验证标准

- [ ] `pnpm test` 全部通过
- [ ] 覆盖率达标（60% lines）
- [ ] CI 中自动运行并上传报告

---

## 3.3 架构微调

### services/ 目录重整

将分散在 `packages/main/src/` 下的服务模块收拢：

```
改造前：
packages/main/src/
├── config/
├── connection/
├── ftp/
├── ipc/
├── mcp/
├── nfs/
├── sftp/
├── tftp/
├── types/
├── utils/
├── index.ts
├── preload.ts
└── native-dialog.ts

改造后：
packages/main/src/
├── services/
│   ├── connection/    # 连接服务
│   ├── mcp/           # MCP 服务
│   ├── ftp/           # FTP 服务
│   ├── tftp/          # TFTP 服务
│   ├── nfs/           # NFS 服务
│   └── sftp/          # SFTP 服务
├── config/            # 配置管理（不是服务，保留）
├── ipc/               # IPC 桥接层
├── utils/
├── index.ts
├── preload.ts
└── native-dialog.ts
```

### 影响范围

变更涉及调整 import 路径，预估影响 20-30 个文件。可借助 IDE 的"移动文件"功能自动更新引用。

### 验证标准

- [ ] 所有 import 路径正确
- [ ] 构建通过
- [ ] 功能无回归

---

## 3.4 功能增强

### P1：SSH Jump Host（跳板机）

在 `SshConnectionOptions` 中新增：

```typescript
export interface SshJumpHost {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

export interface SshConnectionOptions extends BaseConnectionOptions {
  // ... 现有字段
  jumpHost?: SshJumpHost;   // 新增：跳板机配置
}
```

`ssh2` 库原生支持通过 `forwardOut` + `connect` 实现跳板机连接。

### P1：i18n 国际化

```bash
pnpm add react-i18next i18next
```

```
packages/renderer/src/
├── i18n/
│   ├── index.ts          # i18next 初始化
│   ├── locales/
│   │   ├── zh-CN.json    # 中文（默认）
│   │   └── en-US.json    # 英文
│   └── useTranslation.ts # 封装 hook
```

优先翻译：菜单栏、连接对话框、设置面板。

### P2：独立 SFTP 客户端

允许不建立 SSH 终端连接，仅通过 SFTP 协议连接远程主机：

```typescript
export interface SftpConnectionOptions extends BaseConnectionOptions {
  type: ConnectionType.SFTP;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}
```

复用现有 SFTP 浏览器 UI。

### P2：终端录屏回放

基于 xterm.js 的 `addon-serialize` + `addon-fit` 实现：

- 录制：将每次 `onData` 写入带时间戳的日志
- 回放：按时间戳顺序写入终端

### P3：插件系统

利用已预留的 `plugins/*` 目录：

```
plugins/
└── example-plugin/
    ├── package.json      # { "qserial-plugin": { "main": "dist/index.js" } }
    └── src/
        └── index.ts      # 导出 activate/deactivate
```

### P3：AI 辅助命令

在终端内提供 AI 命令建议：
- 快捷键唤起输入框，自然语言描述意图
- 调用 LLM API 生成命令
- 一键插入终端或直接执行

### 验证标准

- [ ] P1 功能完成且可正常使用
- [ ] P2 功能有 UI 入口且可演示
