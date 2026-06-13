# QSerial 开发路线图

> v0.2.0 → v0.4.0 | 最后更新：2026-06-13

---

## 当前基线 (v0.2.0)

| 维度 | 状态 |
|------|------|
| MCP 协议 | `@modelcontextprotocol/sdk` v1.29，streamableHttp + SSE |
| MCP 工具 | 43 个（9 个命名空间），Resources 6 个，Notifications 8 种 |
| 连接协议 | Serial / SSH / Telnet / PTY + SFTP / TFTP / FTP / NFS |
| 前端 | Electron 35 + React 18 + xterm.js 5 + Tailwind CSS |
| 测试 | 68 个单元测试 + CI/CD (GitHub Actions) |
| 安全 | 默认 127.0.0.1 + Bearer Token 认证 |
| 功能 | 宏录制回放、多标签管理、连接共享、插件系统、i18n 双语 |

---

## 已完成

| 阶段 | 内容 |
|------|------|
| Phase 1 | MCP SDK 迁移 → 安全加固（127.0.0.1 + Bearer）→ 32 个测试 |
| Phase 2 | Electron 28→35 → 移除废弃 SerialServer |
| Phase 3 | CI/CD pipeline → 68 个单元测试 → IPC 合同测试 |
| Phase 4 | send_command / get_history / run_script / AT 解析 / 提示符提取 / 结构化错误码 / 插件系统 / i18n / Resources / Notifications / Sampling / Prompts |

---

## 待完成

### P1 — 代码质量

- [ ] `services/` 模块目录重整（目前 MCP manager.ts 超 2400 行）
- [ ] 测试覆盖提升至 60%+
- [ ] AI_USAGE.md 工具名与新命名空间同步

### P2 — 功能增强

- [ ] SSH Jump Host（跳板机）
- [ ] 独立 SFTP 客户端（不依赖 SSH 连接）
- [ ] 终端录屏回放（WebM 录制 + 时间轴回放）
- [ ] 宏编程（条件/循环/变量）

### P3 — AI 原生特性

- [ ] 设备自动识别增强（基于输出指纹匹配 20+ 设备）
- [ ] 自然语言命令翻译（"帮我把 WiFi 连上" → AT 指令序列）
- [ ] 多设备编排（一个 AI 同时管理多台设备）
- [ ] MCP Resources 设备知识库（esp32-at-commands / uboot-reference 等）

### P4 — 平台化

- [ ] 社区插件市场（plugin.json 注册 → npm 安装）
- [ ] 社区提示模板库（设备配置向导）
- [ ] 硬件 CI/CD CLI（`qserial-test --script flash.json --device COM3`）
- [ ] macOS / Linux 正式支持

---

## 版本规划

```
v0.2.x (当前)         v0.3.0               v0.4.0
   │                     │                    │
   ├─ 已完成 ✅           ├─ P1 代码质量       ├─ P4 平台化
   │                     ├─ P2 功能增强       │  插件市场
   │                     ├─ P3 AI 特性        │  CI/CD CLI
   │                     │                    │  macOS/Linux
```

---

详细各阶段的设计方案见 [archive/](archive/)。
