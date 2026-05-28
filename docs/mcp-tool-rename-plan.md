# MCP 工具命名空间重构方案 v1.0

> 状态: 待实施 | 日期: 2026-05-29

---

## 一、背景

当前 28 个 MCP 工具存在前缀不统一（`connection_`/`serial_`/`session_`/`window_`）、分类混乱、命名冗余的问题。本次重构采用 **二级/三级命名空间**，使工具结构清晰、语义准确、易于扩展。

## 二、设计方案

### 2.1 命名规则

```
<顶层域>.<子域>.<动作>
  │        │       │
  │        │       └─ 具体操作动词: create, list, write, start...
  │        └─ 可选子域: data, hw, script, watch, analyze, file
  └─ 顶层域: conn, device, session, app
```

### 2.2 完整映射表

#### `conn.*` — 连接生命周期 (6)

| 旧名 | 新名 | 说明 |
|------|------|------|
| `connection_create` | `conn.create` | 创建 serial/SSH/Telnet/PTY 连接 |
| `connection_disconnect` | `conn.disconnect` | 断开并销毁连接 |
| `connection_reconnect` | `conn.reconnect` | 重连已断开连接 |
| `connection_update` | `conn.update` | 更新窗口大小/波特率等参数 |
| `connection_list` | `conn.list` | 列出所有活跃连接 |
| `connection_share` | `conn.share` | TCP 共享 start/stop/list |

#### `conn.data.*` — 数据交互 (7)

| 旧名 | 新名 | 说明 |
|------|------|------|
| `connection_write` | `conn.data.write` | 发送文本数据 |
| `connection_write_hex` | `conn.data.write_hex` | 发送十六进制数据 |
| `connection_read` | `conn.data.read` | 读取输出缓冲区 |
| `connection_clear_buffer` | `conn.data.clear` | 清空缓冲区 |
| `connection_expect` | `conn.data.expect` | 等待匹配模式(子串/正则) |
| `connection_send_command` | `conn.data.send` | 发送命令+等待响应+去回显 |
| `connection_get_history` | `conn.data.history` | 获取收发历史记录 |

#### `conn.hw.*` — 硬件控制 (2)

| 旧名 | 新名 | 说明 |
|------|------|------|
| `connection_set_dtr_rts` | `conn.hw.dtr_rts` | 控制 DTR/RTS 串口信号 |
| `connection_set_break` | `conn.hw.break` | 发送 break 信号 |

#### `conn.script.*` — 脚本自动化 (2)

| 旧名 | 新名 | 说明 |
|------|------|------|
| `connection_run_script` | `conn.script.run` | 执行 {send,expect} 多步脚本 |
| `connection_login` | `conn.script.login` | 自动登录流程(Sampling) |

#### `conn.watch.*` — 模式监控 (2)

| 旧名 | 新名 | 说明 |
|------|------|------|
| `connection_watch` | `conn.watch.start` | 开始模式匹配监控+告警 |
| `connection_unwatch` | `conn.watch.stop` | 停止监控 |

#### `conn.analyze.*` — 连接分析 (3)

| 旧名 | 新名 | 说明 |
|------|------|------|
| `connection_state` | `conn.analyze.state` | 分析连接状态(login/shell/idle) |
| `connection_probe` | `conn.analyze.probe` | 探测设备类型(ESP32/STM32...) |
| `connection_summarize` | `conn.analyze.report` | 生成会话摘要(时长/命令/字节) |

#### `conn.file.*` — 文件传输 (1)

| 旧名 | 新名 | 说明 |
|------|------|------|
| `connection_send_file` | `conn.file.send` | XMODEM/YMODEM 文件发送 |

#### `device.*` — 设备发现 (1)

| 旧名 | 新名 | 说明 |
|------|------|------|
| `serial_list` | `device.ports` | 列出本机可用串口列表 |

#### `session.*` — 会话管理 (3)

| 旧名 | 新名 | 说明 |
|------|------|------|
| `session_list` | `session.list` | 列出已保存会话 |
| `session_save` | `session.save` | 保存连接为会话(id自动探测类型) |
| `session_delete` | `session.delete` | 删除已保存会话 |

#### `app.*` — 应用工具 (1)

| 旧名 | 新名 | 说明 |
|------|------|------|
| `window_screenshot` | `app.screenshot` | 捕获终端窗口截图 |

### 2.3 分类统计

| 命名空间 | 工具数 | 占比 |
|----------|--------|------|
| `conn.*` | 6 | 21% |
| `conn.data.*` | 7 | 25% |
| `conn.hw.*` | 2 | 7% |
| `conn.script.*` | 2 | 7% |
| `conn.watch.*` | 2 | 7% |
| `conn.analyze.*` | 3 | 11% |
| `conn.file.*` | 1 | 4% |
| `device.*` | 1 | 4% |
| `session.*` | 3 | 11% |
| `app.*` | 1 | 4% |
| **合计** | **28** | 100% |

## 三、影响范围

### 3.1 后端 (packages/main)

| 文件 | 变更 |
|------|------|
| `services/mcp/manager.ts` | MCP_TOOLS 数组 + executeTool switch-case |
| `services/mcp/tools.test.ts` | 测试用例工具名更新 |
| `__tests__/mcp/tools.test.ts` | 同上 |

### 3.2 前端 (packages/renderer)

| 文件 | 变更 |
|------|------|
| `components/dialogs/McpDialog.tsx` | ALL_TOOLS 数组 + 分类标签 |
| `dist/` | 重新构建 |

### 3.3 破坏性变更说明

- **向后兼容**：暂不实现别名路由，旧工具名直接失效
- 所有外部 MCP 客户端（Claude Code、CodeBuddy 等）需更新配置中的工具名引用
- Prompt 模板中的工具调用示例需同步更新

## 四、实施步骤

1. 更新 `manager.ts` — MCP_TOOLS 定义 + executeTool switch
2. 更新 `tools.test.ts` — 测试用例
3. 更新 `McpDialog.tsx` — 分类与展示
4. 全量构建 (`pnpm build`)
5. 运行测试 (`pnpm test`)
6. MCP 端到端测试