# QSerial 插件系统 — 插件市场功能 实现报告

- **日期**：2026-09-06
- **基线**：插件系统核心 + 热加载 + 安装/卸载 + 详情弹窗 + 配置面板已完成
- **执行方式**：单轮闭环（勘察 → 拍板 → 编码 → 测试 → 交付）

---

## 一、勘察核实

| 描述 | 核实结果 |
|---|---|
| 插件列表 UI / 详情弹窗 / store / IPC | ✅ 一致 |
| 本地安装 `PLUGIN_INSTALL`（选目录安装） | ✅ 一致 |
| 插件目录：内置目录 + 用户目录（`userData/plugins`） | ✅ 一致 |
| 可用依赖 | `extract-zip@2.0.1`、`yauzl`、`semver@7.7.4` 在 node_modules（hoisted）；Node 24 / Electron 35 有全局 `fetch` |

**关键发现**：打包依赖映射 `electron-builder.config.deps.cjs` 由 `scripts/gen-deps-mapping.cjs` 从 `packages/main/package.json` 的 dependencies 递归生成 —— 引入新依赖需加入 main dependencies 并重跑生成。

---

## 二、已完成（PR-301 ~ PR-306）

- [x] **PR-301 索引协议**：`shared/types/plugin-market.ts`（`MarketIndex{meta,plugins}`、`MarketPluginItem`、`PluginSource`、`PluginUpdateInfo`、`PluginDownloadProgress`）；`shared/utils/plugin-market.ts`（`compareVersions`/`validateMarketIndex`/`isVersionCompatible`/`computeUpdates`/`DEFAULT_MARKET_SOURCES`）。
- [x] **PR-302 主进程市场能力**：`main/plugins/market.ts`（`fetchMarketIndex`/`installFromMarket`/`updatePlugin`，流式下载+进度、sha256 校验、extract-zip 解压、更新备份回滚）；IPC `PLUGIN_MARKET_FETCH/INSTALL/UPDATE/CHECK_UPDATES` + `PLUGIN_DOWNLOAD_PROGRESS` 事件。
- [x] **PR-303 市场 UI**：`PluginMarketPanel.tsx`（搜索/分类筛选/排序/卡片列表/安装·更新/进度条/错误重试/空态）。
- [x] **PR-304 详情弹窗市场扩展**：详情弹窗操作区新增「更新 vX」按钮（市场有更新时）；市场元信息（发布日期/大小/下载量）与进度条的完整交互集中在市场面板（精简说明见 §六）。
- [x] **PR-305 插件源管理**：市场 Tab 工具栏「插件源」入口 → 源管理弹窗（查看默认源/添加/编辑/删除自定义源）；配置存 `pluginMarket.sources` + `pluginMarket.activeSourceId`（config 通道）。
- [x] **PR-306 更新提示**：启动后台 `checkUpdates`；「已安装」子 Tab 红点 + 顶部「更新全部(N)」按钮。

---

## 三、关键决策及理由

1. **下载方案**：Node `http/https` 模块**流式下载**（非 fetch）——需要下载进度，`content-length` + `data` 事件累计字节推进度；自动跟随 3xx 重定向。
2. **解压库**：`extract-zip@2.0.1`（纯 JS，基于 yauzl，无原生二进制），已加入 main dependencies 并更新 lockfile（打包经 gen-deps-mapping 自动纳入）。
3. **版本比较**：自写纯函数 `compareVersions`（shared，零依赖，x.y.z 数字比较）——不引入 `semver` 以减小打包面，插件版本为简单三段式足够。
4. **hash 校验**：sha256（`crypto`）对下载的 zip 文件；与索引 `hash` 不区分大小写比对，失败拒绝安装。
5. **回滚**：更新前 `rename` 旧目录 → `.bak.<ts>`，放入新目录后 `reloadPlugin`；激活失败/异常时删除新目录、恢复 `.bak`、再 `reloadPlugin`，保证不破坏已装插件。
6. **更新策略**：`computeUpdates` 纯函数（已装版本 vs 市场索引版本），`checkUpdates` 无需网络写盘。
7. **源管理**：config 通道存储 `pluginMarket.sources` + `activeSourceId`；默认源 `builtin:true` 不可删；`DEFAULT_MARKET_SOURCES` 内置（URL 为占位，支持自定义源）。
8. **进度推送**：`PLUGIN_DOWNLOAD_PROGRESS` 主→渲事件，handler 内 `onProgress` 回调 → `safeSend`。
9. **安全边界**：下载地址仅 https（放行 127.0.0.1/localhost 自建源）；`minHostVersion` 不兼容则拒绝；安装/更新失败回滚。

---

## 四、改动文件清单

**新增**
- `packages/shared/src/types/plugin-market.ts`
- `packages/shared/src/utils/plugin-market.ts`
- `packages/main/src/plugins/market.ts`
- `packages/renderer/src/stores/pluginMarket.ts`
- `packages/renderer/src/components/dialogs/PluginMarketPanel.tsx`
- `packages/shared/__tests__/utils/plugin-market.test.ts`
- `packages/main/__tests__/plugins/market.test.ts`

**修改**
- `packages/shared/src/types/index.ts`、`utils/index.ts`、`types/ipc.ts`
- `packages/main/src/plugins/index.ts`、`ipc/handlers.ts`、`preload.ts`
- `packages/main/package.json`（+`extract-zip`）、`pnpm-lock.yaml`
- `packages/renderer/src/types/global.d.ts`、`stores/index.ts`、`App.tsx`
- `packages/renderer/src/components/dialogs/SettingsDialog.tsx`、`PluginDetailDialog.tsx`
- `packages/renderer/src/i18n/locales/{zh-CN,en-US}.json`

---

## 五、测试结果

- 新增 21 用例：
  - `plugin-market.test.ts`(13)：`compareVersions`(5) / `validateMarketIndex`(3) / `isVersionCompatible`(3) / `computeUpdates`(2)
  - `market.test.ts`(8)：sha256 缓冲+文件 / `findPluginRoot` 三态 / `installFromMarket` hash 失败拒绝、最低宿主版本拒绝、不安全 URL 拒绝
- 全量回归：**25 套件 / 270 用例全部通过**（基线 249，净增 21）。
- 构建：shared + main（tsc + esbuild preload）+ renderer（vite）三包通过；eslint 0 error；prettier 已格式化；`pnpm install` 已更新 lockfile（extract-zip）。

---

## 六、遗留风险

1. **PR-304 精简**：详情弹窗已接「更新」按钮；市场元信息（发布日期/大小/下载量）与安装进度条的**完整展示集中在市场面板**，详情弹窗内未重复渲染（避免 UI 重复 + 市场索引可能未加载）。
2. **默认源为占位 URL**：`DEFAULT_MARKET_SOURCES` 指向 GitHub raw 占位（仓库不存在），真实使用需配置自定义源（PR-305 支持）。离线时市场 Tab 显示错误提示，已安装插件不受影响。
3. **解压路径穿越未做深度校验**：`extract-zip` 解压后依赖 `findPluginRoot` 定位，未逐条目校验 zip 内路径（恶意 zip 可能写越界路径）——后续可加 zip 条目路径白名单校验。
4. **更新仅支持用户目录插件**：内置插件（`builtin:true`）更新会因目录在只读内置目录而失败（预期内）。
5. **下载无超时/断点续传**：大文件下载失败仅依赖 http 错误处理，无超时与续传。
6. **`checkUpdates` 启动即检查**：`pluginMarket.checkUpdatesOnStartup` 开关未落地（当前默认开启），列为后续。

---

## 七、下一步建议

1. zip 条目路径穿越校验（解压前白名单校验）。
2. 下载超时 + 断点续传 + 重试（需求要求重试 1 次，当前依赖 http 层，可显式补一次）。
3. `pluginMarket.checkUpdatesOnStartup` 配置开关 + 市场元信息完整展示到详情弹窗。
4. 市场索引签名校验（防止源被篡改）。
5. 评分/下载量等字段的市场后端数据接入。

---

## 八、验收对照表

| 需求编号 | 需求简述 | 实现状态 | 验证方式 |
|---|---|---|---|
| PR-301 | 市场索引协议 | ✅ | `shared/types/plugin-market.ts`；`validateMarketIndex` 测试 |
| PR-302 | 主进程市场能力 | ✅ | `market.ts`；hash/版本/URL 校验测试；IPC 通道 |
| PR-303 | 市场 UI | ✅ | `PluginMarketPanel.tsx` 搜索/筛选/排序/卡片/进度 |
| PR-304 | 详情弹窗市场扩展 | ⚠️ | 详情弹窗「更新」按钮已接；元信息/进度条完整展示在市场面板 |
| PR-305 | 插件源管理 | ✅ | 市场 Tab「插件源」入口 + 源管理弹窗；config 存储 |
| PR-306 | 更新提示 | ✅ | 启动后台检查 + 「已安装」红点 + 「更新全部」按钮 |

### 待用户验证（E2E GUI）

1. 设置 → 插件 → 切到「插件市场」Tab：默认源为占位 URL，应显示网络错误提示（可点「重试」）。
2. 「插件源」→ 添加一个真实源（如自建 JSON 服务的 URL，格式见 §PR-301）→ 保存 → 点「刷新」加载市场列表。
3. 市场卡片点「安装」→ 下载进度条 → 安装后出现在「已安装」Tab（默认停用）。
4. 已安装插件若市场有更高版本 → 卡片/详情弹窗显示「更新 vX」→ 更新后版本变化、状态保持。
5. 「更新全部」一键更新所有可更新项；「已安装」Tab 红点在有更新时显示。
6. 断网时市场 Tab 显示离线/错误提示，已安装插件正常使用。

> 市场索引示例（供自建源参考）：
> ```json
> {
>   "meta": { "version": "1", "updatedAt": "2026-01-01", "sourceName": "My Source" },
>   "plugins": [
>     { "id": "my-plugin", "name": "My Plugin", "version": "1.0.0", "tags": ["工具"],
>       "downloadUrl": "https://example.com/my-plugin.zip", "hash": "<sha256 of zip>" }
>   ]
> }
> ```
