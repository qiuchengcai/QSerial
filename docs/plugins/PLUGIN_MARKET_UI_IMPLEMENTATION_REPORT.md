# QSerial 插件市场 — UI 优化与 Mock 数据联调 实现报告

- **日期**：2026-09-06
- **基线**：插件市场 Tab 框架已搭好（Tab 切换、筛选栏、源按钮、错误提示），但默认源 404
- **执行方式**：单轮闭环（勘察 → 拍板 → 编码 → 测试 → 交付）

---

## 一、勘察核实

| 描述 | 核实结果 |
|---|---|
| 市场 Tab 框架（Tab 切换/筛选栏/源按钮/错误提示） | ✅ 一致（`PluginMarketPanel.tsx`） |
| 错误状态直接显示 IPC 报错原文 | ✅ 确认（需改造为友好文案） |
| `market.ts` fetch 已实现，默认源 404 | ✅ 一致 |
| 插件 store / 详情弹窗 | ✅ 一致 |

---

## 二、已完成（PR-401 ~ PR-406）

- [x] **PR-401 错误与空状态**：错误友好文案 +「查看详情」展开原始错误 + 独立「重试」按钮；骨架屏（5 卡片占位）；「市场为空 / 无搜索结果」两种空态居中（图标 + 主文案 + 副文案）。
- [x] **PR-402 顶部操作栏**：市场 Tab 搜索框（占位符"搜索插件名称、描述、标签"）+ 固定分类下拉（全部分类/工具/协议/MCP/设备识别/其他）+ 排序（最新/下载量/评分/名称）+ 刷新图标按钮 + 齿轮图标（源设置，tooltip）；已安装 Tab 保留「安装插件 + 刷新」。
- [x] **PR-403 Mock 索引数据**：`main/src/plugins/mock-market.ts` 内置 8 个插件（覆盖工具/协议/MCP/设备识别 + 未安装/已安装有更新/不兼容）；mock 安装模拟（2 秒进度 + 生成示例插件目录）；开关 `pluginMarket.mock`（config）或 `QSERIAL_MOCK_MARKET=1`（环境变量），**默认关闭**。
- [x] **PR-404 市场卡片**：名称+版本/作者/描述(2 行省略)/标签(最多 3 个)/下载量·评分；状态按钮（安装/更新/已安装/不兼容+tooltip）；点击卡片主体打开详情弹窗。
- [x] **PR-405 详情弹窗市场信息**：发布日期/文件大小/下载量/分类标签/主页链接；操作区按状态动态（未安装→安装+进度、已安装→启用·重载·更新·卸载）；实时下载进度。
- [x] **PR-406 下载进度与状态管理**：store 字段 `marketPlugins`/`marketLoading`/`marketError`/`downloadingPlugins` + `fetchMarket`/`installFromMarket`/`updatePlugin`/`updateAll`；进度经 `PLUGIN_DOWNLOAD_PROGRESS` 实时同步（卡片 + 详情弹窗）。

---

## 三、关键决策及理由

1. **Mock 开关**：`ConfigManager.get('pluginMarket.mock')` 优先，其次环境变量 `QSERIAL_MOCK_MARKET=1`，**默认关闭**（生产安全）。开发联调时 `QSERIAL_MOCK_MARKET=1 pnpm start` 开启。
2. **Mock 安装自包含**：不预置 mock 插件源目录，安装时**动态生成** `package.json + index.mjs`（写用户目录）→ `rescan()`，避免 tsc 不复制非 .ts 资源的问题。
3. **状态计算抽纯函数**：`computeMarketItemStatus`（install/update/installed/incompatible，含 `minHostVersion` 判断）+ `computeMarketViewState`（loading/error/empty/no-results/list）下沉到 shared，renderer 复用 + 可单测。
4. **错误语义**：store `marketError` 存**原始错误**，UI 层翻译友好文案 + 展开显示原始错误（「查看详情」），满足 i18n 与"展开详情"双要求。
5. **store 字段对齐 PR-406**：`marketPlugins`（数组）替代原 `index`（整体），`downloadingPlugins`（id→进度 map）替代 `installingId/progress` 单值，支持并发下载。
6. **详情弹窗双模式**：统一用 `selectedPluginId`，内部按「已安装插件（`plugin`）」或「市场条目（`marketItem`）」取数据，`plugin` 缺失时回退 `marketItem` 渲染市场详情 + 安装按钮。

---

## 四、改动文件清单

**新增**
- `packages/main/src/plugins/mock-market.ts` — Mock 索引（8 插件）+ 开关 + 生成示例插件目录

**修改**
- `packages/shared/src/utils/plugin-market.ts` — 新增 `computeMarketItemStatus` / `computeMarketViewState`
- `packages/main/src/plugins/market.ts` — `fetchMarketIndex` / `installFromMarket` / `updatePlugin` 接入 mock 分支 + `mockProgress`
- `packages/renderer/src/stores/pluginMarket.ts` — 字段重构（marketPlugins/marketLoading/marketError/downloadingPlugins + hostVersion）
- `packages/renderer/src/components/dialogs/PluginMarketPanel.tsx` — 工具栏重构 + 骨架屏 + 错误/空态居中 + 卡片（点击开详情）
- `packages/renderer/src/components/dialogs/PluginDetailDialog.tsx` — 双模式 + 市场信息块 + 状态动态操作 + 进度条
- `packages/renderer/src/i18n/locales/{zh-CN,en-US}.json` — 新增市场/详情文案
- `packages/shared/__tests__/utils/plugin-market.test.ts` — 新增 9 用例

---

## 五、测试结果

- 新增 9 用例：`computeMarketItemStatus`(4：incompatible/install/update/installed) + `computeMarketViewState`(5：error/loading/empty/no-results/list)。
- 全量回归：**25 套件 / 279 用例全部通过**（基线 270，净增 9）。
- 构建：shared + main + renderer 三包通过；eslint 0 error；prettier 已格式化。

---

## 六、遗留风险

1. **Mock 默认关闭**：用户验证需 `QSERIAL_MOCK_MARKET=1` 启动或 config 开启；生产逻辑不受影响（已验证 mock 关闭时走真实 fetch + hash/版本/URL 校验）。
2. **分类筛选依赖中文标签**：固定分类（工具/协议/MCP/设备识别/其他）匹配 `item.tags` 中文标签；真实英文标签源需约定统一标签名。
3. **下载量单位硬编码中文**（万/k）：en-US 下仍显示中文单位，待 i18n 化。
4. **主页链接 `href` 直接外跳**：详情弹窗内 `onClick` 已 `stopPropagation`，但打开的是外部浏览器（Electron 默认行为），未做白名单校验。
5. **Mock 安装的插件无 `configSchema`**：生成的示例插件仅含 `permissions:['log']`，若需演示配置面板需在 `generateMockPluginDir` 里补 schema。

---

## 七、下一步建议

1. Mock 数据下沉为独立 JSON + 支持多份 fixture 切换。
2. 下载量/大小格式化 i18n 化。
3. 市场后端接入（真实评分/下载量/首页）。
4. 详情弹窗进度条加「取消下载」。
5. 分类标签统一规范（中英文映射）。

---

## 八、验收对照表

| 需求编号 | 需求简述 | 实现状态 | 验证方式 |
|---|---|---|---|
| PR-401 | 错误与空状态优化 | ✅ | 友好文案+展开详情+重试；骨架屏；空态/无结果居中（`computeMarketViewState` 测试） |
| PR-402 | 顶部操作栏重构 | ✅ | 搜索/固定分类/排序含名称/刷新图标/齿轮图标；已安装 Tab 保留 |
| PR-403 | Mock 索引数据 | ✅ | `mock-market.ts` 8 插件 + mock 安装模拟 + 默认关闭开关 |
| PR-404 | 市场插件卡片 | ✅ | 卡片信息 + 状态按钮 + 点击开详情（`computeMarketItemStatus` 测试） |
| PR-405 | 详情弹窗市场信息 | ✅ | 日期/大小/下载量/标签/主页 + 状态动态操作 + 进度 |
| PR-406 | 下载进度与状态管理 | ✅ | store 字段对齐 + `PLUGIN_DOWNLOAD_PROGRESS` 实时同步 |

### 待用户验证（E2E GUI）

1. 以 mock 开启启动：`QSERIAL_MOCK_MARKET=1 pnpm start`（或 config 设 `pluginMarket.mock=true`）。
2. 设置 → 插件 → 「插件市场」Tab：应看到 8 个 mock 插件卡片（名称/版本/作者/描述/标签/下载量/评分）。
3. 搜索「modbus」→ 无结果空态「未找到匹配的插件」；清空 → 恢复列表；分类选「协议」→ 过滤到 Modbus/MQTT。
4. 点未安装卡片「安装」→ 进度条（约 2 秒）→ 出现在「已安装」Tab（默认停用）。
5. 点卡片主体（非按钮）→ 详情弹窗显示市场信息（发布日期/大小/下载量/标签/主页）+ 安装/进度。
6. `qserial-plugin-device-profiles`（v1.1.0）显示「更新」按钮 → 更新后版本变化；`automotive-profiles`（minHostVersion 9.0.0）显示「不兼容」禁用。
7. 点齿轮图标 → 源管理弹窗（默认源只读，可添加/编辑/删除自定义源）。
