# AGENTS.md - 架构模式

本文件提供此仓库的架构指南。

## 系统架构

### 组件层次
```
extension.ts (入口点)
    ├── TerminalManager (无依赖)
    │   └── TerminalLogger
    ├── SerialManager (依赖: TerminalManager)
    ├── SSHManager (依赖: TerminalManager)
    ├── ButtonManager (依赖: SerialManager, SSHManager)
    ├── UnifiedTreeProvider (依赖: SerialManager, SSHManager, ButtonManager)
    └── StatusBarManager (依赖: SerialManager, SSHManager)
```

### 数据流
```
用户输入 → TerminalManager → SerialManager/SSHManager → 设备/服务器
设备输出 → SerialManager/SSHManager → TerminalManager → VS Code Terminal
```

## 关键设计决策

### 单一串口连接
- 同一时间只能有一个串口连接（存储在 `SerialManager.connection` 中）
- 新连接会自动断开现有连接

### 多 SSH 连接
- SSH 支持通过 `Map<string, SSHConnection>` 实现多个同时连接
- 每个连接有唯一的 `hostId` 用于标识

### 终端隔离
- 串口使用单一终端（`serialTerminal`）
- SSH 使用 `Map<string, SSHTerminal>` 管理多个终端
- 终端关闭通过 `onSSHTerminalClosed` 回调触发连接清理

### 编码处理
- 串口数据使用 `iconv-lite` 进行 GBK/UTF-8/Hex 转换
- 流式数据可能分割多字节字符 - 目前未实现缓冲

### 状态存储位置
- VS Code 设置：串口配置、SSH 已保存主机
- SecretStorage：SSH 密码（不在设置中）
- 全局状态：自定义按钮配置

## 扩展点
- 在 `extension.ts` 命令注册数组中添加新命令
- 在 `UnifiedTreeProvider` 中添加新树项
- 在 `package.json` 的 contributes.configuration 中添加新设置