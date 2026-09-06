# QSerial 插件市场功能 — 开发总结与可移植方案

> 面向对象：需要把"插件市场"能力移植到其他 Electron 项目的开发者。
> 覆盖范围：在线浏览、搜索、分类、安装、更新、插件源管理（基于已完成的插件系统核心）。

---

## 一、整体架构设计

### 分层架构

```
┌─────────────────────────────────────────────────┐
│ 渲染层 (renderer)                                 │
│  SettingsDialog → PluginMarketPanel(市场Tab)       │
│  PluginDetailDialog(详情弹窗)                      │
│  stores/pluginMarket.ts (Zustand)                 │
└──────────────┬──────────────────────────────────┘
               │ IPC (invoke + event)
┌──────────────▼──────────────────────────────────┐
│ 主进程 (main)                                     │
│  ipc/handlers.ts (channel 接线)                   │
│  plugins/market.ts (下载/校验/解压/安装/更新)       │
│  plugins/mock-market.ts (开发联调数据)             │
│  plugins/manager.ts (复用插件加载/卸载/重载)        │
└──────────────┬──────────────────────────────────┘
               │ https 拉取 / 下载
┌──────────────▼──────────────────────────────────┐
│ 远程索引 (托管在 GitHub raw / 自建静态服务器)        │
│  index.json（元信息 + 插件条目数组）               │
│  插件 zip 压缩包（含 package.json + 入口）          │
└─────────────────────────────────────────────────┘
```

### 职责划分与理由

| 层 | 职责 | 理由 |
|---|---|---|
| 渲染层 | 展示/交互/状态管理 | 所有 UI 逻辑与缓存态放 Zustand，主进程不碰 UI |
| 主进程 | 网络 I/O、文件操作、安全校验、插件加载 | 只有主进程能访问 `fs`/`net`/`crypto`，且插件加载器在主进程 |
| 远程索引 | 静态 JSON + zip | 无后端成本、可用 GitHub 托管、天然支持多源 |

### 与插件系统的复用关系

- **复用**：`PluginManager` 的 `rescan()/reloadPlugin()/getRuntime()/list()`、`ctx.config` 命名空间、`PluginInfo` 类型、详情弹窗骨架、SettingsDialog 插件 Tab。
- **新增**：市场索引协议、`market.ts`（下载/校验/解压/回滚）、市场 store、市场面板、源管理、下载进度通道。

### 关键数据流（点「刷新市场」→ 看到列表）

```
1. 渲染层 PluginMarketPanel useEffect → market.loadSources() → fetchMarket()
2. fetchMarket() → window.qserial.plugin.marketFetch(url)
3. preload → ipcMain.handle(PLUGIN_MARKET_FETCH)
4. handler → market.fetchMarketIndex(url)
5. mock 开启? 返回 MOCK_MARKET_INDEX : fetch(url) + validateMarketIndex()
6. 返回 MarketIndex → store 写入 marketPlugins → React 重渲染卡片
```

---

## 二、核心数据结构

### 市场索引 Schema（`shared/src/types/plugin-market.ts`）

| 字段 | 类型 | 必填 | 含义 |
|---|---|---|---|
| `meta.version` | string | ✅ | 索引协议版本 |
| `meta.updatedAt` | string | ✅ | 更新时间（ISO） |
| `meta.sourceName` | string | ✅ | 源名称 |
| `plugins[]` | array | ✅ | 插件条目 |
| `item.id` | string | ✅ | 唯一标识（与已装插件 id 对齐） |
| `item.name` | string | ✅ | 显示名 |
| `item.version` | string | ✅ | 版本（x.y.z） |
| `item.downloadUrl` | string | ✅ | zip 下载地址（仅 https / 本机回环） |
| `item.hash` | string | ✅ | zip 文件 sha256（hex） |
| `item.tags` | string[] | ✅ | 分类标签 |
| `item.author/description/size/releaseDate/homepage/downloads/rating` | — | 可选 | 展示扩展字段 |
| `item.minHostVersion` | string | 可选 | 最低宿主版本，不兼容则禁装 |

**设计原则**：`id/downloadUrl/hash/version` 是安装闭环的核心；`size/downloads/rating/releaseDate/tags` 是纯展示；`minHostVersion` 是安全/兼容扩展位。字段全部可序列化，跨 IPC 直接传递。

### 版本与兼容性规则

- **比较**：自写 `compareVersions(a,b)`，解析 `x.y.z` 三段为数字逐段比较（缺位补 0），返回 -1/0/1。**未引入 semver 库**——插件版本三段式足够，省一个打包依赖。
- **兼容**：`isVersionCompatible(hostVersion, minHostVersion)`，min 为空视为无要求。
- **状态判定**：`computeMarketItemStatus(item, installedVersion, hostVersion)` → `install/update/installed/incompatible`（不兼容优先级最高）。

### 本地存储结构

| 数据 | 存储位置 | 说明 |
|---|---|---|
| 已安装插件启用状态 | `config: plugins.enabled.<id>` | ConfigManager 点路径 |
| 插件源列表 | `config: pluginMarket.sources` | `PluginSource[]`，默认源 `builtin:true` |
| 当前源 | `config: pluginMarket.activeSourceId` | 源 id |
| 插件自身配置 | `config: plugins.namespace.<id>.<key>` | 命名空间隔离 |
| 下载临时文件 | `os.tmpdir()/qserial-market-*` | 用完即删 |
| Mock 开关 | `config: pluginMarket.mock` / 环境变量 `QSERIAL_MOCK_MARKET=1` | 默认关闭 |

---

## 三、主进程实现要点

### 文件结构

| 文件 | 职责 |
|---|---|
| `plugins/market.ts` | 下载/校验/解压/安装/更新/回滚 + 可注入的 `PluginMarket` 类 |
| `plugins/mock-market.ts` | mock 索引 + 开关 + 生成示例插件目录 |
| `plugins/manager.ts` | （复用）加载/卸载/重载 |
| `ipc/handlers.ts` | 市场 IPC 通道接线 |

### 核心 API（`PluginMarket` 类，依赖可注入便于测试）

`fetchMarketIndex(sourceUrl)` / `installFromMarket(item, onProgress)` / `updatePlugin(pluginId, item, onProgress)` / `mockProgress(item, onProgress)` / `downloadAndExtract(item, onProgress)` / `assertCompatible(item)`。另有无副作用纯函数 `sha256File`、`downloadFile`、`findPluginRoot`。

### 安装流程（完整步骤）

```
installFromMarket(item, onProgress)
├─ mock 开启? → mockProgress(2s) + generateMockPluginDir + rescan()   [开发联调]
└─ 真实:
   ├─ assertCompatible：校验下载地址(https/本机) + minHostVersion
   ├─ downloadAndExtract:
   │    ├─ downloadFile(url, zip)  → 进度回调(content-length + data 累计)
   │    ├─ sha256File(zip) ≠ item.hash → 抛错拒绝
   │    └─ extract-zip 解压 → findPluginRoot(定位含 package.json 目录)
   ├─ 移动到 userPluginsDir/<id>（已存在则拒绝）
   └─ manager.rescan() 加载（默认禁用）
```

更新（`updatePlugin`）多了**回滚**：`rename 旧目录 → .bak.<ts>` → 放入新目录 → `reloadPlugin` → 失败则删新目录、恢复 `.bak`、再 `reloadPlugin`。

### 安全机制

1. **hash 校验**：sha256 对 zip 文件，失败拒绝（防篡改/损坏）。
2. **版本兼容**：`minHostVersion` 不满足则拒绝安装。
3. **下载地址白名单**：仅 https（放行 127.0.0.1/localhost 自建源）。
4. **命名空间隔离**：插件只读写 `plugins.namespace.<id>.*`，结构性不可越界。

### 踩过的坑

- **下载进度**：`fetch` 无进度事件 → 改用 `http/https` 模块流式读取 `content-length` + `data` 累计；需手动跟随 3xx 重定向。
- **解压路径**：zip 内可能是「根目录即插件」或「单层子目录包插件」→ `findPluginRoot` 两种形态都要兼容。
- **tsc 不复制非 .ts 资源**：mock 插件源目录若放 src 下不会被拷贝到 dist → 改为**运行时动态生成**目录，不自带资源文件。
- **mock 开关默认值**：曾设默认开启导致测试/生产走错分支 → 最终默认关闭，测试与生产行为一致。

---

## 四、渲染层实现要点

### UI 组件结构

| 组件 | 复用/新增 |
|---|---|
| `SettingsDialog.tsx` 插件 Tab | 复用，加「已安装/市场」子 Tab + 红点 + 更新全部 |
| `PluginMarketPanel.tsx` | 新增：搜索/分类/排序/卡片/骨架屏/错误空态/源管理弹窗 |
| `PluginDetailDialog.tsx` | 复用，改为**双模式**（已安装插件 / 市场条目）+ 市场信息块 + 安装/进度 |
| 卡片按钮 `MarketActionButton` | 新增，状态驱动（安装/更新/已安装/不兼容） |

### 状态管理（`stores/pluginMarket.ts`）

- **state**：`marketPlugins`（列表）、`marketLoading`、`marketError`（原始错误）、`downloadingPlugins`（id→进度 map，支持并发）、`updates`、`sources/activeSourceId/hostVersion`。
- **action**：`loadSources/saveSources/fetchMarket/installFromMarket/updatePlugin/updateAll/checkUpdates/clearError`。
- **状态计算下沉为纯函数**：`computeMarketItemStatus` / `computeMarketViewState` 放 shared，UI 只消费结果（可单测）。

### 多 Tab 数据同步

- **已安装 Tab** 数据来自 `plugins store`（`PluginInfo[]`）；**市场 Tab** 数据来自 `market store`（`MarketPluginItem[]`）。
- 两者通过 `id` 对齐：市场卡片用 `installedMap`（id→版本）判状态；安装/更新成功后主进程 `rescan/reload` → `PLUGINS_CHANGED` 推送新 `PluginInfo[]` → `plugins store` 更新 → 市场卡片状态自动刷新。
- 下载进度通过 `PLUGIN_DOWNLOAD_PROGRESS` 事件 → `downloadingPlugins` map → 卡片与详情弹窗**同一数据源**同步。

### 状态处理矩阵

| 状态 | 触发 | UI |
|---|---|---|
| 加载中 | `marketLoading` | 骨架屏（5 个占位卡片，`animate-pulse`） |
| 错误 | `marketError` 非空 | 居中友好文案 + 「查看详情」展开原始错误 + 重试 |
| 市场为空 | 无错误且 `totalPlugins===0` | 居中「暂无可用插件」 |
| 无结果 | `totalPlugins>0 && filteredCount===0` | 居中「未找到匹配的插件」 |
| 下载中 | `downloadingPlugins[id]` 存在 | 按钮变「处理中」+ 卡片/详情进度条 |
| 安装成功 | `PLUGINS_CHANGED` | 卡片按钮变「已安装」 |

### 交互细节

- **进度同步**：主进程 `onProgress` → handler `safeSend(PLUGIN_DOWNLOAD_PROGRESS, {pluginId, percent, transferred, total})` → preload `onDownloadProgress` → store 写入 map。
- **更新红点**：启动时 `checkUpdates()` 后台执行，`updates.length>0` 时「已安装」子 Tab 标签显示红点；顶部「更新全部(N)」一键循环更新。

---

## 五、IPC 通信设计

| 通道 | 方向 | 参数 → 返回 | 类型 |
|---|---|---|---|
| `plugin:marketFetch` | 渲→主 | `{sourceUrl?}` → `MarketIndex` | 请求-响应 |
| `plugin:marketInstall` | 渲→主 | `{pluginId, sourceUrl?}` → `PluginInfo[]` | 请求-响应 |
| `plugin:marketUpdate` | 渲→主 | `{pluginId, sourceUrl?}` → `PluginInfo[]` | 请求-响应 |
| `plugin:marketCheckUpdates` | 渲→主 | `{sourceUrl?}` → `PluginUpdateInfo[]` | 请求-响应 |
| `plugin:downloadProgress` | 主→渲 | `PluginDownloadProgress` | 事件推送 |

**划分原则**：一次性拿结果的用 `invoke`（请求-响应）；持续性/异步推进的用 `webContents.send`（事件推送）。源管理不设专有通道，直接复用通用 `config:get/set`（源就是一段 config）。

**进度流式处理**：下载是单次 invoke（`marketInstall`），进度经独立事件通道持续推送——避免 invoke 阻塞返回，渲染层随时可订阅/取消。

**错误传递**：主进程 `throw Error(中文 message)` → ipcMain 自动包装为 `Error invoking remote method ...` → 渲染层 catch 后存 `marketError`（原始错误），UI 显示友好文案 + 展开原始错误。**不**在 handler 里吞错转结构化对象，保持简单。

---

## 六、关键设计决策

1. **远程 JSON 索引 vs npm registry / 自建服务**
   - 决策：远程静态 JSON。
   - 理由：零后端成本、GitHub raw 即可托管、schema 自由、多源切换简单。
   - trade-off：无搜索服务端、无签名分发（需自行保证可信），大索引无分页。

2. **zip 下载 vs git clone**
   - 决策：zip 下载 + extract-zip。
   - 理由：无 git 依赖、能带 sha256 完整性校验、进度可控、纯 JS 解压库可打包。
   - trade-off：无增量更新（全量替换），大插件下载较慢。

3. **Tab 切换 vs 两个页面**
   - 决策：设置页插件 Tab 内「已安装/市场」子 Tab。
   - 理由：复用同一 SettingsDialog 与详情弹窗，用户心智连贯、代码复用高。
   - trade-off：市场页空间受限（660px 宽对话框），工具栏需折叠为两行。

4. **Mock 数据做在主进程 vs 渲染层**
   - 决策：主进程 `mock-market.ts` + `fetchMarketIndex` 内分支。
   - 理由：与真实路径共用同一 IPC 入口，渲染层零感知，切换 mock 只改开关；能同时 mock「安装」的全链路（生成目录 + rescan）。
   - trade-off：mock 逻辑散在主进程，需用开关严格隔离、默认关闭。

5. **多源 vs 单源**
   - 决策：多源（`PluginSource[]` + `activeSourceId`）。
   - 理由：官方源可能被墙/慢，自定义源是刚需；默认源 `builtin:true` 不可删保证兜底。
   - trade-off：需维护「当前源」状态，checkUpdates 等操作都需带 sourceUrl 解析。

6. **版本比较自写 vs semver 库**
   - 决策：自写 `compareVersions`（shared）。
   - 理由：插件版本三段式足够，省一个依赖与打包面。
   - trade-off：不支持预发布号（`1.0.0-beta`）等高级语义。

---

## 七、可移植性指南

### 移植步骤清单

1. **拷贝纯函数层**：`shared/types/plugin-market.ts` + `shared/utils/plugin-market.ts`（零依赖，直接复用）。
2. **适配插件加载器接口**：确认目标项目有等价于 `PluginManager.rescan()/reloadPlugin()/getRuntime()` 的方法；没有则先实现最小版。
3. **移植 `market.ts`**：`PluginMarket` 类的 `downloadFile/sha256File/findPluginRoot` 可直接抄；`installFromMarket/updatePlugin` 里的 `userPluginsDir`、`getPluginManager()` 需替换为目标项目的用户目录解析与加载器调用。
4. **接 IPC**：照搬 5 个通道（4 invoke + 1 event），handler 里 `resolveMarketUrl` 换成目标项目的源配置读取。
5. **移植 store**：`pluginMarket.ts` 的 state/action 结构可直接抄，`window.qserial.plugin.*` 换成目标项目的 preload 桥。
6. **移植 UI**：`PluginMarketPanel`/`PluginDetailDialog` 的交互逻辑可抄，样式类名换成目标项目组件库（如 antd/MUI）。
7. **加测试**：`plugin-market.test.ts`（纯函数）+ `market.test.ts`（注入 download/extract 的安装校验）直接复用思路。

### 核心依赖

| 依赖 | 必须/可替换 |
|---|---|
| `extract-zip`（纯 JS 解压） | 必须（或换 yauzl/unzipper） |
| Node `http/https` + `crypto` + `fs` | 必须（内置） |
| Zustand / React / i18next | QSerial 特有，替换为目标栈 |

### 需适配的点

- **插件目录结构**：QSerial 是 `plugins/<id>/package.json`；目标项目若不同（如 `.ext` 文件、不同 manifest），改 `loadManifest` 与 `generateMockPluginDir`。
- **配置系统**：QSerial 用 ConfigManager 点路径；目标项目换成自己的 config 读写，改 `sources/mock` 的存取。
- **UI 组件库**：QSerial 用 Tailwind 类名 + 内联 SVG；移植时替换为目标组件。
- **版本号来源**：`hostVersion` 在 store 里从 `app.version()` 读，目标项目换成自己的版本读取。

### 最小可运行版本（MVP）

必做：索引协议 + `fetchMarketIndex` + 安装（下载/校验/解压/加载）+ 列表渲染（含 loading/error/empty）+ `PLUGIN_MARKET_FETCH/INSTALL/DOWNLOAD_PROGRESS` 三通道。
可后做：更新与回滚、多源管理、mock、骨架屏、详情弹窗市场信息、红点/一键更新、下载量/评分展示。

### 代码复用率估算

- **可直接抄（~50%）**：`plugin-market.ts` 纯函数、`market.ts` 的下载/hash/解压/回滚骨架、store state/action 划分、IPC 通道设计。
- **需小改（~35%）**：加载器调用点、配置存取、preload 桥命名、错误文案。
- **需重写（~15%）**：UI 样式（组件库差异）、mock 数据内容、详情弹窗样式。

---

## 八、测试与验收

### 核心测试用例（≥10）

1. `compareVersions` 相等/大于/小于/缺位/非数字（5 用例）
2. `validateMarketIndex` 合法解析/缺 meta/丢弃非法条目（3 用例）
3. `isVersionCompatible` 无 min/满足/不满足（3 用例）
4. `computeUpdates` 有更新/无更新（2 用例）
5. `computeMarketItemStatus` install/update/installed/incompatible（4 用例）
6. `computeMarketViewState` loading/error/empty/no-results/list（5 用例）
7. `sha256File` 已知哈希比对（2 用例）
8. `findPluginRoot` 根目录/单层子目录/无 package.json（3 用例）
9. `installFromMarket` hash 不匹配拒绝 / minHostVersion 拒绝 / 不安全 URL 拒绝（3 用例）
10. `PluginMarket` 依赖注入（download/extract/userPluginsDir）隔离测试

### 验证完整性的方式

- 全量单测零回归（QSerial 现状 279 用例）。
- mock 模式手动走通：浏览 → 搜索/筛选 → 安装进度 → 已装列表 → 详情 → 更新/不兼容。

### 上线前 checklist

- [ ] mock 开关默认关闭，`QSERIAL_MOCK_MARKET` 不残留
- [ ] `extract-zip` 已入 dependencies 并重跑 `gen-deps-mapping`
- [ ] 下载地址仅 https，hash 校验必过
- [ ] 安装失败回滚验证过（断网/坏 zip）
- [ ] 默认源 URL 已替换为真实地址
- [ ] 错误文案 i18n 双语齐全

### 已知遗留问题

1. zip 条目路径穿越未做白名单校验（恶意 zip 可写越界路径）。
2. 下载无超时/断点续传，重试依赖 http 层。
3. 分类筛选依赖中文标签，英文标签源需约定统一。
4. 下载量单位中文硬编码，未 i18n。
5. 主页链接外部跳转无白名单。
6. 市场索引无签名校验（源被篡改无感知）。

---

## 移植快速参考卡

- **分层**：渲染层(Zustand+UI) → IPC(invoke+event) → 主进程(market.ts) → 远程 index.json + zip。
- **核心 Schema**：`MarketIndex{meta, plugins[]}`；条目必填 `id/name/version/downloadUrl/hash/tags`，可选 `size/downloads/rating/releaseDate/minHostVersion`。
- **核心 API**：`fetchMarketIndex / installFromMarket / updatePlugin / downloadFile / sha256File / findPluginRoot`。
- **5 个 IPC**：marketFetch/marketInstall/marketUpdate/marketCheckUpdates（invoke）+ downloadProgress（event）。
- **安装闭环**：下载(进度) → sha256 校验 → 解压 → 移动到用户目录 → rescan 加载 → 失败回滚。
- **状态纯函数**：`compareVersions` / `computeMarketItemStatus` / `computeMarketViewState`（可测试、可复用）。
- **Mock**：主进程开关 `pluginMarket.mock` 或 `QSERIAL_MOCK_MARKET=1`，默认关闭。
- **依赖**：`extract-zip`（唯一新增三方）；版本比较自写不引 semver。
- **复用手法**：依赖注入（`PluginMarket.configure`）解耦下载/解压/目录，测试不碰真实网络。
