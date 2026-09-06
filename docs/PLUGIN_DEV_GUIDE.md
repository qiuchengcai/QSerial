# QSerial 插件开发指南（Plugin Development Guide）

本文档面向第三方开发者，介绍 QSerial 插件系统的目录结构、清单规范、宿主 API、生命周期与安全最佳实践。

## 1. 概览

QSerial 插件系统是一套**轻量、可扩展**的增量能力框架。插件运行在**主进程**，通过宿主暴露的**受限 API（`ctx`）**访问宿主能力，**不直接接触 Node.js 原生模块**（`fs` / `net` / `child_process` 等）。

两个内置范例插件：

- `qserial-plugin-device-profiles` — 设备识别规则插件（声明 `device:register` 权限）
- `qserial-plugin-example-mcp-tool` — 自定义 MCP 工具插件（声明 `mcp:register` + `connection:read` 权限）

## 2. 插件目录结构与 `package.json` 规范

```
plugins/
└── my-plugin/
    ├── package.json    # 插件清单
    └── index.mjs       # 入口（ESM，导出 activate / deactivate）
```

`package.json` 规范：

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "插件描述",
  "main": "index.mjs",
  "qserial": {
    "id": "my-plugin",
    "permissions": ["device:register"],
    "builtin": false
  }
}
```

字段说明：

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | ✅ | 插件名（`qserial.id` 缺失时作为插件 id） |
| `version` | ✅ | 语义化版本号 |
| `author` | ❌ | 作者 |
| `description` | ❌ | 描述（优先读取 `qserial.description`） |
| `main` | ✅ | 入口文件（相对插件目录，ESM）。缺省为纯声明式插件（当前仅支持程序式插件） |
| `qserial.id` | ❌ | 唯一标识，缺省回退到 `name` |
| `qserial.permissions` | ✅ | 权限声明数组（见 §4） |
| `qserial.builtin` | ❌ | 是否内置插件（内置插件默认启用） |

插件搜索目录：

1. 应用内置目录：`<app>/plugins/`（开发时即仓库根目录 `plugins/`）
2. 用户目录：`<userData>/plugins/`

## 3. 生命周期

```js
export async function activate(ctx) {
  // 插件启用时调用，ctx 为受限宿主 API
  // 在此注册贡献：设备规则 / MCP 工具 / 快捷按钮 / UI 入口等
}

export function deactivate() {
  // 插件停用时调用；贡献由宿主自动回收，通常无需手动清理
}
```

- `activate(ctx)`：启用时调用一次。抛出异常会导致插件进入 `error` 状态，但**不影响主程序与其他插件**。
- `deactivate()`：停用时调用，随后宿主自动回收该插件注册的全部贡献。

## 4. 权限系统

插件在 `qserial.permissions` 中声明所需能力。**未声明的能力在运行时调用会抛出 `PluginPermissionError`**。

| 权限 | 对应 `ctx` 域 | 能力 |
|------|--------------|------|
| `connection:read` | `ctx.connection.list/state/onData/onStateChange` | 读取连接列表、状态、订阅数据 |
| `connection:write` | `ctx.connection.send` | 向指定连接发送数据 |
| `terminal:write` | `ctx.terminal.*` | 注册输出过滤器 / 快捷按钮 / 终端命令 |
| `mcp:register` | `ctx.mcp.registerTool` | 注册自定义 MCP 工具 |
| `config` | `ctx.config.*` | 读写插件自身命名空间配置（隔离存储） |
| `device:register` | `ctx.device.registerProfiles` | 注册设备识别规则 |
| `ui` | `ctx.ui.contribute` | 注入 UI 入口 |
| `log` | `ctx.log.*` | 日志（当前 `log` 域默认可用） |

## 5. 宿主 API 参考

`activate(ctx)` 收到的 `ctx` 结构如下（按权限裁剪）：

```js
ctx = {
  id, name, version,                 // 插件身份
  log: { info, warn, error },        // 日志
  config: { get, set, delete },      // 需 config 权限；key 自动加插件命名空间前缀
  connection: {                      // 需 connection:read / connection:write
    list(): Array<{id,type,name,state}>,
    state(id): string,
    send(id, data): void,            // 需 connection:write
    onData(id, cb): unsubscribe,
    onStateChange(id, cb): unsubscribe,
  },
  terminal: {                        // 需 terminal:write
    registerOutputFilter({id, filter}),
    registerQuickButtons(buttons),
    registerCommand(name, handler),
  },
  mcp: {                             // 需 mcp:register
    registerTool({name, description, inputSchema}, handler),
  },
  device: {                          // 需 device:register
    registerProfiles([{name, patterns, baud_hint}]),
  },
  ui: {                              // 需 ui
    contribute([{id, label, kind}]), // kind: 'sidebar' | 'setting' | 'contextMenu'
  },
};
```

### 5.1 注册设备识别规则

```js
export async function activate(ctx) {
  ctx.device.registerProfiles([
    { name: 'MyBoard', patterns: ['MyBoard', 'my-board-v2'], baud_hint: 115200 },
  ]);
}
```

注册后 `conn.analyze.probe` 会自动纳入这些规则参与设备探测匹配。

### 5.2 注册自定义 MCP 工具

```js
export async function activate(ctx) {
  ctx.mcp.registerTool(
    {
      name: 'conn.analyze.custom',
      description: '自定义工具',
      inputSchema: { type: 'object', properties: {} },
    },
    async (args) => JSON.stringify({ ok: true })
  );
}
```

插件注册的 MCP 工具**自动纳入现有 `tools/list` 与 Bearer token 鉴权体系**，无需任何额外配置，也没有后门。

### 5.3 读写插件配置

```js
export async function activate(ctx) {
  ctx.config.set('lastRun', Date.now());
  const v = ctx.config.get('lastRun');
}
```

配置通过 `config:get/set/delete` 通道持久化，键会自动加上 `plugins.namespace.<pluginId>.` 前缀，实现插件间隔离（不可访问全局或其他插件配置）。

## 6. 安全最佳实践

1. **权限最小化**：只声明插件真正需要的能力，避免宽泛权限。
2. **不要阻塞主线程**：`activate` / MCP 工具 handler 中的耗时操作（网络、大文件）应异步化，避免阻塞主进程导致 UI 卡顿。
3. **不使用 `eval` / `new Function`**：宿主加载器使用 `import()` 加载插件入口，插件代码中不应自行执行动态代码。
4. **不直接访问 Node 原生模块**：所有 I/O 一律走 `ctx` 宿主 API。插件运行在宿主进程，直接 `import 'node:fs'` 虽在技术上可行，但会绕过权限体系，属于违规用法。
5. **异常处理**：`activate` / handler 抛错会被宿主捕获并隔离（进入 `error` 状态），但建议插件自身做好防御性处理，避免污染日志。
6. **贡献回收**：停用插件时宿主自动调用 `deactivate()` 并回收贡献；如插件在 `activate` 内注册了定时器/监听器，请在 `deactivate` 中清理。

## 7. 安装与启用

- 将插件目录放入 `plugins/`（或用户数据目录的 `plugins/`），重启应用后生效（加载时机为应用启动）。
- 在「设置 → 插件」页可查看已安装插件、切换启用/禁用（**即时生效，无需重启**）、查看权限声明。
- 启用/禁用会实时同步到侧边栏 / 快捷按钮 / MCP 工具列表。
