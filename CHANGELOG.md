# 更新日志

所有重要的更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-03-29

### 新增
- 串口终端功能
  - 自动检测并列出可用串口设备
  - 支持自定义波特率、数据位、停止位、校验位
  - 支持 GBK/UTF-8/HEX 等多种编码格式
  - 实时数据收发和显示

- SSH 终端功能
  - 支持密码和私钥两种认证方式
  - 自动查找默认私钥（id_ed25519, id_rsa, id_ecdsa, id_dsa）
  - 支持同时连接多个 SSH 服务器
  - 保存 SSH 主机配置，支持快速重连

- 快捷按钮功能
  - 自定义命令快捷按钮
  - 支持多命令序列执行
  - 可设置命令间延迟
  - 按钮支持排序和管理

- 日志记录功能
  - 终端数据日志记录
  - 可自定义日志存储路径
  - 支持时间戳前缀

- MCP (Model Context Protocol) 支持
  - 让 AI 助手可以操作终端
  - 支持连接/断开/发送/读取等操作
  - 支持等待特定输出模式
  - 支持 CodeBuddy、Claude Desktop、Cursor 等平台

- 用户界面
  - 三选项卡视图（连接/快捷按钮/设置）
  - 状态栏显示连接状态
  - 树状图显示设备列表

### 技术细节
- TypeScript 开发
- 使用 serialport 进行串口通信
- 使用 ssh2 进行 SSH 连接
- 使用 iconv-lite 进行编码转换
- 使用 @modelcontextprotocol/sdk 支持 MCP 协议