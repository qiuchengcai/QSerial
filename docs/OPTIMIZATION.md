# QSerial 项目优化方案

> 基于 v0.2.0 代码审查的技术框架优化计划
> 最后更新：2026-05-27

---

## 当前问题诊断

| 维度 | 问题 | 严重程度 |
|------|------|----------|
| 安全 | MCP 默认监听 0.0.0.0:9800 且无密码 | 🔴 高 |
| 协议 | MCP 1682 行自实现，未用官方 SDK | 🔴 高 |
| 测试 | 743KB TypeScript 代码零测试覆盖 | 🔴 高 |
| 版本 | Electron 28（落后 7 个大版本） | 🟡 中 |
| 构建 | main/esbuild + renderer/Vite + shared/tsc 三套方案 | 🟡 中 |
| CI/CD | 无持续集成流水线 | 🟡 中 |
| 代码 | serialServer 已废弃但未清理 | 🟢 低 |
| 功能 | 无 i18n、无 Jump Host | 🟢 低 |

## 优化策略

分三个阶段推进，按风险优先级排序：

---

### 第一阶段：止血（预计 1-2 周）

**目标**：消除安全风险和协议兼容性隐患，建立测试基线

| 编号 | 任务 | 优先级 |
|------|------|--------|
| 1.1 | MCP 迁移到官方 @modelcontextprotocol/sdk | P0 |
| 1.2 | MCP 安全加固（127.0.0.1 + 强制密码） | P0 |
| 1.3 | 核心模块单元测试（factory/connection/mcp tools） | P0 |

详细文档：[phase1-stabilize.md](./optimization/phase1-stabilize.md)

---

### 第二阶段：现代化（预计 2-4 周）

**目标**：统一工具链，升级依赖，清理技术债

| 编号 | 任务 | 优先级 |
|------|------|--------|
| 2.1 | Electron 渐进升级（28 → 35） | P1 |
| 2.2 | 构建工具统一到 Vite | P1 |
| 2.3 | 移除废弃代码（SerialServer） | P1 |

详细文档：[phase2-modernize.md](./optimization/phase2-modernize.md)

---

### 第三阶段：卓越（预计 4-8 周）

**目标**：工程化完善，测试覆盖达标，功能增强

| 编号 | 任务 | 优先级 |
|------|------|--------|
| 3.1 | CI/CD 流水线（GitHub Actions） | P1 |
| 3.2 | 测试体系完善（60%+ 覆盖） | P1 |
| 3.3 | 架构微调（services/ 目录重整） | P2 |
| 3.4 | 功能增强（Jump Host/i18n/独立 SFTP） | P2 |

详细文档：[phase3-excellence.md](./optimization/phase3-excellence.md)

---

## 执行约定

1. **每个 Phase 独立可交付**：不依赖后续阶段即可上线
2. **提交粒度**：一个任务一个 commit，便于 review 和回滚
3. **测试先行**：修改前先补测试，再重构
4. **TAG 标记**：每个阶段完成后打 tag（v0.2.1, v0.3.0, v0.4.0）
