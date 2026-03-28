#!/usr/bin/env node

/**
 * QSerial MCP Server 启动脚本
 * 用于启动 MCP Server，供 AI 助手调用
 */

const path = require('path');

// 设置 ES 模块支持
require = require('esm')(module);

// 启动 MCP Server
require(path.join(__dirname, '../out/mcp/server.js'));