# QSerial

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)](https://qserial.echomcp.cn)

> 🌐 [qserial.echomcp.cn](https://qserial.echomcp.cn) | ⬇️ [下载](https://qserial.echomcp.cn) | ⭐ [Star on GitHub](https://github.com/qiuchengcai/QSerial)

---

**QSerial 是全球首个内置 MCP (Model Context Protocol) 的终端工具。**  
支持串口、SSH、Telnet、本地终端，让 AI Agent 像人类工程师一样直接操作嵌入式设备。  
目前 Windows 版本可直接使用，macOS 和 Linux 版正在适配中。

<!-- TODO: 替换为实际 Demo GIF -->
<!-- ![QSerial Demo](https://qserial.echomcp.cn/demo.gif) -->

---

## 为什么选择 QSerial？

| 场景 | 传统方式 | QSerial 方式 |
|------|---------|-------------|
| 登录设备 | 手动输入用户名密码，每次重来 | 一句话："帮我登录 ESP32" |
| 刷固件 | 打开 TFTP 工具 → 手动传输 → 验证 | "把 firmware.bin 传过去，传完验证 MD5" |
| 监控日志 | 盯着终端屏幕，手动搜索关键词 | "监控串口，出现 panic 立刻通知我" |
| 多设备管理 | 开 N 个 Putty 窗口切来切去 | 一个窗口多标签，AI 帮你同时盯多个 |
| 文件传输 | 额外开 SFTP/FTP/TFTP 工具 | 全部内置，SFTP 双栏浏览器直接操作 |

## 快速开始

1. 从 [官网](https://qserial.echomcp.cn) 下载安装或直接运行便携版
2. 点击 **串口** / **SSH** / **Telnet** 创建连接
3. 如需 AI 操控：进入 MCP 设置，复制配置到你的 AI 客户端
4. 对 AI 说："帮我检查设备状态"

## 特性

- 🤖 **MCP AI 服务器**: 43 个 MCP 工具 + 7 个 Resources + 8 种 Notifications + Sampling，支持 `streamableHttp` / `SSE` 传输
- 🔌 **多协议支持**: 串口、SSH、Telnet、本地终端 (PTY)，支持 SSH 跳板机 (Jump Host)
- 🎬 **宏录制与回放**: 录制终端操作序列，一键回放，AI 可通过 MCP 调用
- 📑 **多标签管理**: 支持拖拽排序、中键关闭、右键菜单（关闭其他/左侧/右侧/全部）
- 📁 **SFTP 文件浏览器**: 双栏布局（远程+本地），上传/下载/删除/重命名/新建文件夹
- 📡 **连接共享**: TCP 共享任意活跃连接，支持密码认证，人类和 AI 可同时操作
- 📦 **TFTP 服务器**: 内置 TFTP 服务器，参数针对嵌入式设备优化
- 🌐 **FTP 服务器**: 内置 FTP 服务器，支持用户名密码认证
- 💾 **NFS 服务器**: 内置 NFS 服务器（Windows: WinNFSd / Linux: nfs-kernel-server）
- ⚡ **快捷按钮**: 自定义命令分组，多行命令逐条发送，行间延迟可配
- 🎨 **主题定制**: 9 套预设主题（Dark/Light/One Dark/Dracula/Monokai/Nord/Solarized/Paper/GitHub Dark），支持自定义
- 💾 **会话管理**: 保存连接配置，导入/导出 JSON，自动恢复
- 🌍 **国际化**: 中文 / English 双语切换

## MCP AI 服务器

QSerial 启动后自动在 **127.0.0.1:9800** 启动 MCP 服务器，AI Agent 可通过标准化协议远程操作设备。

### 配置方式

在 AI 客户端的 MCP 配置文件中添加：

```json
{
  "mcpServers": {
    "qserial": {
      "url": "http://127.0.0.1:9800/mcp",
      "transport": "streamableHttp"
    }
  }
}
```

支持 **Claude Code**、**CodeBuddy**、**Codex** 等兼容 MCP 协议的 AI 客户端。

### MCP 工具 (43个)

| 命名空间 | 工具 | 说明 |
|----------|------|------|
| conn.* | conn.create | 创建串口/SSH/Telnet/PTY 连接（支持跳板机） |
| | conn.disconnect | 断开并销毁连接 |
| | conn.reconnect | 重新连接已断开连接 |
| | conn.update | 更新窗口大小/波特率等参数 |
| | conn.list | 列出所有活跃连接 |
| | conn.share | TCP 共享 start/stop/list |
| conn.data.* | conn.data.write | 发送文本数据 |
| | conn.data.write_hex | 发送十六进制数据 |
| | conn.data.read | 读取输出缓冲区 |
| | conn.data.clear | 清空缓冲区 |
| | conn.data.expect | 等待匹配模式（子串/正则） |
| | conn.data.send | 发送命令+智能等待响应+去回显+AT解析 |
| | conn.data.history | 获取收发历史+字节统计 |
| conn.hw.* | conn.hw.dtr_rts | 控制 DTR/RTS 串口信号 |
| | conn.hw.break | 发送 break 信号 |
| conn.script.* | conn.script.run | 执行多步脚本 |
| | conn.script.login | 自动登录流程（Sampling 辅助） |
| conn.watch.* | conn.watch.start | 模式匹配监控+告警通知 |
| | conn.watch.stop | 停止监控 |
| | conn.watch.results | 获取持久化监控结果 |
| conn.record.* | conn.record.start | 开始录制终端输出 |
| | conn.record.stop | 停止录制并获取捕获数据 |
| | conn.record.list | 列出所有活跃录制 |
| | conn.record.replay | 回放已保存录制 |
| conn.analyze.* | conn.analyze.state | 分析连接状态 |
| | conn.analyze.probe | 探测设备类型 (ESP32/STM32/RPi 等8种) |
| | conn.analyze.report | 生成会话摘要报告 |
| conn.file.* | conn.file.send | XMODEM/YMODEM 文件发送 |
| sftp.* | sftp.connect | 打开 SFTP 会话 |
| | sftp.disconnect | 关闭 SFTP 会话 |
| | sftp.list | 列出远程目录内容 |
| | sftp.download | 下载远程文件 |
| | sftp.upload | 上传本地文件 |
| | sftp.mkdir | 创建远程目录 |
| | sftp.stat | 获取文件/目录元数据 |
| | sftp.rm | 删除文件或目录 |
| device.* | device.ports | 列出本机可用串口 |
| session.* | session.list | 列出已保存会话 |
| | session.save | 保存连接为会话 |
| | session.delete | 删除已保存会话 |
| app.* | app.screenshot | 捕获终端窗口截图 |
| | app.macro.list | 列出已录制宏 |
| | app.macro.run | 回放已录制宏 |

### MCP Resources

| URI | 说明 |
|-----|------|
| qserial://connections/active | 当前活跃连接列表 |
| qserial://serial/ports | 可用串口列表 |
| qserial://sessions/list | 已保存会话 |
| qserial://screenshot/latest | 最新截图 |
| qserial://notifications/pending | 待消费通知 |
| qserial://connections/{id} | 指定连接详情 |

### Sampling

服务端可在关键事件（设备 panic、脚本失败、未知提示符）时主动请求 AI 决策。

详细文档见 [AI 使用指南](docs/AI_USAGE.md)。

## 下载

| 平台 | 下载 |
|------|------|
| Windows (安装版) | [QSerial-1.0.0-x64-win.exe](https://qserial.echomcp.cn) |
| Windows (便携版) | [QSerial-1.0.0-x64-win-portable.zip](https://qserial.echomcp.cn) |
| macOS | 即将支持 |
| Linux (AppImage) | 即将支持 |

## 开发

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm build:shared
pnpm dev
```

### 构建

```bash
pnpm build             # 构建所有包
pnpm package:win       # 打包 Windows
pnpm package:linux     # 打包 Linux
pnpm package:mac       # 打包 macOS
```

### 测试

```bash
npx vitest run         # 运行 149 个单元测试
```

## 技术栈

| 层级 | 技术 |
|------|------|
| **框架** | Electron 28 + React 18 |
| **语言** | TypeScript 5 |
| **终端** | xterm.js 5.x |
| **状态管理** | Zustand (persist) |
| **样式** | Tailwind CSS |
| **构建** | Vite 5 + electron-builder |
| **原生模块** | node-pty, serialport, ssh2, ftp-srv |
| **MCP 协议** | JSON-RPC 2.0, streamableHttp + SSE, 协议版本 2025-03-26 |

## 文档

| 文档 | 说明 |
|------|------|
| [AI 使用指南](docs/AI_USAGE.md) | MCP 工具参考与操作流程 |
| [开发路线图](docs/ROADMAP.md) | v1.0.0 发展路线图 |
| [开发指南](docs/DEVELOPMENT.md) | 项目结构、环境配置、构建命令 |
| [UI 设计规范](docs/QSerial-Windows-UI-Design-Spec.md) | Windows 桌面应用 UI 设计说明书 |
| [归档](docs/archive/) | 历史变更日志、设计方案 |


## ☕ 支持这个项目

如果 QSerial 帮到了你，欢迎请作者喝杯咖啡 ☕ 你的支持是项目持续迭代的动力。

<p align="center">
  <img src="resources/wechat-pay.jpg" width="220" alt="微信赞助" />
</p>

## 🏢 商业支持 / 定制开发

QSerial 提供专业的商业服务，帮助企业更好地落地 AI + 设备协同：

- **企业私有化部署**：内网部署、定制化配置、技术培训
- **定制功能开发**：协议适配（Modbus / OPC UA / 私有协议）、批量设备管理、操作审计与合规
- **团队培训与技术咨询**：MCP 集成、嵌入式 AI 化改造、DevOps 工具链建设

企业版功能规划中（RBAC 权限、LDAP/SSO、集中会话管理、SLA 支持），如有需求可提前沟通。

📧 联系邮箱：[qiucc_kust@163.com](mailto:qiucc_kust@163.com)

---
## License

[MIT](LICENSE)
