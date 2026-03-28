# AGENTS.md - 询问模式

本文件提供此仓库的文档上下文。

## 项目概述
QSerial 是一个 VS Code 扩展，用于串口和 SSH 终端访问，支持自定义快捷按钮。

## 关键文档位置

### 配置
- 串口设置：VS Code 设置中的 `qserial.serial.*`
- SSH 设置：VS Code 设置中的 `qserial.ssh.savedHosts`
- 自定义按钮：全局状态中的 `qserial.buttons.customButtons`

### 架构
- 入口点：[`src/extension.ts`](src/extension.ts:1) - 注册 35+ 个 VS Code 命令
- 串口处理：[`src/serial/serialManager.ts`](src/serial/serialManager.ts:1)
- SSH 处理：[`src/ssh/sshManager.ts`](src/ssh/sshManager.ts:1)
- 终端管理：[`src/terminal/terminalManager.ts`](src/terminal/terminalManager.ts:1)
- UI 树视图：[`src/tree/unifiedTreeProvider.ts`](src/tree/unifiedTreeProvider.ts:1)

## UI 结构
- 活动栏面板包含 3 个选项卡：连接、按钮、设置
- 状态栏显示连接状态（点击切换）
- 自定义按钮支持带延迟的多命令序列

## 数据流
```
用户输入 → TerminalManager → SerialManager/SSHManager → 设备/服务器
设备输出 → SerialManager/SSHManager → TerminalManager → VS Code Terminal