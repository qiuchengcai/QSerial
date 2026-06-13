# QSerial 后续开发与优化方案

> v0.2.0 → v0.4.0 路线图
> 基于：Phase 1-3 优化复盘 + Phase 4 AI 增强成果 + MCP 协议分析 + AI 技术趋势
> 更新：2026-05-28

---

## 一、当前基线

### 已完成

| 阶段 | 内容 | 提交 |
|------|------|------|
| Phase 1 | MCP SDK 迁移、安全加固（127.0.0.1 + Bearer）、测试基线 | 670ea66 |
| Phase 2 | Electron 28→35、移除废弃 SerialServer | ea033c3 |
| Phase 3 部分 | CI/CD pipeline（GitHub Actions）、68 个单元测试 | 0a86c73 |
| Phase 4 | `send_command` / `get_history` / `run_script` / 结构化错误码 / AT 解析 / 提示符提取 | 本次会话 |

### 当前 MCP 工具：24 个 | 单元测试：68 个 | 连接协议：4 种 | 文件传输：5 种

### 未闭合的技术债

| 项目 | 来源 | 严重度 |
|------|------|:------:|
| Phase 3: `services/` 目录重整 | 原始方案 | 🟡 |
| Phase 3: SSH Jump Host | 原始方案 | 🟡 |
| Phase 3: i18n 国际化 | 原始方案 | 🟡 |
| Phase 3: 独立 SFTP 客户端 | 原始方案 | 🟢 |
| Phase 3: 终端录屏回放 | 原始方案 | 🟢 |
| Phase 3: 插件系统 | 原始方案 | 🟢 |
| README 声称 13 工具，实际 24 | 文档滞后 | 🟡 |
| MCP 协议版本 2024-11-05 | 版本滞后 | 🟢 |
| CORS 全放通 | 安全 | 🟡 |

---

## 二、总体路线

```
v0.2.x (当前)         v0.3.0                v0.3.x               v0.4.0
   │                     │                     │                    │
   ├─ Phase 4 ✅         ├─ MCP 标准原语      ├─ AI 智能特性      ├─ 平台化
   │  send_command       │  Resources         │  设备识别          │  插件系统
   │  get_history        │  Notifications     │  NL 命令           │  社区模型库
   │  run_script         │  Sampling          │  多设备编排        │  硬件 CI/CD
   │  结构化错误          │  Progress          │  异常检测          │  数字孪生
   │                     │  Cancellation      │  会话摘要          │
   │                     │                    │  排障向导          │
   │                     ├─ 功能补全          │                    │
   │                     │  Jump Host         │                    │
   │                     │  i18n              │                    │
   │                     │  README 更新       │                    │
   │                     │  CORS 加固         │                    │
   │                     │  services 重整     │                    │
   └─────────────────────┴────────────────────┴────────────────────┘
```

---

## 三、v0.3.0：MCP 平台化 + 功能补全（2-3 周）

### 3.1 MCP 标准原语实现

#### 3.1.1 Resources — 设备上下文暴露（P0）

```
资源列表：
  qserial://connections/list     → 当前所有连接状态（JSON）
  qserial://serial/ports          → 可用串口列表（JSON）
  qserial://docs/{device-models}  → 设备知识库目录
  qserial://docs/esp32-at         → ESP32 AT 指令集（Markdown）
  qserial://docs/uboot-commands   → U-Boot 命令参考（Markdown）
  qserial://sessions/list         → 已保存会话列表（JSON）
  qserial://screenshot/latest     → 最新终端截图（SVG）
```

**实现**：新建 `packages/main/src/mcp/resources.ts`，注册到 `McpServer` 实例。

**影响**：AI 连接设备后可自动发现文档，无需用户手动提供。`tools/list` 可被 `resources/list` 替代部分场景。

---

#### 3.1.2 Notifications — 异步事件推送（P0）

```
通知类型：
  connection/connected       → { id, type, name }
  connection/disconnected    → { id, reason }
  connection/data_alert      → { id, pattern_matched, context }
  session/saved              → { id, name }
  session/deleted            → { id }
  script/step_completed      → { step, total, ok }
  share/started              → { share_id, port }
  share/stopped              → { share_id }
```

**实现**：在现有 `ConnectionFactory.onDestroy` 等事件回调中触发 MCP `server.sendNotification()`。

**影响**：AI 无需轮询 `connection_state`，改为被动接收事件。断连时即时响应。

---

#### 3.1.3 Sampling — 服务端反向请求 AI 决策（P0）

```
触发场景：
  1. 设备输出匹配到关键模式（panic、error、watchdog）
     → QSerial 暂停执行，请求 AI 决策下一步
  2. connection_login 遇到未知提示符
     → QSerial 发 Sampling 请求："这个提示符需要用户名还是密码？"
  3. run_script 步骤失败
     → QSerial 发 Sampling："第 3 步超时，选项 A: 重试 B: 跳过 C: 终止"
```

**实现**：`createMessage()` API，LLM 返回 `role: "assistant"` 的决策。

**关键点**：这是 QSerial 从"被动工具"到"主动协作"的质变。

---

#### 3.1.4 Progress — 长时间操作进度（P1）

```
适用工具：
  connection_send_file     → { bytes_sent, total_bytes, percent }
  connection_run_script    → { current_step, total_steps, step_desc }
```

**实现**：`server.sendProgress(token, progress, total?)`。

---

#### 3.1.5 Cancellation — 操作取消（P1）

```
适用工具：
  connection_send_command  (timeout 等待中)
  connection_run_script    (执行中)
  connection_send_file     (传输中)
  connection_expect        (等待模式中)
```

**实现**：使用 `AbortController` 模式，每个长时间操作注册一个 `cancelToken`。

---

### 3.2 功能补全

| 编号 | 项目 | 说明 | 工作量 |
|:----:|------|------|:------:|
| F1 | **SSH Jump Host** | `ssh2` 库原生支持，`SshConnectionOptions` 加 `jumpHost` 字段 | 3h |
| F2 | **i18n 国际化** | `react-i18next` + 中/英文，优先菜单栏、连接对话框、设置面板 | 4h |
| F3 | **README 更新** | 24 个工具列表、AI 增强特性、新的 `.mcp.json` 示例 | 1h |
| F4 | **CORS 白名单** | `Access-Control-Allow-Origin: *` → 可配置域名列表 | 0.5h |
| F5 | **MCP 协议版本** | `2024-11-05` → `2025-03-26`，升级 SDK 依赖 | 1h |
| F6 | **services/ 目录重整** | ftp/tftp/nfs/sftp/mcp/connection → `services/` | 2h |

---

## 四、v0.3.x：AI 智能特性（2-3 周）

### 4.1 设备自动识别

**`connection_probe` 工具**：

```
流程：
1. 尝试常用波特率 {9600, 115200, 57600, 921600}
2. 每个波特率发 \r\n → 收 2 秒数据
3. 匹配内置特征库：
   - "ets Jun  8 2016" → ESP32
   - "U-Boot SPL"       → U-Boot 设备
   - "login:"           → Linux 设备
   - 无响应             → 需手动配置
4. 返回：{ device_type, baud_rate, firmware_hint, recommended_tools[] }
```

**特征库**：JSON 文件，社区可贡献。初版内置 10 种常见设备。

---

### 4.2 自然语言命令

**`connection_send_nl` 工具**：

不需要在 QSerial 内嵌 AI。策略：QSerial 暴露设备知识库（Resources），AI 客户端自己查文档翻译命令。

```
但需要增强 Resources：
  qserial://docs/{device}/commands  → 结构化命令参考
  {
    "commands": [
      { "name": "wifi_connect",    "description": "连接 WiFi",
        "syntax": "AT+CWJAP=\"<ssid>\",\"<pwd>\"",
        "example": "AT+CWJAP=\"MyWiFi\",\"123456\"",
        "expect": "OK", "timeout_ms": 10000 },
      ...
    ]
  }
```

AI 客户端有了结构化命令参考，自然语言翻译就是 MCP Client 的能力，不需要 QSerial 自己做。

---

### 4.3 异常检测与告警

**`connection_watch` 工具**：

```
参数：
{
  "id": "conn-xxx",
  "rules": [
    { "pattern": "panic|kernel fault|watchdog",    "regex": true, "level": "critical" },
    { "pattern": "error|fail|timeout",             "regex": true, "level": "warning" },
    { "pattern": "warn",                           "regex": true, "level": "info" },
    { "silence_timeout_ms": 60000,                 "level": "warning" }
  ],
  "duration_ms": 60000  // 持续监控 60 秒（0 = 无限）
}
```

每匹配一条规则 → 发 `connection/data_alert` Notification。

---

### 4.4 会话摘要

**`connection_summarize` 工具**：

基于 `connection_get_history` 的原始数据，服务端做基础统计，详细的 AI 分析留给客户端：

```
返回 {
  "duration_ms": 360000,
  "total_commands": 47,
  "total_bytes_sent": 1234,
  "total_bytes_received": 56789,
  "timed_out": [{ step: 12, command: "AT+CIPSTART" }, { step: 28, command: "..." }],
  "state_changes": [
    { ts: "...", from: "connected", to: "disconnected", reason: "..." },
    { ts: "...", from: "disconnected", to: "connected" }
  ],
  "error_patterns": [{ pattern: "timeout", count: 3 }],
  "key_outputs": [...]
}
```

---

## 五、v0.4.0：平台化（1-2 月）

### 5.1 插件系统

```
plugins/
└── community-espat/
    ├── .codex-plugin/plugin.json   → { name, version, contributes: { resources, tools, prompts } }
    ├── resources/
    │   └── espat-commands.md       → 自动注册为 qserial://docs/espat
    ├── tools/
    │   └── espat.ts                → 注册自定义 MCP 工具（如 espat_scan_ap）
    └── models/
        └── esp32.json              → 设备特征 + 默认配置
```

插件可贡献：MCP Resources、MCP Tools、MCP Prompts、设备特征模型。社区模型库自然形成。

---

### 5.2 设备模型市场

```
qserial://models/
├── esp32-devkit-v1.json
├── stm32f4-discovery.json
├── raspberry-pi-4.json
├── cisco-ios-router.json
└── ...
```

每个模型定义：`probe_patterns`、`default_baud`、`command_set`、`common_scripts`、`known_issues`。

---

### 5.3 硬件 CI/CD 集成

```
GitHub Actions workflow:
  - uses: qserial/setup@v1
  - run: qserial test --device COM3 --script ci-test.json
```

命令行模式 + 结构化输出（JUnit XML 报告 + MCP JSON 日志）。

---

## 六、v0.3.0 详细任务分解

### Week 1：MCP 原语核心

```
Day 1-2  □ Resources 实现
         □ 注册 5 个标准资源 URI
         □ McpServer 集成

Day 3    □ Notifications 实现
         □ 7 种通知类型
         □ 在连接生命周期事件中触发

Day 4-5  □ Sampling 实现
         □ 关键事件触发逻辑
         □ 3 种 Sampling 场景
```

### Week 2：功能补全

```
Day 6    □ SSH Jump Host
         □ SshConnectionOptions 扩展
         □ connection_create 支持 jumpHost

Day 7    □ i18n 初始化
         □ react-i18next 集成
         □ zh-CN + en-US 基础翻译

Day 8    □ README + CORS + MCP 协议版本
         □ 文档更新

Day 9-10 □ 测试 + 回归 + 发布 v0.3.0
```

---

## 七、成功标准

### v0.3.0

- [ ] MCP Resources 返回 5 个标准资源
- [ ] Notifications 在连接断连时即时推送
- [ ] Sampling 在设备 panic 时请求 AI 决策
- [ ] SSH Jump Host 可连接跳板机后的目标
- [ ] 菜单栏支持中/英文切换
- [ ] 所有 68 个测试通过
- [ ] `pnpm build` 零错误

### v0.3.x

- [ ] `connection_probe` 能识别 10 种常见设备
- [ ] `connection_watch` 持续监控不阻塞
- [ ] `connection_summarize` 返回结构化统计

### v0.4.0

- [ ] 至少 3 个社区插件
- [ ] GitHub Actions 硬件测试流水线可运行

---

## 八、风险与依赖

| 风险 | 缓解 |
|------|------|
| MCP SDK 版本兼容 | 渐进升级，`2024-11-05` → `2025-03-26` 先做兼容测试 |
| Sampling 依赖客户端 AI 能力 | Sampling 为可选特性，客户端不支持时回退到常规模式 |
| 插件系统复杂度 | v0.4.0 先做最小可用版本：只支持 Resources 贡献 |
| i18n 翻译工作量 | 初版只覆盖核心 UI（约 100 个 key），社区贡献其余 |
