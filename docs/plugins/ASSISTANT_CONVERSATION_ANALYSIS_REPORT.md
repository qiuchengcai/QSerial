# 智能助手插件 — 对话历史管理与日志分析结构化报告

- **日期**：2026-09-07
- **仓库**：D:\WorkSpace\QSerial
- **范围**：`qserial-plugin-assistant` 插件（对话历史、Markdown 对话 UI、快捷指令、结构化日志分析、命令生成闭环、索引体验）

## 一、已完成（PR-301 ~ 306）

- [x] PR-301 对话历史管理（多会话列表、自动标题、每会话一文件、搜索、清理）
- [x] PR-302 对话 UI 重构（Markdown 渲染、引用统一、状态反馈、多行输入、✨ 按钮）
- [x] PR-303 快捷 prompt 优化（6 个默认、横向滚动、分类、增删改排序/重置）
- [x] PR-304 日志分析结构化（协议/关键信息/异常/建议/原始日志，JSON 解析+降级）
- [x] PR-305 命令生成闭环（hex/ASCII 双模式、字节解释、发送/复制/存模板）
- [x] PR-306 索引状态与知识库体验（状态栏、进度、失败标记、排序、重建确认+取消）

## 二、关键决策及理由

1. **会话存储**：每会话一个 JSON 文件（`conversations/<id>.json`），对象含 `id/title/createdAt/updatedAt/messages[]`。兼容旧版「裸数组」格式自动迁移；最多保留 50 个（可配置），超出自动清理最旧。
2. **自动标题**：首轮对话后用 LLM 生成 ≤15 字标题；失败降级「新对话 + 日期」。
3. **Markdown 渲染**：自研轻量解析器（`shared/src/utils/assistant-markdown.ts`），覆盖标题/列表/代码块（含语言+复制）/表格/引用/行内样式。不引入第三方依赖，与「本地优先、零外部依赖」约束一致。
4. **结构化日志分析**：prompt 引导 LLM 输出 JSON，前端 `parseAnalysisResult` 解析（支持直接 JSON / 围栏 / 花括号提取三种容错）；解析失败降级纯文本。结构化不依赖特定模型。
5. **快捷指令**：存插件 config 命名空间，管理 UI 内置于助手面板（**偏差**：任务要求「配置页」管理，但插件详情配置页为核心代码，按「不修改核心代码」约束改为面板内管理）。
6. **命令生成**：hex / ASCII 双模式 + 逐字节解释；模板存插件 config，跨会话可用。
7. **索引进度**：`ctx.ipc.emit('index.progress')` 推送进度 + token 取消（偏差：取消为 token 失效，非中断进行中的单文档向量化）。

## 三、改动文件清单

**共享纯逻辑**（新增/扩展，可单测）：
- `shared/src/types/assistant.ts`：新增 `ConversationMeta/Conversation/LogAnalysisResult/CommandResult/QuickPrompt/ChatMessageMetadata`，扩展 `ChatReference`。
- `shared/src/utils/assistant-conversation.ts`：会话 CRUD 纯逻辑。
- `shared/src/utils/assistant-markdown.ts`：Markdown 块解析 + 行内解析。
- `shared/src/utils/assistant-analysis.ts`：日志分析/命令生成 prompt + JSON 解析 + 6 个默认快捷指令。
- `shared/src/utils/assistant-prompt.ts`：改为上角标引用（去掉正文【引用来源】）。

**插件后端**：
- `plugins/qserial-plugin-assistant/lib/conversation.mjs`：多会话文件存储（重写）。
- `plugins/qserial-plugin-assistant/lib/service.mjs`：新增 conversations/quickPrompts/templates/analyzeLog(JSON)/generateCommand(JSON)/index.docs/index 进度与取消。

**渲染层**：
- `stores/assistant.ts`：多会话 + 结构化结果 + 索引进度（重写）。
- `components/assistant/`：新增 `Markdown.tsx`、`AnalysisCard.tsx`、`CommandCard.tsx`、`ConversationList.tsx`；重写 `AssistantPanel.tsx`、`ChatTab.tsx`、`KnowledgeBaseTab.tsx`。

## 四、测试结果

- 新增单元测试 **33 用例**：conversation 13 / markdown 8 / analysis 12。
- 全量 **364 用例通过**（33 文件），零回归。
- 构建通过（shared + main + renderer）；ESLint 0 error。
- 插件 `.mjs` 通过 `node --check`；Node 冒烟验证会话 CRUD、快捷指令保存/重置、本地日志分析降级、索引播种。

## 五、遗留风险

1. 上角标引用 `[n]` 目前为编号展示，未实现「点击滚动到来源区」的完整交互（来源区紧邻回答，可点击「查看」跳转知识库文档）。
2. 索引取消为 token 失效，非真正中断进行中的单文档向量化。
3. 会话数据损坏时读取返回 null（不崩溃），但 UI 未弹「修复」提示，仅静默跳过。
4. 结构化分析在未配置 AI 时返回本地启发式纯文本（非 JSON 结构）。
5. 命令模板管理无独立 UI（仅生成时「保存为模板」，未提供模板列表浏览/删除入口）。

## 六、下一步建议

1. 上角标点击滚动 + 引用高亮联动。
2. 命令模板独立管理 UI（列出/删除/编辑）。
3. 会话损坏时给出「修复/删除」提示。
4. 本地启发式分析也输出结构化 JSON（协议/字段用正则提取）。
5. 消息 token 用量统计与展示。

## 七、验收对照表

| 需求 | 状态 | 证据 |
| --- | --- | --- |
| PR-301 多会话/自动标题/每会话一文件/搜索/清理 | ✅ | `conversation.mjs`、`assistant-conversation.ts`、`ConversationList.tsx` |
| PR-302 Markdown/引用统一/状态反馈/多行输入/✨ | ✅ | `Markdown.tsx`、`ChatTab.tsx`、`assistant-markdown.ts` |
| PR-303 6 默认/横向滚动/分类/自定义管理 | ✅ | `assistant-analysis.ts`(DEFAULT_QUICK_PROMPTS)、`ChatTab.tsx`(PromptManager) |
| PR-304 结构化日志分析/JSON 解析/降级 | ✅ | `AnalysisCard.tsx`、`assistant-analysis.ts`、`service.analyzeLogSync` |
| PR-305 命令 hex/ASCII/解释/发送/复制/模板 | ✅ | `CommandCard.tsx`、`service.generateCommandSync` |
| PR-306 索引状态栏/进度/失败标记/排序/确认+取消 | ✅ | `KnowledgeBaseTab.tsx`、`service.index.*` |
| 单元测试 ≥18 用例 | ✅ | 33 用例 |
| 构建通过、零回归 | ✅ | 364 tests + 全量 build |

## 八、E2E 交互（待用户验证）

1. **会话管理**：打开助手 → 对话 Tab 左侧出现会话列表；点「新建会话」→ 输入区自动聚焦；右键会话可重命名/清空/删除；底部可搜索。
2. **自动标题**：配置 AI 后新建会话发第一个问题，回复完成后会话标题自动生成（≤15 字）；未配置 AI 时标题为「新对话 + 日期」。
3. **Markdown 与引用**：问「Modbus 功能码有哪些」，回答按标题/列表/表格渲染，代码块带复制按钮；回答不再出现【引用来源】列表，改在气泡下方「引用来源」区，点「查看」跳知识库文档。
4. **快捷指令**：顶部一行横向滚动；点「管理」可增删改排序/重置默认。
5. **结构化日志分析**：串口终端选中日志 → 右键「用助手分析」→ 弹出结构化卡片（协议/关键信息/异常红标/建议/折叠原始日志），附复制/重新分析/保存到知识库。
6. **命令生成**：点输入框左侧 ✨ → 描述需求（如「读从站 1 的保持寄存器 0x0000」）→ 生成 hex/ASCII 命令 → 发送到串口/复制/保存模板。
7. **索引状态**：知识库 Tab 顶部显示「已索引 X/Y 篇文档」进度条；重建索引弹确认框并显示进度，可取消；文档列表显示字数与索引状态（绿点=已索引，红点=未索引），支持按名称/时间/字数排序。
