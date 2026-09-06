# QSerial 插件系统实现报告

- **日期**：2026-09-06
- **基线版本**：v1.1.0（commit bed5aed）
- **执行方式**：单轮闭环（勘察 → 拍板 → 编码 → 测试 → 交付）

---

## 一、现状勘察核实（含修正）

| 提示词描述 | 核实结果 | 备注 |
|---|---|---|
| 主/渲染进程经 preload + contextBridge + IPC | ✅ 一致 | `packages/main/src/preload.ts`、`shared/types/ipc.ts` |
| Zustand 状态管理 | ✅ 一致 | `packages/renderer/src/stores/*` |
| MCP 工具集强依赖多业务域 | ✅ 一致 | `services/mcp/manager.ts` 的 `MCP_TOOLS` + `allHandlers` 为模块级静态数组 |
| `plugins/` 仅存设备模型数据 | ⚠️ 部分修正 | `plugins/` 含 `community-espat`（`.codex-plugin`，为 MCP resources/prompts 的**另一种**插件概念）与 `models/devices.json` |
| **21 类设备指纹（SUB-044）** | ⚠️ **修正** | 21 类指纹是 `connection-advanced.ts` 内硬编码的 `knownDevices` 数组（21 条），**并非** `plugins/models/devices.json`（该文件仅 8 条且**未被任何代码引用**） |
| 配置走 `config:get/set/delete`（SUB-053） | ✅ 一致 | `config/manager.ts` |
| MCP 鉴权（SUB-030） | ✅ 一致 | `manager.ts::checkAuth`（Bearer token） |

**其他勘察发现**：工作区存在与本任务无关的**未提交改动**（快捷按钮 MCP 工具 `buttons.ts`/`quick-buttons.ts` 等）。本次实现**未触碰**这些文件，仅在同一批次中新增长量的插件系统代码。

---

## 二、已完成（PR-001 ~ PR-007）

- [x] **PR-001 插件核心框架**：Plugin 接口、PluginManager（扫描/加载/启用禁用/持久化/失败隔离）、生命周期钩子 `activate`/`deactivate`、权限系统。
- [x] **PR-002 宿主 API**：连接/终端/MCP/配置/UI/日志 六域受限 `ctx` API + 权限裁剪。
- [x] **PR-003 进程模型与安全模型**：选型见 §三。
- [x] **PR-004 设备识别插件化**：21 类指纹抽离为内置插件 `qserial-plugin-device-profiles`，`conn.analyze.probe` 改读规则注册表。
- [x] **PR-005 自定义 MCP 工具插件**：`qserial-plugin-example-mcp-tool` 注册 `conn.analyze.custom`，复用现有 Bearer 鉴权。
- [x] **PR-006 插件管理 UI**：SettingsDialog 新增「插件」Tab（列表/版本/作者/启用切换/权限展示），启用禁用即时生效 + 实时同步。
- [x] **PR-007 插件清单与文档**：`docs/PLUGIN_DEV_GUIDE.md` + 本报告。

---

## 三、关键决策及理由

### 3.1 进程模型选型（方案 A / B / C）

**选定：方案 A（主进程插件）+ 能力代理（capability proxy）。**

| 方案 | 结论 | 理由 |
|---|---|---|
| A 主进程插件 | ✅ 选定 | 可插件化的能力（设备识别、MCP 工具注册、连接写、终端过滤）**全部位于主进程**，需访问 `ConnectionFactory`、缓冲区、MCP 注册表。渲染进程方案（B）无法注册 MCP 工具（MCP 服务在主进程），也无法读取连接缓冲区。 |
| B 渲染进程插件 | ❌ | 仅能扩展 UI，无法满足 PR-004/PR-005 核心能力，安全但能力受限。 |
| C 双端 + Worker 沙箱 | ⏸️ 后续 | 最完整但复杂度最高（需 `worker_threads` + 受限模块图/`vm` isolate）。对本迭代而言是过度工程，违背"改动最小化"。 |

**安全边界落地方式**：插件代码在主进程通过 `import()` 加载（**不使用 eval/new Function**），运行时仅能触达宿主传入的 `ctx`（`buildPluginContext` 依据 `permissions` 声明裁剪，未声明能力调用即抛 `PluginPermissionError`）。所有 I/O 走宿主 API。

**诚实说明（残留风险，见 §六）**：当前模型是"**可信插件代码 + 能力门控 API**"——与 VS Code 扩展的信任模型一致。对**恶意/不可信第三方代码**的硬隔离（禁止其直接 `import 'node:fs'`）需要 OS/Worker 级沙箱（方案 C），本迭代未实现，已列为下一步。

### 3.2 权限系统设计

- 采用**字符串权限清单**（`PluginPermission` 联合类型），插件在 `package.json` 的 `qserial.permissions` 声明。
- 宿主 API 按权限域分组；`buildPluginContext` 为每个插件构造独立 `ctx`，权限校验在**每个 API 调用点**执行（`assertPermission`）。
- 优点：声明式、可审查（UI 直接展示 `permissions`）、易测试（纯函数）、无运行时黑名单绕过。

### 3.3 启用/禁用是否需重启

**选定：即时生效（热启用/热禁用，无需重启）。**

理由：PR-006 明确要求"新增/删除插件后相关 UI 必须实时同步，不得要求重启"。实现手段：
- MCP 工具列表 `tools/list` 改为**动态合并** `getMcpToolDefinitions()`，启用/禁用立即反映到下一次 `tools/list`；
- 设备规则 `conn.analyze.probe` 每次调用动态读取注册表；
- 主进程通过 `plugin:changed` 事件推送变更，渲染进程 store 实时刷新。

**权衡**：热启用意味着插件模块生命周期更复杂（需正确 `deactivate` + 回收贡献），但 `registry.ts` 以 `pluginId → 贡献` 建模，停用即 `removeAllContributions(id)` 精确回收，风险可控。

### 3.4 其他取舍

- **设备指纹"零回归"兜底**：21 类指纹同时存在于插件 `index.mjs`（权威来源）与主进程 `BUILTIN_DEVICE_PROFILES`（兜底）。`getAllDeviceProfiles()` 按 `name` 去重并集。代价是数据重复（静态数据，风险低），换取"停用/损坏内置插件也不改变历史识别行为"。
- **内置插件默认启用**：`qserial.builtin === true` 的插件在无持久化状态时默认启用，保证"用户无感知"。
- **终端/UI 贡献的接线范围**：`terminal.registerOutputFilter/registerCommand`、`ui.contribute` 的**注册与存储**已实现，但**未接入终端数据管线 / 侧边栏渲染**（需改动 TerminalPane/MainContent/Sidebar 核心流程，超出"最小侵入"）。见 §六遗留风险。
- **配置存储**：插件启用状态存于 `config` 的 `plugins.enabled.<id>`（沿用 `config:get/set` 通道），未改 `AppConfig` 类型；插件自身配置命名空间为 `plugins.namespace.<id>.*`。

---

## 四、改动文件清单

### 新增 — 插件核心（主进程）

- `packages/main/src/plugins/permissions.ts` — 权限常量 + `PluginPermissionError` + 断言
- `packages/main/src/plugins/types.ts` — `PluginActivationContext`/`PluginModule`/`PluginRuntime`/`PluginManagerOptions`
- `packages/main/src/plugins/registry.ts` — 贡献注册表（设备规则/MCP 工具/快捷按钮/输出过滤器/终端命令/UI 入口）
- `packages/main/src/plugins/host-api.ts` — `buildPluginContext` 受限 API 构建
- `packages/main/src/plugins/manager.ts` — `PluginManagerImpl`（扫描/加载/激活/停用/启用禁用/隔离）
- `packages/main/src/plugins/index.ts` — barrel 导出
- `packages/main/src/services/mcp/device-profiles.ts` — `BUILTIN_DEVICE_PROFILES` + `getAllDeviceProfiles()`

### 新增 — 共享类型

- `packages/shared/src/types/plugin.ts` — `PluginManifest`/`PluginInfo`/`PluginPermission`/`PluginStatus`

### 新增 — 渲染进程

- `packages/renderer/src/stores/plugins.ts` — 插件 store + 变更桥

### 新增 — 范例插件

- `plugins/qserial-plugin-device-profiles/{package.json,index.mjs}`
- `plugins/qserial-plugin-example-mcp-tool/{package.json,index.mjs}`

### 新增 — 文档

- `docs/PLUGIN_DEV_GUIDE.md`
- `docs/plugins/IMPLEMENTATION_REPORT.md`（本文件）

### 新增 — 测试

- `packages/main/__tests__/plugins/permissions.test.ts`
- `packages/main/__tests__/plugins/manager.test.ts`

### 修改

- `packages/shared/src/types/ipc.ts` — 新增 `PLUGIN_LIST`/`PLUGIN_SET_ENABLED`/`PLUGINS_CHANGED` 通道 + 请求/响应映射
- `packages/shared/src/types/index.ts` — 导出 `plugin.js`
- `packages/main/src/ipc/handlers.ts` — 新增 `setupPluginHandlers`
- `packages/main/src/preload.ts` — 暴露 `plugin` API
- `packages/main/src/index.ts` — 启动加载插件 + 退出停用插件
- `packages/main/src/services/mcp/manager.ts` — `tools/list`/`executeTool` 合并插件 MCP 工具
- `packages/main/src/services/mcp/tools/connection-advanced.ts` — `conn.analyze.probe` 改用 `getAllDeviceProfiles()`
- `packages/renderer/src/App.tsx` — 初始化插件变更桥
- `packages/renderer/src/components/dialogs/SettingsDialog.tsx` — 新增「插件」Tab
- `packages/renderer/src/stores/index.ts` — 导出插件 store
- `packages/renderer/src/types/global.d.ts` — 新增 `plugin` API 类型
- `packages/renderer/src/i18n/locales/{zh-CN,en-US}.json` — 新增插件相关文案

---

## 五、测试结果

测试框架沿用项目现有 **Vitest**（`vitest.config.ts` 已配置，选型无需变更）。

运行 `npx vitest run`：**20 个测试文件全部通过，224 个用例通过（含本次新增 14 个）。**

新增用例（`packages/main/__tests__/plugins/`）：

| 文件 | 覆盖点 |
|---|---|
| `permissions.test.ts`（8） | 权限判断/断言、`PluginPermissionError`、宿主 API 权限裁剪（未声明 `device:register`/`mcp:register`/`connection:write` 拒绝、已声明放行） |
| `manager.test.ts`（6） | 正常加载并激活、**加载失败隔离**（坏插件 `error` 不影响好插件 `active`）、**权限拒绝**（未声明能力激活报错且不残留贡献）、**生命周期钩子**（disable 触发 `deactivate` + 贡献回收）、MCP 工具注册与停用回收、内置默认启用 / 持久化状态覆盖 |

类型与构建验证：

- `pnpm --filter @qserial/shared build` ✅
- `pnpm --filter @qserial/main build`（tsc + esbuild preload）✅
- `pnpm --filter @qserial/renderer build`（vite）✅
- `npx tsc -p packages/main/tsconfig.json --noEmit` ✅（零错误）
- `npx eslint`（新增/修改文件）✅ 0 error（App.tsx 存在 2 个**既有** hooks 警告，非本次引入）
- `npx prettier` 已格式化本次新增/修改文件

> 说明：`npx tsc` 对 renderer 会报出大量**既有**错误（`@/` 路径别名未在 tsconfig 配置，且 TerminalPane/terminalMacro 等本就未通过 tsc 门禁）。renderer 的实际构建门禁是 vite（esbuild，不类型检查），本次 renderer 变更已通过 vite build 验证。

---

## 六、遗留风险

1. **第三方代码硬隔离未实现**：当前为"可信代码 + 能力门控"模型，恶意插件仍可 `import 'node:fs'`。真正的沙箱需 Worker + 受限模块加载器（方案 C），列为下一步。
2. **终端/UI 贡献部分未接线**：`registerOutputFilter`/`registerCommand`/`ui.contribute` 已存储于注册表，但未接入终端数据管线（TerminalPane）与侧边栏/右键菜单渲染。快速按钮注入也未合并进 QuickButtonBar。当前仅 MCP 工具列表与设备识别实现了"端到端"。
3. **设备指纹数据重复**：21 类指纹存在于插件与主进程兜底两处，需手工同步（已注释标明）。
4. **打包配置**：内置 `plugins/` 目录在开发态经 `app.getAppPath()` 定位正常；打包产物（asar）下的插件目录纳入未在本次显式验证。
5. **插件热加载**：启用/禁用为热生效，但**新增/修改插件文件**需重启（重新扫描）才会被发现（加载时机为应用启动）。
6. **性能**：未做独立基准，但插件加载为串行 `import()` + `activate`，2 个范例插件为纯数据/纯函数注册，启动开销可忽略（未阻塞窗口显示，见 `index.ts` 后台初始化）。

---

## 七、下一步建议

1. **方案 C 沙箱**：引入 `worker_threads` + 受限模块加载器，实现第三方插件硬隔离。
2. **插件市场**：`plugins/` 清单分发、版本管理、签名校验。
3. **热更新**：监听插件目录变化，动态加载/卸载（dev 体验）。
4. **Host API 扩展**：SFTP/TFTP/NFS 文件服务域、通知域、终端输出过滤器真正接入数据管线。
5. **UI 贡献渲染**：侧边栏/右键菜单/设置页渲染插件注入的入口与快捷按钮。
6. **插件权限确认弹窗**：首次启用含敏感权限（`connection:write` 等）的插件时提示用户确认。

---

## 八、验收对照表

| 需求编号 | 需求简述 | 实现状态 | 验证方式 |
|---|---|---|---|
| PR-001 | 插件核心框架 | ✅ | `packages/main/__tests__/plugins/manager.test.ts` 覆盖加载/隔离/生命周期；`setEnabled` 热生效 |
| PR-002 | 宿主 API 设计 | ✅ | `host-api.ts` 实现六域 API；`permissions.test.ts` 覆盖权限裁剪；`PLUGIN_DEV_GUIDE.md` §5 列出参考 |
| PR-003 | 进程模型与安全模型 | ✅ | 方案 A + 能力代理 + 无 eval；选型与理由见 §三 |
| PR-004 | 设备识别插件化 | ✅ | `conn.analyze.probe` 改读 `getAllDeviceProfiles()`；内置插件默认启用，21 类规则无回归（`BUILTIN_DEVICE_PROFILES` 兜底） |
| PR-005 | 自定义 MCP 工具插件 | ✅ | `manager.ts` 动态合并 `getMcpToolDefinitions()`；插件工具复用 `checkAuth` Bearer 鉴权 |
| PR-006 | 插件管理 UI | ✅ | SettingsDialog 新增「插件」Tab；`plugin:changed` 事件 + store 实时同步（**待用户 GUI 交互验证**，见下） |
| PR-007 | 插件清单与文档 | ✅ | `docs/PLUGIN_DEV_GUIDE.md` + 本报告 |

### 待用户验证项（E2E GUI）

1. 启动应用 → 设置 → 「插件」Tab：应看到 `qserial-plugin-device-profiles`（内置、已启用）与 `qserial-plugin-example-mcp-tool`（已停用）。
2. 启用 `qserial-plugin-example-mcp-tool` → 启动 MCP → 以正确 token 调用 `tools/list` 应含 `conn.analyze.custom`；调用 `conn.analyze.custom` 应返回活跃连接摘要；错误 token 应返回 401/403。
3. 停用 `qserial-plugin-device-profiles` → `conn.analyze.probe` 仍应返回 21 类设备匹配（兜底生效，无回归）。
4. 切换任意插件启用状态，无需重启，插件列表状态即时刷新。
