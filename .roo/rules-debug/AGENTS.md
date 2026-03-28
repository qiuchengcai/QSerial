# AGENTS.md - 调试模式

本文件提供此仓库的调试指南。

## 调试工具

### 日志输出
- 所有日志输出到 VS Code 的 'QSerial' 输出通道
- 使用 `视图: 显示输出` 然后选择 'QSerial' 通道
- Logger 类位于 [`src/utils/logger.ts`](src/utils/logger.ts:1)

### 扩展宿主日志
- 扩展运行在 VS Code 扩展宿主中
- 使用 `开发者: 显示运行中的扩展` 查看扩展状态
- 查看 `开发者: 打开扩展宿主` 获取扩展宿主日志

## 常见问题

### 串口连接失败
- Linux/Mac 上检查端口权限（用户需要 dialout/tty 组权限）
- 验证波特率与设备设置匹配
- 在 `qserial.serial.encoding` 中检查编码设置（默认 GBK）

### SSH 连接问题
- 密码存储在 SecretStorage 中 - 使用 `qserial.ssh.clearPasswords` 重置
- 在设置的 `qserial.ssh.savedHosts` 中查看已保存的配置
- 认证错误会记录详细的中文错误信息

### 终端不显示
- 终端通过 [`TerminalManager`](src/terminal/terminalManager.ts:1) 中的 Pseudoterminal 创建
- 检查终端是否意外被释放
- 验证 `onSSHTerminalClosed` 回调是否正确设置

## 关键调试点
- [`SerialManager.connect()`](src/serial/serialManager.ts:50) - 串口连接入口
- [`SSHManager.connect()`](src/ssh/sshManager.ts:25) - SSH 连接入口
- [`TerminalManager.createSerialTerminal()`](src/terminal/terminalManager.ts:31) - 终端创建