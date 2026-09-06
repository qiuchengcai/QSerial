# QSerial 插件系统 — 插件详情页与插件配置面板 实现报告

- **日期**：2026-09-06
- **基线**：插件系统核心 + 热加载 + 安装/卸载 + 设置页列表 UI 已完成
- **执行方式**：单轮闭环（勘察 → 拍板 → 编码 → 测试 → 交付）

---

## 一、勘察核实（含偏差说明）

| 描述 | 核实结果 |
|---|---|
| 插件列表 UI `renderer/src/components/dialogs/SettingsDialog.tsx` 插件 Tab | ✅ 一致 |
| 插件 store `renderer/src/stores/plugins.ts` | ✅ 一致 |
| IPC `PLUGIN_LIST/SET_ENABLED/INSTALL/UNINSTALL/RESCAN/CHANGED` | ✅ 一致 |
| 共享类型 `shared/src/types/plugin.ts` | ✅ 一致 |
| 配置命名空间 `plugins.namespace.<id>.*` 已预留 | ✅ 一致（此前 `ctx.config` 仅 get/set/delete） |
| 权限系统 `main/src/plugins/permissions.ts` + `ctx.config` 受限 API | ✅ 一致 |

**偏差说明**：`PluginInfo` 原先不携带 `configSchema`，渲染进程无法得知插件的配置项声明。本次将 `configSchema` 纳入 `PluginInfo`（`manager.list()` 透出），使表单渲染无需额外 IPC 即可取到 schema。

---

## 二、已完成（PR-201 ~ PR-205）

- [x] **PR-201 配置 Schema 声明**：`PluginManifest.configSchema`（可选）+ `PluginConfigField`（key/label/type/default/description/required/options/min/max）+ 5 种类型（string/number/boolean/select/textarea）。类型定义在 `shared/src/types/plugin.ts`。
- [x] **PR-202 配置读写 API**：`ctx.config` 新增 `getAll()` / `onChange(cb)`；权限 `config` 下仅能读写自身命名空间；IPC `PLUGIN_CONFIG_GET/SET/CHANGED`。
- [x] **PR-203 插件详情弹窗**：`PluginDetailDialog.tsx`（基本信息/权限/操作区[启用·卸载·重载]/错误详情）。
- [x] **PR-204 配置面板**：详情弹窗内「配置」Tab，宿主按 schema 渲染 5 种表单控件；required/类型/范围校验；保存/恢复默认；无 schema 时 Tab 不显示。
- [x] **PR-205 store 扩展**：`selectedPluginId` / `pluginConfigs` / `selectPlugin/closePlugin/loadPluginConfig/setPluginConfig/reload`；`PLUGIN_CONFIG_CHANGED` 实时同步缓存。

---

## 三、关键决策及理由

1. **schema 字段类型取舍**：只做 5 种标量类型（string/number/boolean/select/textarea），不做嵌套对象/数组 —— 覆盖插件常见配置且表单复杂度可控，复杂结构留待扩展。
2. **配置变更通知机制（双层独立监听）**：
   - ① `host-api.ts` 内全局 `ConfigManager.onChange` 监听器 → 按 `plugins.namespace.<id>.` 前缀解析 pluginId 并分发到该插件的 `ctx.config.onChange` 回调（**插件侧实时响应**）；
   - ② `main/src/index.ts` 内另一条 `ConfigManager.onChange` 监听器 → 推送 `PLUGIN_CONFIG_CHANGED` 到渲染进程（**表单实时同步**）。
   - 职责分离、互不干扰；插件停用时 `removePluginConfigSubscriptions(id)` 清理订阅。
3. **权限隔离靠命名空间前缀**：`ctx.config` 强制加 `plugins.namespace.<id>.` 前缀，`ConfigManager` 的点路径按字面分段（无 `..` 穿越），越界天然不可达；渲染进程 IPC `PLUGIN_CONFIG_GET/SET` 亦同前缀，无需额外校验即结构化隔离。
4. **configSchema 纳入 PluginInfo**：schema 是序列化声明数据，随 `plugin:list` 下发，渲染层零额外请求即可渲染表单。
5. **保存语义**：逐字段 diff 后 `PLUGIN_CONFIG_SET` 写入（与需求"SET 按 key"一致），避免全量覆盖；「恢复默认」用 `getDefaultConfig` 生成默认值并写回。

---

## 四、改动文件清单

**新增**
- `packages/shared/src/utils/plugin-config.ts` — `getDefaultConfig` + `validatePluginConfig`（错误码 required/not-a-number/min/max/invalid-option）
- `packages/renderer/src/components/dialogs/PluginDetailDialog.tsx` — 详情弹窗 + 配置表单
- `packages/shared/__tests__/utils/plugin-config.test.ts`（9 用例）
- `packages/main/__tests__/plugins/config.test.ts`（5 用例）
- `docs/plugins/PLUGIN_CONFIG_IMPLEMENTATION_REPORT.md`（本文件）

**修改**
- `packages/shared/src/types/plugin.ts` — `PluginConfigFieldType/Field/Schema`；`PluginManifest.configSchema`；`PluginInfo.configSchema`
- `packages/shared/src/types/ipc.ts` — `PLUGIN_RELOAD/CONFIG_GET/CONFIG_SET/CONFIG_CHANGED` 通道 + 映射
- `packages/shared/src/utils/index.ts` — 导出 plugin-config
- `packages/main/src/plugins/types.ts` — `ctx.config` 增 `getAll/onChange`
- `packages/main/src/plugins/host-api.ts` — 实现 `getAll/onChange` + 全局变更分发 + `removePluginConfigSubscriptions`
- `packages/main/src/plugins/manager.ts` — `reloadPlugin(id)`；停用时清理配置订阅；`list()` 透出 `configSchema`
- `packages/main/src/ipc/handlers.ts` — `PLUGIN_RELOAD/CONFIG_GET/CONFIG_SET` handler
- `packages/main/src/index.ts` — 中央 `PLUGIN_CONFIG_CHANGED` 推送
- `packages/main/src/preload.ts` — `reload/configGet/configSet/onConfigChanged`
- `packages/renderer/src/types/global.d.ts` — plugin API 增相应方法
- `packages/renderer/src/stores/plugins.ts` — 详情/配置缓存/重载/config changed 桥
- `packages/renderer/src/components/dialogs/SettingsDialog.tsx` — 卡片「详情」入口 + 挂载详情弹窗
- `packages/renderer/src/i18n/locales/{zh-CN,en-US}.json` — `dialogs.pluginDetail.*` 文案

---

## 五、测试结果

- 新增 14 用例：`plugin-config.test.ts`(9，getDefaultConfig + validatePluginConfig 全分支)、`config.test.ts`(5，命名空间隔离 / 越权拒绝 / onChange 通知+退订 / reloadPlugin 重载+未知 id 抛错)。
- 全量回归：**23 套件 / 248 用例全部通过**（基线 234，净增 14）。
- 构建：`shared` + `main`（tsc + esbuild preload）+ `renderer`（vite）三包通过；eslint 0 error；prettier 已格式化。

---

## 六、遗留风险

1. **configSchema 由插件声明但未做宿主侧深度校验**：非法 schema（如缺失 key/label）会导致表单渲染异常，目前仅在渲染层防御。可加 `validateConfigSchema` 兜底（后续）。
2. **配置变更去抖缺失**：连续 set 多次会触发多次 `PLUGIN_CONFIG_CHANGED`/`onChange`，对高频写场景有轻微开销（当前表单逐字段保存，可接受）。
3. **`ctx.config.delete` 不触发变更通知**：`ConfigManager.delete` 不 emit change，插件删键不会推送 `PLUGIN_CONFIG_CHANGED`（插件侧 onChange 也不触发）。当前表单用 set 写值、恢复默认用 set 覆盖，规避了该路径。
4. **select 值类型仅字符串**：`options[].value` 为字符串；若插件需要数值型枚举需自行在 activate 内转换。
5. **配置无版本迁移**：schema 变更（增删字段）后旧配置残留未自动清理/迁移。

---

## 七、下一步建议

1. 增加 `validateConfigSchema`（宿主侧 schema 合法性校验）。
2. `ConfigManager.delete` 增加 change 事件，使 `ctx.config.delete` 也能实时通知。
3. 配置字段类型扩展（数组、对象、文件路径选择器等）。
4. 配置版本/迁移机制。
5. 详情弹窗增加「插件目录路径 / 入口文件 / 加载耗时」等诊断信息。

---

## 八、验收对照表

| 需求编号 | 需求简述 | 实现状态 | 验证方式 |
|---|---|---|---|
| PR-201 | 配置 Schema 声明 | ✅ | `shared/types/plugin.ts` 定义 5 类型；`plugin-config.test.ts` 覆盖校验 |
| PR-202 | 配置读写 API | ✅ | `ctx.config.getAll/onChange`；IPC `CONFIG_GET/SET/CHANGED`；`config.test.ts` 覆盖隔离/越权/通知 |
| PR-203 | 插件详情弹窗 | ✅ | `PluginDetailDialog.tsx`：基本信息/权限/操作区/错误详情 |
| PR-204 | 配置面板 | ✅ | 详情弹窗「配置」Tab，5 类型渲染 + 校验 + 保存/恢复默认 |
| PR-205 | store 扩展 | ✅ | `selectedPluginId/pluginConfigs` + config changed 桥实时同步 |

### 待用户验证（E2E GUI）

1. 设置 → 插件 Tab，点某插件卡片右侧「详情」→ 弹窗显示名称/版本/作者/类型/状态/权限列表/操作区。
2. 非内置插件弹窗内可「卸载」（二次确认）与「重新加载」；内置插件仅启用/禁用 + 重载。
3. 若插件声明了 `configSchema`，弹窗出现「配置」Tab；修改字段 →「保存配置」变可用 → 保存后提示「已保存」；「恢复默认」回到默认值。
4. 在弹窗配置里改值保存后，插件（若在 activate 里订阅 `ctx.config.onChange`）能实时收到变更。
5. 无 `configSchema` 的插件不显示「配置」Tab。

> 说明：两个内置范例插件目前均未声明 `configSchema`，因此默认看不到「配置」Tab。可临时给某插件 `package.json` 增加 `qserial.configSchema` 字段（或写一个带 schema 的测试插件）后「刷新」验证表单渲染。示例 schema：
> ```json
> "qserial": { "configSchema": { "fields": [
>   { "key": "baud", "label": "波特率", "type": "number", "default": 115200, "min": 300, "max": 921600 },
>   { "key": "mode", "label": "模式", "type": "select", "options": [{ "value": "a", "label": "A" }, { "value": "b", "label": "B" }], "default": "a" }
> ] } }
> ```
