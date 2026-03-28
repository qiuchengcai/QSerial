# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## 常用命令

### 编译与构建
```bash
npm run compile      # TypeScript 编译
npm run watch        # 监听模式编译
npm run package      # 打包 VSIX (vsce package)
```

### 代码质量
```bash
npm run lint         # ESLint 检查 src 目录
npm run pretest      # 编译 + lint
npm run test         # 运行测试（需要 VS Code 环境）
```

### Git 提交规范
- 提交信息必须使用中文
- 格式: `<类型>: <中文描述>` (feat/fix/docs/style/refactor/test/chore)

## 项目架构

### 核心模块

**入口 (`extension.ts`)**
- 初始化所有 Manager 实例
- 注册 35+ VS Code 命令
- 管理 TreeView 和状态栏

**连接管理**
- `SerialManager`: 串口连接，支持 GBK/UTF-8 编码转换
- `SSHManager`: SSH 多连接管理，密码存储在 SecretStorage

**终端系统**
- `TerminalManager`: 创建 VS Code Terminal，处理数据写入
- `TerminalLogger`: 日志记录到文件系统

**UI 层**
- `UnifiedTreeProvider`: 三选项卡视图（连接/按钮/设置）
- `StatusBarManager`: 显示连接状态，点击切换连接

**快捷按钮**
- `ButtonManager`: 自定义按钮，支持多命令序列执行
- 按钮配置存储在 `qserial.buttons.customButtons`

### 数据流

```
用户输入 → TerminalManager → SerialManager/SSHManager → 设备/服务器
设备输出 → SerialManager/SSHManager → TerminalManager → VS Code Terminal
```

### 配置存储

- VS Code settings: `qserial.serial.*`, `qserial.ssh.savedHosts`
- SecretStorage: SSH 密码
- 全局状态: 自定义按钮配置

### 编码处理

串口数据使用 `iconv-lite` 转换，默认 GBK。流式数据可能分割多字节字符，需注意缓冲处理。