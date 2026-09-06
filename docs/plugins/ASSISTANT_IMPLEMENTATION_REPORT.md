# 智能助手插件开发报告

- **日期**：2026-09-07
- **仓库**：D:\WorkSpace\QSerial
- **范围**：`qserial-plugin-assistant` 插件（模块化知识库 + RAG 问答 + QSerial 深度整合）

## 一、已完成（PR-101 ~ 107）

- [x] PR-101 插件基础框架（manifest / configSchema / 侧边栏入口 / 对话 UI 骨架）
- [x] PR-102 模块化知识库核心（模块 / 文档 CRUD，本地 `knowledge/` 存储）
- [x] PR-103 向量存储与 RAG 检索（分块 + 向量化 + 混合检索 + 索引持久化与损坏重建）
- [x] PR-104 AI 对话能力（RAG→prompt→LLM 流式 + 历史 + 引用来源 + 错误处理）
- [x] PR-105 知识库管理 UI（对话 / 知识库 Tab，模块 / 文档 / 编辑器预览）
- [x] PR-106 内置知识模块（3 模块 × 5 文档，首启自动索引）
- [x] PR-107 QSerial 深度整合（日志右键分析 / AI 生成命令 / 上下文感知 / 快速 prompt）

## 二、关键决策及理由

1. **向量存储选型：自研纯 JS 哈希向量**（字符 n-gram 特征哈希 + L2 归一化 + 余弦相似度），未引入 vectra / transformers。
   - 理由：插件目录无独立 `node_modules`，运行时无法可靠加载第三方依赖；隐私要求默认不联网；10 模块 / 100 文档 / 10 万字规模下实测检索 < 10ms。
2. **分块策略**：按空行切段落 + 按字符数合并/硬切，保留最近标题层级，相邻 chunk 重叠 50 字符。
3. **UI 注入偏差（实测）**：宿主 `ui.contribute` 仅注册 `{label, kind}` 入口、**无渲染进程组件注入能力**。因此助手 UI 由核心渲染进程组件实现，插件经**新增的通用插件 IPC 桥**（`ctx.ipc.register/emit` + `plugin:invoke` / `plugin:event`）通信，未破坏插件规范、仅做最小宿主扩展。
4. **权限映射偏差（实测）**：任务要求的 `ui:inject:sidebar`、`storage` 权限不存在，分别映射为 `ui`（侧边栏入口）与 `config`（命名空间存储）；为支持双向通信新增通用 `ipc` 权限。
5. **存储位置**：`<userData>/plugins-data/qserial-plugin-assistant/knowledge/`，不污染全局配置；内置模块随插件发布、用户可禁用不可删。
6. **LLM 接入**：OpenAI 兼容接口（覆盖 Ollama / OneAPI 等），流式 SSE；未配置时仅本地检索并友好引导。
7. **embeddingModel 预留**：`ai.embeddingModel` 字段已在 schema 声明，v1 使用本地哈希向量（保证一致性），真实 embedding 留待后续接入（详见遗留风险）。

## 三、插件文件结构

```
plugins/qserial-plugin-assistant/
├── package.json          # 清单：权限 + configSchema
├── index.mjs             # 入口 activate / deactivate
└── lib/
    ├── service.mjs       # 编排：检索 / 对话 / 日志分析 / 命令生成 / IPC
    ├── store.mjs         # 模块 / 文档 CRUD 持久化
    ├── vector-store.mjs  # 向量索引持久化 + 分块向量化
    ├── llm.mjs           # OpenAI 兼容调用 + 流式
    ├── conversation.mjs  # 对话历史（本地 JSON，最近 N 轮）
    ├── builtin.mjs       # 3 个内置知识模块
    └── mcp-tools.mjs     # MCP 工具注册
```

共享纯逻辑（可测试）：`packages/shared/src/utils/assistant-{chunker,embedding,retriever,prompt,knowledge}.ts` + `types/assistant.ts`。

宿主桥（最小扩展）：`main/src/plugins/registry.ts`（IPC 注册表）、`host-api.ts`（`ctx.ipc`）、`ipc/handlers.ts`（`plugin:invoke`）、`preload.ts`（`plugin.invoke/onEvent`）。

## 四、核心 API 说明

**插件 IPC 方法**（渲染进程经 `plugin.invoke(pluginId, method, args)` 调用）：
`config` / `quickPrompts` / `deviceContext` / `modules.list|create|update|delete|setEnabled|export|import` / `docs.list|get|create|update|delete|upload` / `index.rebuild|status` / `search` / `chat`（流式）/ `chatSync` / `analyzeLog` / `generateCommand` / `conversations.list|get|clear`。

**插件事件**（`ctx.ipc.emit` → 渲染进程 `plugin.onEvent`）：`chat.delta` / `chat.done` / `chat.error`。

**MCP 工具**：`assistant.search` / `assistant.ask` / `assistant.analyzeLog` / `assistant.generateCommand` / `knowledge.listModules`。

**configSchema**：`ai.provider`（select）/ `ai.baseUrl` / `ai.apiKey` / `ai.model` / `ai.embeddingModel` / `rag.topK`（默认 5）/ `rag.chunkSize`（默认 500）。

## 五、测试结果

- 新增单元测试 **49 用例**（chunker 9 / embedding 9 / retriever 8 / prompt 7 / knowledge 16），覆盖模块 CRUD、文档分块、混合检索、prompt 组装。
- 全量 **328 用例通过**（30 文件），零回归。
- 构建通过：`shared`（tsc）+ `main`（tsc + esbuild preload）+ `renderer`（vite）。
- ESLint：0 error（53 warning，均为既有）。
- 插件 `.mjs` 通过 `node --check` 语法校验；Node 冒烟测试验证 3 模块播种、索引构建、检索命中、CRUD、IPC 注册。

## 六、遗留风险

1. `ai.apiKey` 以普通 `string` 呈现（宿主 configSchema 无 password 类型），未做密码框遮蔽。
2. `ai.embeddingModel` v1 未接真实 embedding，检索为哈希向量；接口已预留。
3. 设备上下文仅含连接类型 / 名称 / 串口路径，波特率等参数未持久化到 Session，暂未纳入。
4. 助手 UI 文本为中文硬编码，未接入 i18n。
5. 知识模块导入（`modules.import`）未做路径 / 体积安全校验，建议后续限制单文件大小。

## 七、下一步建议

1. 接入真实 embedding（OpenAI `/embeddings` 或 Ollama `nomic-embed-text`），并给索引打上 embedding 维度标记以触发自动重建。
2. 知识模块接入插件市场，支持第三方模块安装。
3. 助手 UI 补充 i18n（zh-CN / en-US）。
4. 增量索引：仅重新向量化变更文档。
5. Session 保存串口参数，丰富设备上下文。

## 八、验收对照表

| 需求 | 状态 | 证据 |
| --- | --- | --- |
| PR-101 manifest + configSchema + 侧边栏入口 | ✅ | `package.json`、`index.mjs`、`AssistantPanel.tsx` |
| PR-102 模块 / 文档 CRUD + 本地存储 | ✅ | `store.mjs`、`knowledge.test.ts` |
| PR-103 分块 / 向量化 / 混合检索 / 索引持久化 / 损坏重建 | ✅ | `vector-store.mjs`、`service.search`、`chunker/embedding/retriever.test.ts` |
| PR-104 流式对话 / 历史 / 引用来源 / 错误处理 | ✅ | `llm.mjs`、`service.chat`、`conversation.mjs` |
| PR-105 知识库 UI（三栏 + 空/加载/错误态） | ✅ | `KnowledgeBaseTab.tsx` |
| PR-106 内置 3 模块（≥5 文档/模块，≥5000 字） | ✅ | `builtin.mjs`（3×5 文档） |
| PR-107 日志分析 / 命令生成 / 上下文 / 快速 prompt | ✅ | `TerminalPane.tsx`（右键 + AI 按钮）、`service.analyzeLog/generateCommand` |
| 单元测试 ≥20 用例 | ✅ | 49 用例 |
| 构建通过、零回归 | ✅ | 328 tests + 全量 build |

## 九、E2E 交互（待用户验证）

1. **打开面板**：启动后点击侧边栏底部「智能助手」，右侧出现面板。
2. **知识库**：切换到「知识库」Tab，查看 3 个内置模块（Modbus RTU / AT 指令 / 串口排障），左侧开关可禁用，中间可搜索/新建/上传，右侧可编辑/预览/保存/重建索引。
3. **配置 AI（可选）**：`设置 → 插件 → 智能助手`，provider 选 Ollama，baseUrl 填 `http://localhost:11434/v1`，model 填本地模型名；或选 OpenAI 兼容填 API 地址与 Key。
4. **对话**：对话 Tab 输入「Modbus 的 CRC16 怎么算」，观察流式回答与「引用来源」；未配置 AI 时显示引导且仅能本地检索。
5. **日志分析**：在串口终端选中一段日志 → 右键「用助手分析」→ 面板自动弹出并分析。
6. **命令生成**：终端右上角「AI 生成」按钮 → 输入自然语言需求 → 生成命令 → 「发送到终端」。
