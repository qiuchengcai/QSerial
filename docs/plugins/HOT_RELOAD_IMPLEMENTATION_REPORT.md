# QSerial 插件系统 — 运行时热加载与安装/卸载 实现报告

- **日期**：2026-09-06
- **基线**：插件系统核心已就绪（commit 5d09446 + 4e243d2）
- **执行方式**：单轮闭环（勘察 → 拍板 → 编码 → 测试 → 交付）

---

## 一、勘察核实（含偏差修正）

| 描述 | 核实结果 |
|---|---|
| PluginManager 位于 `packages/main/src/plugins/manager.ts` | ✅ 一致（`PluginManagerImpl`） |
| 启动 `loadAll()` 一次性扫描（`main/src/index.ts`） | ✅ 一致 |
| 内置插件目录经 `import.meta.url` 上溯 + 多候选 | ✅ 一致（`collectSearchPaths`） |
| 热启用/禁用 `setEnabled` + `removeAllContributions` 精确回收 | ✅ 一致 |
| IPC `PLUGIN_LIST/SET_ENABLED/CHANGED` | ✅ 一致 |
| 渲染层 `stores/plugins.ts` + SettingsDialog 插件 Tab | ✅ 一致 |
| 注册表已接 MCP 工具/设备识别 | ✅ 一致 |

**⚠️ 偏差修正（本次发现并修复）**：基线实现中 `PluginManager` 的启用/禁用状态**并未真正持久化** —— `PluginManagerOptions`（`getEnabledState`/`setEnabledState`）在 `main/src/index.ts` 中从未被 `configure()` 注入，导致默认走 `isEnabledByDefault` 且 `persistEnabled` 为空操作。本次在 manager 内部补齐了基于 `ConfigManager` 的默认持久化（`plugins.enabled.<id>`），安装/卸载/热重载才具备正确语义。

**选型**：目录监听采用 **`fs.watch(recursive:true)`** 而非 chokidar。理由：①零新增依赖（chokidar 3.6.0 仅为 vite 传递依赖，非 main 直接依赖，引入需改 lockfile 与 electron-builder 打包）；②项目 Node ≥ 20、Windows 优先，`fs.watch` recursive 在 Windows 稳定、Linux/macOS 自 Node 19.1 支持；③插件目录结构浅（`plugins/<id>/`），只需粗粒度"目录下发生变化"再增量重扫，无需 chokidar 的细粒度事件。

---

## 二、已完成（PR-101 ~ PR-106）

- [x] **PR-101 目录监听（热发现）**：`startWatcher/stopWatcher`（fs.watch recursive + 400ms 去抖）+ `syncFromDisk()`（新增→inactive、删除→移除、修改→重载保持启用态）；窗口显示后启动（`initBackgroundServices` 内）；`plugins.hotReload` 配置可关闭。
- [x] **PR-102 运行时安装**：`installPlugin(sourcePath)`（校验 manifest 合法 + id 不重复 → 复制到用户目录 → 加载为**默认禁用**）；IPC `PLUGIN_INSTALL`；UI 顶部「安装插件」按钮（复用 `dialog:pickDir`）。
- [x] **PR-103 运行时卸载**：`uninstallPlugin(id, confirm)`（**confirm 缺失拒绝**、内置禁止 → 停用 → 移除 → 删目录，仅删用户目录）；IPC `PLUGIN_UNINSTALL`；非内置卡片「卸载」+ 二次确认。
- [x] **PR-104 手动刷新**：`rescan()`（新增 inactive / 移除，不重复加载已有）；IPC `PLUGIN_RESCAN`；UI「刷新」按钮。
- [x] **PR-105 状态扩展**：`PluginStatus` 新增 `installing/uninstalling/updating`；卸载/重载过程设置瞬时状态并经 `PLUGINS_CHANGED` 推送；error 状态展示错误摘要。
- [x] **PR-106 设置页 UI 完善**：顶部操作区（安装+刷新）；内置仅开关、用户插件开关+卸载；`busy`/`pendingId` 防重复点击 + loading 态；错误横幅。

---

## 三、关键决策及理由

1. **目录监听选型**：`fs.watch`（理由见 §一选型），chokidar 列为备选（若未来需跨平台原子写/编辑器兼容再切换）。
2. **变更推送统一化**：所有插件变更（含 watcher 触发的热重载）统一由 `PluginManager.onChange` 监听器在 `main/src/index.ts` 集中 `webContents.send(PLUGINS_CHANGED)`；IPC handler 只调用 manager 方法返回列表，不再各自手动推送 —— 避免"handler 手动推 + 中央推"双推送与遗漏。
3. **重载缓存失效**：`PluginRuntime.importVersion` 递增 + `import(url + '?v=' + n)` 使 ESM 缓存失效（生产 Electron/Node 下生效，加载新代码）。**注意**：vitest 的模块运行器不识别 query 缓存失效，故单测仅断言"签名变化→停用→重激活→importVersion 递增"闭环，不断言新代码执行结果（已注释说明）。
4. **变更检测签名**：`JSON({version,main,permissions,builtin}) + 入口 mtime`。仅入口/清单变化触发重载，避免无关文件变化抖动。
5. **安装默认禁用 + 内置目录只读**：安装后 `enabled=false` 且清空持久化启用状态；卸载仅 `fs.rm` 用户目录下的路径（`resolveUserPluginsDir` 前缀判定），内置插件 `builtin:true` 直接拒绝。
6. **默认持久化补齐**：manager 内部以 `ConfigManager` 为默认 `get/set/clearEnabledState` + `hotReload` 配置源，`configure()` 仅在测试注入。

---

## 四、改动文件清单

**修改（主进程）**
- `packages/main/src/plugins/manager.ts` — 核心扩展（持久化默认、install/uninstall/rescan/syncFromDisk/reload、startWatcher/stopWatcher、签名/importVersion、瞬时状态）
- `packages/main/src/plugins/types.ts` — `PluginRuntime` 增 `importVersion/signature`；`PluginManagerOptions` 增 `userPluginsDir/clearEnabledState/hotReload`
- `packages/main/src/ipc/handlers.ts` — `PLUGIN_INSTALL/UNINSTALL/RESCAN` handler；移除 `setEnabled` 手动推送
- `packages/main/src/index.ts` — 中央 `onChange` 推送 + `startWatcher` + 引入 `IPC_CHANNELS`
- `packages/main/src/preload.ts` — 暴露 `install/uninstall/rescan`

**修改（共享）**
- `packages/shared/src/types/plugin.ts` — `PluginStatus` 增 `installing/uninstalling/updating`
- `packages/shared/src/types/ipc.ts` — 增 `PLUGIN_INSTALL/UNINSTALL/RESCAN` 通道 + 请求/响应映射

**修改（渲染进程）**
- `packages/renderer/src/stores/plugins.ts` — `install/uninstall/rescan` + `busy/pendingId/error` 状态
- `packages/renderer/src/components/dialogs/SettingsDialog.tsx` — 顶部操作区 + 卸载按钮/二次确认 + loading/错误展示
- `packages/renderer/src/types/global.d.ts` — plugin API 增 `install/uninstall/rescan`
- `packages/renderer/src/i18n/locales/{zh-CN,en-US}.json` — 增插件安装/刷新/卸载/确认/处理中文案

**新增（测试 / 文档）**
- `packages/main/__tests__/plugins/hotreload.test.ts` — 10 用例
- `docs/plugins/HOT_RELOAD_IMPLEMENTATION_REPORT.md`（本文件）

---

## 五、测试结果

- 新增 `hotreload.test.ts` **10 用例**：安装（复制+默认禁用 / 重复 id / 非法清单）、卸载（无 confirm 拒绝 / 内置拒绝 / 成功删目录+清贡献）、重扫（新增 inactive + 移除 + 不重复加载 / 不变则不重载）、磁盘同步（修改重载保持启用态 deactivate→reactivate / 新增 inactive）。
- 全量回归：**21 套件 / 234 用例全部通过**（基线 224，净增 10）。
- 构建：`shared` + `main`（tsc + esbuild preload）+ `renderer`（vite）三包通过；eslint 0 error；prettier 已格式化。

---

## 六、遗留风险

1. **缓存失效在测试环境不可观测**：`?v=n` 重载新代码依赖 Node/Electron 原生 ESM，vitest 下无法断言"新代码执行结果"（单测退化为断言重载闭环）。生产环境行为待 E2E 验证。
2. **fs.watch 平台差异**：Linux/macOS `recursive` 依赖 Node ≥ 19.1（项目要求 ≥ 20，满足）；编辑器的原子写（rename 替换）可能产生瞬时抖动，已用 400ms 去抖缓解，极端情况可能漏一次重载（可手动「刷新」）。
3. **安装目录名按 `manifest.id`**：同一 id 不同目录名会被视为重复；不校验插件内容签名（信任用户选择）。
4. **asar 内置目录不可 watch**：生产打包下内置目录在 asar 内，`fs.watch` 会静默失败（`on('error')` 忽略），仅用户目录热加载可用 —— 符合预期（内置目录只读）。
5. **安装/卸载为同步文件操作**：`fs.cpSync`/`fs.rmSync` 对小型插件目录开销可忽略，超大目录可能短暂阻塞主进程（可后续改异步/流式）。
6. **瞬时状态展示窗口短**：`installing/uninstalling/updating` 是主进程内存态，多数场景渲染层通过 `busy/pendingId` 本地态感知；瞬时状态主要用于完整性/日志。

---

## 七、下一步建议

1. E2E 验证：目录新增/删除/修改、安装/卸载、刷新、错误路径的 GUI 完整流程。
2. 若需更强跨平台可靠性，评估引入 chokidar（main 直接依赖 + electron-builder 排除 dev 依赖）。
3. 安装安全增强：插件清单签名校验 / 来源提示 / 权限确认弹窗。
4. 文件操作异步化（`fs.cp`/`fs.rm` promise 版 + 进度），避免大目录阻塞。
5. 修改检测粒度细化：监听入口文件 `mtime` 之外，纳入目录内全部文件（`content hash`）可选。

---

## 八、验收对照表

| 需求编号 | 需求简述 | 实现状态 | 验证方式 |
|---|---|---|---|
| PR-101 | 目录监听（热发现） | ✅ | `startWatcher` + `syncFromDisk`；`hotreload.test.ts` 覆盖新增/删除/修改重载；`plugins.hotReload` 可关闭 |
| PR-102 | 运行时安装 API + UI | ✅ | `installPlugin`（校验/复制/默认禁用）；IPC `PLUGIN_INSTALL`；UI「安装插件」；测试覆盖重复/非法清单 |
| PR-103 | 运行时卸载 API + UI | ✅ | `uninstallPlugin`（confirm 必需、内置禁止、删目录）；IPC `PLUGIN_UNINSTALL`；UI「卸载」+ 二次确认；测试覆盖三场景 |
| PR-104 | 手动刷新 | ✅ | `rescan()`（新增 inactive / 移除、不重复加载）；IPC `PLUGIN_RESCAN`；UI「刷新」；测试覆盖 |
| PR-105 | 状态扩展 | ✅ | `PluginStatus` 增 3 瞬时状态；卸载/重载设瞬时态并经 `PLUGINS_CHANGED` 推送；error 展示摘要 |
| PR-106 | 设置页 UI 完善 | ✅ | 顶部操作区；内置仅开关/用户开关+卸载；`busy/pendingId` 防重复点击 + loading + 错误横幅 |

### 待用户验证（E2E GUI）

1. 设置 → 插件 Tab：顶部出现「安装插件」「刷新」；内置插件卡片仅开关，用户插件卡片有「卸载」。
2. 「安装插件」→ 选一个含合法 `package.json` 的插件目录 → 列表新增（默认停用，需手动开启）；选非法目录 → 显示错误。
3. 用户插件「卸载」→ 二次确认 → 卡片消失，磁盘目录被删除；取消 → 无变化。
4. 手动向用户插件目录复制一个新插件目录 → 无需重启，稍候（<1s）自动出现在列表（停用态）；删除该目录 → 自动从列表消失。
5. 修改某已启用插件的入口文件 → 自动重载（状态保持启用）；「刷新」按钮立即重扫。
6. 内置插件（设备识别）无卸载按钮，且其开关可正常切换（持久化到下次启动）。

> 用户插件目录位置：Windows 为 `%APPDATA%/QSerial/plugins/`（`app.getPath('userData')/plugins`）。
