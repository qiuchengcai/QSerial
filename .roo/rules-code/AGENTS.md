# AGENTS.md - 代码模式

本文件提供此仓库的代码编写指南。

## 关键实现细节

### 串口编码
- 使用 `iconv-lite` 进行编码转换，默认为 GBK
- 流式数据可能分割多字节字符，需注意缓冲处理
- 参见 [`SerialManager`](src/serial/serialManager.ts:1) 中的编码逻辑

### SSH 密码存储
- 密码存储在 VS Code SecretStorage 中，不在配置中明文存储
- 切勿在设置中明文存储密码

### 自定义按钮
- 按钮配置存储在 `qserial.buttons.customButtons` 全局状态中
- 按钮支持带延迟的多命令序列执行

### 终端关闭回调
- [`TerminalManager.onSSHTerminalClosed`](src/terminal/terminalManager.ts:22) 必须设置以处理 SSH 终端清理
- 用于在用户关闭终端时断开 SSH 连接

## 导入模式
```typescript
// 代码库中使用的标准模式
import * as vscode from 'vscode';
import { SomeClass } from './relative/path';
```

## 错误处理
- 使用 [`Logger`](src/utils/logger.ts:3) 类进行所有日志记录（info、warn、error、debug）
- Logger 输出到 VS Code 中的 'QSerial' 输出通道