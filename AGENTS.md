# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Build/Test Commands
```bash
npm run compile      # TypeScript 编译
npm run watch        # 监听模式编译
npm run package      # 打包 VSIX (vsce package)
npm run lint         # ESLint 检查 src 目录
npm run test         # 运行测试（需要 VS Code 环境）
```

## Git Commit Convention
- 提交信息**必须使用中文**
- 格式: `<类型>: <中文描述>` (feat/fix/docs/style/refactor/test/chore)
- 示例: `feat: 添加新功能`, `fix: 修复某个问题`

## Architecture Notes

### Data Flow
```
用户输入 → TerminalManager → SerialManager/SSHManager → 设备/服务器
设备输出 → SerialManager/SSHManager → TerminalManager → VS Code Terminal
```

### Critical Implementation Details
- **串口编码**: 使用 `iconv-lite` 转换，默认 GBK。流式数据可能分割多字节字符，需注意缓冲处理
- **SSH 密码存储**: 使用 VS Code SecretStorage，不在配置中明文存储
- **自定义按钮配置**: 存储在 `qserial.buttons.customButtons` 全局状态
- **终端关闭回调**: `TerminalManager.onSSHTerminalClosed` 用于处理 SSH 终端关闭时的连接清理

### Manager Dependencies
```
extension.ts
    ├── TerminalManager (无依赖)
    ├── SerialManager(terminalManager)
    ├── SSHManager(terminalManager)
    ├── ButtonManager(context, serialManager, sshManager)
    ├── UnifiedTreeProvider(serialManager, sshManager, buttonManager)
    └── StatusBarManager(serialManager, sshManager)