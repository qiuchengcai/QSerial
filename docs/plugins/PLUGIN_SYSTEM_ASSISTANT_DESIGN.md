# 插件系统与智能助手插件 — 详细设计文档（功能移植用）

- **日期**：2026-09-07
- **仓库**：D:\WorkSpace\QSerial（Electron 35 + React 18 + TypeScript + Zustand + Vitest）
- **目的**：本文件是「插件系统核心」与「智能助手插件」的完整设计说明，供功能移植到其它项目使用。

> 阅读指引：**第一部分**是宿主（QSerial 核心）必须提供的插件系统能力；**第二部分**是 AI 助手插件自身的自包含设计（可整体移植）。移植时先落地第一部分的最小宿主面，再接入第二部分。

---

# 第一部分：宿主插件系统（核心）

## 1.1 总体架构

```
┌─────────────────────────── 渲染进程（React） ───────────────────────────┐
│  UI 组件（Sidebar / SettingsDialog / AssistantPanel 等）                 │
│  Zustand stores（plugins / pluginMarket / assistant ...）               │
│              ▲  contextBridge 暴露 window.qserial.*                     │
├──────────────┼──────────────────────────────────────────────────────────┤
│  preload.ts  │  ipcRenderer.invoke / on 封装                            │
├──────────────┼──────────────────────────────────────────────────────────┤
│  主进程（Electron main, ESM）                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ PluginManager（扫描/加载/热重载/启停/安装卸载）                    │   │
│  │   └─ buildPluginContext(manifest) → 受限 ctx（按权限裁剪）        │   │
│  │ Registry（贡献注册表：mcp/device/ui/quickButtons/ipc/...）        │   │
│  │ IPC handlers（plugin:* / plugin:invoke / plugin:event）           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ConfigManager（点号键嵌套存储，原子写 + 备份）                            │
└──────────────────────────────────────────────────────────────────────────┘
```

## 1.2 插件清单（package.json 的 `qserial` 字段）

插件目录下 `package.json`，关键结构：

```jsonc
{
  "name": "qserial-plugin-xxx",
  "version": "1.0.0",
  "author": "Author",
  "description": "…",
  "main": "index.mjs",          // 入口，导出 activate/deactivate
  "qserial": {
    "id": "qserial-plugin-xxx",
    "description": "…",
    "builtin": true,             // 内置：默认启用、不可卸载
    "permissions": ["connection:read", "config", "ui", "mcp:register", "ipc"],
    "configSchema": {            // 可选，宿主渲染配置表单
      "fields": [
        { "key": "ai.provider", "label": "…", "type": "select", "default": "disabled",
          "options": [{"value":"disabled","label":"关闭"},{"value":"ollama","label":"Ollama"}] },
        { "key": "ai.baseUrl", "label": "…", "type": "string" },
        { "key": "rag.topK", "label": "…", "type": "number", "default": 5, "min": 1, "max": 20 }
      ]
    }
  }
}
```

**加载规则**：`main` 是 ESM 入口（相对插件目录）。加载用 `import(pathToFileURL(entryPath).href + '?v=' + importVersion)`，重载时递增 `importVersion` 失效缓存。

## 1.3 权限模型

`PluginPermission` 字符串枚举（`shared/src/types/plugin.ts`）：

| 权限 | 作用 |
| --- | --- |
| `connection:read` | 读连接列表/状态/数据 |
| `connection:write` | 向连接写数据 |
| `terminal:write` | 注册输出过滤器/快捷按钮/终端命令 |
| `mcp:register` | 注册 MCP 工具 |
| `config` | 读写自身命名空间配置 |
| `device:register` | 注册设备识别规则 |
| `ui` | 注入 UI 入口 |
| `ipc` | 注册可供渲染进程调用的 IPC 方法 + 推送事件 |

每个能力调用前 `assertPermission(perms, perm)` 校验，未声明抛 `PluginPermissionError`。

## 1.4 宿主 API（ctx，即 PluginActivationContext）

`activate(ctx)` 注入的受限上下文，每个域按权限裁剪：

```ts
interface PluginActivationContext {
  id: string; name: string; version: string;
  log: { info(msg); warn(msg); error(msg) };
  config: {
    get(key): unknown;            // 读 plugins.namespace.<id>.<key>
    set(key, value): void;
    delete(key): void;
    getAll(): Record<string, unknown>;   // 返回嵌套对象
    onChange(cb): () => void;            // 订阅本插件配置变更
  };
  connection: {
    list(): Array<{id,type,name,state}>;
    state(id): string | undefined;
    send(id, data): void;
    onData(id, cb): () => void;
    onStateChange(id, cb): () => void;
  };
  terminal: {
    registerOutputFilter(filter); registerQuickButtons(buttons); registerCommand(name, handler);
  };
  mcp: { registerTool(definition, handler); };
  device: { registerProfiles(profiles); };
  ui: { contribute(entries: UiContribution[]); };
  ipc: { register(method, handler); emit(event, payload); };  // 关键：插件↔UI 双向通信
}
```

- `config` 键按「点号」落到 `ConfigManager` 的 `plugins.namespace.<id>.<key>`，存储时形成**嵌套对象**。
- **关键约定**：渲染进程配置面板按 schema 的点号 `field.key` 读取，因此宿主在返回配置给渲染进程时需**拍平**（`flattenConfig`），否则点号键读不回（表现为「保存后回显默认值」）。

## 1.5 生命周期

```js
export async function activate(ctx) { /* 注册能力、订阅、初始化 */ }
export async function deactivate() { /* 清理订阅、停止任务 */ }
```

`PluginManager` 负责：扫描搜索目录（内置 `plugins/` + 用户 `userData/plugins/`）→ `loadManifest` → `activate`；`setEnabled` 即时启停；`rescan/syncFromDisk` 热发现（`fs.watch` 400ms 防抖）；`install/uninstall`（内置不可卸载）。

## 1.6 插件 UI 注入（重要偏差）

实测 **`ui.contribute` 只注册 `{id, label, kind: 'sidebar'|'setting'|'contextMenu'}` 入口，不注入渲染组件**。因此插件 UI 由**宿主渲染进程组件**实现，插件通过 **`ipc` 权限 + `plugin:invoke` / `plugin:event`** 桥通信：

- 插件：`ctx.ipc.register(method, handler)`、`ctx.ipc.emit(event, payload)`。
- 渲染进程：`window.qserial.plugin.invoke(pluginId, method, args)`、`window.qserial.plugin.onEvent(cb)`。
- 宿主 IPC 通道：`plugin:invoke`（渲染→主，路由到插件 handler）、`plugin:event`（主→渲染推送）。

## 1.7 宿主新增的 IPC 通道（`shared/src/types/ipc.ts`）

插件相关：`plugin:list/setEnabled/install/uninstall/rescan/reload/configGet/configSet/configChanged/plugin:changed/plugin:invoke/plugin:event`，以及市场 `plugin:marketFetch/marketInstall/marketUpdate/marketCheckUpdates/plugin:downloadProgress`。

---

# 第二部分：AI 助手插件（qserial-plugin-assistant）

## 2.1 目录结构

```
plugins/qserial-plugin-assistant/
├── package.json            # 清单（见 §2.2）
├── index.mjs               # 入口 activate/deactivate
└── lib/
    ├── service.mjs         # 编排：检索/对话/会话/日志分析/命令生成/IPC 注册
    ├── store.mjs           # 知识库文件存储（模块/文档 CRUD）
    ├── vector-store.mjs    # 向量索引持久化 + 分块向量化
    ├── conversation.mjs    # 会话文件存储（每会话一个 JSON）
    ├── llm.mjs             # OpenAI 兼容调用（流式 SSE）+ 错误格式化
    ├── builtin.mjs         # 3 个内置知识模块（Markdown 内容）
    └── mcp-tools.mjs       # MCP 工具注册
```

可测试的**纯逻辑在 `packages/shared/src`**（与插件运行时解耦）：
- `types/assistant.ts`：全部数据结构。
- `utils/assistant-{chunker,embedding,retriever,prompt,knowledge,conversation,markdown,analysis}.ts`。

## 2.2 manifest 与配置

- 权限：`["connection:read","config","ui","mcp:register","ipc"]`。
- configSchema（7 字段）：`ai.provider`（select: disabled/openai-compatible/ollama）、`ai.baseUrl`、`ai.apiKey`、`ai.model`、`ai.embeddingModel`（预留）、`rag.topK`（默认 5）、`rag.chunkSize`（默认 500）。

## 2.3 数据模型（`shared/src/types/assistant.ts`）

```ts
type AssistantProvider = 'openai-compatible' | 'ollama' | 'disabled';

interface KnowledgeModuleMeta { id; name; description; type:'builtin'|'custom'; version; tags; enabled; createdAt; updatedAt; docCount; indexedDocCount; }
interface KnowledgeDocumentMeta { id; moduleId; title; type:'md'|'txt'; createdAt; updatedAt; charCount; }
interface KnowledgeChunk { id; moduleId; documentId; documentTitle; index; text; heading; start; end; }

interface SearchHit { chunk: KnowledgeChunk; moduleName; score; keywordScore; semanticScore; }
interface SearchResult { query; hits: SearchHit[]; elapsedMs; }

interface ChatMessage { id; role:'user'|'assistant'|'system'; content; createdAt; references?: ChatReference[]; metadata?: ChatMessageMetadata; }
interface ChatReference { moduleName; documentTitle; heading; snippet; moduleId?; documentId?; }
interface ChatMessageMetadata { references?; tokens?; analysis?: LogAnalysisResult; command?: CommandResult; error?: boolean; logText?: string; }

interface ConversationMeta { id; title; createdAt; updatedAt; messageCount; lastPreview; }
interface Conversation { id; title; createdAt; updatedAt; messages: ChatMessage[]; }

interface LogAnalysisResult { protocol; confidence; keyFields: {label,value}[]; anomalies: {type,description,severity:'high'|'medium'|'low'}[]; suggestions: string[]; }
interface CommandResult { hex; ascii; explanation; }
interface QuickPrompt { id; label; prompt; category?: 'analysis'|'query'|'generate'; }
```

## 2.4 存储布局（插件用户数据目录）

`<userData>/plugins-data/qserial-plugin-assistant/`

```
├── knowledge/
│   ├── modules.json          # KnowledgeModuleMeta[]
│   ├── docs.json             # KnowledgeDocumentMeta[]
│   └── documents/<docId>.<ext>   # 文档正文（.md/.txt）
├── index/<moduleId>.json     # 向量索引（见 §2.5）
└── conversations/<id>.json   # 每会话一个文件（见 §2.7）
```

- 插件数据目录解析：`app.getPath('userData')/plugins-data/<pluginId>`（入口 `index.mjs` 用 `import { app } from 'electron'`）。
- **注意**：插件直接使用 `node:fs`/`node:path`（宿主未提供文件存储 API，属必要偏差）。

## 2.5 向量存储与检索（核心算法）

**向量化（`assistant-embedding.ts`）**：字符 n-gram 特征哈希（无外部服务、无第三方依赖）。
1. `tokenize`：英文/数字单词 + 单个中文字符。
2. 生成 1/2/3-gram，用 FNV-1a 哈希到 512 维，符号由哈希最低位决定（signed hashing trick）。
3. L2 归一化 → 余弦相似度即点积。

**分块（`assistant-chunker.ts`）**：空行切段落 → 相同标题合并（≤chunkSize）→ 超长块硬切 → 相邻块重叠 overlap（默认 50）。

**检索（`assistant-retriever.ts`）**：混合 = 关键词（token/gram 重叠度）与语义（余弦）加权融合（alpha=0.5），返回 topK。

**索引文件格式（`vector-store.mjs`）**：
```json
{ "version": 1, "moduleId": "…", "entries": [
  { "chunkId": "docId:0", "moduleId": "…", "documentId": "…", "documentTitle": "…",
    "heading": "…", "index": 0, "text": "…", "start": 0, "end": 120,
    "vector": [0.01, -0.02, …] }
] }
```
- 索引缺失/损坏（`loadIndex` 返回 null）→ 自动重建。
- 文档增删改后自动重建该模块索引（`_reindexModule`）。
- 首启播种内置模块并建索引；`rebuildIndex` 支持进度回调 + 取消 token。

## 2.6 LLM 调用（`llm.mjs`）

- OpenAI 兼容：`POST {baseUrl}/chat/completions`，流式 `stream:true` 解析 SSE（`data:` 行，`choices[0].delta.content`）。
- `chatOnce` 非流式；`embedTexts` 预留（v1 未启用）。
- 错误格式化 `formatHttpError`：解析响应体 `error.message`，若含「supported model names are ...」则提取「可用模型：a / b / c」单独一行。

## 2.7 会话存储（`conversation.mjs`）

每会话一个 JSON 文件：
```json
{ "id": "conv-…", "title": "CRC 计算", "createdAt": 1700000000000,
  "updatedAt": 1700000000000, "messages": [ { "id":"…", "role":"user", "content":"…", "createdAt":…, "references":[…] } ] }
```
- 旧版「裸数组」格式自动迁移。
- `list()` 读所有文件 → 按 updatedAt 降序返回 `ConversationMeta[]`，损坏文件跳过。
- `prune(maxCount=50)` 删除最旧；`appendMessage` 截断至 200 条。
- 自动标题：首轮对话后 `chatOnce` 生成 ≤15 字标题，失败降级「新对话 YYYY-MM-DD」。

## 2.8 结构化日志分析（PR-304）

- `buildLogAnalysisPrompt(text, deviceContext)` → system prompt 要求输出 JSON（protocol/confidence/keyFields/anomalies/suggestions）。
- `service.analyzeLogSync(text, deviceContext)`：配置 AI 时返回 `{raw, parsed}`（`parseAnalysisResult` 解析）；未配置时返回本地启发式纯文本。
- 前端 `AnalysisCard` 渲染结构化卡片；解析失败降级纯文本。
- 本地启发式：正则统计 AT 行 / 十六进制帧行 / 错误关键词。

## 2.9 命令生成（PR-305）

- `buildCommandPrompt(description, deviceContext)` → 输出 JSON（hex/ascii/explanation）。
- `parseCommandResult` 解析；前端 `CommandCard` 双模式（hex/ASCII）+ 字节解释 + 发送/复制/存模板。
- 模板存 `ctx.config.get('templates')`（数组）。

## 2.10 IPC 方法清单（`service.registerIpc`）

| 方法 | 入参 | 返回 |
| --- | --- | --- |
| `config` | — | provider/baseUrl/apiKeySet/model/embeddingModel/topK/chunkSize/configured |
| `quickPrompts.list/save/reset` | save:{list} | QuickPrompt[] |
| `deviceContext` | — | 连接列表 |
| `modules.list/create/update/delete/setEnabled/export/import` | 见名 | 模块元信息 |
| `docs.list/get/create/update/delete/upload` | 见名 | 文档元信息/内容 |
| `index.rebuild/cancelRebuild/status/docs` | rebuild:{moduleId?,token} | 结果 / 状态 |
| `search` | {query,moduleIds?,topK?} | SearchResult |
| `chat`（流式） | {requestId,query,history,deviceContext,conversationId} | {ok,requestId,streaming} |
| `chatSync` | {query,history,deviceContext} | {content,references} |
| `analyzeLog` | {text,deviceContext} | {raw,parsed} |
| `generateCommand` | {description,deviceContext} | {raw,parsed} |
| `templates.list/save/delete` | 见名 | 模板数组 |
| `conversations.list/get/create/rename/delete/clear/search` | 见名 | 会话 |

**事件（`ctx.ipc.emit` → 渲染 `plugin.onEvent`）**：`chat.delta`、`chat.done`（含 `conversation` 摘要）、`chat.error`、`index.progress`。

## 2.11 MCP 工具（`mcp-tools.mjs`）

`assistant.search` / `assistant.ask` / `assistant.analyzeLog` / `assistant.generateCommand` / `knowledge.listModules`（`inputSchema` 标准 MCP 定义，返回 JSON 字符串）。

## 2.12 渲染层架构

- **store**（`stores/assistant.ts`）：单例 Zustand，`open/activeTab/conversations/activeConversationId/messages/streaming/streamingStatus/input/generateMode/commandResult/quickPrompts/templates/config/modules/docs/indexStatus/indexDocs/indexing/…`；动作覆盖会话/对话/知识库/快捷指令/模板/索引；事件桥 `initAssistantBridge` 路由 `chat.delta/done/error`、`index.progress`。
- **组件**（`components/assistant/`）：
  - `AssistantPanel`（面板壳 + Tab）
  - `ConversationList`（会话侧栏，可折叠）
  - `ChatTab`（消息流 + 快速 prompt + 输入 + 状态）
  - `Markdown`（自研渲染）、`AnalysisCard`、`CommandCard`
  - `KnowledgeBaseTab`（三栏 + 索引状态栏）
- **集成点**：`Layout.tsx` 挂载 `AssistantPanel`；`Sidebar.tsx` 加「智能助手」入口；`TerminalPane.tsx` 右键「用助手分析」+「AI 生成」按钮；`App.tsx` 调 `initAssistantBridge()`。

## 2.13 测试

- 纯逻辑单测在 `packages/shared/__tests__/assistant/`（chunker/embedding/retriever/prompt/knowledge/conversation/markdown/analysis，共 82 例）。
- 插件 `.mjs` 用 `node --check` 语法校验 + Node 冒烟（模拟 ctx 验证播种/索引/会话/检索/降级）。

---

# 第三部分：移植清单（最小可行宿主面）

要在新项目跑通本插件，需按序落地：

1. **共享类型 + 纯逻辑**：直接复制 `packages/shared/src/types/assistant.ts` + `utils/assistant-*.ts`（零依赖）。
2. **宿主插件系统最小面**：manifest 解析、`import()` 加载、`activate(ctx)`、权限裁剪、`ctx.config`（点号键 + 拍平）、`ctx.ipc.register/emit` + `plugin:invoke`/`plugin:event` 通道。
3. **插件目录**：整体复制 `plugins/qserial-plugin-assistant/`，改数据目录解析（去掉 electron 依赖则用 `process.env` 注入）。
4. **渲染层**：复制 `stores/assistant.ts` + `components/assistant/`，接上 `window.qserial.plugin.invoke/onEvent` 桥。
5. **验证**：跑共享单测 → Node 冒烟 → 启动后测「知识库播种 + 检索 + 会话 + 分析」。

## 关键移植注意点

- 点号配置键必须**写时嵌套、读时拍平**（否则配置面板回显失败）。
- 插件运行时依赖 Node 全局 `fetch`（Node ≥ 18）与 `node:fs`。
- 向量/分块/Markdown 均零第三方依赖，可整体搬运。
- `ui.contribute` 仅入口注册，真实 UI 靠宿主组件 + IPC 桥。
