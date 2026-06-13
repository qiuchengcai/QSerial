# MCP AI 操作增强方案

> 基于 v0.2.0 MCP 工具的 AI Agent 操作体验优化
> 创建：2026-05-28

---

## 现状分析

当前 MCP 注册 21 个工具，覆盖了连接管理、数据读写、设备发现、会话持久化、截图等基础能力。但从 AI Agent 视角来看，存在以下核心摩擦：

| 摩擦点 | 表现 | 根因 |
|--------|------|------|
| 命令交互需多步组合 | write → expect → read 三步 | 缺少原子化 send-command |
| 返回数据噪声大 | 混杂命令回显、提示符 | 未做输出清洗 |
| 错误不可程序化处理 | 只有中文错误字符串 | 缺少结构化错误码 |
| 无法回溯历史 | 读后即清，断连丢失上下文 | 无历史记录机制 |
| 批量操作繁琐 | 刷机/初始化需多次往返 | 无脚本执行能力 |

---

## 改进方案

### P0：connection_send_command（原子命令交互）

**目标**：一次调用完成 "发送命令 → 等待响应 → 返回干净输出"。

**输入参数**：

```typescript
{
  id: string;              // 连接 ID
  command: string;         // 要执行的命令（自动追加 \n）
  timeout_ms?: number;     // 等待超时，默认 5000
  expect_pattern?: string; // 自定义结束匹配模式（默认自动检测提示符）
  strip_echo?: boolean;    // 是否剥离命令回显，默认 true
  strip_prompt?: boolean;  // 是否剥离最后的提示符，默认 true
}
```

**输出格式**：

```json
{
  "success": true,
  "command": "ls -la",
  "output": "total 48\ndrwxr-xr-x  ...",   // 干净的命令输出
  "prompt": "root@device:~#",                 // 检测到的提示符
  "exit_code": null,                          // 保留字段
  "duration_ms": 234
}
```

**实现策略**：
- 调用 `connection_write(command + "\n", wait_before=prompt)`
- 内部利用现有 `analyzeState` 自动识别 shell 提示符作为结束条件
- 利用 `waitPattern` 等待提示符出现
- 将原始输出中的命令回显行和末尾提示符剥离

**影响文件**：`packages/main/src/mcp/manager.ts`

---

### P1：结构化错误码体系

**目标**：所有错误返回统一 JSON 格式，AI 可基于 `code` 做分支决策。

**错误码定义**：

| 错误码 | 含义 | AI 建议操作 |
|--------|------|-------------|
| `MISSING_PARAM` | 缺少必要参数 | 补充参数后重试 |
| `INVALID_PARAM` | 参数值非法 | 修正参数值 |
| `CONN_NOT_FOUND` | 连接 ID 不存在 | 检查连接列表 |
| `CONN_NOT_CONNECTED` | 连接未就绪 | 等待或重新连接 |
| `CONN_CLOSING` | 连接正在关闭 | 稍后重试 |
| `TIMEOUT` | 操作超时 | 增加超时或检查设备 |
| `AUTH_REQUIRED` | 需要认证 | 执行登录流程 |
| `UNSUPPORTED` | 不支持的操作/类型 | 换一种方式 |
| `INTERNAL` | 内部错误 | 报告给用户 |

**输出格式**：

```json
// 成功
{ "ok": true, "data": {...} }

// 失败
{ "ok": false, "code": "MISSING_PARAM", "detail": "缺少 id 参数" }
```

**影响文件**：`packages/main/src/mcp/manager.ts`（`executeTool` 中所有 case），`packages/main/src/mcp/utils.ts`

---

### P1：connection_get_history（交互历史）

**目标**：返回最近 N 对发送/接收记录，AI 断连后可快速恢复上下文。

**输入参数**：

```typescript
{
  id: string;        // 连接 ID
  max_entries?: number; // 最多返回条数，默认 20
}
```

**输出格式**：

```json
{
  "entries": [
    { "ts": 1716900000000, "dir": "send", "data": "ls -la\n" },
    { "ts": 1716900000123, "dir": "recv", "data": "total 48\n..." }
  ],
  "total_send_bytes": 12345,
  "total_recv_bytes": 67890
}
```

**实现策略**：
- 在 `ensureBuffer` 中增加环形历史记录（内存占用 < 1MB）
- 双向记录：通过 `conn.onData` 的已有订阅捕获接收；在 `connection_write` 和 `connection_write_hex` 中追加发送记录

**影响文件**：`packages/main/src/mcp/manager.ts`

---

### P2：connection_run_script（多步脚本）

**目标**：按顺序执行一组 {send, expect} 步骤，返回每步结果。

**输入参数**：

```typescript
{
  id: string;
  steps: Array<{
    send: string;             // 发送内容（自动追加 \n，除非以 \x 开头表示 hex）
    expect?: string;          // 等待匹配的模式
    expect_regex?: boolean;   // expect 是否为正则
    timeout_ms?: number;      // 单步超时，默认 5000
    delay_ms?: number;        // 发送前等待，默认 0
    description?: string;     // 步骤描述（用于日志）
  }>;
  stop_on_error?: boolean;    // 出错是否停止，默认 true
}
```

**输出格式**：

```json
{
  "completed": 3,
  "total": 5,
  "success": false,
  "results": [
    { "step": 0, "ok": true, "output": "...", "duration_ms": 120 },
    { "step": 1, "ok": true, "output": "...", "duration_ms": 340 },
    { "step": 2, "ok": false, "error": "TIMEOUT", "detail": "等待 '#' 超时" }
  ]
}
```

**影响文件**：`packages/main/src/mcp/manager.ts`

---

### P2：响应解析增强

**目标**：在 `connection_state` 和 `connection_send_command` 中提供更丰富的解析信息。

**增强项**：

1. **提示符提取**：`extractPrompt(output)` — 从输出中提取提示符文本（如 `root@device:~# `），供后续 expect 使用
2. **AT 响应解析**：`parseAtResponse(output)` — 解析 `+CMD: param1, param2` 和 `OK`/`ERROR` 格式
3. **JSON 检测**：如果输出体是合法 JSON，自动解析为对象放到 `parsed` 字段

**影响文件**：`packages/main/src/mcp/manager.ts`

---

## 实施顺序

```
P0: connection_send_command     (约 80 行新代码)
P1: 结构化错误码                   (约 40 行，修改 executeTool 返回格式)
P1: connection_get_history      (约 60 行，环形 buffer + 新工具)
P2: connection_run_script       (约 80 行，循环调用 send_command)
P2: 响应解析增强                   (约 60 行，新增辅助函数)
```

## 不变更项

- 现有 `connection_write` / `connection_read` / `connection_expect` **保持向后兼容**
- 新工具为**增量添加**，不影响现有 MCP 客户端
- 结构化错误码通过 `isError: true` 的 `content.text` 中嵌入 JSON 实现，兼容现有协议
